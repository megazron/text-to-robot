// The solids a wire must stay out of, at the home pose in the world frame (mm): every printed, fabricated and plain link
// as its closed triangle mesh, every bought part as its body box (the same box the interference checks use).
import type { RobotSpecification, Link } from "@ttr/robot-schema";
import { part } from "@ttr/parts";
import { buildPart } from "@ttr/mesh";
import { rpyToR } from "../kin.ts";
import { apply, I3, type Tf, type Box3 } from "./place.ts";
import type { V3 } from "./geom.ts";

/** unit shapes as closed meshes, for links that are a plain box, cylinder, capsule or sphere */
function primitive(g: { type: string; size?: V3; radius?: number; length?: number }): { v: V3[]; f: [number, number, number][] } | null {
  const v: V3[] = [], f: [number, number, number][] = [];
  if (g.type === "box" && g.size) {
    const [x, y, z] = g.size.map((s) => s / 2);
    for (let k = 0; k < 8; k++) v.push([k & 1 ? x : -x, k & 2 ? y : -y, k & 4 ? z : -z]);
    f.push([0, 2, 1], [1, 2, 3], [4, 5, 6], [5, 7, 6], [0, 1, 4], [1, 5, 4], [2, 6, 3], [3, 6, 7], [0, 4, 2], [2, 4, 6], [1, 3, 5], [3, 7, 5]);
    return { v, f };
  }
  if ((g.type === "sphere" || g.type === "cylinder" || g.type === "capsule") && g.radius) {
    // rings of 16 points along z: a cylinder is two rings, a sphere or a capsule's caps seven rings a hemisphere
    const r = g.radius, h = g.type === "sphere" ? 0 : (g.length ?? 0) / 2, n = 16, rings: [number, number][] = [];
    const cap = g.type !== "cylinder";
    if (cap) for (let q = 6; q >= 1; q--) { const a = (q / 7) * (Math.PI / 2); rings.push([-h - r * Math.sin(a), r * Math.cos(a)]); }
    rings.push([-h, r]); if (h > 0) rings.push([h, r]);
    if (cap) for (let q = 1; q <= 6; q++) { const a = (q / 7) * (Math.PI / 2); rings.push([h + r * Math.sin(a), r * Math.cos(a)]); }
    for (const [z, rr] of rings) for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; v.push([rr * Math.cos(t), rr * Math.sin(t), z]); }
    for (let q = 0; q + 1 < rings.length; q++) for (let i = 0; i < n; i++) { const a = q * n + i, b = q * n + ((i + 1) % n); f.push([a, b, b + n], [a, b + n, a + n]); }
    const bot = v.length; v.push([0, 0, cap ? -h - r : -h]); const top = v.length; v.push([0, 0, cap ? h + r : h]);
    const last = (rings.length - 1) * n;
    for (let i = 0; i < n; i++) { f.push([bot, (i + 1) % n, i]); f.push([top, last + i, last + ((i + 1) % n)]); }
    return { v, f };
  }
  return null;
}

/**
 * A link's solid as world triangles (9 numbers each), or null when it has none to hit (a bought part is a box, see
 * partBox; a frame has no body), or "skip" when its mesh cannot be built here.
 */
export function linkTriangles(l: Link, T: Tf, opts: { armour?: boolean } = {}): Float64Array | null | "skip" {
  const g = l.geometry as { type: string; part?: string; size?: V3; radius?: number; length?: number };
  if (l.role === "frame") return null;
  let m: { v: V3[]; f: [number, number, number][] } | null;
  if (g.type === "mesh") {
    if (g.part === "component") return null;
    if (g.part === "armour" && !opts.armour) return "skip";
    try { m = buildPart(g as never) as never; } catch { return "skip"; }
  } else m = primitive(g);
  if (!m?.f?.length) return null;
  const unitMm = g.type === "mesh" ? 1000 : 1000;
  const O: Tf | null = l.origin ? { R: rpyToR(l.origin.rpy as V3), p: l.origin.xyz as V3 } : null;
  const w = m.v.map((v) => { const q: V3 = O ? [0, 1, 2].map((i) => O.R[i][0] * v[0] + O.R[i][1] * v[1] + O.R[i][2] * v[2] + O.p[i]) as V3 : v; return apply(T, [q[0] * unitMm, q[1] * unitMm, q[2] * unitMm]); });
  const tri = new Float64Array(m.f.length * 9);
  m.f.forEach((t, i) => { for (let k = 0; k < 3; k++) tri.set(w[t[k]], i * 9 + k * 3); });
  return tri;
}
/** A bought part's body box in its link's frame (mm): the catalog body, an actuator without its output face and horn. */
export function partBox(key: string): Box3 | null {
  let c: ReturnType<typeof part>;
  try { c = part(key); } catch { return null; }
  const b = (c.specs.body_mm as Box3 | undefined) ?? c.bbox_mm;
  if (!b) return null;
  const top = c.category === "actuator" ? Math.min(b.max[2], -0.8) : b.max[2];
  return { min: [...b.min] as V3, max: [b.max[0], b.max[1], top] };
}
/** the links of a robot that are bought parts, with their catalog key */
export function componentLinks(spec: RobotSpecification): { link: string; key: string }[] {
  return spec.links.flatMap((l) => (l.geometry.type === "mesh" && l.geometry.part === "component" ? [{ link: l.name, key: String(l.geometry.params?.key) }] : []));
}
export { I3 };
