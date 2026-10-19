// Exact interference checks between the solids of a built robot (printed parts as their CSG
// solids, bought parts as their body boxes, contact spheres as spheres) in any configuration.
// Used to set joint limits from geometry and to prove that nothing intersects.
import type { RobotSpecification, Link } from "@ttr/robot-schema";
import { part } from "@ttr/parts";
import { build, evaluate, Manifold, box, fromRt, type Manifold as M, type Program, type Mat4 } from "@ttr/solid";
import { fk, descendants } from "./kin.ts";

type Vec3 = [number, number, number];
/** Solid of a link in its own frame (mm), or null when it has no physical body worth checking. */
function linkSolid(l: Link): M | null {
  const g = l.geometry;
  if (g.type === "sphere") return l.role === "frame" ? null : Manifold.sphere(g.radius * 1000, 32).translate(l.origin.xyz.map((x) => x * 1000) as Vec3);
  if (g.type !== "mesh") return null;
  if (g.part === "printed") return evaluate(JSON.parse(String(g.params!.program)) as Program);
  if (g.part === "component") {
    const key = String(g.params!.key), c = part(key), b = c.bbox_mm!;
    // actuators: the case only; the output face and horn are where the driven link bolts on
    const top = c.category === "actuator" ? Math.min(b.max[2], -0.8) : b.max[2];
    return box(b.min as Vec3, [b.max[0], b.max[1], top]);
  }
  return null;
}

export interface Interference { a: string; b: string; volume_mm3: number; }
export interface ClearanceModel { names: string[]; solids: (M | null)[]; spec: RobotSpecification; }

const toMat = (R: number[][], p: Vec3): Mat4 => fromRt(R, [p[0] * 1000, p[1] * 1000, p[2] * 1000]);

/** Run `fn` with the robot's solids built once (all freed afterwards). */
export function withSolids<T>(spec: RobotSpecification, fn: (m: ClearanceModel) => T): T {
  return build(() => {
    const names = spec.links.map((l) => l.name);
    const solids = spec.links.map(linkSolid);
    return fn({ names, solids, spec });
  });
}

/**
 * Pairs of links whose solids overlap by more than `tol` mm^3 in configuration q.
 * `moving` limits the check to pairs with exactly one link in that set (a sweep); otherwise all pairs.
 */
export function interferences(m: ClearanceModel, q: Record<string, number>, moving?: Set<string>, tol = 2, skip: Set<string> = new Set()): Interference[] {
  const f = fk(m.spec, q);
  const placed: { name: string; s: M; lo: number[]; hi: number[] }[] = [];
  m.names.forEach((n, i) => {
    const s0 = m.solids[i]; if (!s0) return;
    const T = f.link[n]; if (!T) return;
    const s = s0.transform(toMat(T.R, T.p)); const bb = s.boundingBox();
    placed.push({ name: n, s, lo: bb.min as number[], hi: bb.max as number[] });
  });
  const out: Interference[] = [];
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const A = placed[i], B = placed[j];
    if (moving && moving.has(A.name) === moving.has(B.name)) continue;
    if (skip.has(`${A.name}|${B.name}`) || skip.has(`${B.name}|${A.name}`)) continue;
    if (A.lo.some((x, k) => x > B.hi[k] - 0.01) || B.lo.some((x, k) => x > A.hi[k] - 0.01)) continue;
    const v = A.s.intersect(B.s).volume();
    if (v > tol) out.push({ a: A.name, b: B.name, volume_mm3: +v.toFixed(1) });
  }
  return out;
}

/**
 * Collision-free interval of one joint around `q0` (others as in `base`), scanning out to `lo`/`hi`.
 * Returns the last collision-free angle in each direction.
 */
export function freeRange(m: ClearanceModel, joint: string, base: Record<string, number>, lo: number, hi: number, step = 0.04, skip?: Set<string>): [number, number] {
  const j = m.spec.joints.find((x) => x.name === joint)!;
  const moving = descendants(m.spec, j.child);
  const q0 = base[joint] ?? 0, res: number[] = [];
  for (const end of [lo, hi]) {
    let reached = q0; const n = Math.max(1, Math.ceil(Math.abs(end - q0) / step));
    for (let k = 1; k <= n; k++) {
      const q = q0 + ((end - q0) * k) / n;
      if (interferences(m, { ...base, [joint]: q }, moving, 2, skip).length) break;
      reached = q;
    }
    res.push(reached);
  }
  return [res[0], res[1]];
}
