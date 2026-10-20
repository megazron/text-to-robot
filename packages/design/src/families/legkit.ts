// Shared building blocks for legged robots: frames and printed brackets around real actuators,
// stance loads (J^T F at the feet), electronics, power and battery sizing, sensor mounting,
// joint limits from exact interference sweeps.
import type { Link, SensorType } from "@ttr/robot-schema";
import { part, rating, bboxM, hornRadiusMm, outputHoles, type Vec3 } from "@ttr/parts";
import { frame, invert, mul, apply, translation, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { contactTorques, gravityTorques, totalMass } from "../kin.ts";
import { withSolids, interferences, freeRange } from "../clearance.ts";
import { evaluate as evalChoice, DYNAMIC_FACTOR, DUTY } from "../sizing.ts";

export const PLATE = 4; // horn plate thickness, mm
export const WALL = 3;
export const G = 9.81;

// ---- vectors (mm) ----
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: Vec3): Vec3 => scale(a, 1 / (len(a) || 1));
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

// ---- component geometry (mm) ----
export const bodyMm = (key: string) => { const b = bboxM(key); return { min: b.min.map((x) => x * 1000) as Vec3, max: b.max.map((x) => x * 1000) as Vec3 }; };
/** Depth of an actuator body behind its output face (mm). */
export const depth = (key: string) => -bodyMm(key).min[2];
/** Farthest body point from the output axis (mm). */
export const bodyRadius = (key: string) => { const b = bodyMm(key); return Math.max(...[b.min[0], b.max[0]].flatMap((x) => [b.min[1], b.max[1]].map((y) => Math.hypot(x, y)))); };
/** World corners of the cradle around an actuator placed at T. */
export function cradleCorners(key: string, T: Mat4, wall = WALL): Vec3[] {
  const b = bodyMm(key), c: Vec3[] = [];
  for (const x of [b.min[0] - wall, b.max[0] + wall]) for (const y of [b.min[1] - wall, b.max[1] + wall]) for (const z of [b.min[2] - wall, -2]) c.push(apply(T, [x, y, z]));
  return c;
}
/** Points of a component's body box (its own frame, optional inflation) mapped to world. */
export function boxCorners(min: Vec3, max: Vec3, T: Mat4): Vec3[] {
  const c: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) c.push(apply(T, [x, y, z]));
  return c;
}
export const aabb = (pts: Vec3[]) => ({ lo: [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))) as Vec3, hi: [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]))) as Vec3 });
/** Same origin and z axis as W, x axis towards `xDir` (child-link frames aligned with the link for tight collision boxes). */
export const reframe = (W: Mat4, xDir: Vec3): Mat4 => frame([W[12], W[13], W[14]], [W[8], W[9], W[10]], xDir);
export const originOf = (W: Mat4): Vec3 => [W[12], W[13], W[14]];
export const zOf = (W: Mat4): Vec3 => [W[8], W[9], W[10]];

/**
 * A plate lying in the plane of frame W (local z in [z0, z1]): the hull of discs of radius r centred on
 * the projections of the given world points. Used for side plates bolted to a horn.
 */
export function plate(W: Mat4, pts: Vec3[], r: number, z0 = 0, z1 = PLATE): Op {
  const iW = invert(W);
  return { op: "at", T: W, of: [{ op: "hull", of: pts.map((p) => { const l = apply(iW, p); return { op: "box" as const, min: [l[0] - r, l[1] - r, z0] as Vec3, max: [l[0] + r, l[1] + r, z1] as Vec3, r: r * 0.999 }; }) }] };
}
/** Rounded slab spanning world points, local frame W (rounding in W's xy plane). */
export function slab(W: Mat4, pts: Vec3[], pad = 0, zpad = 0): Op {
  const iW = invert(W), l = pts.map((p) => apply(iW, p)), b = aabb(l);
  return { op: "at", T: W, of: [{ op: "box", min: [b.lo[0] - pad, b.lo[1] - pad, b.lo[2] - zpad], max: [b.hi[0] + pad, b.hi[1] + pad, b.hi[2] + zpad], r: Math.min(3, pad + 1) }] };
}
export const horn = (W: Mat4, key: string, t = PLATE): Op => ({ op: "at", T: W, of: [{ op: "horn", key, t }] });
export const hornR = (key: string) => hornRadiusMm(key) + 4;

