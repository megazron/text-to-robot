// The engine API's own endpoints (/api/engine/*), answered in the engine worker beside the site's /api/* routes.
// Everything here is a thin layer over the generator packages: the catalog with mounting points, edits on a spec,
// the checks and engineering numbers of any spec (designed, edited or built from nothing), URDF and xacro, and meshes.
import type { RobotSpecification, Geometry, Vec3 } from "@ttr/robot-schema";
import { validateSpec } from "@ttr/robot-schema";
import { finalizeSpec } from "@ttr/robot-generator";
import { generateUrdf, generateXacro } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import { CATALOG, part, rating, electrical } from "@ttr/parts";
import { buildPart, toStlBinary, meshGeometry } from "@ttr/mesh";
import { buildBom } from "@ttr/components";
import { schematic, breadboard, electricalReport, layoutProblems, wiringSvg, wiringMarkdown, type WiringRecord } from "@ttr/design";
import { componentGeometry, PRINT_DENSITY, MATERIALS, withSolids, interferences, worstTorques, comWorld, totalMass, evaluate, axisInertias, descendants, type DesignRecord } from "@ttr/design";
import { partFiles } from "@ttr/kernel/ready";
import { applyEdits, emptyRobot, kindOf, rootLink, worldFrames, mul, inv, poseMat, rotate, unit, partsBaseline, type EditOp, type PartProvider, type PrintedParams, type StudioMeta } from "./edit.ts";
import { partMounts, printedMounts, printedProgram, worldMounts } from "./mounts.ts";
import { clearanceAtHome, autoWireCached } from "./incremental.ts";
import { stability, type Stability } from "./stability.ts";

export const ENGINE_API_VERSION = "1.0.0";
const MATERIAL: Record<string, string> = { actuator: "actuator", wheel: "rubber", battery: "battery", compute: "electronics", sensor: "electronics", motor_driver: "electronics", misc: "electronics", bearing: "metal", horn: "metal" };
const BED_MM: Vec3 = [250, 210, 220];

const colorOf = (material: string) => MATERIALS.find((m) => m.name === material)?.color;
export const parts: PartProvider = {
  component(key) {
    const c = part(key);
    const material = MATERIAL[c.category] ?? "metal";
    return { geometry: componentGeometry(key) as Geometry, mass: c.mass_g / 1000, material, role: c.category, color: colorOf(material) };
  },
  printed(params, name) {
    const json = JSON.stringify(printedProgram(params, name));
    const g = meshGeometry("cad", `${name}.stl`, { program: json }) as Geometry & { volume: number };
    return { geometry: g, mass: Math.max(g.volume * PRINT_DENSITY, 0.002), material: "printed", role: "link", color: colorOf("printed") };
  },
};

