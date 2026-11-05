// Exact interference checks between the solids of a built robot (printed parts as their CSG
// solids, bought parts as their body boxes, contact spheres as spheres) in any configuration.
// Used to set joint limits from geometry and to prove that nothing intersects.
import type { RobotSpecification, Link } from "@ttr/robot-schema";
import { part } from "@ttr/parts";
import { build, evaluate, Manifold, box, fromRt, type Manifold as M, type Program, type Mat4 } from "@ttr/solid";
import { fk, descendants } from "./kin.ts";
import { partFiles } from "@ttr/kernel/ready";

type Vec3 = [number, number, number];
/** Solid of a link in its own frame (mm), or null when it has no physical body worth checking. */
function linkSolid(l: Link): M | null {
  const g = l.geometry;
  if (g.type === "sphere") return l.role === "frame" ? null : Manifold.sphere(g.radius * 1000, 32).translate(l.origin.xyz.map((x) => x * 1000) as Vec3);
  if (g.type !== "mesh") return null;
  if (g.part === "printed") return evaluate(JSON.parse(String(g.params!.program)) as Program);
  if (g.part === "cad") {
    // kernel parts: their welded print mesh (mm) as an exact manifold solid
    const m = partFiles(String(g.params!.program)).mesh;
    return Manifold.ofMesh({ numProp: 3, vertProperties: new Float32Array(m.v.flatMap((v) => [v[0] * 1000, v[1] * 1000, v[2] * 1000])), triVerts: new Uint32Array(m.f.flat()) } as never);
  }
  if (g.part === "component") {
    // a part may declare its solid body (e.g. a gear motor without the shaft stubs that pass through its bracket)
    const key = String(g.params!.key), c = part(key), b = (c.specs.body_mm as { min: number[]; max: number[] } | undefined) ?? c.bbox_mm!;
    // actuators: the case only; the output face and horn are where the driven link bolts on
    // wheels are discs about their axle (component z), not their bounding box
    if (c.category === "wheel" && !c.specs.ball_d_mm) { const r = (b.max[0] - b.min[0]) / 2; return Manifold.cylinder(b.max[2] - b.min[2], r, r, 64).translate([(b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2, b.min[2]]); }
    const top = c.category === "actuator" ? Math.min(b.max[2], -0.8) : b.max[2];
    return box(b.min as Vec3, [b.max[0], b.max[1], top]);
  }
  return null;
}

export interface Interference { a: string; b: string; volume_mm3: number; }
export interface ClearanceModel { names: string[]; solids: (M | null)[]; boxes: ({ min: Vec3; max: Vec3 } | null)[]; spec: RobotSpecification; }

const toMat = (R: number[][], p: Vec3): Mat4 => fromRt(R, [p[0] * 1000, p[1] * 1000, p[2] * 1000]);

/** Run `fn` with the robot's solids built once (all freed afterwards). */
export function withSolids<T>(spec: RobotSpecification, fn: (m: ClearanceModel) => T): T {
  return build(() => {
    const names = spec.links.map((l) => l.name);
    const solids = spec.links.map(linkSolid);
    // local boxes once: manifold's boundingBox() leaks wasm memory on every call
    const boxes = solids.map((x) => { if (!x) return null; const b = x.boundingBox(); return { min: [...b.min] as Vec3, max: [...b.max] as Vec3 }; });
    return fn({ names, solids, boxes, spec });
  });
}

/**
 * Pairs of links whose solids overlap by more than `tol` mm^3 in configuration q.
 * `moving` limits the check to pairs with exactly one link in that set (a sweep); otherwise all pairs.
 */
export function interferences(m: ClearanceModel, q: Record<string, number>, moving?: Set<string>, tol = 2, skip: Set<string> = new Set()): Interference[] {
  // transformed copies and intersections are freed per call (sweeps make thousands)
  return build(() => interferencesIn(m, q, moving, tol, skip));
}
function interferencesIn(m: ClearanceModel, q: Record<string, number>, moving: Set<string> | undefined, tol: number, skip: Set<string>): Interference[] {
  const f = fk(m.spec, q);
  const placed: { name: string; s0: M; M4: Mat4; s?: M; lo: number[]; hi: number[] }[] = [];
  m.names.forEach((n, i) => {
    const s0 = m.solids[i]; if (!s0) return;
    const T = f.link[n]; if (!T) return;
    const M4 = toMat(T.R, T.p), b = m.boxes[i]!, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
      const p = [M4[0] * x + M4[4] * y + M4[8] * z + M4[12], M4[1] * x + M4[5] * y + M4[9] * z + M4[13], M4[2] * x + M4[6] * y + M4[10] * z + M4[14]];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    }
    placed.push({ name: n, s0, M4, lo, hi });
  });
  const out: Interference[] = [];
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const A = placed[i], B = placed[j];
    if (moving && moving.has(A.name) === moving.has(B.name)) continue;
    if (skip.has(`${A.name}|${B.name}`) || skip.has(`${B.name}|${A.name}`)) continue;
    if (A.lo.some((x, k) => x > B.hi[k] - 0.01) || B.lo.some((x, k) => x > A.hi[k] - 0.01)) continue;
    // solids are placed lazily: most pairs are rejected by their boxes and never need the transformed copy
    A.s ??= A.s0.transform(A.M4); B.s ??= B.s0.transform(B.M4);
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
