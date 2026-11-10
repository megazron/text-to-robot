// Wheeled robots built like real hobby/research platforms (TurtleBot, 4WD skid-steer kits, goBILDA
// mecanum chassis, the JPL Open Source Rover) and three film characters re-engineered as robots
// that can actually be bought, printed and assembled. Every wheel is turned by a catalog gearmotor
// bolted to a printed bracket through its real face holes; electronics sit on printed standoff
// plates; drive motors and batteries are chosen from the mass of the robot as built.
//
// World frame used while building (mm): x forward, y left, z up, floor at z = 0. base_link's frame
// is the world frame, so most printed programs are written directly in world coordinates.
import type { RobotSpecification, Link, Sensor, Joint } from "@ttr/robot-schema";
import { part, rating, type Vec3 } from "@ttr/parts";
import { Assembly, componentGeometry, printedGeometry } from "../assembly.ts";
import { frame, invert, mul, apply, I4, translation, toPose, type Mat4, type Op } from "@ttr/solid";
import { fk, linkCom, totalMass, gravityTorques, type PointLoad } from "../kin.ts";
import { designArm, graftArm, type ArmRequest } from "./arm.ts";
import { evaluate, DYNAMIC_FACTOR, type Ladder } from "../sizing.ts";
import { registerBay, enclosureChecks, exposed, baysOf, worldBox as partBox, heatOf, ventNeed, type BayRecord, type Face } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { busTree, dualDriver, pinsOf, coreTree, actuatorsUnder } from "../netlist.ts";
import { partModel } from "../wiring3d/models.ts";
import { pinOf, connectorLen } from "../wiring3d/place.ts";

export type MobileSensor = "camera" | "depth" | "lidar" | "imu";
export interface MobileRequest {
  name?: string; prompt?: string; budget?: number;
  /** cargo on the deck (bases) or payload in each hand (robots with arms), kg */
  payloadKg?: number;
  sensors?: MobileSensor[];
  /** sensor types the prompt rules out ("no lidar"): dropped from the defaults */
  excludeSensors?: string[];
  wheels?: number;
  arm?: { dof: number; reachM?: number; payloadKg?: number; gripper?: boolean };
}

// ---------------------------------------------------------------- requirements and constants
export const DRIVE_REQ = { slopeDeg: 10, accel: 0.5, crr: 0.03, speedFactor: 0.8, runtimeH: 1, usableEnergy: 0.8, lateralMu: 0.5, tractionMu: 0.7 };
const G = 9.81;
/** Pololu 37D 12 V family, fastest first: the first one that carries the load is chosen. */
export const DRIVE_MOTORS = ["pololu_37d_30to1_64cpr", "pololu_37d_50to1_64cpr", "pololu_37d_70to1_64cpr"];
/** 3S packs only: every motor and servo on these robots is a 12 V part (3S is 9.9-12.6 V). */
export const BATTERIES: [string, number][] = [["lipo_3s_2200", 1], ["lipo_3s_5000", 1], ["lipo_3s_5000", 2]];
const FILAMENT_USD_PER_KG = 25;
const ALU = 2700;

