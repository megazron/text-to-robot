// Higher-level modelling helpers on top of core.ts.
import { type Mesh, type V3, loft, shell, subdivide, merge, translate, rotate, revolve, add, sub, mul, norm, cross, empty, orient } from "./core.ts";

/** Resample a polyline (open or closed) to exactly n points by arc length. */
export function resample(pts: V3[], n: number, closed = false): V3[] {
  const P = closed ? [...pts, pts[0]] : pts; const seg: number[] = [0];
  for (let i = 1; i < P.length; i++) seg.push(seg[i - 1] + Math.hypot(...sub(P[i], P[i - 1])));
  const L = seg[seg.length - 1]; const out: V3[] = []; const count = closed ? n : n; const denom = closed ? n : n - 1;
  for (let k = 0; k < count; k++) {
    const t = (L * k) / denom; let i = 1; while (i < seg.length - 1 && seg[i] < t) i++;
    const a = P[i - 1], b = P[i]; const u = seg[i] - seg[i - 1] > 1e-12 ? (t - seg[i - 1]) / (seg[i] - seg[i - 1]) : 0;
    out.push(add(a, mul(sub(b, a), u)));
  }
  return out;
}

/** An arc of a superellipse in the XY plane at height z, from angle a0 to a1 (radians), n points.
 *  fx/fy scale the front (x) and side (y) extents; e = exponent (2 round, 3+ angular). */
export function superArc(rx: number, ry: number, z: number, a0: number, a1: number, n: number, e = 2.4, xOffset = 0): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = a0 + ((a1 - a0) * i) / (n - 1); const ct = Math.cos(t), st = Math.sin(t);
    pts.push([xOffset + Math.sign(ct) * Math.pow(Math.abs(ct), 2 / e) * rx, Math.sign(st) * Math.pow(Math.abs(st), 2 / e) * ry, z]);
  }
  return pts;
}

/** Smooth open surface from sections, then give it thickness. */
export function shelledLoft(sections: V3[][], thickness: number, smooth = 1): Mesh {
  const surf = loft(sections, { closed: false });
  const s = smooth > 0 ? subdivide(surf, smooth) : surf;
  return shell(s, thickness);
}

/** A curved, bevelled armour panel from a 2D outline in the (u,v) plane, wrapped onto a cylinder of radius R
 *  (axis along v). Returns a closed solid `thick` deep with a chamfered rim. Outline in metres, CCW. */
export function curvedPlate(outline: [number, number][], thick: number, R: number, bevel = 0.004, smooth = 0): Mesh {
  const wrap = (u: number, v: number, d: number): V3 => {   // d = depth below outer surface
    if (!isFinite(R) || R <= 0) return [-d, u, v];
    const a = u / R; return [(R - d) * Math.cos(a) - R, (R - d) * Math.sin(a), v];
  };
  // the faces are a row/column grid over the (bevel-inset) outline so they follow the cylinder and shade
  // smoothly; the grid boundary doubles as the rim ring, pushed back out by the bevel for the chamfer
  const g = gridFill(insetOutline(outline, bevel), 9, 11);
  const rim = insetOutline(g.ring, -bevel);
  const rings: V3[][] = [
    g.ring.map(([u, v]) => wrap(u, v, 0)),                  // outer face edge
    rim.map(([u, v]) => wrap(u, v, bevel)),                 // rim after chamfer
    rim.map(([u, v]) => wrap(u, v, thick - bevel)),         // rim before back chamfer
    g.ring.map(([u, v]) => wrap(u, v, thick)),              // back face edge
  ];
  const sides = loft(rings, { closed: true });
  const face = (d: number): Mesh => ({ v: g.points.map(([u, v]) => wrap(u, v, d)), f: g.faces.map((f) => [...f] as [number, number, number]) });
  const m = orient(merge(sides, face(0), face(thick)));
  return smooth ? subdivide(m, smooth) : m;
}

/**
 * Fill a convex closed outline with a grid: `rows` horizontal rows (cosine-spaced so the corners are
 * resolved) each sampled at `cols` points between the outline's left and right crossings. Returns the
 * points, the grid triangles and the boundary ring (CCW) made of the row end points.
 */
