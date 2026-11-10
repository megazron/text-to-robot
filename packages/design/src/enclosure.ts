// Electronics compartments. Every board, driver, regulator and battery sits inside a designed printed compartment: a
// hollow tub with screw towers, standoffs on the part's real hole pattern, a removable screwed lid, vents where parts get
// hot, grommeted cable exits with a tie anchor for strain relief, and panel cut-outs for USB, jacks and switches.
// Existing hollow bodies (a character shell, a robot's torso) register as compartments too. `enclosureChecks` then proves
// from the solids that each part really is inside, clear of the walls, and that lid and exits exist.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, electrical, type Vec3 } from "@ttr/parts";
import { apply, build, box as boxSolid, evaluate, invert, mul, frame, translation, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "./assembly.ts";
import { fk } from "./kin.ts";
import { linkSolid } from "./clearance.ts";
import type { Harness } from "./wiring.ts";

export type Face = "x-" | "x+" | "y-" | "y+" | "floor" | "lid";
export interface ExitSpec {
  id: string; face: Face;
  /** position on the face, in bay coordinates: along the wall (x or y) and z; floor / lid: x and y */
  u: number; v: number;
  kind: "grommet" | "gland" | "usb" | "switch" | "jack" | "window" | "slot";
  d?: number; w?: number; h?: number;
  /** no tie anchor inside (a board sits there) */
  noAnchor?: boolean;
  /** a panel part fitted in this cut-out */
  part?: { name: string; key: string; use: string; Tpanel?: Mat4 };
}
export interface BayPart { name: string; key: string; T: Mat4; use: string; kind?: "board" | "battery" | "plain"; standoff?: boolean; }
export interface VentZone { face: Face; a0: number; a1: number; b0: number; b1: number; }
export interface BayOpts {
  name: string; parent: string;
  /** pose of the bay frame in the parent's frame; the cavity runs from (0, 0, 0) to `size` */
  T: Mat4; size: Vec3;
  /** floor 0: an open frame standing on the parent, whose deck is the floor (lighter; parts then sit on the deck) */
  wall?: number; floor?: number; lidT?: number; corner?: number;
  material?: string; lidMaterial?: string;
  /** build on the CAD kernel (exact solids) instead of the mesh engine */
  cad?: boolean;
  parts: BayPart[]; exits: ExitSpec[]; vents?: VentZone[];
  /** extra ops merged into tub / lid, in bay coordinates */
  tubOps?: Op[]; lidOps?: Op[];
  /** floor holes that take screws from under the parent (default: into the four towers) */
  bolted?: boolean;
  /** tower positions override: bay-frame x, y */
  towers?: [number, number][];
  note?: string;
}
export interface BayRecord {
  name: string; tub: string; lid: string; parent: string; T: Mat4; min: Vec3; max: Vec3;
  parts: string[]; exits: { id: string; kind: string; face: Face; at: Vec3; normal: Vec3; hole_mm: number; part?: string }[];
  screws: number; vent_area_mm2: number; heat_w: number; note?: string;
  /** printed links that make up the walls and lid, when a compartment is in several pieces */
  solids?: string[];
}
export interface ExposedRecord { name: string; link: string; how: string; aperture_mm: [number, number]; }
export const baysOf = (A: Assembly) => ((A.design as { enclosures?: BayRecord[] }).enclosures ??= []);
export const exposedOf = (A: Assembly) => ((A.design as { exposed?: ExposedRecord[] }).exposed ??= []);
/** A sensor that must see out: it stays outside, through a window or on a mount, and says which. */
export function exposed(A: Assembly, name: string, how: string, aperture_mm: [number, number] = [10, 10]) { exposedOf(A).push({ name, link: name, how, aperture_mm }); }

const PILOT: Record<string, number> = { M2: 1.7, "M2.5": 2.2, M3: 2.6, M4: 3.4 };
const CLEAR = 3.4;
const WALL = 2.4;
const holesDown = (key: string) => part(key).holes.filter((h) => h.axis[2] < -0.5);

/** A battery's figure is at its full rated current, not in normal use: only boards count towards ventilation. */
/** Heat a part gives off inside a compartment (W); batteries are not counted. */
export const heatOf = (key: string) => (part(key).category === "battery" ? 0 : electrical(key)?.heat_w?.v ?? 0);
/** Grommet sizes in the wiring table are panel holes; this picks the smallest that passes a bundle. */
export const faceNormal = (f: Face): Vec3 => ({ "x-": [-1, 0, 0], "x+": [1, 0, 0], "y-": [0, -1, 0], "y+": [0, 1, 0], floor: [0, 0, -1], lid: [0, 0, 1] } as Record<Face, Vec3>)[f];

/** Where an exit lies in bay coordinates, on the inner face of the wall. */
function exitPoint(e: ExitSpec, s: Vec3): Vec3 {
  switch (e.face) {
    case "x-": return [0, e.u, e.v]; case "x+": return [s[0], e.u, e.v];
    case "y-": return [e.u, 0, e.v]; case "y+": return [e.u, s[1], e.v];
    case "floor": return [e.u, e.v, 0]; case "lid": return [e.u, e.v, s[2]];
  }
}
/** Cuts through the wall (or lid) for one exit, and its outer collar and inner tie anchor. */
function exitOps(e: ExitSpec, s: Vec3, wall: number, floor: number, lidT: number): { cut: Op[]; add: Op[]; lid: boolean } {
  const n = faceNormal(e.face), p = exitPoint(e, s), t = e.face === "floor" ? floor : e.face === "lid" ? lidT : wall, lid = e.face === "lid";
  const a: Vec3 = [p[0] - n[0] * 1, p[1] - n[1] * 1, p[2] - n[2] * 1], b: Vec3 = [p[0] + n[0] * (t + 3), p[1] + n[1] * (t + 3), p[2] + n[2] * (t + 3)];
  const cut: Op[] = [], addOps: Op[] = [];
  if (e.d) {
    cut.push({ op: "hole", a, b, d: e.d });
    if ((e.kind === "grommet" || e.kind === "gland") && e.face !== "floor" && e.face !== "lid") {   // a lid prints face down: its outside stays flat
      // collar round the grommet on the outside, so the exit reads as a designed fitting and the rubber seats on a thick edge
      const o: Vec3 = [p[0] + n[0] * (t - 0.2), p[1] + n[1] * (t - 0.2), p[2] + n[2] * (t - 0.2)], o2: Vec3 = [p[0] + n[0] * (t + 1.6), p[1] + n[1] * (t + 1.6), p[2] + n[2] * (t + 1.6)];
      addOps.push({ op: "rod", a: o, b: o2, r: e.d / 2 + 2.6 });
      cut.push({ op: "hole", a: [o[0] - n[0] * 2, o[1] - n[1] * 2, o[2] - n[2] * 2], b: [o2[0] + n[0], o2[1] + n[1], o2[2] + n[2]], d: e.d });
    }
  } else if (e.w && e.h) {
    const w = e.w / 2, h = e.h / 2;
    const lo = e.face.startsWith("x") ? [Math.min(a[0], b[0]), e.u - w, e.v - h] : e.face.startsWith("y") ? [e.u - w, Math.min(a[1], b[1]), e.v - h] : [e.u - w, e.v - h, Math.min(a[2], b[2])];
    const hi = e.face.startsWith("x") ? [Math.max(a[0], b[0]), e.u + w, e.v + h] : e.face.startsWith("y") ? [e.u + w, Math.max(a[1], b[1]), e.v + h] : [e.u + w, e.v + h, Math.max(a[2], b[2])];
    cut.push({ op: "cutbox", min: lo as Vec3, max: hi as Vec3 });
  }
  return { cut, add: addOps, lid };
}
/** Slots through a wall, lid or floor over a rectangle; returns ops and their open area (mm^2). */
function ventOps(v: VentZone, s: Vec3, wall: number, lidT: number, floor: number): { cut: Op[]; area: number } {
  const cut: Op[] = []; let area = 0; const pitch = 7, slot = 3.2;
  const horizontal = v.face === "lid" || v.face === "floor";
  const n = Math.max(1, Math.floor((v.b1 - v.b0 + pitch - slot) / pitch));
  const off = (v.b1 - v.b0 - (n * pitch - (pitch - slot))) / 2;
  for (let i = 0; i < n; i++) {
    const b0 = v.b0 + off + i * pitch, b1 = b0 + slot;
    area += (v.a1 - v.a0) * slot;
    if (horizontal) { const z0 = v.face === "lid" ? s[2] - 1 : -floor - 1, z1 = v.face === "lid" ? s[2] + lidT + 3 : 1; cut.push({ op: "cutbox", min: [v.a0, b0, z0], max: [v.a1, b1, z1] }); }
    else if (v.face.startsWith("x")) { const x0 = v.face === "x-" ? -wall - 3 : s[0] - 1, x1 = v.face === "x-" ? 1 : s[0] + wall + 3; cut.push({ op: "cutbox", min: [x0, b0, v.a0], max: [x1, b1, v.a1] }); }
    else { const y0 = v.face === "y-" ? -wall - 3 : s[1] - 1, y1 = v.face === "y-" ? 1 : s[1] + wall + 3; cut.push({ op: "cutbox", min: [b0, y0, v.a0], max: [b1, y1, v.a1] }); }
  }
  void wall;
  return { cut, area };
}
/** Standoffs for a board on its real hole pattern (tops at the board's underside); corner locators if it has no holes. */
export function standoffOps(key: string, T: Mat4): Op[] {
  const c = part(key), out: Op[] = [], hs = holesDown(key), bb = c.bbox_mm!;
  if (hs.length) {
    for (const h of hs) {
      const p = apply(T, h.pos), pil = PILOT[h.thread ?? "M3"] ?? 2.6, r = Math.max(2.6, pil / 2 + 1.5);
      if (p[2] < 0.5) continue;
      out.push({ op: "rod", a: [p[0], p[1], -0.2], b: [p[0], p[1], p[2] - 0.15], r }, { op: "hole", a: [p[0], p[1], Math.max(p[2] - 7, 0.6)], b: [p[0], p[1], p[2] + 0.5], d: pil });
    }
    return out;
  }
  // no holes: four corner locators the board drops between, with a small lip over its top edge
  const zb = apply(T, [bb.min[0], bb.min[1], 0])[2], pts = [[bb.min[0], bb.min[1]], [bb.max[0], bb.min[1]], [bb.min[0], bb.max[1]], [bb.max[0], bb.max[1]]].map(([x, y]) => apply(T, [x, y, 0]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const zt = Math.max(zb, 0) + 1.6;
  for (const [cx, sx] of [[x0, -1], [x1, 1]] as const) for (const [cy, sy] of [[y0, -1], [y1, 1]] as const) {
    out.push({ op: "box", min: [Math.min(cx + sx * 0.3, cx + sx * 2.8), Math.min(cy - sy * 5, cy + sy * 2.8), -0.2], max: [Math.max(cx + sx * 0.3, cx + sx * 2.8), Math.max(cy - sy * 5, cy + sy * 2.8), zt + 1.2] });
    out.push({ op: "box", min: [Math.min(cx - sx * 5, cx + sx * 2.8), Math.min(cy + sy * 0.3, cy + sy * 2.8), -0.2], max: [Math.max(cx - sx * 5, cx + sx * 2.8), Math.max(cy + sy * 0.3, cy + sy * 2.8), zt + 1.2] });
  }
  return out;
}
/** Pad under a battery: side rails and two slots for a hook-and-loop strap through the floor. */
function batteryOps(key: string, T: Mat4, floor: number): Op[] {
  const bb = part(key).bbox_mm!, corners = [[bb.min[0], bb.min[1]], [bb.max[0], bb.max[1]]].map(([x, y]) => apply(T, [x, y, 0]));
  const x0 = Math.min(corners[0][0], corners[1][0]), x1 = Math.max(corners[0][0], corners[1][0]), y0 = Math.min(corners[0][1], corners[1][1]), y1 = Math.max(corners[0][1], corners[1][1]);
  const long = x1 - x0 >= y1 - y0, H = 8, out: Op[] = [];
  if (long) {
    for (const [a, b] of [[y0 - 3, y0 - 0.4], [y1 + 0.4, y1 + 3]]) out.push({ op: "box", min: [x0 + 6, a, -0.2], max: [x0 + (x1 - x0) * 0.32, b, H] }, { op: "box", min: [x1 - (x1 - x0) * 0.32, a, -0.2], max: [x1 - 6, b, H] });
    const xm = (x0 + x1) / 2; for (const y of [y0 - 5, y1 + 5]) out.push({ op: "cutbox", min: [xm - 11, y - 1.4, -floor - 1], max: [xm + 11, y + 1.4, 1] });
  } else {
    for (const [a, b] of [[x0 - 3, x0 - 0.4], [x1 + 0.4, x1 + 3]]) out.push({ op: "box", min: [a, y0 + 6, -0.2], max: [b, y0 + (y1 - y0) * 0.32, H] }, { op: "box", min: [a, y1 - (y1 - y0) * 0.32, -0.2], max: [b, y1 - 6, H] });
    const ym = (y0 + y1) / 2; for (const x of [x0 - 5, x1 + 5]) out.push({ op: "cutbox", min: [x - 1.4, ym - 11, -floor - 1], max: [x + 1.4, ym + 11, 1] });
  }
  return out;
}
/** Towers merge into the rounded outer corners: their centres sit 2 mm outside the corner arc, along its diagonal. */
const towersOf = (s: Vec3, wall: number, rc: number, o: BayOpts): [number, number][] => { const t = (rc + wall) / Math.SQRT2 - rc + 2; return o.towers ?? [[-t, -t], [s[0] + t, -t], [-t, s[1] + t], [s[0] + t, s[1] + t]]; };

/**
 * A compartment: tub + lid as two printed links on `parent`, the parts mounted inside it, panel parts in their cut-outs.
 * Towers stand at the outside corners (they cost no room inside) and carry the lid screws; the tub bolts to the parent
 * from below through the same towers. The parent gets matching clearance holes.
 */
export function bay(A: Assembly, o: BayOpts, H?: Harness): BayRecord {
  const s = o.size, wall = o.wall ?? WALL, floor = o.floor ?? 2.4, lidT = o.lidT ?? 2.8, rc = o.corner ?? 4;
  const towers = towersOf(s, wall, rc, o);
  const outer: Op = { op: "box", min: [-wall, -wall, -floor], max: [s[0] + wall, s[1] + wall, s[2]], r: rc + wall };
  const hollow: Op = { op: "subtract", of: [{ op: "box", min: [0, 0, floor > 0 ? 0 : -1], max: [s[0], s[1], s[2] + 5], r: rc }] };
  const tub: Op[] = [{ op: "solid", of: [outer, hollow] }];
  const lidR = rc + wall, zl = s[2] + 0.2;
  const lid: Op[] = [{ op: "box", min: [-wall, -wall, zl], max: [s[0] + wall, s[1] + wall, zl + lidT], r: lidR }];
  // locating lip inside the walls, built as a thin frame
  lid.push({ op: "solid", of: [{ op: "box", min: [0.3, 0.3, zl - 3], max: [s[0] - 0.3, s[1] - 0.3, zl + 0.2], r: Math.max(rc - 0.3, 0.5) }, { op: "subtract", of: [{ op: "box", min: [2.1, 2.1, zl - 4], max: [s[0] - 2.1, s[1] - 2.1, zl + 1], r: Math.max(rc - 2.1, 0.5) }] }] });
  const screwR = 4.6;
  for (const [x, y] of towers) {
    tub.push({ op: "rod", a: [x, y, -floor], b: [x, y, s[2]], r: screwR });
    // lid screw from above, tub screw from below: both pilot holes in the tower, a web of solid between them
    tub.push({ op: "hole", a: [x, y, s[2] - 11], b: [x, y, s[2] + 1], d: PILOT.M3 });
    lid.push({ op: "rod", a: [x, y, zl], b: [x, y, zl + lidT], r: screwR }, { op: "hole", a: [x, y, zl - 1], b: [x, y, zl + lidT + 1], d: CLEAR }, { op: "hole", a: [x, y, zl + lidT - 1.6], b: [x, y, zl + lidT + 1], d: 6.2 });
  }
  const bolted = o.bolted !== false;
  if (bolted) for (const [x, y] of towers) tub.push({ op: "hole", a: [x, y, -floor - 1], b: [x, y, Math.min(s[2] - 13, 9)], d: PILOT.M3 });
  // exits
  const exits: BayRecord["exits"] = [];
  for (const e of o.exits) {
    const x = exitOps(e, s, wall, floor, lidT), to = x.lid ? lid : tub;
    to.push(...x.add, ...x.cut);
    if (e.kind === "grommet" || e.kind === "gland") {
      // strain relief: a bridge just inside the exit that a cable tie goes round
      const p = exitPoint(e, s), n = faceNormal(e.face), at: Vec3 = [p[0] - n[0] * 9, p[1] - n[1] * 9, p[2] - n[2] * 9];
      if (!e.noAnchor && (e.face.startsWith("x") || e.face.startsWith("y"))) tub.push(...tieAnchor(at, Math.max(p[2], 7)));
    }
    exits.push({ id: `${o.name}.${e.id}`, kind: e.kind, face: e.face, at: exitPoint(e, s).map((v, i) => v + faceNormal(e.face)[i] * (e.face === "floor" ? floor : e.face === "lid" ? lidT : wall)) as Vec3, normal: faceNormal(e.face), hole_mm: e.d ?? Math.min(e.w ?? 0, e.h ?? 0), ...(e.part ? { part: e.part.name } : {}) });
  }
  // vents
  let area = 0;
  for (const v of o.vents ?? []) { const r = ventOps(v, s, wall, lidT, floor); area += r.area; (v.face === "lid" ? lid : tub).push(...r.cut); }
  // standoffs, cradles
  for (const p of o.parts) {
    const k = p.kind ?? (part(p.key).category === "battery" ? "battery" : "board");
    if (k === "battery") tub.push(...batteryOps(p.key, p.T, floor));
    else if (k === "board" && p.standoff !== false) tub.push(...standoffOps(p.key, p.T));
  }
  tub.push(...(o.tubOps ?? [])); lid.push(...(o.lidOps ?? []));
  const lidName = `${o.name}_lid`;
  const tubP = { name: o.name, edge: 0.4, ops: [{ op: "at", T: o.T, of: tub } as Op] }, lidP = { name: lidName, edge: 0.4, ops: [{ op: "at", T: o.T, of: lid } as Op] };
  const mk = (p: typeof tubP, material: string) => (o.cad ? A.cadLink(p.name, p as never, { material }) : A.printedLink(p.name, { name: p.name, ops: p.ops as never }, { material }));
  mk(tubP, o.material ?? "printed_dark"); mk(lidP, o.lidMaterial ?? o.material ?? "printed_dark");
  const I: Mat4 = translation([0, 0, 0]);
  A.fixed(`${o.name}_mount`, o.parent, o.name, I); A.fixed(`${lidName}_mount`, o.name, lidName, I);
  A.fastener("M3 x 10 self-tapping (lid to compartment)", towers.length);
  if (bolted) {
    A.fastener("M3 x 12 self-tapping (compartment to its base, from below)", towers.length);
    A.amendProgram(o.parent, towers.map(([x, y]) => { const p = apply(o.T, [x, y, -floor]); return { op: "hole", a: [p[0], p[1], p[2] - 30], b: [p[0], p[1], p[2] + 0.4], d: CLEAR } as Op; }));
  }
  const heat = o.parts.reduce((h, p) => h + heatOf(p.key), 0);
  for (const p of o.parts) {
    A.mount(o.name, p.key, mul(o.T, p.T), p.name, p.use);
    const nh = holesDown(p.key).length;
    if (nh && p.standoff !== false) A.fastener(`${holesDown(p.key)[0].thread ?? "M3"} x 6 self-tapping (${part(p.key).name.split(" (")[0]} to standoffs)`, nh);
    else if ((p.kind ?? "") === "battery" || part(p.key).category === "battery") A.fastener("20 mm hook-and-loop strap (battery)", 1);
    H?.bayOf.set(p.name, o.name);
  }
  for (const e of o.exits) if (e.part) {
    const pt = exitPoint(e, s), n = faceNormal(e.face);
    const Tp = e.part.Tpanel ?? panelPose(pt, n, wall);
    A.mount(o.name, e.part.key, mul(o.T, Tp), e.part.name, e.part.use);
    H?.bayOf.set(e.part.name, o.name);
  }
  const rec: BayRecord = { name: o.name, tub: o.name, lid: lidName, parent: o.parent, T: o.T, min: [0, 0, 0], max: s, parts: [...o.parts.map((p) => p.name), ...o.exits.flatMap((e) => (e.part ? [e.part.name] : []))], exits, screws: towers.length, vent_area_mm2: Math.round(area), heat_w: +heat.toFixed(1), ...(o.note ? { note: o.note } : {}) };
  baysOf(A).push(rec);
  if (H) for (const e of exits) if (e.kind === "grommet" || e.kind === "gland" || e.kind === "slot") H.exits.push({ id: e.id, link: o.name, at: apply(o.T, e.at), normal: e.normal, panel_hole_mm: e.hole_mm, bay: o.name, kind: e.kind });
  return rec;
}
/**
 * A bench supply in its own printed case on the desk: fused and switched IEC inlet at one end, the supply on its real
 * bottom holes, a gland where the DC lead leaves, vents over the supply. The mains terminals are never exposed.
 * Returns the wiring names; the caller wires the DC side.
 */
export function supplyBox(A: Assembly, H: Harness, o: { parent: string; T: Mat4; key: string; name?: string; use: string; cad?: boolean }) {
  const name = o.name ?? "supply_case", psu = part(o.key).bbox_mm!, L = 36 + psu.max[0] + 3, Wd = psu.max[1] + 8, Hh = psu.max[2] + 12;
  const Tp = translation([36, 4, 5]);
  bay(A, { name, parent: o.parent, T: o.T, size: [L, Wd, Hh], cad: o.cad, corner: 5, bolted: false, material: "printed_dark", lidMaterial: "printed_dark",
    parts: [{ name: "power_supply", key: o.key, T: Tp, use: o.use }],
    exits: [{ id: "mains", face: "x-", u: Wd / 2, v: Hh / 2, kind: "switch", w: 47, h: 27.5, part: { name: "mains_inlet", key: "iec_c14_fused_switched", use: "fused, switched mains inlet" } },
      { id: "dc_out", face: "x+", u: Wd / 2, v: Hh - 11, kind: "gland", d: 12.5, noAnchor: true }],
    vents: [{ face: "lid", a0: 44, a1: L - 8, b0: 8, b1: Wd - 8 }, { face: "y-", a0: 8, a1: Hh - 6, b0: 44, b1: L - 8 }, { face: "y+", a0: 8, a1: Hh - 6, b0: 44, b1: L - 8 }] }, H);
  for (const [n, a, b] of [["MAINS_L", "L", "AC/L"], ["MAINS_N", "N", "AC/N"], ["MAINS_E", "E", "FG"]] as const) { H.net(n, "power", 230); H.wire(n, `mains_inlet.load.${a}`, `power_supply.ac_in.${b}`, { typ: 1, peak: 2 }); }
  H.label("mains_inlet~power_supply", "mains inlet to the supply (crimped, insulated spades; earth first)");
  H.notes.push("Mains side: IEC inlet to the supply's AC terminals with insulated spades and ferrules, earth wired first, case closed before plugging in. Have it checked if you are not qualified to wire mains.");
  return { name, psu: "power_supply" };
}
/**
 * A hood over parts already mounted on a deck: walls and roof in one printed part, screwed down at four tabs, so the hood
 * itself is the removable lid and the deck is the compartment's floor. Bounds are in the deck link's frame.
 */
export function hood(A: Assembly, H: Harness | undefined, o: { name: string; deck: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; parts: string[]; usb?: { face: Face; u: number }; grommets?: { id: string; face: Face; u: number; d?: number }[]; deckGrommets?: { id: string; x: number; y: number; d?: number }[]; material?: string; ventRows?: number; cad?: boolean; flip?: boolean; wallVents?: boolean; rocker?: { face: "x+" | "x-"; u: number; key?: string } }): BayRecord {
  const { x0, x1, y0, y1, z0, z1 } = o, t = WALL, top = 2.8, rc = 5;
  // flip: the hood hangs under the deck (turned 180 deg about x; bounds are given in that turned frame)
  const Tf: Mat4 = o.flip ? [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1] : translation([0, 0, 0]);
  const ops: Op[] = [{ op: "solid", of: [{ op: "box", min: [x0 - t, y0 - t, z0], max: [x1 + t, y1 + t, z1 + top], r: rc + t }, { op: "subtract", of: [{ op: "box", min: [x0, y0, z0 - 1], max: [x1, y1, z1], r: rc }] }] }];
  // four tabs on the deck, blended into the corners
  const tabs: [number, number][] = [[x0 - 1.6, y0 - 1.6], [x1 + 1.6, y0 - 1.6], [x0 - 1.6, y1 + 1.6], [x1 + 1.6, y1 + 1.6]];
  for (const [x, y] of tabs) ops.push({ op: "rod", a: [x, y, z0], b: [x, y, z0 + 7], r: 4.6 }, { op: "hole", a: [x, y, z0 - 1], b: [x, y, z0 + 8], d: CLEAR }, { op: "hole", a: [x, y, z0 + 5], b: [x, y, z1 + top + 1], d: 6.4 });
  // vents across the roof
  const rows = o.ventRows ?? Math.max(2, Math.floor((y1 - y0 - 16) / 7)); let area = 0;
  for (let i = 0; i < rows; i++) { const y = y0 + 8 + i * 7; ops.push({ op: "cutbox", min: [x0 + 10, y, z1 - 1], max: [x1 - 10, y + 3.2, z1 + top + 1] }); area += (x1 - x0 - 20) * 3.2; }
  // hot parts: slots along both long walls as well
  if (o.wallVents) for (let x = x0 + 12; x < x1 - 12; x += 7) for (const [a, b] of [[y0 - t - 1, y0 + 1], [y1 - 1, y1 + t + 1]]) { ops.push({ op: "cutbox", min: [x, a, z0 + 10], max: [x + 3.2, b, z1 - 5] }); area += 3.2 * (z1 - 5 - z0 - 10); }
  const exits: BayRecord["exits"] = [];
  const pt = (face: Face, u: number, z: number): Vec3 => face === "x-" ? [x0 - t, u, z] : face === "x+" ? [x1 + t, u, z] : face === "y-" ? [u, y0 - t, z] : [u, y1 + t, z];
  if (o.usb) {
    const f = o.usb.face, p = pt(f, o.usb.u, z0 + 13), hw = 22;
    ops.push({ op: "cutbox", min: f[0] === "x" ? [p[0] - t - 1, p[1] - hw, z0 + 4] : [p[0] - hw, p[1] - t - 1, z0 + 4], max: f[0] === "x" ? [p[0] + t + 1, p[1] + hw, z0 + 22] : [p[0] + hw, p[1] + t + 1, z0 + 22] });
    exits.push({ id: `${o.name}.usb`, kind: "usb", face: f, at: p, normal: faceNormal(f), hole_mm: 18 });
  }
  for (const g of o.grommets ?? []) {
    const d = g.d ?? 9.5, p = pt(g.face, g.u, z0 + 10), n = faceNormal(g.face);
    ops.push({ op: "hole", a: [p[0] - n[0] * 5, p[1] - n[1] * 5, p[2]], b: [p[0] + n[0] * 3, p[1] + n[1] * 3, p[2]], d });
    exits.push({ id: `${o.name}.${g.id}`, kind: "grommet", face: g.face, at: p, normal: n, hole_mm: d });
  }
  if (o.rocker) {
    const x = o.rocker.face === "x+" ? x1 : x0, n = o.rocker.face === "x+" ? 1 : -1, zc = (z0 + z1) / 2;
    // a battery switch (a high-current robot) stands in a round 52.4 mm hole; a rocker in a 30.4 x 22.4 mm window
    const round = o.rocker.key === BATTERY_SWITCH;
    ops.push(round ? { op: "hole", a: [x - n * 2, o.rocker.u, zc], b: [x + n * (t + 2), o.rocker.u, zc], d: 52.4 }
      : { op: "cutbox", min: [Math.min(x, x + n * (t + 1)) - 1, o.rocker.u - 11.2, zc - 15.2], max: [Math.max(x, x + n * (t + 1)) + 1, o.rocker.u + 11.2, zc + 15.2] });
    exits.push({ id: `${o.name}.switch`, kind: "switch", face: o.rocker.face, at: [x + n * t, o.rocker.u, zc], normal: [n, 0, 0], hole_mm: round ? 52.4 : 22, part: "main_switch" });
  }
  const dHoles: Op[] = [];
  for (const g of o.deckGrommets ?? []) {
    const d = g.d ?? 9.5;
    dHoles.push({ op: "hole", a: [g.x, g.y, z0 - 12], b: [g.x, g.y, z0 + 1], d });
    exits.push({ id: `${o.name}.${g.id}`, kind: "grommet", face: "floor", at: [g.x, g.y, z0], normal: [0, 0, -1], hole_mm: d });
  }
  const placed: Op[] = o.flip ? [{ op: "at", T: Tf, of: ops }] : ops;
  if (o.cad) A.cadLink(o.name, { name: o.name, edge: 0.4, ops: placed } as never, { material: o.material ?? "printed_dark" });
  else A.printedLink(o.name, { name: o.name, ops: placed }, { material: o.material ?? "printed_dark" });
  A.fixed(`${o.name}_mount`, o.deck, o.name, translation([0, 0, 0]));
  A.amendProgram(o.deck, [{ op: "at", T: Tf, of: [...tabs.map(([x, y]): Op => ({ op: "hole", a: [x, y, z0 - 8], b: [x, y, z0 + 0.5], d: PILOT.M3 })), ...dHoles] }]);
  A.fastener("M3 x 12 self-tapping (hood to deck)", 4);
  if (o.rocker) { const n = o.rocker.face === "x+" ? 1 : -1; A.mount(o.name, o.rocker.key ?? "switch_kcd4", frame([(n > 0 ? x1 : x0) + n * t, o.rocker.u, (z0 + z1) / 2], [n, 0, 0], [0, 1, 0]), "main_switch", "main power switch"); }
  const rec = registerBay(A, { name: o.name, tub: o.deck, lid: o.name, parent: o.deck, T: Tf, min: [x0, y0, z0], max: [x1, y1, z1], parts: o.parts, exits, screws: 4, vent_area_mm2: Math.round(area), solids: [o.name] }, H);
  // the rocker's tabs are inside the hood: its wires, and the splices that sit by it, belong to this compartment
  if (o.rocker) H?.bayOf.set("main_switch", o.name);
  return rec;
}
/**
 * The bench control case of a robot fixed to a table: the supply (mains supply with a fused inlet, or a jack and switch for a
 * wall adapter) and the control boards in one printed case, USB windows in the long wall, a gland where the harness leaves.
 */
export function controlCase(A: Assembly, H: Harness, o: { parent: string; T: Mat4; psu: string | null; psuUse?: string; boards: { name: string; key: string; use: string }[]; cad?: boolean }) {
  const PSU_X = 68, inPsu = !!o.psu, pb = inPsu ? part(o.psu!).bbox_mm! : null, L = inPsu ? PSU_X + pb!.max[0] + 24 : 26 + o.boards.reduce((s, b) => s + part(b.key).bbox_mm!.max[0] + 6, 0);
  const sizes = o.boards.map((b) => { const q = part(b.key).bbox_mm!; return { l: q.max[0] - q.min[0], w: q.max[1] - q.min[1], h: q.max[2] - q.min[2], q }; });
  // boards in a row along the long wall, behind the supply
  const yB = inPsu ? pb!.max[1] + 7 : 3, bw = Math.max(...sizes.map((s) => s.w), 0), Wd = yB + bw + 4;
  const rowL = sizes.reduce((s, b) => s + b.l + 6, 6), L2 = Math.max(L, rowL + 6);
  const Hh = Math.max(inPsu ? pb!.max[2] + 12 : 0, Math.max(...sizes.map((s) => s.h), 0) + 5 + 14, 36);
  const parts: BayPart[] = [], exits: ExitSpec[] = [];
  if (inPsu) parts.push({ name: "power_supply", key: o.psu!, T: translation([PSU_X, 4, 5]), use: o.psuUse ?? "bench supply" });
  let x = 6;
  o.boards.forEach((b, i) => {
    const s = sizes[i]; parts.push({ name: b.name, key: b.key, T: translation([x - s.q.min[0], yB - s.q.min[1], 5]), use: b.use });
    const c = part(b.key).category;
    if (c === "compute" || /usb|u2d2|adapter/.test(b.key)) exits.push({ id: `usb_${b.name}`, face: "y+", u: x + s.l / 2, v: 5 + 8, kind: "usb", w: 16, h: 13 });
    x += s.l + 6;
  });
  if (inPsu) exits.push({ id: "mains", face: "x-", u: 4 + pb!.max[1] / 2, v: Hh / 2, kind: "switch", w: 47, h: 27.5, part: { name: "mains_inlet", key: "iec_c14_fused_switched", use: "fused, switched mains inlet" } });
  else {
    exits.push({ id: "power_in", face: "x-", u: Wd * 0.3, v: Hh / 2, kind: "jack", d: 8, part: { name: "power_jack", key: "dc_jack_5521_panel", use: "adapter socket" } }, { id: "switch", face: "x-", u: Wd * 0.72, v: Hh / 2, kind: "switch", w: 19.4, h: 13.4, part: { name: "main_switch", key: "switch_kcd1", use: "main power switch" } });
  }
  exits.push({ id: "harness", face: "x+", u: Wd / 2, v: Hh - 11, kind: "gland", d: 12.5, noAnchor: true });
  const vents: VentZone[] = [{ face: "lid", a0: 8, a1: L2 - 8, b0: 6, b1: Wd - 6 }, { face: "y-", a0: 8, a1: Hh - 6, b0: 8, b1: L2 - 8 }];
  bay(A, { name: "control_case", parent: o.parent, T: o.T, size: [L2, Wd, Hh], cad: o.cad, corner: 5, bolted: false, material: "printed_dark", lidMaterial: "printed_accent", parts, exits, vents }, H);
  if (inPsu) {
    for (const [n, a, b] of [["MAINS_L", "L", "AC/L"], ["MAINS_N", "N", "AC/N"], ["MAINS_E", "E", "FG"]] as const) { H.net(n, "power", 230); H.wire(n, `mains_inlet.load.${a}`, `power_supply.ac_in.${b}`, { typ: 1, peak: 2 }); }
    H.label(["mains_inlet", "power_supply"].sort().join("~"), "mains inlet to the supply (crimped, insulated spades; earth first)");
    H.mainSwitch = "mains_inlet";
    H.notes.push("Mains side: IEC inlet to the supply's AC terminals with insulated spades, earth wired first, case closed before plugging in. Have it checked if you are not qualified to wire mains.");
  }
}
/** World box of a mounted part at the home pose (mm). */
export function worldBox(A: Assembly, name: string): { lo: Vec3; hi: Vec3 } {
  const f = fk(A.spec), t = f.link[name], k = keyOf(A.spec, name), bb = part(k!).bbox_mm!;
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [bb.min[0], bb.max[0]]) for (const y of [bb.min[1], bb.max[1]]) for (const z of [bb.min[2], bb.max[2]]) for (let i = 0; i < 3; i++) { const v = t.R[i][0] * x + t.R[i][1] * y + t.R[i][2] * z + t.p[i] * 1000; lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); }
  return { lo, hi };
}
/** A spot `size` wide on a plane where no bought part stands in the height range. World mm. */
export function freeSpot(A: Assembly, area: { x0: number; x1: number; y0: number; y1: number }, z: [number, number], size: [number, number], extra: { x0: number; x1: number; y0: number; y1: number }[] = [], near?: [number, number]): [number, number] | null {
  const boxes = A.spec.links.filter((l) => l.geometry.type === "mesh" && l.geometry.part === "component" && part(String(l.geometry.params?.key)).bbox_mm).map((l) => worldBox(A, l.name)).filter((b) => b.hi[2] > z[0] && b.lo[2] < z[1]);
  const clear = (x: number, y: number) => !boxes.some((b) => b.hi[0] > x - size[0] / 2 && b.lo[0] < x + size[0] / 2 && b.hi[1] > y - size[1] / 2 && b.lo[1] < y + size[1] / 2) && !extra.some((r) => r.x1 > x - size[0] / 2 && r.x0 < x + size[0] / 2 && r.y1 > y - size[1] / 2 && r.y0 < y + size[1] / 2);
  const cx = near?.[0] ?? (area.x0 + area.x1) / 2, cy = near?.[1] ?? (area.y0 + area.y1) / 2, pts: [number, number][] = [];
  for (let x = area.x0 + size[0] / 2; x <= area.x1 - size[0] / 2; x += 4) for (let y = area.y0 + size[1] / 2; y <= area.y1 - size[1] / 2; y += 4) pts.push([x, y]);
  return pts.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy)).find(([x, y]) => clear(x, y)) ?? null;
}
/** The battery switch a robot whose running current is past a rocker's 16 A gets (Blue Sea 6006: 70 mm face, 60 mm deep). */
export const BATTERY_SWITCH = "switch_battery_6006";
/** Where along the end wall a switch's body (half width h, depth dp) has nothing behind it. */
const rockerU = (bs: { lo: Vec3; hi: Vec3 }[], x1: number, y0: number, y1: number, h = 13, dp = 29, want = (y0 + y1) / 2) => { const free = (u: number) => u - h >= y0 + 3 && u + h <= y1 - 3 && !bs.some((b) => b.hi[0] > x1 - dp && b.hi[1] > u - h && b.lo[1] < u + h); for (let d = 0; d < y1 - y0; d += 3) for (const u of [want + d, want - d]) if (free(u)) return u; return (y0 + y1) / 2; };
/** A hood sized round parts already on a deck, with a grommet through the deck where nothing stands. Returns its record. */
export function hoodAround(A: Assembly, H: Harness, o: { name: string; deck: string; alsoHoles?: string[]; parts: string[]; z0: number; pad?: number; limit?: { x0: number; x1: number; y0: number; y1: number }; material?: string; usbFor?: string; z1?: number; grommets?: { id: string; face: Face; u: number; d?: number }[]; rocker?: boolean | { key: string };
  /** the deck's cable hole also stays clear of every bought part this far under the deck (a pack in the tub below: a cable coming through needs room to turn) */
  below?: number;
  /** where the deck's cable hole is wanted: the free spot nearest this point is taken (default: nearest the middle of the hood) */
  near?: [number, number];
  /** side of the square kept free round the hole above the deck, so a stiff lead coming up has room to turn (default 11 mm; the largest of this, 2/3 of it and 11 that fits) */
  room?: number;
  /** the rocker stands in line with the deck's cable hole (the lead that comes up through it runs straight on to the switch) */
  rockerAtHole?: boolean }) {
  const pad = o.pad ?? 3.5, bs = o.parts.map((n) => worldBox(A, n));
  let x0 = Math.min(...bs.map((b) => b.lo[0])) - pad, x1 = Math.max(...bs.map((b) => b.hi[0])) + pad, y0 = Math.min(...bs.map((b) => b.lo[1])) - pad, y1 = Math.max(...bs.map((b) => b.hi[1])) + pad;
  const big = typeof o.rocker === "object" && o.rocker.key === BATTERY_SWITCH, rockerKey = typeof o.rocker === "object" ? o.rocker.key : undefined;
  // room for the switch body behind the end wall (a battery switch's body stands over the boards instead: see z1)
  if (o.rocker && !big) x1 += 30;
  if (o.limit) { x0 = Math.max(x0, o.limit.x0); x1 = Math.min(x1, o.limit.x1); y0 = Math.max(y0, o.limit.y0); y1 = Math.min(y1, o.limit.y1); }
  // an upright rocker needs 34 mm of wall, a battery switch's 70 mm face 72
  // a battery switch's 60 mm body lies over the boards: its 70 mm face starts 2 mm above the tallest of them
  const tallest = Math.max(...bs.map((b) => b.hi[2]));
  const z1 = Math.max(o.z1 ?? tallest + 7, o.rocker ? o.z0 + (big ? 72 : 35) : 0, big ? tallest + 2 + 70 + 2 : -Infinity);   // -Infinity, not 0: a hood can hang below its plate (z < 0)
  const heat = o.parts.reduce((h, n) => h + heatOf(keyOf(A.spec, n)!), 0), roof = (x1 - x0 - 20) * 3.2 * Math.max(2, Math.floor((y1 - y0 - 16) / 7));
  const spot = (side: number) => freeSpot(A, { x0: x0 + 4, x1: x1 - 4, y0: y0 + 4, y1: y1 - 4 }, [o.z0 - (o.below ?? 0), z1], [side, side], [], o.near);
  const g = (o.room ? spot(o.room) ?? spot(Math.max(11, (o.room * 2) / 3)) : null) ?? spot(11) ?? freeSpot(A, { x0: x0 + 4, x1: x1 - 4, y0: y0 + 4, y1: y1 - 4 }, [o.z0, z1], [11, 11]) ?? [(x0 + x1) / 2, y1 - 6];
  let usb: { face: Face; u: number } | undefined;
  if (o.usbFor) { const b = worldBox(A, o.usbFor), cx = (b.lo[0] + b.hi[0]) / 2, cy = (b.lo[1] + b.hi[1]) / 2; const opts: [number, Face, number][] = [[cx - x0, "x-", cy], [x1 - cx, "x+", cy], [cy - y0, "y-", cx], [y1 - cy, "y+", cx]]; const s = opts.sort((a, c) => a[0] - c[0])[0]; usb = { face: s[1], u: s[2] }; }
  const rec = hood(A, H, { name: o.name, deck: o.deck, x0, x1, y0, y1, z0: o.z0, z1, parts: o.parts, usb, grommets: o.grommets, deckGrommets: [{ id: "deck", x: g[0], y: g[1] }], material: o.material, wallVents: roof < ventNeed(heat), ...(o.rocker ? { rocker: { face: "x+" as const, u: big ? (y0 + y1) / 2 : rockerU(bs, x1, y0, y1, 13, 29, o.rockerAtHole ? g[1] : undefined), key: rockerKey } } : {}) });
  for (const n of o.alsoHoles ?? []) A.amendProgram(n, [{ op: "hole", a: [g[0], g[1], o.z0 - 12], b: [g[0], g[1], o.z0 + 1], d: 9.5 }]);
  return rec;
}
/** The main switch standing in a deck, its body in the room below. World mm; the deck's own frame is the world's. */
export function deckSwitch(A: Assembly, deck: string, at: [number, number], zTop: number, key = "switch_kcd4") {
  const c = part(key).specs.panel_cutout_mm as number[];
  A.amendProgram(deck, [{ op: "cutbox", min: [at[0] - c[0] / 2 - 0.2, at[1] - c[1] / 2 - 0.2, zTop - 12], max: [at[0] + c[0] / 2 + 0.2, at[1] + c[1] / 2 + 0.2, zTop + 1] }]);
  A.mount(deck, key, frame([at[0], at[1], zTop], [0, 0, 1], [1, 0, 0]), "main_switch", "main power switch");
}
/** Panel part frame: component z along the outward normal, flange against the wall's outer face. */
export function panelPose(p: Vec3, n: Vec3, wall: number): Mat4 { return frame([p[0] + n[0] * wall, p[1] + n[1] * wall, p[2] + n[2] * wall], n, Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]); }
/** A small bridge a cable tie passes under, standing on the floor. */
export function tieAnchor(at: Vec3, h = 7): Op[] {
  const z = 4.6;
  void h;
  return [{ op: "box", min: [at[0] - 5, at[1] - 2, -0.2], max: [at[0] - 3, at[1] + 2, z] }, { op: "box", min: [at[0] + 3, at[1] - 2, -0.2], max: [at[0] + 5, at[1] + 2, z] }, { op: "box", min: [at[0] - 5, at[1] - 2, z - 1.6], max: [at[0] + 5, at[1] + 2, z] }];
}
/** Register a hollow body that already is a compartment (a character's shell, a robot's torso). */
export function registerBay(A: Assembly, r: Omit<BayRecord, "vent_area_mm2" | "heat_w" | "screws"> & { screws: number; vent_area_mm2?: number; heat_w?: number }, H?: Harness) {
  const heat = r.heat_w ?? r.parts.reduce((h, n) => { const k = keyOf(A.spec, n); return h + (k ? heatOf(k) : 0); }, 0);
  const rec: BayRecord = { ...r, vent_area_mm2: r.vent_area_mm2 ?? 0, heat_w: +heat.toFixed(1) };
  baysOf(A).push(rec);
  if (H) { for (const p of r.parts) H.bayOf.set(p, r.name); for (const e of r.exits) if (e.kind === "grommet" || e.kind === "gland" || e.kind === "slot") H.exits.push({ id: e.id, link: r.tub, at: apply(r.T, e.at), normal: e.normal, panel_hole_mm: e.hole_mm, bay: r.name, kind: e.kind }); }
  return rec;
}
const keyOf = (spec: RobotSpecification, name: string) => { const l = spec.links.find((x) => x.name === name); return l?.geometry.type === "mesh" && l.geometry.part === "component" ? String(l.geometry.params?.key) : undefined; };

