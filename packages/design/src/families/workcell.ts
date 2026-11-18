// A work cell: two or more serial arms side by side on one shared base plate (a dual-arm or multi-arm bench setup), or
// two arms on the shoulders of a fixed torso column. Each arm is designed and sized like a bench arm; the cell powers
// them all from one supply through one bus adapter, one bus branch per arm, and sweeps every joint against the other
// arms and the plate, so the limits keep the arms out of each other.
import type { RobotSpecification, SensorType } from "@ttr/robot-schema";
import { part, type Vec3 } from "@ttr/parts";
import { Assembly, printedGeometry } from "../assembly.ts";
import { I4, translation, type Op } from "@ttr/solid";
import { totalMass, type PointLoad } from "../kin.ts";
import { LADDERS, type Ladder } from "../sizing.ts";
import { controlCase } from "../enclosure.ts";
import { Harness } from "../wiring.ts";
import { designArm, graftArm, wireFixedArm } from "./arm.ts";
import { limitsFromGeometry } from "./legkit.ts";
import { comOf } from "./mobile.ts";

export interface WorkcellRequest {
  name?: string; prompt?: string; budget?: number; payloadKg?: number; reachM?: number;
  segments?: { upper_arm?: number; forearm?: number };
  /** wrist sensors, fitted to the first arm */
  sensors?: SensorType[];
  /** one entry per arm */
  arms: { dof: number; gripper?: boolean }[];
  /** "row": arms side by side on a bench plate; "torso": two arms on the shoulders of a column (a dual-arm torso) */
  layout?: "row" | "torso";
  ladder?: Ladder;
  onlyActuators?: string[];
  /** the 12 V supply (default: the 75 W one, moved up to 150 W when the rail's peak needs it) */
  supply12?: "psu_12v_lrs75" | "psu_12v_lrs150";
}

export const MAX_CELL_ARMS = 4;
const ALU = 2700;
const ORDER: Ladder[] = ["hobby", "feetech", "dynamixel", "dynamixel12", "cubemars"];
const ladderOf = (spec: RobotSpecification): Ladder => {
  const label = String((spec.metadata as any).design?.performance?.actuators ?? "");
  return (Object.entries(LADDERS).find(([, v]) => v.label === label)?.[0] ?? "feetech") as Ladder;
};
/** arms designed lately, by request: a cell's arms alike, and a cell built again on a bigger supply, design each once */
const seen = new Map<string, RobotSpecification>();
const prefixOf = (i: number, n: number) => n === 2 ? (i === 0 ? "left_arm" : "right_arm") : `arm_${i + 1}`;