const D2R = Math.PI / 180;
const rotZ = (deg: number): Mat4 => { const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
const scaleM = (sx: number, sy: number, sz: number): Mat4 => [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
const at = (T: Mat4, p: Vec3) => mul(translation(p), T);

/** Wheel facts in its component frame (hub face z = 0, wheel along +z). */
function wheelInfo(key: string) {
  const c = part(key), s = c.specs, mec = key.startsWith("mecanum");
  const r = Number(s.od_mm) / 2, zFar = c.bbox_mm!.max[2];
  return { r, zFar, mec, zw: mec ? 7 : 10, tyre: mec ? Number(s.hub_offset_mm) + Number(s.width_mm) / 2 : zFar - Number(s.width_mm) / 2 };
}
/** Height of the gearmotor's top above the axle (gearbox centre sits 7 mm above the shaft). */
const MOTOR_TOP = 7 + 18.4;

// ------------------------------------------------------------------------------- the builder
interface Contact { x: number; y: number; driven: boolean }
interface ArmRec { prefix: string; tool: { link: string; xyz_m: Vec3; payload_kg: number }; joints: string[]; ladder: string }

class Build {
  A: Assembly;
  W = new Map<string, Mat4>([["base_link", I4()]]);
  contacts: Contact[] = [];
  power: { what: string; w: number }[] = [];
  fab: { item: string; usd: number }[] = [];
  arms: ArmRec[] = [];
  servoJoints: string[] = [];
  motors: string[] = [];
  deckTop = 0;
  /** the pack has room beside it (Item.room) for its fuse and star ground: they go there */
  packRoom = false;
  /** printed rings standing in a compartment (round a lidar mast), world mm, for seating harness parts clear of them */
  keepOut: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[] = [];
  H: Harness;
  constructor(name: string, family: string, prompt?: string) {
    this.A = new Assembly(name, family, prompt);
    this.H = new Harness(this.A);
    this.A.spec.root = "base_link";
    this.A.spec.materials.push({ name: "fabric", color: [0.97, 0.97, 0.95, 1] }, { name: "visor", color: [0.03, 0.03, 0.05, 1] },
      { name: "led", color: [0.25, 0.75, 1.0, 1] }, { name: "aluminium", color: [0.56, 0.58, 0.62, 1] }, { name: "walle", color: [0.85, 0.62, 0.15, 1] });
  }
  w(link: string) { const T = this.W.get(link); if (!T) throw new Error(`no world pose for ${link}`); return T; }
  local(parent: string, Tw: Mat4) { return mul(invert(this.w(parent)), Tw); }
  /** a world-coordinate program expressed in the frame of `link` */
  in(link: string, ops: Op[]): Op[] { return [{ op: "at", T: invert(this.w(link)), of: ops }]; }

  /** printed part, rigidly bolted to `parent` (its frame = the parent's frame); ops in world mm */
  printed(name: string, parent: string | null, ops: Op[], material = "printed", role = "structure") {
    const ref = parent ?? "base_link";
    try { this.A.printedLink(name, { name, ops: this.in(ref, ops) }, { role, material }); } catch (e) { throw new Error(`printed part ${name}: ${(e as Error).message}`); }
    if (parent) { this.A.fixed(`${name}_mount`, parent, name, I4()); this.W.set(name, this.w(parent)); }
  }
  /** fabricated (not printed) part: laser-cut aluminium / plywood / sewn fabric. Mass from its solid. */
  fabricated(name: string, parent: string | null, ops: Op[], o: { density: number; material: string; item: string; usd: number; role?: string; massKg?: number }) {
    const ref = parent ?? "base_link";
    const geometry = printedGeometry({ name, ops: this.in(ref, ops) });
    const link: Link = { name, role: o.role ?? "structure", geometry, mass: Math.max(o.massKg ?? geometry.volume * o.density, 0.005), material: o.material, origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
    this.A.spec.links.push(link);
    if (parent) { this.A.fixed(`${name}_mount`, parent, name, I4()); this.W.set(name, this.w(parent)); }
    this.fab.push({ item: o.item, usd: o.usd });
    return link;
  }
  mount(parent: string, key: string, Tw: Mat4, name: string, use = name) {
    const l = this.A.mount(parent, key, this.local(parent, Tw), name, use);
    this.W.set(name, Tw);
    return l;
  }
  /** purchased component on a moving joint (wheel, ball) */
  componentLink(name: string, key: string, material: string, use: string): Link {
    const c = part(key);
    const link: Link = { name, role: c.category, geometry: componentGeometry(key), mass: c.mass_g / 1000, material, origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } };
    this.A.spec.links.push(link); this.A.buy(key, 1, use);
    return link;
  }
  continuous(name: string, parent: string, child: string, Tw: Mat4, motor: string | null, axis: Vec3 = [0, 0, 1]) {
    this.W.set(child, Tw);
    return this.A.continuous(name, parent, child, this.local(parent, Tw), motor, axis);
  }
  /** unpowered hinge (rocker / bogie pivot on bearings) */
  passiveHinge(name: string, parent: string, child: string, Tw: Mat4, lower: number, upper: number): Joint {
    this.W.set(child, Tw);
    const j: Joint = { name, type: "revolute", parent, child, origin: toPose(this.local(parent, Tw)), axis: [0, 0, 1], passive: true,
      limit: { lower, upper, effort: 1, velocity: 10 }, dynamics: { damping: 0.05, friction: 0.02 } };
    this.A.spec.joints.push(j);
    return j;
  }
  servo(name: string, parent: string, child: string, Tw: Mat4, key: string, lower: number, upper: number) {
    this.W.set(child, Tw);
    this.servoJoints.push(name);
    return this.A.revolute(name, parent, child, this.local(parent, Tw), key, lower, upper);
  }
  sensor(name: string, type: Sensor["type"], parent: string, Tw: Mat4, params: Record<string, number | string> = {}) {
    this.A.spec.sensors.push({ name, type, parent, origin: toPose(this.local(parent, Tw)), params });
  }
  /** world pose (mm) of any link at the home configuration, from the spec itself */
  pose(link: string): Mat4 {
    const t = fk(this.A.spec).link[link];
    if (!t) throw new Error(`link ${link} not in the tree`);
    return [t.R[0][0], t.R[1][0], t.R[2][0], 0, t.R[0][1], t.R[1][1], t.R[2][1], 0, t.R[0][2], t.R[1][2], t.R[2][2], 0, t.p[0] * 1000, t.p[1] * 1000, t.p[2] * 1000, 1];
  }
}

// ------------------------------------------------------------------------------ drive modules
interface WheelOpts { tag: string; parent: string; x: number; side: 1 | -1; yFace: number; motor: string | null; wheel: string; driven?: boolean }
/**
 * One wheel station: gearmotor (axis along y, body inboard, gearbox above the shaft) and its wheel
 * on the motor shaft, or a passive idler on bearings when `motor` is null. Returns the motor-face
 * plate (world ops, with the motor's real face holes) for the caller's bracket / rocker / track frame.
 */
function wheelStation(b: Build, o: WheelOpts) {
  const wi = wheelInfo(o.wheel), h = wi.r, s = o.side;
  const axle: Vec3 = [o.x, s * o.yFace, h];
  const Tm = frame(axle, [0, s, 0], [0, 0, -1]);
  const motorKey = o.motor ?? DRIVE_MOTORS[1];
  if (o.motor) { b.mount(o.parent, o.motor, Tm, `${o.tag}_motor`, "drive motor"); b.motors.push(o.motor); }
  const Tw = frame([o.x, s * (o.yFace + wi.zw), h], [0, s, 0], [1, 0, 0]);
  const link = b.componentLink(`${o.tag}_wheel`, o.wheel, "rubber", o.motor ? "driven wheel" : "idler wheel");
  link.collision = { type: "cylinder", radius: h / 1000, length: (2 * wi.zFar) / 1000 };
  b.continuous(`${o.tag}_wheel_joint`, o.parent, `${o.tag}_wheel`, Tw, o.motor);
  b.contacts.push({ x: o.x, y: s * (o.yFace + wi.zw + wi.tyre), driven: o.driven ?? !!o.motor });
  const y0 = s > 0 ? o.yFace : -o.yFace - 5, y1 = s > 0 ? o.yFace + 5 : -o.yFace;
  const plate = (top: number): Op[] => {
    const ops: Op[] = [{ op: "box", min: [o.x - 22, y0, h - 15], max: [o.x + 22, y1, top], r: 4 }];
    if (o.motor) {
      for (const hl of part(o.motor).holes) { const p = apply(Tm, hl.pos); ops.push({ op: "hole", a: [p[0], p[1] - s, p[2]], b: [p[0], p[1] + s * 6, p[2]], d: 3.4 }); }
      ops.push({ op: "hole", a: [o.x, y0 - 1, h], b: [o.x, y1 + 1, h], d: 14 }, { op: "keepout", key: motorKey, T: Tm });
    } else {
      // idler: two 625ZZ bearings pressed into a boss, M5 shoulder bolt as the axle
      ops.push({ op: "rod", a: [o.x, y0 + (s > 0 ? 0 : -3), h], b: [o.x, y1 + (s > 0 ? 3 : 0), h], r: 13 });
      ops.push({ op: "hole", a: [o.x, y0 - 4, h], b: [o.x, y1 + 4, h], d: 16.2 });
    }
    return ops;
  };
  if (!o.motor) { b.A.buy("bearing_625zz", 2, "idler wheel bearings"); b.A.fastener("M5 x 30 shoulder bolt (idler axle)", 1); }
  else b.A.fastener("M3 x 8 socket head (motor face)", 6);
  return { plate, Tm, axle, wi };
}

/** L-bracket under the deck: motor-face plate up to the deck plus a flange bolted to the deck underside. */
function deckBracket(b: Build, st: ReturnType<typeof wheelStation>, o: WheelOpts, deckBottom: number) {
  const s = o.side, yIn = s * (o.yFace - 36), yOut = s * (o.yFace + 5);
  const ops: Op[] = [...st.plate(deckBottom),
    { op: "box", min: [o.x - 22, Math.min(yIn, yOut), deckBottom - 5], max: [o.x + 22, Math.max(yIn, yOut), deckBottom], r: 4 }];
  for (const dx of [-13, 13]) ops.push({ op: "hole", a: [o.x + dx, s * (o.yFace - 18), deckBottom - 6], b: [o.x + dx, s * (o.yFace - 18), deckBottom + 1], d: 3.4 });
  ops.push({ op: "keepout", key: o.motor ?? DRIVE_MOTORS[1], T: st.Tm });
  b.printed(`${o.tag}_bracket`, "base_link", ops, "printed_dark");
  b.A.fastener("M3 x 10 socket head + nut (bracket to deck)", 2);
}

/** Ball caster on a printed post under the deck; the ball is a free roller (two passive hinges). */
function ballCaster(b: Build, tag: string, x: number, y: number, deckBottom: number) {
  const key = "ball_caster_pololu_2692", c = part(key), H = Number(c.specs.height_mm), zc = H + Number(c.specs.ball_center_z_mm);
  const post: Op[] = [{ op: "rod", a: [x, y, H], b: [x, y, deckBottom], r: 20 },
    { op: "cutbox", min: [x - 12, y - 12, H + 4], max: [x + 12, y + 12, deckBottom - 4] }];
  for (const h of c.holes) post.push({ op: "hole", a: [x + h.pos[0], y + h.pos[1], H - 1], b: [x + h.pos[0], y + h.pos[1], H + 4.5], d: 3.4 });
  for (const dx of [-12, 12]) post.push({ op: "hole", a: [x + dx, y + 12, deckBottom - 4.5], b: [x + dx, y + 12, deckBottom + 1], d: 3.4 });
  b.printed(`${tag}_post`, "base_link", post, "printed_dark");
  const housing = b.mount("base_link", key, translation([x, y, H]), tag, "ball caster");
  housing.collision = { type: "sphere", radius: 0.004 };
  b.continuous(`${tag}_roll`, "base_link", `${tag}_gimbal`, translation([x, y, zc]), null, [1, 0, 0]);
  b.A.frameLink(`${tag}_gimbal`, "caster");
  b.continuous(`${tag}_spin`, `${tag}_gimbal`, `${tag}_ball`, translation([x, y, zc]), null, [0, 1, 0]);
  const r = Number(c.specs.ball_d_mm) / 2000;
  b.A.spec.links.push({ name: `${tag}_ball`, role: "caster", geometry: { type: "sphere", radius: r }, mass: 0.012, material: "printed", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } });
  b.contacts.push({ x, y, driven: false });
  b.A.fastener("M3 x 6 socket head (caster)", 3);
}

// --------------------------------------------------------------------------- electronics bay
interface Item { key: string; name: string; use: string; yawOk?: boolean; kind: "board" | "battery"; margin?: [number, number, number, number];
  /** room kept beside the part for the harness parts that serve it (a pack's fuse and star ground): [-x, +x, -y, +y] beyond the margin */
  room?: [number, number, number, number] }
interface Rect { x0: number; x1: number; y0: number; y1: number }
const overlaps = (a: Rect, c: Rect) => a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1;

/** Footprint (component frame, mm) of an item including plugs / leads / tool access: [-x, +x, -y, +y] margins. */
function footprint(it: Item, hard = false) {
  const bb = part(it.key).bbox_mm!;
  if (it.room && !hard) { const f = footprint(it, true), r = it.room; return { min: [f.min[0] - r[0], f.min[1] - r[2]], max: [f.max[0] + r[1], f.max[1] + r[3]] }; }
  // a battery's leads and plug leave its +x end: room there for the plug and the first bend of a 12 AWG lead
  const m = it.margin ?? (it.kind === "battery" ? [5, 30, 5, 5] : [4, 4, 4, 4]);
  return { min: [bb.min[0] - m[0], bb.min[1] - m[2]], max: [bb.max[0] + m[1], bb.max[1] + m[3]] };
}
/**
 * Place every item on the deck area without overlap (greedy scan, yaw 0 / 90) and build its printed
 * standoff plate or battery tray. Returns the highest point reached above the deck.
 */
interface Placement { it: Item; yaw: number; x: number; y: number }
/** Pack the items into `area` (bottom-left heuristic); tries several orders and keeps the first complete packing. */
function packBay(items: Item[], area: Rect, reserved: Rect[]): Placement[] | null {
  const dims = (it: Item) => { const f = footprint(it); return [f.max[0] - f.min[0], f.max[1] - f.min[1]]; };
  const orders = [(a: Item, c: Item) => Math.max(...dims(c)) - Math.max(...dims(a)), (a: Item, c: Item) => dims(c)[0] * dims(c)[1] - dims(a)[0] * dims(a)[1]];
  const sorts = [(a: number[], c: number[]) => a[1] - c[1] || a[0] - c[0], (a: number[], c: number[]) => a[0] - c[0] || a[1] - c[1], (a: number[], c: number[]) => a[0] + a[1] - c[0] - c[1]];
  for (const order of orders) for (const sortC of sorts) for (const yawFirst of [0, 90]) {
    const placed: Rect[] = [...reserved], out: Placement[] = [];
    for (const it of [...items].sort(order)) {
      const [w, d] = dims(it);
      let best: Placement | null = null;
      for (const yaw of it.yawOk === false ? [0] : [yawFirst, 90 - yawFirst]) {
        const [sx, sy] = yaw ? [d, w] : [w, d];
        const xs = [area.x0, area.x1 - sx, ...placed.flatMap((p) => [p.x1 + 0.01, p.x0 - sx - 0.01])].filter((x) => x >= area.x0 - 1e-6 && x + sx <= area.x1 + 1e-6);
        const ys = [area.y0, area.y1 - sy, ...placed.flatMap((p) => [p.y1 + 0.01, p.y0 - sy - 0.01])].filter((y) => y >= area.y0 - 1e-6 && y + sy <= area.y1 + 1e-6);
        const c = xs.flatMap((x) => ys.map((y) => [x, y])).sort(sortC).find(([x, y]) => !placed.some((p) => overlaps(p, { x0: x, x1: x + sx, y0: y, y1: y + sy })));
        if (c) { best = { it, yaw, x: c[0], y: c[1] }; placed.push({ x0: c[0], x1: c[0] + sx, y0: c[1], y1: c[1] + sy }); break; }
      }
      if (!best) break;
      out.push(best);
    }
    if (out.length === items.length) return out;
  }
  return null;
}
/** Deck areas of a wheeled base L x W mm: where boards may go, and the zones its sensors keep free. */
function deckRects(L: number, W: number, sensors: MobileSensor[]): { reserved: Rect[]; area: Rect } {
  const front = L / 2, reserved: Rect[] = [], lidarAt: [number, number] = [-L / 2 + 36, 0];
  if (sensors.includes("lidar")) reserved.push({ x0: lidarAt[0] - 33, x1: lidarAt[0] + 33, y0: -33, y1: 33 });
  if (sensors.includes("depth")) reserved.push({ x0: front - 50, x1: front, y0: -34, y1: 34 });
  if (sensors.includes("camera")) reserved.push({ x0: front - 24, x1: front, y0: sensors.includes("depth") ? 46 : -20, y1: sensors.includes("depth") ? 82 : 20 });
  // boards are packed inside the enclosure walls (2.4 mm + 3 mm air gap)
  return { reserved, area: { x0: -L / 2 + 10, x1: L / 2 - 10, y0: -W / 2 + 10, y1: W / 2 - 10 } };
}
const pad = (rs: Rect[]) => rs.map((r) => ({ x0: r.x0 - 5, x1: r.x1 + 5, y0: r.y0 - 5, y1: r.y1 + 5 }));
/** The two-deck layout (TurtleBot "waffle"): battery and drivers below, the rest on an upper deck on four pillars. */
function upperDeck(L: number, W: number, sensors: MobileSensor[], items: Item[]) {
  const { reserved } = deckRects(L, W, sensors), front = L / 2;
  const ux0 = -L / 2 + 6, ux1 = front - (sensors.includes("depth") || sensors.includes("camera") ? 58 : 6), uy = W / 2 - 6;
  const pillars: [number, number][] = [[ux0 + 12, uy - 12], [ux0 + 12, -uy + 12], [ux1 - 12, uy - 12], [ux1 - 12, -uy + 12]];
  const low = items.filter((i) => i.kind === "battery" || i.key === "cytron_mdd10a"), high = items.filter((i) => !low.includes(i));
  const lowRes = [...reserved.filter((_, i) => !(sensors.includes("lidar") && i === 0)), ...pillars.map(([x, y]) => ({ x0: x - 10, x1: x + 10, y0: y - 10, y1: y + 10 }))];
  const uArea: Rect = { x0: ux0 + 10, x1: ux1 - 10, y0: -uy + 10, y1: uy - 10 };
  const uRes: Rect[] = [...pillars.map(([x, y]) => ({ x0: x - 9, x1: x + 9, y0: y - 9, y1: y + 9 })), ...(sensors.includes("lidar") ? [{ x0: ux0 + 4, x1: ux0 + 70, y0: -33, y1: 33 }] : [])];
  return { ux0, ux1, uy, pillars, low, high, lowRes, uArea, uRes };
}
/** Does everything fit on a deck this long, on one level or on two? */
function deckLayout(L: number, W: number, sensors: MobileSensor[], items: Item[]): boolean {
  const { reserved, area } = deckRects(L, W, sensors);
  if (packBay(items, area, pad(reserved))) return true;
  const u = upperDeck(L, W, sensors, items);
  return !!packBay(u.low, area, pad(u.lowRes)) && !!packBay(u.high, u.uArea, pad(u.uRes));
}
/**
 * Place every item on the deck area without overlap and build its printed standoff plate or battery
 * tray. Returns the highest point reached above the deck.
 */
/**
 * Room a board's plugs want above its own frame (mm): the highest pin that is wired from above, its connector, the wire's
 * first bend (1.25 x the largest bend radius in use, 8 mm) and the half width of the bundle it joins there with its
 * own bend radius of air under the lid. -Infinity when nothing plugs in from above.
 */
function plugRoom(key: string): number {
  let top = -Infinity; const m = partModel(key);
  for (const k of m.pins.keys()) { const [port, ...pin] = k.split("."); const pa = pinOf(m, port, pin.join(".")); if (pa && pa.out[2] > 0.9) top = Math.max(top, pa.at[2] + connectorLen(pa.kind) + 10 + 8); }
  return top;
}
function electronicsBay(b: Build, items: Item[], area: Rect, reserved: Rect[], deckTop: number, parent = "base_link"): number {
  const plan = packBay(items, area, reserved);
  if (!plan) throw new Error(`electronics bay: ${items.map((i) => i.key).join(", ")} do not fit on ${JSON.stringify(area)}`);
  let top = deckTop;
  for (const { it, yaw, x, y } of plan) {
    const fp = footprint(it);
    const fpMin = yaw ? [-fp.max[1], fp.min[0]] : [fp.min[0], fp.min[1]];
    const holeZ = Math.min(0, ...part(it.key).holes.map((h) => h.pos[2]));
    // pins below the board stay clear of the deck
    const z = it.kind === "battery" ? deckTop + 3 : Math.max(deckTop + 7 - holeZ, deckTop + 3.5 - part(it.key).bbox_mm!.min[2]);
    const T = at(rotZ(yaw), [x - fpMin[0], y - fpMin[1], z]);
    b.mount(parent, it.key, T, it.name, it.use);
    // the lid stands 8 mm over what this returns: a plug and its wire's first bend need that much less
    top = Math.max(top, z + part(it.key).bbox_mm!.max[2], z + plugRoom(it.key) - 8);
    b.printed(`${it.name}_tray`, parent, it.kind === "battery" ? batteryTray(it.key, T) : standoffPlate(it.key, T, deckTop), "printed_dark");
    b.A.fastener(it.kind === "battery" ? "20 mm hook-and-loop battery strap" : "M2.5 x 6 screws (board to standoffs)", it.kind === "battery" ? 1 : part(it.key).holes.length);
    b.A.fastener("M3 x 8 socket head (tray to deck)", 2);
  }
  return top;
}
/**
 * Printed electronics enclosure over a packed bay: 2.4 mm walls with vent slots and a rear cable slot, corner bosses for
 * the lid screws, screw tabs to the deck, and a lid with vent slots. Reserved zones it overlaps (e.g. the lidar mast)
 * pass through openings. Too big for the bed -> two halves joined by a screwed internal lap plate.
 */
function enclosure(b: Build, items: Item[], area: Rect, reserved: Rect[], deckTop: number, clearTop: number, parent = "base_link", bayName = "electronics_enclosure", fixtures: boolean | { usb?: boolean; sw?: boolean } = true, room: { growY?: number; maxR?: number; mast?: number } = {}) {
  const plan = packBay(items, area, reserved); if (!plan) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const { it, yaw, x, y } of plan) {
    const fp = footprint(it), dx = fp.max[0] - fp.min[0], dy = fp.max[1] - fp.min[1], [w, h] = yaw ? [dy, dx] : [dx, dy];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + w); y0 = Math.min(y0, y); y1 = Math.max(y1, y + h);
  }
  const t = 2.4, m = 3;
  // the bay was packed inset by the wall allowance: the walls stand just outside the trays
  x0 = Math.max(area.x0 - m - t, x0 - m - t); x1 = Math.min(area.x1 + m + t, x1 + m + t); y0 = Math.max(area.y0 - m - t, y0 - m - t); y1 = Math.min(area.y1 + m + t, y1 + m + t);
  // reserved zones on the edge (pillar heads, a mast at the end): move that wall in past the zone when no board sits in
  // the strip that is given up; zones in the middle get a chimney ring further down
  const boards = plan.map(({ it, yaw, x, y }) => { const fp = footprint(it), dx = fp.max[0] - fp.min[0], dy = fp.max[1] - fp.min[1], [w, h] = yaw ? [dy, dx] : [dx, dy]; return { x0: x, x1: x + w, y0: y, y1: y + h }; });
  const free = (q: Rect) => !boards.some((bd) => bd.x1 > q.x0 && bd.x0 < q.x1 && bd.y1 > q.y0 && bd.y0 < q.y1);
  for (const r of reserved) {
    if (r.x1 < x0 || r.x0 > x1 || r.y1 < y0 || r.y0 > y1) continue;
    const opts: [number, () => void, Rect][] = [
      [r.x1 + 2 + t - x0, () => { x0 = r.x1 + 2 + t; }, { x0, x1: r.x1 + 2 + t, y0, y1 }],
      [x1 - (r.x0 - 2 - t), () => { x1 = r.x0 - 2 - t; }, { x0: r.x0 - 2 - t, x1, y0, y1 }],
      [r.y1 + 2 + t - y0, () => { y0 = r.y1 + 2 + t; }, { x0, x1, y0, y1: r.y1 + 2 + t }],
      [y1 - (r.y0 - 2 - t), () => { y1 = r.y0 - 2 - t; }, { x0, x1, y0: r.y0 - 2 - t, y1 }],
    ];
    const best = opts.filter(([d, , band]) => d > 0 && d < 45 && free(band)).sort((a, c) => a[0] - c[0])[0];
    if (best) best[1]();
  }
  if (room.growY) y1 = Math.min(y1 + room.growY, area.y1 + m + t);   // a clear strip along one wall for the main switch
  // tall enough for a double-pole rocker in the wall
  const zTop = Math.max(clearTop + 8, deckTop + 30), zSeat = zTop + 0.2, zLid = zSeat + t; // the lid sits 0.2 mm proud of the walls (assembly clearance)
  // four wall slabs (no hollowing cut, which would also remove the rings round openings inside)
  const walls: Op[] = [{ op: "box", min: [x0, y0, deckTop], max: [x1, y0 + t, zTop] }, { op: "box", min: [x0, y1 - t, deckTop], max: [x1, y1, zTop] },
    { op: "box", min: [x0, y0, deckTop], max: [x0 + t, y1, zTop] }, { op: "box", min: [x1 - t, y0, deckTop], max: [x1, y1, zTop] }];
  // lid screw bosses in the corners, except where a board sits
  const bosses = ([[x0 + t + 4, y0 + t + 4], [x1 - t - 4, y0 + t + 4], [x0 + t + 4, y1 - t - 4], [x1 - t - 4, y1 - t - 4]] as [number, number][])
    .filter(([x, y]) => free({ x0: x - 5.5, x1: x + 5.5, y0: y - 5.5, y1: y + 5.5 }));
  for (const [x, y] of bosses) walls.push({ op: "rod", a: [x, y, deckTop], b: [x, y, zTop], r: 4.5 }, { op: "hole", a: [x, y, zTop - 12], b: [x, y, zTop + 1], d: 2.6 });
  // deck tabs (outside the walls) with M3 holes
  // tabs only where the wall is solid: not on the rear cable slot, not on an opening for a mast or camera
  const blocked = (x: number, y: number) => reserved.some((r) => x > r.x0 - 12 && x < r.x1 + 12 && y > r.y0 - 12 && y < r.y1 + 12) || (Math.abs(x - x0) < 3 && Math.abs(y - (y0 + y1) / 2) < 30);
  const along = (a: number, b: number, fixed: number, isX: boolean) => { for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) { const v = a + (b - a) * f; if (!(isX ? blocked(v, fixed) : blocked(fixed, v))) return v; } return null; };
  const tabSpots: [number, number, number, number][] = [];
  { const tx0 = along(x0, x1, y0, true), tx1 = along(x0, x1, y1, true), ty0 = along(y0, y1, x0, false), ty1 = along(y0, y1, x1, false);
    if (tx0 !== null) tabSpots.push([tx0, y0, 0, -1]); if (tx1 !== null) tabSpots.push([tx1, y1, 0, 1]); if (ty0 !== null) tabSpots.push([x0, ty0, -1, 0]); if (ty1 !== null) tabSpots.push([x1, ty1, 1, 0]); }
  for (const [x, y, dx, dy] of tabSpots) {
    const cx = x + dx * 6, cy = y + dy * 6;
    if (room.maxR && Math.hypot(cx, cy) + 10 > room.maxR) continue;   // inside a round skirt
    walls.push({ op: "box", min: [cx - 7, cy - 7, deckTop], max: [cx + 7, cy + 7, deckTop + 3], r: 3 }, { op: "hole", a: [cx, cy, deckTop - 1], b: [cx, cy, deckTop + 4], d: 3.4 });
  }
  // vents: slots in both long walls, a cable slot low in the rear wall
  const ventsX = Math.max(1, Math.floor((x1 - x0 - 40) / 12));
  const ventCuts: { op: "cutbox"; min: Vec3; max: Vec3 }[] = [];
  for (let i = 0; i < ventsX; i++) { const vx = x0 + 20 + i * 12; for (const [ya, yb] of [[y0 - 1, y0 + t + 1], [y1 - t - 1, y1 + 1]]) ventCuts.push({ op: "cutbox", min: [vx, ya, deckTop + 10], max: [vx + 5, yb, zTop - 8] }); }
  walls.push({ op: "cutbox", min: [x0 - 1, (y0 + y1) / 2 - 18, deckTop - 1], max: [x0 + t + 1, (y0 + y1) / 2 + 18, deckTop + 12] });
  // edge trim and tie bar on the rear cable slot, main switch and USB window in the walls, grommets through the deck
  walls.push({ op: "box", min: [x0 + t, (y0 + y1) / 2 - 18, deckTop + 12], max: [x0 + t + 3, (y0 + y1) / 2 + 18, deckTop + 15] });
  // the switch may stand over a pack's harness room (its leads run into it), not over the parts themselves
  const hard = plan.map(({ it, yaw, x, y }) => { const fp = footprint(it), fh = footprint(it, true), [ox, oy] = [fh.min[0] - fp.min[0], fh.min[1] - fp.min[1]], [dx, dy] = [fh.max[0] - fh.min[0], fh.max[1] - fh.min[1]], fx2 = fp.max[0] - fp.min[0];
    return yaw ? { x0: x + (fp.max[1] - fh.max[1]), x1: x + (fp.max[1] - fh.max[1]) + dy, y0: y + ox, y1: y + ox + dx } : { x0: x + ox, x1: x + ox + dx, y0: y + oy, y1: y + oy + dy }; void fx2; });
  const fx = fixtures ? wallFixtures(b, plan, { x0, x1, y0, y1, z0: deckTop, z1: zTop, t }, hard, parent, bayName, reserved, fixtures === true ? {} : fixtures) : { cuts: [] as Op[], exits: [] as BayRecord["exits"], lidCuts: [] as Op[] };
  walls.push(...fx.cuts);
  // vent slots stop short of the cut-outs: a thin strip between the two would not print
  const near = (v: { min: Vec3; max: Vec3 }) => fx.cuts.some((c) => { const q = c as { min: Vec3; max: Vec3 }; return [0, 1].every((k) => v.max[k] > q.min[k] - 4 && v.min[k] < q.max[k] + 4); });
  const kept = ventCuts.filter((v) => !near(v));
  walls.push(...kept);
  // too few free corners for lid bosses: lugs on the outside of the long walls instead
  const lugs = (bosses.length >= 3 ? [] : [[x0 + (x1 - x0) * 0.32, y0 - 3.4, -1], [x0 + (x1 - x0) * 0.32, y1 + 3.4, 1], [x0 + (x1 - x0) * 0.68, y0 - 3.4, -1], [x0 + (x1 - x0) * 0.68, y1 + 3.4, 1]] as [number, number, number][])
    .filter(([x, y]) => !fx.exits.some((e) => Math.hypot(e.at[0] - x, e.at[1] - y) < 30));
  for (const [x, y] of lugs) walls.push({ op: "rod", a: [x, y, deckTop], b: [x, y, zTop], r: 4.5 }, { op: "hole", a: [x, y, zTop - 12], b: [x, y, zTop + 1], d: 2.6 });
  const lid: Op[] = [...fx.lidCuts, { op: "box", min: [x0, y0, zSeat], max: [x1, y1, zLid], r: 4 }, { op: "box", min: [x0 + t + 0.3, y0 + t + 0.3, zSeat - 3], max: [x1 - t - 0.3, y1 - t - 0.3, zSeat], r: 2 },
    { op: "cutbox", min: [x0 + t + 2.3, y0 + t + 2.3, zSeat - 4], max: [x1 - t - 2.3, y1 - t - 2.3, zSeat + 0.05] }];
  for (const [x, y] of bosses) lid.push({ op: "hole", a: [x, y, zSeat - 4], b: [x, y, zLid + 1], d: 3.4 }, { op: "hole", a: [x, y, zSeat - 4], b: [x, y, zSeat + 0.05], d: 2 * 4.5 + 1 }); // lip notched round the bosses
  for (const [x, y] of lugs) lid.push({ op: "rod", a: [x, y, zSeat], b: [x, y, zLid], r: 4.5 }, { op: "hole", a: [x, y, zSeat - 1], b: [x, y, zLid + 1], d: 3.4 });
  const ventsY = Math.max(1, Math.floor((y1 - y0 - 30) / 10)), ventHalf = Math.max(25, (x1 - x0) / 2 - 24);
  // two blocks of slots either side of the middle: a lid split there stays in one piece each side
  for (let i = 0; i < ventsY; i++) { const vy = y0 + 15.37 + i * 10, xc = (x0 + x1) / 2; for (const [a, c] of [[xc - ventHalf - 0.13, xc - 7.63], [xc + 7.63, xc + ventHalf + 0.13]]) lid.push({ op: "cutbox", min: [a, vy, zTop - 4], max: [c, vy + 4, zLid + 1] }); }
  for (const r of reserved) {
    if (r.x1 < x0 || r.x0 > x1 || r.y1 < y0 || r.y0 > y1) continue;
    // an opening for something that stands inside (lidar mast): a wall ring round it keeps the walls one piece. The zones
    // were padded by 5 mm for packing, so the ring (inside that pad) never touches a board.
    const q = { x0: r.x0 + 5, x1: r.x1 - 5, y0: r.y0 + 5, y1: r.y1 - 5 };
    walls.push({ op: "box", min: [Math.max(x0, q.x0 - 2 - t), Math.max(y0, q.y0 - 2 - t), deckTop], max: [Math.min(x1, q.x1 + 2 + t), Math.min(y1, q.y1 + 2 + t), zTop], r: 2 });
    b.keepOut.push({ x0: Math.max(x0, q.x0 - 2 - t), y0: Math.max(y0, q.y0 - 2 - t), z0: deckTop, x1: Math.min(x1, q.x1 + 2 + t), y1: Math.min(y1, q.y1 + 2 + t), z1: zTop });
    const cut: Op = { op: "cutbox", min: [q.x0 - 2, q.y0 - 2, deckTop - 1], max: [q.x1 + 2, q.y1 + 2, zLid + 1] };
    walls.push(cut); lid.push(cut);
    // round a lidar mast (reserved zone `room.mast`): a window low in the ring's -y wall, where the lidar's cable exit is,
    // so its plug and lead pass into the compartment
    if (room.mast !== undefined && reserved[room.mast] === r) { const cx = (q.x0 + q.x1) / 2; walls.push({ op: "cutbox", min: [cx - 9, q.y0 - 2 - t - 1, deckTop + 2], max: [cx + 9, q.y0 - 1, zTop - 3] }); }
    // the lid's locating lip steps over the ring
    lid.push({ op: "cutbox", min: [q.x0 - 2 - t - 0.5, q.y0 - 2 - t - 0.5, zSeat - 4], max: [q.x1 + 2 + t + 0.5, q.y1 + 2 + t + 0.5, zSeat + 0.05] });
  }
  const solids: string[] = [];
  const split = (name: string, ops: Op[], zh: number) => {
    if (fitsBed([x1 - x0 + 26, y1 - y0 + 26, zh])) { b.printed(name, parent, ops, "printed_dark"); solids.push(name); return; }
    const xm = (x0 + x1) / 2, ym2 = (y0 + y1) / 2, isLid = name.endsWith("lid");
    const lap: Op[] = [{ op: "box", min: [xm - 12, y0 + t, deckTop + 12], max: [xm + 12, y0 + t + 2.4, zTop - 6] }, { op: "box", min: [xm - 12, y1 - t - 2.4, deckTop + 12], max: [xm + 12, y1 - t, zTop - 6] }];
    const lapHoles: Op[] = [y0, y1].flatMap((yy) => [-7, 7].map((dx) => ({ op: "hole", a: [xm + dx, yy - 5, (deckTop + zTop) / 2], b: [xm + dx, yy + 5, (deckTop + zTop) / 2], d: 3.4 }) as Op));
    // still too wide for the bed: each half is cut again along its length, with a lap on the end walls
    const quarters = !fitsBed([(x1 - x0) / 2 + 26, y1 - y0 + 26, zh]);
    const lapY: Op[] = quarters ? [{ op: "box", min: [x0 + t, ym2 - 12, deckTop + 12], max: [x0 + t + 2.4, ym2 + 12, zTop - 6] }, { op: "box", min: [x1 - t - 2.4, ym2 - 12, deckTop + 12], max: [x1 - t, ym2 + 12, zTop - 6] }] : [];
    const lapYHoles: Op[] = quarters ? [x0, x1].flatMap((xx) => [-7, 7].map((dy) => ({ op: "hole", a: [xx - 5, ym2 + dy, (deckTop + zTop) / 2], b: [xx + 5, ym2 + dy, (deckTop + zTop) / 2], d: 3.4 }) as Op)) : [];
    const halves: [string, Op, Op[]][] = [["front", { op: "cutbox", min: [x0 - 20, y0 - 20, deckTop - 2], max: [xm, y1 + 20, zLid + 5] }, isLid ? [] : lap], ["rear", { op: "cutbox", min: [xm, y0 - 20, deckTop - 2], max: [x1 + 20, y1 + 20, zLid + 5] }, []]];
    for (const [tag, cut, extra] of halves) {
      const common = [...ops, ...extra, ...(isLid ? [] : lapHoles), cut];
      if (!quarters) { b.printed(`${name}_${tag}`, parent, common, "printed_dark"); solids.push(`${name}_${tag}`); continue; }
      for (const [side, yc] of [["left", { op: "cutbox", min: [x0 - 20, y0 - 20, deckTop - 2], max: [x1 + 20, ym2, zLid + 5] } as Op], ["right", { op: "cutbox", min: [x0 - 20, ym2, deckTop - 2], max: [x1 + 20, y1 + 20, zLid + 5] } as Op]] as const) {
        b.printed(`${name}_${tag}_${side}`, parent, [...common, ...(isLid || side === "right" ? [] : lapY), ...(isLid ? [] : lapYHoles), yc], "printed_dark");
        solids.push(`${name}_${tag}_${side}`);
      }
    }
    b.A.fastener("M3 x 8 + nut (enclosure pieces lap joint)", quarters ? 8 : 4);
  };
  split(bayName, walls, zTop - deckTop);
  split(`${bayName.replace("enclosure", "lid")}${bayName.includes("enclosure") ? "" : "_lid"}`, lid, zLid - zTop + 3);
  b.A.fastener("M3 x 10 self-tapping (enclosure lid)", 4);
  b.A.fastener("M3 x 8 + nut (enclosure tabs to deck; drill 3.4 mm through the deck at the tabs)", 4);
  const ym = (y0 + y1) / 2, vent = kept.length * 5 * (zTop - 8 - deckTop - 10) + ventsY * 8 * (ventHalf - 8);
  registerBay(b.A, { name: bayName, tub: solids[0], lid: solids[solids.length - 1], solids, parent, T: invert(b.w(parent)), min: [x0 + t, y0 + t, deckTop], max: [x1 - t, y1 - t, zTop], parts: plan.map((p) => p.it.name), screws: bosses.length + lugs.length, vent_area_mm2: Math.round(vent),
    exits: [...fx.exits, { id: `${bayName}.rear_slot`, kind: "slot", face: "x-" as Face, at: [x0, ym, deckTop + 6], normal: [-1, 0, 0], hole_mm: 12 }, ...deckGrommets(b, parent, [...boards, ...reserved], { x0: x0 + t, x1: x1 - t, y0: y0 + t, y1: y1 - t }, deckTop, bayName)] }, b.H);
  return zTop;
}
/** USB window beside the computer and the main switch in a wall where nothing stands behind it. Coordinates are world mm. */
function wallFixtures(b: Build, plan: Placement[], w: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; t: number }, boards: Rect[], parent: string, bayName = "electronics_enclosure", reserved: Rect[] = [], only: { usb?: boolean; sw?: boolean } = {}) {
  const cuts: Op[] = [], exits: BayRecord["exits"] = [], clearOf = (q: Rect) => ![...boards, ...reserved].some((bd) => bd.x1 > q.x0 && bd.x0 < q.x1 && bd.y1 > q.y0 && bd.y0 < q.y1);
  const zc = (w.z0 + w.z1) / 2;
  // USB: the wall nearest the computer
  const pc = only.usb === false ? undefined : plan.find((p) => part(p.it.key).category === "compute");
  if (pc) {
    const f = footprint(pc.it), dx = f.max[0] - f.min[0], dy = f.max[1] - f.min[1], [sx, sy] = pc.yaw ? [dy, dx] : [dx, dy], cx = pc.x + sx / 2, cy = pc.y + sy / 2;
    const opts: [number, Face][] = [[cx - w.x0, "x-"], [w.x1 - cx, "x+"], [cy - w.y0, "y-"], [w.y1 - cy, "y+"]];
    const face = opts.sort((a, c) => a[0] - c[0])[0][1], half = 24, zl = w.z0 + 8, zh = Math.min(w.z1 - 4, w.z0 + 26);
    const at: Vec3 = face === "x-" ? [w.x0, cy, (zl + zh) / 2] : face === "x+" ? [w.x1, cy, (zl + zh) / 2] : face === "y-" ? [cx, w.y0, (zl + zh) / 2] : [cx, w.y1, (zl + zh) / 2];
    if (face[0] === "x") cuts.push({ op: "cutbox", min: [at[0] - w.t - 1, cy - half, zl], max: [at[0] + w.t + 1, cy + half, zh] });
    else cuts.push({ op: "cutbox", min: [cx - half, at[1] - w.t - 1, zl], max: [cx + half, at[1] + w.t + 1, zh] });
    exits.push({ id: `${bayName}.usb`, kind: "usb", face, at, normal: face === "x-" ? [-1, 0, 0] : face === "x+" ? [1, 0, 0] : face === "y-" ? [0, -1, 0] : [0, 1, 0], hole_mm: zh - zl });
  }
  if (only.sw === false) return { cuts, exits, lidCuts: [] as Op[] };
  // main switch: first spot along the walls with nothing behind it (the big rocker: its 25.5 mm body, the tabs' ferrules
  // and the first bend of its 10 AWG leads; the small one stands high in its wall instead, see below)
  const spots: { p: Vec3; n: Vec3; face: Face; q: Rect }[] = [], deep = b.A.design.family === "mobile_diff_drive" ? 25 : 50, wide = b.A.design.family === "mobile_diff_drive" ? 12 : 18;
  for (const f of [0.15, 0.85, 0.3, 0.7, 0.5, 0.1, 0.9, 0.2, 0.8, 0.25, 0.75, 0.35, 0.65, 0.4, 0.6, 0.45, 0.55]) {
    const x = w.x0 + (w.x1 - w.x0) * f, y = w.y0 + (w.y1 - w.y0) * f;
    spots.push({ p: [x, w.y1, zc], n: [0, 1, 0], face: "y+", q: { x0: x - wide, x1: x + wide, y0: w.y1 - deep, y1: w.y1 } }, { p: [x, w.y0, zc], n: [0, -1, 0], face: "y-", q: { x0: x - wide, x1: x + wide, y0: w.y0, y1: w.y0 + deep } },
      { p: [w.x1, y, zc], n: [1, 0, 0], face: "x+", q: { x0: w.x1 - deep, x1: w.x1, y0: y - wide, y1: y + wide } }, { p: [w.x0, y, zc], n: [-1, 0, 0], face: "x-", q: { x0: w.x0, x1: w.x0 + deep, y0: y - wide, y1: y + wide } });
  }
  // corner bosses stand inside the walls: keep off the corners
  const offCorner = (c: { p: Vec3; n: Vec3 }) => (c.n[1] !== 0 ? c.p[0] - w.x0 > wide + 12 && w.x1 - c.p[0] > wide + 12 : c.p[1] - w.y0 > wide + 12 && w.y1 - c.p[1] > wide + 12);
  const s = spots.find((c) => offCorner(c) && clearOf(c.q) && !exits.some((e) => Math.hypot(e.at[0] - c.p[0], e.at[1] - c.p[1]) < 45));
  if (!s) {
    // no wall has room behind it: the rocker stands in the lid over a free patch of floor
    let at: [number, number] | null = null;
    for (let x = w.x0 + 18; x < w.x1 - 18 && !at; x += 4) for (let y = w.y0 + 22; y < w.y1 - 22 && !at; y += 4) if (clearOf({ x0: x - 14, x1: x + 14, y0: y - 18, y1: y + 18 })) at = [x, y];
    const [x, y] = at ?? [(w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2], zl = w.z1 + 0.2 + w.t;
    b.mount(parent, "switch_kcd4", frame([x, y, zl], [0, 0, 1], [1, 0, 0]), "main_switch", "main power switch");
    exits.push({ id: `${bayName}.switch`, kind: "switch", face: "lid", at: [x, y, zl], normal: [0, 0, 1], hole_mm: 22, part: "main_switch" });
    return { cuts, exits, lidCuts: [{ op: "cutbox", min: [x - 11.2, y - 15.2, w.z1 - 4], max: [x + 11.2, y + 15.2, zl + 1] }] as Op[] };
  }
  const small = b.A.design.family === "mobile_diff_drive", hw = small ? 9.7 : 15.2, hz = small ? 6.7 : 11.2, along = s.n[0] !== 0;
  // the small rocker stands high in the wall: its leads run off over the boards and the pack (their bend radius has room
  // there) instead of into whatever stands on the deck in front of it
  if (small) s.p = [s.p[0], s.p[1], w.z1 - 9]; const zc2 = s.p[2];
  cuts.push({ op: "cutbox", min: along ? [s.p[0] - w.t - 1, s.p[1] - hw, zc2 - hz] : [s.p[0] - hw, s.p[1] - w.t - 1, zc2 - hz], max: along ? [s.p[0] + w.t + 1, s.p[1] + hw, zc2 + hz] : [s.p[0] + hw, s.p[1] + w.t + 1, zc2 + hz] });
  b.mount(parent, small ? "switch_kcd1" : "switch_kcd4", frame(s.p, s.n, [0, 0, 1]), "main_switch", "main power switch");
  exits.push({ id: `${bayName}.switch`, kind: "switch", face: s.face, at: s.p, normal: s.n, hole_mm: small ? 13 : 22, part: "main_switch" });
  return { cuts, exits, lidCuts: [] as Op[] };
}
/**
 * Two decks: under each grommet in the upper deck a grommet in the lower compartment's lid, so a cable from a board up
 * there drops straight into the compartment below (round by its rear slot it would have to leave the robot's outline).
 */
function lidGrommets(b: Build, lowName: string, highName: string) {
  const bays = baysOf(b.A), lo = bays.find((r) => r.name === lowName), hi = bays.find((r) => r.name === highName); if (!lo || !hi) return;
  const lid = lo.solids?.[lo.solids.length - 1] ?? lo.lid, zLid = lo.max[2] + 0.2 + 2.4;
  for (const e of hi.exits) {
    if (e.face !== "floor") continue;
    const [x, y] = e.at;
    if (x < lo.min[0] + 8 || x > lo.max[0] - 8 || y < lo.min[1] + 8 || y > lo.max[1] - 8) continue;
    b.A.amendProgram(lid, b.in(lid, [{ op: "hole", a: [x, y, lo.max[2] - 4], b: [x, y, zLid + 1], d: e.hole_mm }]));
    const ex = { id: `${lowName}.lid_${e.id.split(".").pop()}`, kind: "grommet", face: "lid" as Face, at: [x, y, zLid] as Vec3, normal: [0, 0, 1] as Vec3, hole_mm: e.hole_mm };
    lo.exits.push(ex);
    b.H.exits.push({ id: ex.id, link: lid, at: apply(invert(b.w(lid)), ex.at), normal: ex.normal, panel_hole_mm: ex.hole_mm, bay: lowName, kind: "grommet" });
  }
}
/** A motor's leads (power and encoder) come up into the compartment by the deck grommet on the motor's own side. */
function motorLeadExits(b: Build) {
  const H = b.H, f = fk(b.A.spec), yOf = (n: string) => (f.link[n] ? f.link[n].p[1] * 1000 : 0);
  for (const w of H.wires) {
    if (H.exitOf.has(w.cable) || H.viaOf.has(w.cable)) continue;
    const m = [w.a.inst, w.b.inst].find((n) => /_motor$/.test(n)), o = m === w.a.inst ? w.b.inst : w.a.inst, bay = o ? baysOf(b.A).find((r) => r.name === H.bayOf.get(o)) : undefined;
    if (!m || !bay || H.bayOf.get(m)) continue;
    const g = bay.exits.filter((e) => e.face === "floor").sort((p, q) => Math.abs(p.at[1] - yOf(m)) - Math.abs(q.at[1] - yOf(m)))[0];
    if (g) H.exitFor(w.cable, g.id);
  }
}
/**
 * Two decks: a cable between the two compartments drops through an upper deck grommet and the lid grommet under it; a
 * motor lead comes up into the lower compartment by the deck grommet on its own side.
 */
function twoDeckExits(b: Build) {
  const H = b.H, bays = baysOf(b.A), lo = bays.find((r) => r.name === "power_bay"), hi = bays.find((r) => r.name === "electronics_enclosure");
  if (!lo || !hi) return;
  // the harness parts: the fuse and the star ground by the pack below, the rail splices by the switch and the regulator above
  for (const [n, bay] of [["main_fuse", lo.name], ["star_ground", lo.name], ["splice_vbat", lo.name], ["splice_5v", hi.name]]) H.bayOf.set(n, bay);
  const pairs = lo.exits.filter((e) => e.face === "lid").map((e) => [hi.exits.find((u) => u.face === "floor" && Math.hypot(u.at[0] - e.at[0], u.at[1] - e.at[1]) < 1)?.id, e.id]).filter((p): p is [string, string] => !!p[0]);
  const floor = lo.exits.filter((e) => e.face === "floor");
  const yOf = (n: string) => { const T = fk(b.A.spec).link[n]; return T ? T.p[1] * 1000 : 0; };
  const motor = (n: string) => /_motor$/.test(n);
  for (const w of H.wires) {
    const ba = H.bayOf.get(w.a.inst), bb = H.bayOf.get(w.b.inst);
    if (pairs.length && ((ba === lo.name && bb === hi.name) || (ba === hi.name && bb === lo.name))) H.exitFor(w.cable, ...pairs[0]);
    else if (floor.length && (motor(w.a.inst) || motor(w.b.inst)) && (ba === lo.name || bb === lo.name)) {
      const m = motor(w.a.inst) ? w.a.inst : w.b.inst, side = floor.sort((p, q) => Math.abs(p.at[1] - yOf(m)) - Math.abs(q.at[1] - yOf(m)))[0];
      H.exitFor(w.cable, side.id);
    } else if (pairs.length && floor.length && (motor(w.a.inst) || motor(w.b.inst)) && (ba === hi.name || bb === hi.name)) {
      // an encoder lead: up through the lower compartment (in by the deck grommet on its side, out by the lid) to the upper
      const m = motor(w.a.inst) ? w.a.inst : w.b.inst, side = floor.sort((p, q) => Math.abs(p.at[1] - yOf(m)) - Math.abs(q.at[1] - yOf(m)))[0];
      H.exitFor(w.cable, pairs[0][0]);
      if (!H.viaOf.has(w.cable)) H.via(w.cable, lo.name, ...((motor(w.a.inst) ? [side.id, pairs[0][1]] : [pairs[0][1], side.id]) as [string, string]));
    }
  }
}
/** Grommets through the deck, one each side, where motor leads go down to the drives. Holes are cut in the deck. */
function deckGrommets(b: Build, parent: string, boards: Rect[], w: Rect, deckTop: number, bayName = "electronics_enclosure"): BayRecord["exits"] {
  // nor over a part just under the deck (a motor's can): the leads need room to turn under the hole too
  const under = b.A.spec.links.filter((l) => l.geometry.type === "mesh" && l.geometry.part === "component" && part(String(l.geometry.params?.key)).bbox_mm).map((l) => partBox(b.A, l.name)).filter((q) => q.hi[2] < deckTop + 0.5 && q.hi[2] > deckTop - 45);
  const out: BayRecord["exits"] = [], taken = (x: number, y: number) => boards.some((q) => x > q.x0 - 7 && x < q.x1 + 7 && y > q.y0 - 7 && y < q.y1 + 7) || under.some((q) => x > q.lo[0] - 10 && x < q.hi[0] + 10 && y > q.lo[1] - 10 && y < q.hi[1] + 10);
  for (const side of [1, -1]) {
    let at: Vec3 | null = null;
    for (let dy = 8; dy < (w.y1 - w.y0) / 2 && !at; dy += 6) for (let dx = 0; dx < (w.x1 - w.x0) / 2 - 8 && !at; dx += 6) for (const sx of [1, -1]) {
      const x = (w.x0 + w.x1) / 2 + sx * (dx + 30), y = side > 0 ? w.y1 - dy : w.y0 + dy;
      if (x > w.x0 + 8 && x < w.x1 - 8 && !taken(x, y)) { at = [x, y, deckTop]; break; }
    }
    if (!at) continue;
    b.A.amendProgram(parent, b.in(parent, [{ op: "hole", a: [at[0], at[1], deckTop - 8], b: [at[0], at[1], deckTop + 1], d: 9.5 }]));
    out.push({ id: `${bayName}.deck_${side > 0 ? "left" : "right"}`, kind: "grommet", face: "floor", at, normal: [0, 0, -1], hole_mm: 9.5 });
  }
  return out;
}
function boardOutline(key: string, T: Mat4) {
  const bb = part(key).bbox_mm!, pts = [[bb.min[0], bb.min[1]], [bb.max[0], bb.min[1]], [bb.min[0], bb.max[1]], [bb.max[0], bb.max[1]]].map(([x, y]) => apply(T, [x, y, 0]));
  return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) };
}
function standoffPlate(key: string, T: Mat4, deckTop: number): Op[] {
  const o = boardOutline(key, T), holes = part(key).holes.map((h) => apply(T, h.pos));
  // plate 1 mm beyond the board outline so the corner standoffs sit fully on it; blind screw holes keep a 1.6 mm floor
  const ops: Op[] = [{ op: "box", min: [o.x0 - 1, o.y0 - 1, deckTop], max: [o.x1 + 1, o.y1 + 1, deckTop + 3], r: 3 }];
  for (const p of holes) ops.push({ op: "rod", a: [p[0], p[1], deckTop + 2.9], b: [p[0], p[1], p[2]], r: 3.2 });
  for (const p of holes) ops.push({ op: "hole", a: [p[0], p[1], deckTop + 1.6], b: [p[0], p[1], p[2] + 0.5], d: 2.2 });
  if (!holes.length) { // board without screw holes: edge clips
    for (const y of [o.y0 + 2, o.y1 - 5]) ops.push({ op: "box", min: [(o.x0 + o.x1) / 2 - 8, y, deckTop + 2.9], max: [(o.x0 + o.x1) / 2 + 8, y + 3, deckTop + 9] });
  }
  for (const [x, y] of [[o.x0 + 7, (o.y0 + o.y1) / 2], [o.x1 - 7, (o.y0 + o.y1) / 2]]) ops.push({ op: "hole", a: [x, y, deckTop - 1], b: [x, y, deckTop + 4], d: 3.4 });
  return ops;
}
/** Subtract a bought (non-actuator) component's body, plus clearance, from a printed part. */
const bodyCut = (key: string, T: Mat4, c = 0.5): Op => { const bb = part(key).bbox_mm!; return { op: "at", T, of: [{ op: "cutbox", min: [bb.min[0] - c, bb.min[1] - c, bb.min[2] - c], max: [bb.max[0] + c, bb.max[1] + c, bb.max[2] + c] }] }; };
function batteryTray(key: string, T: Mat4): Op[] {
  const c = part(key), L = c.bbox_mm!.max[0], W = c.bbox_mm!.max[1] * 2, H = c.bbox_mm!.max[2];
  const loc: Op[] = [
    { op: "box", min: [-3.6, -W / 2 - 3, -3], max: [L + 3, W / 2 + 3, 0] },
    { op: "box", min: [L * 0.1, -W / 2 - 3.6, -0.1], max: [L * 0.9, -W / 2 - 0.6, H * 0.5] },
    { op: "box", min: [L * 0.1, W / 2 + 0.6, -0.1], max: [L * 0.9, W / 2 + 3.6, H * 0.5] },
    // the end stop is at the -x end: the leads leave the +x end
    { op: "box", min: [-3.6, -W / 4, -0.1], max: [-0.6, W / 4, H * 0.6] },
    { op: "cutbox", min: [L * 0.45, -W / 2 - 5, -4], max: [L * 0.45 + 22, W / 2 + 5, -1.5] }, // strap channel
    { op: "hole", a: [L * 0.2, 0, -4], b: [L * 0.2, 0, 1], d: 3.4 }, { op: "hole", a: [L * 0.8, 0, -4], b: [L * 0.8, 0, 1], d: 3.4 },
  ];
  return [{ op: "at", T, of: loc }];
}