/** The catalog an editor shows: every purchasable part with its mounting points, ratings and electrical summary. */
export function catalog() {
  return Object.values(CATALOG).filter((c) => c.category !== "fastener" && c.category !== "insert").map((c) => {
    let r: ReturnType<typeof rating> | undefined; try { if (c.category === "actuator") r = rating(c.key); } catch { /* no rating */ }
    const e = electrical(c.key);
    return { key: c.key, name: c.name, category: c.category, mass_g: c.mass_g, price_usd: c.price_usd, supplier_url: c.supplier_url, datasheet_url: c.datasheet_url,
      envelope_mm: c.envelope_mm, bbox_mm: c.bbox_mm ?? null, mounts: partMounts(c.key),
      ...(r ? { rating: { rated_nm: r.rated_nm, peak_nm: r.peak_nm, speed_rad_s: r.speed_rad_s, voltage_v: r.voltage_v, range_deg: Number(c.specs.range_deg) || null, continuous: !/hobby_|feetech|dxl_/.test(c.key) || Number(c.specs.range_deg) >= 360 } } : {}),
      ...(e ? { electrical: { role: e.role, voltage_v: e.voltage_v.v, current_a: e.current_a.v, ports: e.ports.map((p) => p.name) } } : {}) };
  });
}
export const PRINTED_SHAPES: { shape: PrintedParams["shape"]; label: string; defaults: PrintedParams }[] = [
  { shape: "plate", label: "Plate", defaults: { shape: "plate", size_mm: [120, 80, 4], fillet_mm: 0.8, hole_mm: 3.2, holes: 4 } },
  { shape: "bracket", label: "L bracket", defaults: { shape: "bracket", size_mm: [40, 30, 40], wall_mm: 4, fillet_mm: 0.8, hole_mm: 3.2, holes: 2 } },
  { shape: "housing", label: "Housing", defaults: { shape: "housing", size_mm: [90, 70, 35], wall_mm: 2.4, fillet_mm: 0.8, hole_mm: 3.2, holes: 4 } },
  { shape: "beam", label: "Arm link", defaults: { shape: "beam", size_mm: [100, 24, 6], fillet_mm: 0.8, hole_mm: 3.2 } },
  { shape: "disc", label: "Turntable disc", defaults: { shape: "disc", size_mm: [60, 60, 5], fillet_mm: 0.6 } },
  { shape: "standoff_plate", label: "Board plate", defaults: { shape: "standoff_plate", size_mm: [80, 60, 8], wall_mm: 3, fillet_mm: 0.6 } },
  { shape: "servo_bracket", label: "Servo bracket", defaults: { shape: "servo_bracket", size_mm: [0, 0, 0], wall_mm: 3, fillet_mm: 0.6, key: "hobby_mg996r" } },
];

const meta = (spec: RobotSpecification) => spec.metadata as RobotSpecification["metadata"] & { design?: DesignRecord; studio?: StudioMeta };

/** The actuator driving each moving joint: the editor's record, the designer's, or an actuator body sitting on the axis. */
function actuators(spec: RobotSpecification): Record<string, string> {
  const m = meta(spec), out: Record<string, string> = {}, keyOf = (link: string) => { const l = spec.links.find((x) => x.name === link); return l ? kindOf(l).key : undefined; };
  for (const r of m.design?.joints ?? []) if (CATALOG[r.actuator]) out[r.joint] = r.actuator;
  for (const [j, link] of Object.entries(m.studio?.actuators ?? {})) { const k = keyOf(link); if (k && CATALOG[k]?.category === "actuator") out[j] = k; }
  // an actuator whose output sits on the joint's axis (a motor driving a wheel mounted beside it)
  const mounts = worldMounts(spec).filter((m) => m.kind === "output" && CATALOG[keyOf(m.link) ?? ""]?.category === "actuator"), W = worldFrames(spec);
  for (const j of spec.joints) {
    if (j.type === "fixed" || j.passive || out[j.name]) continue;
    for (const link of [j.parent, j.child]) { const k = keyOf(link); if (k && CATALOG[k]?.category === "actuator") { out[j.name] = k; break; } }
    if (out[j.name]) continue;
    const F = mul(W.get(j.parent)!, poseMat(j.origin)), p = [F[3], F[7], F[11]], a = unit(rotate(F, j.axis));
    for (const m of mounts) {
      const d = [0, 1, 2].map((i) => m.pos[i] - p[i]), along = d[0] * a[0] + d[1] * a[1] + d[2] * a[2], off = Math.hypot(...d.map((x, i) => x - along * a[i]));
      if (off < 0.006 && Math.abs(m.axis[0] * a[0] + m.axis[1] * a[1] + m.axis[2] * a[2]) > 0.98 && Math.abs(along) < 0.06) { out[j.name] = keyOf(m.link)!; break; }
    }
  }
  return out;
}

