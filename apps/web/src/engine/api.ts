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
import { componentGeometry, PRINT_DENSITY, withSolids, interferences, worstTorques, comWorld, totalMass, evaluate, axisInertias, descendants, type DesignRecord } from "@ttr/design";
import { partFiles } from "@ttr/kernel/ready";
import { applyEdits, emptyRobot, kindOf, rootLink, worldFrames, mul, poseMat, rotate, unit, type EditOp, type PartProvider, type PrintedParams, type StudioMeta } from "./edit.ts";
import { partMounts, printedMounts, printedProgram, worldMounts } from "./mounts.ts";
import { autoWire } from "./autowire.ts";

export const ENGINE_API_VERSION = "1.0.0";
const MATERIAL: Record<string, string> = { actuator: "actuator", wheel: "rubber", battery: "battery", compute: "electronics", sensor: "electronics", motor_driver: "electronics", misc: "electronics", bearing: "metal", horn: "metal" };
const BED_MM: Vec3 = [250, 210, 220];

export const parts: PartProvider = {
  component(key) {
    const c = part(key);
    return { geometry: componentGeometry(key) as Geometry, mass: c.mass_g / 1000, material: MATERIAL[c.category] ?? "metal", role: c.category };
  },
  printed(params, name) {
    const json = JSON.stringify(printedProgram(params, name));
    const g = meshGeometry("cad", `${name}.stl`, { program: json }) as Geometry & { volume: number };
    return { geometry: g, mass: Math.max(g.volume * PRINT_DENSITY, 0.002), material: "printed", role: "link" };
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
/** Checks and engineering numbers of a spec. Heavy parts (solids, wiring) are skipped with `quick`. */
export function checkRobot(input: RobotSpecification, opts: { quick?: boolean; interference?: boolean; wiring?: boolean } = {}) {
  const spec = structuredClone(input), checks: Check[] = [];
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
  const joints = spec.joints.filter((j) => j.type !== "fixed" && !j.passive && !j.mimic).map((j) => {
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
  const printed: { name: string; bbox_mm: Vec3; fits_bed: boolean; watertight: boolean; mass_kg: number; volume_cm3: number }[] = [];
  for (const l of spec.links) {
    const g = l.geometry; if (g.type !== "mesh" || (g.part !== "cad" && g.part !== "printed")) continue;
    if (opts.quick) continue;
    try {
      const size = [0, 1, 2].map((k) => (g.bbox.max[k] - g.bbox.min[k]) * 1000) as Vec3;
      const fits = [[0, 1, 2], [1, 0, 2], [0, 2, 1], [2, 0, 1], [1, 2, 0], [2, 1, 0]].some((o) => o.every((k, i) => size[k] <= BED_MM[i]));
      const watertight = g.part === "cad" ? (() => { const f = partFiles(String(g.params?.program)); return f.watertight && f.bodies === 1; })() : true;
      printed.push({ name: l.name, bbox_mm: size.map((x) => +x.toFixed(1)) as Vec3, fits_bed: fits, watertight, mass_kg: +(g.volume * PRINT_DENSITY).toFixed(4), volume_cm3: +(g.volume * 1e6).toFixed(2) });
      checks.push({ name: `print:${l.name}`, pass: fits && watertight, detail: `${size.map((x) => x.toFixed(0)).join(" x ")} mm${fits ? "" : ", does not fit a 250 x 210 x 220 mm bed"}${watertight ? "" : ", not one closed solid"}` });
    } catch (e) { checks.push({ name: `print:${l.name}`, pass: false, detail: (e as Error).message }); }
  }
  // nothing passes through anything (parts joined directly touch by design)
  if (!opts.quick && opts.interference !== false) {
    try {
      const skip = new Set(spec.joints.flatMap((j) => [`${j.parent}|${j.child}`]));
      for (const j of spec.joints) for (const k of spec.joints) if (j.parent === k.parent && j !== k) skip.add(`${j.child}|${k.child}`);
      const bonded = meta(spec).design?.bonded ?? []; for (const [a, b] of bonded) skip.add(`${a}|${b}`);
      const hits = withSolids(spec, (m) => interferences(m, {}, undefined, 2, skip));
      checks.push({ name: "clearance:home", pass: !hits.length, detail: hits.length ? `intersecting: ${hits.slice(0, 8).map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`).join(", ")}` : "no two parts intersect" });
    } catch (e) { checks.push({ name: "clearance:home", pass: false, detail: `not checked: ${(e as Error).message}` }); }
  }
  // wiring and power budget
  let wiring: ReturnType<typeof autoWire> | null = null;
  if (!opts.quick && opts.wiring !== false) {
    wiring = autoWire(spec);
    for (const c of wiring.checks) checks.push(c);
  }
  let cost = 0, bomLines = 0;
  try { const bom = buildBom(refreshDesign(spec, checks, joints, printed, wiring?.record ?? null)); cost = bom.total; bomLines = bom.lines.length; } catch { /* template robot without parts */ }
  const robot = meta(input).studio?.edited ? refreshDesign(spec, checks, joints, printed, wiring?.record ?? null) : input;
  return {
    robot, urdf, valid: checks.every((c) => c.pass), checks,
    engineering: {
      mass_kg: +mass.toFixed(3), com_m: com.map((x) => +x.toFixed(4)) as Vec3, cost_usd: +cost.toFixed(2), bom_lines: bomLines,
      joints, rails: wiring?.record?.rails ?? [], wiring_unconnected: wiring?.unwired ?? [], printed,
      links: spec.links.length, dof: spec.joints.filter((j) => j.type !== "fixed" && !j.passive).length,
    },
  };
}

/** An edited robot's design record, rebuilt from what is in it now (bought parts, printed parts, sizing, checks, harness). */
function refreshDesign(spec: RobotSpecification, checks: Check[], joints: ReturnType<typeof checkRobot>["engineering"] extends infer E ? E extends { joints: infer J } ? J : never : never, printed: { name: string; bbox_mm: Vec3; fits_bed: boolean; watertight: boolean; mass_kg: number; volume_cm3: number }[], wiring: DesignRecord["wiring"] | null): RobotSpecification {
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
  if (method === "POST" && p === "sweep") return json(200, { samples: sweep(body.robot, String(body.joint), Number(body.samples ?? 24)) });
  if (method === "POST" && p === "urdf") { const spec = finalizeSpec(structuredClone(body.robot)); return json(200, { urdf: generateUrdf(spec), xacro: generateXacro(spec) }); }
  if (method === "POST" && p === "mesh") return new Response(toStlBinary(buildPart(body.geometry), 1), { headers: { "Content-Type": "model/stl" } });
  const pm = /^part\/([A-Za-z0-9_.-]+)\.stl$/.exec(p);
  if (method === "GET" && pm && CATALOG[pm[1]]) return new Response(toStlBinary(buildPart(componentGeometry(pm[1]) as never), 1), { headers: { "Content-Type": "model/stl" } });
  return json(404, { error: "unknown engine endpoint" });
}
/** Inertia and collision for links an edit added (finalizeSpec fills only what is missing). */
function finalizeFresh(robot: RobotSpecification) { finalizeSpec(robot); if (robot.root && !robot.links.some((l) => l.name === robot.root)) delete robot.root; void rootLink; }
