// The Bench view: the robot's electronics laid out on a desk, as you would lay them out to wire and test them before
// they go into the robot, with every wire of the wiring record pin to pin and the connector it really ends in.
//   Layout: the parts in columns by what they do, left to right: sensors, the controller, drivers and adapters, motors
//   and servos; the power parts (battery, supply, switch, fuses, regulators, lever splices) in a row in front. Each part
//   lies as its catalog body stands (its own frame, its lowest face on the desk), at its real size, with room between.
//   A board whose header points down stands in a solderless breadboard, as on the robot, and its jumpers go into the
//   free tie points beside it (place.ts pinOf).
//   Wires: from the pin straight out through its connector (Dupont housing, JST plug, ferrule in a screw terminal, a
//   lever splice's slot, a spade), then through the free space over the desk to the far pin, found by the same search
//   over small cubes the router uses, so no wire passes through a part or the desk.
// The same shape as the robot's electronics in 3D (wires.ts): every point on one "desk" body, so the same viewer draws it.
import type { RobotSpecification } from "@ttr/robot-schema";
import { electrical, part } from "@ttr/parts";
import type { WiringRecord } from "../wiring.ts";
import { withBranchFuses } from "../circuit/model.ts";
import { buildPart } from "@ttr/mesh";
import { partModel, type PartModel } from "./models.ts";
import { bodyBox, pinOf, pinWorld, connectorLen, wireSize, I3, type Tf, type Box3 } from "./place.ts";
import type { Wiring3D, Wire3D, Part3D } from "./wires.ts";
import { Grid } from "./voxel.ts";
import { add, scale, type V3 } from "./geom.ts";

const GAP = 40;
const ROW_OF: Record<string, number> = { sensor: 0, indicator: 0, controller: 1, carrier: 1, adapter: 2, driver: 2, compute: 1, actuator: 3 };
const POWER = new Set(["battery", "psu", "switch", "protection", "regulator", "splice"]);

export interface Bench extends Wiring3D { desk: { min: V3; max: V3 }; }

