// Exact solids for the armour pack steps, on manifold-3d (WASM): the helpers scripts/pack_armour.py, fit_doors.py and fit_wiring.py
// use, with WASM memory freed by scope. Every Manifold made inside scope() is deleted when it ends, unless keep() hands it out.
import type { TriMesh } from "./mc.ts";

export type P3 = [number, number, number];
/** a 3x4 [R | t], rows */
export type M34 = number[][];
type Wasm = any;
export type Solid = any;

let W: Wasm | undefined;
const scopes: Solid[][] = [];
const track = <T>(x: T): T => {
  const s = scopes[scopes.length - 1];
  if (s) { if (Array.isArray(x)) s.push(...x); else s.push(x); }
  return x;
};
/** Hands the manifold-3d module to the forge (the kernel's own instance) and makes its results freeable. */
export function useManifold(mod: Wasm): void {
  if (W === mod) return;
  W = mod;
  const P = mod.Manifold.prototype;
  for (const k of ["add", "subtract", "intersect", "transform", "translate", "rotate", "scale", "mirror", "simplify", "hull", "decompose", "asOriginal"]) {
    const f = P[k]; if (typeof f !== "function" || f.__tracked) continue;
    const g = function (this: Solid, ...a: unknown[]) { return track(f.apply(this, a)); }; (g as unknown as { __tracked: boolean }).__tracked = true; P[k] = g;
  }
  for (const k of ["union", "compose", "hull", "cube", "cylinder", "sphere", "difference", "intersection"]) {
    const f = mod.Manifold[k]; if (typeof f !== "function" || f.__tracked) continue;
    const g = (...a: unknown[]) => track(f.apply(mod.Manifold, a)); (g as unknown as { __tracked: boolean }).__tracked = true; mod.Manifold[k] = g;
  }
}
const M = (): Wasm => { if (!W) throw new Error("the forge needs manifold-3d: call useManifold() first"); return W; };

const kept: Set<Solid>[] = [];
/** Runs fn; every solid made inside is freed at the end except what it returns (a solid or an array of them) and what it keep()s. */
export function scope<T>(fn: () => T): T {
  scopes.push([]); kept.push(new Set());
  let out: T | undefined;
  try { out = fn(); return out; }
  finally {
    const mine = scopes.pop()!, keepers = kept.pop()!;
    for (const x of Array.isArray(out) ? out : [out]) keepers.add(x);
    for (const s of mine) if (!keepers.has(s)) { try { s.delete(); } catch { /* freed */ } }
    for (const s of keepers) if (mine.includes(s)) track(s);
  }
}
/** scope() for async work: nothing else may run forge code while it awaits (the forge runs one job at a time) */
export async function scopeAsync<T>(fn: () => Promise<T>): Promise<T> {
  scopes.push([]); kept.push(new Set());
  let out: T | undefined;
  try { out = await fn(); return out; }
  finally {
    const mine = scopes.pop()!, keepers = kept.pop()!;
    for (const x of Array.isArray(out) ? out : [out]) keepers.add(x);
    for (const s of mine) if (!keepers.has(s)) { try { s.delete(); } catch { /* freed */ } }
    for (const s of keepers) if (mine.includes(s)) track(s);
  }
}
/** a solid that outlives the scope it is made in */
export const keep = <T extends Solid>(x: T): T => { kept[kept.length - 1]?.add(x); return x; };
/** frees a solid made outside any scope */
export const free = (...xs: Solid[]) => { for (const x of xs) try { x?.delete(); } catch { /* freed */ } };

