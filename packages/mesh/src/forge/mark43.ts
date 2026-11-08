// The Mark 43 forged as hard-surface armour, in the browser: a TypeScript port of scripts/forge_mark43.py (the reference, kept as the
// test oracle). Every part is a signed field on a voxel grid: lofted superellipse sections along a bone give the form; plates, grooves
// and bevels are polygons laid on that form and added to the field; colours are painted per voxel. A part is then hollowed to a shell,
// opened to the wearer, split into its moving zones (the mask, the doors) and cut into bed-sized cells, one closed mesh per colour.
//   x forward, y left, z up, mm, floor at 0.
import { atan2, cos, exp, hypot, pow, sin } from "./dmath.ts";
import { gauss3, gradientNorm, maxFilter3, pchip, trilinear, percentile } from "./num.ts";
import { marchingCubes, components, fillHoles, isWatertight, signedVolume, flip, mirrorY, type TriMesh } from "./mc.ts";

export type V3 = [number, number, number];
export const RED = 0, GOLD = 1, STEEL = 2, LENS = 3;
export const NAMES: Record<number, string> = { [RED]: "armour_red", [GOLD]: "armour_gold", [STEEL]: "armour_silver", [LENS]: "lens_glow" };
type Table = number[][];

/** What a prompt may change in the armour itself. Defaults give the reference suit. */
export interface ForgeParams {
  /** voxel size, mm (2 is the reference; 4 is the quick preview) */
  voxel?: number;
  /** girth of every section (1 = reference) */
  bulk?: number;
  /** size of the shoulder pauldrons (1 = reference) */
  shoulder?: number;
  /** "film": the reference panels; "smooth": the raised plates kept, the fine panel lines left out; "heavy": plates stand twice as proud */
  panels?: "film" | "smooth" | "heavy";
}
interface Ctx { v: number; bulk: number; shoulder: number; panels: "film" | "smooth" | "heavy"; }
export const ctxOf = (p: ForgeParams = {}): Ctx => ({ v: p.voxel ?? 2, bulk: p.bulk ?? 1, shoulder: p.shoulder ?? 1, panels: p.panels ?? "film" });

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3) => hypot(a[0], a[1], a[2]);
const unit = (a: V3): V3 => scl(a, 1 / norm(a));
const vmin = (a: V3, b: V3): V3 => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
const vmax = (a: V3, b: V3): V3 => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
const clip = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export const J: Record<string, V3> = { hip_c: [0, 0, 1010], neck: [0, 0, 1580], shoulder: [0, 208, 1486], elbow: [-8, 288, 1168], wrist: [24, 352, 880], hand_end: [58, 388, 700],
  hip: [0, 92, 1010], knee: [18, 112, 540], ankle: [-4, 124, 88] };