export function bench(spec: RobotSpecification, record: WiringRecord): Bench {
  const w = withBranchFuses(record), notes: string[] = [];
  const models = new Map<string, PartModel>(); const model = (key: string) => { let m = models.get(key); if (!m) { m = benchModel(key); models.set(key, m); } return m; };
  const inst = w.instances.filter((i) => electrical(i.key));
  // a board whose header points down needs a breadboard to stand in
  const downHeader = (m: PartModel) => [...m.pins.values()].some((p) => p.kind === "header" && p.out[2] < -0.9);
  // ---- columns and the power row
  const cols: string[][] = [[], [], [], []], power: string[] = [];
  for (const i of inst) { const role = electrical(i.key)!.role; if (POWER.has(role)) power.push(i.name); else cols[ROW_OF[role] ?? 2].push(i.name); }
  const keyOf = new Map(inst.map((i) => [i.name, i.key]));
  const boxOf = (n: string): Box3 => {
    const m = model(keyOf.get(n)!), b = bodyBox(m) ?? { min: [0, 0, 0] as V3, max: [20, 20, 10] as V3 };
    // the pins and their connectors and first bends count as part of the footprint
    const lo = [...b.min] as V3, hi = [...b.max] as V3;
    for (const p of m.pins.values()) { const reach = add(p.at, scale(p.out, connectorLen(p.kind) + 12)); for (let k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], reach[k]); hi[k] = Math.max(hi[k], reach[k]); } }
    return { min: lo, max: hi };
  };
  // the largest bend radius of the wires on each part: its leads need that much room below it if they point down
  const bendOf = new Map<string, number>();
  for (const c of w.cables) for (const x of c.wires) for (const t of [x.from, x.to]) { const n = t.split(".")[0]; bendOf.set(n, Math.max(bendOf.get(n) ?? 0, wireSize(x.awg).bend)); }
  const BB = part("breadboard_400").bbox_mm!, bbH = BB.max[2] - BB.min[2];
  const placed = new Map<string, Tf>(), extra: Part3D[] = [];
  const put = (n: string, x: number, y: number): { w: number; d: number } => {
    const m = model(keyOf.get(n)!), b = bodyBox(m)!, f = boxOf(n), onBoard = downHeader(m);
    // on a breadboard: the board's pins go into it, the board sits on the breadboard's top
    // lowest of the body and of every pin's connector and first bend: a part whose leads point down stands on them
    let low = b.min[2];
    for (const q of m.pins.values()) low = Math.min(low, q.at[2] + q.out[2] * (connectorLen(q.kind) + 1.25 * (bendOf.get(n) ?? 8) + 8));
    let z = -low + (low < b.min[2] ? 2 : 0), wB = f.max[0] - f.min[0], dB = f.max[1] - f.min[1];
    if (onBoard) {
      const bw = BB.max[0] - BB.min[0], bd = BB.max[1] - BB.min[1];
      wB = Math.max(wB, bw); dB = Math.max(dB, bd);
      const bx = x + wB / 2 - (BB.min[0] + BB.max[0]) / 2, by = y + dB / 2 - (BB.min[1] + BB.max[1]) / 2;
      extra.push({ inst: `${n}_breadboard`, key: "breadboard_400", link: "desk", T: mat({ R: I3.R, p: [bx / 1000, by / 1000, -BB.min[2] / 1000] }), harness: true, model: model("breadboard_400") });
      z = bbH;
    }
    // the part's footprint centred in its slot
    const cx = x + wB / 2 - (f.min[0] + f.max[0]) / 2, cy = y + dB / 2 - (f.min[1] + f.max[1]) / 2;
    placed.set(n, { R: I3.R, p: [cx / 1000, cy / 1000, z / 1000] });
    return { w: wB, d: dB };
  };
  let x = 0, maxY = 0;
  for (const c of cols) {
    if (!c.length) continue;
    let y = 0, colW = 0;
    for (const n of c.sort()) { const s = put(n, x, y); y += s.d + GAP; colW = Math.max(colW, s.w); }
    maxY = Math.max(maxY, y); x += colW + GAP;
  }
  // power row in front of the columns
  let px = 0, rowD = 0;
  for (const n of power.sort()) { const f = boxOf(n); rowD = Math.max(rowD, f.max[1] - f.min[1]); }
  for (const n of power) { const s = put(n, px, -rowD - GAP * 2); px += s.w + GAP; }
  // ---- parts
  const parts: Part3D[] = [...extra];
  for (const [n, T] of placed) parts.push({ inst: n, key: keyOf.get(n)!, link: "desk", T: mat(T), harness: false, model: model(keyOf.get(n)!) });
  const solids = parts.map((p) => { const b = bodyBox(p.model)!; const o: V3 = [p.T[3], p.T[7], p.T[11]]; return { min: add(o, b.min), max: add(o, b.max), inst: p.inst }; });
  // ---- wires: through the free space over the desk, as a jumper lies: a search over small cubes (voxel.ts) round the
  // parts' bodies and above the desk, with a cost that keeps a wire near the desk and the parts rather than in the air
  const lo0: V3 = [Infinity, Infinity, 0], hi0: V3 = [-Infinity, -Infinity, 0];
  for (const q of solids) for (let i = 0; i < 3; i++) { lo0[i] = Math.min(lo0[i], q.min[i]); hi0[i] = Math.max(hi0[i], q.max[i]); }
  const s = 4, g = new Grid([lo0[0] - 60, lo0[1] - 60, -2 * s], [hi0[0] + 60, hi0[1] + 60, hi0[2] + 40], s);
  // the desk: every cube below its top (a cube that reaches above it is free: parts and leads stand on the desk)
  g.addBox(I3.R, [0, 0, 0], [lo0[0] - 80, lo0[1] - 80, -40], [hi0[0] + 80, hi0[1] + 80, -s / 2 - 0.1], 1);
  const idOf = new Map<string, number>();
  parts.forEach((q, i) => { const bb = bodyBox(q.model)!; idOf.set(q.inst, 2 + i); g.addBox(I3.R, [q.T[3], q.T[7], q.T[11]], bb.min, bb.max, 2 + i); });
  g.finish();
  const wires: Wire3D[] = [];
  for (const c of w.cables) c.wires.forEach((x) => {
    const end = (t: string) => {
      const [n, port, pin] = t.split("."), T = placed.get(n); if (!T) return null;
      const pa = pinOf(model(keyOf.get(n)!), port, pin); if (!pa) return null;
      return { ...pinWorld(T, pa), kind: pa.kind, ids: [idOf.get(n)!, idOf.get(`${n}_breadboard`) ?? -1] };
    };
    const a = end(x.from), b = end(x.to);
    if (!a || !b) { notes.push(`${x.id}: an end has no place on the bench`); return; }
    const size = wireSize(x.awg), R = size.bend, need = 1;   // a jumper lies on the desk and against the parts: a free cube is clearance enough (its centre is half a cube from anything)
    // out of the pin through its connector, on until it is clear of its own part, then room for the first bend
    const lead = (e: NonNullable<typeof a>) => {
      let t = connectorLen(e.kind);
      // through its own part (a header between taller components) and its breadboard, then into clear space; never through another part
      for (; t < 120; t += 1) { const q = add(e.p, scale(e.out, t)), o = g.at(q); if (o && !e.ids.includes(o)) break; if (!o && g.dist(q) >= need) break; }
      const S = add(e.p, scale(e.out, t)), V = add(S, scale(e.out, R));
      return g.dist(V) >= need ? [e.p, S, V] : [e.p, S];
    };
    const la = lead(a), lb = lead(b).reverse(), A = la[la.length - 1], B = lb[0];
    const way = g.path(A, B, need, undefined, 4e6);
    if (!way) { notes.push(`${x.id}: no free way on the bench${(globalThis as { TTR_ROUTE_DEBUG?: boolean }).TTR_ROUTE_DEBUG ? ` from ${A.map(Math.round)} (${g.at(A)}, d${g.dist(A)}) to ${B.map(Math.round)} (${g.at(B)} ${parts[g.at(B) - 2]?.inst}, d${g.dist(B)}) for ${x.from} - ${x.to}` : ""}`); return; }
    const pts: V3[] = [...la, ...way.slice(1, -1), ...lb];
    wires.push({ id: x.id, cable: c.id, net: x.net, kind: x.kind, color: c.premade ? "grey" : x.color, awg: x.awg, od_mm: c.premade ? 4 : size.od, from: x.from, to: x.to, typical_a: x.typical_a, peak_a: x.peak_a, cut_mm: x.length_mm,
      pts: pts.map((p) => ({ link: "desk", p: p.map((v) => Math.round(v * 100) / 100) as V3 })), ends: [a.kind, b.kind], min_bend_mm: Math.round(R * 10) / 10, flex_bend_mm: Math.round(size.flex * 10) / 10 });
  });
  const lo: V3 = [Infinity, Infinity, 0], hi: V3 = [-Infinity, -Infinity, 0];
  for (const s of solids) for (let i = 0; i < 2; i++) { lo[i] = Math.min(lo[i], s.min[i]); hi[i] = Math.max(hi[i], s.max[i]); }
  for (const wr of wires) for (const q of wr.pts) for (let i = 0; i < 3; i++) { if (i < 2) { lo[i] = Math.min(lo[i], q.p[i]); } hi[i] = Math.max(hi[i], q.p[i]); }
  return { robot: spec.robot_name, parts, wires, groups: { desk: "desk" }, notes, desk: { min: [lo[0] - 60, lo[1] - 60, 0], max: [hi[0] + 60, hi[1] + 60, hi[2]] } };
}

/**
 * A part's model for the bench. A motor or servo has no model of its own in the robot view (the robot draws its datasheet
 * CAD); on the bench that CAD is its body, in mm, so it lies there at its real shape.
 */
function benchModel(key: string): PartModel {
  const m = partModel(key);
  if (m.meshes.length) return m;
  const g = buildPart({ part: "component", params: { key } } as never) as { v: V3[]; f: [number, number, number][] };
  const v: number[] = [], f: number[] = [];
  for (const p of g.v) v.push(p[0] * 1000, p[1] * 1000, p[2] * 1000);
  for (const t of g.f) f.push(t[0], t[1], t[2]);
  return { ...m, meshes: [{ mat: electrical(key)?.role === "actuator" ? "plastic_blue" : "plastic_grey", v, f }], replaces: true };
}
const mat = (T: Tf): number[] => [T.R[0][0], T.R[0][1], T.R[0][2], T.p[0] * 1000, T.R[1][0], T.R[1][1], T.R[1][2], T.p[1] * 1000, T.R[2][0], T.R[2][1], T.R[2][2], T.p[2] * 1000, 0, 0, 0, 1];