/** The netlist of a battery robot on this chassis: pack, fuse, switch; 5 V buck; computer; drives; sensors; servo bus. Then routed and checked. */
function wireMobile(b: Build, compute: string, battery: [string, number], sensors: MobileSensor[]) {
  const H = b.H, A = b.A;
  H.scan();
  const motors = A.spec.links.filter((l) => /_motor$/.test(l.name)).map((l) => l.name);
  const named: { name: string; kind: "lidar" | "depth" | "camera" | "imu" }[] = [];
  for (const [n, k] of [["lidar", "lidar"], ["depth_camera", "depth"], ["front_camera", "camera"], ["mast_camera", "camera"], ["head_camera", "camera"], ["left_eye_camera", "camera"], ["imu", "imu"]] as const) if (H.instances.has(n)) named.push({ name: n, kind: k });
  // a second eye goes through its own USB bridge: the computer has one spare ribbon here
  if (H.instances.has("right_eye_camera")) { H.bought("right_eye_camera.csi_15.GND", compute === "rpi5" ? "computer.cam_dsi_1.GND" : "computer.camera_j21.LINK", "FFC", 0.2, 0.25, "RIGHT_EYE_CSI"); exposed(A, "right_eye_camera", "behind the eye lens", [20, 20]); }
  for (const x of ["lidar", "depth_camera", "front_camera", "mast_camera", "head_camera", "left_eye_camera"]) if (H.instances.has(x)) exposed(A, x, x === "lidar" ? "on its mast above the enclosure, scan plane clear" : "on its bracket, looking out past the deck", [20, 20]);
  coreTree(H, { batteries: battery[1] > 1 ? Array.from({ length: battery[1] }, (_, i) => `battery_${i + 1}`) : ["battery"], regulators: ["regulator_5v"], compute, sensors: named, simultaneous: 2, simNote: "two drive motors stalling at once, the rest running" });
  seatMainFuse(b, battery[1] > 1 ? "battery_1" : "battery");
  seatRailSplice(b);
  const pi = compute === "rpi5", ctrl = pi ? "computer" : "io_controller";
  if (!pi) {
    H.feed("5V", "io_controller", { v: "5V", g: "G", typ: 0.1, peak: 0.5 });
    H.bought("io_controller.usb_native.VBUS", "computer.usb_a_j6_j7.LINK", "USB", 0.05, 0.1, "IO_USB");
  }
  const pins = pinsOf(H.instances.get(ctrl)!.key);
  const drivers = A.spec.links.filter((l) => /^motor_driver_\d+$/.test(l.name)).map((l) => l.name);
  drivers.forEach((d, i) => dualDriver(H, { driver: d, motors: [motors[i * 2], motors[i * 2 + 1]], ctrl, pins, rail: "VBAT", encVcc: `${ctrl}.3V3` }));
  if (H.instances.has("servo_bus")) {
    // one chain per limb, each with its own power feed
    const servos = actuatorsUnder(H, /_actuator$|_servo$/), limb = (n: string) => n.split("_").slice(0, /^(left|right)_/.test(n) ? 2 : 1).join("_");
    busTree(H, { adapter: "servo_bus", chains: [...new Set(servos.map(limb))].map((g) => servos.filter((n) => limb(n) === g)), rail: "VBAT" });
    H.bought("servo_bus.usb.VBUS", pi ? "computer.usb_a.LINK" : "computer.usb_a_j6_j7.LINK", "USB", 0.05, 0.1, "SERVO_BUS_USB");
    H.spare("servo_bus.dc_in");
  }
  twoDeckExits(b);
  motorLeadExits(b);
  finishWiring(H, { noClips: /^(base_link|deck_lid|upper_deck|head)$|rocker_rear_arm/ });
  enclosureChecks(A);
}

/**
 * The main fuse lies beside the pack, back along it from its lead end, on the side towards the middle of the compartment:
 * the pack's positive lead leaves its end, turns twice through its bend radius and runs straight into the fuse, which
 * leaves its other end towards the switch. (Left to itself the fuse goes to the nearest free spot, often round a corner
 * the 12 AWG lead cannot take.)
 */
function seatMainFuse(b: Build, battery: string) {
  const H = b.H, fi = H.instances.get("main_fuse"); if (!fi || !H.instances.get(battery)) return;
  const f = fk(b.A.spec), T = f.link[battery]; if (!T) return;
  const bb = part(H.instances.get(battery)!.key).bbox_mm!, fb = part(fi.key).bbox_mm!;
  const e: Vec3 = [T.R[0][0], T.R[1][0], 0], w = [0, 1, 2].map((i) => T.R[i][0] * bb.max[0] + T.R[i][1] * ((bb.min[1] + bb.max[1]) / 2) + T.R[i][2] * ((bb.min[2] + bb.max[2]) / 2) + T.p[i] * 1000) as Vec3;
  const sideA: Vec3 = [-e[1], e[0], 0], c = baysOf(b.A).find((r) => r.parts.includes(battery));
  const mid: Vec3 = c ? [0, 1, 2].map((i) => (c.min[i] + c.max[i]) / 2) as Vec3 : [0, 0, 0];
  // beside the pack: its half width, a bend diameter of the lead less the fuse's half width, so the lead's U has its radius
  const half = (bb.max[1] - bb.min[1]) / 2, off = half + 24 - (fb.max[1] - fb.min[1]) / 2 + 2, L = fb.max[0] - fb.min[0];
  // on the side towards the middle of the compartment, or the other side where a part stands there
  const parts3 = b.A.spec.links.filter((l) => l.geometry.type === "mesh" && l.geometry.part === "component" && part(String(l.geometry.params?.key)).bbox_mm).map((l) => partBox(b.A, l.name));
  const fw0 = (fb.max[1] - fb.min[1]) / 2, fh0 = (fb.max[2] - fb.min[2]) / 2;
  const boxAt = (p: Vec3, hl: number): [Vec3, Vec3] => [[p[0] - Math.abs(e[0]) * hl - Math.abs(e[1]) * fw0 - 2, p[1] - Math.abs(e[1]) * hl - Math.abs(e[0]) * fw0 - 2, p[2] - fh0 - 2], [p[0] + Math.abs(e[0]) * hl + Math.abs(e[1]) * fw0 + 2, p[1] + Math.abs(e[1]) * hl + Math.abs(e[0]) * fw0 + 2, p[2] + fh0 + 2]];
  const free = ([lo, hi]: [Vec3, Vec3]) => !parts3.some((q) => [0, 1, 2].every((k) => q.hi[k] > lo[k] && q.lo[k] < hi[k])) && !b.keepOut.some((q) => q.x1 > lo[0] && q.x0 < hi[0] && q.y1 > lo[1] && q.y0 < hi[1]) && (!c || [lo, hi].every((q) => [0, 1].every((k) => q[k] >= c.min[k] && q[k] <= c.max[k])));
  const sideAt = (sg: number): Vec3 => [w[0] - e[0] * L / 2 + sideA[0] * sg * off, w[1] - e[1] * L / 2 + sideA[1] * sg * off, w[2]];
  let toMid = b.packRoom ? 1 : (mid[0] - w[0]) * sideA[0] + (mid[1] - w[1]) * sideA[1] >= 0 ? 1 : -1;
  if (!b.packRoom && !free(boxAt(sideAt(toMid), L / 2)) && free(boxAt(sideAt(-toMid), L / 2))) toMid = -toMid;
  let at: Vec3 = [w[0] - e[0] * L / 2 + sideA[0] * toMid * off, w[1] - e[1] * L / 2 + sideA[1] * toMid * off, w[2]];
  // its IN end (body -x) towards the pack's lead end: body x along -e
  let turn = Math.abs(e[0]) > 0.5 ? (e[0] > 0 ? 2 : 0) : (e[1] > 0 ? 3 : 1);
  // or straight on from the positive lead (its pin 2 mm to the side of the pack's middle), when there is room: the lead
  // runs straight into the fuse, which leaves its far end the same way
  // (clear of the room the router keeps in front of the pack's pins: its plug and 12 mm)
  { const gap = 3 + 12 + 2, sAt: Vec3 = [w[0] + e[0] * (gap + L / 2) - sideA[0] * 2, w[1] + e[1] * (gap + L / 2) - sideA[1] * 2, w[2]];
    const fw = (fb.max[1] - fb.min[1]) / 2, fh = (fb.max[2] - fb.min[2]) / 2, lo: Vec3 = [Math.min(sAt[0] - Math.abs(e[0]) * L / 2 - Math.abs(e[1]) * fw, 1e9) - 2, sAt[1] - Math.abs(e[1]) * L / 2 - Math.abs(e[0]) * fw - 2, sAt[2] - fh - 2], hi: Vec3 = [sAt[0] + Math.abs(e[0]) * L / 2 + Math.abs(e[1]) * fw + 2, sAt[1] + Math.abs(e[1]) * L / 2 + Math.abs(e[0]) * fw + 2, sAt[2] + fh + 2];
    const boxes = b.A.spec.links.filter((l) => l.geometry.type === "mesh" && l.geometry.part === "component" && part(String(l.geometry.params?.key)).bbox_mm).map((l) => partBox(b.A, l.name));
    // the far end's lead and its first bend stay inside the compartment too
    const reach = L / 2 + 3 + 17.5 + 3, tip: Vec3 = [sAt[0] + e[0] * reach, sAt[1] + e[1] * reach, sAt[2]];
    const inside = !c || [lo, hi, tip].every((q) => [0, 1].every((k) => q[k] >= c.min[k] + 3 && q[k] <= c.max[k] - 3));
    if (inside && !boxes.some((q) => [0, 1, 2].every((k) => q.hi[k] > lo[k] && q.lo[k] < hi[k])) && !b.keepOut.some((q) => q.x1 > lo[0] && q.x0 < hi[0] && q.y1 > lo[1] && q.y0 < hi[1])) {
      at = sAt; turn = Math.abs(e[0]) > 0.5 ? (e[0] > 0 ? 0 : 2) : (e[1] > 0 ? 1 : 3);
    } }
  H.seat("main_fuse", at, turn);
  turn = Math.abs(e[0]) > 0.5 ? (e[0] > 0 ? 2 : 0) : (e[1] > 0 ? 3 : 1);
  // the star ground on top of the fuse, its first lever at the same end: the pack's negative lead runs beside the positive
  // (the star ground and the rail splices are added when the harness is finished: their seats wait for them)
  const sb = part("wago_221_415").bbox_mm!, Ls = sb.max[0] - sb.min[0];
  const backAlong = at[0] !== w[0] + e[0] * (17 + L / 2) - sideA[0] * 2 || at[1] !== w[1] + e[1] * (17 + L / 2) - sideA[1] * 2;
  H.seat("star_ground", [w[0] - e[0] * Ls / 2 + sideA[0] * toMid * off, w[1] - e[1] * Ls / 2 + sideA[1] * toMid * off, w[2] + (backAlong ? (fb.max[2] - fb.min[2]) / 2 + (sb.max[2] - sb.min[2]) / 2 + 2 : 0)], turn);
}
/**
 * The main rail's splice where the switch's output lead reaches it with no tight turn: straight on from the tab, or after
 * one quarter turn either side, its first lever facing the lead. The first spot clear of every bought part and printed ring.
 */