// ------------------------------------------------------------------ field primitives (per point)
export function polySd(px: number, py: number, V: number[][]): number {
  let d = 1e9, inside = false;
  for (let i = 0; i < V.length; i++) {
    const a = V[i], b = V[(i + 1) % V.length], ex = b[0] - a[0], ey = b[1] - a[1], wx = px - a[0], wy = py - a[1];
    const t = clip((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
    d = Math.min(d, hypot(wx - t * ex, wy - t * ey));
    if ((a[1] > py) !== (b[1] > py)) { const x = a[0] + ((py - a[1]) / (b[1] - a[1] + 1e-12)) * (b[0] - a[0]); if (px < x) inside = !inside; }
  }
  return inside ? -d : d;
}
function segSd(px: number, py: number, a: number[], b: number[]): number {
  const ex = b[0] - a[0], ey = b[1] - a[1], wx = px - a[0], wy = py - a[1], t = clip((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
  return hypot(wx - t * ex, wy - t * ey);
}
export function segSd3(p: V3, a: V3, b: V3): number {
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], wx = p[0] - a[0], wy = p[1] - a[1], wz = p[2] - a[2];
  const t = clip((wx * ex + wy * ey + wz * ez) / (ex * ex + ey * ey + ez * ez), 0, 1), dx = wx - t * ex, dy = wy - t * ey, dz = wz - t * ez;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
const smin = (a: number, b: number, k: number) => { const h = clip(0.5 + (0.5 * (b - a)) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };

/** Section table rows (t, front, back, outer, inner, exponent): half widths either side of the bone, made fatter by `bulk`. */
export function lofter(table: Table, bulk = 1): (tt: number, x: number, y: number) => number {
  const T = table, f = [1, 2, 3, 4, 5].map((i) => pchip(T.map((r) => r[0]), T.map((r) => (i < 5 ? r[i] * bulk : r[i])))), t0 = T[0][0], t1 = T[T.length - 1][0];
  return (tt, x, y) => {
    const tc = clip(tt, t0, t1), fr = f[0](tc), bk = f[1](tc), ou = f[2](tc), inn = f[3](tc), n = f[4](tc);
    const a = x > 0 ? fr : bk, b = y > 0 ? ou : inn, q = pow(pow(Math.abs(x / a), n) + pow(Math.abs(y / b), n), 1 / n), d = (q - 1) * Math.min(a, b);
    return Math.max(Math.max(d, t0 - tt), tt - t1);
  };
}

export class Frame {
  A: V3; u: V3; f: V3; l: V3;
  constructor(A: V3, B: V3, fwd: V3 = [1, 0, 0], side = 1) {
    this.A = A; this.u = unit(sub(B, A));
    this.f = unit(sub(fwd, scl(this.u, dot(fwd, this.u))));
    this.l = scl(cross(this.f, this.u), -1);
    if (this.l[1] * side < 0) this.l = scl(this.l, -1);
  }
  local(p: V3): [number, number, number] { const q = sub(p, this.A); return [dot(q, this.u), dot(q, this.f), dot(q, this.l)]; }
  /** local() without allocating: (t, x, y) into `o` */
  into(px: number, py: number, pz: number, o: Float64Array): Float64Array {
    const a = px - this.A[0], b = py - this.A[1], c = pz - this.A[2], u = this.u, f = this.f, l = this.l;
    o[0] = a * u[0] + b * u[1] + c * u[2]; o[1] = a * f[0] + b * f[1] + c * f[2]; o[2] = a * l[0] + b * l[1] + c * l[2]; return o;
  }
  world(q: V3): V3 { return add(add(add(this.A, scl(this.u, q[0])), scl(this.l, q[1])), scl(this.f, q[2])); }
}

/** cheap time slicing: the forge yields so the worker can report progress */
export type Tick = (what: string) => void | Promise<void>;

// ------------------------------------------------------------------ the voxel part
export class Part {
  name: string; v: number; lo: V3; ax: Float32Array[]; shape: [number, number, number]; size: number;
  d!: Float32Array; near!: Int32Array; col!: Uint8Array; px!: Float64Array; py!: Float64Array; pz!: Float64Array;
  constructor(name: string, lo: V3, hi: V3, v: number) {
    this.name = name; this.v = v; this.lo = lo;
    // numpy.arange(lo, hi + v, v, dtype=float32)
    this.ax = [0, 1, 2].map((i) => { const n = Math.ceil((hi[i] + v - lo[i]) / v), a = new Float32Array(n); for (let k = 0; k < n; k++) a[k] = lo[i] + k * v; return a; });
    this.shape = [this.ax[0].length, this.ax[1].length, this.ax[2].length]; this.size = this.shape[0] * this.shape[1] * this.shape[2];
  }
  /** the field over every voxel */
  grid(fn: (x: number, y: number, z: number) => number): Float32Array {
    const out = new Float32Array(this.size), [ax, ay, az] = this.ax; let p = 0;
    for (let i = 0; i < this.shape[0]; i++) for (let j = 0; j < this.shape[1]; j++) for (let k = 0; k < this.shape[2]; k++) out[p++] = fn(ax[i], ay[j], az[k]);
    return out;
  }
  /** The same field, evaluated exactly only where it can matter: on a lattice every `step` voxels first, then in full inside every block
   *  with a lattice corner closer than `T` mm to the surface. Far blocks take trilinear values from their corners (only their sign and
   *  size are ever used there). */
  coarse(fn: (x: number, y: number, z: number) => number, T = 40, step = 4): Float32Array {
    const [nx, ny, nz] = this.shape, [ax, ay, az] = this.ax, out = new Float32Array(this.size);
    const lat = (n: number) => { const l: number[] = []; for (let i = 0; i < n - 1; i += step) l.push(i); l.push(n - 1); return l; };
    const LX = lat(nx), LY = lat(ny), LZ = lat(nz), cv = new Float32Array(LX.length * LY.length * LZ.length);
    LX.forEach((i, a) => LY.forEach((j, b) => LZ.forEach((k, c) => { cv[(a * LY.length + b) * LZ.length + c] = fn(ax[i], ay[j], az[k]); })));
    const C = (a: number, b: number, c: number) => cv[(a * LY.length + b) * LZ.length + c];
    // far blocks first, near ones after, so a face two blocks share takes the exact values
    for (const pass of [false, true]) for (let a = 0; a + 1 < LX.length; a++) for (let b = 0; b + 1 < LY.length; b++) for (let c = 0; c + 1 < LZ.length; c++) {
      const i0 = LX[a], i1 = LX[a + 1], j0 = LY[b], j1 = LY[b + 1], k0 = LZ[c], k1 = LZ[c + 1];
      const corner = [C(a, b, c), C(a, b, c + 1), C(a, b + 1, c), C(a, b + 1, c + 1), C(a + 1, b, c), C(a + 1, b, c + 1), C(a + 1, b + 1, c), C(a + 1, b + 1, c + 1)];
      const exact = corner.some((x) => Math.abs(x) < T);
      if (exact !== pass) continue;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
        const q = (i * ny + j) * nz + k;
        if (exact) { out[q] = fn(ax[i], ay[j], az[k]); continue; }
        const u = (i - i0) / (i1 - i0), w = (j - j0) / (j1 - j0), t = (k - k0) / (k1 - k0);
        const c00 = corner[0] * (1 - t) + corner[1] * t, c01 = corner[2] * (1 - t) + corner[3] * t, c10 = corner[4] * (1 - t) + corner[5] * t, c11 = corner[6] * (1 - t) + corner[7] * t;
        out[q] = (c00 * (1 - w) + c01 * w) * (1 - u) + (c10 * (1 - w) + c11 * w) * u;
      }
    }
    return out;
  }
  /** coordinates of a voxel */
  at(p: number): V3 { const nz = this.shape[2], ny = this.shape[1], k = p % nz, j = ((p - k) / nz) % ny, i = Math.floor(p / (ny * nz)); return [this.ax[0][i], this.ax[1][j], this.ax[2][k]]; }
  finish(d: Float32Array, sigma = 0.7): void {
    this.d = gauss3(d, this.shape, sigma / this.v);
    const near: number[] = [];
    for (let p = 0; p < this.size; p++) if (Math.abs(this.d[p]) < 16) near.push(p);
    this.near = Int32Array.from(near); this.col = new Uint8Array(this.size);
    const n = near.length; this.px = new Float64Array(n); this.py = new Float64Array(n); this.pz = new Float64Array(n);
    for (let i = 0; i < n; i++) { const q = this.at(near[i]); this.px[i] = q[0]; this.py[i] = q[1]; this.pz[i] = q[2]; }
  }
  /** a value per surface point */
  each(fn: (x: number, y: number, z: number, i: number) => number): Float64Array {
    const n = this.near.length, out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = fn(this.px[i], this.py[i], this.pz[i], i);
    return out;
  }
  /** Raises (or sinks) the surface over a mask with a bevelled edge, cuts a panel line round it, paints it. */
  layer(s: Float64Array, height = 0, bevel = 2, groove = 1.2, width = 1, colour?: number): void {
    const f = this.d, nr = this.near;
    for (let i = 0; i < nr.length; i++) {
      const p = nr[i], si = s[i];
      if (height) f[p] -= height * clip(0.5 - si / bevel, 0, 1);
      if (groove) f[p] += groove * exp(-((si / width) * (si / width)));
      if (colour !== undefined && si < 0) this.col[p] = colour;
    }
  }
}

/** A moving zone of a shell: negative inside it; its own outer surface and paint, if it has them. */
export interface Zone { field: Float32Array | null; surface: Float32Array | null; paint: Uint8Array | null; }
export interface Shell { colour: number; mesh: TriMesh; zone: string | null; }

/** Hollow shell cut into bed-sized cells and per-colour panels (scripts/forge_mark43.py Part.printable). */
export async function printable(p: Part, opens: Float32Array[], tick: Tick, wall = 3, seam = 0.3, cell: V3 = [235, 205, 215], zones?: Record<string, () => Zone>): Promise<Shell[]> {
  const out: Shell[] = [];
  const list: [string | null, () => Zone][] = zones ? Object.entries(zones) : [[null, () => ({ field: null, surface: null, paint: null })]];
  for (const [name, make] of list) {
    const z = make(), s_ = z.surface ?? p.d, f = new Float32Array(p.size);
    for (let q = 0; q < p.size; q++) {
      let x = Math.max(s_[q], -(s_[q] + wall));
      for (const o of opens) x = Math.max(x, -o[q]);
      if (z.field) x = Math.max(x, z.field[q] + seam);
      f[q] = x;
    }
    for (const c of await cells(p, f, seam, cell, z.paint, name !== null, tick)) out.push({ ...c, zone: name });
    await tick(`${p.name}${name ? ` ${name}` : ""}`);
  }
  return out;
}

const reflect = (i: number, n: number): number => { if (n === 1) return 0; const p = 2 * n; i %= p; if (i < 0) i += p; return i < n ? i : p - 1 - i; };
function kernel1(sigma: number): Float64Array {
  const r = Math.floor(4 * sigma + 0.5), k = new Float64Array(2 * r + 1); let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = exp(-0.5 * (i * i) / (sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}
/** voxels with f < 0 and their 26 neighbours */
function shellVoxels(f: Float32Array, [nx, ny, nz]: [number, number, number]): Int32Array {
  const mark = new Uint8Array(f.length);
  for (let q = 0; q < f.length; q++) if (f[q] < 0) {
    const k = q % nz, j = ((q - k) / nz) % ny, i = Math.floor(q / (ny * nz));
    for (let a = Math.max(0, i - 1); a <= Math.min(nx - 1, i + 1); a++) for (let b = Math.max(0, j - 1); b <= Math.min(ny - 1, j + 1); b++) for (let d = Math.max(0, k - 1); d <= Math.min(nz - 1, k + 1); d++) mark[(a * ny + b) * nz + d] = 1;
  }
  let n = 0; for (let q = 0; q < mark.length; q++) n += mark[q];
  const out = new Int32Array(n); n = 0; for (let q = 0; q < mark.length; q++) if (mark[q]) out[n++] = q;
  return out;
}
function searchsorted(a: Float32Array, x: number): number { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }

async function cells(p: Part, f: Float32Array, seam: number, cell: V3, paint: Uint8Array | null, fit: boolean, tick: Tick): Promise<{ colour: number; mesh: TriMesh }[]> {
  const col = paint ?? p.col, v = p.v, [nx, ny, nz] = p.shape;
  let lo: V3 = [p.lo[0], p.lo[1], p.lo[2]], ext: V3 = [(nx - 1) * v, (ny - 1) * v, (nz - 1) * v];
  if (fit) {   // a zone is cut to its own extent, not the whole part's
    const mn = [Infinity, Infinity, Infinity], mx = [-1, -1, -1];
    for (let q = 0; q < p.size; q++) if (f[q] < 0) {
      const k = q % nz, j = ((q - k) / nz) % ny, i = Math.floor(q / (ny * nz)), id = [i, j, k];
      for (let a = 0; a < 3; a++) { if (id[a] < mn[a]) mn[a] = id[a]; if (id[a] > mx[a]) mx[a] = id[a]; }
    }
    if (mx[0] < 0) return [];
    lo = [0, 1, 2].map((a) => p.ax[a][mn[a]] - v) as V3; ext = [0, 1, 2].map((a) => p.ax[a][mx[a]] + v - lo[a]) as V3;
  }
  const nc = [0, 1, 2].map((a) => Math.max(1, Math.ceil(ext[a] / cell[a]))), edges = [0, 1, 2].map((a) => Array.from({ length: nc[a] + 1 }, (_, k) => lo[a] + (ext[a] * k) / nc[a]));
  const out: { colour: number; mesh: TriMesh }[] = [];
  // the shell and its 26 neighbours
  const S = shellVoxels(f, p.shape), K = kernel1(0.6), R = (K.length - 1) / 2;
  const blur = (m: Float32Array, q: number): number => {   // scipy gaussian_filter(m, 0.6) at one voxel, mode reflect
    const k = q % nz, j = ((q - k) / nz) % ny, i = Math.floor(q / (ny * nz)); let s = 0;
    for (let a = -R; a <= R; a++) {
      const ii = reflect(i + a, nx) * ny * nz, wa = K[a + R];
      for (let b = -R; b <= R; b++) {
        const jj = ii + reflect(j + b, ny) * nz, wb = wa * K[b + R];
        for (let d = -R; d <= R; d++) s += wb * K[d + R] * m[jj + reflect(k + d, nz)];
      }
    }
    return s;
  };
  for (const c of [RED, GOLD, STEEL, LENS]) {
    const m = new Float32Array(p.size); let any = false;
    for (let q = 0; q < p.size; q++) if (col[q] === c) { m[q] = 1; any = true; }
    if (c !== RED && !any) continue;
    // the colour's field matters only on the shell and the voxels next to it (every cube that can hold surface): elsewhere any positive value will do
    const fc = new Float32Array(p.size).fill(1e3);
    for (let w = 0; w < S.length; w++) {
      const q = S[w];
      let ee = blur(m, q) - 0.5;
      if (c === RED && col[q] === RED) ee = 1.0;
      fc[q] = Math.max(f[q], -ee * v * 2 + seam);
    }
    for (let ci = 0; ci < nc[0]; ci++) for (let cj = 0; cj < nc[1]; cj++) for (let ck = 0; ck < nc[2]; ck++) {
      const cc = [ci, cj, ck], s0: number[] = [], s1: number[] = [];
      for (let a = 0; a < 3; a++) { s0.push(Math.max(0, searchsorted(p.ax[a], edges[a][cc[a]]) - 3)); s1.push(Math.min(p.shape[a], searchsorted(p.ax[a], edges[a][cc[a] + 1]) + 4)); }
      const n: [number, number, number] = [s1[0] - s0[0], s1[1] - s0[1], s1[2] - s0[2]], g = new Float32Array(n[0] * n[1] * n[2]);
      let gmin = Infinity, w = 0;
      for (let i = 0; i < n[0]; i++) for (let j = 0; j < n[1]; j++) for (let k = 0; k < n[2]; k++) {
        const gi = [i + s0[0], j + s0[1], k + s0[2]];
        let x = fc[(gi[0] * ny + gi[1]) * nz + gi[2]];
        for (let a = 0; a < 3; a++) {
          const X = p.ax[a][gi[a]];
          if (cc[a] > 0) x = Math.max(x, edges[a][cc[a]] + seam - X);
          if (cc[a] < nc[a] - 1) x = Math.max(x, X - (edges[a][cc[a] + 1] - seam));
        }
        g[w++] = x; if (x < gmin) gmin = x;
      }
      if (gmin >= 0) continue;
      const mesh = marchingCubes(g, n, 0.0137, v, [p.ax[0][s0[0]], p.ax[1][s0[1]], p.ax[2][s0[2]]]);
      for (let comp of components(mesh)) {
        if (!isWatertight(comp)) comp = fillHoles(comp);
        const vol = signedVolume(comp);
        if (isWatertight(comp) && Math.abs(vol) > 500) out.push({ colour: c, mesh: vol < 0 ? flip(comp) : comp });
      }
      await tick(`${p.name} cell`);
    }
  }
  return out;
}

const unwrap = (fr: Frame, R: number) => { const o = new Float64Array(3); return (x: number, y: number, z: number): [number, number] => { fr.into(x, y, z, o); return [atan2(o[2], o[1]) * R, o[0]]; }; };

// ------------------------------------------------------------------ torso
const TORSO: Table = [[888, 44, 52, 50, 50, 2.2], [925, 84, 96, 104, 104, 2.4], [985, 98, 108, 134, 134, 2.5], [1050, 94, 100, 128, 128, 2.5], [1125, 92, 94, 120, 120, 2.5],
  [1190, 104, 100, 138, 138, 2.6], [1270, 126, 110, 166, 166, 2.7], [1360, 136, 118, 182, 182, 2.9], [1440, 118, 120, 184, 184, 3.0], [1510, 86, 104, 152, 152, 2.7], [1578, 62, 70, 84, 84, 2.4]];

/** a layer, after the prompt's panel style: "smooth" drops the fine lines, "heavy" stands plates twice as proud */
function styled(c: Ctx, p: Part, s: Float64Array, height = 0, bevel = 2, groove = 1.2, width = 1, colour?: number): void {
  if (c.panels === "smooth" && !height && colour === undefined) return;
  p.layer(s, c.panels === "heavy" && height > 0 ? height * 2 : height, bevel, c.panels === "smooth" ? groove * 0.5 : groove, width, colour);
}

function torso(c: Ctx): Part {
  const v = c.v, p = new Part("torso", [-160, -215, 870], [175, 215, 1592], v), L = lofter(TORSO, c.bulk);
  p.finish(p.coarse((x, y, z) => L(z, x, y)));
  const F = (pts: number[][], where: (x: number, y: number) => boolean = () => true) => p.each((x, y, z) => (where(x, Math.abs(y)) ? polySd(Math.abs(y), z, pts) : 99));
  const front = (x: number) => x > 5, back = (x: number) => !(x > 5), side = (_x: number, y: number) => y > 112;
  const S = (s: Float64Array, ...a: [number, number, number, number, number?]) => styled(c, p, s, ...a);
  S(F([[-40, 1212], [60, 1228], [128, 1262], [190, 1322], [230, 1322], [230, 1620], [-40, 1620]], front), 8.0, 3.0, 1.6, 1.2);
  S(F([[54, 1338], [100, 1446], [166, 1436], [182, 1352], [128, 1290], [80, 1294]], front), 3.0, 2.5, 1.4, 1.0);
  S(F([[-40, 1302], [50, 1302], [74, 1284], [100, 1262], [62, 1232], [-40, 1220]], front), 2.5, 2.5, 1.4, 1.0);
  S(F([[-40, 1530], [60, 1522], [94, 1468], [48, 1416], [-40, 1420]], front), 2.0, 2.5, 1.4, 1.0);
  S(F([[72, 1546], [128, 1518], [146, 1476], [108, 1464], [84, 1498]], front), 3.0, 2.0, 1.4, 1.0, GOLD);
  S(F([[-40, 1552], [66, 1550], [80, 1512], [54, 1528], [-40, 1532]], front), 2.0, 2.0, 1.2, 1.0, STEEL);
  S(F([[150, 1296], [186, 1328], [214, 1298], [214, 1216], [182, 1198], [146, 1234]], side), 3.0, 2.0, 1.4, 1.0, GOLD);
  S(F([[160, 1286], [186, 1310], [204, 1288], [204, 1226], [182, 1212], [158, 1240]], side), 1.0, 1.5, 1.0, 0.8, STEEL);
  S(F([[170, 1274], [186, 1290], [194, 1278], [194, 1236], [182, 1226], [168, 1246]], side), -1.0, 1.5, 1.0, 0.8, RED);
  for (const [z0, z1] of [[1206, 1168], [1164, 1126], [1122, 1084]]) S(F([[-40, z0 - 26], [50, z0], [92, z0 - 2], [92, z1 - 2], [50, z1], [-40, z1 - 26]], front), 4.0, 3.0, 1.6, 1.2);
  S(F([[96, 1214], [146, 1214], [150, 1150], [126, 1112], [146, 1072], [96, 1066], [104, 1112]], front), 3.0, 2.0, 1.4, 1.0, GOLD);
  S(F([[104, 1130], [136, 1120], [126, 1092], [102, 1096]], front), 1.5, 1.5, 1.2, 0.8, STEEL);
  S(F([[-40, 1064], [170, 1072], [170, 1058], [-40, 1050]]), -2.0, 1.5, 1.0, 0.8, STEEL);
  S(F([[-40, 1044], [84, 1040], [102, 996], [66, 930], [28, 892], [-40, 888]], front), 6.0, 3.0, 1.6, 1.2);
  S(p.each((x, y, z) => (front(x) ? hypot(Math.abs(y) - 116, z - 1010) - 20 : 99)), 3.0, 2.0, 1.2, 1.0);
  S(F([[-40, 1490], [30, 1490], [30, 1140], [-40, 1140]], back), -3.0, 2.5, 1.4, 1.0);
  S(F([[40, 1470], [160, 1460], [172, 1300], [104, 1226], [40, 1256]], back), 4.0, 3.0, 1.6, 1.2);
  S(F([[-40, 1040], [112, 1040], [124, 960], [60, 900], [-40, 892]], back), 3.0, 3.0, 1.4, 1.0);
  return p;
}

/** recess, ring and lens at the centre of the chest */
function reactor(c: Ctx, p: Part): void {
  const r = (R: number) => p.each((x, y, z) => (x > 30 ? hypot(y, z - 1375) - R : 99));
  p.layer(r(58), 5.0, 2.0, 1.4, 1.0); p.layer(r(46), -7.0, 2.0, 0.0, 1.0, STEEL); p.layer(r(36), 0.0, 1.0, 1.0, 0.8);
  void c;
}

// ------------------------------------------------------------------ limbs
function limb(name: string, A: V3, B: V3, table: Table, c: Ctx, pad = 130, extra?: (t: number, x: number, y: number) => number): { p: Part; fr: Frame } {
  const p = new Part(name, sub(vmin(A, B), [pad, pad, pad]), add(vmax(A, B), [pad, pad, pad]), c.v), fr = new Frame(A, B), L = lofter(table, c.bulk);
  const o = new Float64Array(3);
  p.finish(p.coarse((x, y, z) => { fr.into(x, y, z, o); const d = L(o[0], o[1], o[2]); return extra ? Math.min(d, extra(o[0], o[1], o[2])) : d; }));
  return { p, fr };
}
const band = (u0: number, u1: number) => [[-250, u0], [250, u0], [250, u1], [-250, u1]];

function upperArm(c: Ctx): Part {
  const L = norm(sub(J.elbow, J.shoulder)), sh = c.shoulder;
  const PA = lofter([[-70, 34, 34, 30, 26, 2.4], [-46, 66, 66, 60, 46, 3.2], [0, 74, 74, 72, 52, 3.4], [60, 70, 70, 68, 48, 3.4], [86, 58, 58, 58, 38, 3.0]].map((r) => [r[0] * (r[0] < 0 ? sh : 1), ...r.slice(1, 5).map((x) => x * sh), r[5]]), c.bulk);
  const { p, fr } = limb("upper_arm", J.shoulder, J.elbow, [[30, 58, 58, 60, 54, 2.4], [110, 64, 64, 68, 58, 2.6], [220, 58, 58, 60, 52, 2.6], [L - 20, 48, 48, 50, 46, 2.4]], c, 150, (t, x, y) => PA(t, x, y - 8));
  const U = unwrap(fr, 70.0), on = (V: number[][], where: (t: number) => boolean = () => true) => p.each((x, y, z) => { const [u, t] = U(x, y, z); return where(t) ? polySd(u, t, V) : 99; });
  const S = (s: Float64Array, ...a: [number, number, number, number, number?]) => styled(c, p, s, ...a);
  S(on(band(96, L - 44)), 0.0, 1.0, 1.4, 1.0, GOLD);
  S(on([[-40, 140], [60, 132], [84, 214], [20, 238], [-52, 214]]), 3.0, 2.0, 1.4, 1.0, GOLD);
  S(on(band(L - 42, L - 10)), -3.0, 1.5, 1.2, 1.0, STEEL);
  for (let k = 0; k < 3; k++) S(on(band(L - 38 + k * 10, L - 34 + k * 10)), -2.0, 1.0, 0, 1.0);
  S(on([[-50, -32], [56, -32], [80, 46], [34, 78], [-50, 78], [-72, 30]].map(([u, t]) => [u * sh, t * sh]), (t) => t < 92), 3.0, 3.0, 1.4, 1.0);
  return p;
}

function forearm(c: Ctx): Part {
  const L = norm(sub(J.wrist, J.elbow));
  const { p, fr } = limb("forearm", J.elbow, J.wrist, [[14, 46, 46, 50, 46, 2.4], [70, 62, 64, 68, 60, 3.0], [150, 60, 62, 62, 56, 3.2], [232, 48, 48, 50, 46, 3.0], [L - 12, 42, 42, 46, 42, 2.6]], c, 110);
  const U = unwrap(fr, 62.0), on = (V: number[][]) => p.each((x, y, z) => { const [u, t] = U(x, y, z); return polySd(u, t, V); });
  const S = (s: Float64Array, ...a: [number, number, number, number, number?]) => styled(c, p, s, ...a);
  S(on([[-20, 62], [22, 62], [30, 128], [84, 178], [66, 214], [10, 160], [-46, 214], [-66, 180], [-22, 126]]), 2.5, 2.0, 1.4, 1.0, GOLD);
  S(on(band(20, 52)), 3.0, 2.0, 1.4, 1.0);
  S(on(band(232, L - 8)), 3.0, 2.5, 1.4, 1.0);
  S(on(band(222, 230)), -2.0, 1.0, 0.8, 1.0, GOLD);
  return p;
}

function hand(c: Ctx): Part {
  const wr = J.wrist, he = J.hand_end, p = new Part("hand", sub(vmin(wr, he), [130, 130, 130]), add(vmax(wr, he), [130, 130, 130]), c.v), fr = new Frame(wr, he);
  // the palm faces the thigh: width runs forward (x), thickness sideways (y)
  const L = lofter([[0, 42, 42, 54, 54, 3.0], [70, 40, 44, 66, 66, 3.4], [118, 32, 36, 66, 66, 3.2]], c.bulk);
  const bones: [V3, V3, number, number][] = [];
  for (const [o, ln] of [[48, 1.0], [16, 1.1], [-16, 1.04], [-46, 0.88]]) {
    const pts: V3[] = [[118.0, 2.0, o]]; let ang = 0.28;
    for (let s_ of [52, 36, 28]) { s_ *= ln; const q = pts[pts.length - 1]; pts.push([q[0] + cos(ang) * s_, q[1] - sin(ang) * s_, q[2]]); ang += 0.62; }
    for (let k = 0; k < 3; k++) bones.push([fr.world(pts[k]), fr.world(pts[k + 1]), [15.5, 14.0, 12.5][k], 1.2]);
  }
  const th: V3[] = [[30.0, -26.0, 56.0], [78.0, -40.0, 76.0], [120.0, -40.0, 74.0]];
  for (let k = 0; k < 2; k++) bones.push([fr.world(th[k]), fr.world(th[k + 1]), [18.0, 14.5][k], 3.0]);
  const o = new Float64Array(3), Q: V3 = [0, 0, 0];
  p.finish(p.coarse((x, y, z) => {
    fr.into(x, y, z, o); let d = L(o[0], o[2], o[1]); Q[0] = x; Q[1] = y; Q[2] = z;
    for (const [A, B, r, k] of bones) d = smin(d, segSd3(Q, A, B) - r, k);
    return d;
  }));
  const on = (V: number[][], backOnly: boolean) => p.each((x, y, z) => { fr.into(x, y, z, o); return !backOnly || o[2] > 0 ? polySd(o[1], o[0], V) : 99; });
  const S = (s: Float64Array, ...a: [number, number, number, number, number?]) => styled(c, p, s, ...a);
  S(on([[-48, 14], [48, 14], [54, 96], [-54, 96]], true), 3.0, 2.5, 1.4, 1.0);
  S(on([[-50, 100], [50, 100], [52, 118], [-52, 118]], true), 3.0, 2.0, 1.2, 1.0);
  S(on([[-60, -10], [60, -10], [60, 10], [-60, 10]], false), -2.0, 1.5, 1.2, 1.0, STEEL);
  return p;
}

function thigh(c: Ctx): Part {
  const L = norm(sub(J.knee, J.hip));
  const { p, fr } = limb("thigh", J.hip, J.knee, [[-10, 84, 88, 78, 62, 2.3], [70, 100, 104, 92, 76, 2.5], [200, 92, 94, 86, 76, 2.6], [340, 76, 76, 72, 66, 2.6], [L - 22, 64, 60, 62, 58, 2.6]], c, 130);
  const sc = new Float64Array(3), U = unwrap(fr, 85.0), on = (V: number[][], where: (x: number) => boolean = () => true) => p.each((x, y, z) => { const [u, t] = U(x, y, z), a = fr.into(x, y, z, sc)[1]; return where(a) ? polySd(u, t, V) : 99; });
  const S = (s: Float64Array, ...a: [number, number, number, number, number?]) => styled(c, p, s, ...a);
  S(on([[-10, 96], [70, 44], [140, 92], [136, 232], [70, 306], [14, 306], [-30, 214]]), 4.0, 3.0, 1.6, 1.2, GOLD);
  S(on([[30, 142], [78, 104], [112, 142], [96, 214], [52, 232]]), -3.0, 2.0, 1.2, 1.0, RED);
  S(on([[-120, 60], [-30, 60], [-46, 300], [-120, 318]]), 3.0, 3.0, 1.4, 1.0);
  S(on([[-260, 342], [260, 342], [260, 382], [-260, 382]]), 2.5, 2.0, 1.4, 1.0, GOLD);
  S(on([[-76, 392], [76, 392], [94, L + 12], [-94, L + 12]], (a) => a > -10), 3.0, 2.0, 1.4, 1.0, STEEL);
  return p;
}

function shin(c: Ctx): Part {
  const L = norm(sub(J.ankle, J.knee));
  const { p, fr } = limb("shin", J.knee, J.ankle, [[14, 60, 56, 60, 56, 2.7], [80, 66, 80, 68, 62, 2.9], [190, 62, 82, 64, 58, 3.0], [310, 52, 60, 54, 50, 3.0], [L - 14, 54, 62, 56, 52, 3.2]], c, 120);
  const sc = new Float64Array(3), U = unwrap(fr, 66.0), on = (V: number[][], where: (x: number) => boolean = () => true) => p.each((x, y, z) => { const [u, t] = U(x, y, z), a = fr.into(x, y, z, sc)[1]; return where(a) ? polySd(u, t, V) : 99; });
  const S = (s: Float64Array, ...a: [number, number, number, number, number?]) => styled(c, p, s, ...a);
  S(on([[-58, 20], [58, 20], [66, 96], [28, 118], [-28, 118], [-66, 96]], (a) => a > 0), 4.0, 3.0, 1.6, 1.2);
  S(on([[66, 110], [98, 110], [92, 244], [72, 210]]), 2.0, 2.0, 1.2, 1.0, GOLD);
  S(on([[-98, 110], [-66, 110], [-72, 210], [-92, 244]]), 2.0, 2.0, 1.2, 1.0, GOLD);
  S(on([[-42, 132], [42, 132], [36, 300], [0, 330], [-36, 300]], (a) => a > 0), 3.0, 3.0, 1.6, 1.2);
  S(on([[-260, 352], [260, 352], [260, 366], [-260, 366]]), -2.0, 1.5, 1.2, 1.0);
  return p;
}

function foot(c: Ctx): Part {
  const an = J.ankle, p = new Part("foot", [an[0] - 120, an[1] - 90, 0], [an[0] + 215, an[1] + 90, 150], c.v), b = c.bulk;
  const T = [[-96, 92, 0, 44, 3], [-50, 118, 0, 56, 3], [10, 112, 0, 60, 3], [70, 74, 0, 60, 3.2], [130, 52, 0, 56, 3.2], [178, 34, 0, 42, 3]];
  const ip = [1, 2, 3, 4].map((i) => pchip(T.map((r) => r[0]), T.map((r) => (i === 3 ? r[i] * b : i === 1 ? r[i] * (1 + (b - 1) * 0.5) : r[i]))));
  p.finish(p.coarse((X, Y, Z) => {
    const x = X - an[0], y = Y - an[1], z = Z, xc = clip(x, -96, 178), top = ip[0](xc), sole = ip[1](xc), w = ip[2](xc), n = ip[3](xc);
    const zc = (top + sole) / 2, zh = (top - sole) / 2, q = pow(pow(Math.abs(y / w), n) + pow(Math.abs((z - zc) / zh), n), 1 / n);
    let d = (q - 1) * Math.min(w, zh); d = Math.max(Math.max(d, -96 - x), x - 178); return Math.max(d, 2.0 - z);
  }));
  const S = (s: Float64Array, ...a: [number, number, number, number, number?]) => styled(c, p, s, ...a);
  S(p.each((x, _y, z) => polySd(x - an[0], z, [[-120, 0], [200, 0], [200, 16], [-120, 16]])), -1.5, 1.5, 1.2, 1.0, STEEL);
  S(p.each((x, y, z) => (z > 24 ? polySd(y - an[1], x - an[0], [[-40, 60], [40, 60], [30, 150], [-30, 150]]) : 99)), 2.5, 2.5, 1.4, 1.0);
  return p;
}

/** The dark machinery between the plates: ribbed steel at every joint, so no gap ever shows through. */
function jointMech(c: Ctx): [string, Part][] {
  const lerp = (a: V3, b: V3, t: number): V3 => add(a, scl(sub(b, a), t));
  const S: [string, V3, V3, number][] = [["shoulder", add(J.shoulder, [0, -46, -6]), add(J.shoulder, [0, 24, -10]), 60], ["elbow", lerp(J.elbow, J.shoulder, 0.1), lerp(J.elbow, J.wrist, 0.09), 52],
    ["wrist", lerp(J.wrist, J.elbow, 0.07), lerp(J.wrist, J.hand_end, 0.1), 40], ["hip", add(J.hip, [0, -8, 26]), lerp(J.hip, J.knee, 0.08), 66],
    ["knee", lerp(J.knee, J.hip, 0.07), lerp(J.knee, J.ankle, 0.07), 62], ["ankle", add(J.ankle, [0, 0, 30]), add(J.ankle, [0, 0, -18]), 48]];
  return S.map(([n, a, b, r]) => {
    const p = new Part(`mech_${n}`, sub(vmin(a, b), [r + 14, r + 14, r + 14]), add(vmax(a, b), [r + 14, r + 14, r + 14]), c.v), u = unit(sub(b, a));
    const Q: V3 = [0, 0, 0];
    p.finish(p.grid((x, y, z) => { Q[0] = x; Q[1] = y; Q[2] = z; return segSd3(Q, a, b) - r + 1.1 * sin(((x - a[0]) * u[0] + (y - a[1]) * u[1] + (z - a[2]) * u[2]) * 0.9); }), 0.3); p.col.fill(STEEL);
    return [n, p] as [string, Part];
  });
}

// ------------------------------------------------------------------ the helmet
export const Z_CHIN = 1566.0;
const HEAD: Table = [[0, 92, 20, 40, 40, 2.2], [22, 118, 70, 72, 72, 2.4], [66, 126, 104, 86, 86, 2.5], [118, 124, 118, 97, 97, 2.5], [166, 120, 124, 103, 103, 2.5], [214, 110, 126, 104, 104, 2.4],
  [252, 86, 112, 92, 92, 2.3], [276, 52, 76, 60, 60, 2.2], [288, 12, 16, 14, 14, 2.0]];

/** The helmet, from the reference: one smooth shell, gold mask, red wedge, eyes, mouth line, ear discs, crown ridge. */
function head(c: Ctx): Part {
  const v = c.v, p = new Part("head", [-150, -125, Z_CHIN - 14], [150, 125, Z_CHIN + 302], v), L = lofter(HEAD);
  const d = p.grid((x, y, z) => L(z - Z_CHIN, x, y));
  // the sections close fast at the crown, so the field runs steep there: a wall measured in it would be thin. Put it back in millimetres
  const g = gauss3(gradientNorm(gauss3(d, p.shape, 2.0), p.shape, v), p.shape, 4.0);
  for (let q = 0; q < d.length; q++) d[q] = d[q] / Math.max(g[q], 0.4);
  p.finish(d, 0.5);
  const fr = (x: number) => x > 18, F = (pts: number[][], where: (x: number, y: number, z: number) => boolean = (x) => fr(x)) => p.each((x, y, z) => (where(x, Math.abs(y), z - Z_CHIN) ? polySd(Math.abs(y), z - Z_CHIN, pts) : 99));
  const S = (s: Float64Array, ...a: [number, number, number, number, number?]) => styled(c, p, s, ...a);
  const line = (a: number[], b: number[], dp = 1.3, w = 1.1) => S(p.each((x, y, z) => (fr(x) ? segSd(Math.abs(y), z - Z_CHIN, a, b) : 99)), 0.0, 1.0, dp, w);
  S(p.each((x, _y, z) => Math.max(polySd(x, z - Z_CHIN, MASK_SIDE), z - Z_CHIN - 266)), 3.5, 2.0, 1.8, 1.2, GOLD);
  S(F([[-40, 280], [66, 280], [30, 208], [-40, 194]]), -3.5, 2.0, 1.6, 1.2, RED);
  const eye = [[14, 158], [28, 168], [82, 184], [88, 174], [66, 156], [28, 150]];
  S(F(eye.map(([a, b]) => [a * 1.06 - 1, (b - 166) * 1.5 + 166])), -3.0, 2.0, 1.2, 1.0);
  S(F(eye), -2.0, 1.0, 0.0, 1.0, LENS);
  line([26, 206], [46, 262]); line([84, 190], [92, 214]); line([30, 150], [40, 110]); line([40, 110], [74, 72]); line([88, 172], [84, 118]); line([84, 118], [66, 74]);
  S(F([[-40, 62], [44, 66], [58, 80], [62, 74], [48, 56], [-40, 52]]), -3.0, 1.5, 1.0, 0.9);
  S(F([[-40, 46], [44, 50], [34, 14], [-40, 12]]), 2.5, 2.0, 1.4, 1.0);
  const ear = (R: number) => p.each((x, y, z) => (Math.abs(y) > 40 ? hypot(x + 6, z - Z_CHIN - 158) - R : 99));
  S(ear(37), 4.0, 2.0, 1.4, 1.0); S(ear(25), -2.0, 1.5, 1.0, 0.9);
  S(p.each((x, y, z) => (Math.abs(y) > 40 && x < 60 ? polySd(x, z - Z_CHIN, [[-110, 202], [56, 214], [70, 262], [-90, 268]]) : 99)), 2.0, 2.5, 1.2, 1.0);
  S(p.each((x, y, z) => (Math.abs(y) > 40 && !fr(x) ? polySd(x, z - Z_CHIN, [[-120, 28], [6, 34], [20, 112], [-120, 120]]) : 99)), 2.0, 2.5, 1.2, 1.0);
  S(p.each((x, y, z) => (z - Z_CHIN > 220 ? polySd(Math.abs(y), x, [[-30, -130], [26, -130], [34, 40], [-30, 50]]) : 99)), 2.5, 2.5, 1.2, 1.0);
  return p;
}

// The mask lifts about the ears. Everything ahead of one line up the side of the head rides on it: gold panels, eyes, the red forehead
// wedge and the crown ahead of the hoop. Behind that line the shell stays, and the moving crown slides under it as the mask lifts.
export const EAR: [number, number] = [6.0, Z_CHIN + 158.0];
export const MASK_OPEN = 1.0;
const WEDGE = [[-40, 281], [66, 281], [30, 208], [-40, 194]];
const MASK_SIDE = [[90, 8], [86, 50], [78, 76], [50, 122], [31, 150], [30, 190], [0, 300], [0, 340], [200, 340], [200, 8]];
export const MASK_WALL = 2.2;
const NEST_GAP = 0.7;

const turned = (q: V3, ang: number): V3 => { const c = cos(ang), s = sin(ang), a = q[0] - EAR[0], b = q[2] - EAR[1]; return [EAR[0] + c * a + s * b, q[1], EAR[1] - s * a + c * b]; };
const sample = (p: Part, f: Float32Array, q: V3) => trilinear(f, p.shape, (q[0] - p.ax[0][0]) / p.v, (q[1] - p.ax[1][0]) / p.v, (q[2] - p.ax[2][0]) / p.v);

/** Paints the mask and its seam, then sinks whatever of the mask would run into the fixed shell over it (forge_mark43.helmet_zones). */
function helmetZones(p: Part, wall: number, log: (s: string) => void): { mask: () => Zone; fixedRed: Uint8Array; seam: Float32Array } {
  const s = p.grid((x, _y, z) => polySd(x, z - Z_CHIN, MASK_SIDE)), col = p.col, n = p.size;
  const moving = new Uint8Array(n), wedge = new Uint8Array(n), crown = new Uint8Array(n);
  for (let q = 0; q < n; q++) { const [x, y, z] = p.at(q); moving[q] = s[q] < 0 ? 1 : 0; wedge[q] = polySd(Math.abs(y), z - Z_CHIN, WEDGE) < 0 && x > 18 ? 1 : 0; crown[q] = z > Z_CHIN + 266 ? 1 : 0; }
  for (let q = 0; q < n; q++) if (!moving[q] && col[q] === GOLD) col[q] = RED;
  for (let q = 0; q < n; q++) if (moving[q] && col[q] === RED && !wedge[q] && !crown[q]) col[q] = GOLD;
  for (let q = 0; q < n; q++) if (moving[q] && wedge[q] && col[q] === GOLD) col[q] = RED;
  const rest = new Float32Array(n); for (let q = 0; q < n; q++) rest[q] = p.d[q] + wall + NEST_GAP;
  const skin: number[] = []; for (let q = 0; q < n; q++) if (moving[q] && Math.abs(p.d[q]) < 3.0) skin.push(q);
  const E = new Float64Array(skin.length).fill(-99), K = 64, a0 = -0.02, a1 = -(MASK_OPEN + 0.25);
  for (let k = 0; k < K; k++) {
    const ang = a0 + ((a1 - a0) * k) / (K - 1), late = 14.0 * Math.max(0, -ang - MASK_OPEN - 0.02);
    for (let i = 0; i < skin.length; i++) {
      const R = turned(p.at(skin[i]), ang);
      if (sample(p, s, R) >= -1.0 && R[2] > EAR[1] - 12) E[i] = Math.max(E[i], sample(p, rest, R) - late);
    }
  }
  const need = new Float32Array(n), got: number[] = [];
  skin.forEach((q, i) => { need[q] = Math.max(E[i] - p.d[q], 0); if (need[q] > 0) got.push(need[q]); });
  log(`mask sunk under the fixed shell: p50/p90/max ${[50, 90, 100].map((x) => percentile(got, x).toFixed(1)).join(" ")} mm`);
  const sink = gauss3(maxFilter3(need, p.shape, 5), p.shape, 2.5), paint = col.slice();
  for (let q = 0; q < n; q++) if (!moving[q] && !crown[q]) paint[q] = GOLD;
  const fixedRed = new Uint8Array(n).fill(RED);
  return { mask: () => { const surf = new Float32Array(n); for (let q = 0; q < n; q++) surf[q] = p.d[q] + sink[q]; return { field: s, surface: surf, paint }; }, fixedRed, seam: s };
}

// ------------------------------------------------------------------ the doors
const PROUD = 3.0;
export const OPEN = (80 * Math.PI) / 180;
interface Plan { span: [number, number]; hinges: number[]; servo: [number, string]; latches: number[]; seam: number; }
export const DOOR_PLAN: Record<string, Plan> = {
  torso: { span: [1076, 1336], hinges: [1090, 1340], servo: [1256, "hobby_ds3218"], latches: [1180, 1410], seam: 0.0 },
  head: { span: [1606, 1812], hinges: [1617, 1806], servo: [1680, "hobby_mg90s"], latches: [1700], seam: -44.0 },
  upper_arm: { span: [0, 300], hinges: [24, 268], servo: [150, "hobby_mg996r"], latches: [190], seam: 0.0 },
  forearm: { span: [30, 280], hinges: [46, 262], servo: [120, "hobby_mg996r"], latches: [190], seam: 0.0 },
  thigh: { span: [30, 430], hinges: [54, 402], servo: [214, "hobby_mg996r"], latches: [280], seam: 0.0 },
  shin: { span: [30, 430], hinges: [54, 416], servo: [232, "hobby_mg996r"], latches: [300], seam: 0.0 },
};
export const BONES: Record<string, [string, string]> = { upper_arm: ["shoulder", "elbow"], forearm: ["elbow", "wrist"], thigh: ["hip", "knee"], shin: ["knee", "ankle"] };

/** the line above every (t, o) with the least area under it (the LP of forge_mark43.fit_line, solved on the upper hull) */
export function fitLine(t: number[], o: number[]): [number, number, number] {
  const tm = t.reduce((a, b) => a + b, 0) / t.length;
  // minimise c0 = max_i (o_i - c1 (t_i - tm)) over c1: the upper hull of the points evaluated at tm
  const pts = t.map((x, i) => [x - tm, o[i]] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), hull: [number, number][] = [];
  for (const q of pts) {
    while (hull.length >= 2) { const [a, b] = [hull[hull.length - 2], hull[hull.length - 1]]; if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= 0) hull.pop(); else break; }
    hull.push(q);
  }
  for (let i = 0; i + 1 < hull.length; i++) {
    const [a, b] = [hull[i], hull[i + 1]];
    if (a[0] <= 0 && b[0] >= 0) {
      const c1 = (b[1] - a[1]) / (b[0] - a[0] || 1);
      // tm on a hull vertex: any slope between its two edges is optimal; take the lower edge's slope (what HiGHS returns here)
      if (b[0] === 0 && i + 2 < hull.length) { const c = hull[i + 2]; const c1b = (c[1] - b[1]) / (c[0] - b[0]); return [b[1], Math.min(c1, c1b) === c1 ? c1 : c1, tm].map((x, k) => (k === 1 ? c1 : x)) as [number, number, number]; }
      return [a[1] - c1 * a[0], c1, tm];
    }
  }
  return [Math.max(...o), 0, tm];
}

/** how far out the shell runs from `origin` + t `along`, measured along -`inward` from the far side */
function flank(p: Part, origin: V3, inward: V3, along: V3, ts: number[], reach = 240): number[] {
  return ts.map((t) => {
    for (let w = reach; w > -40; w -= 0.5) { const q = sub(add(origin, scl(along, t)), scl(inward, w)); if (sample(p, p.d, q) < 0) return w; }
    return Number.NaN;
  });
}

export interface DoorRecord {
  name: string; part: string; side: string; link: string; joint: string; parent: string; region: string; a: V3; up: V3; sign: number; normal: V3; out: V3;
  hinges: V3[]; servo: { at: V3; key: string }; latch_t: number[]; seam_up: V3; base: V3; open: number;
}
const r3 = (a: V3, d = 3): V3 => a.map((x) => Math.round(x * 10 ** d) / 10 ** d) as V3;

/** every door in the suit, in world mm: its hinge line, stations and latch points */
export function doorRecords(parts: Record<string, Part>): DoorRecord[] {
  const doors: DoorRecord[] = [];
  for (const [k, p] of Object.entries(parts)) {
    const pl = DOOR_PLAN[k], ts: number[] = []; for (let t = pl.span[0]; t < pl.span[1] + 1; t += 6) ts.push(t);
    let base: V3, up: V3, inw: V3, n: V3;
    if (k === "torso" || k === "head") { base = [pl.seam, 0, 0]; up = [0, 0, 1]; inw = [0, -1, 0]; n = [1, 0, 0]; }
    else { const fr = new Frame(J[BONES[k][0]], J[BONES[k][1]]); base = add(fr.A, scl(fr.f, pl.seam)); up = fr.u; inw = scl(fr.l, -1); n = fr.f; }
    const o = flank(p, base, inw, up, ts), ok = ts.map((_, i) => Number.isFinite(o[i]));
    const [c0, c1, tm] = fitLine(ts.filter((_, i) => ok[i]), o.filter((_, i) => ok[i]).map((x) => x + PROUD));
    const at = (t: number): V3 => sub(add(base, scl(up, t)), scl(inw, c0 + c1 * (t - tm)));
    const out = scl(inw, -1);
    for (const [side, sd] of [["left", 1], ["right", -1]] as const) {
      const m: V3 = [1, sd, 1], mm = (q: V3): V3 => [q[0] * m[0], q[1] * m[1], q[2] * m[2]];
      const link = k === "torso" ? `back_door_${side}` : k === "head" ? `helmet_door_${side}` : `${side}_${k}_door`;
      const parent = k === "torso" ? "pelvis" : k === "head" ? "head" : `${side}_${k}`;
      const top = mm(at(pl.span[0])), bot = mm(at(pl.span[1]));
      const axis = unit(k !== "torso" && k !== "head" ? sub(top, bot) : sub(bot, top)), nn = mm(n), oo = mm(out);
      const sign = dot(cross(axis, scl(oo, -1)), scl(nn, -1)) > 0 ? 1 : -1;
      doors.push({ name: link.replace("_door", ""), part: k, side, link, joint: `${link}_hinge`, parent, region: k === "torso" ? "torso" : k === "head" ? "head" : `${side}_${k}`,
        a: r3(top), up: r3(axis, 6), sign, normal: r3(nn, 6), out: r3(oo, 6), hinges: pl.hinges.map((t) => r3(mm(at(t)))), servo: { at: r3(mm(at(pl.servo[0]))), key: pl.servo[1] },
        latch_t: pl.latches.slice(), seam_up: r3(mm(up), 6), base: r3(mm(base)), open: OPEN });
    }
  }
  return doors;
}

function doorZones(k: string, p: Part, doors: DoorRecord[], wall: number, log: (s: string) => void): Record<string, () => Zone> {
  const pl = DOOR_PLAN[k], n = p.size;
  const field = (fn: (x: number, y: number, z: number) => number) => () => p.grid(fn);
  if (k === "torso") {
    return { door_left: () => ({ field: field((x, y) => Math.max(x - pl.seam, -y))(), surface: null, paint: null }),
      door_right: () => ({ field: field((x, y) => Math.max(x - pl.seam, y))(), surface: null, paint: null }), fixed: () => ({ field: field((x) => -(x - pl.seam))(), surface: null, paint: null }) };
  }
  if (k === "head") {
    const z = helmetZones(p, wall, log), red = z.fixedRed;
    return { mask: z.mask,
      fixed: () => { const f = new Float32Array(n); for (let q = 0; q < n; q++) f[q] = Math.max(-z.seam[q], -(p.at(q)[0] - pl.seam)); return { field: f, surface: null, paint: red }; },
      door_left: () => ({ field: field((x, y) => Math.max(x - pl.seam, -y))(), surface: null, paint: red }),
      door_right: () => ({ field: field((x, y) => Math.max(x - pl.seam, y))(), surface: null, paint: red }) };
  }
  const d = doors.find((x) => x.part === k && x.side === "left")!, s = (x: number, y: number, z: number) => (x - d.a[0]) * d.normal[0] + (y - d.a[1]) * d.normal[1] + (z - d.a[2]) * d.normal[2];
  return { door: () => ({ field: field(s)(), surface: null, paint: null }), fixed: () => ({ field: field((x, y, z) => -s(x, y, z))(), surface: null, paint: null }) };
}

/** where each part is open to the wearer */
function openings(k: string, p: Part): Float32Array[] {
  const Q: V3 = [0, 0, 0], cyl = (a: V3, b: V3, r: number) => p.grid((x, y, z) => { Q[0] = x; Q[1] = y; Q[2] = z; return segSd3(Q, a, b) - r; }), lerp = (a: V3, b: V3, t: number): V3 => add(a, scl(sub(b, a), t));
  if (k === "torso") { const o = [cyl([0, 0, 1500], [0, 0, 1700], 68)]; for (const s of [1, -1]) { o.push(cyl([0, s * 120, 1476], [0, s * 300, 1476], 66)); o.push(cyl([0, s * 84, 985], [0, s * 110, 740], 74)); } return o; }
  if (k === "head") return [cyl([0, 0, 1400], [0, 0, Z_CHIN + 40], 76)];
  if (k === "upper_arm") { const a = J.shoulder; return [cyl(add(a, [0, -130, 0]), add(a, [0, 8, -8]), 58), cyl(lerp(J.elbow, a, -0.3), lerp(J.elbow, a, 0.2), 42)]; }
  if (k === "forearm") { const e = J.elbow, w = J.wrist; return [cyl(lerp(e, w, -0.3), lerp(e, w, 0.045), 40), cyl(lerp(w, e, -0.3), lerp(w, e, 0.03), 36)]; }
  if (k === "hand") { const w = J.wrist, h = J.hand_end; return [cyl(lerp(w, h, -0.4), lerp(w, h, 0.02), 34)]; }
  if (k === "thigh") { const a = J.hip, b = J.knee; return [cyl(lerp(a, b, -0.3), lerp(a, b, -0.06), 62), cyl(lerp(b, a, -0.3), lerp(b, a, 0.04), 52)]; }
  if (k === "shin") { const a = J.knee, b = J.ankle; return [cyl(lerp(a, b, -0.3), lerp(a, b, 0.02), 50), cyl(lerp(b, a, -0.3), lerp(b, a, 0.02), 44)]; }
  if (k === "foot") return [cyl(add(J.ankle, [0, 0, 400]), add(J.ankle, [0, 0, -30]), 40)];
  return [];
}

const BUILD: Record<string, (c: Ctx) => Part> = { head, torso, upper_arm: upperArm, forearm, hand, thigh, shin, foot };
const MECH_LINK: Record<string, string> = { shoulder: "upper_arm", elbow: "forearm", wrist: "hand", hip: "thigh", knee: "shin", ankle: "foot" };

/** a flat disc: an n-gon prism about +z, centred */
function disc(r: number, h: number, sections: number): TriMesh {
  const v: number[] = [], f: number[] = [];
  for (let i = 0; i < sections; i++) { const a = (2 * Math.PI * i) / sections; v.push(r * cos(a), r * sin(a), -h / 2, r * cos(a), r * sin(a), h / 2); }
  v.push(0, 0, -h / 2, 0, 0, h / 2); const b = 2 * sections, t = b + 1;
  for (let i = 0; i < sections; i++) {
    const j = (i + 1) % sections, a0 = 2 * i, a1 = 2 * i + 1, b0 = 2 * j, b1 = 2 * j + 1;
    f.push(a0, b0, b1, a0, b1, a1, b, b0, a0, t, a1, b1);
  }
  return { v: Float64Array.from(v), f: Uint32Array.from(f) };
}
/** the mesh moved by the rows of a 3x4 [R | t] */
export function placed(m: TriMesh, R: number[][]): TriMesh {
  const v = new Float64Array(m.v.length);
  for (let i = 0; i < m.v.length; i += 3) for (let a = 0; a < 3; a++) v[i + a] = R[a][0] * m.v[i] + R[a][1] * m.v[i + 1] + R[a][2] * m.v[i + 2] + R[a][3];
  return { v, f: m.f };
}

export interface ForgedPiece { name: string; link: string; material: string; region: string; mesh: TriMesh; }
export interface Forged { pieces: ForgedPiece[]; doors: DoorRecord[]; log: string[]; }

/** Every printed shell of the suit as forge_mark43.py --print writes it (pack.json + pack_<name>.stl), in the same order. */
export async function forgePrint(params: ForgeParams = {}, tick: Tick = () => {}, only?: string[]): Promise<Forged> {
  const c = ctxOf(params), log: string[] = [], say = (s: string) => { log.push(s); };
  const pieces: ForgedPiece[] = [];
  const put = (name: string, link: string, material: string, region: string, mesh: TriMesh) => { pieces.push({ name, link, material, region, mesh }); };
  const both = (name: string, link: string, mat: string, region: string, m: TriMesh) => { put(`left_${name}`, `left_${link}`, mat, `left_${region}`, m); put(`right_${name}`, `right_${link}`, mat, `right_${region}`, mirrorY(m)); };
  // each door's hinge line comes from its part's field, before the reactor is set in the chest (it lies far from the flanks)
  const doors: DoorRecord[] = [];
  for (const k of only ?? Object.keys(BUILD)) {
    const p = BUILD[k](c); await tick(`${k} field`);
    if (k in DOOR_PLAN) doors.push(...doorRecords({ [k]: p }));
    if (k === "torso") reactor(c, p);
    const wall = k === "head" ? MASK_WALL : 3.0, zones = k in DOOR_PLAN ? doorZones(k, p, doors, wall, say) : undefined;
    const shells = await printable(p, openings(k, p), tick, wall, 0.3, [235, 205, 215], zones);
    shells.forEach((s, i) => {
      if (k === "torso") return put(`torso_${i}`, s.zone === "door_left" ? "back_door_left" : s.zone === "door_right" ? "back_door_right" : "pelvis", NAMES[s.colour], "torso", s.mesh);
      if (k === "head") return put(`helmet_${i}`, s.zone === "mask" ? "helmet_faceplate" : s.zone === "door_left" ? "helmet_door_left" : s.zone === "door_right" ? "helmet_door_right" : "head", NAMES[s.colour], "head", s.mesh);
      both(`${k}_${i}`, k + (s.zone === "door" ? "_door" : ""), NAMES[s.colour], k, s.mesh);
    });
    say(`${k} ${pieces.length}`);
  }
  const order = Object.keys(DOOR_PLAN); doors.sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part));
  if (!only) {
    for (const [n, p] of jointMech(c)) {
      const ax: Record<string, [V3, V3]> = { shoulder: [add(J.shoulder, [0, -160, 0]), add(J.shoulder, [0, 110, -14])], elbow: [J.shoulder, J.wrist], wrist: [J.elbow, J.hand_end], hip: [add(J.hip, [0, 0, 200]), J.knee], knee: [J.hip, J.ankle], ankle: [add(J.ankle, [0, 0, 300]), add(J.ankle, [0, 0, -120])] };
      const r = { shoulder: 52, elbow: 44, wrist: 34, hip: 58, knee: 54, ankle: 42 }[n]!, k = MECH_LINK[n], d = doors.find((x) => x.part === k && x.side === "left");
      const sd = (x: number, y: number, z: number) => (d ? (x - d.a[0]) * d.normal[0] + (y - d.a[1]) * d.normal[1] + (z - d.a[2]) * d.normal[2] : 0);
      const zones = d ? { door: () => ({ field: p.grid(sd), surface: null, paint: null }), fixed: () => ({ field: p.grid((x, y, z) => -sd(x, y, z)), surface: null, paint: null }) } : undefined;
      const shells = await printable(p, [p.grid((x, y, z) => segSd3([x, y, z], ax[n][0], ax[n][1]) - r)], tick, 2.5, 0.3, [400, 400, 400], zones);
      shells.forEach((s, i) => both(`mech_${n}_${i}`, k + (s.zone === "door" ? "_door" : ""), "armour_mech", `mech_${n}`, s.mesh));
    }
    // the glowing parts: reactor core, palm repulsors
    put("reactor_lens", "pelvis", "lens_glow", "torso", placed(disc(33, 3, 64), [[0, 0, 1, 141], [0, 1, 0, 0], [-1, 0, 0, 1375]]));
    const fr = new Frame(J.wrist, J.hand_end), z = scl(fr.l, -1), y = cross(z, fr.f), o = sub(add(fr.A, scl(fr.u, 76)), scl(fr.l, 41));
    const palm = placed(disc(22, 2.5, 48), [0, 1, 2].map((a) => [fr.f[a], y[a], z[a], o[a]]));
    put("left_palm_lens", "left_hand", "lens_glow", "left_hand", palm); put("right_palm_lens", "right_hand", "lens_glow", "right_hand", mirrorY(palm));
  }
  say(`${pieces.length} pieces`);
  return { pieces, doors, log };
}

/** A quick look at the suit while the full forge runs: every part's outer surface at a coarse voxel (4 mm), one mesh per colour, limbs
 *  mirrored, no hollowing, doors or trims. It is drawn while the real pieces are made, then replaced by them. */
export async function forgePreview(params: ForgeParams = {}, tick: Tick = () => {}): Promise<{ material: string; mesh: TriMesh }[]> {
  const c = { ...ctxOf(params), v: 4 }, out: { material: string; mesh: TriMesh }[] = [];
  for (const k of Object.keys(BUILD)) {
    const p = BUILD[k](c);
    if (k === "torso") reactor(c, p);
    for (const col of [RED, GOLD, STEEL, LENS]) {
      const m = new Float32Array(p.size); let any = false;
      for (let q = 0; q < p.size; q++) if (p.col[q] === col) { m[q] = 1; any = true; }
      if (!any && col !== RED) continue;
      const e = gauss3(m, p.shape, 0.6), f = new Float32Array(p.size);
      for (let q = 0; q < p.size; q++) { const ee = col === RED && p.col[q] === RED ? 1 : e[q] - 0.5; f[q] = Math.max(p.d[q], -ee * p.v * 2 + 0.3); }
      const mesh = marchingCubes(f, p.shape, 0, p.v, [p.ax[0][0], p.ax[1][0], p.ax[2][0]]);
      if (!mesh.f.length) continue;
      const o = signedVolume(mesh) < 0 ? flip(mesh) : mesh;
      out.push({ material: NAMES[col], mesh: o });
      if (k !== "head" && k !== "torso") out.push({ material: NAMES[col], mesh: mirrorY(o) });
    }
    await tick(`${k} preview`);
  }
  return out;
}
/** one part's field and paint, as forge_mark43.py's BUILD[k](v) makes it (for tests against the Python reference) */
export const buildPart = (k: string, params: ForgeParams = {}): Part => BUILD[k](ctxOf(params));