export function designWorkcell(req: WorkcellRequest): RobotSpecification {
  const spec = buildCell(req);
  const fails = (x: RobotSpecification) => ((x.metadata as any).design?.checks ?? []).some((c: { name: string; pass: boolean }) => c.name === "wiring:rail:VBUS" && !c.pass);
  return !req.supply12 && fails(spec) ? buildCell({ ...req, supply12: "psu_12v_lrs150" }) : spec;
}
function buildCell(req: WorkcellRequest): RobotSpecification {
  const n = Math.max(1, Math.min(MAX_CELL_ARMS, req.arms.length)), layout = req.layout === "torso" && n === 2 ? "torso" : "row";
  const plateArm = 120;   // each arm's own printed base plate (its four M5 holes bolt it to the cell plate)
  const armReq = (i: number, ladder?: Ladder) => ({ name: `arm_${i + 1}`, dof: req.arms[i].dof, gripper: req.arms[i].gripper !== false, prompt: req.prompt, budget: req.budget, payloadKg: req.payloadKg,
    reachM: req.reachM, segments: req.segments, sensors: i === 0 ? req.sensors : [], embedded: true, basePlateMm: plateArm,
    ...(ladder ? { ladder } : req.ladder ? { ladder: req.ladder } : {}), ...(req.onlyActuators ? { onlyActuators: req.onlyActuators } : {}) });
  // every arm on the same actuator family (one bus, one supply): the family the hardest-working arm needs
  // arms alike are designed once (the designer is deterministic in its request)
  const design = (i: number, ladder?: Ladder) => { const r = armReq(i, ladder), k = JSON.stringify({ ...r, name: "", sensors: r.sensors ?? [] }); if (!seen.has(k)) { if (seen.size >= 16) seen.delete(seen.keys().next().value as string); seen.set(k, designArm(r)); } return structuredClone(seen.get(k)!); };
  let arms = req.arms.slice(0, n).map((_, i) => design(i));
  const top = arms.map(ladderOf).reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a));
  arms = arms.map((s, i) => (ladderOf(s) === top ? s : design(i, top)));
  const ladder = top;
  const reachMm = Math.max(...arms.map((s) => Number((s.metadata as any).design.performance.reach_m) * 1000));
  // arms far enough apart that their bases and turrets clear, close enough to share a workspace in front of them
  const pitch = Math.max(plateArm + 80, Math.round(reachMm * 0.9));
  const ys = Array.from({ length: n }, (_, i) => ((n - 1) / 2 - i) * pitch);   // left (+y) to right
  const name = req.name ?? (layout === "torso" ? "dual_arm_torso" : n === 2 ? "dual_arm_cell" : `cell_of_${n}_arms`);
  const A = new Assembly(name, "arm_workcell", req.prompt);
  A.spec.root = "base_link";
  A.spec.materials.push({ name: "aluminium", color: [0.56, 0.58, 0.62, 1] });
  // ---- the cell plate: 8 mm aluminium, laser cut, as wide as the arms' row and deep enough to stand under them stretched
  //      out (checked below); a torso stands its shoulder bar on a column in the middle of the plate
  const shoulderZ = layout === "torso" ? 360 : 0;
  let T = 8, depth = Math.max(plateArm + 120, Math.round(reachMm * 1.1)), width = (n - 1) * pitch + plateArm + 120;
  const fab: { item: string; usd: number }[] = [];
  const plate = (t: number, d: number, w: number): Op[] => {
    const ops: Op[] = [{ op: "box", min: [-d / 2, -w / 2, -t], max: [d / 2, w / 2, 0], r: 10 }];
    // the arms' base holes (shoulder bar holes on a torso), and four bench-clamp holes in the corners
    if (layout === "row") for (const y of ys) for (const sx of [-1, 1]) for (const sy of [-1, 1]) ops.push({ op: "hole", a: [sx * (plateArm / 2 - 10), y + sy * (plateArm / 2 - 10), -t - 1], b: [sx * (plateArm / 2 - 10), y + sy * (plateArm / 2 - 10), 1], d: 5.5 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) ops.push({ op: "hole", a: [sx * (d / 2 - 15), sy * (w / 2 - 15), -t - 1], b: [sx * (d / 2 - 15), sy * (w / 2 - 15), 1], d: 6.5 });
    return ops;
  };
  const link = (nm: string, ops: Op[], role: string) => {
    const geometry = printedGeometry({ name: nm, ops });
    A.spec.links.push({ name: nm, role, geometry, mass: Math.max(geometry.volume * ALU, 0.005), material: "aluminium", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } });
  };
  link("base_link", plate(T, depth, width), "base");
  const mounts: { parent: string; at: Vec3 }[] = [];
  if (layout === "torso") {
    // a 60 x 60 mm aluminium box column, a shoulder bar across its top that both arms bolt to
    const barW = (n - 1) * pitch + plateArm + 20;
    const col: Op[] = [{ op: "box", min: [-30, -30, 0], max: [30, 30, shoulderZ - 8] }, { op: "cutbox", min: [-27, -27, -1], max: [27, 27, shoulderZ - 7] }];
    link("torso_column", col, "structure"); A.fixed("torso_column_mount", "base_link", "torso_column", I4());
    const bar: Op[] = [{ op: "box", min: [-plateArm / 2 - 10, -barW / 2, shoulderZ - 8], max: [plateArm / 2 + 10, barW / 2, shoulderZ], r: 8 }];
    for (const y of ys) for (const sx of [-1, 1]) for (const sy of [-1, 1]) bar.push({ op: "hole", a: [sx * (plateArm / 2 - 10), y + sy * (plateArm / 2 - 10), shoulderZ - 9], b: [sx * (plateArm / 2 - 10), y + sy * (plateArm / 2 - 10), shoulderZ + 1], d: 5.5 });
    link("shoulder_bar", bar, "structure"); A.fixed("shoulder_bar_mount", "torso_column", "shoulder_bar", I4());
    fab.push({ item: `60 x 60 x 3 mm aluminium box section, ${shoulderZ - 8} mm (torso column, ~$20)`, usd: 20 }, { item: `${plateArm + 20} x ${Math.round(barW)} x 8 mm aluminium shoulder bar, laser cut (~$35)`, usd: 35 });
    A.fastener("M6 x 16 + T-nut (column to plate and bar)", 8);
    for (const y of ys) mounts.push({ parent: "shoulder_bar", at: [0, y, shoulderZ] });
  } else for (const y of ys) mounts.push({ parent: "base_link", at: [0, y, 0] });
  const prefixes: string[] = [], tools: { link: string; xyz_m: Vec3; payload_kg: number }[] = [], home: Record<string, number> = {};
  arms.forEach((spec, i) => {
    const p = prefixOf(i, n);
    const g = graftArm(A, spec, mounts[i].parent, translation(mounts[i].at), p);
    prefixes.push(p); if (g.tool) tools.push(g.tool);
    for (const [k, v] of Object.entries((spec.metadata as any).design.home ?? {})) home[`${p}_${k}`] = v as number;
    A.fastener("M5 x 16 + nut (arm base to the cell plate)", 4);
  });
  A.design.home = home;
  A.design.tool = tools[0];
  A.design.tcp = tools[0] ? { link: tools[0].link, xyz: tools[0].xyz_m } : undefined;
  // ---- limits: every joint swept on the exact solids against the other arms, the plate and the column
  const armJoints = A.spec.joints.filter((j) => j.type === "revolute" && !j.mimic && !/gripper/.test(j.name)).map((j) => j.name);
  limitsFromGeometry(A, armJoints, [], 0.06, [], () => home, "base");
  // ---- free-standing: the plate must not tip with every arm stretched out holding its payload, any direction
  const loads: PointLoad[] = tools.map((t) => ({ link: t.link, at: t.xyz_m, massKg: t.payload_kg }));
  const stretched = (dir: number): Record<string, number> => {
    const q: Record<string, number> = { ...home };
    for (const p of prefixes) { q[`${p}_base_yaw`] = dir; q[`${p}_shoulder_pitch`] = home[`${p}_shoulder_pitch`] !== undefined ? Math.sign(home[`${p}_shoulder_pitch`]) * 1.4 : 0; for (const k of Object.keys(q)) if (k.startsWith(`${p}_`) && /elbow|wrist/.test(k)) q[k] = 0; }
    const lim = (k: string, v: number) => { const j = A.spec.joints.find((x) => x.name === k); return j?.limit ? Math.max(j.limit.lower ?? -Math.PI, Math.min(j.limit.upper ?? Math.PI, v)) : v; };
    return Object.fromEntries(Object.entries(q).filter(([k]) => A.spec.joints.some((j) => j.name === k)).map(([k, v]) => [k, lim(k, v)]));
  };
  const margin = () => {
    let worst = Infinity;
    for (const dir of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4]) {
      const { com } = comOf(A.spec, stretched(dir), loads), x = com[0] * 1000, y = com[1] * 1000;
      worst = Math.min(worst, depth / 2 - Math.abs(x), width / 2 - Math.abs(y));
    }
    return worst;
  };
  // a heavier and deeper plate until it stands on its own (up to 12 mm and 1.6 x the reach); else it must be clamped
  for (let k = 0; k < 6 && margin() < 10; k++) {
    if (T < 12) T += 2; else depth = Math.round(depth * 1.15);
    const l = A.spec.links.find((x) => x.name === "base_link")!, geometry = printedGeometry({ name: "base_link", ops: plate(T, depth, width) });
    l.geometry = geometry; l.mass = geometry.volume * ALU;
  }
  const m = margin();
  A.check("stability:free_standing", m >= 10, `centre of mass ${m.toFixed(0)} mm inside the ${depth} x ${width} x ${T} mm plate's edge with every arm stretched out holding ${req.payloadKg ?? (tools[0]?.payload_kg ?? 0)} kg, worst direction (10 mm needed); clamp it to the bench anyway`);
  fab.push({ item: `${depth} x ${width} x ${T} mm aluminium cell plate, laser cut (~$${Math.round(20 + depth * width * T * 2.7e-6 * 12)})`, usd: Math.round(20 + depth * width * T * 2.7e-6 * 12) });
  A.fastener("M6 x 20 + clamp (cell plate to bench)", 4);
  // ---- one supply, one bus adapter, one branch per arm, in a control case on the bench behind the cell
  const H = new Harness(A), caseX = -depth / 2 - 60 - 240;
  const holding = arms.reduce((s, a) => s + Number((a.metadata as any).design.performance.holding_current_a ?? 0), 0);
  const bus = LADDERS[ladder].bus, split = n >= 3 && ladder !== "hobby" && ladder !== "cubemars";
  let supplyA = 6, supply12: "psu_12v_lrs75" | "psu_12v_lrs150" = req.supply12 ?? (holding <= 6 * 0.8 ? "psu_12v_lrs75" : "psu_12v_lrs150");
  if (ladder === "hobby") {
    const stall = A.spec.links.filter((l) => /_actuator$/.test(l.name)).reduce((s, l) => s + Number(part(String((l.geometry as any).params?.key)).specs.stall_current_a ?? 1), 0);
    supplyA = stall <= 4 ? 4 : 10;
    controlCase(A, H, { parent: "base_link", T: translation([caseX, -70, 0]), psu: supplyA === 4 ? null : "psu_5v_lrs50", psuUse: "5 V servo supply (V+ terminal of the PCA9685)",
      boards: [{ name: "controller", key: "arduino_uno_r3", use: "controller (USB serial commands, I2C to the servo driver)" }, { name: "servo_driver", key: bus, use: "16-channel PWM servo driver (I2C)" }] });
    if (supplyA === 4) { H.part("power_supply", "psu_5v4a_adapter", { off_board: true, note: "wall adapter" }); A.buy("psu_5v4a_adapter", 1, "5 V 4 A wall adapter (V+ terminal of the PCA9685)"); }
    A.check("power:supply", stall <= supplyA, `all servos of the ${n} arms stalled together draw ${stall.toFixed(1)} A of the ${supplyA} A 5 V supply`);
  } else {
    const can = ladder === "cubemars";
    controlCase(A, H, { parent: "base_link", T: translation([caseX, -70, 0]), psu: can ? "psu_48v_lrs350" : supply12, psuUse: can ? "48 V actuator supply" : `12 V supply for the ${n} arms`,
      boards: [{ name: "servo_bus", key: bus, use: `USB to actuator bus (one branch per arm)` }, ...(can ? [{ name: "can_bus", key: "usb_can_adapter", use: "USB to CAN for the CubeMars actuators" }, { name: "dcdc_12v", key: "dcdc_48v_12v_sd50c12", use: "12 V for the DYNAMIXEL wrists" }] : [])] });
    // three or four arms: the third and fourth on a second supply and bus adapter in a case of their own
    if (!can && split) controlCase(A, H, { parent: "base_link", T: translation([caseX, 220, 0]), psu: "psu_12v_lrs150", psuUse: `12 V supply for arms 3${n > 3 ? " and 4" : ""}`, suffix: "_2",
      boards: [{ name: "servo_bus_2", key: bus, use: "USB to actuator bus (arms 3 and 4)" }] });
    const cont = Number(part(supply12).specs.current_a);
    const per = arms.map((a) => Number((a.metadata as any).design.performance.holding_current_a ?? 0)), first = split ? per.slice(0, 2).reduce((x, y) => x + y, 0) : holding, rest = holding - first;
    if (!can) A.check("power:supply", first <= cont * 0.8 && rest <= 12.5 * 0.8, split ? `arms 1-2 hold ~${first.toFixed(1)} A of the ${cont} A supply, arms 3-${n} ~${rest.toFixed(1)} A of the second 12.5 A supply` : `the ${n} arms holding their payloads stretched out draw ~${holding.toFixed(1)} A of the ${cont} A supply`);
  }
  A.design.performance = {
    arms: n, layout, reach_m: +(reachMm / 1000).toFixed(3), payload_kg: tools[0]?.payload_kg ?? 0, mass_kg: +totalMass(A.spec).toFixed(3), actuators: LADDERS[ladder].label,
    arm_dofs: arms.map((s) => (s.metadata as any).design.request.dof).join(" + "), arm_pitch_mm: pitch, holding_current_a: +holding.toFixed(2),
    ...Object.fromEntries(arms.map((s, i) => [`${prefixes[i]}`, `${(s.metadata as any).design.request.dof}-DOF, reach ${(s.metadata as any).design.performance.reach_m} m, ${(s.metadata as any).design.performance.payload_kg} kg`])),
  };
  A.design.assumptions.push(
    layout === "torso"
      ? `Dual-arm torso: two arms bolted upright on an aluminium shoulder bar ${shoulderZ} mm up a 60 mm box column, on an aluminium plate; ${pitch} mm between the shoulders. A torso, not a walking humanoid: it has no legs.`
      : `Work cell: ${n} arms side by side, ${pitch} mm apart, each bolted through its four M5 holes to one aluminium plate; their workspaces overlap in front of the row so they can hand parts to each other.`,
    "Every joint's limits are swept on the exact solids against the other arms, the plate and the column, from the ready pose: the arms cannot reach into each other through a single joint. Moves of two arms at once still need collision checking in the planner (MoveIt is set up with every link).",
    split ? `Arms 1 and 2 share one supply and bus adapter, arms 3${n > 3 ? " and 4" : ""} a second pair in a case of their own: every arm moving at once peaks past one 150 W supply. Each bus splits at a splice into one branch per arm.` : `Both arms share one supply and one bus adapter; the bus splits at a splice into one branch per arm, so an arm can be unplugged without the other.`,
    ...arms.flatMap((s) => ((s.metadata as any).design.assumptions as string[]).filter((x) => /clevis|PETG|Torques/.test(x))).filter((x, i, all) => all.indexOf(x) === i),
  );
  A.design.request = { ...req };
  wireFixedArm(A, H, ladder, supplyA, A.spec.links.some((l) => /gripper_actuator$/.test(l.name)), supply12, ladder === "hobby" || ladder === "cubemars" ? undefined : prefixes, split ? prefixes.slice(2) : undefined);
  const spec = A.finish(`${layout === "torso" ? "Dual-arm torso" : `${n}-arm work cell`}: ${arms.map((s) => `${(s.metadata as any).design.request.dof}-DOF`).join(" + ")} arms, reach ${(reachMm / 1000).toFixed(2)} m, ${LADDERS[ladder].label}`);
  // cost: bought parts, filament, fasteners, the aluminium and the wiring
  const d = (spec.metadata as any).design;
  const bought = d.purchased.reduce((s: number, p: { key: string; qty: number }) => s + part(p.key).price_usd * p.qty, 0);
  const printedKg = d.printed.reduce((s: number, p: { mass_kg: number }) => s + p.mass_kg, 0), filament = printedKg * 1.15 * 25;
  const fasteners = Object.values(d.fasteners as Record<string, number>).reduce((s, k) => s + k, 0) * 0.12, fb = fab.reduce((s, f) => s + f.usd, 0), wiring = Number(d.wiring?.cost_usd ?? 15);
  const total = bought + filament + fasteners + fb + wiring;
  d.performance.cost_usd = Math.round(total);
  d.performance.cost_breakdown = `catalog parts $${bought.toFixed(0)}, filament ${(printedKg * 1.15).toFixed(2)} kg $${filament.toFixed(0)}, fasteners $${fasteners.toFixed(0)}, fabricated/other $${fb.toFixed(0)} (${fab.map((f) => f.item).join("; ")})`;
  if (req.budget !== undefined) d.checks.push({ name: "budget", pass: total <= req.budget, detail: `estimated $${total.toFixed(0)} vs budget $${req.budget}` });
  return spec;
}
