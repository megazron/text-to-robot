// The robot's electronics and harness in 3D, from its wiring record and nothing else.
//   Parts: every electrical instance on a link gets its 3D model (models.ts) in that link's frame. Harness parts (lever
//   splices, inline fuses, star ground) have no link of their own: they sit where the record's cable routes end, on the
//   nearest rigid body.
//   Wires: each wire of the record runs from its pin out through its connector, along its cable's route (path_mm, world
//   mm at the home pose), to the far pin; wires of one cable lie side by side in the bundle. Each route point belongs to
//   one rigid body (links joined by fixed joints), stored in that body's frame, so a viewer poses it with the link's
//   matrix and the stretch across a moving joint re-solves as the joint moves. At a joint the cable keeps the slack loop
//   the record provides. Corners inside one body are rounded to the gauge's minimum bend radius.
import type { RobotSpecification } from "@ttr/robot-schema";
import { electrical } from "@ttr/parts";
import type { WiringRecord, CableRec, WireRec } from "../wiring.ts";
import { fk } from "../kin.ts";
import { withBranchFuses } from "../circuit/model.ts";
import { partModel, type PartModel, type PinAt } from "./models.ts";
import { apply, applyInv, linkBox, bodyBox, pinOf, I3, wireSize, type Tf } from "./place.ts";
import { simplify, fillet, polyLen } from "./curve.ts";
import { roundWire, offsetRoute } from "./route.ts";
import { add, sub, scale, dot, cross, len, unit, lerp, perp, type V3 } from "./geom.ts";

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
  const harnessAt = new Map<string, V3>(), laid = new Map<string, string>(), fuseT = new Map<string, { link: string; inLink: Tf; world: Tf; cut: [number, number]; line: { pts: V3[]; on: string[] } }>();
  // a routed record says where each harness part is
  for (const i of w.instances) if (i.at_mm && i.on && f.link[i.on]) { harnessAt.set(i.name, i.at_mm as V3); laid.set(i.name, i.on); }
  // a branch fuse on a routed lead: on the lead's longest straight stretch, lying along it
  for (const i of w.instances) if (/^branch_fuse_/.test(i.name)) {
    const wa = cables.flatMap((c) => c.wires).find((y) => y.to.startsWith(`${i.name}.`));
    if (!wa?.pts || !wa.on) continue;
    const F = roundWire(wa.pts as V3[], unrun(wa.on), wa.bend_mm ?? 5), m = model(i.key), bb = bodyBox(m);
    if (!bb) continue;
    let k = 1, best = -1, acc = 0; const at: number[] = [0];
    for (let q = 1; q < F.pts.length; q++) { const d = len(sub(F.pts[q], F.pts[q - 1])); acc += d; at.push(acc); if (F.on[q] === F.on[q - 1] && d > best) { best = d; k = q; } }
    const L = bb.max[0] - bb.min[0];
    let half = Math.min(L, best) / 2, mid = lerp(F.pts[k - 1], F.pts[k], 0.5), dir = unit(sub(F.pts[k], F.pts[k - 1])), centre = (at[k - 1] + at[k]) / 2;
    // a lead with no stretch as long as the holder: the holder at the lead's middle, along it there, its halves on either side
    if (best < L && acc > 0) {
      centre = acc / 2; half = Math.min(L / 2, acc / 2 - 1);
      let q = 1; while (q < at.length - 1 && at[q] < centre) q++;
      const t = (centre - at[q - 1]) / Math.max(1e-6, at[q] - at[q - 1]); mid = lerp(F.pts[q - 1], F.pts[q], t); dir = unit(sub(F.pts[q], F.pts[q - 1])); k = q;
    }
    const g = F.on[k], G = f.link[g];
    // the holder's x axis along the wire, in the body's frame
    const x = applyInv({ R: G.R, p: [0, 0, 0] }, dir), y = perp(x), z = cross(x, y), c = lerp(bb.min, bb.max, 0.5), o = applyInv(G, mid);
    const Rl = [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]], pl = sub(o, [0, 1, 2].map((r) => Rl[r][0] * c[0] + Rl[r][1] * c[1] + Rl[r][2] * c[2]) as V3);
    const inLink: Tf = { R: Rl, p: scale(pl, 0.001) as V3 };
    const Rw = [0, 1, 2].map((r) => [0, 1, 2].map((cc) => G.R[r][0] * Rl[0][cc] + G.R[r][1] * Rl[1][cc] + G.R[r][2] * Rl[2][cc]));
    fuseT.set(i.name, { link: g, inLink, world: { R: Rw, p: scale(apply(G, pl), 0.001) as V3 }, cut: [centre - half, centre + half], line: { pts: F.pts, on: F.on } });
  }
  for (const c of cables) { if (!c.path_mm.length) continue; for (const [end, at] of [[c.from, c.path_mm[0]], [c.to, c.path_mm[c.path_mm.length - 1]]] as const) { const i = inst.get(end); if (i && !i.link && !harnessAt.has(end)) harnessAt.set(end, at as V3); } }
  // branch fuses: on their lead, as far along the route from the splice as the record's short lead to them
  for (const i of w.instances) if (/^branch_fuse_/.test(i.name) && !fuseT.has(i.name)) {
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
    for (const [n, p] of harnessAt) { if (laid.has(n)) continue; const q = ring.map((o) => add(p, o)).find((c) => !seen.some((s) => len(sub(s, c)) < 21)) ?? p; seen.push(q); harnessAt.set(n, q); } }
  // ---- parts
  const parts: Part3D[] = [];
  const placeOf = new Map<string, { link: string; T: Tf; world: Tf }>();
  for (const i of w.instances) {
    const e = electrical(i.key); if (!e || i.off_board) continue;
    const ft = fuseT.get(i.name);
    if (ft) {
      placeOf.set(i.name, { link: ft.link, T: ft.inLink, world: ft.world });
      parts.push({ inst: i.name, key: i.key, link: ft.link, T: mat(ft.inLink), harness: true, model: model(i.key) });
    } else if (i.link && f.link[i.link] && !laid.has(i.name)) {
      placeOf.set(i.name, { link: i.link, T: I3, world: f.link[i.link] });
      parts.push({ inst: i.name, key: i.key, link: i.link, T: mat(I3), harness: false, model: model(i.key) });
    } else if (harnessAt.has(i.name)) {
      const at = harnessAt.get(i.name)!, g = laid.get(i.name) ?? nearestGroup(at), L = f.link[g];
      // the part's body centred on its spot, axes as the body's
      // (turned `turn` quarter turns about the body's z where the record says so; `turned`, from older records: half a turn)
      const q4 = ((((i.turn ?? (i.turned ? 2 : 0)) % 4) + 4) % 4), cs = [1, 0, -1, 0][q4], sn = [0, 1, 0, -1][q4], Rz = [[cs, -sn, 0], [sn, cs, 0], [0, 0, 1]];
      const m = model(i.key), c0 = centre(m), c: V3 = [cs * c0[0] - sn * c0[1], sn * c0[0] + cs * c0[1], c0[2]], local = sub(applyInv(L, at), c);
      const T: Tf = { R: L.R.map((r) => [r[0] * cs + r[1] * sn, r[1] * cs - r[0] * sn, r[2]]), p: [0, 0, 0] }, inLink: Tf = { R: q4 ? Rz : I3.R, p: scale(local, 0.001) as V3 };
      placeOf.set(i.name, { link: g, T: inLink, world: { R: T.R, p: add(L.p as V3, scale([0, 1, 2].map((r) => L.R[r][0] * local[0] + L.R[r][1] * local[1] + L.R[r][2] * local[2]) as V3, 0.001)) } });
      parts.push({ inst: i.name, key: i.key, link: g, T: mat(inLink), harness: true, model: m });
    } else if (!i.off_board) notes.push(`${i.name}: no place in the routes, not drawn`);
  }
  // ---- wires
  const pinWorld = (t: string): { p: V3; out: V3; kind: PinAt["kind"]; link: string; body: { min: V3; max: V3 } | null } | null => {
    const [n, port, pin] = t.split("."), pl = placeOf.get(n), i = inst.get(n);
    if (!pl || !i) return null;
    const m = model(i.key), pa = pinOf(m, port, pin);
    if (!pa) return null;
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
      const size = wireSize(x.awg), od = size.od, minBend = x.bend_mm ?? size.bend, flexBend = size.flex;
      if (x.pts && x.on) {
        // laid by the router: its stored corners, rounded; a lead cut by a branch fuse stops at the fuse and starts again behind it
        const fuseEnd = [x.from, x.to].map((t) => t.split(".")[0]).find((n2) => fuseT.has(n2)), ft = fuseEnd ? fuseT.get(fuseEnd)! : null;
        let F = ft ? ft.line : roundWire(x.pts as V3[], unrun(x.on), minBend);
        if (ft) F = x.to.startsWith(`${fuseEnd}.`) ? slice(F, 0, ft.cut[0]) : slice(F, ft.cut[1], Infinity);
        wires.push({ id: x.id, cable: c.id, net: x.net, kind: x.kind, color: x.color, awg: x.awg, od_mm: od, from: x.from, to: x.to, typical_a: x.typical_a, peak_a: x.peak_a, cut_mm: x.length_mm,
          pts: F.pts.map((p, i) => ({ link: F.on[i], p: r2(applyInv(f.link[F.on[i]] ?? f.link[spec.links[0].name], p)) })), ends: [a.kind, b.kind], min_bend_mm: Math.round(minBend * 10) / 10, flex_bend_mm: Math.round(flexBend * 10) / 10 });
        return;
      }
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
const unrun = (on: [string, number][]): string[] => on.flatMap(([l, n]) => Array.from({ length: n }, () => l));
/** the part of a polyline between two distances along it */
function slice(F: { pts: V3[]; on: string[] }, d0: number, d1: number): { pts: V3[]; on: string[] } {
  const pts: V3[] = [], on: string[] = []; let acc = 0;
  for (let i = 0; i < F.pts.length; i++) {
    const seg = i ? len(sub(F.pts[i], F.pts[i - 1])) : 0, a0 = acc; acc += seg;
    if (i && a0 < d0 && acc > d0) { pts.push(lerp(F.pts[i - 1], F.pts[i], (d0 - a0) / seg)); on.push(F.on[i]); }
    if (acc >= d0 && acc <= d1) { pts.push(F.pts[i]); on.push(F.on[i]); }
    if (i && a0 < d1 && acc > d1) { pts.push(lerp(F.pts[i - 1], F.pts[i], (d1 - a0) / seg)); on.push(F.on[i - 1]); }
  }
  return { pts, on };
}
export { fillet, polyLen };
export type { WireRec };