export interface Check { name: string; pass: boolean; detail: string; }
export interface JointReport { joint: string; actuator: string | null; required_nm: number; rated_nm?: number; peak_nm?: number; margin: number | null; speed_rad_s?: number; ok?: boolean; note: string; }
export interface PrintedReport { name: string; bbox_mm: Vec3; fits_bed: boolean; watertight: boolean; mass_kg: number; volume_cm3: number; }
export interface CheckReport {
  robot: RobotSpecification; urdf: string; valid: boolean; checks: Check[];
  engineering: { mass_kg: number; com_m: Vec3; cost_usd: number; bom_lines: number; joints: JointReport[]; rails: NonNullable<DesignRecord["wiring"]>["rails"]; wiring_unconnected: string[]; printed: PrintedReport[]; stability: Stability | null; links: number; dof: number; timing: Record<string, number> } | null;
}
/** Checks and engineering numbers of a spec. Heavy parts (solids, wiring) are skipped with `quick`. */
export function checkRobot(input: RobotSpecification, opts: { quick?: boolean; interference?: boolean; wiring?: boolean } = {}): CheckReport {
  const spec = structuredClone(input), checks: Check[] = [], started = Date.now(), timing: Record<string, number> = {};
  if (!spec.links.length) return { robot: spec, checks: [{ name: "robot", pass: false, detail: "the robot has no parts yet" }], engineering: null, urdf: "", valid: false };
  finalizeSpec(spec);
  const v = validateSpec(spec);
  checks.push({ name: "spec", pass: v.valid, detail: v.valid ? "the specification is valid" : v.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ") });
  let urdf = "";
  try { urdf = generateUrdf(spec); const u = validateUrdf(urdf); checks.push({ name: "urdf", pass: u.valid, detail: u.valid ? "the URDF parses and forms one tree" : u.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ") }); }
  catch (e) { checks.push({ name: "urdf", pass: false, detail: (e as Error).message }); }

  // engineering
  const mass = totalMass(spec), com = comWorld(spec);
  const act = actuators(spec), moving = spec.joints.filter((j) => j.type === "revolute" || j.type === "prismatic");
  const poses: Record<string, number>[] = [{}];
  for (const t of [-1, -0.5, 0.5, 1]) poses.push(Object.fromEntries(moving.map((j) => [j.name, Math.max(j.limit?.lower ?? -Math.PI, Math.min(j.limit?.upper ?? Math.PI, j.type === "prismatic" ? 0 : t * Math.PI / 2))])));
  const need = worstTorques(spec, poses), inertia = axisInertias(spec, {});
  // tipping, at the zero pose and the same poses (a robot built on a ground plane at z = 0 stands on its lowest parts)
  const stab = stability(spec, poses);
  if (stab) {
    const where = `centre of mass ${Math.abs(stab.margin_mm).toFixed(0)} mm ${stab.margin_mm >= 0 ? "inside" : "outside"} the footprint`;
    if (stab.free_standing) checks.push({ name: "stability", pass: stab.margin_mm > 0 && stab.tip_deg >= 5, detail: stab.margin_mm > 0 ? `${where}: it tips at a ${stab.tip_deg} deg slope (5 deg needed)` : `${where}: it falls over${Object.keys(stab.worst_pose).length ? " when its joints move" : ""}` });
    else if (/mark43|exo|suit/.test(meta(spec).design?.family ?? "")) checks.push({ name: "stability", pass: true, detail: "worn: the wearer balances it" });
    else checks.push({ name: "stability", pass: true, detail: `a fixed machine: bolt its base down. Standing free, ${where}${stab.margin_mm > 0 ? `, tipping at ${stab.tip_deg} deg` : ""}` });
  }
  const joints = spec.joints.filter((j) => j.type !== "fixed" && !j.passive && !j.mimic).map((j): JointReport => {
    const key = act[j.name];
    if (!key) return { joint: j.name, actuator: null, required_nm: +(need[j.name] ?? 0).toFixed(4), margin: null, note: "no actuator drives this joint" };
    if (j.type === "continuous") { const r = rating(key); return { joint: j.name, actuator: key, required_nm: 0, rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: null, speed_rad_s: r.speed_rad_s, note: "turns freely (wheel or spinner): no holding load" }; }
    const c = evaluate(key, need[j.name] ?? 0, inertia[j.name] ?? 0);
    return { joint: j.name, actuator: key, required_nm: +(c.required_nm).toFixed(4), rated_nm: c.rating.rated_nm, peak_nm: c.rating.peak_nm, margin: +c.margin.toFixed(2), speed_rad_s: +c.loaded_speed_rad_s.toFixed(2), ok: c.ok && c.continuous_ok, note: "" };
  });
  for (const j of joints) {
    if (j.margin == null) { if (!j.actuator) checks.push({ name: `torque:${j.joint}`, pass: false, detail: "no motor or servo drives this joint: attach one to its axis" }); continue; }
    checks.push({ name: `torque:${j.joint}`, pass: !!j.ok, detail: `${j.required_nm} N·m needed (worst pose, x1.3 for acceleration) vs ${j.rated_nm} N·m rated, ${j.peak_nm} N·m peak on ${j.actuator}: ${j.margin}x margin` });
  }
  // printed parts: on the bed, one closed solid
  const printed: PrintedReport[] = [];
  for (const l of spec.links) {
    const g = l.geometry; if (g.type !== "mesh" || (g.part !== "cad" && g.part !== "printed")) continue;
    if (opts.quick) continue;
    try {
      const size = [0, 1, 2].map((k) => (g.bbox.max[k] - g.bbox.min[k]) * 1000) as Vec3;
      const fits = [[0, 1, 2], [1, 0, 2], [0, 2, 1], [2, 0, 1], [1, 2, 0], [2, 1, 0]].some((o) => o.every((k, i) => size[k] <= BED_MM[i]));
      // the designer's own check of the same program, else the CAD kernel's (slow: it builds the exact solid)
      const known = meta(spec).design?.printed?.find((p) => p.link === l.name && JSON.stringify(p.program) === String(g.params?.program));
      const watertight = known ? known.check.watertight : g.part === "cad" ? (() => { const f = partFiles(String(g.params?.program)); return f.watertight && f.bodies === 1; })() : true;
      printed.push({ name: l.name, bbox_mm: size.map((x) => +x.toFixed(1)) as Vec3, fits_bed: fits, watertight, mass_kg: +(g.volume * PRINT_DENSITY).toFixed(4), volume_cm3: +(g.volume * 1e6).toFixed(2) });
      checks.push({ name: `print:${l.name}`, pass: fits && watertight, detail: `${size.map((x) => x.toFixed(0)).join(" x ")} mm${fits ? "" : ", does not fit a 250 x 210 x 220 mm bed"}${watertight ? "" : ", not one closed solid"}` });
    } catch (e) { checks.push({ name: `print:${l.name}`, pass: false, detail: (e as Error).message }); }
  }
  // A designed robot not yet edited is as its designer made it: the designer placed, checked and wired every part.
  const design = meta(input).design, studio = meta(input).studio, asDesigned = !!design && !studio?.edited, baseline = studio?.baseline;
  // nothing passes through anything (parts joined directly touch by design)
  if (!opts.quick && opts.interference !== false && asDesigned) {
    const own = design!.checks.find((c) => c.name === "clearance:home");
    checks.push(own ?? { name: "clearance:home", pass: true, detail: "as designed: the designer placed every part" });
  } else if (!opts.quick && opts.interference !== false) {
    try {
      const skip = new Set(spec.joints.flatMap((j) => [`${j.parent}|${j.child}`]));
      for (const j of spec.joints) for (const k of spec.joints) if (j.parent === k.parent && j !== k) skip.add(`${j.child}|${k.child}`);
      const bonded = meta(spec).design?.bonded ?? []; for (const [a, b] of bonded) skip.add(`${a}|${b}`);
      const t0 = Date.now(), run = clearanceAtHome(spec, skip, 2, baseline), hits = run.hits;
      timing.clearance_ms = Date.now() - t0; timing.pairs_checked = run.pairs; timing.pairs_intersected = run.intersected; timing.pairs_reused = run.reused; timing.pairs_as_designed = run.as_designed;
      const designed = run.as_designed ? ` (${run.as_designed} pairs untouched since the designer placed them)` : "";
      checks.push({ name: "clearance:home", pass: !hits.length, detail: hits.length ? `intersecting: ${hits.slice(0, 8).map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`).join(", ")}${designed}` : `no two parts intersect${designed}` });
    } catch (e) { checks.push({ name: "clearance:home", pass: false, detail: `not checked: ${(e as Error).message}` }); }
  }
  // wiring and power budget
  let wiring: ReturnType<typeof autoWireCached> | null = null;
  if (!opts.quick && opts.wiring !== false) {
    const t0 = Date.now();
    // the designer's harness stays while no electrical part was added, removed or moved
    const now = baseline ? partsBaseline(spec) : null, isElectrical = (l: { geometry: unknown }) => { const k = kindOf(l as never).key; return !!k && !!electrical(k); };
    // (moved together, as when the whole body moves, its cables are the same length: compare them relative to one another)
    const elec = spec.links.filter(isElectrical).map((l) => l.name), M = (b: [string, ...number[]]) => [...(b.slice(1) as number[]), 0, 0, 0, 1];
    const rel = (src: Record<string, [string, ...number[]]>, a: string, b: string) => mul(inv(M(src[a])), M(src[b])).slice(0, 12).map((x) => Math.round(x * 1e5)).join(",");
    const electricalSame = !!design?.wiring && (asDesigned || (!!baseline && !!now && elec.every((n) => baseline[n] && baseline[n][0] === now[n][0] && rel(baseline, elec[0], n) === rel(now, elec[0], n))
      && Object.keys(baseline).every((n) => spec.links.some((l) => l.name === n) || !design.wiring!.instances.some((i) => i.link === n))));
    if (electricalSame) wiring = { record: design!.wiring!, checks: design!.checks.filter((c) => c.name.startsWith("wiring:")), unwired: design!.wiring!.unconnected ?? [] };
    else wiring = autoWireCached(spec);
    timing.wiring_ms = Date.now() - t0;
    for (const c of wiring.checks) checks.push(c);
  }
  let cost = 0, bomLines = 0;
  try { const bom = buildBom(refreshDesign(spec, checks, joints, printed, wiring?.record ?? null)); cost = bom.total; bomLines = bom.lines.length; } catch { /* template robot without parts */ }
  const robot: RobotSpecification = meta(input).studio?.edited ? refreshDesign(spec, checks, joints, printed, wiring?.record ?? null) : input;
  return {
    robot, urdf, valid: checks.every((c) => c.pass), checks,
    engineering: {
      mass_kg: +mass.toFixed(3), com_m: com.map((x) => +x.toFixed(4)) as Vec3, cost_usd: +cost.toFixed(2), bom_lines: bomLines,
      joints, rails: wiring?.record?.rails ?? [], wiring_unconnected: wiring?.unwired ?? [], printed, stability: stab,
      links: spec.links.length, dof: spec.joints.filter((j) => j.type !== "fixed" && !j.passive).length, timing: { ...timing, total_ms: Date.now() - started },
    },
  };
}

/** An edited robot's design record, rebuilt from what is in it now (bought parts, printed parts, sizing, checks, harness). */
function refreshDesign(spec: RobotSpecification, checks: Check[], joints: JointReport[], printed: PrintedReport[], wiring: DesignRecord["wiring"] | null): RobotSpecification {
  const out = structuredClone(spec), m = meta(out), old = m.design;
  const linkKeys = new Map<string, string[]>();
  for (const l of out.links) { const k = kindOf(l).key; if (k && CATALOG[k]) linkKeys.set(k, [...(linkKeys.get(k) ?? []), l.name]); }
  const oldUses = new Map((old?.purchased ?? []).map((p) => [p.key, p.uses]));
  // accessories with no body of their own (caster balls, fasteners) stay as the designer bought them
  const bodies = new Set(m.studio?.bodies ?? []);
  const accessory = (old?.purchased ?? []).filter((p) => !linkKeys.has(p.key) && !bodies.has(p.key));
  const purchased = [...[...linkKeys].map(([key, names]) => ({ key, qty: names.length, uses: oldUses.get(key) ?? ["added in the editor"] })), ...accessory].sort((a, b) => a.key.localeCompare(b.key));
  const printedRecs = printed.map((p) => {
    const l = out.links.find((x) => x.name === p.name)!, g = l.geometry as { params?: { program?: string } };
    let program: unknown = { name: p.name, ops: [] }; try { program = JSON.parse(String(g.params?.program)); } catch { /* armour */ }
    return { name: p.name, link: p.name, program, check: { volume_cm3: p.volume_cm3, bbox_mm: p.bbox_mm, fits_bed: p.fits_bed, watertight: p.watertight, min_feature_ok: true, genus: 0 }, mass_kg: p.mass_kg };
  });
  m.design = {
    family: old?.family ?? "built", summary: `${out.robot_name.replace(/_/g, " ")}: ${out.links.length} parts, ${out.joints.filter((j) => j.type !== "fixed" && !j.passive).length} moving joints${old ? `, edited from the ${old.family} design` : ", built by hand"}`,
    purchased, printed: (printed.length ? printedRecs : old?.printed.filter((p) => out.links.some((l) => l.name === p.link)) ?? []) as DesignRecord["printed"],
    joints: joints.filter((j) => j.actuator && j.margin != null).map((j) => ({ joint: j.joint, actuator: j.actuator!, required_nm: j.required_nm, rated_nm: j.rated_nm ?? 0, peak_nm: j.peak_nm ?? 0, margin: j.margin!, speed_rad_s: j.speed_rad_s ?? 0, note: j.note })),
    checks, performance: { ...(old?.performance ?? {}), mass_kg: +totalMass(out).toFixed(3) }, assumptions: [...(old?.assumptions ?? []), ...(old ? [] : [])].filter((a, i, all) => all.indexOf(a) === i),
    fasteners: old?.fasteners ?? {}, ...(wiring ? { wiring } : {}), ...(old?.home ? { home: Object.fromEntries(Object.entries(old.home).filter(([k]) => out.joints.some((j) => j.name === k))) } : {}),
  } as DesignRecord;
  delete (m.design.performance as Record<string, unknown>).cost_usd;
  return out;
}

/** Collisions over a joint's travel: the samples (joint value) where parts it moves hit others, with the pairs. */
export function sweep(spec: RobotSpecification, joint: string, samples = 24) {
  const j = spec.joints.find((x) => x.name === joint); if (!j) throw new Error(`no joint '${joint}'`);
  const lo = j.type === "continuous" ? -Math.PI : j.limit?.lower ?? -Math.PI, hi = j.type === "continuous" ? Math.PI : j.limit?.upper ?? Math.PI;
  const movingSet = descendants(spec, j.child), skip = new Set(spec.joints.map((x) => `${x.parent}|${x.child}`));
  const n = Math.max(2, Math.min(64, samples));
  return withSolids(spec, (m) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n).map((q) => ({ q: +q.toFixed(4), hits: interferences(m, { [joint]: q }, movingSet, 2, skip) })));
}

/** The robot's wiring record: the designer's, or for a robot built or edited by hand, the automatic wiring. */
function wiringOf(input: RobotSpecification): WiringRecord {
  const own = meta(input).design?.wiring as WiringRecord | undefined;
  if (own && !meta(input).studio?.edited) return own;
  const spec = finalizeSpec(structuredClone(input)), rec = autoWire(spec).record as WiringRecord | null;
  if (!rec || !rec.cables?.length) throw new Error("this robot has no wiring to draw: add a battery or supply, a controller and something to power");
  return rec;
}
/** Schematic (SVG, PDF, the netlist it draws, layout check) and the electrical calculations. */
export function schematicOf(robot: RobotSpecification) {
  const w = wiringOf(robot), r = schematic(w, robot.robot_name);
  let pdf = ""; for (let i = 0; i < r.pdf.length; i += 0x8000) pdf += String.fromCharCode(...r.pdf.subarray(i, i + 0x8000));
  return { svg: r.svg, pdf: { b64: btoa(pdf) }, size: r.size, netlist: r.netlist, layout: layoutProblems(r.doc), electrical: electricalReport(w, r.model) };
}
/** Picture wiring diagram (SVG) with its layout check. */
export function breadboardOf(robot: RobotSpecification) {
  const r = breadboard(wiringOf(robot), robot.robot_name);
  return { svg: r.svg, layout: layoutProblems(r.doc), unrouted: r.unrouted };
}

const json = (code: number, body: unknown) => new Response(JSON.stringify(body), { status: code, headers: { "Content-Type": "application/json" } });
/** /api/engine/* requests. */
export async function engineApi(method: string, path: string, body: any): Promise<Response> {
  const p = path.slice("/api/engine/".length);
  if (method === "GET" && p === "version") return json(200, { api: ENGINE_API_VERSION });
  if (method === "GET" && p === "catalog") return json(200, { parts: catalog(), printed: PRINTED_SHAPES.map((s) => ({ ...s, mounts: s.shape === "servo_bracket" ? printedMounts(s.defaults) : printedMounts(s.defaults) })) });
  if (method === "POST" && p === "empty") return json(200, { robot: emptyRobot(body.name) });
  if (method === "POST" && p === "edit") {
    const robot = applyEdits(body.robot as RobotSpecification, (body.ops ?? []) as EditOp[], parts);
    if ((body.ops ?? []).length && robot.links.length) finalizeFresh(robot);
    return json(200, { robot, mounts: worldMounts(robot) });
  }
  if (method === "POST" && p === "mounts") return json(200, { mounts: worldMounts(body.robot) });
  if (method === "POST" && p === "printed-mounts") return json(200, { mounts: printedMounts(body.params) });
  if (method === "POST" && p === "check") return json(200, checkRobot(body.robot, body.options ?? {}));
  if (method === "POST" && p === "schematic") { try { return json(200, schematicOf(body.robot)); } catch (e) { return json(422, { error: (e as Error).message }); } }
  if (method === "POST" && p === "wiring") { try { const w = wiringOf(body.robot); return json(200, { svg: wiringSvg(w, body.robot.robot_name), markdown: wiringMarkdown(w, body.robot.robot_name) }); } catch (e) { return json(422, { error: (e as Error).message }); } }
  if (method === "POST" && p === "breadboard") { try { return json(200, breadboardOf(body.robot)); } catch (e) { return json(422, { error: (e as Error).message }); } }
  if (method === "POST" && p === "sweep") return json(200, { samples: sweep(body.robot, String(body.joint), Number(body.samples ?? 24)) });
  if (method === "POST" && p === "urdf") { const spec = finalizeSpec(structuredClone(body.robot)); return json(200, { urdf: generateUrdf(spec), xacro: generateXacro(spec) }); }
  if (method === "POST" && p === "mesh") return new Response(toStlBinary(buildPart(body.geometry), 1) as BodyInit, { headers: { "Content-Type": "model/stl" } });
  const pm = /^part\/([A-Za-z0-9_.-]+)\.stl$/.exec(p);
  if (method === "GET" && pm && CATALOG[pm[1]]) return new Response(toStlBinary(buildPart(componentGeometry(pm[1]) as never), 1) as BodyInit, { headers: { "Content-Type": "model/stl" } });
  return json(404, { error: "unknown engine endpoint" });
}
/** Inertia and collision for links an edit added (finalizeSpec fills only what is missing). */
function finalizeFresh(robot: RobotSpecification) { finalizeSpec(robot); if (robot.root && !robot.links.some((l) => l.name === robot.root)) delete robot.root; void rootLink; }