function seatRailSplice(b: Build) {
  const H = b.H, sw = b.A.spec.links.find((l) => l.name === "main_switch"); if (!sw) return;
  const f = fk(b.A.spec), T = f.link.main_switch, key = String((sw.geometry as { params?: { key?: string } }).params?.key), m = partModel(key), pa = pinOf(m, "contacts", "OUT"); if (!T || !pa) return;
  const p = [0, 1, 2].map((i) => T.R[i][0] * pa.at[0] + T.R[i][1] * pa.at[1] + T.R[i][2] * pa.at[2] + T.p[i] * 1000) as Vec3, o = [0, 1, 2].map((i) => T.R[i][0] * pa.out[0] + T.R[i][1] * pa.out[1] + T.R[i][2] * pa.out[2]) as Vec3;
  if (Math.abs(o[2]) > 0.5) return;
  // the main leads' bend radius: the heaviest gauge the router may pick for them (10 AWG)
  const bb = part("wago_221_415").bbox_mm!, L = bb.max[0] - bb.min[0], Wd = bb.max[1] - bb.min[1], Hh = bb.max[2] - bb.min[2], lever = (Wd / 5) * 0.5, R = 14;
  const boxes = b.A.spec.links.filter((l) => l.name !== "main_switch" && l.geometry.type === "mesh" && l.geometry.part === "component" && part(String(l.geometry.params?.key)).bbox_mm).map((l) => partBox(b.A, l.name));
  const bay = baysOf(b.A).find((r) => r.exits.some((e) => e.part === "main_switch")), inv = bay ? invert(mul(b.w(bay.parent), bay.T as Mat4)) : null;
  const inBay = (lo: Vec3, hi: Vec3) => !bay || !inv || [lo, hi].every((q) => { const l = apply(inv, q); return [0, 1, 2].every((k) => l[k] >= bay.min[k] - 0.5 && l[k] <= bay.max[k] + 0.5); });
  const clear = (c: Vec3, d: Vec3) => {
    const hx = Math.abs(d[0]) > 0.5 ? L / 2 : Wd / 2, hy = Math.abs(d[0]) > 0.5 ? Wd / 2 : L / 2, lo: Vec3 = [c[0] - hx - 2, c[1] - hy - 2, c[2] - Hh / 2 - 2], hi: Vec3 = [c[0] + hx + 2, c[1] + hy + 2, c[2] + Hh / 2 + 2];
    return inBay(lo, hi) && !boxes.some((q) => [0, 1, 2].every((k) => q.hi[k] > lo[k] && q.lo[k] < hi[k])) && !b.keepOut.some((q) => q.x1 > lo[0] && q.x0 < hi[0] && q.y1 > lo[1] && q.y0 < hi[1] && q.z1 > lo[2] && q.z0 < hi[2]);
  };
  const turnOf = (d: Vec3) => (Math.abs(d[0]) > 0.5 ? (d[0] > 0 ? 0 : 2) : (d[1] > 0 ? 1 : 3));
  // body x along d (its levers face back up the lead), the lever row along the body's y: P1 at its -y end
  const seatAt = (S: Vec3, d: Vec3): Vec3 => { const q: Vec3 = [-d[1], d[0], 0]; return [S[0] + d[0] * L / 2 + q[0] * (Wd / 2 - lever), S[1] + d[1] * L / 2 + q[1] * (Wd / 2 - lever), S[2] + 1]; };   // the levers are 1 mm under the body's middle
  const tab = connectorLen("tab"), lev = connectorLen("lever"), V: Vec3 = [p[0] + o[0] * (tab + 1.25 * R), p[1] + o[1] * (tab + 1.25 * R), p[2]];
  // the lever's own lead-out (its ferrule and 1.25 R) ends a bend radius past the switch's: the turn there has its room
  const k = lev + 1.25 * R + R + 2;
  const cands: { S: Vec3; d: Vec3 }[] = [{ S: [V[0] + o[0] * k, V[1] + o[1] * k, p[2]], d: o }];
  for (const sg of [1, -1]) { const d: Vec3 = [-o[1] * sg, o[0] * sg, 0]; cands.push({ S: [V[0] + d[0] * k, V[1] + d[1] * k, p[2]], d }); }
  const pick = cands.map((c) => ({ ...c, at: seatAt(c.S, c.d) })).find((c) => clear(c.at, c.d)) ?? { ...cands[0], at: seatAt(cands[0].S, cands[0].d) };
  H.seat("splice_vbat", pick.at, turnOf(pick.d));
}

/** Compute + power electronics for a 3S robot. */
function electronicsFor(sensors: MobileSensor[], motors: number, battery: [string, number], heavy: boolean, servoBus: boolean): { items: Item[]; compute: string } {
  const compute = sensors.includes("depth") || heavy ? "jetson_orin_nano_super" : "rpi5";
  const items: Item[] = [];
  for (let i = 0; i < battery[1]; i++) items.push({ key: battery[0], name: battery[1] > 1 ? `battery_${i + 1}` : "battery", use: "main battery", kind: "battery", yawOk: true });
  items.push({ key: compute, name: "computer", use: "on-board computer", kind: "board", margin: compute === "rpi5" ? [16, 20, 3, 8] : [5, 5, 26, 5] });
  for (let i = 0; i < Math.ceil(motors / 2); i++) items.push({ key: "cytron_mdd10a", name: `motor_driver_${i + 1}`, use: "dual DC motor driver", kind: "board", margin: [4, 4, 4, 20] });   // +y: its screw terminals, the wire's ferrule and first bend
  items.push({ key: "buck_5v_5a", name: "regulator_5v", use: "5 V rail for the computer, USB and sensors", kind: "board" });
  // a Jetson's header cannot drive anything (about 20 uA through its level shifters): an ESP32-S3 runs the motors and encoders over USB
  if (compute !== "rpi5") items.push({ key: "esp32_s3_devkitc1", name: "io_controller", use: "motor and encoder I/O for the computer", kind: "board" });
  if (sensors.includes("imu")) items.push({ key: "bno085_breakout", name: "imu", use: "9-DoF IMU", kind: "board" });
  if (servoBus) items.push({ key: "waveshare_bus_servo_adapter", name: "servo_bus", use: "servo bus adapter", kind: "board", margin: [6, 6, 6, 12] });
  return { items, compute };
}

// --------------------------------------------------------------------------- sensors on top
function lidarMast(b: Build, x: number, y: number, deckTop: number, clearTop: number, parent = "base_link") {
  const key = "rplidar_c1", c = part(key), scan = Number(c.specs.scan_plane_z_mm);
  const base = Math.max(deckTop + 6, clearTop + 4 - scan + 3);
  const ops: Op[] = [{ op: "box", min: [x - 31, y - 31, base - 5], max: [x + 31, y + 31, base], r: 6 }];
  if (base - 5 > deckTop + 0.5) ops.push({ op: "rod", a: [x, y, deckTop], b: [x, y, base - 4], r: 18 }, { op: "box", min: [x - 26, y - 26, deckTop], max: [x + 26, y + 26, deckTop + 4], r: 6 });
  for (const h of c.holes) ops.push({ op: "hole", a: [x + h.pos[0], y + h.pos[1], base - 6], b: [x + h.pos[0], y + h.pos[1], base + 0.5], d: 2.9 });
  ops.push({ op: "cutbox", min: [x - 6, y - 40, base - 6], max: [x + 6, y - 20, base + 1] }); // cable exit
  b.printed("lidar_mast", parent, ops, "printed_dark");
  b.mount(parent, key, translation([x, y, base]), "lidar", "2D lidar");
  b.sensor("lidar", "lidar", "lidar", translation([x, y, base + scan]), { range_m: 12, rate_hz: 10, fov_deg: 360 });
  b.A.fastener("M2.5 x 6 (lidar)", 4);
  b.power.push({ what: "lidar", w: Number(c.specs.power_w) });
  return base + scan;
}
/** D435i on a printed upright at (x, y), lenses looking +x, centre at height zc. */
function depthCamera(b: Build, x: number, y: number, zc: number, deckTop: number, parent = "base_link") {
  const key = "realsense_d435i";
  const T = frame([x, y, zc], [0, 0, 1], [0, 1, 0]); // camera -Y (lenses) -> world +x
  const back = x - 12.5;
  const ops: Op[] = [{ op: "box", min: [back - 5, y - 30, deckTop], max: [back, y + 30, zc + 12], r: 3 },
    { op: "box", min: [back - 30, y - 30, deckTop], max: [back, y + 30, deckTop + 4], r: 3 }];
  for (const dy of [-22.5, 22.5]) ops.push({ op: "hole", a: [back - 6, y + dy, zc], b: [back + 0.5, y + dy, zc], d: 3.4 });
  for (const dy of [-18, 18]) ops.push({ op: "hole", a: [back - 18, y + dy, deckTop - 1], b: [back - 18, y + dy, deckTop + 5], d: 3.4 });
  ops.push(bodyCut(key, T));
  b.printed("depth_camera_bracket", parent, ops, "printed_dark");
  b.mount(parent, key, T, "depth_camera", "RGB-D camera");
  b.sensor("depth_camera", "depth", "depth_camera", frame([x, y, zc], [0, 0, 1], [1, 0, 0]), { hfov_deg: 87, range_m: 6, rate_hz: 30 });
  b.A.fastener("M3 x 6 (camera back)", 2);
  b.power.push({ what: "depth camera", w: Number(part(key).specs.power_w) });
}
/** D435i whose back face bolts straight to a wall at x = xWall (its two M3 back holes), lenses looking +x. Returns the wall holes. */
function depthOnWall(b: Build, parent: string, xWall: number, y: number, zc: number): Op[] {
  const key = "realsense_d435i", T = frame([xWall + 12.5 + 0.5, y, zc], [0, 0, 1], [0, 1, 0]);
  b.mount(parent, key, T, "depth_camera", "RGB-D camera");
  b.sensor("depth_camera", "depth", "depth_camera", frame([xWall + 13, y, zc], [0, 0, 1], [1, 0, 0]), { hfov_deg: 87, range_m: 6, rate_hz: 30 });
  b.A.fastener("M3 x 8 (camera back)", 2);
  b.power.push({ what: "depth camera", w: Number(part(key).specs.power_w) });
  return [-22.5, 22.5].map((dy) => ({ op: "hole", a: [xWall - 8, y + dy, zc], b: [xWall + 1, y + dy, zc], d: 3.4 }) as Op);
}
/** Raspberry Pi Camera Module 3 looking along +x (world dir `look`) with its PCB at T. */
function cameraModule(b: Build, name: string, parent: string, origin: Vec3, look: Vec3 = [1, 0, 0]) {
  const key = "rpi_camera_module_3", lens = part(key).specs.lens_xy_mm as number[];
  // board frame: lens at (lens) looking +z. Place lens centre at origin.
  const R = frame([0, 0, 0], look, [0, 0, 1]);
  const T = mul(translation(origin), mul(R, translation([-lens[0], -lens[1], 0])));
  b.mount(parent, key, T, name, "camera");
  b.sensor(name, "camera", name, mul(translation(apply(T, [lens[0], lens[1], 9])), frame([0, 0, 0], [0, 0, 1], look)), { hfov_deg: 66, vfov_deg: 41, rate_hz: 30 });
  b.power.push({ what: name, w: 1.0 });
  return T;
}

// ------------------------------------------------------------------------------ engineering
interface DriveResult { forceN: number; tauNm: number; ok: boolean; topSpeed: number; detail: string; stall: number; rated: number }
function driveNeed(massKg: number, nDriven: number, wheel: string, motor: string, eff = 1): DriveResult {
  const q = DRIVE_REQ, th = q.slopeDeg * D2R, r = wheelInfo(wheel).r / 1000;
  const F = massKg * G * (Math.sin(th) + q.crr * Math.cos(th)) + massKg * q.accel;
  const tau = (F / nDriven / eff) * r, R = rating(motor);
  const stall = Number(part(motor).specs.stall_torque_nm);
  const ok = tau <= R.rated_nm && tau * DYNAMIC_FACTOR <= stall;
  const top = R.speed_rad_s * r * q.speedFactor;
  return { forceN: F, tauNm: tau, ok, topSpeed: top, stall, rated: R.rated_nm,
    detail: `${massKg.toFixed(2)} kg on a ${q.slopeDeg} deg slope accelerating ${q.accel} m/s^2 (Crr ${q.crr}): ${F.toFixed(1)} N total, ${tau.toFixed(3)} N·m per driven wheel (${nDriven} x r ${(r * 1000).toFixed(0)} mm${eff < 1 ? `, mecanum efficiency ${eff}` : ""}) vs ${part(motor).name.split(" with")[0]} rated ${R.rated_nm} / stall ${stall} N·m (margin ${(R.rated_nm / tau).toFixed(2)}x continuous)` };
}
function convexHull(p: [number, number][]) {
  const pts = [...p].sort((a, c) => a[0] - c[0] || a[1] - c[1]);
  const cross = (o: number[], a: number[], c: number[]) => (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  const lo: [number, number][] = [], hi: [number, number][] = [];
  for (const q of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...pts].reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
/** Centre of mass (m, world) of the whole robot in configuration q with extra point loads. */
export function comOf(spec: RobotSpecification, q: Record<string, number> = {}, loads: PointLoad[] = []): { com: Vec3; mass: number } {
  const f = fk(spec, q); let m = 0; const c: Vec3 = [0, 0, 0];
  const add = (p: Vec3, mm: number) => { m += mm; for (let i = 0; i < 3; i++) c[i] += p[i] * mm; };
  for (const l of spec.links) { const T = f.link[l.name]; if (!T) continue; const lc = linkCom(l); add([0, 1, 2].map((i) => T.R[i][0] * lc[0] + T.R[i][1] * lc[1] + T.R[i][2] * lc[2] + T.p[i]) as Vec3, l.mass); }
  for (const L of loads) { const T = f.link[L.link]; add([0, 1, 2].map((i) => T.R[i][0] * L.at[0] + T.R[i][1] * L.at[1] + T.R[i][2] * L.at[2] + T.p[i]) as Vec3, L.massKg); }
  return { com: c.map((v) => v / m) as Vec3, mass: m };
}
/** Smallest distance (mm) from the CoM ground projection to the support polygon edge (negative = outside), and the tip angle. */
function stabilityAt(spec: RobotSpecification, contacts: Contact[], q: Record<string, number>, loads: PointLoad[]) {
  const { com } = comOf(spec, q, loads), hull = convexHull(contacts.map((c) => [c.x, c.y]));
  const px = com[0] * 1000, py = com[1] * 1000, h = com[2] * 1000;
  let dmin = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i], [bx, by] = hull[(i + 1) % hull.length];
    const ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey);
    dmin = Math.min(dmin, ((px - ax) * ey * -1 + (py - ay) * ex) / len); // left side of CCW edges is inside
  }
  return { margin: dmin, tipDeg: Math.atan2(dmin, h) / D2R, com: [px, py, h] as Vec3 };
}
/** Joint poses that put each arm's payload furthest out: shoulder level, turned forward / sideways / back. */
function armPoses(spec: RobotSpecification, arms: ArmRec[]): Record<string, number>[] {
  const poses: Record<string, number>[] = [{}];
  for (const a of arms) {
    const js = a.joints.map((n) => spec.joints.find((j) => j.name === n)!).filter((j) => j && j.type === "revolute");
    const first = js[0], pitch = js.find((j) => /shoulder_pitch/.test(j.name));
    for (const s of [-1, 1]) for (const yawv of [0, Math.PI / 2, -Math.PI / 2]) {
      const q: Record<string, number> = {};
      if (pitch) q[pitch.name] = clampTo(pitch, s * Math.PI / 2);
      if (first && first !== pitch) q[first.name] = clampTo(first, yawv);
      poses.push(q);
    }
  }
  return poses;
}
const clampTo = (j: Joint, v: number) => Math.max(j.limit?.lower ?? -Math.PI, Math.min(j.limit?.upper ?? Math.PI, v));

/** Every actuated arm joint's worst gravity torque in the host, over a pose grid, with the hand payload. */
function verifyArms(b: Build) {
  const spec = b.A.spec;
  for (const a of b.arms) {
    const js = a.joints.map((n) => spec.joints.find((j) => j.name === n)!).filter((j) => j.type === "revolute" && !j.name.endsWith("gripper"));
    const grid: Record<string, number>[] = [{}];
    for (const j of js) {
      const vals = [-Math.PI / 2, 0, Math.PI / 2].map((v) => clampTo(j, v));
      const next: Record<string, number>[] = [];
      for (const g of grid) for (const v of new Set(vals)) next.push({ ...g, [j.name]: v });
      grid.splice(0, grid.length, ...next);
    }
    const loads: PointLoad[] = [{ link: a.tool.link, at: a.tool.xyz_m, massKg: a.tool.payload_kg }];
    const worst: Record<string, number> = {};
    for (const q of grid) for (const [k, v] of Object.entries(gravityTorques(spec, q, loads))) if (a.joints.includes(k)) worst[k] = Math.max(worst[k] ?? 0, v);
    for (const j of spec.joints.filter((x) => a.joints.includes(x.name) && x.type === "revolute")) {
      const rec = b.A.design.joints.find((r) => r.joint === j.name);
      if (!rec) continue;
      const c = evaluate(rec.actuator, worst[j.name] ?? 0);
      rec.required_nm = c.required_nm; rec.margin = c.margin;
      rec.note = `worst static ${(worst[j.name] ?? 0).toFixed(3)} N·m over ${grid.length} poses as mounted on the robot, ${a.tool.payload_kg} kg in the hand, x ${DYNAMIC_FACTOR}`;
      b.A.check(`torque:${j.name}`, c.ok && c.continuous_ok, `as mounted: needs ${c.required_nm} N·m peak, ${part(rec.actuator).name} gives ${rec.peak_nm} N·m peak / ${rec.rated_nm} N·m rated (margin ${c.margin}x)`);
    }
  }
}

/** Design an arm (or neck) for a mount orientation on a 3S robot: try each 12 V servo family and keep the first that
 *  holds the payload in this mount, else the one with the most torque margin (its checks then report the shortfall). */
const PACK_MAX_V = 12.6;
function sizeArm(req: ArmRequest, Rmount: Mat4, limits: Record<string, [number, number]> = {}): RobotSpecification {
  const g: Vec3 = [-Rmount[2] * G, -Rmount[6] * G, -Rmount[10] * G]; // world -z in the arm base frame
  const ladders: Ladder[] = req.ladder ? [req.ladder] : ["feetech", "dynamixel12"];
  let best: { spec: RobotSpecification; score: number } | null = null;
  for (const ladder of ladders) {
    const spec = designArm({ ...req, ladder, maxSupplyV: PACK_MAX_V, gravity: g, embedded: true });
    for (const j of spec.joints) if (limits[j.name] && j.limit) [j.limit.lower, j.limit.upper] = limits[j.name];
    const tool = (spec.metadata as any).design.tool;
    const loads: PointLoad[] = tool ? [{ link: tool.link, at: tool.xyz_m, massKg: tool.payload_kg }] : [];
    const js = spec.joints.filter((j) => j.type === "revolute" && j.name !== "gripper");
    let grid: Record<string, number>[] = [{}];
    for (const j of js) grid = grid.flatMap((q) => [...new Set([-Math.PI / 2, 0, Math.PI / 2].map((v) => clampTo(j, v)))].map((v) => ({ ...q, [j.name]: v })));
    const worst: Record<string, number> = {};
    for (const q of grid) for (const [k, v] of Object.entries(gravityTorques(spec, q, loads, g))) worst[k] = Math.max(worst[k] ?? 0, v);
    const recs = (spec.metadata as any).design.joints as { joint: string; actuator: string }[];
    const score = Math.min(...recs.map((r) => { const st = worst[r.joint] ?? 0, rt = rating(r.actuator); return Math.min(rt.rated_nm / Math.max(st, 1e-6), rt.peak_nm / Math.max(st * DYNAMIC_FACTOR, 1e-6)); }));
    if (score >= 1) return spec;
    if (!best || score > best.score) best = { spec, score };
  }
  return best!.spec;
}
function attachArm(b: Build, prefix: string, req: ArmRequest, parent: string, Tw: Mat4, material?: string, limits: Record<string, [number, number]> = {}) {
  const R: Mat4 = [...Tw]; R[12] = R[13] = R[14] = 0;
  const spec = sizeArm(req, R, limits);
  const n0 = b.A.spec.joints.length;
  const g = graftArm(b.A, spec, parent, b.local(parent, Tw), prefix);
  b.A.design.checks = b.A.design.checks.filter((c) => !c.name.startsWith(`${prefix}:torque:`));
  const joints = b.A.spec.joints.slice(n0).filter((j) => j.type !== "fixed").map((j) => j.name);
  b.servoJoints.push(...joints);
  if (material) for (const l of b.A.spec.links) if (l.name.startsWith(`${prefix}_`) && l.geometry.type === "mesh" && l.geometry.part === "printed") l.material = material;
  b.W.set(`${prefix}_base_link`, Tw);
  const rec: ArmRec = { prefix, tool: g.tool!, joints, ladder: String(g.performance.actuators) };
  b.arms.push(rec);
  return { rec, spec, perf: g.performance };
}

/** Average electrical power (W) for the runtime estimate. */
function averagePower(b: Build, massKg: number, cruise: number, compute: string) {
  const q = DRIVE_REQ;
  const roll = massKg * G * q.crr * cruise;                                 // rolling resistance at cruise
  const motorW = roll / 0.55 + b.motors.length * 12 * 0.2 * 0.5;            // ~55 % gearmotor efficiency + friction/no-load
  const parts = [
    { what: "drive (50 % duty at cruise)", w: 0.5 * motorW },
    { what: compute === "rpi5" ? "Raspberry Pi 5 (typical, via 90 % buck)" : "Jetson Orin Nano Super (15 W mode)", w: compute === "rpi5" ? 6 / 0.9 : 15 },
    ...b.power,
    { what: `servos (${b.servoJoints.length} idle + holding)`, w: b.servoJoints.length * 12 * 0.06 },
    { what: "motor drivers, IMU, misc", w: 1.5 },
  ];
  return { total: parts.reduce((s, p) => s + p.w, 0), parts };
}

/** Turn-in-place rate at half the top wheel speed. Skid-steer wheel sets slide sideways while turning, so the yaw rate is the
 *  no-slip rate divided by an ICR-expansion factor; chi = 1 + 2 (wheelbase / track)^2 is the conservative value for grippy
 *  floors (lateral friction ~1; measured skid-steer factors are 1.5-2.5), about 3 for a square base. */
