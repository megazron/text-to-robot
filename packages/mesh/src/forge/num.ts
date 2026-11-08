// Numerical tools of the armour forge, written to give what scipy and numpy give the Python reference (scripts/forge_mark43.py):
// Gaussian and maximum filters on a 3D grid (scipy.ndimage, mode "reflect"), numpy.gradient, trilinear sampling
// (scipy map_coordinates, order 1, mode "nearest") and the monotone cubic of scipy's PchipInterpolator.

/** A field on a regular grid, C order (x slowest, z fastest), as numpy keeps it. */
export interface Grid { data: Float32Array; shape: [number, number, number]; }

const reflectIndex = (i: number, n: number): number => {
  // scipy "reflect": d c b a | a b c d | d c b a
  if (n === 1) return 0;
  const p = 2 * n;
  i %= p; if (i < 0) i += p;
  return i < n ? i : p - 1 - i;
};

function kernel(sigma: number): Float64Array {
  const r = Math.floor(4 * sigma + 0.5), k = new Float64Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { const w = exp(-0.5 * (i * i) / (sigma * sigma)); k[i + r] = w; s += w; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}

/** Out-of-place 1D correlation of the grid with weights w (centre at index r) along one axis, boundaries by `idx`.
 *  Runs over whole contiguous rows, so the strided axes stay cache friendly. */
function correlate(src: Float32Array, shape: [number, number, number], axis: number, w: Float64Array, idx: (i: number, n: number) => number): Float32Array {
  const [nx, ny, nz] = shape, out = new Float32Array(src.length), r = (w.length - 1) / 2;
  if (axis === 2) {
    const row = new Float64Array(nz + 2 * r);
    for (let o = 0; o < nx * ny * nz; o += nz) {
      for (let i = -r; i < nz + r; i++) row[i + r] = src[o + idx(i, nz)];
      for (let i = 0; i < nz; i++) { let s = 0; for (let q = 0; q < w.length; q++) s += w[q] * row[i + q]; out[o + i] = s; }
    }
    return out;
  }
  const plane = axis === 0 ? ny * nz : nz, n = shape[axis], outer = axis === 0 ? 1 : nx, block = axis === 0 ? nx * ny * nz : ny * nz;
  const acc = new Float64Array(plane);
  for (let b = 0; b < outer; b++) {
    const base = b * block;
    for (let i = 0; i < n; i++) {
      acc.fill(0);
      for (let q = 0; q < w.length; q++) {
        const wq = w[q], so = base + idx(i + q - r, n) * plane;
        for (let e = 0; e < plane; e++) acc[e] += wq * src[so + e];
      }
      const oo = base + i * plane;
      for (let e = 0; e < plane; e++) out[oo + e] = acc[e];
    }
  }
  return out;
}
const nearestIndex = (i: number, n: number) => Math.min(n - 1, Math.max(0, i));

/** scipy.ndimage.gaussian_filter1d along one axis, mode "reflect" or "nearest" */
export function gauss1(src: Float32Array, shape: [number, number, number], axis: number, sigma: number, mode: "reflect" | "nearest" = "reflect"): Float32Array {
  if (sigma <= 0) return src.slice();
  return correlate(src, shape, axis, kernel(sigma), mode === "reflect" ? reflectIndex : nearestIndex);
}

/** scipy.ndimage.gaussian_filter (sigma in voxels, the same on every axis, truncate 4) */
export function gauss3(src: Float32Array, shape: [number, number, number], sigma: number): Float32Array {
  let a = src;
  for (let ax = 0; ax < 3; ax++) a = gauss1(a, shape, ax, sigma);
  return a;
}

/** scipy.ndimage.maximum_filter with a cube of `size`, mode "reflect" */
export function maxFilter3(src: Float32Array, shape: [number, number, number], size: number): Float32Array {
  const lo = Math.floor(size / 2), hi = size - 1 - lo, [nx, ny, nz] = shape;
  let a = src;
  for (let axis = 0; axis < 3; axis++) {
    const out = new Float32Array(a.length).fill(-Infinity), cur = a;
    if (axis === 2) {
      for (let o = 0; o < nx * ny * nz; o += nz) for (let i = 0; i < nz; i++) { let m = -Infinity; for (let q = -lo; q <= hi; q++) { const x = cur[o + reflectIndex(i + q, nz)]; if (x > m) m = x; } out[o + i] = m; }
    } else {
      const plane = axis === 0 ? ny * nz : nz, n = shape[axis], outer = axis === 0 ? 1 : nx, block = axis === 0 ? nx * ny * nz : ny * nz;
      for (let b = 0; b < outer; b++) for (let i = 0; i < n; i++) {
        const oo = b * block + i * plane;
        for (let q = -lo; q <= hi; q++) { const so = b * block + reflectIndex(i + q, n) * plane; for (let e = 0; e < plane; e++) if (cur[so + e] > out[oo + e]) out[oo + e] = cur[so + e]; }
      }
    }
    a = out;
  }
  return a;
}

/** |numpy.gradient(f, v)| on every voxel */
export function gradientNorm(f: Float32Array, shape: [number, number, number], v: number): Float32Array {
  const [nx, ny, nz] = shape, st = [ny * nz, nz, 1], out = new Float32Array(f.length), n = [nx, ny, nz];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    const p = i * st[0] + j * st[1] + k, idx = [i, j, k];
    let s = 0;
    for (let a = 0; a < 3; a++) {
      const c = idx[a], m = n[a];
      let g: number;
      if (m < 2) g = 0;
      else if (c === 0) g = (f[p + st[a]] - f[p]) / v;
      else if (c === m - 1) g = (f[p] - f[p - st[a]]) / v;
      else g = (f[p + st[a]] - f[p - st[a]]) / (2 * v);
      s += g * g;
    }
    out[p] = Math.sqrt(s);
  }
  return out;
}