// ------------------------------------------------------------------------------------------- checks
/** Parts that must live in a compartment. Sensors that see out, servos, motors, wheels and structure do not. */
export function needsEnclosure(key: string): boolean {
  const c = part(key);
  if (["compute", "motor_driver", "battery"].includes(c.category)) return true;
  return /^(buck_|dcdc_|psu_|breadboard|pca9685|bno085)/.test(key) && !/adapter/.test(key);
}
/** Ventilation rule of thumb for natural convection in a closed printed box: 3 cm^2 of opening per watt, 10 cm^2 minimum if anything gets warm. */
export const ventNeed = (heatW: number) => (heatW < 0.5 ? 0 : Math.max(1000, heatW * 300));

const inside = (p: Vec3, r: BayRecord, tol: number) => p.every((v, k) => v >= r.min[k] - tol && v <= r.max[k] + tol);
/** Proof from the solids: every electronic part inside a compartment and clear of its walls; lid and exits exist. */
export function enclosureChecks(A: Assembly) {
  const spec = A.spec, bays = baysOf(A), f = fk(spec), byName = new Map(spec.links.map((l) => [l.name, l]));
  const mm = (name: string): Mat4 => { const t = f.link[name]; return [t.R[0][0], t.R[1][0], t.R[2][0], 0, t.R[0][1], t.R[1][1], t.R[2][1], 0, t.R[0][2], t.R[1][2], t.R[2][2], 0, t.p[0] * 1000, t.p[1] * 1000, t.p[2] * 1000, 1]; };
  const parts = spec.links.flatMap((l) => (l.geometry.type === "mesh" && l.geometry.part === "component" ? [{ name: l.name, key: String(l.geometry.params?.key) }] : [])).filter((p) => needsEnclosure(p.key) && !exposedOf(A).some((e) => e.name === p.name));
  const results: { name: string; pass: boolean; detail: string }[] = [];
  // only the compartments' own solids are built: the CSG heap never shrinks and has a hard limit
  build(() => {
    const solidCache = new Map<string, ReturnType<typeof boxSolid> | null>();
    const placedSolid = (n: string) => { if (!solidCache.has(n)) { const l = byName.get(n), s = l ? linkSolid(l) : null; solidCache.set(n, s ? s.transform(mm(n)) : null); } return solidCache.get(n)!; };
    for (const p of parts) {
      const bb = part(p.key).bbox_mm!, W = mm(p.name);
      const corners: Vec3[] = []; for (const x of [bb.min[0], bb.max[0]]) for (const y of [bb.min[1], bb.max[1]]) for (const z of [bb.min[2], bb.max[2]]) corners.push(apply(W, [x, y, z]));
      const host = bays.find((r) => { const Bw = mul(mm(r.tub), r.T), inv = invert(Bw); return corners.every((c) => inside(apply(inv, c), r, 0.5)); });
      results.push({ name: `enclosure:inside:${p.name}`, pass: !!host, detail: host ? `${part(p.key).name} is inside ${host.name}` : `${part(p.key).name} is not inside any compartment` });
      if (!host) continue;
      // clearance against the compartment's solid: the part's box grown by 0.3 mm sideways and on top must not touch the walls
      const hostSolids = host.solids ?? [host.tub, host.lid];
      let over = 0, where = "";
      const placedHost = hostSolids.map((n) => [n, placedSolid(n)] as const);   // outside the inner build: they are cached for the next part
      build(() => {
        const g = 0.3, b = boxSolid([bb.min[0] - g, bb.min[1] - g, bb.min[2] + 2], [bb.max[0] + g, bb.max[1] + g, bb.max[2] + g]).transform(W);
        for (const [n, s] of placedHost) { if (!s) continue; const v = s.intersect(b).volume(); over += v; if (v > 1) where += ` ${n}`; }
      });
      results.push({ name: `enclosure:clearance:${p.name}`, pass: over < 8, detail: over < 8 ? `0.3 mm clear of the walls and lid of ${host.name} (standoffs and locators excepted)` : `${over.toFixed(0)} mm^3 of ${host.name} inside the part's envelope:${where}` });
    }
  });
  for (const r of results) A.check(r.name, r.pass, r.detail);
  for (const b of bays) {
    A.check(`enclosure:lid:${b.name}`, (byName.has(b.lid) || !!b.solids?.some((n) => byName.has(n))) && b.screws >= 2, `removable lid ${b.lid}, ${b.screws} screws`);
    const cableExits = b.exits.filter((e) => ["grommet", "gland", "slot"].includes(e.kind));
    A.check(`enclosure:exits:${b.name}`, cableExits.length > 0, `${cableExits.length} cable exits with strain relief: ${cableExits.map((e) => `${e.id.split(".").pop()} (${e.kind}, ${e.hole_mm} mm)`).join(", ")}`);
    const need = ventNeed(b.heat_w);
    A.check(`enclosure:vent:${b.name}`, b.vent_area_mm2 >= need, `${b.heat_w} W inside, ${(b.vent_area_mm2 / 100).toFixed(1)} cm^2 of vents (needs ${(need / 100).toFixed(1)} cm^2: 3 cm^2 per watt, natural convection rule of thumb)`);
  }
  // USB and switches must be reachable: controller ports through a cut-out near the board, the main switch in a wall
  for (const b of bays) {
    const usbs = b.exits.filter((e) => e.kind === "usb"), inv = (name: string) => { const W = mm(name), T = mul(invert(mul(mm(b.tub), b.T)), W), bb = part(keyOf(spec, name)!).bbox_mm!; return apply(T, [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2]); };
    for (const n of b.parts) {
      // an I/O board talks to the computer inside the bay: only the main controller needs a USB port from outside
      const k = keyOf(spec, n); if (!k || part(k).category !== "compute" || n === "io_controller") continue;
      const c = inv(n), span = Math.max(...[0, 1, 2].map((i) => part(k).bbox_mm!.max[i] - part(k).bbox_mm!.min[i]));
      const near = usbs.find((e) => Math.hypot(e.at[0] - c[0], e.at[1] - c[1], e.at[2] - c[2]) <= span / 2 + 45);
      A.check(`enclosure:usb:${n}`, !!near, near ? `USB of ${n} reached through ${near.id} without opening the lid` : `no USB cut-out near ${n}`);
    }
    const sw = b.exits.find((e) => e.kind === "switch");
    if (sw) A.check(`enclosure:switch:${b.name}`, !!sw.part && byName.has(sw.part), `main switch ${sw.part} sits in the ${sw.face} wall, reached from outside`);
  }
  for (const e of exposedOf(A)) A.check(`enclosure:sensor:${e.name}`, byName.has(e.name), `${e.name} stays outside on purpose: ${e.how}`);
}
void evaluate;