function turnClaim(b: Build, topSpeed: number, skid: boolean): Record<string, number> {
  const xs = b.contacts.filter((c) => c.driven).map((c) => c.x), ys = b.contacts.filter((c) => c.driven).map((c) => c.y);
  const track = (Math.max(...ys) - Math.min(...ys)) / 1000, wb = (Math.max(...xs) - Math.min(...xs)) / 1000;
  if (!(track > 0)) return {};
  // every wheel beyond two per side is one more patch dragged sideways in a turn
  const perSide = Math.max(2, Math.round(b.contacts.length / 2)); // driven or idler: every wheel on the ground scrubs
  const ideal = (0.5 * topSpeed) / (track / 2), chi = skid ? 1 + 2 * (wb / track) ** 2 + 0.25 * (perSide - 2) : 1;
  return { turn_rate_rad_s: +(ideal / chi).toFixed(2), turn_slip_factor: +chi.toFixed(2) };
}
/** Records every whole-robot check; call after the robot is complete. Returns what the outer loop needs to resize. */
function engineer(b: Build, o: { motor: string; wheel: string; nDriven: number; battery: [string, number]; compute: string; eff?: number; skid?: boolean; casterMaxKg?: number; extraMassKg?: number; extraLoads?: PointLoad[] }) {
  const A = b.A, mass = totalMass(A.spec) + (o.extraMassKg ?? 0);
  const d = driveNeed(mass, o.nDriven, o.wheel, o.motor, o.eff ?? 1);
  A.check("drive:slope_torque", d.ok, d.detail);
  A.design.joints.push(...b.A.spec.joints.filter((j) => j.type === "continuous" && !j.passive).map((j) => ({
    joint: j.name, actuator: o.motor, required_nm: +d.tauNm.toFixed(3), rated_nm: d.rated, peak_nm: d.stall, margin: +(d.rated / d.tauNm).toFixed(2),
    speed_rad_s: rating(o.motor).speed_rad_s, note: `wheel torque for ${DRIVE_REQ.slopeDeg} deg slope + ${DRIVE_REQ.accel} m/s^2, compared with the continuous rating` })));
  const minSpeed = 0.3;
  A.check("drive:top_speed", d.topSpeed >= minSpeed, `${d.topSpeed.toFixed(2)} m/s = no-load ${rating(o.motor).speed_rad_s} rad/s x r ${wheelInfo(o.wheel).r} mm x ${DRIVE_REQ.speedFactor} (needs >= ${minSpeed} m/s)`);
  // traction: the driven wheels must be able to push that hard without slipping
  const drivenShare = b.contacts.filter((c) => c.driven).length / b.contacts.length;
  const share = b.contacts.some((c) => !c.driven) ? Math.max(0.6, drivenShare) : 1;
  const grip = DRIVE_REQ.tractionMu * mass * G * Math.cos(DRIVE_REQ.slopeDeg * D2R) * share;
  A.check("drive:traction", grip >= d.forceN, `driven wheels carry ~${Math.round(share * 100)} % of ${(mass * G).toFixed(0)} N, mu ${DRIVE_REQ.tractionMu}: ${grip.toFixed(1)} N of grip vs ${d.forceN.toFixed(1)} N needed`);
  if (o.skid) {
    const xs = b.contacts.map((c) => c.x), xc = xs.reduce((s, x) => s + x, 0) / xs.length;
    const N = (mass * G) / b.contacts.length, M = b.contacts.reduce((s, c) => s + DRIVE_REQ.lateralMu * N * Math.abs(c.x - xc), 0);
    const track = Math.max(...b.contacts.map((c) => c.y)) - Math.min(...b.contacts.map((c) => c.y));
    const perSide = b.contacts.filter((c) => c.driven && c.y > 0).length || 1;
    const tau = (M / (track / 1000) / perSide) * (wheelInfo(o.wheel).r / 1000) / 1000;
    A.check("drive:skid_turn", tau * DYNAMIC_FACTOR <= d.stall, `turning on the spot scrubs ${M.toFixed(0)} N·mm (lateral mu ${DRIVE_REQ.lateralMu}); ${tau.toFixed(3)} N·m per driven wheel x ${DYNAMIC_FACTOR} vs stall ${d.stall} N·m (short transient)`);
  }
  // battery
  const cruise = Math.min(0.5, d.topSpeed * 0.6);
  const pw = averagePower(b, mass, cruise, o.compute);
  const bat = part(o.battery[0]), wh = Number(bat.specs.energy_wh) * o.battery[1];
  const runtime = (wh * DRIVE_REQ.usableEnergy) / pw.total;
  A.check("power:runtime", runtime >= DRIVE_REQ.runtimeH, `${o.battery[1]} x ${bat.name}: ${wh.toFixed(0)} Wh x ${DRIVE_REQ.usableEnergy} usable / ${pw.total.toFixed(1)} W average = ${runtime.toFixed(2)} h (needs >= ${DRIVE_REQ.runtimeH} h); ${pw.parts.map((p) => `${p.what} ${p.w.toFixed(1)} W`).join(", ")}`);
  const vmax = 4.2 * Number(bat.specs.cells), vmin = 3.3 * Number(bat.specs.cells);
  const twelve = [...new Set([...b.motors, ...b.A.design.joints.map((j) => j.actuator)])];
  const bad = twelve.filter((k) => vmax > Number(part(k).specs.voltage_v) * 1.1);
  const computeOk = o.compute === "rpi5" || (vmin >= 9 && vmax <= 20);
  A.check("power:voltage", !bad.length && computeOk, `${bat.specs.cells}S pack ${vmin.toFixed(1)}-${vmax.toFixed(1)} V feeds 12 V motors/servos directly (<= 110 % of rating)${bad.length ? `; too high for ${bad.join(", ")}` : ""}; ${o.compute === "rpi5" ? "Pi 5 through the 5 V 5.5 A buck" : "Jetson barrel input accepts 9-20 V"}`);
  const peakA = b.motors.reduce((s, k) => s + Number(part(k).specs.stall_current_a ?? 0), 0) * 0.5 + 6;
  const maxA = Number(bat.specs.max_current_a) * o.battery[1];
  A.check("power:peak_current", maxA >= peakA, `pack delivers ${maxA} A; drive at half stall + electronics ~${peakA.toFixed(0)} A`);
  // stability at home and with every arm stretched out holding its payload
  const loads: PointLoad[] = [...(o.extraLoads ?? []), ...b.arms.map((a) => ({ link: a.tool.link, at: a.tool.xyz_m, massKg: a.tool.payload_kg }))];
  const need = DRIVE_REQ.slopeDeg + Math.atan(DRIVE_REQ.accel / G) / D2R;
  let worst = { margin: Infinity, tipDeg: Infinity, com: [0, 0, 0] as Vec3 }, worstQ: Record<string, number> = {};
  for (const q of armPoses(A.spec, b.arms)) { const s = stabilityAt(A.spec, b.contacts, q, loads); if (s.tipDeg < worst.tipDeg) { worst = s; worstQ = q; } }
  A.check("stability:tip", worst.tipDeg >= need, `CoM ${worst.com.map((v) => v.toFixed(0)).join(", ")} mm is ${worst.margin.toFixed(0)} mm inside the support polygon; tips at ${worst.tipDeg.toFixed(1)} deg vs ${need.toFixed(1)} deg (${DRIVE_REQ.slopeDeg} deg slope + braking)${Object.keys(worstQ).length ? `, worst pose ${Object.entries(worstQ).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(" ")}` : ""}${loads.length ? " with payload" : ""}`);
  if (o.casterMaxKg) {
    const casters = b.contacts.filter((c) => !c.driven).length;
    const load = mass * 0.35; // worst case: the caster on the CoM side carries about a third of the robot
    A.check("drive:caster_load", load <= o.casterMaxKg / 3 * casters, `${casters} ball caster(s) rated for robots up to ${o.casterMaxKg} kg; worst caster load ~${load.toFixed(2)} kg`);
  }
  verifyArms(b);
  A.design.performance = {
    ...A.design.performance, mass_kg: +totalMass(A.spec).toFixed(3), loaded_mass_kg: +mass.toFixed(3), top_speed_m_s: +d.topSpeed.toFixed(2), wheel_torque_nm: +d.tauNm.toFixed(3), drive_motor: o.motor,
    battery: `${o.battery[1]} x ${o.battery[0]}`, average_power_w: +pw.total.toFixed(1), runtime_h: +runtime.toFixed(2), tip_angle_deg: +worst.tipDeg.toFixed(1), compute: o.compute,
    slope_deg: DRIVE_REQ.slopeDeg,
    ...turnClaim(b, d.topSpeed, !!o.skid),
  };
  return { mass, drive: d, runtime, pw };
}

/** Bill-of-materials cost and the budget check; call after finish(). */
function costing(b: Build, spec: RobotSpecification, budget?: number) {
  const d = (spec.metadata as any).design;
  const bought = d.purchased.reduce((s: number, p: { key: string; qty: number }) => s + part(p.key).price_usd * p.qty, 0);
  const printedKg = d.printed.reduce((s: number, p: { mass_kg: number }) => s + p.mass_kg, 0);
  const filament = printedKg * 1.15 * FILAMENT_USD_PER_KG;
  const fasteners = Object.values(d.fasteners as Record<string, number>).reduce((s, n) => s + n, 0) * 0.12;
  const fab = b.fab.reduce((s, f) => s + f.usd, 0), wiring = Number(d.wiring?.cost_usd ?? 15);
  const total = bought + filament + fasteners + fab + wiring;
  d.performance.cost_usd = Math.round(total);
  d.performance.cost_breakdown = `catalog parts $${bought.toFixed(0)}, filament ${(printedKg * 1.15).toFixed(2)} kg $${filament.toFixed(0)}, fasteners $${fasteners.toFixed(0)}, fabricated/other $${fab.toFixed(0)} (${[...b.fab.map((f) => f.item), "power switch, 15 A fuse, wiring"].join("; ")})`;
  if (budget !== undefined) d.checks.push({ name: "budget", pass: total <= budget, detail: `estimated $${total.toFixed(0)} vs budget $${budget}` });
  return total;
}

/**
 * Choose drive motor and battery from the robot as built: build with a guess, compute the loads and
 * power of that robot, move up the ladders until both pass, rebuild, repeat until the choice is stable.
 */
/** `firstMotor`: start the gearmotor ladder here (slower, stronger), e.g. a character that should move at walking pace. */
function sizeAndBuild<T extends { b: Build; eng: ReturnType<typeof engineer> }>(build: (motor: string, battery: [string, number]) => T, firstMotor = 0): T {
  let mi = firstMotor, bi = 0, out: T | null = null;
  const seen = new Set<string>();
  for (let iter = 0; iter < 8; iter++) {
    const key = `${mi}/${bi}`;
    out = build(DRIVE_MOTORS[mi], BATTERIES[bi]);
    if (seen.has(key)) break;
    seen.add(key);
    const torqueOk = out.eng.drive.ok, runOk = out.eng.runtime >= DRIVE_REQ.runtimeH;
    let nmi = mi, nbi = bi;
    if (!torqueOk && mi < DRIVE_MOTORS.length - 1) nmi = mi + 1;
    if (!runOk && bi < BATTERIES.length - 1) nbi = bi + 1;
    if (nmi === mi && nbi === bi) break;
    mi = nmi; bi = nbi;
  }
  return out!;
}

// ---------------------------------------------------------------------------- plates / decks
/** Prusa MK4 build volume X x Y x Z (mm); a part fits if some orientation puts its three sizes inside it */
const BED = [250, 210, 220];
const fitsBed = (d: number[]) => [[0, 1, 2], [1, 0, 2], [0, 2, 1], [2, 0, 1], [1, 2, 0], [2, 1, 0]].some((p) => p.every((k, i) => d[k] <= BED[i]));
/** Deck: printed in one piece if it fits the bed, else a laser-cut 3 mm aluminium plate (fabricated). */
function deck(b: Build, L: number, W: number, zB: number, extra: Op[] = [], corner = 25) {
  const printed = fitsBed([L, W, 6]);
  const t = printed ? 6 : 3;
  const ops: Op[] = [{ op: "box", min: [-L / 2, -W / 2, zB], max: [L / 2, W / 2, zB + t], r: corner }, ...extra];
  for (let x = -L / 2 + 20; x <= L / 2 - 19; x += 25) for (const y of [-W / 2 + 12, W / 2 - 12]) ops.push({ op: "hole", a: [x, y, zB - 1], b: [x, y, zB + t + 1], d: 3.4 }); // M3 grid along the edges
  if (printed) b.printed("base_link", null, ops, "printed_dark", "base");
  else b.fabricated("base_link", null, ops, { density: ALU, material: "aluminium", item: `${L} x ${W} x 3 mm 5052 aluminium deck, laser cut (~$${Math.round(20 + L * W * 0.0004)})`, usd: Math.round(20 + L * W * 0.0004), role: "base" });
  b.deckTop = zB + t;
  return { printed, top: zB + t };
}

function defaults(req: MobileRequest, sensors: MobileSensor[]) {
  const out = req.sensors?.length ? [...new Set(req.sensors)] : sensors;
  return out.filter((s) => !(req.excludeSensors ?? []).includes(s));
}

// ============================================================================ wheeled bases
type BaseKind = "diff" | "four" | "mecanum";
function designBase(kind: BaseKind, req: MobileRequest): RobotSpecification {
  const sensors = defaults(req, kind === "four" ? ["lidar", "imu", "camera"] : ["lidar", "imu"]);
  const cargo = req.payloadKg ?? (kind === "diff" ? 1 : 2);
  const wheel = kind === "mecanum" ? "mecanum_96mm_gobilda" : "wheel_90mm_37d";
  const name = req.name ?? { diff: "diff_drive_robot", four: "four_wheel_robot", mecanum: "mecanum_robot" }[kind];
  const family = { diff: "mobile_diff_drive", four: "mobile_skid_steer", mecanum: "mobile_mecanum" }[kind];
  const result = sizeAndBuild((motor, battery) => {
    const b = new Build(name, family, req.prompt);
    const wi = wheelInfo(wheel), h = wi.r, yFace = 95;
    const zB = Math.ceil(h + MOTOR_TOP + 7);
    const W = 2 * (yFace + 5);
    // the deck is as short as its electronics allow: a depth camera's Jetson and a big pack may need a longer one
    const parts = electronicsFor(sensors, kind === "diff" ? 2 : 4, battery, false, false);
    // one deck where a longer deck takes everything (two decks leave the fuse, the switch and the cables between them no
    // room to turn); two decks only when no length does
    const base = kind === "diff" ? 244 : 300, lengths = [base, base + 56, base + 112], { reserved: _r, area: _a } = deckRects(base, W, sensors);
    void _r; void _a;
    const L = lengths.find((l) => { const d = deckRects(l, W, sensors); return !!packBay(parts.items, d.area, pad(d.reserved)); }) ?? lengths.find((l) => !!deckLayout(l, W, sensors, parts.items)) ?? base;
    deck(b, L, W, zB, [], kind === "diff" ? 60 : 20);
    const stations: WheelOpts[] = kind === "diff"
      ? [1, -1].map((s) => ({ tag: s > 0 ? "left" : "right", parent: "base_link", x: 0, side: s as 1 | -1, yFace, motor, wheel }))
      : [[90, 1, "front_left"], [90, -1, "front_right"], [-90, 1, "rear_left"], [-90, -1, "rear_right"]].map(([x, s, t]) => ({ tag: String(t), parent: "base_link", x: Number(x), side: Number(s) as 1 | -1, yFace, motor, wheel }));
    for (const o of stations) deckBracket(b, wheelStation(b, o), o, zB);
    if (kind === "diff") for (const [t, x] of [["front_caster", 98], ["rear_caster", -98]] as const) ballCaster(b, t, x, 0, zB);
    const { items, compute } = parts;
    const top = b.deckTop;
    const front = L / 2, lidarAt: [number, number] = [-L / 2 + 36, 0];
    const { reserved, area } = deckRects(L, W, sensors);
    if (packBay(items, area, pad(reserved))) {
      const clear = electronicsBay(b, items, area, pad(reserved), top);
      const zT = enclosure(b, items, area, pad(reserved), top, clear, "base_link", "electronics_enclosure", true, { mast: sensors.includes("lidar") ? 0 : undefined }) ?? clear + 8;
      // the lidar stands in a ring inside the compartment: its lead stays inside, through the ring's window
      if (sensors.includes("lidar")) { lidarMast(b, lidarAt[0], lidarAt[1], top, zT - 8 + 10.4); b.H.bayOf.set("lidar", "electronics_enclosure"); }
    } else {
      // too much for one deck (TurtleBot "waffle" layout): battery and drivers below, computer, IMU and
      // regulator on an upper deck on four printed pillars, the lidar on top of it
      const { ux0, ux1, uy, pillars, low, high, lowRes, uArea, uRes } = upperDeck(L, W, sensors, items);
      const lowTop = electronicsBay(b, low, area, pad(lowRes), top);
      // the main switch is in the lower compartment's wall, by the pack and its fuse; the computer's USB in the upper one
      const lowLid = enclosure(b, low, area, pad(lowRes), top, lowTop, "base_link", "power_bay", { usb: false }) ?? lowTop + 8;
      // the cables between the decks turn in the gap over the lower lid: 20 mm of it
      const zU = Math.max(lowLid + 2.6 + 20, top + 50);
      const upOps: Op[] = [{ op: "box", min: [ux0, -uy, zU], max: [ux1, uy, zU + 4], r: 12 }, ...pillars.map(([x, y]) => ({ op: "hole", a: [x, y, zU - 1], b: [x, y, zU + 5], d: 3.4 }) as Op)];
      if (fitsBed([ux1 - ux0, 2 * uy, 4])) b.printed("upper_deck", "base_link", upOps, "printed_dark");
      else b.fabricated("upper_deck", "base_link", upOps, { density: ALU, material: "aluminium", item: `${Math.round(ux1 - ux0)} x ${2 * uy} x 4 mm upper deck (aluminium, ~$25)`, usd: 25 });
      pillars.forEach(([x, y], i) => b.printed(`pillar_${i + 1}`, "base_link", [{ op: "rod", a: [x, y, top], b: [x, y, zU], r: 7 }, { op: "hole", a: [x, y, top - 1], b: [x, y, zU + 1], d: 2.8 }], "printed_dark"));
      b.A.fastener("M3 x 10 (pillars)", 8);
      const upTop = zU + 4;
      const clear = electronicsBay(b, high, uArea, pad(uRes), upTop, "upper_deck");
      const zT = enclosure(b, high, uArea, pad(uRes), upTop, clear, "upper_deck", "electronics_enclosure", { sw: false }, { mast: sensors.includes("lidar") ? uRes.length - 1 : undefined }) ?? clear + 8;
      if (sensors.includes("lidar")) { lidarMast(b, ux0 + 37, 0, upTop, zT - 8 + 10.4, "upper_deck"); b.H.bayOf.set("lidar", "electronics_enclosure"); }
      lidGrommets(b, "power_bay", "electronics_enclosure");
    }
    if (sensors.includes("depth")) depthCamera(b, front - 14, 0, top + 40, top);
    if (sensors.includes("camera")) {
      const y = sensors.includes("depth") ? 64 : 0, x = front - 14;
      const T = cameraModule(b, "front_camera", "base_link", [x + 10, y, top + 30]);
      b.printed("front_camera_bracket", "base_link", [{ op: "box", min: [x - 6, y - 18, top], max: [x, y + 18, top + 45], r: 2 },
        { op: "box", min: [x - 6, y - 18, top], max: [x + 8, y + 18, top + 4], r: 2 }, { op: "box", min: [x - 6, y - 18, top + 18], max: [x + 9.3, y + 18, top + 42] }, bodyCut("rpi_camera_module_3", T),
        { op: "hole", a: [x + 4, y, top - 1], b: [x + 4, y, top + 5], d: 3.4 }], "printed_dark");
    }
    if (sensors.includes("imu")) b.sensor("imu_frame", "imu", "imu", translation([12.8, 11.35, 2]), { rate_hz: 400 });
    // cargo sits on the deck top over the centre
    const extraLoads: PointLoad[] = cargo > 0 ? [{ link: "base_link", at: [0, 0, (top + 40) / 1000], massKg: cargo }] : [];
    const eng = engineer(b, { motor, wheel, nDriven: stations.length, battery, compute, eff: kind === "mecanum" ? 0.85 : 1, skid: kind === "four", casterMaxKg: kind === "diff" ? Number(part("ball_caster_pololu_2692").specs.max_robot_mass_kg) : undefined, extraMassKg: cargo, extraLoads });
    return { b, eng, compute, battery };
  });
  const { b, compute } = result;
  const A = b.A;
  wireMobile(b, compute, result.battery, sensors);
  A.design.performance.cargo_kg = cargo;
  A.design.assumptions.push(
    `Drive sized for the robot plus ${cargo} kg cargo on a ${DRIVE_REQ.slopeDeg} deg slope accelerating at ${DRIVE_REQ.accel} m/s^2, rolling resistance ${DRIVE_REQ.crr}; motors compared at their continuous (not stall) rating.`,
    "All motors and servos are 12 V parts run straight from a 3S LiPo (9.9-12.6 V) through the main fuse and switch; see WIRING.md.",
    "Printed parts: PETG; brackets bolt to the deck with M3 screws and nuts; the motor face screws are the gearmotor's own six M3 holes.",
  );
  if (kind === "diff") A.design.assumptions.push("Two ball casters (front and rear) keep the deck level; on rough floors fit only one or add the Pololu spacer set so the drive wheels never lift.");
  if (kind === "four") A.design.assumptions.push("Skid steering: both wheels on a side get the same command; turning on the spot scrubs the tyres sideways (checked as a short-transient torque).");
  if (kind === "mecanum") A.design.assumptions.push("Mecanum wheels mount in an X pattern seen from above (front-left and rear-right left-handed, the others right-handed); goBILDA sells them as a 2+2 set.",
    "The simulation contacts each mecanum wheel as a plain cylinder: free rollers are not simulated, so sideways motion is a kinematics claim, not a physics-tested one.",
    "Forward drive torque includes an 0.85 efficiency for roller rolling losses.");
  if (!fitsBed([kind === "diff" ? 244 : 300, 200, 6])) A.design.assumptions.push("The deck is larger than a 250 x 210 mm bed, so it is a laser-cut 3 mm aluminium plate (send-cut-send style service) rather than a print.");
  A.design.request = { ...req };
  const spec = A.finish(`${{ diff: "Differential-drive", four: "Four-wheel skid-steer", mecanum: "Mecanum holonomic" }[kind]} base: ${A.design.performance.drive_motor} gearmotors, ${A.design.performance.mass_kg} kg, ${A.design.performance.top_speed_m_s} m/s, ${A.design.performance.runtime_h} h on ${A.design.performance.battery}, ${compute}`);
  costing(b, spec, req.budget);
  return spec;
}

export function designDiffDrive(req: MobileRequest = {}): RobotSpecification { return designBase("diff", req); }
export function designFourWheel(req: MobileRequest = {}): RobotSpecification { return designBase("four", req); }
export function designMecanum(req: MobileRequest = {}): RobotSpecification { return designBase("mecanum", req); }

// ============================================================================ rocker-bogie rover
/**
 * Rocker-bogie rover after the JPL Open Source Rover: a body box on two rockers; with 6 wheels each
 * rocker carries a front wheel and a bogie with the middle and rear wheels, with 4 wheels each rocker
 * carries a front and a rear wheel. Optionally carries an arm on the deck.
 */
