// The robot's electronics and harness in 3D, from its wiring record and nothing else.
//   Parts: every electrical instance on a link gets its 3D model (models.ts) in that link's frame. Harness parts (lever
//   splices, inline fuses, star ground) have no link of their own: they sit where the record's cable routes end, on the
//   nearest rigid body.
//   Wires: each wire of the record runs from its pin out through its connector, along its cable's route (path_mm, world
//   mm at the home pose), to the far pin; wires of one cable lie side by side in the bundle. Each route point belongs to
//   one rigid body (links joined by fixed joints), stored in that body's frame, so a viewer poses it with the link's
//   matrix and the stretch across a moving joint re-solves as the joint moves. At a joint the cable keeps the slack loop
//   the record provides. Corners inside one body are rounded to the gauge's minimum bend radius.
import type { RobotSpecification, Link } from "@ttr/robot-schema";
import { electrical } from "@ttr/parts";
import type { WiringRecord, CableRec, WireRec } from "../wiring.ts";
import { awgRow } from "../wiring.ts";
import { fk, rpyToR } from "../kin.ts";
import { withBranchFuses } from "../circuit/model.ts";
import { partModel, type PartModel, type PinAt } from "./models.ts";
import { add, sub, scale, dot, cross, len, unit, lerp, type V3 } from "./geom.ts";

export interface Pt { link: string; p: V3; }
export interface Wire3D {
  id: string; cable: string; net: string; kind: string; color: string; awg: number | null; od_mm: number;
  from: string; to: string; typical_a: number; peak_a: number; cut_mm: number;
  /** centreline: each point in its link's frame (mm) */
  pts: Pt[];
  /** the ends: connector kind at each pin */
  ends: [PinAt["kind"], PinAt["kind"]];
  /** minimum bend radius: fixed run inside one body, and where the wire flexes across a joint (WIRING table) */
  min_bend_mm: number; flex_bend_mm: number;
}
export interface Part3D { inst: string; key: string; link: string; /** part frame in the link frame: row-major 4x4, mm */ T: number[]; harness: boolean; model: PartModel; }
export interface Wiring3D { robot: string; parts: Part3D[]; wires: Wire3D[]; groups: Record<string, string>; notes: string[]; }

type Tf = { R: number[][]; p: V3 };
const apply = (T: Tf, p: V3): V3 => [0, 1, 2].map((i) => T.R[i][0] * p[0] + T.R[i][1] * p[1] + T.R[i][2] * p[2] + T.p[i] * 1000) as V3;
const applyInv = (T: Tf, w: V3): V3 => { const d = sub(w, scale(T.p as V3, 1000)); return [0, 1, 2].map((i) => T.R[0][i] * d[0] + T.R[1][i] * d[1] + T.R[2][i] * d[2]) as V3; };

/** world AABB (mm) of a link's geometry at home */
function linkBox(l: Link, T: Tf): { min: V3; max: V3 } | null {
  const g = l.geometry as { type: string; bbox?: { min: V3; max: V3 }; size?: V3; radius?: number; length?: number };
  let b: { min: V3; max: V3 } | null = null;
  if (g.type === "mesh" && g.bbox) b = g.bbox;
  else if (g.type === "box" && g.size) b = { min: scale(g.size, -0.5), max: scale(g.size, 0.5) };
  else if ((g.type === "cylinder" || g.type === "capsule") && g.radius) { const h = (g.length ?? 0) / 2 + (g.type === "capsule" ? g.radius : 0); b = { min: [-g.radius, -g.radius, -h], max: [g.radius, g.radius, h] }; }
  else if (g.type === "sphere" && g.radius) b = { min: [-g.radius, -g.radius, -g.radius], max: [g.radius, g.radius, g.radius] };
  if (!b) return null;
  const O = l.origin ? { R: rpyToR(l.origin.rpy as V3), p: l.origin.xyz as V3 } : { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], p: [0, 0, 0] as V3 };
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 8; k++) {
    const c: V3 = [(k & 1 ? b.max : b.min)[0], (k & 2 ? b.max : b.min)[1], (k & 4 ? b.max : b.min)[2]];
    const inLink = [0, 1, 2].map((i) => O.R[i][0] * c[0] + O.R[i][1] * c[1] + O.R[i][2] * c[2] + O.p[i]) as V3;
    const w = apply(T, scale(inLink, 1000));
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); }
  }
  return { min: lo, max: hi };
}
const boxDist = (b: { min: V3; max: V3 }, p: V3) => Math.hypot(...[0, 1, 2].map((i) => Math.max(b.min[i] - p[i], 0, p[i] - b.max[i])));
const inBox = (b: { min: V3; max: V3 }, p: V3, pad = 0) => [0, 1, 2].every((i) => p[i] >= b.min[i] - pad && p[i] <= b.max[i] + pad);

