// Rays against triangle meshes (what trimesh.ray gives the Python reference): a bounding volume hierarchy over the triangles,
// every hit along a ray, nearest first.
import type { TriMesh } from "./mc.ts";

export type P3 = [number, number, number];
interface Node { lo: P3; hi: P3; a: number; b: number; l: number; r: number; }

export class Rays {
  private tri: Uint32Array; private v: Float64Array; private nodes: Node[] = []; private order: Uint32Array;
  /** one mesh made of many: their triangles together */
  constructor(meshes: TriMesh[]) {
    let nv = 0, nf = 0; for (const m of meshes) { nv += m.v.length; nf += m.f.length; }
    this.v = new Float64Array(nv); this.tri = new Uint32Array(nf);
    let ov = 0, of = 0;
    for (const m of meshes) { this.v.set(m.v, ov); for (let i = 0; i < m.f.length; i++) this.tri[of + i] = m.f[i] + ov / 3; ov += m.v.length; of += m.f.length; }
    const n = nf / 3, c = new Float64Array(n * 3);
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) c[t * 3 + k] = (this.v[this.tri[t * 3] * 3 + k] + this.v[this.tri[t * 3 + 1] * 3 + k] + this.v[this.tri[t * 3 + 2] * 3 + k]) / 3;
    this.order = new Uint32Array(n); for (let i = 0; i < n; i++) this.order[i] = i;
    if (n) this.build(0, n, c);
  }
  private box(a: number, b: number): [P3, P3] {
    const lo: P3 = [Infinity, Infinity, Infinity], hi: P3 = [-Infinity, -Infinity, -Infinity];
    for (let i = a; i < b; i++) { const t = this.order[i]; for (let q = 0; q < 3; q++) { const p = this.tri[t * 3 + q] * 3; for (let k = 0; k < 3; k++) { const x = this.v[p + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; } } }
    return [lo, hi];
  }
  private build(a: number, b: number, c: Float64Array): number {
    const [lo, hi] = this.box(a, b), id = this.nodes.length, node: Node = { lo, hi, a, b, l: -1, r: -1 };
    this.nodes.push(node);
    if (b - a <= 8) return id;
    const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], ax = ext[0] > ext[1] ? (ext[0] > ext[2] ? 0 : 2) : ext[1] > ext[2] ? 1 : 2;
    const part = this.order.subarray(a, b), keys = Array.from(part).sort((x, y) => c[x * 3 + ax] - c[y * 3 + ax]);
    part.set(keys);
    const m = (a + b) >> 1;
    node.l = this.build(a, m, c); node.r = this.build(m, b, c);
    return id;
  }
  /** every hit of the ray O + t D (t > 0): (t, triangle, point), nearest first */
  hits(O: P3, D: P3): { t: number; tri: number; p: P3 }[] {
    const out: { t: number; tri: number; p: P3 }[] = []; if (!this.nodes.length) return out;
    const inv = [1 / D[0], 1 / D[1], 1 / D[2]], stack = [0], v = this.v;
    while (stack.length) {
      const n = this.nodes[stack.pop()!];
      let t0 = -Infinity, t1 = Infinity;
      for (let k = 0; k < 3; k++) {
        let a = (n.lo[k] - O[k]) * inv[k], b = (n.hi[k] - O[k]) * inv[k];
        if (Number.isNaN(a) || Number.isNaN(b)) { if (O[k] < n.lo[k] || O[k] > n.hi[k]) { t0 = Infinity; break; } continue; }
        if (a > b) { const x = a; a = b; b = x; }
        if (a > t0) t0 = a; if (b < t1) t1 = b;
      }
      if (t0 > t1 + 1e-9 || t1 < 0) continue;
      if (n.l >= 0) { stack.push(n.l, n.r); continue; }
      for (let i = n.a; i < n.b; i++) {
        const t = this.order[i], p0 = this.tri[t * 3] * 3, p1 = this.tri[t * 3 + 1] * 3, p2 = this.tri[t * 3 + 2] * 3;
        // Moller-Trumbore
        const e1 = [v[p1] - v[p0], v[p1 + 1] - v[p0 + 1], v[p1 + 2] - v[p0 + 2]], e2 = [v[p2] - v[p0], v[p2 + 1] - v[p0 + 1], v[p2 + 2] - v[p0 + 2]];
        const h = [D[1] * e2[2] - D[2] * e2[1], D[2] * e2[0] - D[0] * e2[2], D[0] * e2[1] - D[1] * e2[0]], det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
        if (Math.abs(det) < 1e-12) continue;
        const f = 1 / det, s = [O[0] - v[p0], O[1] - v[p0 + 1], O[2] - v[p0 + 2]], u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
        if (u < 0 || u > 1) continue;
        const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], w = f * (D[0] * q[0] + D[1] * q[1] + D[2] * q[2]);
        if (w < 0 || u + w > 1) continue;
        const tt = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]);
        if (tt > 1e-9) out.push({ t: tt, tri: t, p: [O[0] + D[0] * tt, O[1] + D[1] * tt, O[2] + D[2] * tt] });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }
  /** a triangle's unit normal (right-handed winding) */
  normal(t: number): P3 {
    const v = this.v, p0 = this.tri[t * 3] * 3, p1 = this.tri[t * 3 + 1] * 3, p2 = this.tri[t * 3 + 2] * 3;
    const a = [v[p1] - v[p0], v[p1 + 1] - v[p0 + 1], v[p1 + 2] - v[p0 + 2]], b = [v[p2] - v[p0], v[p2 + 1] - v[p0 + 1], v[p2 + 2] - v[p0 + 2]];
    const n: P3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  }
}