export function designRover(req: MobileRequest = {}): RobotSpecification {
  const nW = Math.max(4, req.wheels ?? 6) >= 6 ? 6 : 4;
  const sensors = defaults(req, ["depth", "imu", "camera"]);
  const armReq = req.arm;
  const payload = armReq?.payloadKg ?? req.payloadKg ?? 0.2;
  const wheel = "wheel_90mm_37d", wi = wheelInfo(wheel), h = wi.r;
  const BL = 320, BW = 210, zBody = 112, BH = 100, yFace = 124;
  const pivot: Vec3 = [0, 0, 150], xF = 130, xBog = -65, zBog = 105;
  const name = req.name ?? (armReq ? "mars_rover_with_arm" : "mars_rover");
  const armPrefix = "arm";
  // the arm does not depend on the drive choice: size it once
  const armMount = translation([0, 0, zBody + BH + 3]);
  const armSpec = armReq ? sizeArm({ dof: armReq.dof, reachM: armReq.reachM ?? 0.35, payloadKg: payload, budget: req.budget, ladder: "feetech", basePlateMm: 100, ...(armReq.gripper === false ? { gripper: false } : {}) }, I4()) : null;
  const result = sizeAndBuild((motor, battery) => {
    const b = new Build(name, "mobile_rocker_bogie", req.prompt);
    // body: folded 2 mm aluminium box (open top) with a 3 mm lid that carries arm and sensors
    const body: Op[] = [{ op: "box", min: [-BL / 2, -BW / 2, zBody], max: [BL / 2, BW / 2, zBody + BH], r: 6 }, { op: "cutbox", min: [-BL / 2 + 2, -BW / 2 + 2, zBody + 2], max: [BL / 2 - 2, BW / 2 - 2, zBody + BH + 1] }];
    b.fabricated("base_link", null, body, { density: ALU, material: "aluminium", item: `${BL} x ${BW} x ${BH} mm folded 2 mm aluminium body box (~$60)`, usd: 60, role: "base" });
    b.fabricated("deck_lid", "base_link", [{ op: "box", min: [-BL / 2, -BW / 2, zBody + BH], max: [BL / 2, BW / 2, zBody + BH + 3], r: 6 }],
      { density: ALU, material: "aluminium", item: `${BL} x ${BW} x 3 mm aluminium lid, laser cut (~$35)`, usd: 35 });
    const lidTop = zBody + BH + 3;
    for (const s of [1, -1] as const) {
      const side = s > 0 ? "left" : "right";
      const rocker = `${side}_rocker`;
      const Tp = frame([pivot[0], s * 118, pivot[2]], [0, s, 0], [1, 0, 0]);
      // the differential bar: the rockers turn opposite ways in the world (their frames are mirrored, so with equal joint
      // angles), which keeps all the wheels loaded alike in a turn and holds the body at the mean of the two sides
      const rockerJoint = b.passiveHinge(`${side}_rocker_pivot`, "base_link", rocker, Tp, -0.24, 0.24);   // past 0.26 rad the rocker frame meets the body box, past 0.29 the motors do
      if (s < 0) rockerJoint.mimic = { joint: "left_rocker_pivot", multiplier: 1, offset: 0 };
      const ry0 = s > 0 ? 110 : -124.5, ry1 = s > 0 ? 124.5 : -110;
      const front = wheelStation(b, { tag: `${side}_front`, parent: rocker, x: xF, side: s, yFace, motor, wheel });
      const rOps: Op[] = [
        { op: "rod", a: [pivot[0], ry0, pivot[2]], b: [pivot[0], ry1, pivot[2]], r: 18 },
        { op: "beam", a: [pivot[0], (ry0 + ry1) / 2, pivot[2]], b: [xF, (ry0 + ry1) / 2, h + 28], w: 22, h: 14.5, up: [0, 1, 0] },
        { op: "box", min: [xF - 22, ry0, h + 14], max: [xF + 22, ry1, h + 32], r: 4 },
        ...front.plate(h + 32),
        { op: "hole", a: [pivot[0], ry0 - 1, pivot[2]], b: [pivot[0], ry1 + 1, pivot[2]], d: 8.4 },
        { op: "hole", a: [pivot[0], s > 0 ? 116 : -124.6, pivot[2]], b: [pivot[0], s > 0 ? 124.6 : -116, pivot[2]], d: 22.1 },
        { op: "keepout", key: motor, T: front.Tm }, { op: "hole", a: [xF, ry0 - 1, h], b: [xF, ry1 + 1, h], d: 14 }, { op: "cutbox", min: [xF - 19.5, s > 0 ? yFace - 1.5 : -yFace, h + 7 - 19.5], max: [xF + 19.5, s > 0 ? yFace : -yFace + 1.5, h + 7 + 19.5] },
      ];
      b.A.buy("bearing_608zz", 1, "rocker pivot"); b.A.fastener("M8 x 40 shoulder bolt + spacer (rocker pivot)", 1);
      if (nW === 6) {
        const bog = `${side}_bogie`;
        rOps.push({ op: "beam", a: [pivot[0], (ry0 + ry1) / 2, pivot[2]], b: [xBog, (ry0 + ry1) / 2, zBog], w: 22, h: 14.5, up: [0, 1, 0] },
          { op: "rod", a: [xBog, ry0, zBog], b: [xBog, ry1, zBog], r: 14 }, { op: "hole", a: [xBog, ry0 - 1, zBog], b: [xBog, ry1 + 1, zBog], d: 8.4 });
        const Tb = frame([xBog, s * 129, zBog], [0, s, 0], [1, 0, 0]);
        b.passiveHinge(`${side}_bogie_pivot`, rocker, bog, Tb, -0.5, 0.5);
        const mid = wheelStation(b, { tag: `${side}_middle`, parent: bog, x: 0, side: s, yFace, motor, wheel });
        const rear = wheelStation(b, { tag: `${side}_rear`, parent: bog, x: -130, side: s, yFace, motor, wheel });
        const by0 = s > 0 ? 125 : -133.5, by1 = s > 0 ? 133.5 : -125;
        const bOps: Op[] = [{ op: "rod", a: [xBog, by0, zBog], b: [xBog, by1, zBog], r: 16 },
          { op: "beam", a: [xBog, (by0 + by1) / 2, zBog], b: [0, (by0 + by1) / 2, h + 28], w: 20, h: 8.5, up: [0, 1, 0] },
          { op: "beam", a: [xBog, (by0 + by1) / 2, zBog], b: [-130, (by0 + by1) / 2, h + 28], w: 20, h: 8.5, up: [0, 1, 0] },
          ...mid.plate(h + 32), ...rear.plate(h + 32),
          { op: "box", min: [-22, by0, h + 14], max: [22, by1, h + 32], r: 4 }, { op: "box", min: [-152, by0, h + 14], max: [-108, by1, h + 32], r: 4 },
          { op: "hole", a: [xBog, by0 - 1, zBog], b: [xBog, by1 + 1, zBog], d: 22.1 },
          { op: "keepout", key: motor, T: mid.Tm }, { op: "keepout", key: motor, T: rear.Tm }];
        b.printed(`${bog}_frame`, bog, bOps, "printed_accent");
        b.A.buy("bearing_608zz", 1, "bogie pivot"); b.A.fastener("M8 x 30 shoulder bolt (bogie pivot)", 1);
        b.A.frameLink(bog, "bogie");
      } else {
        // a 4-wheel rocker is too long for the bed: the rear arm is a second print bolted to the hub
        const rear = wheelStation(b, { tag: `${side}_rear`, parent: rocker, x: -xF, side: s, yFace, motor, wheel });
        b.printed(`${rocker}_rear_arm`, rocker, [{ op: "beam", a: [pivot[0], (ry0 + ry1) / 2, pivot[2]], b: [-xF, (ry0 + ry1) / 2, h + 28], w: 22, h: 14.5, up: [0, 1, 0] },
          { op: "box", min: [-xF - 22, ry0, h + 14], max: [-xF + 22, ry1, h + 32], r: 4 }, ...rear.plate(h + 32), { op: "keepout", key: motor, T: rear.Tm }, { op: "hole", a: [-xF, ry0 - 1, h], b: [-xF, ry1 + 1, h], d: 14 }, { op: "cutbox", min: [-xF - 19.5, s > 0 ? yFace - 1.5 : -yFace, h + 7 - 19.5], max: [-xF + 19.5, s > 0 ? yFace : -yFace + 1.5, h + 7 + 19.5] },
          { op: "hole", a: [pivot[0], ry0 - 1, pivot[2]], b: [pivot[0], ry1 + 1, pivot[2]], d: 36.2 }], "printed_accent");
        b.A.fastener("M4 x 20 + nut (rocker rear arm to hub)", 2);
      }
      b.printed(`${rocker}_frame`, rocker, rOps, "printed_accent");
      b.A.frameLink(rocker, "rocker");
    }
    // electronics inside the body box, on its floor
    const { items, compute } = electronicsFor(sensors, nW, battery, !!armReq, !!armReq);
    b.deckTop = zBody + 2;
    const bayArea = { x0: -BL / 2 + 6, x1: BL / 2 - 6, y0: -BW / 2 + 6, y1: BW / 2 - 6 };
    // a full box: boards close up, leaving room for plugs on one side only
    if (!packBay(items, bayArea, [])) for (const i of items) if (i.kind === "board") i.margin = [1, 1, 1, 4];
    const plan = packBay(items, bayArea, []);
    electronicsBay(b, items, bayArea, [], zBody + 2);
    // the body box is the compartment: USB window and main switch in its walls, leads out by the rocker pivots, vent slots
    const boards = (plan ?? []).map(({ it, yaw, x, y }) => { const fp = footprint(it), dx = fp.max[0] - fp.min[0], dy = fp.max[1] - fp.min[1], [w, h2] = yaw ? [dy, dx] : [dx, dy]; return { x0: x, x1: x + w, y0: y, y1: y + h2 }; });
    const fx = wallFixtures(b, plan ?? [], { x0: -BL / 2, x1: BL / 2, y0: -BW / 2, y1: BW / 2, z0: zBody + 2, z1: zBody + BH, t: 2 }, boards, "base_link");
    const pivotExits: BayRecord["exits"] = ([1, -1] as const).map((s) => ({ id: `body_bay.${s > 0 ? "left" : "right"}_rocker`, kind: "grommet", face: (s > 0 ? "y+" : "y-") as Face, at: [40, s * BW / 2, zBody + 60] as Vec3, normal: [0, s, 0] as Vec3, hole_mm: 9.5 }));
    // vent slots along both side walls, 33 mm tall; a hotter bay (a Jetson and an arm's drivers) gets taller slots, up to 6 mm under the lid
    const slotXs = Array.from({ length: 26 }, (_, k) => -130 + k * 10).filter((x) => Math.abs(x - 40) >= 12);
    const heat = items.reduce((h, i) => h + heatOf(i.key), 0), slotH = Math.min(BH - 61, Math.max(33, Math.ceil(ventNeed(heat) / (5 * 2 * slotXs.length))));
    const slots: Op[] = []; let ventArea = 0;
    for (const x of slotXs) for (const s of [1, -1]) { slots.push({ op: "cutbox", min: [x, s > 0 ? BW / 2 - 3 : -BW / 2 - 1, zBody + 55], max: [x + 5, s > 0 ? BW / 2 + 1 : -BW / 2 + 3, zBody + 55 + slotH] }); ventArea += 5 * slotH; }
    b.A.amendProgram("base_link", [...fx.cuts, ...slots, ...pivotExits.map((e): Op => ({ op: "hole", a: [e.at[0], e.at[1] - e.normal[1] * 4, e.at[2]], b: [e.at[0], e.at[1] + e.normal[1] * 2, e.at[2]], d: 9.5 }))]);
    const lidExit: Vec3 = [-40, 0, zBody + BH + 3];
    b.A.amendProgram("deck_lid", [{ op: "hole", a: [lidExit[0], lidExit[1], zBody + BH - 2], b: [lidExit[0], lidExit[1], zBody + BH + 5], d: 9.5 }]);
    registerBay(b.A, { name: "body_bay", tub: "base_link", lid: "deck_lid", parent: "base_link", T: I4(), min: [-BL / 2 + 2, -BW / 2 + 2, zBody + 2], max: [BL / 2 - 2, BW / 2 - 2, zBody + BH], parts: items.map((i) => i.name), screws: 8, vent_area_mm2: ventArea, note: "the folded aluminium body box",
      exits: [...fx.exits.map((e) => ({ ...e, id: e.id.replace("electronics_enclosure", "body_bay") })), ...pivotExits, { id: "body_bay.lid_leads", kind: "grommet", face: "lid", at: lidExit, normal: [0, 0, 1], hole_mm: 9.5 }] }, b.H);
    b.A.fastener("M3 x 8 countersunk (body lid)", 8);
    // sensors on the lid: depth camera at the front, camera on a mast, lidar behind the arm
    const reservedX = BL / 2;
    if (sensors.includes("depth")) depthCamera(b, reservedX - 14, 0, lidTop + 60, lidTop, "deck_lid");
    if (sensors.includes("camera")) {
      const x = -BL / 2 + 40, y = 0, mz = lidTop + 180;
      const T = cameraModule(b, "mast_camera", "deck_lid", [x + 14, y, mz]);
      b.printed("camera_mast", "deck_lid", [{ op: "rod", a: [x, y, lidTop], b: [x, y, mz + 12], r: 10 }, { op: "box", min: [x - 25, y - 25, lidTop], max: [x + 25, y + 25, lidTop + 4], r: 5 },
        { op: "box", min: [x, y - 15, mz - 14], max: [x + 4, y + 15, mz + 14], r: 2 }, bodyCut("rpi_camera_module_3", T)], "printed_dark");
    }
    if (sensors.includes("lidar")) lidarMast(b, -BL / 2 + 45, sensors.includes("camera") ? 62 : 0, lidTop, lidTop, "deck_lid");
    if (sensors.includes("imu")) b.sensor("imu_frame", "imu", "imu", translation([12.8, 11.35, 2]), { rate_hz: 400 });
    if (armSpec) {
      const n0 = b.A.spec.joints.length;
      const g = graftArm(b.A, armSpec, "deck_lid", b.local("deck_lid", armMount), armPrefix);
      b.A.design.checks = b.A.design.checks.filter((c) => !c.name.startsWith(`${armPrefix}:torque:`));
      const joints = b.A.spec.joints.slice(n0).filter((j) => j.type !== "fixed").map((j) => j.name);
      b.servoJoints.push(...joints);
      b.arms.push({ prefix: armPrefix, tool: g.tool!, joints, ladder: String(g.performance.actuators) });
      b.A.design.performance.arm = `${armReq!.dof}-DOF, reach ${g.performance.reach_m} m, ${payload} kg, ${g.performance.actuators}`;
    }
    const eng = engineer(b, { motor, wheel, nDriven: nW, battery, compute, skid: true });
    return { b, eng, compute, battery };
  });
  const { b, compute } = result, A = b.A;
  wireMobile(b, compute, result.battery, sensors);
  A.design.assumptions.push(
    `Rocker-bogie after the JPL Open Source Rover, ${nW} driven wheels, skid steering (the OSR's four corner-steering servos are left out; add them for less tyre scrub).`,
    "The differential bar linking the two rockers through the body is modelled as a URDF mimic between the rocker pivots: a passive bar has no motor, and the model's rockers turn equally and opposite.",
    `${nW === 6 ? "Bogies pivot freely on 608 bearings. " : ""}Rockers and bogies are printed in PETG; for outdoor use print them in 6 bolt-on sections from aluminium channel instead (as the OSR does).`,
    "Body: folded 2 mm aluminium box with a 3 mm lid; electronics on printed standoff plates on its floor.",
    "All motors and servos are 12 V parts run straight from a 3S LiPo; arm servos share the pack through the bus adapter.",
  );
  if (armReq) A.design.assumptions.push(`Arm: ${armReq.dof} DOF bolted to the lid front, sized as mounted for a ${payload} kg sample at full reach; the rover's tipping check includes the arm stretched forward, sideways and back with the sample.`);
  A.design.request = { ...req };
  const spec = A.finish(`${nW}-wheel rocker-bogie rover${armReq ? ` with a ${armReq.dof}-DOF arm` : ""}: ${A.design.performance.mass_kg} kg, ${A.design.performance.top_speed_m_s} m/s, ${A.design.performance.runtime_h} h, ${compute}`);
  costing(b, spec, req.budget);
  return spec;
}

// ===================================================================== characters, built for real
/** Helper: closed (r, z) outline of a thin shell of revolution between two radius profiles. */
function shellOutline(prof: [number, number][], t: number): [number, number][] {
  const out = prof.map(([r, z]) => [r, z] as [number, number]);
  const inn = prof.map(([r, z], i) => {
    const [r0, z0] = prof[Math.max(0, i - 1)], [r1, z1] = prof[Math.min(prof.length - 1, i + 1)];
    const tx = r1 - r0, tz = z1 - z0, l = Math.hypot(tx, tz) || 1;
    return [Math.max(0, r - (tz / l) * t), z + (tx / l) * t] as [number, number];
  });
  return [...out, ...inn.reverse()];
}
/** Profile of a superellipse-ish egg: radius at height z between z0 and z1, widest at zw. */
function eggProfile(z0: number, z1: number, rMax: number, zw: number, n = 28, bottom = 0.0, top = 0.0): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    const u = z < zw ? (zw - z) / (zw - z0) : (z - zw) / (z1 - zw);
    const floor = z < zw ? bottom : top;
    pts.push([Math.max(floor * rMax * (1 - u) , rMax * Math.sqrt(Math.max(0, 1 - u ** 2.2))) + (i === 0 || i === n ? 0 : 0), z]);
  }
  return pts;
}

/** Shared skid-steer chassis for the characters: two wheels per side or three per side (tracks). */
function characterChassis(b: Build, o: { motor: string; perSide: 2 | 3; drivenPerSide: number; wheelbase: number; yFace: number; L: number; W: number; tracks?: boolean }) {
  const wheel = "wheel_90mm_37d", h = wheelInfo(wheel).r, zB = Math.ceil(h + MOTOR_TOP + 7);
  const d = deck(b, o.L, o.W, zB, [], 18);
  const xs = o.perSide === 3 ? [o.wheelbase / 2, 0, -o.wheelbase / 2] : [o.wheelbase / 2, -o.wheelbase / 2];
  for (const s of [1, -1] as const) {
    const side = s > 0 ? "left" : "right";
    if (o.tracks) {
      // one printed track frame per side: the drive motor in the middle, idlers fore and aft
      const plates: Op[] = [];
      let Tm: Mat4 | null = null;
      xs.forEach((x, i) => {
        const driven = o.perSide === 3 ? i === 1 : true;
        const st = wheelStation(b, { tag: `${side}_${["front", "middle", "rear"][i]}`, parent: "base_link", x, side: s, yFace: o.yFace, motor: driven ? o.motor : null, wheel, driven: true });
        plates.push(...st.plate(zB));
        if (driven) Tm = st.Tm;
      });
      // the track couples the idlers to the drive wheel: same angular speed (same wheel size)
      if (o.perSide === 3) for (const pos of ["front", "rear"]) {
        const j = b.A.spec.joints.find((x) => x.name === `${side}_${pos}_wheel_joint`);
        if (j) j.mimic = { joint: `${side}_middle_wheel_joint`, multiplier: 1, offset: 0 };
      }
      const y0 = s > 0 ? o.yFace : -o.yFace - 5, y1 = s > 0 ? o.yFace + 5 : -o.yFace;
      const xa = xs[xs.length - 1] - 22, xb = xs[0] + 22;
      plates.push({ op: "hull", of: [{ op: "box", min: [xa, y0, h - 15], max: [xb, y1, h + 10] }, { op: "box", min: [xa + 30, y0, zB - 5], max: [xb - 30, y1, zB] }] },
        { op: "box", min: [xa + 30, Math.min(s * (o.yFace - 36), s * (o.yFace + 5)), zB - 5], max: [xb - 30, Math.max(s * (o.yFace - 36), s * (o.yFace + 5)), zB], r: 4 });
      for (const x of xs) plates.push({ op: "hole", a: [x, y0 - 1, h], b: [x, y1 + 1, h], d: 14 });
      if (Tm) plates.push({ op: "keepout", key: o.motor, T: Tm });
      for (const dx of [-60, 0, 60]) plates.push({ op: "hole", a: [dx, s * (o.yFace - 18), zB - 6], b: [dx, s * (o.yFace - 18), zB + 1], d: 3.4 });
      b.printed(`${side}_track_frame`, "base_link", plates, "walle");
    } else {
      xs.forEach((x, i) => {
        const opts: WheelOpts = { tag: `${side}_${["front", "rear"][i]}`, parent: "base_link", x, side: s, yFace: o.yFace, motor: o.motor, wheel };
        deckBracket(b, wheelStation(b, opts), opts, zB);
      });
    }
  }
  return { ...d, zB, wheel, h };
}

/** Servo-driven joint with printed parts on both sides, reusing the arm builder's horn/cradle ops. */
function servoKey(staticNm: number) {
  for (const k of ["feetech_sts3215_c047", "feetech_sts3250", "dxl_xm430_w350"]) { const c = evaluate(k, staticNm); if (c.ok && c.continuous_ok) return k; }
  return "dxl_xm430_w350";
}