/** scipy.ndimage.map_coordinates, order 1, mode "nearest", at continuous grid coordinates (ci, cj, ck) */
export function trilinear(f: Float32Array, shape: [number, number, number], ci: number, cj: number, ck: number): number {
  const [nx, ny, nz] = shape;
  const cl = (c: number, n: number) => Math.min(n - 1, Math.max(0, c));
  ci = cl(ci, nx); cj = cl(cj, ny); ck = cl(ck, nz);
  const i0 = Math.min(Math.floor(ci), nx - 1), j0 = Math.min(Math.floor(cj), ny - 1), k0 = Math.min(Math.floor(ck), nz - 1);
  const i1 = Math.min(i0 + 1, nx - 1), j1 = Math.min(j0 + 1, ny - 1), k1 = Math.min(k0 + 1, nz - 1);
  const fi = ci - i0, fj = cj - j0, fk = ck - k0, s0 = ny * nz;
  const at = (i: number, j: number, k: number) => f[i * s0 + j * nz + k];
  const c00 = at(i0, j0, k0) * (1 - fk) + at(i0, j0, k1) * fk, c01 = at(i0, j1, k0) * (1 - fk) + at(i0, j1, k1) * fk;
  const c10 = at(i1, j0, k0) * (1 - fk) + at(i1, j0, k1) * fk, c11 = at(i1, j1, k0) * (1 - fk) + at(i1, j1, k1) * fk;
  return (c00 * (1 - fj) + c01 * fj) * (1 - fi) + (c10 * (1 - fj) + c11 * fj) * fi;
}

/** scipy.interpolate.PchipInterpolator through (x, y), x increasing */
export function pchip(x: number[], y: number[]): (t: number) => number {
  const n = x.length, h: number[] = [], m: number[] = [], d = new Array<number>(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h.push(x[i + 1] - x[i]); m.push((y[i + 1] - y[i]) / h[i]); }
  if (n === 2) { d[0] = d[1] = m[0]; }
  else {
    for (let k = 1; k < n - 1; k++) {
      const m0 = m[k - 1], m1 = m[k];
      if (Math.sign(m0) !== Math.sign(m1) || m0 === 0 || m1 === 0) d[k] = 0;
      else { const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1]; d[k] = (w1 + w2) / (w1 / m0 + w2 / m1); }
    }
    const edge = (h0: number, h1: number, m0: number, m1: number) => {
      let e = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
      if (Math.sign(e) !== Math.sign(m0)) e = 0;
      else if (Math.sign(m0) !== Math.sign(m1) && Math.abs(e) > Math.abs(3 * m0)) e = 3 * m0;
      return e;
    };
    d[0] = edge(h[0], h[1], m[0], m[1]); d[n - 1] = edge(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
  }
  return (t: number) => {
    let i = 0;
    if (t >= x[n - 1]) i = n - 2;
    else if (t > x[0]) { let lo = 0, hi = n - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (x[md] <= t) lo = md; else hi = md; } i = lo; }
    const hh = h[i], s = (t - x[i]) / hh, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * hh * d[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * hh * d[i + 1];
  };
}

/** numpy.percentile (linear) of the values */
export function percentile(a: ArrayLike<number>, q: number): number {
  const s = Float64Array.from(a).sort(); if (!s.length) return Number.NaN;
  const r = (q / 100) * (s.length - 1), i = Math.floor(r);
  return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * (r - i) : s[i];
}import { exp } from "./dmath.ts";

