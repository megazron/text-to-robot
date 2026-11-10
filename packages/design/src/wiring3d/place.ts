// Where the electrical parts and their pins are at the home pose: shared by the router (which lays the wires at design
// time) and the 3D view (which draws them from the record).
import type { Link } from "@ttr/robot-schema";
import { WIRING } from "@ttr/parts";
import { rpyToR } from "../kin.ts";
import type { PartModel, PinAt } from "./models.ts";
import { add, sub, scale, lerp, unit, type V3 } from "./geom.ts";

export type Tf = { R: number[][]; p: V3 };
export interface Box3 { min: V3; max: V3; }
/** link frame (mm) to world (mm); the frame's p is in metres */
export const apply = (T: Tf, p: V3): V3 => [0, 1, 2].map((i) => T.R[i][0] * p[0] + T.R[i][1] * p[1] + T.R[i][2] * p[2] + T.p[i] * 1000) as V3;
export const applyInv = (T: Tf, w: V3): V3 => { const d = sub(w, scale(T.p as V3, 1000)); return [0, 1, 2].map((i) => T.R[0][i] * d[0] + T.R[1][i] * d[1] + T.R[2][i] * d[2]) as V3; };
export const rotate = (T: Tf, v: V3): V3 => [0, 1, 2].map((i) => T.R[i][0] * v[0] + T.R[i][1] * v[1] + T.R[i][2] * v[2]) as V3;
export const I3: Tf = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], p: [0, 0, 0] };

/** world AABB (mm) of a link's geometry at home */
export function linkBox(l: Link, T: Tf): Box3 | null {
  const g = l.geometry as { type: string; bbox?: Box3; size?: V3; radius?: number; length?: number };
  let b: Box3 | null = null;
  if (g.type === "mesh" && g.bbox) b = g.bbox;
  else if (g.type === "box" && g.size) b = { min: scale(g.size, -0.5), max: scale(g.size, 0.5) };
  else if ((g.type === "cylinder" || g.type === "capsule") && g.radius) { const h = (g.length ?? 0) / 2 + (g.type === "capsule" ? g.radius : 0); b = { min: [-g.radius, -g.radius, -h], max: [g.radius, g.radius, h] }; }
  else if (g.type === "sphere" && g.radius) b = { min: [-g.radius, -g.radius, -g.radius], max: [g.radius, g.radius, g.radius] };
  if (!b) return null;
  const O = l.origin ? { R: rpyToR(l.origin.rpy as V3), p: l.origin.xyz as V3 } : { R: I3.R, p: [0, 0, 0] as V3 };
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 8; k++) {
    const c: V3 = [(k & 1 ? b.max : b.min)[0], (k & 2 ? b.max : b.min)[1], (k & 4 ? b.max : b.min)[2]];
    const inLink = [0, 1, 2].map((i) => O.R[i][0] * c[0] + O.R[i][1] * c[1] + O.R[i][2] * c[2] + O.p[i]) as V3;
    const w = apply(T, scale(inLink, 1000));
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], w[i]); hi[i] = Math.max(hi[i], w[i]); }
  }
  return { min: lo, max: hi };
}
/** the box round a part's drawn model, in its own frame */
export function bodyBox(m: PartModel): Box3 | null {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const s of m.meshes) for (let i = 0; i < s.v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], s.v[i + k]); hi[k] = Math.max(hi[k], s.v[i + k]); }
  return Number.isFinite(lo[0]) ? { min: lo, max: hi } : null;
}
/**
 * A pin of a part, in the part's frame. A board whose header points down plugs into a breadboard (or a printed header
 * cradle): the jumper goes into the same tie-point column just outside the board's outline and leaves upwards.
 */
export function pinOf(m: PartModel, port: string, pin: string): PinAt | null {
  const pa = m.pins.get(`${port}.${pin}`) ?? [...m.pins.values()][0];
  if (!pa) return null;
  if (pa.kind === "header" && pa.out[2] < -0.9) {
    const bb = bodyBox(m)!, c = lerp(bb.min, bb.max, 0.5), dx = pa.at[0] - c[0], dy = pa.at[1] - c[1];
    const ax = Math.abs(dx) / (bb.max[0] - bb.min[0]) > Math.abs(dy) / (bb.max[1] - bb.min[1]) ? 0 : 1, sgn = (ax === 0 ? dx : dy) >= 0 ? 1 : -1;
    const at: V3 = [pa.at[0], pa.at[1], 0]; at[ax] = (sgn > 0 ? bb.max[ax] : bb.min[ax]) + sgn * 3.81;
    return { at, out: [0, 0, 1], kind: "socket" };
  }
  return pa;
}
/** a pin in the world: where it is, which way the wire leaves */
export function pinWorld(T: Tf, pa: PinAt): { p: V3; out: V3 } { const p = apply(T, pa.at); return { p, out: unit(sub(apply(T, add(pa.at, pa.out)), p)) }; }
/** length of the rigid connector on a pin (Dupont housing, JST plug, ferrule, solder joint with its heat shrink): the wire cannot bend inside it */
export const connectorLen = (kind: PinAt["kind"]) => (kind === "header" || kind === "socket" || kind === "jst" ? 10 : kind === "lever" || kind === "tab" || kind === "terminal" ? 6 : 3);
/** insulation OD and the two bend radii of a gauge (a bought lead without a gauge is drawn as a 1.6 mm wire) */
export function wireSize(awg: number | null): { od: number; bend: number; flex: number } {
  const row = awg ? WIRING.awg.find((x) => x.awg === awg) : null;
  return row ? { od: row.od_mm, bend: row.od_mm * row.static_bend_radius_x_od, flex: row.od_mm * row.min_bend_radius_x_od } : { od: 1.6, bend: 5, flex: 16 };
}
