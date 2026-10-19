// Forward kinematics and static joint loads straight from a RobotSpecification (SI units).
import type { RobotSpecification, Pose, Link } from "@ttr/robot-schema";
import type { Vec3 } from "@ttr/parts";

type M3 = number[][];
interface Tf { R: M3; p: Vec3; }
const matmul = (A: M3, B: M3): M3 => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const mv = (A: M3, v: Vec3): Vec3 => [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]];
export function rpyToR([r, p, y]: Vec3): M3 {
  const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p), cy = Math.cos(y), sy = Math.sin(y);
  return [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr], [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr], [-sp, cp * sr, cp * cr]];
}
function axisAngle(a: Vec3, t: number): M3 {
  const [x, y, z] = a, c = Math.cos(t), s = Math.sin(t), C = 1 - c;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]];
}
const compose = (a: Tf, b: Tf): Tf => ({ R: matmul(a.R, b.R), p: ((v) => [v[0] + a.p[0], v[1] + a.p[1], v[2] + a.p[2]] as Vec3)(mv(a.R, b.p)) });
const ofPose = (o: Pose): Tf => ({ R: rpyToR(o.rpy), p: [...o.xyz] as Vec3 });

export interface Fk { link: Record<string, Tf>; joint: Record<string, { p: Vec3; axis: Vec3 }>; }
export function rootOf(spec: RobotSpecification): string {
  const children = new Set(spec.joints.map((j) => j.child));
  return spec.root ?? spec.links.find((l) => !children.has(l.name))!.name;
}
export function fk(spec: RobotSpecification, q: Record<string, number> = {}, base: Tf = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], p: [0, 0, 0] }): Fk {
  const out: Fk = { link: { [rootOf(spec)]: base }, joint: {} };
  const byParent = new Map<string, typeof spec.joints>();
  for (const j of spec.joints) byParent.set(j.parent, [...(byParent.get(j.parent) ?? []), j]);
  const stack = [rootOf(spec)];
  while (stack.length) {
    const name = stack.pop()!;
    for (const j of byParent.get(name) ?? []) {
      const atJoint = compose(out.link[name], ofPose(j.origin));
      const axis = mv(atJoint.R, j.axis);
      out.joint[j.name] = { p: atJoint.p, axis };
      const v = q[j.name] ?? 0;
      const motion: Tf = j.type === "prismatic" ? { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], p: [j.axis[0] * v, j.axis[1] * v, j.axis[2] * v] }
        : j.type === "revolute" || j.type === "continuous" ? { R: axisAngle(j.axis, v), p: [0, 0, 0] } : { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], p: [0, 0, 0] };
      out.link[j.child] = compose(atJoint, motion);
      stack.push(j.child);
    }
  }
  return out;
}

/** Centre of mass of a link in its own frame. */
export function linkCom(l: Link): Vec3 {
  const c = l.geometry.type === "mesh" && l.geometry.centroid ? l.geometry.centroid : [0, 0, 0];
  return mv(rpyToR(l.origin.rpy), c as Vec3).map((x, i) => x + l.origin.xyz[i]) as Vec3;
}
export function descendants(spec: RobotSpecification, link: string): Set<string> {
  const out = new Set<string>([link]); let grew = true;
  while (grew) { grew = false; for (const j of spec.joints) if (out.has(j.parent) && !out.has(j.child)) { out.add(j.child); grew = true; } }
  return out;
}
export interface PointLoad { link: string; at: Vec3; massKg: number; }
/** Gravity torque (N·m, about the joint axis) each actuated joint must hold in configuration q. */
export function gravityTorques(spec: RobotSpecification, q: Record<string, number>, loads: PointLoad[] = [], g: Vec3 = [0, 0, -9.81]): Record<string, number> {
  const f = fk(spec, q), out: Record<string, number> = {};
  const lmap = new Map(spec.links.map((l) => [l.name, l]));
  for (const j of spec.joints) {
    if (j.type === "fixed" || j.passive) continue;
    const below = descendants(spec, j.child), { p, axis } = f.joint[j.name];
    let tau = 0;
    const add = (pos: Vec3, m: number) => { const r: Vec3 = [pos[0] - p[0], pos[1] - p[1], pos[2] - p[2]]; const F: Vec3 = [g[0] * m, g[1] * m, g[2] * m]; const t: Vec3 = [r[1] * F[2] - r[2] * F[1], r[2] * F[0] - r[0] * F[2], r[0] * F[1] - r[1] * F[0]]; tau += t[0] * axis[0] + t[1] * axis[1] + t[2] * axis[2]; };
    if (j.type === "prismatic") { let m = 0; for (const n of below) m += lmap.get(n)!.mass; for (const L of loads) if (below.has(L.link)) m += L.massKg; out[j.name] = Math.abs(m * (g[0] * axis[0] + g[1] * axis[1] + g[2] * axis[2])); continue; }
    for (const n of below) { const l = lmap.get(n)!; const T = f.link[n]; add(mv(T.R, linkCom(l)).map((x, i) => x + T.p[i]) as Vec3, l.mass); }
    for (const L of loads) if (below.has(L.link)) { const T = f.link[L.link]; add(mv(T.R, L.at).map((x, i) => x + T.p[i]) as Vec3, L.massKg); }
    out[j.name] = Math.abs(tau);
  }
  return out;
}
/** Worst gravity torque per joint over a set of poses. */
export function worstTorques(spec: RobotSpecification, poses: Record<string, number>[], loads: PointLoad[] = []): Record<string, number> {
  const worst: Record<string, number> = {};
  for (const q of poses) for (const [k, v] of Object.entries(gravityTorques(spec, q, loads))) worst[k] = Math.max(worst[k] ?? 0, v);
  return worst;
}
export function pointWorld(spec: RobotSpecification, q: Record<string, number>, link: string, at: Vec3 = [0, 0, 0]): Vec3 {
  const T = fk(spec, q).link[link];
  return mv(T.R, at).map((x, i) => x + T.p[i]) as Vec3;
}
export const totalMass = (spec: RobotSpecification) => spec.links.reduce((s, l) => s + l.mass, 0);