export function asSolid(m: TriMesh): Solid {
  const W_ = M(), mesh = new W_.Mesh({ numProp: 3, vertProperties: Float32Array.from(m.v), triVerts: Uint32Array.from(m.f) });
  return track(new W_.Manifold(mesh));
}
export function asMesh(x: Solid): TriMesh {
  const g = x.getMesh(), n = g.numProp, vp = g.vertProperties as Float32Array, nv = vp.length / n, v = new Float64Array(nv * 3);
  for (let i = 0; i < nv; i++) { v[i * 3] = vp[i * n]; v[i * 3 + 1] = vp[i * n + 1]; v[i * 3 + 2] = vp[i * n + 2]; }
  return { v, f: Uint32Array.from(g.triVerts) };
}
export const mat4 = (R: M34): number[] => [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, R[0][3], R[1][3], R[2][3], 1];
export const place = (R: M34, s: Solid): Solid => s.transform(mat4(R));
export const union = (xs: Solid[]): Solid => (xs.length ? M().Manifold.union(xs) : M().Manifold.union([]));
export const compose = (xs: Solid[]): Solid => M().Manifold.compose(xs);
export const hull = (pts: P3[]): Solid => M().Manifold.hull(pts);
export const cube = (size: P3): Solid => M().Manifold.cube(size, false);
export const cylinder = (h: number, r: number, seg: number): Solid => M().Manifold.cylinder(h, r, r, seg, false);
export function bbox(x: Solid): [P3, P3] { const b = x.boundingBox(); return [[b.min[0], b.min[1], b.min[2]], [b.max[0], b.max[1], b.max[2]]]; }
export const overlaps = (a: [P3, P3], b: [P3, P3]) => a[0][0] < b[1][0] && a[0][1] < b[1][1] && a[0][2] < b[1][2] && b[0][0] < a[1][0] && b[0][1] < a[1][1] && b[0][2] < a[1][2];

/** rotation by `ang` about the axis through o along e, as 3x4 rows */
export function rot(o: P3, e: P3, ang: number): M34 {
  const l = Math.hypot(e[0], e[1], e[2]), k = [e[0] / l, e[1] / l, e[2] / l], c = Math.cos(ang), s = Math.sin(ang), C = 1 - c;
  const R = [[c + k[0] * k[0] * C, k[0] * k[1] * C - k[2] * s, k[0] * k[2] * C + k[1] * s], [k[1] * k[0] * C + k[2] * s, c + k[1] * k[1] * C, k[1] * k[2] * C - k[0] * s], [k[2] * k[0] * C - k[1] * s, k[2] * k[1] * C + k[0] * s, c + k[2] * k[2] * C]];
  return R.map((r, i) => [...r, o[i] - (r[0] * o[0] + r[1] * o[1] + r[2] * o[2])]);
}
export const turn = (x: Solid, o: P3, e: P3, ang: number): Solid => place(rot(o, e, ang), x);
/** the solid swept through [a0, a1] about the axis (numpy.linspace with max(3, |a1 - a0| / step + 1) stations) */
export function sweep(x: Solid, o: P3, e: P3, a0: number, a1: number, step = 0.05, clip?: [P3, P3]): Solid {
  const n = Math.max(3, Math.floor(Math.abs(a1 - a0) / step) + 1), xs: Solid[] = [];
  for (let i = 0; i < n; i++) xs.push(turn(x, o, e, a0 + ((a1 - a0) * i) / (n - 1)));
  return clipUnion(xs, clip);
}
/** The union of solids, each first cut to `clip` when given: what is subtracted from pieces inside the box is exactly the same, and the
 *  union of the small parts is far quicker than the union of the whole copies. */
export function clipUnion(xs: Solid[], clip?: [P3, P3]): Solid {
  if (!clip) return union(xs);
  const box = cube([clip[1][0] - clip[0][0], clip[1][1] - clip[0][1], clip[1][2] - clip[0][2]]).translate(clip[0]);
  return union(xs.filter((x) => overlaps(bbox(x), clip)).map((x) => x.intersect(box)).filter((x) => !x.isEmpty()));
}
/** the box round some meshes, grown by `pad` */
export function boundsOf(ms: TriMesh[], pad = 1): [P3, P3] {
  const lo: P3 = [Infinity, Infinity, Infinity], hi: P3 = [-Infinity, -Infinity, -Infinity];
  for (const m of ms) { const b = meshBounds(m); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b[0][k] - pad); hi[k] = Math.max(hi[k], b[1][k] + pad); } }
  return [lo, hi];
}
export const linspace = (a: number, b: number, n: number): number[] => (n === 1 ? [a] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1)));