// ---- assembly helpers ----
export interface Frame { name: string; W: Mat4; }
/** Actuator `key` placed at Wact (world) inside `parent`; revolute joint whose child frame is childW. */
export function joint(A: Assembly, name: string, parent: Frame, key: string, Wact: Mat4, child: string, childW: Mat4, lim: [number, number]): Frame {
  A.mount(parent.name, key, mul(invert(parent.W), Wact), `${name}_actuator`, `joint ${name}`);
  A.revolute(name, parent.name, child, mul(invert(parent.W), childW), key, +lim[0].toFixed(3), +lim[1].toFixed(3));
  A.fastener(key.startsWith("cubemars_") ? "M3 x 8 housing screws" : key.startsWith("dxl_") ? "M2.5 x 6 case screws" : "M2 x 6 case screws", key.startsWith("cubemars_") ? 6 : 4);
  A.fastener(key.startsWith("cubemars_") ? "M3/M4 x 10 hub screws" : "horn screws", outputHoles(key).length || 4);
  return { name: child, W: childW };
}
/** Printed link whose program is written in world mm at the home pose. */
export function printed(A: Assembly, f: Frame, ops: Op[], opts: { role?: string; material?: string } = {}): Link {
  return A.printedLink(f.name, { name: f.name, ops: [{ op: "at", T: invert(f.W), of: ops }] }, opts);
}
/** Bought part fixed to a link, placed by a world transform. */
export function mountAt(A: Assembly, parent: Frame, key: string, Tworld: Mat4, name: string, use = name): Link {
  return A.mount(parent.name, key, mul(invert(parent.W), Tworld), name, use);
}
/** Rubber contact pad (moulded / TPU printed sphere) fixed at a world point. */
export function footPad(A: Assembly, parent: Frame, name: string, at: Vec3, radiusMm: number): Link {
  const vol = (4 / 3) * Math.PI * (radiusMm / 1000) ** 3, mass = vol * 1210 * 0.8; // TPU 95A, 80 % infill
  const link: Link = { name, role: "foot", geometry: { type: "sphere", radius: radiusMm / 1000 }, mass: +mass.toFixed(4), material: "rubber", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
  A.spec.links.push(link);
  A.fixed(`${name}_mount`, parent.name, name, mul(invert(parent.W), translation(at)));
  return link;
}

// ---- loads ----
export interface Foot { link: string; leg: string; }
/**
 * Worst static torque per actuated joint while standing/walking: every pose in `poses` is evaluated with
 * each support set; a stance foot carries (m g / n) plus a horizontal traction component, a swing leg carries
 * its own weight. tau = J^T F at the foot centre (root held), plus the leg's own gravity load.
 */
export function stanceTorques(A: Assembly, feet: Foot[], supports: string[][], poses: Record<string, number>[], extraKg = 0, traction = 0.15, lean: Vec3[] = [[0, 0, 0]]): Record<string, number> {
  const spec = A.spec, m = totalMass(spec) + extraKg, worst: Record<string, number> = {};
  const legOf = new Map(feet.map((f) => [f.link, f]));
  for (const q of poses) {
    const grav = gravityTorques(spec, q);
    for (const set of supports) {
      const n = set.length, Fz = (m * G) / n;
      for (const fl of feet) {
        const stance = set.includes(fl.link);
        const forces: Vec3[] = stance ? [[0, 0, Fz], [traction * Fz, 0, Fz], [-traction * Fz, 0, Fz], [0, traction * Fz, Fz], [0, -traction * Fz, Fz]] : [];
        for (const F0 of forces) for (const L of lean) {
          const F: Vec3 = [F0[0] + L[0] * Fz, F0[1] + L[1] * Fz, F0[2] * (1 + L[2])];
          const t = contactTorques(spec, q, fl.link, [0, 0, 0], F);
          for (const [k, v] of Object.entries(t)) worst[k] = Math.max(worst[k] ?? 0, Math.abs(v));
        }
        if (!stance) for (const [k, v] of Object.entries(grav)) if (legJoint(k, legOf.get(fl.link)!.leg)) worst[k] = Math.max(worst[k] ?? 0, v);
      }
    }
  }
  return worst;
}
const legJoint = (joint: string, leg: string) => joint.startsWith(`${leg}_`);

/** Record per-joint sizing results; returns true when every joint passes. */
export function recordJoints(A: Assembly, torques: Record<string, number>, note: (j: string) => string): boolean {
  let ok = true;
  for (const j of A.spec.joints) {
    if (j.type !== "revolute") continue;
    const g = A.spec.links.find((l) => l.name === `${j.name}_actuator`)?.geometry;
    const key = g?.type === "mesh" ? String(g.params?.key ?? "") : "";
    if (!key) continue;
    const c = evalChoice(key, torques[j.name] ?? 0), r = rating(key);
    A.design.joints.push({ joint: j.name, actuator: key, required_nm: c.required_nm, rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: c.margin, speed_rad_s: r.speed_rad_s, note: `worst static ${(torques[j.name] ?? 0).toFixed(3)} N·m (${note(j.name)}) x ${DYNAMIC_FACTOR} dynamic factor` });
    A.check(`torque:${j.name}`, c.ok && c.continuous_ok, `needs ${c.required_nm} N·m peak, ${part(key).name} gives ${r.peak_nm} N·m peak / ${r.rated_nm} N·m rated (margin ${c.margin}x; continuous ${(torques[j.name] ?? 0) * DUTY <= r.rated_nm ? "ok" : "exceeded"})`);
    ok &&= c.ok && c.continuous_ok;
  }
  return ok;
}

// ---- power ----
/** Standby current of each actuator family (A) when holding without load. */
const STANDBY_A: Record<string, number> = { feetech_sts: 0.05, dynamixel_x: 0.04, cubemars_ak: 0.08 };
/** Average current (A at the actuator's supply) to hold `nm` continuously. */
export function holdCurrent(key: string, nm: number): number {
  const r = rating(key), s = part(key).specs, fam = r.family;
  const iPeak = Number(s.peak_current_a ?? s.stall_current_a ?? s.current_a ?? 1);
  return (STANDBY_A[fam] ?? 0.05) + iPeak * Math.min(1, nm / r.peak_nm);
}
/**
 * Average electrical power (W) of an actuator that holds `nm` on average while walking.
 * Geared DC servos: copper loss of a stalled motor scales with the square of the load
 * (P = V * I_stall * f^2) plus 15 % of that stall power x f for motion; QDD actuators: copper loss
 * 0.75 * I^2 * R_line with I = tau / Kt (Kt from the peak torque / peak current) plus 1 W driver standby.
 */
export function walkPower(key: string, nm: number, voltage?: number): number {
  const r = rating(key), s = part(key).specs, f = Math.min(1, nm / r.peak_nm);
  if (r.family === "cubemars_ak") {
    const kt = r.peak_nm / Number(s.peak_current_a), i = nm / kt;
    return 0.75 * i * i * R_LINE_AK + 1.0 + 0.1 * nm * 2; // + mechanical work, ~2 rad/s average joint speed x 10 % of the load
  }
  const v = voltage ?? r.voltage_v, iStall = Number(s.stall_current_a ?? s.current_a ?? 1);
  return v * (iStall * (f * f + 0.15 * f) + (STANDBY_A[r.family] ?? 0.05));
}
/** Line-to-line winding resistance assumed for AK60/70/80-class actuators (not published for every model). */
export const R_LINE_AK = 0.3;
export interface PowerItem { what: string; watts: number; }
/** Battery that gives at least `minutes` at `watts` average (80 % usable), from candidates (each [key, count in series]). */
export function pickBattery(candidates: [string, number][], watts: number, minutes: number) {
  for (const [key, n] of candidates) {
    const wh = Number(part(key).specs.energy_wh) * n, mins = (0.8 * wh / watts) * 60;
    if (mins >= minutes) return { key, n, wh, minutes: mins };
  }
  const [key, n] = candidates[candidates.length - 1];
  const wh = Number(part(key).specs.energy_wh) * n;
  return { key, n, wh, minutes: (0.8 * wh / watts) * 60 };
}
export const COMPUTE_W: Record<string, number> = { rpi5: 7, jetson_orin_nano_super: 15, esp32_s3_devkitc1: 0.6 };
export const SENSOR_W: Record<string, number> = { rpi_camera_module_3: 1.0, realsense_d435i: 3.4, rplidar_c1: 1.15, rplidar_a1m8: 2.5, bno085_breakout: 0.05 };

// ---- sensors ----
export function addSensor(A: Assembly, type: SensorType, name: string, parent: string, xyzM: Vec3, rpy: Vec3 = [0, 0, 0], params: Record<string, number | string> = {}) {
  A.spec.sensors.push({ name, type, parent, origin: { xyz: xyzM.map((x) => +x.toFixed(4)) as Vec3, rpy }, params });
}

// ---- geometry-derived joint limits ----
/**
 * Shrink each listed joint's limits to its collision-free range (other joints at home), keeping a margin,
 * then record an interference check at home and at sampled limit combinations.
 */
export function limitsFromGeometry(A: Assembly, joints: string[], combos: Record<string, number>[] = [], margin = 0.06, skipPairs: [string, string][] = [], baseFor: (joint: string) => Record<string, number> = () => ({})) {
  const skip = new Set(skipPairs.map(([a, b]) => `${a}|${b}`));
  // bought boards/packs/pads sit on the part that carries them; their box approximations (PCB with
  // under-board connectors, pads clamped over a shin tip) overlap that carrier by design
  const carried = new Set(["foot", "battery", "compute", "sensor", "motor_driver", "misc"]);
  for (const j of A.spec.joints) if (j.type === "fixed" && carried.has(A.spec.links.find((l) => l.name === j.child)?.role ?? "")) {
    skip.add(`${j.parent}|${j.child}`);
    // a part printed in bed-sized pieces (<name>_b, <name>_b_b ...) carries the board as one body
    for (const l of A.spec.links) if (l.name.startsWith(`${j.parent}_b`)) skip.add(`${l.name}|${j.child}`);
  }
  const report: string[] = [];
  withSolids(A.spec, (m) => {
    const home = interferences(m, {}, undefined, 2, skip);
    A.check("clearance:home", home.length === 0, home.length ? `intersecting at the home pose: ${home.map((x) => `${x.a}/${x.b} ${x.volume_mm3} mm^3`).join(", ")}` : "no printed part or component intersects another at the home pose");
    for (const name of joints) {
      const j = A.spec.joints.find((x) => x.name === name)!;
      const lo = j.limit!.lower!, hi = j.limit!.upper!;
      const [a, b] = freeRange(m, name, baseFor(name), lo, hi, 0.04, skip);
      const nlo = a > lo ? Math.min(0, a + margin) : lo, nhi = b < hi ? Math.max(0, b - margin) : hi;
      j.limit!.lower = +nlo.toFixed(3); j.limit!.upper = +nhi.toFixed(3);
      if (a > lo || b < hi) report.push(`${name} [${lo.toFixed(2)}, ${hi.toFixed(2)}] -> [${nlo.toFixed(2)}, ${nhi.toFixed(2)}]`);
    }
    let bad: string[] = [];
    for (const q0 of combos) {
      const q: Record<string, number> = {};
      for (const [k, v] of Object.entries(q0)) { const j = A.spec.joints.find((x) => x.name === k)!; q[k] = v < 0 ? Math.max(v, j.limit!.lower!) : Math.min(v, j.limit!.upper!); }
      const hit = interferences(m, q, undefined, 2, skip);
      if (hit.length) bad = bad.concat(hit.map((x) => `${x.a}/${x.b}`));
    }
    A.check("clearance:motion", bad.length === 0, bad.length ? `interference at combined limit poses: ${[...new Set(bad)].slice(0, 8).join(", ")}` : `no interference over ${combos.length} combined poses at the joint limits`);
  });
  A.design.assumptions.push(report.length ? `Joint limits trimmed to the collision-free range found by exact solid sweeps: ${report.join("; ")}.` : "Every joint's limits are inside its collision-free range (exact solid sweeps).");
}

export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
export { mul, invert, apply, frame, translation };
