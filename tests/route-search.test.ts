// The harness router's search (Grid.path, packages/design/src/wiring3d/voxel.ts) was rewritten for speed. It must give the very
// path the plain version gave, on any grid: this test keeps the plain version and holds the fast one to it, cube for cube, on
// random grids with blocks, walls with holes, clearances and compartments.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Grid, inBox, type Box } from "../packages/design/src/wiring3d/voxel.ts";
import type { V3 } from "../packages/design/src/wiring3d/geom.ts";

const NB: [number, number, number, number][] = [];
for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) NB.push([a, b, c, Math.sqrt(a * a + b * b + c * c)]);

/** the search as it was before the rewrite (same body, line for line) */
function plainPath(G: Grid, a: V3, b: V3, need: number, within?: Box, limit = 150000): V3[] | null {
  const self = G as any;
  const direct = G.line(a, b, need, within);
  if (direct >= 0 && direct < 40) return [a, b];
  const s = G.s, A = G.ix(a), B = G.ix(b);
  if (self.pocket(A, B, need, within) || self.pocket(B, A, need, within)) return direct >= 0 ? [a, b] : null;
  for (const margin of [48, 200]) {
    const m = Math.ceil(margin / s);
    const lo = [0, 1, 2].map((q) => Math.max(0, Math.min(A[q], B[q]) - m)), hi = [Math.min(G.nx - 1, Math.max(A[0], B[0]) + m), Math.min(G.ny - 1, Math.max(A[1], B[1]) + m), Math.min(G.nz - 1, Math.max(A[2], B[2]) + m)];
    if ([0, 1, 2].some((q) => A[q] < lo[q] || A[q] > hi[q] || B[q] < lo[q] || B[q] > hi[q])) return direct >= 0 ? [a, b] : null;
    const w = hi[0] - lo[0] + 1, h = hi[1] - lo[1] + 1, dp = hi[2] - lo[2] + 1, N = w * h * dp;
    const whole = lo[0] === 0 && lo[1] === 0 && lo[2] === 0 && hi[0] === G.nx - 1 && hi[1] === G.ny - 1 && hi[2] === G.nz - 1;
    const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const loc = (i: number, j: number, k: number) => (i - lo[0]) + w * ((j - lo[1]) + h * (k - lo[2]));
    const pass = (i: number, j: number, k: number) => {
      if (i < lo[0] || j < lo[1] || k < lo[2] || i > hi[0] || j > hi[1] || k > hi[2]) return -1;
      const d = G.d[G.id(i, j, k)]; if (d < need) return -1;
      if (within) { const q = G.centre(i, j, k); if (!inBox(within, q)) return -1; }
      return d;
    };
    const heapN: number[] = [], heapF: number[] = [];
    const push = (n: number, f: number) => { let c = heapN.length; heapN.push(n); heapF.push(f); while (c > 0) { const p = (c - 1) >> 1; if (heapF[p] <= f) break; heapN[c] = heapN[p]; heapF[c] = heapF[p]; c = p; } heapN[c] = n; heapF[c] = f; };
    const pop = () => { const top = heapN[0], n = heapN.pop()!, f = heapF.pop()!; const len = heapN.length; if (len) { let c = 0; for (;;) { let l = 2 * c + 1; if (l >= len) break; if (l + 1 < len && heapF[l + 1] < heapF[l]) l++; if (heapF[l] >= f) break; heapN[c] = heapN[l]; heapF[c] = heapF[l]; c = l; } heapN[c] = n; heapF[c] = f; } return top; };
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
        if (len > 1 && ((di && pass(i + di, j, k) < 0) || (dj && pass(i, j + dj, k) < 0) || (dk && pass(i, j, k + dk) < 0))) continue;
        const m2 = loc(i + di, j + dj, k + dk); if (done[m2]) continue;
        const c = g[n] + len * s * self.rate(d, need);
        if (c < g[m2]) { g[m2] = c; from[m2] = n; push(m2, c + hEst(i + di, j + dj, k + dk)); }
      }
    }
    if (!found) { if (whole) break; continue; }
    const cells: V3[] = [];
    for (let n = goal; n >= 0; n = from[n]) { const i = (n % w) + lo[0], j = (Math.floor(n / w) % h) + lo[1], k = Math.floor(n / (w * h)) + lo[2]; cells.unshift(G.centre(i, j, k)); }
    cells[0] = a; cells[cells.length - 1] = b;
    if (direct >= 0 && direct <= g[goal] * 1.02) return [a, b];
    return G.pull(cells, need, within);
  }
  return direct >= 0 ? [a, b] : null;
}