// ----------------------------------------------------------------------------------- WALL-E
export function designWallE(req: MobileRequest = {}): RobotSpecification {
  const sensors = defaults(req, ["camera", "imu"]);
  const payload = req.payloadKg ?? 0.1;
  const BL = 220, BW = 200, BH = 200, yFace = BW / 2 - 5;
  // arms stand off the body sides far enough for the clevis bearing cheek behind each shoulder servo
  const armMounts = [1, -1].map((s) => frame([-20, s * (BW / 2 + 48), 0], [1, 0, 0], [0, 0, -1]));
  const result = sizeAndBuild((motor, battery) => {
    const b = new Build(req.name ?? "walle_robot", "character_walle", req.prompt);
    const ch = characterChassis(b, { motor, perSide: 3, drivenPerSide: 1, wheelbase: 200, yFace, L: BL, W: BW, tracks: true });
    // body: five printed panels on the deck (the deck is the floor), open-frame corners
    const z0 = ch.top, z1 = z0 + BH, t = 4;
    const panel = (n: string, min: Vec3, max: Vec3, extra: Op[] = []) => b.printed(n, "base_link", [{ op: "box", min, max, r: 2 }, ...extra], "walle");
    panel("body_left", [-BL / 2, BW / 2 - t, z0], [BL / 2, BW / 2, z1]);
    panel("body_right", [-BL / 2, -BW / 2, z0], [BL / 2, -BW / 2 + t, z1]);
    panel("body_back", [-BL / 2, -BW / 2 + t, z0], [-BL / 2 + t, BW / 2 - t, z1]);
    // front: the "compactor door" with a recessed lower panel
    panel("body_front", [BL / 2 - t, -BW / 2 + t, z0], [BL / 2, BW / 2 - t, z1], [{ op: "box", min: [BL / 2 - 0.1, -BW / 2 + 20, z0 + 20], max: [BL / 2 + 3, BW / 2 - 20, z0 + 110], r: 4 },
      ...(sensors.includes("depth") ? depthOnWall(b, "base_link", BL / 2, 0, z1 - 40) : [])]);
    panel("body_top", [-BL / 2, -BW / 2, z1], [BL / 2, BW / 2, z1 + t], [{ op: "hole", a: [BL / 2 - 80, 0, z1 - 1], b: [BL / 2 - 80, 0, z1 + t + 1], d: 20 }]);
    b.A.fastener("M3 x 10 + printed corner cleats (body panels)", 24);
    const topSlots: Op[] = []; for (let k = 0; k < 13; k++) topSlots.push({ op: "cutbox", min: [-60, -60 + k * 9, z1 - 1], max: [40, -56 + k * 9, z1 + t + 1] });
    b.A.amendProgram("body_top", b.in("body_top", topSlots));
    // electronics inside the body on the deck
    const { items, compute } = electronicsFor(sensors.filter((x) => x !== "lidar"), 2, battery, sensors.includes("depth"), true);
    // battery, motor driver and regulator on the floor; computer, IMU and servo bus on a printed shelf
    const zs = z0 + 95, low = items.filter((i) => i.kind === "battery" || i.key === "cytron_mdd10a" || i.key === "buck_5v_5a"), high = items.filter((i) => !low.includes(i));
    // heavy parts in the rear of the floor: they balance the head when the neck leans forward
    // (rear 60 % of the floor when they fit there, the whole floor for the larger pack)
    try { electronicsBay(b, low, { x0: -BL / 2 + 8, x1: 30, y0: -BW / 2 + 8, y1: BW / 2 - 8 }, [], z0); }
    catch { electronicsBay(b, low, { x0: -BL / 2 + 8, x1: BL / 2 - 8, y0: -BW / 2 + 8, y1: BW / 2 - 8 }, [], z0); }
    b.printed("shelf", "base_link", [{ op: "box", min: [-BL / 2 + t + 0.5, -BW / 2 + t + 0.5, zs - 4], max: [BL / 2 - t - 0.5, BW / 2 - t - 0.5, zs], r: 3 },
], "printed_dark");
    b.A.fastener("M3 x 10 + printed cleats (shelf to side panels)", 4);
    electronicsBay(b, high, { x0: -BL / 2 + 8, x1: BL / 2 - 8, y0: -BW / 2 + 8, y1: BW / 2 - 8 }, [], zs);
    // the body panels close the compartment: back panel holds USB, switch and vents; the top panel comes off; leads leave through the neck hole
    { const zc = (z0 + z1) / 2, cw = partBox(b.A, "computer"), cx = (cw.lo[0] + cw.hi[0]) / 2, side = cw.lo[1] + cw.hi[1] >= 0 ? 1 : -1, ops: Op[] = [{ op: "cutbox", min: [-BL / 2 - 1, 40, zc - 11.2], max: [-BL / 2 + t + 1, 70.4, zc + 11.2] }];
      const sideName = side > 0 ? "body_left" : "body_right"; b.A.amendProgram(sideName, b.in(sideName, [{ op: "cutbox", min: [cx - 24, side > 0 ? BW / 2 - t - 1 : -BW / 2 - 1, zs + 8], max: [cx + 24, side > 0 ? BW / 2 + 1 : -BW / 2 + t + 1, zs + 26] }]));
      let vent = 0; for (let k = 0; k < 18; k++) { ops.push({ op: "cutbox", min: [-BL / 2 - 1, -70, z1 - 74 + k * 3.9], max: [-BL / 2 + t + 1, 70, z1 - 72.4 + k * 3.9] }); vent += 140 * 1.6; }
      b.A.amendProgram("body_back", b.in("body_back", ops));
      b.mount("body_back", "switch_kcd4", frame([-BL / 2, 55.2, zc], [-1, 0, 0], [0, 0, 1]), "main_switch", "main power switch");
      registerBay(b.A, { name: "body_bay", tub: "body_back", lid: "body_top", solids: ["body_back", "body_top", "body_front"], parent: "base_link", T: I4(), min: [-BL / 2 + t, -BW / 2 + t, z0 - 4], max: [BL / 2 - t, BW / 2 - t, z1], parts: items.map((i) => i.name), screws: 24, vent_area_mm2: Math.round(vent + 13 * 400), note: "the hollow body",
        exits: [{ id: "body_bay.neck", kind: "grommet", face: "lid", at: [BL / 2 - 80, 0, z1 + t], normal: [0, 0, 1], hole_mm: 20 }, { id: "body_bay.usb", kind: "usb", face: side > 0 ? "y+" : "y-", at: [cx, side * BW / 2, zs + 17], normal: [0, side, 0], hole_mm: 18 }, { id: "body_bay.switch", kind: "switch", face: "x-", at: [-BL / 2, 55.2, zc], normal: [-1, 0, 0], hole_mm: 22, part: "main_switch" }] }, b.H); }
    if (sensors.includes("imu")) b.sensor("imu_frame", "imu", "imu", translation([12.8, 11.35, 2]), { rate_hz: 400 });
    if (sensors.includes("lidar")) lidarMast(b, -BL / 2 + 40, 0, z1 + t, z1 + t, "body_top");
    // neck + head: pitch neck (the lift), pan and tilt, all serial-bus servos
    // the lift: neck pitch limited to -26 / +17 deg (forward lean less) so the head stays over the body and it cannot tip on a slope
    // sized for the binocular head (~0.38 kg with both eye cameras) on the tilt flange; after the head is built as real
    // links the check carries no extra payload, so the head is counted once
    const neck = attachArm(b, "neck", { dof: 3, kinds: ["P", "Y", "P"], gripper: false, payloadKg: 0.45, reachM: 0.16, basePlateMm: 70 }, "body_top", translation([BL / 2 - 80, 0, z1 + t]), "walle", { shoulder_pitch: [-0.45, 0.27] });
    neck.rec.tool = { ...neck.rec.tool, payload_kg: 0 };
    // binocular head on the tilt servo's tool flange
    const Tt = b.pose(neck.rec.tool.link), tip = apply(Tt, neck.rec.tool.xyz_m.map((v) => v * 1000) as Vec3);
    // the head rides on a plate rising from the tilt servo's tool flange, clear above the pan turret
    const ya = apply(Tt, [0, 0, 10])[1], yb = apply(Tt, [0, 0, 16])[1];
    const hx = tip[0] + 20, hz = tip[2] + 82;
    const head: Op[] = [];
    for (const s of [1, -1]) {
      head.push({ op: "hull", of: [{ op: "rod", a: [hx - 35, s * 34, hz], b: [hx + 15, s * 34, hz], r: 30 }, { op: "rod", a: [hx + 15, s * 36, hz + 2], b: [hx + 45, s * 40, hz + 6], r: 24 }] },
        { op: "hole", a: [hx + 20, s * 39, hz + 5], b: [hx + 50, s * 41, hz + 6], d: 34 });
    }
    head.push({ op: "box", min: [hx - 30, -12, hz - 12], max: [hx + 10, 12, hz + 12] },
      { op: "box", min: [tip[0] - 14, Math.min(ya, yb), tip[2] - 14], max: [tip[0] + 14, Math.max(ya, yb), hz - 20], r: 3 },
      { op: "box", min: [tip[0] - 14, Math.min(ya, yb, 0), hz - 28], max: [hx + 10, Math.max(ya, yb, 0), hz - 20], r: 3 });
    const headLink = "head";
    b.W.set(neck.rec.tool.link, Tt);
    const Th = Tt;
    b.A.printedLink(headLink, { name: headLink, ops: [{ op: "at", T: invert(Th), of: [...head, { op: "keepout", key: neckTiltKey(b), T: Tt }] }] }, { role: "head", material: "printed_dark" });
    b.A.fixed("head_mount", neck.rec.tool.link, headLink, I4()); b.W.set(headLink, Th);
    for (const s of [1, -1]) {
      const name = s > 0 ? "left_eye_camera" : "right_eye_camera";
      cameraModule(b, name, headLink, [hx + 30, s * 39, hz + 5]);
    }
    // arms: shoulder + elbow + gripper hand on each side, pointing forward from the body sides
    const armReq: ArmRequest = { dof: 2, kinds: ["P", "P"], gripper: true, payloadKg: payload, reachM: 0.24, basePlateMm: 60, ladder: "feetech" };
    for (const [i, s] of [1, -1].entries()) {
      const prefix = s > 0 ? "left_arm" : "right_arm";
      const T = mul(translation([0, 0, z0 + 120]), armMounts[i]);
      attachArm(b, prefix, armReq, s > 0 ? "body_left" : "body_right", T, "walle");
      // shoulder bracket: from the body side wall to the back of the arm's base plate
      const o = apply(T, [0, 0, 0]);
      b.printed(`${prefix}_shoulder`, s > 0 ? "body_left" : "body_right", [
        { op: "box", min: [o[0] - 12, s > 0 ? BW / 2 : o[1] - 30, o[2] - 30], max: [o[0], s > 0 ? o[1] + 30 : -BW / 2, o[2] + 30], r: 3 },
        { op: "hole", a: [o[0] - 13, o[1] - 20, o[2]], b: [o[0] + 1, o[1] - 20, o[2]], d: 3.4 }, { op: "hole", a: [o[0] - 13, o[1] + 20, o[2]], b: [o[0] + 1, o[1] + 20, o[2]], d: 3.4 }], "printed_dark");
    }
    const eng = engineer(b, { motor, wheel: ch.wheel, nDriven: 6, battery, compute, skid: true });
    return { b, eng, compute, battery };
  // WALL-E trundles at walking pace (~0.5 m/s): the 70:1 gearbox, which also keeps an on-the-spot turn of this tall,
  // six-wheel skid-steer body calm
  }, DRIVE_MOTORS.indexOf("pololu_37d_70to1_64cpr"));
  const { b } = result, A = b.A;
  wireMobile(b, result.compute, result.battery, sensors.filter((x) => x !== "lidar"));
  A.design.assumptions.push(
    "WALL-E's tracks are represented by three 90 mm wheels per side: the middle wheel of each side is driven by a gearmotor, the front and rear are idlers on 625 bearings. A real build wraps a printed or rubber track (or a T5 timing belt) round the three wheels, so traction and drive sizing use the full weight.",
    "The film's telescoping neck is replaced by a servo-driven pitch neck (the 'lift') with pan and tilt servos above it; the binoculars are two printed eye barrels with a Raspberry Pi Camera Module 3 in each (stereo pair).",
    "Arms: a shoulder and an elbow servo plus a one-servo gripper hand per side, reusing the arm designer's brackets; they are sized as mounted (pointing forward) for the hand payload.",
    "The body is five printed PETG panels bolted with corner cleats on the deck; no compactor mechanism.",
  );
  A.design.request = { ...req };
  const spec = A.finish(`WALL-E style tracked robot: ${A.design.performance.mass_kg} kg, ${A.design.performance.top_speed_m_s} m/s, pan/tilt/lift head with stereo cameras, two servo arms`);
  costing(b, spec, req.budget);
  return spec;
}
function neckTiltKey(b: Build) { const j = b.A.design.joints.find((x) => x.joint === "neck_wrist_pitch" || x.joint === "neck_elbow_pitch"); return j?.actuator ?? "feetech_sts3215_c047"; }

// -------------------------------------------------------------------------------------- EVA
export function designEva(req: MobileRequest = {}): RobotSpecification {
  const sensors = defaults(req, ["camera", "imu"]);
  const payload = req.payloadKg ?? 0.05;
  const R = 122, zEgg0 = 150, zEggW = 470, zEgg1 = 560, tShell = 2.4, SX = -62;
  const result = sizeAndBuild((motor, battery) => {
    const b = new Build(req.name ?? "eva_robot", "character_eva", req.prompt);
    const wheel = "wheel_90mm_37d", h = wheelInfo(wheel).r, zB = Math.ceil(h + MOTOR_TOP + 7), yFace = 90;
    // round aluminium deck (Ø 236) inside a dark skirt: the "hover" base
    const deckOps: Op[] = [{ op: "revolve", pts: [[0, zB], [118, zB], [118, zB + 3], [0, zB + 3]] },
      ...[1, -1].map((s) => ({ op: "cutbox", min: [-52, s > 0 ? yFace + 6 : -130, zB - 1], max: [52, s > 0 ? 130 : -yFace - 6, zB + 4] }) as Op)]; // wheel wells
    b.fabricated("base_link", null, deckOps, { density: ALU, material: "aluminium", item: "Ø 236 x 3 mm aluminium disc deck, laser cut (~$30)", usd: 30, role: "base" });
    b.deckTop = zB + 3;
    for (const s of [1, -1] as const) {
      const o: WheelOpts = { tag: s > 0 ? "left" : "right", parent: "base_link", x: 0, side: s, yFace, motor, wheel };
      deckBracket(b, wheelStation(b, o), o, zB);
    }
    for (const [t, x] of [["front_caster", 98], ["rear_caster", -98]] as const) ballCaster(b, t, x, 0, zB);
    // skirt halves: dark ring that hides the wheels, 6 mm off the floor
    // the wheel arch cuts the ring's full height, so each side is two arcs (front, rear), each screwed to the deck edge
    for (const s of [1, -1]) for (const f of [1, -1]) {
      b.printed(`skirt_${s > 0 ? "left" : "right"}_${f > 0 ? "front" : "rear"}`, "base_link", [
        { op: "revolve", pts: shellOutline([[124, 8], [124.5, 60], [121, zB + 3], [118, zB + 12]], 2.4) },
        { op: "cutbox", min: [-200, s > 0 ? -200 : 0, -10], max: [200, s > 0 ? 0 : 200, 300] }, { op: "cutbox", min: [-52, s > 0 ? 90 : -200, -10], max: [52, s > 0 ? 200 : -90, 97] }, // wheel arch
        { op: "cutbox", min: [f > 0 ? -200 : 0, -200, -10], max: [f > 0 ? 0 : 200, 200, 300] },
        ], "printed_dark");
    }
    b.A.fastener("M3 x 8 (skirt arcs to the deck edge)", 8);
    // electronics on the deck under the egg
    const { items, compute } = electronicsFor(sensors.filter((x) => x !== "lidar" && x !== "depth"), 2, battery, false, true);
    // battery, regulator, IMU and servo bus low on the deck; computer and motor driver on a shelf (the mid rib)
    const low = items.filter((i) => i.kind === "battery" || i.key === "buck_5v_5a" || i.key === "bno085_breakout" || i.key === "waveshare_bus_servo_adapter"), high = items.filter((i) => !low.includes(i));
    const lidarRes: Rect[] = sensors.includes("lidar") ? [{ x0: 14, x1: 80, y0: -33, y1: 33 }] : [];
    const lowTop = electronicsBay(b, low, { x0: -78, x1: 78, y0: -80, y1: 80 }, [{ x0: SX - 27, x1: SX + 27, y0: -27, y1: 27 }, ...lidarRes], b.deckTop);
    const lowLid = enclosure(b, low, { x0: -78, x1: 78, y0: -80, y1: 80 }, [{ x0: SX - 27, x1: SX + 27, y0: -27, y1: 27 }, ...lidarRes], b.deckTop, lowTop, "base_link", "electronics_enclosure", true, { growY: 36, maxR: 118 }) ?? lowTop + 8;
    // the skirt's inner lip steps round the enclosure's corners
    { const r = baysOf(b.A).find((x) => x.name === "electronics_enclosure"); if (r) for (const n of ["skirt_left_front", "skirt_left_rear", "skirt_right_front", "skirt_right_rear"]) b.A.amendProgram(n, b.in(n, [{ op: "cutbox", min: [r.min[0] - 4, r.min[1] - 4, b.deckTop - 1], max: [r.max[0] + 4, r.max[1] + 4, r.max[2] + 4] }])); }
    // lidar on the deck: it scans through the "hover" gap between the skirt and the egg
    if (sensors.includes("lidar")) lidarMast(b, 47, 0, b.deckTop, lowLid + 8.6 + Number(part("rplidar_c1").specs.scan_plane_z_mm) - 7);
    if (sensors.includes("imu")) b.sensor("imu_frame", "imu", "imu", translation([12.8, 11.35, 2]), { rate_hz: 400 });
    // spine: 20 mm aluminium tube (behind the centre, leaving the deck and shelf free) from the deck to the top rib
    b.fabricated("spine", "base_link", [{ op: "rod", a: [SX, 0, b.deckTop + 5], b: [SX, 0, zEgg1 - 27], r: 10 }, { op: "hole", a: [SX, 0, b.deckTop], b: [SX, 0, zEgg1], d: 16 }],
      { density: ALU, material: "aluminium", item: "20 x 2 mm aluminium tube, 0.45 m (~$8)", usd: 8 });
    b.printed("spine_foot", "base_link", [{ op: "box", min: [SX - 19.5, -19.5, b.deckTop], max: [SX + 19.5, 19.5, b.deckTop + 5], r: 6 }, { op: "rod", a: [SX, 0, b.deckTop], b: [SX, 0, b.deckTop + 40], r: 14 }, { op: "hole", a: [SX, 0, b.deckTop + 4], b: [SX, 0, b.deckTop + 41], d: 20.2 }], "printed_dark");
    const prof = eggProfile(zEgg0, zEgg1, R, zEggW, 32, 0.28, 0.25);
    const rAt = (z: number) => { for (let i = 1; i < prof.length; i++) if (prof[i][1] >= z) { const [r0, z0] = prof[i - 1], [r1, z1] = prof[i]; return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0); } return prof[prof.length - 1][0]; };
    // arms stand 44 mm off the shell: room for the clevis bearing cheek on the inside of each shoulder servo
    const zSeam = 355, zS = zEggW + 10, yS = rAt(zS) + 44;
    for (const [zr, nm] of [[zSeam, "rib_mid"], [zEgg1 - 30, "rib_top"]] as const) {
      const rr = rAt(zr) - tShell - (nm === "rib_top" ? 7 : 1.5);
      for (const s of [1, -1]) b.printed(`${nm}_${s > 0 ? "left" : "right"}`, "spine", [{ op: "revolve", pts: [[0, zr - 3], [rr, zr - 3], [rr, zr + 3], [0, zr + 3]] }, { op: "rod", a: [SX, 0, zr - 3], b: [SX, 0, zr - 15], r: 16 }, { op: "hole", a: [SX, 0, zr - 16], b: [SX, 0, zr + 4], d: 20.2 },
        { op: "cutbox", min: [-300, s > 0 ? -300 : 0, zr - 20], max: [300, s > 0 ? 0 : 300, zr + 10] }, ...(nm === "rib_top" ? [{ op: "lighten", a: [-rr * 0.55, s * rr * 0.4, zr], b: [rr * 0.55, s * rr * 0.4, zr], r: rr * 0.18, n: 2 } as Op] : [])]);
    }
    electronicsBay(b, high, { x0: -86, x1: 86, y0: -74, y1: 74 }, [{ x0: SX - 18, x1: SX + 18, y0: -18, y1: 18 }], zSeam + 3, "spine");
    // egg shell: two bands x two halves, each fits the bed
    const shell = shellOutline(prof, tShell);
    for (const [za, zb, band] of [[zEgg0 - 1, zSeam, "lower"], [zSeam, zEgg1 + 1, "upper"]] as const) for (const s of [1, -1]) {
      const ops: Op[] = [{ op: "revolve", pts: shell, seg: 96 }, { op: "cutbox", min: [-300, -300, -10], max: [300, 300, za] }, { op: "cutbox", min: [-300, -300, zb], max: [300, 300, 900] },
        { op: "cutbox", min: [-300, s > 0 ? -300 : 0, 0], max: [300, s > 0 ? 0 : 300, 900] }, { op: "hole", a: [SX, 0, 0], b: [SX, 0, 900], d: 22 }, { op: "cutbox", min: [-40, -26, zEgg1 - 45], max: [26, 26, 900] }, // spine hole, neck opening
        { op: "cutbox", min: [-17, s * rAt(zS) - 16, zS - 5], max: [17, s * rAt(zS) + 16, zS + 7] }]; // slot for the shoulder bracket
      b.printed(`shell_${band}_${s > 0 ? "left" : "right"}`, "spine", ops);
    }
    if (sensors.includes("lidar")) for (const n of ["shell_lower_left", "shell_lower_right"]) b.A.amendProgram(n, b.in(n, [{ op: "hole", a: [47, 0, zEgg0 - 2], b: [47, 0, zEgg0 + 26], d: 64 }]));   // the lidar's head stands in a notch in the egg's underside
    // the egg is the upper compartment: slots and a USB window in its back, leads down past the spine through a grommet in the mid rib
    { const cp = apply(b.pose("computer"), [40, 25, 0]), side = cp[1] >= 0 ? 1 : -1, cuts: Op[] = [{ op: "cutbox", min: [cp[0] - 24, side > 0 ? 70 : -300, zSeam + 10], max: [cp[0] + 24, side > 0 ? 300 : -70, zSeam + 28] }]; let vent = 0;
      for (let k = 0; k < 11; k++) { cuts.push({ op: "cutbox", min: [-300, -40, zSeam + 34 + k * 7], max: [-70, 40, zSeam + 37.2 + k * 7] }); vent += 80 * 3.2; }
      for (const n of ["shell_upper_left", "shell_upper_right"]) b.A.amendProgram(n, b.in(n, cuts));
      for (const n of ["rib_mid_left", "rib_mid_right"]) b.A.amendProgram(n, b.in(n, [{ op: "hole", a: [SX + 26, 0, zSeam - 6], b: [SX + 26, 0, zSeam + 6], d: 12 }]));
      registerBay(b.A, { name: "egg_bay", tub: "spine", lid: "shell_upper_left", solids: ["shell_upper_left", "shell_upper_right"], parent: "spine", T: I4(), min: [-100, -100, zSeam], max: [100, 100, zEgg1], parts: high.map((i) => i.name), screws: 8, vent_area_mm2: Math.round(vent), note: "the printed egg shell",
        exits: [{ id: "egg_bay.down", kind: "grommet", face: "floor", at: [SX + 26, 0, zSeam], normal: [0, 0, -1], hole_mm: 12 }, { id: "egg_bay.usb", kind: "usb", face: side > 0 ? "y+" : "y-", at: [cp[0], side * 100, zSeam + 19], normal: [0, side, 0], hole_mm: 18 }] }, b.H); }
    b.A.fastener("M3 x 8 + heat-set inserts (shell to ribs)", 16);
    b.A.buy("insert_m3", 16, "shell to ribs");
    // head: pan servo on top of the spine, egg-shaped head with a dark visor and the camera behind it
    const zTop = zEgg1 + 2;
    const panKey = servoKey(0.05);
    const zP = zTop + 14, Tpan = frame([0, 0, zP], [0, 0, 1], [1, 0, 0]);
    // servo cradle on the top rib through the top of the egg
    b.printed("neck_mount", "spine", [{ op: "cradle", key: panKey, T: Tpan, wall: 3 }, { op: "rod", a: [0, 0, zEgg1 - 26.9], b: [0, 0, zP - 40], r: 15 },
      { op: "box", min: [-24, -24, zEgg1 - 26.9], max: [24, 24, zEgg1 - 23], r: 5 }], "printed");
    b.mount("spine", panKey, Tpan, "head_pan_actuator", "head pan");
    b.servo("head_pan", "spine", "head", Tpan, panKey, -2.6, 2.6);
    const hz0 = zTop + 20, HR = 112, HH = 150;
    const headProf: [number, number][] = [];
    for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 24; headProf.push([HR * Math.cos(a), hz0 + HH / 2 + (HH / 2) * Math.sin(a)]); }
    const scaleX: Mat4 = mul(translation([0, 0, 0]), scaleM(0.9, 1, 1));
    // optional RGB-D camera low in the head, looking out through a window in shell and visor
    const dz = hz0 + 40, depthWindow: Op[] = sensors.includes("depth") ? [{ op: "cutbox", min: [40, -47, dz - 15], max: [140, 47, dz + 15] }] : [];
    const headOps: Op[] = [{ op: "at", T: scaleX, of: [{ op: "revolve", pts: shellOutline(headProf, 2.4), seg: 96 }] },
      { op: "horn", key: panKey, t: 4 } as Op, { op: "rod", a: [0, 0, zP], b: [0, 0, hz0 + 3], r: 14 }, { op: "hole", a: [0, 0, zP + 3], b: [0, 0, hz0 + 4], d: 9 },
      { op: "hole", a: [70, 0, hz0 + 70], b: [120, 0, hz0 + 70], d: 12 }, ...depthWindow];
    headOps[1] = { op: "at", T: Tpan, of: [{ op: "horn", key: panKey, t: 4 }] };
    b.A.printedLink("head", { name: "head", ops: b.in("head", headOps) }, { role: "head", material: "printed" });
    b.A.fastener("horn screws", 4);
    // visor: thin dark band on the front of the head
    const visor: Op[] = [{ op: "at", T: scaleX, of: [{ op: "revolve", pts: shellOutline(headProf.map(([r, z]) => [r + 3, z]), 1.5), seg: 96 }] },
      { op: "cutbox", min: [-300, -300, -10], max: [300, 300, hz0 + 32] }, { op: "cutbox", min: [-300, -300, hz0 + 118], max: [300, 300, 900] },
      { op: "cutbox", min: [-300, -300, 0], max: [40, 300, 900] }, { op: "hole", a: [70, 0, hz0 + 70], b: [130, 0, hz0 + 70], d: 12 }, ...depthWindow];
    // a thin curved band is not a print: vacuum-form it from 1.5 mm smoked PETG sheet over the printed head as the buck
    b.fabricated("visor", "head", visor, { density: 1270, material: "visor", item: "visor: vacuum-formed 1.5 mm smoked PETG sheet (the printed head is the forming buck, ~$8)", usd: 8 });
    for (const s of [1, -1]) b.printed(s > 0 ? "left_eye" : "right_eye", "head", [{ op: "at", T: frame([100.5, s * 30, hz0 + 78], [1, 0.2 * s, 0], [0, 0, 1]), of: [{ op: "box", min: [-9, -16, 0], max: [9, 16, 2.5], r: 8 }] }], "led");
    b.fab.push({ item: "two 8-LED WS2812 sticks behind translucent eye diffusers (~$8)", usd: 8 });
    cameraModule(b, "head_camera", "head", [86, 0, hz0 + 70]);
    if (sensors.includes("depth")) b.printed("depth_camera_bracket", "head", [{ op: "box", min: [44, -30, dz - 14], max: [49, 30, dz + 8], r: 3 },
      { op: "beam", a: [26, 0, hz0 + 14], b: [46, 0, dz - 10], w: 20, h: 8, up: [0, 1, 0] }, ...depthOnWall(b, "head", 49, 0, dz)]);
    b.printed("camera_bracket", "head", [{ op: "box", min: [70, -16, hz0 + 56], max: [74, 16, hz0 + 88], r: 2 }, { op: "box", min: [40, -16, hz0 + 56], max: [74, 16, hz0 + 60] }, bodyCut("rpi_camera_module_3", b.W.get("head_camera")!)]);
    // arms: two-servo fins hanging along the egg's sides
    for (const s of [1, -1]) {
      const prefix = s > 0 ? "left_arm" : "right_arm";
      const T = frame([0, s * yS, zS], [0, 0, -1], [1, 0, 0]);
      // fins swing +-63 deg: enough for EVA's gestures; a fully raised fin with a load (and every sensor fitted) would tip her on a slope
      attachArm(b, prefix, { dof: 2, kinds: ["P", "P"], gripper: false, payloadKg: payload, reachM: 0.2, basePlateMm: 46, ladder: "feetech" }, "spine", T, "printed", { shoulder_pitch: [-1.1, 1.1] });
      const ri = rAt(zS) - tShell;
      // shoulder bracket: clamps half the spine, runs out through a slot in the shell to the arm's base plate
      const y = (v: number) => s * v, lo = (a: number, c: number) => Math.min(y(a), y(c)), hi = (a: number, c: number) => Math.max(y(a), y(c));
      b.printed(`${prefix}_shoulder`, "spine", [
        { op: "hull", of: [{ op: "box", min: [SX - 16, lo(0.5, 16), zS], max: [SX + 16, hi(0.5, 16), zS + 4] }, { op: "box", min: [-14, lo(ri - 30, ri - 10), zS], max: [14, hi(ri - 30, ri - 10), zS + 4] }] },
        { op: "box", min: [-14, lo(ri - 12, yS - 20), zS], max: [14, hi(ri - 12, yS - 20), zS + 4] },
        { op: "box", min: [-23, y(yS) - 23, zS + 4], max: [23, y(yS) + 23, zS + 8], r: 4 },
        { op: "box", min: [-14, lo(yS - 22, yS - 18), zS], max: [14, hi(yS - 22, yS - 18), zS + 8] },
        { op: "rod", a: [SX, 0, zS - 10], b: [SX, 0, zS + 14], r: 16 }, { op: "cutbox", min: [SX - 20, s > 0 ? -20 : -0.5, zS - 11], max: [SX + 20, s > 0 ? 0.5 : 20, zS + 15] },
        { op: "hole", a: [SX, 0, zS - 11], b: [SX, 0, zS + 15], d: 20.2 }]);
    }
    const eng = engineer(b, { motor, wheel, nDriven: 2, battery, compute, casterMaxKg: Number(part("ball_caster_pololu_2692").specs.max_robot_mass_kg) });
    return { b, eng, compute, battery };
  });
  const { b } = result, A = b.A;
  wireMobile(b, result.compute, result.battery, sensors);
  A.design.assumptions.push(
    "EVA cannot hover: this EVA rolls on a hidden differential-drive base (two 37D gearmotors, two ball casters) under a dark skirt; the egg rides on a 20 mm aluminium spine above it, so the gap reads as the film's hover.",
    "The egg body is four printed PETG shell segments (two bands, two halves) screwed to two printed ribs on the spine; the head is one print (230 x 200 x 150 mm) with a dark visor band and two LED eye diffusers.",
    "The head turns on a single pan servo; the film's free-floating head tilt is not reproduced. The arms are two-servo fins hanging beside the egg (they cannot fold flush into the body like the film's).",
    "The camera looks out through a 12 mm hole in the visor centre.",
  );
  if (sensors.includes("depth")) A.design.assumptions.push("The RGB-D camera sits low in the head behind a window in the visor and runs on the Raspberry Pi 5 over USB 3 at reduced frame rate: the egg has no room for a Jetson.");
  if (sensors.includes("lidar")) A.design.assumptions.push("The lidar sits on the base deck and scans through the gap between the skirt and the egg; the spine shadows a narrow sector behind it.");
  A.design.request = { ...req };
  const spec = A.finish(`EVA-style companion robot: ${A.design.performance.mass_kg} kg, hidden diff-drive base, pan head with camera, two servo fins`);
  costing(b, spec, req.budget);
  return spec;
}