export function wiringOfSpec(spec: RobotSpecification): WiringRecord | null {
  return ((spec.metadata as { design?: { wiring?: WiringRecord } } | undefined)?.design?.wiring) ?? null;
}

export function wiring3d(spec: RobotSpecification, record?: WiringRecord | null): Wiring3D {
  const rec = record ?? wiringOfSpec(spec);
  if (!rec) return { robot: spec.robot_name, parts: [], wires: [], groups: {}, notes: ["no wiring record"] };
  const w = withBranchFuses(rec), f = fk(spec), notes: string[] = [];
  // rigid bodies
  const parentJ = new Map(spec.joints.map((j) => [j.child, j]));
  const groupOf = (n: string): string => { const j = parentJ.get(n); return j && j.type === "fixed" ? groupOf(j.parent) : n; };
  const groups: Record<string, string> = {}; for (const l of spec.links) groups[l.name] = groupOf(l.name);
  const boxes = new Map<string, { min: V3; max: V3 }>();
  for (const l of spec.links) { const b = f.link[l.name] && linkBox(l, f.link[l.name]); if (b) boxes.set(l.name, b); }
  const groupBox = new Map<string, { min: V3; max: V3 }[]>();
  for (const [n, b] of boxes) groupBox.set(groups[n], [...(groupBox.get(groups[n]) ?? []), b]);
  const nearestGroup = (p: V3, among?: string[]) => {
    let best = "", bd = Infinity;
    for (const [g, bs] of groupBox) { if (among && !among.includes(g)) continue; const d = Math.min(...bs.map((b) => boxDist(b, p))); if (d < bd) { bd = d; best = g; } }
    return best || (among?.[0] ?? spec.links[0].name);
  };
  const inst = new Map(w.instances.map((i) => [i.name, i]));
  const models = new Map<string, PartModel>(); const model = (key: string) => { let m = models.get(key); if (!m) { m = partModel(key); models.set(key, m); } return m; };
  const cables = w.cables;
  // ---- harness parts: where the routes end
  const harnessAt = new Map<string, V3>();
  for (const c of cables) { if (!c.path_mm.length) continue; for (const [end, at] of [[c.from, c.path_mm[0]], [c.to, c.path_mm[c.path_mm.length - 1]]] as const) { const i = inst.get(end); if (i && !i.link && !harnessAt.has(end)) harnessAt.set(end, at as V3); } }
  // branch fuses: on their lead, as far along the route from the splice as the record's short lead to them
  for (const i of w.instances) if (/^branch_fuse_/.test(i.name)) {
    const c = cables.find((x) => x.wires.some((y) => y.to.startsWith(`${i.name}.`))), wa = c?.wires.find((y) => y.to.startsWith(`${i.name}.`));
    if (!c || !wa || c.path_mm.length < 2) continue;
    let want = Math.max(20, wa.length_mm - c.service_mm - c.termination_mm), at = c.path_mm[0] as V3;
    for (let k = 1; k < c.path_mm.length; k++) { const a0 = c.path_mm[k - 1] as V3, b0 = c.path_mm[k] as V3, d = len(sub(b0, a0)); if (d >= want) { at = lerp(a0, b0, want / d); want = 0; break; } want -= d; at = b0; }
    harnessAt.set(i.name, at);
  }
  // splices that share a spot sit side by side
  // (a compact grid round the spot, nearest free place first, so a dozen branch fuses stay inside the body)
  { const seen: V3[] = [], ring: V3[] = [[0, 0, 0]];
    for (let r = 1; r <= 4; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r) ring.push([i * 22, j * 22, 0]);
    ring.sort((a, b) => len(a) - len(b));
    for (const [n, p] of harnessAt) { const q = ring.map((o) => add(p, o)).find((c) => !seen.some((s) => len(sub(s, c)) < 21)) ?? p; seen.push(q); harnessAt.set(n, q); } }
  // ---- parts
  const parts: Part3D[] = [];
  const I3: Tf = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], p: [0, 0, 0] };
  const placeOf = new Map<string, { link: string; T: Tf; world: Tf }>();
  for (const i of w.instances) {
    const e = electrical(i.key); if (!e || i.off_board) continue;
    if (i.link && f.link[i.link]) {
      placeOf.set(i.name, { link: i.link, T: I3, world: f.link[i.link] });
      parts.push({ inst: i.name, key: i.key, link: i.link, T: mat(I3), harness: false, model: model(i.key) });
    } else if (harnessAt.has(i.name)) {
      const at = harnessAt.get(i.name)!, g = nearestGroup(at), L = f.link[g];
      // the part's body centred on its spot, axes as the body's
      const m = model(i.key), c = centre(m), local = sub(applyInv(L, at), c);
      const T: Tf = { R: L.R, p: [0, 0, 0] }, inLink: Tf = { R: I3.R, p: scale(local, 0.001) as V3 };
      placeOf.set(i.name, { link: g, T: inLink, world: { R: T.R, p: add(L.p as V3, scale([0, 1, 2].map((r) => L.R[r][0] * local[0] + L.R[r][1] * local[1] + L.R[r][2] * local[2]) as V3, 0.001)) } });
      parts.push({ inst: i.name, key: i.key, link: g, T: mat(inLink), harness: true, model: m });
    } else if (!i.off_board) notes.push(`${i.name}: no place in the routes, not drawn`);
  }
  // ---- wires
  const pinWorld = (t: string): { p: V3; out: V3; kind: PinAt["kind"]; link: string; body: { min: V3; max: V3 } | null } | null => {
    const [n, port, pin] = t.split("."), pl = placeOf.get(n), i = inst.get(n);
    if (!pl || !i) return null;
    const m = model(i.key); let pa = m.pins.get(`${port}.${pin}`) ?? [...m.pins.values()][0];
    if (!pa) return null;
    // a board whose header points down plugs into a breadboard (or a printed header cradle): the jumper goes into the
    // same tie-point column just outside the board's outline and leaves upwards
    if (pa.kind === "header" && pa.out[2] < -0.9) {
      const bb = bodyBox(m)!, c = lerp(bb.min, bb.max, 0.5), dx = pa.at[0] - c[0], dy = pa.at[1] - c[1];
      const ax = Math.abs(dx) / (bb.max[0] - bb.min[0]) > Math.abs(dy) / (bb.max[1] - bb.min[1]) ? 0 : 1, sgn = (ax === 0 ? dx : dy) >= 0 ? 1 : -1;
      const at: V3 = [pa.at[0], pa.at[1], 0]; at[ax] = (sgn > 0 ? bb.max[ax] : bb.min[ax]) + sgn * 3.81;
      pa = { at, out: [0, 0, 1], kind: "socket" };
    }
    const p = apply(pl.world, pa.at), out = unit(sub(apply(pl.world, add(pa.at, pa.out)), p));
    const bb = bodyBox(m); const body = bb ? worldBox(pl.world, bb) : null;
    return { p, out, kind: pa.kind, link: groups[pl.link] ?? pl.link, body };
  };
  const wires: Wire3D[] = [];
  for (const c of cables) {
    const n = c.wires.length;
    c.wires.forEach((x, k) => {
      const a = pinWorld(x.from), b = pinWorld(x.to);
      if (!a || !b) { notes.push(`${x.id}: an end has no place, not drawn`); return; }
      const od = x.awg ? awgRow(x.awg).od_mm : 1.6;
      const row = x.awg ? awgRow(x.awg) : null, minBend = row ? row.od_mm * row.static_bend_radius_x_od : 5, flexBend = row ? row.od_mm * row.min_bend_radius_x_od : 16;
      let route = routeOf(c, a, b);
      // a lead cut by a branch fuse: the splice side stops at the fuse, the far side starts there
      const fuseEnd = [x.from, x.to].map((t) => t.split(".")[0]).find((n2) => /^branch_fuse_/.test(n2));
      if (fuseEnd && harnessAt.has(fuseEnd) && route.length > 1) {
        const fp = harnessAt.get(fuseEnd)!; let k = 0, bd = Infinity; route.forEach((q, i) => { const d = len(sub(q, fp)); if (d < bd) { bd = d; k = i; } });
        route = x.to.startsWith(`${fuseEnd}.`) ? route.slice(0, k) : route.slice(k + 1);
      }
      // bundle: wire k on a ring round the cable's centreline
      const ring = n > 1 ? Math.max(od * 0.6, (c.od_mm / 2) - od / 2) : 0, ang = (k / Math.max(1, n)) * Math.PI * 2;
      // no route waypoint inside either end's lead: the wire comes straight off its connector
      const near = (q: V3, e: typeof a) => len(sub(q, e!.p)) < 14 + minBend * 3;
      route = route.filter((q) => !near(q, a) && !near(q, b));
      const pts = offsetRoute(route, ring, ang);
      // out of the pin: the connector body (Dupont housing, JST plug, ferrule), then room for the first bend
      const lead = (q: typeof a) => { const conn = q!.kind === "header" || q!.kind === "socket" || q!.kind === "jst" ? 10 : q!.kind === "lever" || q!.kind === "tab" || q!.kind === "terminal" ? 6 : 3; return [q!.p, add(q!.p, scale(q!.out, conn)), add(q!.p, scale(q!.out, conn + Math.max(8, minBend * 2.2)))]; };
      const la = lead(a), lb = lead(b).reverse();
      const world: V3[] = [...la, ...pts, ...lb];
      // which rigid body each point rides on
      const among = [...new Set(c.links.map((l) => groups[l] ?? l).concat([a.link, b.link]))];
      const body: string[] = world.map((p, i) => i < la.length ? a.link : i >= world.length - lb.length ? b.link : nearestGroup(p, among));
      // slack loops where the body changes across a joint the record crosses
      const W: V3[] = [], B: string[] = [];
      for (let i = 0; i < world.length; i++) {
        if (i && body[i] !== body[i - 1]) {
          const jr = c.joints.find((j) => { const J = spec.joints.find((q) => q.name === j.joint); return J && [groups[J.parent], groups[J.child]].includes(body[i]) && [groups[J.parent], groups[J.child]].includes(body[i - 1]); });
          if (jr) {
            const J = spec.joints.find((q) => q.name === jr.joint)!, jw = f.joint[J.name], axis = unit(jw.axis as V3), mid = lerp(world[i - 1], world[i], 0.5);
            let off = sub(mid, scale(jw.p as V3, 1000)); off = sub(off, scale(axis, dot(off, axis)));
            const dir = len(off) > 1 ? unit(off) : unit(cross(axis, unit(sub(world[i], world[i - 1]))));
            const d = Math.min(40, Math.max(flexBend * 1.1, (jr.provided_mm ?? jr.slack_mm ?? 20) / 4));
            const parentG = groups[J.parent];
            W.push(add(lerp(world[i - 1], world[i], 0.3), scale(dir, d * 0.7))); B.push(parentG);
            W.push(add(mid, scale(dir, d))); B.push(parentG);
          }
        }
        W.push(world[i]); B.push(body[i]);
      }
      // round the corners inside each body to the bend radius (between bodies the viewer re-solves the curve)
      const S = simplify(W, B, 2), R = fillet(S.pts, S.body, minBend * 1.05);
      wires.push({ id: x.id, cable: c.id, net: x.net, kind: x.kind, color: x.color, awg: x.awg, od_mm: od, from: x.from, to: x.to, typical_a: x.typical_a, peak_a: x.peak_a, cut_mm: x.length_mm,
        pts: R.pts.map((p, i) => ({ link: R.body[i], p: r2(applyInv(f.link[R.body[i]] ?? f.link[spec.links[0].name], p)) })), ends: [a.kind, b.kind], min_bend_mm: Math.round(minBend * 10) / 10, flex_bend_mm: Math.round(flexBend * 10) / 10 });
    });
  }
  return { robot: spec.robot_name, parts, wires, groups, notes };
}

