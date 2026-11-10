// A robot's kinematic tree compiled for fast forward kinematics: joints in topological order, mimic joints resolved, limits
// merged with the sizing data (velocity from the actuator's rated speed, torque from its peak).
import type { RobotSpecification, Link } from "@ttr/robot-schema";
import { type T34, type V3, fromXyzRpy, mulInto, axisAngle, ident, unit, apply } from "./math.ts";

export interface KJoint {
  name: string; type: "revolute" | "continuous" | "prismatic" | "fixed";
  index: number; parent: number; child: number; origin: T34; axis: V3;
  lower: number; upper: number;
  /** rad/s or m/s: the tighter of the URDF limit and the actuator's rated speed */
  velocity: number;
  /** N m (N): the actuator's peak, or the URDF effort */
  peak: number;
  /** N m the design needs to hold against gravity (sizing), when known */
  required: number;
  passive: boolean;
  mimic: { leader: number; mult: number; offset: number } | null;
}
export interface Model {
  spec: RobotSpecification;
  links: string[]; link: Map<string, number>;
  joints: KJoint[]; joint: Map<string, number>;
  /** for each link, the index of the joint that carries it (-1 for the root) */
  parentJoint: Int32Array;
  root: number;
  /** joints a motion sets: not fixed and not mimic */
  free: number[];
  /** free joints with a motor: not passive */
  actuated: number[];
  /** each link's descendants (itself included), as link indices */
  below(link: number): Set<number>;
}

export function compile(spec: RobotSpecification): Model {
  const links = spec.links.map((l) => l.name), link = new Map(links.map((n, i) => [n, i]));
  const kids = new Set(spec.joints.map((j) => j.child));
  const rootName = spec.root && link.has(spec.root) ? spec.root : links.find((n) => !kids.has(n)) ?? links[0];
  const root = link.get(rootName)!;
  const sizing = new Map(((spec.metadata as { design?: { joints?: { joint: string; peak_nm?: number; rated_nm?: number; required_nm?: number; speed_rad_s?: number }[] } })?.design?.joints ?? []).map((j) => [j.joint, j]));
  // topological order from the root
  const byParent = new Map<string, typeof spec.joints>();
  for (const j of spec.joints) { if (!byParent.has(j.parent)) byParent.set(j.parent, []); byParent.get(j.parent)!.push(j); }
  const order: typeof spec.joints = [], stack = [rootName], seen = new Set<string>();
  while (stack.length) {
    const p = stack.shift()!; if (seen.has(p)) continue; seen.add(p);
    for (const j of byParent.get(p) ?? []) { if (!link.has(j.child)) continue; order.push(j); stack.push(j.child); }
  }
  const joints: KJoint[] = order.map((j, index) => {
    const s = sizing.get(j.name), cont = j.type === "continuous";
    const lim = j.limit;
    let lower = cont ? -Infinity : lim?.lower ?? -Math.PI, upper = cont ? Infinity : lim?.upper ?? Math.PI;
    if (j.type === "fixed") lower = upper = 0;
    const vUrdf = lim?.velocity && lim.velocity > 0 ? lim.velocity : 2;
    const velocity = Math.min(vUrdf, s?.speed_rad_s && s.speed_rad_s > 0 ? s.speed_rad_s : Infinity);
    return {
      name: j.name, type: j.type, index, parent: link.get(j.parent)!, child: link.get(j.child)!,
      origin: fromXyzRpy(j.origin.xyz, j.origin.rpy), axis: unit(j.axis ?? [0, 0, 1]),
      lower, upper, velocity, peak: s?.peak_nm ?? s?.rated_nm ?? lim?.effort ?? Infinity, required: s?.required_nm ?? 0,
      passive: !!j.passive, mimic: null,
    };
  });
  const joint = new Map(joints.map((j) => [j.name, j.index]));
  order.forEach((j, i) => {
    if (j.mimic && joint.has(j.mimic.joint)) joints[i].mimic = { leader: joint.get(j.mimic.joint)!, mult: j.mimic.multiplier ?? 1, offset: j.mimic.offset ?? 0 };
  });
  const parentJoint = new Int32Array(links.length).fill(-1);
  for (const j of joints) parentJoint[j.child] = j.index;
  // in the order the robot file lists them (what a CSV's columns and a JointTrajectory's names follow)
  const filed = new Map(spec.joints.map((j, k) => [j.name, k]));
  const free = joints.filter((j) => j.type !== "fixed" && !j.mimic).map((j) => j.index).sort((a, b) => filed.get(joints[a].name)! - filed.get(joints[b].name)!);
  const actuated = free.filter((i) => !joints[i].passive);
  const cache = new Map<number, Set<number>>();
  const childJoints = new Map<number, KJoint[]>();
  for (const j of joints) { if (!childJoints.has(j.parent)) childJoints.set(j.parent, []); childJoints.get(j.parent)!.push(j); }
  const below = (l: number) => {
    let s = cache.get(l); if (s) return s;
    s = new Set([l]); const st = [l];
    while (st.length) for (const j of childJoints.get(st.pop()!) ?? []) if (!s.has(j.child)) { s.add(j.child); st.push(j.child); }
    cache.set(l, s); return s;
  };
  return { spec, links, link, joints, joint, parentJoint, root, free, actuated, below };
}