// ----------------------------------------------------------------------------------- Baymax
export function designBaymax(req: MobileRequest = {}): RobotSpecification {
  const sensors = defaults(req, ["camera", "imu"]);
  const payload = req.payloadKg ?? 0.1; // Baymax's arms hug and carry light things
  const zSh = 820, ySh = 190, splay = 25 * D2R;
  const result = sizeAndBuild((motor, battery) => {
    const b = new Build(req.name ?? "baymax_robot", "character_baymax", req.prompt);
    const ch = characterChassis(b, { motor, perSide: 2, drivenPerSide: 2, wheelbase: 300, yFace: 140, L: 380, W: 290 });
    const { items, compute } = electronicsFor(sensors.filter((x) => x !== "lidar"), 4, battery, sensors.includes("depth"), true);
    const lidarRes: Rect[] = sensors.includes("lidar") ? [{ x0: 110, x1: 176, y0: -33, y1: 33 }] : [];
    const lowTop = electronicsBay(b, items, { x0: -186, x1: 186, y0: -141, y1: 141 }, [{ x0: -36, x1: 36, y0: -36, y1: 36 }, ...lidarRes], ch.top);
    const bayTop = enclosure(b, items, { x0: -186, x1: 186, y0: -141, y1: 141 }, [{ x0: -36, x1: 36, y0: -36, y1: 36 }, ...lidarRes], ch.top, lowTop) ?? lowTop + 8;
    const scanZ = sensors.includes("lidar") ? lidarMast(b, 143, 0, ch.top, bayTop - 8) : 0;
    if (sensors.includes("imu")) b.sensor("imu_frame", "imu", "imu", translation([12.8, 11.35, 2]), { rate_hz: 400 });
    // spine: 2020 aluminium extrusion up to the shoulder yoke
    b.printed("spine_foot", "base_link", [{ op: "box", min: [-28, -28, ch.top], max: [28, 28, ch.top + 5], r: 6 }, { op: "box", min: [-14, -14, ch.top], max: [14, 14, ch.top + 40], r: 3 }, { op: "cutbox", min: [-10.2, -10.2, ch.top + 5], max: [10.2, 10.2, ch.top + 41] }], "printed_dark");
    b.fabricated("spine", "base_link", [{ op: "box", min: [-10, -10, ch.top + 5], max: [10, 10, zSh - 6] }],
      { density: ALU * 0.42, material: "aluminium", item: "2020 aluminium extrusion, 0.75 m (~$9)", usd: 9 });
    b.fabricated("shoulder_yoke", "spine", [{ op: "box", min: [-20, -ySh - 20, zSh - 6], max: [20, ySh + 20, zSh], r: 4 }],
      { density: ALU, material: "aluminium", item: `${2 * ySh + 40} x 40 x 6 mm aluminium flat bar shoulder yoke (~$12)`, usd: 12 });
    // arms hanging from the yoke, splayed out to clear the belly
    for (const s of [1, -1]) {
      const prefix = s > 0 ? "left_arm" : "right_arm";
      const z: Vec3 = [0, s * Math.sin(splay), -Math.cos(splay)];
      const T = frame([0, s * ySh, zSh - 22], z, [1, 0, 0]);
      b.printed(`${prefix}_shoulder_wedge`, "shoulder_yoke", [{ op: "hull", of: [{ op: "box", min: [-20, s * ySh - 30, zSh - 8], max: [20, s * ySh + 30, zSh - 6] },
        { op: "at", T, of: [{ op: "box", min: [-30, -30, -1], max: [30, 30, 0] }] }] }, { op: "hole", a: [0, s * ySh - 12, zSh - 30], b: [0, s * ySh - 12, zSh + 1], d: 5.5 }, { op: "hole", a: [0, s * ySh + 12, zSh - 30], b: [0, s * ySh + 12, zSh + 1], d: 5.5 }], "printed");
      // sized with the mitten and sleeves (about 0.18 kg) added to the hand payload; once they exist as real links the
      // check carries only the object in the hand, so their mass is not counted twice
      const arm = attachArm(b, prefix, { dof: 4, kinds: ["Y", "P", "P", "P"], gripper: false, payloadKg: payload + 0.18, reachM: 0.34, basePlateMm: 70 }, "shoulder_yoke", T, "fabric");
      arm.rec.tool = { ...arm.rec.tool, payload_kg: payload };
      // fabric sleeves over the upper arm and forearm (Baymax's soft limbs) and a foam mitten on the wrist
      const jp = fk(b.A.spec).joint, c0 = apply(T, [0, 0, 0]);
      const along = (j: string) => { const p = jp[`${prefix}_${j}`].p.map((v) => v * 1000); return (p[0] - c0[0]) * z[0] + (p[1] - c0[1]) * z[1] + (p[2] - c0[2]) * z[2]; };
      const onAxis = (d: number): Vec3 => [c0[0] + z[0] * d, c0[1] + z[1] * d, c0[2] + z[2] * d];
      const dS = along("shoulder_pitch"), dE = along("elbow_pitch"), dW = along("wrist_pitch");
      // sleeve radius clears the clevis links (bearing cheeks and truss beams) with a few mm of foam
      for (const [link, d0, d1, R] of [["upper_arm", dS, dE, 58], ["forearm", dE, dW, 52]] as const) {
        const nm = `${prefix}_${link}`; b.W.set(nm, b.pose(nm));
        b.fabricated(`${nm}_sleeve`, nm, [{ op: "at", T: frame(onAxis(d0 + 4), z, [1, 0, 0]), of: [{ op: "revolve", pts: shellOutline([[R - 12, 0], [R, 14], [R, d1 - d0 - 22], [R - 12, d1 - d0 - 8]], 1.2), seg: 64 }] }],
          { density: 0, massKg: 0.04, material: "fabric", item: `${link} fabric sleeve (in the cover kit)`, usd: 0, role: "cover" });
      }
      const tool = b.arms[b.arms.length - 1].tool, Tt = b.pose(tool.link);
      b.W.set(tool.link, Tt);
      const m0 = onAxis(dW + 34), m1 = onAxis(dW + 120);
      // the payload is held in the mitten, not on the wrist axis
      tool.xyz_m = apply(invert(Tt), onAxis(dW + 80)).map((v) => +(v / 1000).toFixed(5)) as Vec3;
      b.fabricated(`${prefix}_mitten`, tool.link, [{ op: "hull", of: [{ op: "rod", a: m0, b: onAxis(dW + 80), r: 34 }, { op: "rod", a: onAxis(dW + 60), b: m1, r: 26 }] },
        { op: "keepout", key: b.A.design.joints.find((j) => j.joint === `${prefix}_wrist_pitch`)?.actuator ?? "feetech_sts3215_c047", T: Tt },
        { op: "at", T: frame(m0, z, [1, 0, 0]), of: [{ op: "cutbox", min: [-60, -60, -60], max: [60, 60, -16] }] }],
        { density: 0, massKg: 0.09, material: "fabric", item: "foam-filled fabric mitten on a printed wrist plate (in the cover kit)", usd: 0, role: "hand" });
    }
    // head: pan servo on the yoke centre, printed head shell with two eyes and a camera
    const panKey = servoKey(0.08);
    const Tpan = frame([0, 0, zSh + 46], [0, 0, 1], [1, 0, 0]);
    b.printed("neck_mount", "shoulder_yoke", [{ op: "cradle", key: panKey, T: Tpan, wall: 3 }, { op: "box", min: [-26, -24, zSh], max: [26, 24, zSh + 6], r: 4 }], "printed");
    b.mount("shoulder_yoke", panKey, Tpan, "head_pan_actuator", "head pan");
    b.servo("head_pan", "shoulder_yoke", "head", Tpan, panKey, -1.4, 1.4);
    const hz0 = zSh + 60, HR = 108, HH = 132;
    const headProf: [number, number][] = [];
    for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 24; headProf.push([HR * Math.cos(a), hz0 + HH / 2 + (HH / 2) * Math.sin(a)]); }
    const sx = mul(translation([0, 0, 0]), scaleM(0.78, 1, 1));
    const head: Op[] = [{ op: "at", T: sx, of: [{ op: "revolve", pts: shellOutline(headProf, 2.4), seg: 96 }] }, { op: "at", T: Tpan, of: [{ op: "horn", key: panKey, t: 4 }] },
      { op: "rod", a: [0, 0, zSh + 50], b: [0, 0, hz0 + 3], r: 14 }, { op: "hole", a: [0, 0, zSh + 49], b: [0, 0, hz0 + 4], d: 9 }, { op: "hole", a: [60, 0, hz0 + 68], b: [100, 0, hz0 + 68], d: 12 }];
    // eyes and the line between them: black decal inlays following the head's surface
    const surfX = (y: number, dz: number) => 0.78 * Math.sqrt(HR * HR * (1 - (dz / (HH / 2)) ** 2) - y * y);
    const eyeOps: Op[] = [];
    for (const y of [-28, 28]) { const x = surfX(Math.abs(y) + 11, 2) - 0.6; eyeOps.push({ op: "rod", a: [x, y, hz0 + 68], b: [surfX(Math.abs(y), 2) + 1.2, y, hz0 + 68], r: 11 }); }
    for (let y = -20; y <= 20; y += 8) eyeOps.push({ op: "box", min: [surfX(Math.abs(y) + 4, 2) - 0.2, y - 4, hz0 + 66.5], max: [surfX(Math.abs(y), 2) + 1, y + 4, hz0 + 69.5] });
    // matching pockets in the head shell so the inlays sit flush
    for (const o of eyeOps) head.push(o.op === "rod" ? { op: "hole", a: o.a, b: o.b, d: 2 * o.r } : { op: "cutbox", min: (o as { min: Vec3 }).min, max: (o as { max: Vec3 }).max });
    // a closed egg has no face to print on: split at the equator. The lower half (with the horn and neck) is the head
    // link and prints on its rim; the dome prints on its rim. A lip on the lower half locates the dome; four internal
    // tabs take M3 screws.
    const ze = hz0 + HH / 2 + 14, tabs: Op[] = [], tabsTop: Op[] = []; // seam above the eye inlays
    const Re = HR * Math.sqrt(1 - (14 / (HH / 2)) ** 2); // shell radius at the seam
    for (let k = 0; k < 4; k++) {
      // tabs bridge from the shell wall inward (hull of an inner and an outer block), the lower ones below the seam (they
      // merge with the lip), the dome's above the lip; an M3 x 12 joins each pair
      const a = Math.PI / 4 + (k * Math.PI) / 2, at = (r: number): [number, number] => [0.78 * r * Math.cos(a), r * Math.sin(a)];
      const [ix, iy] = at(Re - 20), [ox, oy] = at(Re - 1.5), [hx, hy] = at(Re - 15);
      const blk = (x: number, y: number, z0: number, z1: number): Op => ({ op: "box", min: [x - 5, y - 5, z0], max: [x + 5, y + 5, z1] });
      tabs.push({ op: "hull", of: [blk(ix, iy, ze - 8, ze - 1.3), blk(ox, oy, ze - 8, ze - 1.3)] }, { op: "hole", a: [hx, hy, ze - 9], b: [hx, hy, ze + 1], d: 2.6 });
      tabsTop.push({ op: "hull", of: [blk(ix, iy, ze + 4.6, ze + 11), blk(ox, oy, ze + 4.6, ze + 11)] }, { op: "hole", a: [hx, hy, ze + 3], b: [hx, hy, ze + 12], d: 3.4 });
    }
    // each half is revolved from its own half of the profile (open shells with flat rims), so the lip survives
    const rAtZ = (z: number) => HR * Math.sqrt(Math.max(0, 1 - ((z - (hz0 + HH / 2)) / (HH / 2)) ** 2));
    // rims 0.8 mm either side of the seam: the shell offset leans with the egg's slope, so a smaller gap closes up
    const half = (lo: boolean): [number, number][] => lo ? [...headProf.filter(([, z]) => z < ze - 0.8), [rAtZ(ze - 0.8), ze - 0.8]] : [[rAtZ(ze + 0.8), ze + 0.8], ...headProf.filter(([, z]) => z > ze + 0.8)];
    const lowerShell: Op = { op: "at", T: sx, of: [{ op: "revolve", pts: shellOutline(half(true), 2.4), seg: 96 }] };
    const upperShell: Op = { op: "at", T: sx, of: [{ op: "revolve", pts: shellOutline(half(false), 2.4), seg: 96 }] };
    const lip: Op = { op: "at", T: sx, of: [{ op: "revolve", pts: [[Re - 6.4, ze - 6], [Re - 1.2, ze - 6], [Re - 1.2, ze], [Re - 3.2, ze], [rAtZ(ze + 4) - 4.2, ze + 4], [rAtZ(ze + 4) - 7.4, ze + 4]] /* tapers with the egg */, seg: 96 }] };
    b.A.printedLink("head", { name: "head", ops: b.in("head", [lowerShell, ...head.slice(1), ...tabs, lip]) }, { role: "head", material: "fabric" });
    // dome: its inner wall clears the lip by 0.6 mm; eye and camera pockets carry over
    const domeOps: Op[] = [upperShell, ...head.slice(1).filter((o) => o.op === "hole" || o.op === "cutbox"), ...tabsTop];
    b.printed("head_dome", "head", domeOps, "fabric");
    b.A.fastener("horn screws", 4);
    b.A.fastener("M3 x 10 (head dome to head)", 4);
    b.printed("eyes", "head", eyeOps, "visor");
    cameraModule(b, "head_camera", "head", [70, 0, hz0 + 68]);
    b.printed("camera_bracket", "head", [{ op: "box", min: [55, -16, hz0 + 46], max: [59, 16, hz0 + 86], r: 2 }, { op: "box", min: [30, -16, hz0 + 46], max: [59, 16, hz0 + 50] }, bodyCut("rpi_camera_module_3", b.W.get("head_camera")!)]);
    // soft cover: sewn ripstop body (his round belly, tucked in at the hem over the chassis) zipped over the frame; negligible structure
    const prof: [number, number][] = [[276, 58], [287, 110], [295, 180], [297, 260], [289, 340], [271, 420], [246, 500], [218, 590], [186, 680], [150, 760], [112, 815], [85, 848], [70, zSh + 30]];
    b.fabricated("soft_cover", "spine", [{ op: "at", T: scaleM(0.9, 1, 1), of: [{ op: "revolve", pts: shellOutline(prof, 1.5), seg: 96 }] },
      ...(scanZ ? [{ op: "cutbox", min: [-400, -400, scanZ - 10], max: [400, 400, scanZ + 10] } as Op] : []),
      ...[1, -1].map((s) => ({ op: "cutbox", min: [-62, s > 0 ? 105 : -300, 560], max: [62, s > 0 ? 300 : -105, 900] }) as Op), // armholes
      ...(sensors.includes("depth") ? [{ op: "cutbox", min: [140, -34, 566], max: [220, 34, 616] } as Op] : [])],
      { density: 0, massKg: 0.55, material: "fabric", item: "sewn white ripstop body cover with zip and foam lining, about 2 m^2 (~$60)", usd: 60, role: "cover" });
    if (sensors.includes("depth")) {
      // chest camera on a printed arm clamped to the extrusion with T-nuts, looking out through the cover
      const zc = 600, xw = 0.9 * 210;
      b.printed("chest_camera_arm", "spine", [{ op: "box", min: [10, -16, zc - 30], max: [xw, 16, zc - 24] }, { op: "box", min: [xw - 5, -30, zc - 30], max: [xw, 30, zc + 14], r: 3 },
        { op: "box", min: [10, -16, zc - 30], max: [14, 16, zc + 10] }, ...depthOnWall(b, "spine", xw, 0, zc)], "printed");
      b.A.fastener("M5 T-nut + M5 x 10 (camera arm to 2020)", 2);
    }
    const eng = engineer(b, { motor, wheel: ch.wheel, nDriven: 4, battery, compute, skid: true });
    return { b, eng, compute, battery };
  });
  const { b } = result, A = b.A;
  wireMobile(b, result.compute, result.battery, sensors);
  A.design.assumptions.push(
    "Baymax's inflatable vinyl body is a sewn ripstop cover with a foam-lined zip, bought or sewn, with negligible structural role; it hangs on the shoulder yoke and hides a 4WD skid-steer base. It is not inflated, so it does not cushion like the film's.",
    "Structure: 2020 aluminium extrusion spine and a 6 mm aluminium shoulder yoke; arms are four servos each (shoulder yaw, shoulder pitch, elbow, wrist) splayed 25 deg so they clear the belly; the hands are printed mittens covered with the same fabric.",
    `Each arm is sized as mounted to lift ${payload} kg in the mitten at full reach; the tipping check includes both arms stretched forward with that payload.`,
    "The head turns on one pan servo; a camera looks out between the eyes through a 12 mm hole.",
  );
  A.design.request = { ...req };
  A.design.performance.height_m = +((820 + 60 + 132) / 1000).toFixed(2);
  const spec = A.finish(`Baymax-style service robot: ${A.design.performance.mass_kg} kg, ${A.design.performance.height_m} m tall, 4WD hidden base, two 4-servo arms, pan head with camera`);
  costing(b, spec, req.budget);
  return spec;
}

export const MOBILE_DESIGNERS = { designDiffDrive, designFourWheel, designMecanum, designRover, designWallE, designEva, designBaymax };

