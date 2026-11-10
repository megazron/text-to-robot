// Polylines of wires: fewer guide points, corners rounded to a bend radius, lengths.
import { add, sub, scale, dot, cross, len, unit, lerp, type V3 } from "./geom.ts";

/**
 * Round each corner whose two neighbours ride on the same body: an arc tangent to both legs with the given radius,
 * or the largest that fits half of the shorter leg. The arc's radius is kept for the bend check.
 */
/**
 * Fewer guide points: inside each run on one body, points within `tol` mm of the line through their neighbours go
 * (Douglas-Peucker); a body change is always kept. A cable does not pass exactly through every route waypoint.
 */
export function simplify(pts: V3[], body: string[], tol: number): { pts: V3[]; body: string[] } {
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  for (let i = 1; i < pts.length; i++) if (body[i] !== body[i - 1]) { keep[i] = keep[i - 1] = true; }
  const dp = (a: number, b: number) => {
    let best = -1, bd = tol; const ab = sub(pts[b], pts[a]), L = len(ab) || 1;
    for (let i = a + 1; i < b; i++) { const d = len(cross(sub(pts[i], pts[a]), ab)) / L; if (d > bd) { bd = d; best = i; } }
    if (best >= 0) { keep[best] = true; dp(a, best); dp(best, b); }
  };
  let a = 0; for (let i = 1; i < pts.length; i++) if (keep[i]) { dp(a, i); a = i; }
  const P: V3[] = [], B: string[] = [];
  pts.forEach((p, i) => { if (keep[i] && (!P.length || len(sub(p, P[P.length - 1])) > 0.5 || B[B.length - 1] !== body[i])) { P.push(p); B.push(body[i]); } });
  return { pts: P, body: B };
}
export function fillet(pts: V3[], body: string[], r: number): { pts: V3[]; body: string[]; radii: number[] } {
  const P: V3[] = [], Bd: string[] = []; pts.forEach((p, i) => { if (!P.length || len(sub(p, P[P.length - 1])) > 0.05) { P.push(p); Bd.push(body[i]); } });
  const n = P.length, want = new Array(n).fill(0), half = new Array(n).fill(0);
  const legs = P.slice(1).map((p, i) => len(sub(p, P[i])));
  const corner = (i: number) => i > 0 && i < n - 1 && Bd[i - 1] === Bd[i] && Bd[i + 1] === Bd[i];
  for (let i = 1; i < n - 1; i++) {
    if (!corner(i)) continue;
    const a = unit(sub(P[i - 1], P[i])), c = unit(sub(P[i + 1], P[i])), th = Math.acos(Math.max(-1, Math.min(1, dot(a, c))));
    if (th > Math.PI - 0.02) continue;
    half[i] = th / 2; want[i] = r / Math.tan(th / 2);
  }
  // each leg is shared by the corners at its two ends, in proportion to what each wants
  const t = want.map((x, i) => { if (!x) return 0; const k = (leg: number, other: number) => Math.min(1, (leg * 0.98) / (x + other)); return x * Math.min(k(legs[i - 1], want[i - 1] ?? 0), k(legs[i], want[i + 1] ?? 0)); });
  const out: V3[] = [], ob: string[] = [], radii: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!t[i]) { out.push(P[i]); ob.push(Bd[i]); continue; }
    const a = unit(sub(P[i - 1], P[i])), c = unit(sub(P[i + 1], P[i])), rr = t[i] * Math.tan(half[i]);
    radii.push(rr);
    const s0 = add(P[i], scale(a, t[i])), e0 = add(P[i], scale(c, t[i])), centre = add(P[i], scale(unit(add(a, c)), rr / Math.sin(half[i])));
    // evenly round the arc (slerp), at most 0.2 rad a step
    const va = sub(s0, centre), vb = sub(e0, centre), phi = Math.acos(Math.max(-1, Math.min(1, dot(va, vb) / (rr * rr || 1)))), m = Math.max(2, Math.ceil(phi / 0.2)), sp = Math.sin(phi);
    for (let k = 0; k <= m; k++) { const t2 = k / m, q = sp < 1e-6 ? lerp(va, vb, t2) : add(scale(va, Math.sin((1 - t2) * phi) / sp), scale(vb, Math.sin(t2 * phi) / sp)); out.push(add(centre, q)); ob.push(Bd[i]); }
  }
  return { pts: out, body: ob, radii };
}
/** length of a polyline */
export const polyLen = (pts: V3[]) => { let L = 0; for (let i = 1; i < pts.length; i++) L += len(sub(pts[i], pts[i - 1])); return L; };
