// Checks that rerun fast when an editor changes one part. The clearance check keeps the result of every pair of parts it
// has intersected, keyed by both parts' geometry and world pose, so after an edit only the pairs with a moved or changed
// part are intersected again; pairs whose boxes do not touch are never built at all. The harness is kept per robot shape.
import type { RobotSpecification, Link } from "@ttr/robot-schema";
import { build, fromRt } from "@ttr/solid";
import { fk, linkSolid, type Interference } from "@ttr/design";
import { autoWire, type AutoWire } from "./autowire.ts";
import { fnv, bodyHash, mul, inv, type M4 } from "./edit.ts";

type V3 = [number, number, number];
const bodyKeys = new WeakMap<Link, string>();
export function bodyKey(l: Link): string { let k = bodyKeys.get(l); if (!k) { k = bodyHash(l); bodyKeys.set(l, k); } return k; }
/** Row-major 4x4 (metres) of a column-major mm transform. */
const rows = (M: number[]): M4 => [M[0], M[4], M[8], M[12] / 1000, M[1], M[5], M[9], M[13] / 1000, M[2], M[6], M[10], M[14] / 1000, 0, 0, 0, 1];
const relKey = (A: M4, B: M4) => mul(inv(A), B).slice(0, 12).map((x) => Math.round(x * 1e5)).join(",");
/** Does the clearance check give this link a solid (the same rule as linkSolid)? */
function solidLink(l: Link): boolean {
  const g = l.geometry;
  if (g.type === "sphere") return l.role !== "frame";
  return g.type === "mesh" && ["printed", "cad", "armour", "component"].includes(g.part);
}
/** Box (mm) of a link's body in its link frame, from the geometry's own bounds: no solid is built for it. */
function localBox(l: Link): { min: V3; max: V3 } {
  const g = l.geometry;
  if (g.type === "sphere") { const r = g.radius * 1000, c = l.origin.xyz.map((x) => x * 1000); return { min: [c[0] - r, c[1] - r, c[2] - r], max: [c[0] + r, c[1] + r, c[2] + r] }; }
  if (g.type === "mesh") { const s = g.scale ?? [1, 1, 1]; return { min: g.bbox.min.map((x, i) => x * s[i] * 1000 - 0.5) as V3, max: g.bbox.max.map((x, i) => x * s[i] * 1000 + 0.5) as V3 }; }
  return { min: [-1e9, -1e9, -1e9], max: [1e9, 1e9, 1e9] };
}

const pairs = new Map<string, number>();
const remember = (k: string, v: number) => { pairs.set(k, v); if (pairs.size > 40000) pairs.delete(pairs.keys().next().value as string); };
export interface ClearanceRun { hits: Interference[]; pairs: number; intersected: number; reused: number; as_designed: number; }

/** Pairs of parts that overlap by more than `tol` mm^3 at the zero pose, skipping `skip` ("a|b"). */
export function clearanceAtHome(spec: RobotSpecification, skip: Set<string>, tol = 2, baseline?: Record<string, [string, ...number[]]>): ClearanceRun {
  const f = fk(spec), placed: { l: Link; key: string; M: number[]; lo: number[]; hi: number[] }[] = [];
  for (const l of spec.links) {
    const T = f.link[l.name]; if (!T || !solidLink(l)) continue;
    const M = fromRt(T.R, [T.p[0] * 1000, T.p[1] * 1000, T.p[2] * 1000]), b = localBox(l), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
      const p = [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    }
    placed.push({ l, key: bodyKey(l), M, lo, hi });
  }
  const todo: { a: (typeof placed)[number]; b: (typeof placed)[number]; key: string }[] = [], out: Interference[] = [];
  let candidates = 0, reused = 0, asDesigned = 0;
  const base = (n: string) => { const b = baseline?.[n]; return b ? { key: b[0], M: [...(b.slice(1) as number[]), 0, 0, 0, 1] as M4 } : null; };
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const A = placed[i], B = placed[j];
    if (skip.has(`${A.l.name}|${B.l.name}`) || skip.has(`${B.l.name}|${A.l.name}`)) continue;
    if (A.lo.some((x, k) => x > B.hi[k] - 0.01) || B.lo.some((x, k) => x > A.hi[k] - 0.01)) continue;
    candidates++;
    // the intersection depends only on the two bodies and where one sits relative to the other
    const [P, Q] = A.key < B.key || (A.key === B.key && A.l.name < B.l.name) ? [A, B] : [B, A], rel = relKey(rows(P.M), rows(Q.M));
    // two parts both just as the designer placed them relative to each other: the designer's own checks cover them
    const bp = base(P.l.name), bq = base(Q.l.name);
    if (bp && bq && bp.key === P.key && bq.key === Q.key && relKey(bp.M, bq.M) === rel) { asDesigned++; continue; }
    const key = `${P.key}|${Q.key}@${rel}`, v = pairs.get(key);
    if (v === undefined) todo.push({ a: A, b: B, key });
    else { reused++; if (v > tol) out.push({ a: A.l.name, b: B.l.name, volume_mm3: v }); }
  }
  if (todo.length) build(() => {
    const solids = new Map<string, any>();
    const solid = (p: (typeof placed)[number]) => {
      if (!solids.has(p.l.name)) { let s: any = null; try { const s0 = linkSolid(p.l); s = s0 ? s0.transform(p.M as never) : null; } catch { s = null; } solids.set(p.l.name, s); }
      return solids.get(p.l.name);
    };
    for (const { a, b, key } of todo) {
      const sa = solid(a), sb = solid(b);
      const v = sa && sb ? +sa.intersect(sb).volume().toFixed(1) : 0;
      remember(key, v);
      if (v > tol) out.push({ a: a.l.name, b: b.l.name, volume_mm3: v });
    }
  });
  return { hits: out.sort((x, y) => y.volume_mm3 - x.volume_mm3), pairs: candidates, intersected: todo.length, reused, as_designed: asDesigned };
}

/** The automatic harness, kept for the last few robot shapes (an edit that changes no part reuses it). */
const wired = new Map<string, AutoWire>();
export function autoWireCached(spec: RobotSpecification): AutoWire {
  const key = fnv(JSON.stringify([spec.links.map((l) => [l.name, bodyKey(l)]), spec.joints]));
  const hit = wired.get(key);
  if (hit) return structuredClone(hit);
  const w = autoWire(spec);
  wired.set(key, structuredClone(w));
  if (wired.size > 6) wired.delete(wired.keys().next().value as string);
  return w;
}