export function gridFill(outline: [number, number][], cols = 9, rows = 11): { points: [number, number][]; faces: [number, number, number][]; ring: [number, number][] } {
  const vs = outline.map((p) => p[1]); const vmin = Math.min(...vs), vmax = Math.max(...vs); const eps = (vmax - vmin) * 1e-3;
  const crossings = (v: number): [number, number] => {
    let lo = Infinity, hi = -Infinity; const n = outline.length;
    for (let i = 0; i < n; i++) {
      const a = outline[i], b = outline[(i + 1) % n];
      if ((a[1] <= v && b[1] >= v) || (b[1] <= v && a[1] >= v)) {
        if (Math.abs(b[1] - a[1]) < 1e-12) { lo = Math.min(lo, a[0], b[0]); hi = Math.max(hi, a[0], b[0]); }
        else { const t = (v - a[1]) / (b[1] - a[1]); const u = a[0] + t * (b[0] - a[0]); lo = Math.min(lo, u); hi = Math.max(hi, u); }
      }
    }
    if (!isFinite(lo)) return [0, 0]; if (hi - lo < eps) { const c = (lo + hi) / 2; return [c - eps, c + eps]; }
    return [lo, hi];
  };
  const points: [number, number][] = []; const faces: [number, number, number][] = [];
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1); const v = vmin + eps + (vmax - vmin - 2 * eps) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    const [lo, hi] = crossings(v);
    for (let i = 0; i < cols; i++) points.push([lo + ((hi - lo) * i) / (cols - 1), v]);
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols + 1, d = a + cols; faces.push([a, b, c], [a, c, d]);
  }
  // boundary ring, CCW: bottom row left->right, right ends upward, top row right->left, left ends downward
  const ring: [number, number][] = [];
  for (let i = 0; i < cols; i++) ring.push(points[i]);
  for (let j = 1; j < rows; j++) ring.push(points[j * cols + cols - 1]);
  for (let i = cols - 2; i >= 0; i--) ring.push(points[(rows - 1) * cols + i]);
  for (let j = rows - 2; j >= 1; j--) ring.push(points[j * cols]);
  return { points, faces, ring };
}

/** Inset a CCW polygon by k (approximate, via vertex normals in-plane). */
export function insetOutline(poly: [number, number][], k: number): [number, number][] {
  const n = poly.length; const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p = poly[(i - 1 + n) % n], c = poly[i], q = poly[(i + 1) % n];
    const e1 = [c[0] - p[0], c[1] - p[1]], e2 = [q[0] - c[0], q[1] - c[1]];
    const n1 = norm2([e1[1], -e1[0]]), n2 = norm2([e2[1], -e2[0]]);   // right-hand normals (inward for CCW)
    const nn = norm2([n1[0] + n2[0], n1[1] + n2[1]]); const cosHalf = Math.max(0.3, nn[0] * n1[0] + nn[1] * n1[1]);
    out.push([c[0] + (nn[0] * k) / cosHalf, c[1] + (nn[1] * k) / cosHalf]);
  }
  return out;
}
const norm2 = (v: number[]) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

/** Tapered, faceted limb shell (e.g. thigh/shin/forearm armour): rings of radius r(z) with an angular cross-section,
 *  covering an angular range (partial sleeve) or full. Open at both ends, shelled. */
export function limbShell(length: number, rTop: number, rBottom: number, opts: { e?: number; a0?: number; a1?: number; n?: number; rings?: number; thick?: number; bulge?: number; smooth?: number } = {}): Mesh {
  const e = opts.e ?? 2.8, a0 = opts.a0 ?? -Math.PI, a1 = opts.a1 ?? Math.PI, n = opts.n ?? 24, rings = opts.rings ?? 6, thick = opts.thick ?? 0.004, bulge = opts.bulge ?? 0.08;
  const full = Math.abs(a1 - a0 - 2 * Math.PI) < 1e-9; const sections: V3[][] = [];
  for (let k = 0; k < rings; k++) {
    const t = k / (rings - 1); const z = -length * t; const r = rTop + (rBottom - rTop) * t + bulge * rTop * Math.sin(Math.PI * t);
    const arc = superArc(r, r, z, a0, full ? a1 - (a1 - a0) / n : a1, n, e); sections.push(arc);
  }
  const surf = loft(sections, { closed: full }); const s = opts.smooth ? subdivide(surf, opts.smooth) : surf;
  return shell(s, thick);
}

/** Dome cap (revolved) -- pauldrons, knee caps, ear pods. */
export function dome(radius: number, height: number, segments = 28, rings = 6, rimThick = 0.004): Mesh {
  const profile: [number, number][] = [];
  for (let i = 0; i <= rings; i++) { const t = i / rings; const a = (Math.PI / 2) * (1 - t); profile.push([radius * Math.cos(a) * 1.0, height * Math.sin(a)]); }
  const outer = revolve(profile, segments, 2 * Math.PI, false);
  return shell(outer, rimThick);
}

/** Disc with chamfer (ear pod, repulsor lens), axis Z, centred at origin. */
export function disc(radius: number, depth: number, chamfer = 0.003, segments = 32): Mesh {
  const prof: [number, number][] = [[0, depth], [radius - chamfer, depth], [radius, depth - chamfer], [radius, 0], [0, 0]];
  return revolve(prof, segments, 2 * Math.PI, true);
}

export { merge, translate, rotate, empty };
