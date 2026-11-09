// Will it tip over? The robot stands on its lowest points (wheels touch at the bottom of their rim, other parts at the
// corners of their bodies); its centre of mass must lie over the polygon those points span. The margin is the distance
// from the centre of mass, seen from above, to the nearest edge of that polygon; the tipping angle is how far the floor
// could tilt towards that edge before the robot goes over. Checked at the zero pose and the poses of the torque check.
import type { RobotSpecification, Link, Vec3 } from "@ttr/robot-schema";
import { CATALOG } from "@ttr/parts";
import { worldFrames, poseMat, mul, apply, rotate, unit, kindOf, type M4 } from "./edit.ts";

export interface Stability {
  /** centre of mass inside the support polygon by this much (mm); negative: outside, the robot falls */
  margin_mm: number;
  /** floor tilt (deg) towards the nearest edge before it tips */
  tip_deg: number;
  com_m: Vec3;
  /** support polygon, world xy (m), counter-clockwise */
  support: [number, number][];
  ground_z: number;
  /** the pose (joint values) with the smallest margin */
  worst_pose: Record<string, number>;
  /** stands on wheels or feet (free to tip), or is a fixed machine meant to be bolted down */
  free_standing: boolean;
}

function localBox(l: Link): { min: Vec3; max: Vec3 } | null {
  const g = l.geometry;
  if (g.type === "mesh") { const s = g.scale ?? [1, 1, 1]; return { min: g.bbox.min.map((x, i) => x * s[i]) as Vec3, max: g.bbox.max.map((x, i) => x * s[i]) as Vec3 }; }
  if (g.type === "box") return { min: g.size.map((x) => -x / 2) as Vec3, max: g.size.map((x) => x / 2) as Vec3 };
  if (g.type === "cylinder" || g.type === "capsule") { const h = g.length / 2 + (g.type === "capsule" ? g.radius : 0); return { min: [-g.radius, -g.radius, -h], max: [g.radius, g.radius, h] }; }
  if (g.type === "sphere") return { min: [-g.radius, -g.radius, -g.radius], max: [g.radius, g.radius, g.radius] };
  return null;
}
/** Is this link round about its local z (a wheel, roller or ball), so it touches the floor at one line, not a box? */
function roundness(l: Link): "wheel" | "ball" | null {
  const k = kindOf(l), g = l.geometry;
  if (g.type === "sphere") return "ball";
  // a ball caster's housing is not round: its ball (a sphere link, or the housing's bottom) is what touches
  if (k.key && CATALOG[k.key]?.category === "wheel") return k.key.startsWith("steel_ball") ? "ball" : k.key.includes("caster") ? null : "wheel";
  if (l.role === "wheel" || l.role === "caster") return "wheel";
  return null;
}

/** Lowest points of every body at configuration q (world, m). */
function contactCandidates(spec: RobotSpecification, q: Record<string, number>): Vec3[] {
  const W = worldFrames(spec, q), pts: Vec3[] = [];
  for (const l of spec.links) {
    const F = W.get(l.name), b = localBox(l); if (!F || !b) continue;
    if (l.role === "frame" || l.role === "wearer") continue;
    const T: M4 = mul(F, poseMat(l.origin)), round = roundness(l);
    const c: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    if (round) {
      const centre = apply(T, c), r = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2;
      if (round === "ball") { pts.push([centre[0], centre[1], centre[2] - r]); continue; }
      // rim point lowest in the world: straight down, with the part of "down" along the axle removed
      const ax = unit(rotate(T, [0, 0, 1])), d: Vec3 = [-ax[0] * -ax[2], -ax[1] * -ax[2], -1 - ax[2] * -ax[2]];
      const n = Math.hypot(...d);
      if (n < 1e-6) { pts.push([centre[0], centre[1], centre[2] - (b.max[2] - b.min[2]) / 2]); continue; }
      for (const s of [-1, 1]) {
        const half = (b.max[2] - b.min[2]) / 2 * s;
        pts.push([centre[0] + ax[0] * half + (d[0] / n) * r, centre[1] + ax[1] * half + (d[1] / n) * r, centre[2] + ax[2] * half + (d[2] / n) * r]);
      }
      continue;
    }
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) pts.push(apply(T, [x, y, z]));
  }
  return pts;
}
function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], hi: [number, number][] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 1e-12) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
/** Signed distance (m) from p to the polygon's boundary: positive inside. A line or point support has no inside. */
function inside(poly: [number, number][], p: [number, number]): number {
  if (poly.length < 3) { const d = poly.length ? Math.min(...poly.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1]))) : 1; return -Math.max(d, 1e-4); }
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
    m = Math.min(m, (ex * (p[1] - a[1]) - ey * (p[0] - a[0])) / L);   // counter-clockwise: left of every edge is inside
  }
  return m;
}
function comAt(spec: RobotSpecification, q: Record<string, number>): Vec3 {
  const W = worldFrames(spec, q); let m = 0; const c: Vec3 = [0, 0, 0];
  for (const l of spec.links) {
    const F = W.get(l.name); if (!F) continue;
    const g = l.geometry, local: Vec3 = g.type === "mesh" && g.centroid ? g.centroid : [0, 0, 0];
    const p = apply(mul(F, poseMat(l.origin)), local);
    for (let i = 0; i < 3; i++) c[i] += p[i] * l.mass; m += l.mass;
  }
  return c.map((x) => x / Math.max(m, 1e-9)) as Vec3;
}

/** Stability at each pose; the worst one is reported. */
export function stability(spec: RobotSpecification, poses: Record<string, number>[] = [{}]): Stability | null {
  if (!spec.links.length) return null;
  const family = (spec.metadata as { design?: { family?: string } }).design?.family ?? "";
  // a wearable is balanced by its wearer, an arm or SCARA is bolted down; wheeled and walking robots stand on their own
  const free = !/mark43|exo|suit|scara|arm|gripper/.test(family) && (spec.links.some((l) => roundness(l)) || /mobile|legged|quadruped|hexapod|humanoid|walle|eva|baymax|car|rover|mech/.test(family));
  let worst: Stability | null = null;
  for (const q of poses) {
    const pts = contactCandidates(spec, q); if (!pts.length) continue;
    const ground = Math.min(...pts.map((p) => p[2]));
    const touching = pts.filter((p) => p[2] < ground + 0.003).map((p) => [p[0], p[1]] as [number, number]);
    const poly = hull(touching), com = comAt(spec, q), margin = inside(poly, [com[0], com[1]]);
    const h = Math.max(com[2] - ground, 1e-4);
    const s: Stability = { margin_mm: +(margin * 1000).toFixed(1), tip_deg: +((Math.atan2(margin, h) * 180) / Math.PI).toFixed(1), com_m: com.map((x) => +x.toFixed(4)) as Vec3,
      support: poly.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)] as [number, number]), ground_z: +ground.toFixed(4), worst_pose: q, free_standing: free };
    if (!worst || s.margin_mm < worst.margin_mm) worst = s;
  }
  return worst;
}
