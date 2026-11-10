// The robot at its home pose as a grid of small cubes (millimetres, world frame), for routing cables through free space.
//   A cube is blocked if any surface of a solid passes through it or its centre is inside a solid: a cube that is free lies
//   wholly outside every solid, so a point in it is clear of them. Bought parts are their body boxes, each with its own id,
//   so a wire may leave the part it plugs into. `d` is the distance of each cube from the nearest blocked one, in cubes
//   (Chebyshev, capped): a point in a cube with d = n is at least (n - 1) cubes from every solid.
//   Search: A* over free cubes (26 neighbours, no squeezing through a diagonal) with a cost that grows away from the
//   surfaces, so a cable lies along the parts instead of crossing open air; then the path is pulled straight wherever the
//   straight line is as clear and no dearer.
// Only +, -, *, / and sqrt decide a route (the same in every JavaScript engine), so a browser and Node route alike.
import type { V3 } from "./geom.ts";

export interface Box { min: V3; max: V3; }
const DCAP = 8;
const NB: [number, number, number, number][] = [];
for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) NB.push([a, b, c, Math.sqrt(a * a + b * b + c * c)]);

export class Grid {
  s: number; o: V3; nx: number; ny: number; nz: number;
  /** 0 free, 1 a printed or fabricated solid, 2.. a bought part (id) */
  occ: Uint8Array; d: Uint8Array;
  constructor(lo: V3, hi: V3, s: number) {
    this.s = s; this.o = lo;
    this.nx = Math.max(1, Math.ceil((hi[0] - lo[0]) / s)); this.ny = Math.max(1, Math.ceil((hi[1] - lo[1]) / s)); this.nz = Math.max(1, Math.ceil((hi[2] - lo[2]) / s));
    this.occ = new Uint8Array(this.nx * this.ny * this.nz); this.d = new Uint8Array(0);
  }
  ix(p: V3): [number, number, number] { return [Math.floor((p[0] - this.o[0]) / this.s), Math.floor((p[1] - this.o[1]) / this.s), Math.floor((p[2] - this.o[2]) / this.s)]; }
  inb(i: number, j: number, k: number) { return i >= 0 && j >= 0 && k >= 0 && i < this.nx && j < this.ny && k < this.nz; }
  id(i: number, j: number, k: number) { return i + this.nx * (j + this.ny * k); }
  centre(i: number, j: number, k: number): V3 { return [this.o[0] + (i + 0.5) * this.s, this.o[1] + (j + 0.5) * this.s, this.o[2] + (k + 0.5) * this.s]; }
  /** what is at a point: 0 free (also outside the grid) */
  at(p: V3): number { const [i, j, k] = this.ix(p); return this.inb(i, j, k) ? this.occ[this.id(i, j, k)] : 0; }
  /** clearance at a point, in cubes (outside the grid: far) */
  dist(p: V3): number { const [i, j, k] = this.ix(p); return this.inb(i, j, k) ? this.d[this.id(i, j, k)] : DCAP; }
  private mark(p0: number, p1: number, p2: number, v: number) {
    const i = Math.floor((p0 - this.o[0]) / this.s), j = Math.floor((p1 - this.o[1]) / this.s), k = Math.floor((p2 - this.o[2]) / this.s);
    if (i >= 0 && j >= 0 && k >= 0 && i < this.nx && j < this.ny && k < this.nz) { const n = i + this.nx * (j + this.ny * k); if (this.occ[n] !== 1) this.occ[n] = v; }
  }
  /** A closed triangle mesh (9 numbers a triangle, world mm): every cube its surface touches and every cube whose centre is inside. */
  addMesh(tri: Float64Array | number[], v = 1) {
    const s = this.s, h = s / 3, { nx, ny, nz, o } = this;
    const cols = new Map<number, number[]>();
    // centres are nudged off the lattice so a ray never runs exactly along an edge shared by two triangles
    const ey = 0.000137 * s, ez = 0.000211 * s;
    for (let t = 0; t < tri.length; t += 9) {
      const ax = tri[t], ay = tri[t + 1], az = tri[t + 2], bx = tri[t + 3], by = tri[t + 4], bz = tri[t + 5], cx = tri[t + 6], cy = tri[t + 7], cz = tri[t + 8];
      // surface: points a third of a cube apart all over the triangle, in rows parallel to its longest edge
      const lab = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2), lac = Math.sqrt((cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2), lbc = Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2);
      // P, Q the ends of the longest edge, A2 the corner opposite
      let px = ax, py = ay, pz = az, qx = bx, qy = by, qz = bz, ox = cx, oy = cy, oz = cz, le = lab;
      if (lac >= lab && lac >= lbc) { qx = cx; qy = cy; qz = cz; ox = bx; oy = by; oz = bz; le = lac; }
      else if (lbc >= lab && lbc >= lac) { px = bx; py = by; pz = bz; qx = cx; qy = cy; qz = cz; ox = ax; oy = ay; oz = az; le = lbc; }
      const rows = Math.max(1, Math.ceil(Math.min(lab, lac, lbc) / h));
      for (let r = 0; r <= rows; r++) {
        const t = r / rows, x0 = px + (ox - px) * t, y0 = py + (oy - py) * t, z0 = pz + (oz - pz) * t, x1 = qx + (ox - qx) * t, y1 = qy + (oy - qy) * t, z1 = qz + (oz - qz) * t;
        const m = Math.max(1, Math.ceil((le * (1 - t)) / h));
        for (let w = 0; w <= m; w++) { const fw = w / m; this.mark(x0 + (x1 - x0) * fw, y0 + (y1 - y0) * fw, z0 + (z1 - z0) * fw, v); }
      }
      // inside: where the rays along x through the cube centres cross this triangle
      const den = (by - ay) * (cz - az) - (cy - ay) * (bz - az);
      if (Math.abs(den) < 1e-12) continue;
      const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - o[1]) / s - 0.5)), j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - o[1]) / s));
      const k0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - o[2]) / s - 0.5)), k1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - o[2]) / s));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
        const y = o[1] + (j + 0.5) * s + ey, z = o[2] + (k + 0.5) * s + ez;
        const u = ((y - ay) * (cz - az) - (cy - ay) * (z - az)) / den, w = ((by - ay) * (z - az) - (y - ay) * (bz - az)) / den;
        if (u < 0 || w < 0 || u + w > 1) continue;
        const key = j + ny * k; let list = cols.get(key); if (!list) { list = []; cols.set(key, list); }
        list.push(ax + (bx - ax) * u + (cx - ax) * w);
      }
    }
    for (const [key, xs] of cols) {
      xs.sort((a, b) => a - b);
      const j = key % ny, k = (key - j) / ny, row = nx * (j + ny * k);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const i0 = Math.max(0, Math.ceil((xs[q] - o[0]) / s - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - o[0]) / s - 0.5));
        for (let i = i0; i <= i1; i++) if (this.occ[row + i] !== 1) this.occ[row + i] = v;
      }
    }
  }
  /** A box in a frame (R columns are its axes, p its origin, world mm): every cube it touches. */
  addBox(R: number[][], p: V3, min: V3, max: V3, v: number, grow = 0) {
    const s = this.s, c = [0, 1, 2].map((a) => (min[a] + max[a]) / 2), hl = [0, 1, 2].map((a) => (max[a] - min[a]) / 2 + grow + (s / 2) * (Math.abs(R[0][a]) + Math.abs(R[1][a]) + Math.abs(R[2][a])));
    const wc: V3 = [0, 1, 2].map((r) => R[r][0] * c[0] + R[r][1] * c[1] + R[r][2] * c[2] + p[r]) as V3;
    const ext = [0, 1, 2].map((r) => Math.abs(R[r][0]) * hl[0] + Math.abs(R[r][1]) * hl[1] + Math.abs(R[r][2]) * hl[2]);
    const lo = this.ix([wc[0] - ext[0], wc[1] - ext[1], wc[2] - ext[2]]), hi = this.ix([wc[0] + ext[0], wc[1] + ext[1], wc[2] + ext[2]]);
    for (let k = Math.max(0, lo[2]); k <= Math.min(this.nz - 1, hi[2]); k++) for (let j = Math.max(0, lo[1]); j <= Math.min(this.ny - 1, hi[1]); j++) for (let i = Math.max(0, lo[0]); i <= Math.min(this.nx - 1, hi[0]); i++) {
      const q = this.centre(i, j, k), dx = q[0] - wc[0], dy = q[1] - wc[1], dz = q[2] - wc[2];
      let inside = true;
      for (let a = 0; a < 3 && inside; a++) if (Math.abs(R[0][a] * dx + R[1][a] * dy + R[2][a] * dz) > hl[a]) inside = false;
      if (inside) { const n = this.id(i, j, k); if (this.occ[n] === 0 || v === 1) this.occ[n] = v; }
    }
  }
  /** Is a box (as addBox) clear of everything? */
  boxFree(R: number[][], p: V3, min: V3, max: V3, grow = 0): boolean {
    const s = this.s, c = [0, 1, 2].map((a) => (min[a] + max[a]) / 2), hl = [0, 1, 2].map((a) => (max[a] - min[a]) / 2 + grow + (s / 2) * (Math.abs(R[0][a]) + Math.abs(R[1][a]) + Math.abs(R[2][a])));
    const wc: V3 = [0, 1, 2].map((r) => R[r][0] * c[0] + R[r][1] * c[1] + R[r][2] * c[2] + p[r]) as V3;
    const ext = [0, 1, 2].map((r) => Math.abs(R[r][0]) * hl[0] + Math.abs(R[r][1]) * hl[1] + Math.abs(R[r][2]) * hl[2]);
    const lo = this.ix([wc[0] - ext[0], wc[1] - ext[1], wc[2] - ext[2]]), hi = this.ix([wc[0] + ext[0], wc[1] + ext[1], wc[2] + ext[2]]);
    for (let k = Math.max(0, lo[2]); k <= Math.min(this.nz - 1, hi[2]); k++) for (let j = Math.max(0, lo[1]); j <= Math.min(this.ny - 1, hi[1]); j++) for (let i = Math.max(0, lo[0]); i <= Math.min(this.nx - 1, hi[0]); i++) {
      if (!this.occ[this.id(i, j, k)]) continue;
      const q = this.centre(i, j, k), dx = q[0] - wc[0], dy = q[1] - wc[1], dz = q[2] - wc[2];
      let inside = true;
      for (let a = 0; a < 3 && inside; a++) if (Math.abs(R[0][a] * dx + R[1][a] * dy + R[2][a] * dz) > hl[a]) inside = false;
      if (inside) return false;
    }
    return true;
  }
  /** Open a round passage from a to b (a hole the design really has, too small for the cubes to show). */
  carve(a: V3, b: V3, r: number) {
    const L = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2), n = Math.max(1, Math.ceil(L / (this.s / 2))), m = Math.ceil(r / this.s);
    for (let q = 0; q <= n; q++) {
      const c: V3 = [a[0] + ((b[0] - a[0]) * q) / n, a[1] + ((b[1] - a[1]) * q) / n, a[2] + ((b[2] - a[2]) * q) / n], [ci, cj, ck] = this.ix(c);
      for (let k = ck - m; k <= ck + m; k++) for (let j = cj - m; j <= cj + m; j++) for (let i = ci - m; i <= ci + m; i++) {
        if (!this.inb(i, j, k)) continue;
        const p = this.centre(i, j, k); if ((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2 <= r * r) this.occ[this.id(i, j, k)] = 0;
      }
    }
  }
  /** Distance of every cube from the nearest blocked one (two sweeps, exact for the Chebyshev distance up to the cap). */
  finish() {
    const { nx, ny, nz, occ } = this, d = new Uint8Array(occ.length), sy = nx, sz = nx * ny;
    for (let n = 0; n < d.length; n++) d[n] = occ[n] ? 0 : DCAP;
    // the 13 neighbours behind a cube in scan order; the cubes on the grid's faces keep their value (the grid has a free margin)
    const back: number[] = [];
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const off = di + dj * sy + dk * sz; if (off < 0) back.push(off); }
    const b0 = back[0], b1 = back[1], b2 = back[2], b3 = back[3], b4 = back[4], b5 = back[5], b6 = back[6], b7 = back[7], b8 = back[8], b9 = back[9], b10 = back[10], b11 = back[11], b12 = back[12];
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) { let n = 1 + nx * (j + ny * k); for (let i = 1; i < nx - 1; i++, n++) {
      let v = d[n]; if (v <= 1) continue;
      let m = d[n + b0]; if (d[n + b1] < m) m = d[n + b1]; if (d[n + b2] < m) m = d[n + b2]; if (d[n + b3] < m) m = d[n + b3]; if (d[n + b4] < m) m = d[n + b4]; if (d[n + b5] < m) m = d[n + b5]; if (d[n + b6] < m) m = d[n + b6];
      if (d[n + b7] < m) m = d[n + b7]; if (d[n + b8] < m) m = d[n + b8]; if (d[n + b9] < m) m = d[n + b9]; if (d[n + b10] < m) m = d[n + b10]; if (d[n + b11] < m) m = d[n + b11]; if (d[n + b12] < m) m = d[n + b12];
      if (m + 1 < v) { v = m + 1; d[n] = v; }
    } }
    for (let k = nz - 2; k >= 1; k--) for (let j = ny - 2; j >= 1; j--) { let n = nx - 2 + nx * (j + ny * k); for (let i = nx - 2; i >= 1; i--, n--) {
      let v = d[n]; if (v <= 1) continue;
      let m = d[n - b0]; if (d[n - b1] < m) m = d[n - b1]; if (d[n - b2] < m) m = d[n - b2]; if (d[n - b3] < m) m = d[n - b3]; if (d[n - b4] < m) m = d[n - b4]; if (d[n - b5] < m) m = d[n - b5]; if (d[n - b6] < m) m = d[n - b6];
      if (d[n - b7] < m) m = d[n - b7]; if (d[n - b8] < m) m = d[n - b8]; if (d[n - b9] < m) m = d[n - b9]; if (d[n - b10] < m) m = d[n - b10]; if (d[n - b11] < m) m = d[n - b11]; if (d[n - b12] < m) m = d[n - b12];
      if (m + 1 < v) { v = m + 1; d[n] = v; }
    } }
    this.d = d;
  }
  /** The free cube centre nearest to p with clearance `need`, inside `within` if given, no further than maxR mm. */
  nearest(p: V3, need: number, maxR: number, within?: Box, ok?: (q: V3) => boolean): V3 | null {
    const [ci, cj, ck] = this.ix(p), m = Math.ceil(maxR / this.s);
    let best: V3 | null = null, bd = maxR * maxR;
    const tryCell = (i: number, j: number, k: number) => {
      if (!this.inb(i, j, k) || this.d[this.id(i, j, k)] < need) return;
      const q = this.centre(i, j, k);
      if (within && !inBox(within, q)) return;
      const dd = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
      if (dd < bd && (!ok || ok(q))) { bd = dd; best = q; }
    };
    for (let r = 0; r <= m; r++) {
      if (best && (r - 1) * this.s * ((r - 1) * this.s) > bd) break;
      // the shell of cubes r away
      for (let k = ck - r; k <= ck + r; k++) for (let j = cj - r; j <= cj + r; j++) {
        if (Math.abs(k - ck) === r || Math.abs(j - cj) === r) for (let i = ci - r; i <= ci + r; i++) tryCell(i, j, k);
        else { tryCell(ci - r, j, k); if (r) tryCell(ci + r, j, k); }
      }
    }
    return best;
  }
  /** cost of a millimetre at clearance d: dearer away from the surfaces */
  private rate(d: number, need: number) { const air = d - need - 1; return 1 + (air > 0 ? Math.min(air, 4) * 0.15 : 0); }
  /** Is the straight line a-b clear to `need`? Returns its cost, or -1 if not. */
  line(a: V3, b: V3, need: number, within?: Box): number {
    const L = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2), n = Math.max(1, Math.ceil(L / (this.s / 2)));
    let cost = 0;
    for (let q = 0; q <= n; q++) {
      const p: V3 = [a[0] + ((b[0] - a[0]) * q) / n, a[1] + ((b[1] - a[1]) * q) / n, a[2] + ((b[2] - a[2]) * q) / n];
      const d = this.dist(p); if (d < need || (within && !inBox(within, p))) return -1;
      cost += this.rate(d, need) * (L / (n + 1));
    }
    return cost;
  }
  /**
   * The cheapest way from a to b through cubes with clearance `need` (a and b are free points), as cube centres pulled
   * straight. `within` keeps it inside a box (a compartment). Null if there is none inside the search region.
   */
  path(a: V3, b: V3, need: number, within?: Box, limit = 400000): V3[] | null {
    const direct = this.line(a, b, need, within);
    if (direct >= 0 && direct < 40) return [a, b];
    const s = this.s, A = this.ix(a), B = this.ix(b);
    if (this.pocket(A, B, need, within) || this.pocket(B, A, need, within)) return direct >= 0 ? [a, b] : null;
    for (const margin of [48, 200]) {
      const m = Math.ceil(margin / s);
      const lo = [0, 1, 2].map((q) => Math.max(0, Math.min(A[q], B[q]) - m)), hi = [Math.min(this.nx - 1, Math.max(A[0], B[0]) + m), Math.min(this.ny - 1, Math.max(A[1], B[1]) + m), Math.min(this.nz - 1, Math.max(A[2], B[2]) + m)];
      if ([0, 1, 2].some((q) => A[q] < lo[q] || A[q] > hi[q] || B[q] < lo[q] || B[q] > hi[q])) return direct >= 0 ? [a, b] : null;
      const w = hi[0] - lo[0] + 1, h = hi[1] - lo[1] + 1, dp = hi[2] - lo[2] + 1, N = w * h * dp;
      const whole = lo[0] === 0 && lo[1] === 0 && lo[2] === 0 && hi[0] === this.nx - 1 && hi[1] === this.ny - 1 && hi[2] === this.nz - 1;
      const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
      const loc = (i: number, j: number, k: number) => (i - lo[0]) + w * ((j - lo[1]) + h * (k - lo[2]));
      const pass = (i: number, j: number, k: number) => {
        if (i < lo[0] || j < lo[1] || k < lo[2] || i > hi[0] || j > hi[1] || k > hi[2]) return -1;
        const d = this.d[this.id(i, j, k)]; if (d < need) return -1;
        if (within) { const q = this.centre(i, j, k); if (!inBox(within, q)) return -1; }
        return d;
      };
      const heapN: number[] = [], heapF: number[] = [];
      const push = (n: number, f: number) => { let c = heapN.length; heapN.push(n); heapF.push(f); while (c > 0) { const p = (c - 1) >> 1; if (heapF[p] <= f) break; heapN[c] = heapN[p]; heapF[c] = heapF[p]; c = p; } heapN[c] = n; heapF[c] = f; };
      const pop = () => { const top = heapN[0], n = heapN.pop()!, f = heapF.pop()!; const len = heapN.length; if (len) { let c = 0; for (;;) { let l = 2 * c + 1; if (l >= len) break; if (l + 1 < len && heapF[l + 1] < heapF[l]) l++; if (heapF[l] >= f) break; heapN[c] = heapN[l]; heapF[c] = heapF[l]; c = l; } heapN[c] = n; heapF[c] = f; } return top; };
      // the estimate is weighted: a little dearer than the cheapest way at most, found many times sooner across open air
      const hEst = (i: number, j: number, k: number) => 1.35 * s * Math.sqrt((i - B[0]) ** 2 + (j - B[1]) ** 2 + (k - B[2]) ** 2);
      const start = loc(A[0], A[1], A[2]), goal = loc(B[0], B[1], B[2]);
      g[start] = 0; push(start, hEst(A[0], A[1], A[2]));
      let found = false, popped = 0;
      while (heapN.length) {
        const n = pop(); if (done[n]) continue; done[n] = 1;
        if (n === goal) { found = true; break; }
        if (++popped > limit) break;
        const i = (n % w) + lo[0], j = (Math.floor(n / w) % h) + lo[1], k = Math.floor(n / (w * h)) + lo[2];
        for (const [di, dj, dk, len] of NB) {
          const d = pass(i + di, j + dj, k + dk); if (d < 0) continue;
          // no squeezing diagonally between two blocked cubes
          if (len > 1 && ((di && pass(i + di, j, k) < 0) || (dj && pass(i, j + dj, k) < 0) || (dk && pass(i, j, k + dk) < 0))) continue;
          const m2 = loc(i + di, j + dj, k + dk); if (done[m2]) continue;
          const c = g[n] + len * s * this.rate(d, need);
          if (c < g[m2]) { g[m2] = c; from[m2] = n; push(m2, c + hEst(i + di, j + dj, k + dk)); }
        }
      }
      if (!found) { if (whole) break; continue; }
      const cells: V3[] = [];
      for (let n = goal; n >= 0; n = from[n]) { const i = (n % w) + lo[0], j = (Math.floor(n / w) % h) + lo[1], k = Math.floor(n / (w * h)) + lo[2]; cells.unshift(this.centre(i, j, k)); }
      cells[0] = a; cells[cells.length - 1] = b;
      if (direct >= 0 && direct <= g[goal] * 1.02) return [a, b];
      return this.pull(cells, need, within);
    }
    return direct >= 0 ? [a, b] : null;
  }
  /** Is `from` shut in a small pocket (under 4000 cubes at clearance `need`) that does not hold `to`? Then there is no way, found cheaply. */
  private pocket(from: number[], to: number[], need: number, within?: Box): boolean {
    const { nx, ny, nz } = this, seen = new Set<number>(), q: number[] = [from[0], from[1], from[2]];
    seen.add(this.id(from[0], from[1], from[2]));
    for (let h = 0; h < q.length; h += 3) {
      const i = q[h], j = q[h + 1], k = q[h + 2];
      if (i === to[0] && j === to[1] && k === to[2]) return false;
      if (seen.size > 4000) return false;
      for (const [di, dj, dk, l] of NB) {
        if (l > 1) continue;
        const a = i + di, b = j + dj, c = k + dk; if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) return false;
        const n = this.id(a, b, c); if (seen.has(n) || this.d[n] < need) continue;
        if (within && !inBox(within, this.centre(a, b, c))) continue;
        seen.add(n); q.push(a, b, c);
      }
    }
    return true;
  }
  /** Pull a cube path straight: from each kept point, on to the furthest point the straight line reaches no dearer than the path. */
  pull(pts: V3[], need: number, within?: Box): V3[] {
    const acc = [0];
    for (let i = 1; i < pts.length; i++) { const L = Math.sqrt((pts[i][0] - pts[i - 1][0]) ** 2 + (pts[i][1] - pts[i - 1][1]) ** 2 + (pts[i][2] - pts[i - 1][2]) ** 2); acc.push(acc[i - 1] + L * this.rate(Math.min(this.dist(pts[i]), this.dist(pts[i - 1])), need)); }
    const out: V3[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      for (let q = Math.min(pts.length - 1, i + 400); q > i + 1; q--) { const c = this.line(pts[i], pts[q], need, within); if (c >= 0 && c <= (acc[q] - acc[i]) * 1.03 + 0.5) { j = q; break; } }
      out.push(pts[j]); i = j;
    }
    return out;
  }
}
export const inBox = (b: Box, p: V3, pad = 0) => p[0] >= b.min[0] - pad && p[1] >= b.min[1] - pad && p[2] >= b.min[2] - pad && p[0] <= b.max[0] + pad && p[1] <= b.max[1] + pad && p[2] <= b.max[2] + pad;