const r2 = (p: V3): V3 => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100, Math.round(p[2] * 100) / 100];
const mat = (T: Tf): number[] => [T.R[0][0], T.R[0][1], T.R[0][2], T.p[0] * 1000, T.R[1][0], T.R[1][1], T.R[1][2], T.p[1] * 1000, T.R[2][0], T.R[2][1], T.R[2][2], T.p[2] * 1000, 0, 0, 0, 1];
function bodyBox(m: PartModel): { min: V3; max: V3 } | null {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const s of m.meshes) for (let i = 0; i < s.v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], s.v[i + k]); hi[k] = Math.max(hi[k], s.v[i + k]); }
  return Number.isFinite(lo[0]) ? { min: lo, max: hi } : null;
}
function centre(m: PartModel): V3 { const b = bodyBox(m); return b ? lerp(b.min, b.max, 0.5) : [0, 0, 0]; }
function worldBox(T: Tf, b: { min: V3; max: V3 }) {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 8; k++) { const w = apply(T, [(k & 1 ? b.max : b.min)[0], (k & 2 ? b.max : b.min)[1], (k & 4 ? b.max : b.min)[2]]); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); } }
  return { min: lo, max: hi };
}
/** the cable's route without the stretch inside either end's body (the record's route starts at body centres) */
function routeOf(c: CableRec, a: { body: { min: V3; max: V3 } | null }, b: { body: { min: V3; max: V3 } | null }): V3[] {
  let pts = (c.path_mm as V3[]).slice();
  while (pts.length > 1 && a.body && inBox(a.body, pts[0], 2)) pts = pts.slice(1);
  while (pts.length > 1 && b.body && inBox(b.body, pts[pts.length - 1], 2)) pts = pts.slice(0, -1);
  if (pts.length === 1 && ((a.body && inBox(a.body, pts[0], 2)) || (b.body && inBox(b.body, pts[0], 2)))) pts = [];
  return pts;
}
/** a wire's place in its bundle: offset from the cable centreline by `r` at angle `ang` round the local direction */
function offsetRoute(pts: V3[], r: number, ang: number): V3[] {
  if (!r || pts.length < 2) return pts;
  return pts.map((p, i) => {
    const d = unit(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
    const u = Math.abs(d[2]) < 0.9 ? unit(cross(d, [0, 0, 1])) : unit(cross(d, [1, 0, 0])), v = cross(d, u);
    return add(p, add(scale(u, Math.cos(ang) * r), scale(v, Math.sin(ang) * r)));
  });
}
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
export type { WireRec };