/** a seeded random number generator, so a failure can be replayed */
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

test("the fast route search finds the same path as the plain one, cube for cube", () => {
  let searches = 0, routed = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const r = rng(seed), s = [2, 2.5, 3, 4][seed % 4], size = 120 + Math.floor(r() * 160);
    const G = new Grid([0, 0, 0], [size, size * (0.6 + r() * 0.5), size * (0.5 + r() * 0.5)], s);
    // blocks, and a wall with a few holes through it (the search must find the holes and squeeze through no diagonal)
    for (let b = 0; b < 6 + seed; b++) {
      const c = [r() * G.nx, r() * G.ny, r() * G.nz].map(Math.floor), e = [1 + r() * 12, 1 + r() * 12, 1 + r() * 12].map(Math.floor);
      for (let k = c[2]; k < Math.min(G.nz, c[2] + e[2]); k++) for (let j = c[1]; j < Math.min(G.ny, c[1] + e[1]); j++) for (let i = c[0]; i < Math.min(G.nx, c[0] + e[0]); i++) G.occ[G.id(i, j, k)] = 1;
    }
    const wx = Math.floor(G.nx / 2);
    for (let k = 0; k < G.nz; k++) for (let j = 0; j < G.ny; j++) if (!((j % 9 < 2 && k % 7 < 2) || r() < 0.002)) G.occ[G.id(wx, j, k)] = 1;
    G.finish();
    for (let q = 0; q < 24; q++) {
      const pt = (): V3 => [r() * size, r() * G.ny * s, r() * G.nz * s];
      let a = pt(), b = pt();
      for (let t = 0; t < 50 && G.dist(a) < 1; t++) a = pt();
      for (let t = 0; t < 50 && G.dist(b) < 1; t++) b = pt();
      const need = 1 + Math.floor(r() * 3);
      const within: Box | undefined = q % 5 === 0 ? { min: [Math.min(a[0], b[0]) - 20, -1, -1], max: [Math.max(a[0], b[0]) + 20, 1e4, 1e4] } : undefined;
      const limit = q % 7 === 0 ? 400 : 150000;
      const want = plainPath(G, a, b, need, within, limit), got = G.path(a, b, need, within, limit);
      assert.deepEqual(got, want, `seed ${seed}, search ${q}`);
      searches++; if (want && want.length > 2) routed++;
    }
  }
  assert.ok(searches >= 240 && routed > 30, `searched ${searches}, ${routed} needed the full search`);
});

import { Router as FastMaze } from "../packages/design/src/circuit/route.ts";
import { Router as PlainMaze } from "./fixtures/circuit-route-plain.ts";
test("the circuit drawings' fast maze router lays the same wires as the plain one", () => {
  let wires = 0, laid = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = rng(seed * 7919), W = 300 + Math.floor(r() * 500), H = 200 + Math.floor(r() * 400), g = 5;
    const fast = new FastMaze(W, H, g), plain = new PlainMaze(W, H, g);
    for (let b = 0; b < 12; b++) { const box = { x: r() * W, y: r() * H, w: 10 + r() * 60, h: 10 + r() * 60 }; fast.block(box, b % 3 === 0); plain.block(box, b % 3 === 0); }
    const pt = (): [number, number] => [Math.round((r() * W) / g) * g, Math.round((r() * H) / g) * g];
    for (let n = 0; n < 40; n++) {
      const a = { at: pt(), out: Math.floor(r() * 4) as 0 | 1 | 2 | 3 }, b = { at: pt(), out: Math.floor(r() * 4) as 0 | 1 | 2 | 3 };
      if (n % 5 === 0) { fast.reserve(a.at, n); plain.reserve(a.at, n); }
      const o = { bend: 4 + (n % 3), cross: 3 + (n % 2), late: n % 4 === 0 ? 0.05 : 0, limit: n % 9 === 0 ? 2000 : undefined };
      const want = plain.route(n, a, b, o), got = fast.route(n, a, b, o);
      assert.deepEqual(got, want, `seed ${seed}, wire ${n}`);
      wires++; if (want) laid++;
    }
    for (const k of ["h", "v", "node"] as const) assert.deepEqual(fast[k], plain[k], `seed ${seed}: the grid each leaves behind`);
  }
  assert.ok(wires === 240 && laid > 100, `${laid}/${wires} laid`);
});