/** joint values by name -> a vector over model.joints (mimic joints filled from their leaders, values clamped to limits) */
export function qVector(m: Model, values: Record<string, number> = {}): Float64Array {
  const q = new Float64Array(m.joints.length);
  for (const j of m.joints) if (values[j.name] !== undefined && j.type !== "fixed") q[j.index] = values[j.name];
  return resolve(m, q);
}
export function resolve(m: Model, q: Float64Array): Float64Array {
  for (const j of m.joints) {
    if (j.mimic) q[j.index] = j.mimic.mult * q[j.mimic.leader] + j.mimic.offset;
    else if (j.type === "fixed") q[j.index] = 0;
  }
  return q;
}
export const qRecord = (m: Model, q: Float64Array, which: number[] = m.free) => Object.fromEntries(which.map((i) => [m.joints[i].name, q[i]]));
export const limitOf = (j: KJoint, v: number) => (v < j.lower ? j.lower : v > j.upper ? j.upper : v);

const tmpA = new Float64Array(12), tmpM = new Float64Array(12);
/** world transform of every link (12 numbers each, link order), base pose applied at the root */
export function fk(m: Model, q: Float64Array, base: T34 = ident(), out: Float64Array = new Float64Array(12 * m.links.length)): Float64Array {
  out.set(base, 12 * m.root);
  for (const j of m.joints) {
    mulInto(tmpA, out, j.origin, 12 * j.parent, 0, 0);
    const v = q[j.index];
    if (j.type === "revolute" || j.type === "continuous") { axisAngle(j.axis, v, tmpM); mulInto(out, tmpA, tmpM, 0, 0, 12 * j.child); }
    else if (j.type === "prismatic") {
      for (let k = 0; k < 12; k++) out[12 * j.child + k] = tmpA[k];
      out[12 * j.child + 3] += (tmpA[0] * j.axis[0] + tmpA[1] * j.axis[1] + tmpA[2] * j.axis[2]) * v;
      out[12 * j.child + 7] += (tmpA[4] * j.axis[0] + tmpA[5] * j.axis[1] + tmpA[6] * j.axis[2]) * v;
      out[12 * j.child + 11] += (tmpA[8] * j.axis[0] + tmpA[9] * j.axis[1] + tmpA[10] * j.axis[2]) * v;
    } else for (let k = 0; k < 12; k++) out[12 * j.child + k] = tmpA[k];
  }
  return out;
}
export const linkT = (W: Float64Array, l: number) => W.subarray(12 * l, 12 * l + 12) as T34;

/** joint axis (world) and a point on it, from a world FK result */
export function jointFrame(m: Model, W: Float64Array, j: KJoint): { p: V3; a: V3 } {
  const o = 12 * j.child, a = j.axis;
  return { p: [W[o + 3], W[o + 7], W[o + 11]], a: [W[o] * a[0] + W[o + 1] * a[1] + W[o + 2] * a[2], W[o + 4] * a[0] + W[o + 5] * a[1] + W[o + 6] * a[2], W[o + 8] * a[0] + W[o + 9] * a[1] + W[o + 10] * a[2]] };
}

/** the joints from the root to a link, root first */
export function chain(m: Model, l: number): number[] {
  const out: number[] = [];
  for (let j = m.parentJoint[l]; j >= 0; j = m.parentJoint[m.joints[j].parent]) out.unshift(j);
  return out;
}

/** a link's centre of mass in its own frame */
export function linkCom(l: Link): V3 {
  const g = l.geometry as { type: string; centroid?: number[] };
  const c = g.type === "mesh" && g.centroid ? g.centroid : [0, 0, 0];
  return apply(fromXyzRpy(l.origin.xyz, l.origin.rpy), c);
}

/** local bounding box of a link's geometry (collision geometry first), link frame */
export function linkBox(l: Link): { min: V3; max: V3 } | null {
  const g = (l.collision ?? l.geometry) as any;
  let lo: V3, hi: V3;
  if (g.type === "mesh") { const s = g.scale ?? [1, 1, 1]; lo = [g.bbox.min[0] * s[0], g.bbox.min[1] * s[1], g.bbox.min[2] * s[2]]; hi = [g.bbox.max[0] * s[0], g.bbox.max[1] * s[1], g.bbox.max[2] * s[2]]; }
  else if (g.type === "box") { lo = g.size.map((x: number) => -x / 2); hi = g.size.map((x: number) => x / 2); }
  else if (g.type === "sphere") { lo = [-g.radius, -g.radius, -g.radius]; hi = [g.radius, g.radius, g.radius]; }
  else if (g.type === "cylinder" || g.type === "capsule") { const h = g.length / 2 + (g.type === "capsule" ? g.radius : 0); lo = [-g.radius, -g.radius, -h]; hi = [g.radius, g.radius, h]; }
  else return null;
  const T = fromXyzRpy(l.origin.xyz, l.origin.rpy), mn: V3 = [Infinity, Infinity, Infinity], mx: V3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
    const p = apply(T, [x, y, z]); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  }
  return { min: mn, max: mx };
}

/** lowest world z of every link's box: where the floor is for a robot standing in this pose */
export function lowestZ(m: Model, W: Float64Array, which?: Iterable<number>): number {
  let z = Infinity;
  for (const i of which ?? m.links.keys()) {
    const b = linkBox(m.spec.links[i]); if (!b) continue;
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const zz of [b.min[2], b.max[2]]) z = Math.min(z, apply(W, [x, y, zz], 12 * i)[2]);
  }
  return z;
}