/** per-vertex normals, weighted by the angle at each corner (trimesh's vertex_normals) */
export function vertexNormals(m: TriMesh): Float64Array {
  const n = new Float64Array(m.v.length), v = m.v;
  for (let t = 0; t < m.f.length; t += 3) {
    const id = [m.f[t], m.f[t + 1], m.f[t + 2]], P = id.map((i) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]]);
    const a = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], b = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    const fn = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], fl = Math.hypot(fn[0], fn[1], fn[2]);
    if (!fl) continue;
    for (let q = 0; q < 3; q++) {
      const p = P[q], u = P[(q + 1) % 3], w = P[(q + 2) % 3], e1 = [u[0] - p[0], u[1] - p[1], u[2] - p[2]], e2 = [w[0] - p[0], w[1] - p[1], w[2] - p[2]];
      const cs = (e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2]) / (Math.hypot(e1[0], e1[1], e1[2]) * Math.hypot(e2[0], e2[1], e2[2]) || 1), ang = Math.acos(Math.max(-1, Math.min(1, cs)));
      for (let k = 0; k < 3; k++) n[id[q] * 3 + k] += (fn[k] / fl) * ang;
    }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}
/** the mesh grown along its vertex normals by `by` (a clearance body, not a part) */
export function inflated(m: TriMesh, by: number): Solid {
  const n = vertexNormals(m), v = new Float64Array(m.v.length);
  for (let i = 0; i < v.length; i++) v[i] = m.v[i] + n[i] * by;
  return asSolid({ v, f: m.f });
}
export const bigger = (x: Solid, by: number): Solid => (x.isEmpty() ? x : inflated(asMesh(x), by));
export function biggest(x: Solid): Solid { const cs: Solid[] = x.decompose(); let b = cs[0], bv = -Infinity; for (const c of cs) { const v = c.volume(); if (v > bv) { bv = v; b = c; } } return b; }
/** bodies above `keep` mm3, largest first */
export function bodies(x: Solid, keep: number): Solid[] { return (x.decompose() as Solid[]).map((c) => [c, c.volume()] as [Solid, number]).filter(([, v]) => v > keep).sort((a, b) => b[1] - a[1]).map(([c]) => c); }

export function meshBounds(m: TriMesh): [P3, P3] {
  const lo: P3 = [Infinity, Infinity, Infinity], hi: P3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.v.length; i += 3) for (let a = 0; a < 3; a++) { const x = m.v[i + a]; if (x < lo[a]) lo[a] = x; if (x > hi[a]) hi[a] = x; }
  return [lo, hi];
}
export function meshVolume(m: TriMesh): number {
  let s = 0; const { v, f } = m;
  for (let t = 0; t < f.length; t += 3) { const a = f[t] * 3, b = f[t + 1] * 3, c = f[t + 2] * 3; s += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]); }
  return s / 6;
}
/** trimesh's centroid: the surface's triangle centres weighted by area */
export function meshCentroid(m: TriMesh): P3 {
  const c: P3 = [0, 0, 0]; let A = 0; const { v, f } = m;
  for (let t = 0; t < f.length; t += 3) {
    const a = f[t] * 3, b = f[t + 1] * 3, d = f[t + 2] * 3;
    const u = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]], w = [v[d] - v[a], v[d + 1] - v[a + 1], v[d + 2] - v[a + 2]];
    const ar = 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
    for (let k = 0; k < 3; k++) c[k] += ar * (v[a + k] + v[b + k] + v[d + k]) / 3;
    A += ar;
  }
  return A ? [c[0] / A, c[1] / A, c[2] / A] : [0, 0, 0];
}
/** points of a 3x4 frame (rows) */
export const at = (R: M34, p: P3): P3 => [0, 1, 2].map((i) => R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2] + R[i][3]) as P3;
