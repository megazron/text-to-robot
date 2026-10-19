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

export type MobileSensor = "camera" | "depth" | "lidar" | "imu";
export interface MobileRequest {
  name?: string; prompt?: string; budget?: number;
  /** cargo on the deck (bases) or payload in each hand (robots with arms), kg */
  payloadKg?: number;
  sensors?: MobileSensor[];
  wheels?: number;
  arm?: { dof: number; reachM?: number; payloadKg?: number };
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
  constructor(name: string, family: string, prompt?: string) {
    this.A = new Assembly(name, family, prompt);
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
  const post: Op[] = [{ op: "box", min: [x - 21, y - 21, H], max: [x + 21, y + 21, deckBottom], r: 8 },
    { op: "cutbox", min: [x - 15, y - 15, H + 4], max: [x + 15, y + 15, deckBottom - 4] }];
  for (const h of c.holes) post.push({ op: "hole", a: [x + h.pos[0], y + h.pos[1], H - 1], b: [x + h.pos[0], y + h.pos[1], H + 4.5], d: 3.4 });
  for (const dx of [-13, 13]) post.push({ op: "hole", a: [x + dx, y + 13, deckBottom - 4.5], b: [x + dx, y + 13, deckBottom + 1], d: 3.4 });
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
interface Item { key: string; name: string; use: string; yawOk?: boolean; kind: "board" | "battery"; margin?: [number, number, number, number] }
interface Rect { x0: number; x1: number; y0: number; y1: number }
const overlaps = (a: Rect, c: Rect) => a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1;

/** Footprint (component frame, mm) of an item including plugs / leads / tool access: [-x, +x, -y, +y] margins. */
function footprint(it: Item) {
  const bb = part(it.key).bbox_mm!;
  const m = it.margin ?? (it.kind === "battery" ? [30, 5, 5, 5] : [4, 4, 4, 4]);
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
/**
 * Place every item on the deck area without overlap and build its printed standoff plate or battery
 * tray. Returns the highest point reached above the deck.
 */
function electronicsBay(b: Build, items: Item[], area: Rect, reserved: Rect[], deckTop: number, parent = "base_link"): number {
  const plan = packBay(items, area, reserved);
  if (!plan) throw new Error(`electronics bay: ${items.map((i) => i.key).join(", ")} do not fit on ${JSON.stringify(area)}`);
  let top = deckTop;
  for (const { it, yaw, x, y } of plan) {
    const fp = footprint(it);
    const fpMin = yaw ? [-fp.max[1], fp.min[0]] : [fp.min[0], fp.min[1]];
    const holeZ = Math.min(0, ...part(it.key).holes.map((h) => h.pos[2]));
    const z = it.kind === "battery" ? deckTop + 3 : deckTop + 7 - holeZ;
    const T = at(rotZ(yaw), [x - fpMin[0], y - fpMin[1], z]);
    b.mount(parent, it.key, T, it.name, it.use);
    top = Math.max(top, z + part(it.key).bbox_mm!.max[2]);
    b.printed(`${it.name}_tray`, parent, it.kind === "battery" ? batteryTray(it.key, T) : standoffPlate(it.key, T, deckTop), "printed_dark");
    b.A.fastener(it.kind === "battery" ? "20 mm hook-and-loop battery strap" : "M2.5 x 6 screws (board to standoffs)", it.kind === "battery" ? 1 : part(it.key).holes.length);
    b.A.fastener("M3 x 8 socket head (tray to deck)", 2);
  }
  return top;
}
function boardOutline(key: string, T: Mat4) {
  const bb = part(key).bbox_mm!, pts = [[bb.min[0], bb.min[1]], [bb.max[0], bb.min[1]], [bb.min[0], bb.max[1]], [bb.max[0], bb.max[1]]].map(([x, y]) => apply(T, [x, y, 0]));
  return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) };
}
function standoffPlate(key: string, T: Mat4, deckTop: number): Op[] {
  const o = boardOutline(key, T), holes = part(key).holes.map((h) => apply(T, h.pos));
  const ops: Op[] = [{ op: "box", min: [o.x0 + 2, o.y0 + 2, deckTop], max: [o.x1 - 2, o.y1 - 2, deckTop + 3], r: 3 }];
  for (const p of holes) ops.push({ op: "rod", a: [p[0], p[1], deckTop + 2.9], b: [p[0], p[1], p[2]], r: 3.2 });
  for (const p of holes) ops.push({ op: "hole", a: [p[0], p[1], deckTop + 1], b: [p[0], p[1], p[2] + 0.5], d: 2.2 });
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
    { op: "box", min: [0, -W / 2 - 3, -3], max: [L + 3, W / 2 + 3, 0] },
    { op: "box", min: [L * 0.1, -W / 2 - 3.6, -0.1], max: [L * 0.9, -W / 2 - 0.6, H * 0.5] },
    { op: "box", min: [L * 0.1, W / 2 + 0.6, -0.1], max: [L * 0.9, W / 2 + 3.6, H * 0.5] },
    { op: "box", min: [L + 0.6, -W / 4, -0.1], max: [L + 3.6, W / 4, H * 0.6] },
    { op: "cutbox", min: [L * 0.45, -W / 2 - 5, -4], max: [L * 0.45 + 22, W / 2 + 5, -1.5] }, // strap channel
    { op: "hole", a: [L * 0.2, 0, -4], b: [L * 0.2, 0, 1], d: 3.4 }, { op: "hole", a: [L * 0.8, 0, -4], b: [L * 0.8, 0, 1], d: 3.4 },
  ];
  return [{ op: "at", T, of: loc }];
}

/** Compute + power electronics for a 3S robot. */
function electronicsFor(sensors: MobileSensor[], motors: number, battery: [string, number], heavy: boolean, servoBus: boolean): { items: Item[]; compute: string } {
  const compute = sensors.includes("depth") || heavy ? "jetson_orin_nano_super" : "rpi5";
  const items: Item[] = [];
  for (let i = 0; i < battery[1]; i++) items.push({ key: battery[0], name: battery[1] > 1 ? `battery_${i + 1}` : "battery", use: "main battery", kind: "battery", yawOk: true });
  items.push({ key: compute, name: "computer", use: "on-board computer", kind: "board", margin: compute === "rpi5" ? [16, 20, 3, 8] : [5, 5, 26, 5] });
  for (let i = 0; i < Math.ceil(motors / 2); i++) items.push({ key: "cytron_mdd10a", name: `motor_driver_${i + 1}`, use: "dual DC motor driver", kind: "board", margin: [4, 4, 4, 14] });
  if (compute === "rpi5" || servoBus) items.push({ key: "buck_5v_5a", name: "regulator_5v", use: "5 V rail for the computer / USB", kind: "board" });
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

/** Design an arm (or neck) for a mount orientation: escalate the servo family until it holds the payload in place. */
function sizeArm(req: ArmRequest, Rmount: Mat4): RobotSpecification {
  const g: Vec3 = [-Rmount[2] * G, -Rmount[6] * G, -Rmount[10] * G]; // world -z in the arm base frame
  const ladders: Ladder[] = req.ladder ? [req.ladder] : ["feetech", "dynamixel"];
  let spec: RobotSpecification | null = null;
  for (const ladder of ladders) {
    spec = designArm({ ...req, ladder });
    const tool = (spec.metadata as any).design.tool;
    const loads: PointLoad[] = tool ? [{ link: tool.link, at: tool.xyz_m, massKg: tool.payload_kg }] : [];
    const js = spec.joints.filter((j) => j.type === "revolute" && j.name !== "gripper");
    let grid: Record<string, number>[] = [{}];
    for (const j of js) grid = grid.flatMap((q) => [...new Set([-Math.PI / 2, 0, Math.PI / 2].map((v) => clampTo(j, v)))].map((v) => ({ ...q, [j.name]: v })));
    const worst: Record<string, number> = {};
    for (const q of grid) for (const [k, v] of Object.entries(gravityTorques(spec, q, loads, g))) worst[k] = Math.max(worst[k] ?? 0, v);
    const recs = (spec.metadata as any).design.joints as { joint: string; actuator: string }[];
    if (recs.every((r) => { const c = evaluate(r.actuator, worst[r.joint] ?? 0); return c.ok && c.continuous_ok; })) return spec;
  }
  return spec!;
}
function attachArm(b: Build, prefix: string, req: ArmRequest, parent: string, Tw: Mat4, material?: string) {
  const R: Mat4 = [...Tw]; R[12] = R[13] = R[14] = 0;
  const spec = sizeArm(req, R);
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
  const fab = b.fab.reduce((s, f) => s + f.usd, 0) + 15; // + switch, fuse, wiring, connectors
  const total = bought + filament + fasteners + fab;
  d.performance.cost_usd = Math.round(total);
  d.performance.cost_breakdown = `catalog parts $${bought.toFixed(0)}, filament ${(printedKg * 1.15).toFixed(2)} kg $${filament.toFixed(0)}, fasteners $${fasteners.toFixed(0)}, fabricated/other $${fab.toFixed(0)} (${[...b.fab.map((f) => f.item), "power switch, 15 A fuse, wiring"].join("; ")})`;
  if (budget !== undefined) d.checks.push({ name: "budget", pass: total <= budget, detail: `estimated $${total.toFixed(0)} vs budget $${budget}` });
  return total;
}

/**
 * Choose drive motor and battery from the robot as built: build with a guess, compute the loads and
 * power of that robot, move up the ladders until both pass, rebuild, repeat until the choice is stable.
 */
function sizeAndBuild<T extends { b: Build; eng: ReturnType<typeof engineer> }>(build: (motor: string, battery: [string, number]) => T): T {
  let mi = 0, bi = 0, out: T | null = null;
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
const BED = [250, 220, 210];
const fitsBed = (dims: number[]) => { const s = [...dims].sort((a, c) => c - a); return s.every((v, i) => v <= BED[i]); };
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

function defaults(req: MobileRequest, sensors: MobileSensor[]) { return req.sensors?.length ? [...new Set(req.sensors)] : sensors; }

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
    const L = kind === "diff" ? 244 : 300, W = 2 * (yFace + 5);
    deck(b, L, W, zB, [], kind === "diff" ? 60 : 20);
    const stations: WheelOpts[] = kind === "diff"
      ? [1, -1].map((s) => ({ tag: s > 0 ? "left" : "right", parent: "base_link", x: 0, side: s as 1 | -1, yFace, motor, wheel }))
      : [[90, 1, "front_left"], [90, -1, "front_right"], [-90, 1, "rear_left"], [-90, -1, "rear_right"]].map(([x, s, t]) => ({ tag: String(t), parent: "base_link", x: Number(x), side: Number(s) as 1 | -1, yFace, motor, wheel }));
    for (const o of stations) deckBracket(b, wheelStation(b, o), o, zB);
    if (kind === "diff") for (const [t, x] of [["front_caster", 92], ["rear_caster", -92]] as const) ballCaster(b, t, x, 0, zB);
    const { items, compute } = electronicsFor(sensors, stations.length, battery, false, false);
    const top = b.deckTop;
    const front = L / 2, reserved: Rect[] = [];
    const lidarAt: [number, number] = [-L / 2 + 36, 0];
    if (sensors.includes("lidar")) reserved.push({ x0: lidarAt[0] - 33, x1: lidarAt[0] + 33, y0: -33, y1: 33 });
    if (sensors.includes("depth")) reserved.push({ x0: front - 50, x1: front, y0: -34, y1: 34 });
    if (sensors.includes("camera")) reserved.push({ x0: front - 24, x1: front, y0: sensors.includes("depth") ? 36 : -20, y1: sensors.includes("depth") ? 70 : 20 });
    const clear = electronicsBay(b, items, { x0: -L / 2 + 4, x1: L / 2 - 4, y0: -W / 2 + 4, y1: W / 2 - 4 }, reserved, top);
    if (sensors.includes("lidar")) lidarMast(b, lidarAt[0], lidarAt[1], top, clear);
    if (sensors.includes("depth")) depthCamera(b, front - 14, 0, top + 40, top);
    if (sensors.includes("camera")) {
      const y = sensors.includes("depth") ? 52 : 0, x = front - 14;
      const T = cameraModule(b, "front_camera", "base_link", [x + 10, y, top + 30]);
      b.printed("front_camera_bracket", "base_link", [{ op: "box", min: [x - 6, y - 16, top], max: [x, y + 16, top + 45], r: 2 },
        { op: "box", min: [x - 6, y - 16, top], max: [x + 8, y + 16, top + 4], r: 2 }, { op: "box", min: [x - 6, y - 15, top + 18], max: [x + 9.3, y + 15, top + 42] }, bodyCut("rpi_camera_module_3", T),
        { op: "hole", a: [x + 4, y, top - 1], b: [x + 4, y, top + 5], d: 3.4 }], "printed_dark");
    }
    if (sensors.includes("imu")) b.sensor("imu_frame", "imu", "imu", translation([12.8, 11.35, 2]), { rate_hz: 400 });
    // cargo sits on the deck top over the centre
    const extraLoads: PointLoad[] = cargo > 0 ? [{ link: "base_link", at: [0, 0, (top + 40) / 1000], massKg: cargo }] : [];
    const eng = engineer(b, { motor, wheel, nDriven: stations.length, battery, compute, eff: kind === "mecanum" ? 0.85 : 1, skid: kind === "four", casterMaxKg: kind === "diff" ? Number(part("ball_caster_pololu_2692").specs.max_robot_mass_kg) : undefined, extraMassKg: cargo, extraLoads });
    return { b, eng, compute };
  });
  const { b, compute } = result;
  const A = b.A;
  A.design.performance.cargo_kg = cargo;
  A.design.assumptions.push(
    `Drive sized for the robot plus ${cargo} kg cargo on a ${DRIVE_REQ.slopeDeg} deg slope accelerating at ${DRIVE_REQ.accel} m/s^2, rolling resistance ${DRIVE_REQ.crr}; motors compared at their continuous (not stall) rating.`,
    "All motors and servos are 12 V parts run straight from a 3S LiPo (9.9-12.6 V); a power switch, 15 A blade fuse and XT60 wiring are budgeted as a lump sum.",
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
  const armMount = translation([30, 0, zBody + BH + 3]);
  const armSpec = armReq ? sizeArm({ dof: armReq.dof, reachM: armReq.reachM ?? 0.35, payloadKg: payload, budget: req.budget, ladder: "feetech", basePlateMm: 100 }, I4()) : null;
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
      if (s > 0) b.passiveHinge(`${side}_rocker_pivot`, "base_link", rocker, Tp, -0.35, 0.35);
      else { b.A.fixed(`${side}_rocker_pivot`, "base_link", rocker, b.local("base_link", Tp)); b.W.set(rocker, Tp); }
      const ry0 = s > 0 ? 110 : -124.5, ry1 = s > 0 ? 124.5 : -110;
      const front = wheelStation(b, { tag: `${side}_front`, parent: rocker, x: xF, side: s, yFace, motor, wheel });
      const rOps: Op[] = [
        { op: "rod", a: [pivot[0], ry0, pivot[2]], b: [pivot[0], ry1, pivot[2]], r: 18 },
        { op: "beam", a: [pivot[0], (ry0 + ry1) / 2, pivot[2]], b: [xF, (ry0 + ry1) / 2, h + 28], w: 22, h: 14.5, up: [0, 1, 0] },
        { op: "box", min: [xF - 22, ry0, h + 14], max: [xF + 22, ry1, h + 32], r: 4 },
        ...front.plate(h + 32),
        { op: "hole", a: [pivot[0], ry0 - 1, pivot[2]], b: [pivot[0], ry1 + 1, pivot[2]], d: 8.4 },
        { op: "hole", a: [pivot[0], s > 0 ? 116 : -124.6, pivot[2]], b: [pivot[0], s > 0 ? 124.6 : -116, pivot[2]], d: 22.1 },
        { op: "keepout", key: motor, T: front.Tm },
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
          { op: "box", min: [-xF - 22, ry0, h + 14], max: [-xF + 22, ry1, h + 32], r: 4 }, ...rear.plate(h + 32), { op: "keepout", key: motor, T: rear.Tm },
          { op: "hole", a: [pivot[0], ry0 - 1, pivot[2]], b: [pivot[0], ry1 + 1, pivot[2]], d: 36.2 }], "printed_accent");
        b.A.fastener("M4 x 20 + nut (rocker rear arm to hub)", 2);
      }
      b.printed(`${rocker}_frame`, rocker, rOps, "printed_accent");
      b.A.frameLink(rocker, "rocker");
    }
    // electronics inside the body box, on its floor
    const { items, compute } = electronicsFor(sensors, nW, battery, !!armReq, !!armReq);
    b.deckTop = zBody + 2;
    electronicsBay(b, items, { x0: -BL / 2 + 6, x1: BL / 2 - 6, y0: -BW / 2 + 6, y1: BW / 2 - 6 }, [], zBody + 2);
    // sensors on the lid: depth camera at the front, camera on a mast, lidar behind the arm
    const reservedX = BL / 2;
    if (sensors.includes("depth")) depthCamera(b, reservedX - 14, 0, lidTop + 60, lidTop, "deck_lid");
    if (sensors.includes("camera")) {
      const x = -BL / 2 + 40, y = 0, mz = lidTop + 180;
      const T = cameraModule(b, "mast_camera", "deck_lid", [x + 14, y, mz]);
      b.printed("camera_mast", "deck_lid", [{ op: "rod", a: [x, y, lidTop], b: [x, y, mz + 12], r: 10 }, { op: "box", min: [x - 25, y - 25, lidTop], max: [x + 25, y + 25, lidTop + 4], r: 5 },
        { op: "box", min: [x, y - 15, mz - 14], max: [x + 4, y + 15, mz + 14], r: 2 }, bodyCut("rpi_camera_module_3", T)], "printed_dark");
    }
    if (sensors.includes("lidar")) lidarMast(b, -BL / 2 + 45, sensors.includes("camera") ? 55 : 0, lidTop, lidTop, "deck_lid");
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
    return { b, eng, compute };
  });
  const { b, compute } = result, A = b.A;
  A.design.assumptions.push(
    `Rocker-bogie after the JPL Open Source Rover, ${nW} driven wheels, skid steering (the OSR's four corner-steering servos are left out; add them for less tyre scrub).`,
    "A rover's differential bar links the two rockers through the body, a closed loop URDF cannot describe; the model frees the left rocker on its pivot and bolts the right rocker to the body, which keeps every wheel on the ground and the body supported on three points (body pitch follows the right rocker instead of the average).",
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
  const armMounts = [1, -1].map((s) => frame([36, s * (BW / 2 + 34), 0], [1, 0, 0], [0, 0, -1]));
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
    panel("body_front", [BL / 2 - t, -BW / 2 + t, z0], [BL / 2, BW / 2 - t, z1], [{ op: "box", min: [BL / 2 - 0.1, -BW / 2 + 20, z0 + 20], max: [BL / 2 + 3, BW / 2 - 20, z0 + 110], r: 4 }]);
    panel("body_top", [-BL / 2, -BW / 2, z1], [BL / 2, BW / 2, z1 + t], [{ op: "hole", a: [BL / 2 - 45, 0, z1 - 1], b: [BL / 2 - 45, 0, z1 + t + 1], d: 20 }]);
    b.A.fastener("M3 x 10 + printed corner cleats (body panels)", 24);
    // electronics inside the body on the deck
    const { items, compute } = electronicsFor(sensors.filter((x) => x !== "lidar"), 2, battery, sensors.includes("depth"), true);
    electronicsBay(b, items, { x0: -BL / 2 + 8, x1: BL / 2 - 8, y0: -BW / 2 + 8, y1: BW / 2 - 8 }, [], z0);
    if (sensors.includes("imu")) b.sensor("imu_frame", "imu", "imu", translation([12.8, 11.35, 2]), { rate_hz: 400 });
    if (sensors.includes("lidar")) lidarMast(b, -BL / 2 + 40, 0, z1 + t, z1 + t, "body_top");
    if (sensors.includes("depth")) depthCamera(b, BL / 2 + 14, 0, z0 + 150, z1 + t, "body_top");
    // neck + head: pitch neck (the lift), pan and tilt, all serial-bus servos
    const neck = attachArm(b, "neck", { dof: 3, kinds: ["P", "Y", "P"], gripper: false, payloadKg: 0.18, reachM: 0.32, basePlateMm: 70, ladder: "feetech" }, "body_top", translation([BL / 2 - 45, 0, z1 + t]), "walle");
    // binocular head on the tilt servo's tool flange
    const Tt = b.pose(neck.rec.tool.link), tip = apply(Tt, neck.rec.tool.xyz_m.map((v) => v * 1000) as Vec3);
    const hx = tip[0] + 30, hz = tip[2] + 30;
    const head: Op[] = [];
    for (const s of [1, -1]) {
      head.push({ op: "hull", of: [{ op: "rod", a: [hx - 35, s * 34, hz], b: [hx + 15, s * 34, hz], r: 30 }, { op: "rod", a: [hx + 15, s * 36, hz + 2], b: [hx + 45, s * 40, hz + 6], r: 24 }] },
        { op: "hole", a: [hx + 20, s * 39, hz + 5], b: [hx + 50, s * 41, hz + 6], d: 34 });
    }
    head.push({ op: "box", min: [hx - 30, -12, hz - 12], max: [hx + 10, 12, hz + 12] },
      { op: "beam", a: [tip[0], tip[1], tip[2]], b: [hx - 20, 0, hz - 10], w: 24, h: 10, up: [0, 0, 1] });
    for (const l of b.A.spec.links.filter((x) => x.name.startsWith("neck_") && x.role !== "frame")) void l;
    const headLink = "head";
    b.W.set(neck.rec.tool.link, Tt);
    const Th = Tt;
    b.A.printedLink(headLink, { name: headLink, ops: [{ op: "at", T: invert(Th), of: [...head, { op: "keepout", key: neckTiltKey(b), T: Tt }] }] }, { role: "head", material: "walle" });
    b.A.fixed("head_mount", neck.rec.tool.link, headLink, I4()); b.W.set(headLink, Th);
    for (const s of [1, -1]) {
      const name = s > 0 ? "left_eye_camera" : "right_eye_camera";
      cameraModule(b, name, headLink, [hx + 30, s * 39, hz + 5]);
      if (!sensors.includes("camera")) void 0;
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
    return { b, eng, compute };
  });
  const { b } = result, A = b.A;
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
  const R = 122, zEgg0 = 150, zEggW = 470, zEgg1 = 560, tShell = 2.4;
  const result = sizeAndBuild((motor, battery) => {
    const b = new Build(req.name ?? "eva_robot", "character_eva", req.prompt);
    const wheel = "wheel_90mm_37d", h = wheelInfo(wheel).r, zB = Math.ceil(h + MOTOR_TOP + 7), yFace = 90;
    // round aluminium deck (Ø 236) inside a dark skirt: the "hover" base
    const deckOps: Op[] = [{ op: "revolve", pts: [[0, zB], [118, zB], [118, zB + 3], [0, zB + 3]] }];
    b.fabricated("base_link", null, deckOps, { density: ALU, material: "aluminium", item: "Ø 236 x 3 mm aluminium disc deck, laser cut (~$30)", usd: 30, role: "base" });
    b.deckTop = zB + 3;
    for (const s of [1, -1] as const) {
      const o: WheelOpts = { tag: s > 0 ? "left" : "right", parent: "base_link", x: 0, side: s, yFace, motor, wheel };
      deckBracket(b, wheelStation(b, o), o, zB);
    }
    for (const [t, x] of [["front_caster", 88], ["rear_caster", -88]] as const) ballCaster(b, t, x, 0, zB);
    // skirt halves: dark ring that hides the wheels, 6 mm off the floor
    for (const s of [1, -1]) {
      b.printed(s > 0 ? "skirt_left" : "skirt_right", "base_link", [
        { op: "revolve", pts: shellOutline([[124, 8], [124.5, 60], [118, zB + 3], [100, zB + 22]], 2.4) },
        { op: "cutbox", min: [-200, s > 0 ? -200 : 0, -10], max: [200, s > 0 ? 0 : 200, 300] },
        { op: "box", min: [-6, s > 0 ? 0 : -116, zB + 3], max: [6, s > 0 ? 116 : 0, zB + 6] }], "printed_dark");
    }
    // electronics on the deck under the egg
    const { items, compute } = electronicsFor(sensors.filter((x) => x !== "lidar" && x !== "depth"), 2, battery, false, true);
    electronicsBay(b, items, { x0: -78, x1: 78, y0: -60, y1: 60 }, [{ x0: -14, x1: 14, y0: -14, y1: 14 }], b.deckTop);
    if (sensors.includes("imu")) b.sensor("imu_frame", "imu", "imu", translation([12.8, 11.35, 2]), { rate_hz: 400 });
    // spine: 20 mm aluminium tube from the deck to the neck, two printed ribs carry the egg shell
    b.fabricated("spine", "base_link", [{ op: "rod", a: [0, 0, b.deckTop], b: [0, 0, zEgg1 - 30], r: 10 }, { op: "hole", a: [0, 0, b.deckTop - 1], b: [0, 0, zEgg1], d: 16 }],
      { density: ALU, material: "aluminium", item: "20 x 2 mm aluminium tube, 0.45 m (~$8)", usd: 8 });
    b.printed("spine_foot", "base_link", [{ op: "box", min: [-26, -26, b.deckTop], max: [26, 26, b.deckTop + 5], r: 6 }, { op: "rod", a: [0, 0, b.deckTop], b: [0, 0, b.deckTop + 40], r: 14 }, { op: "hole", a: [0, 0, b.deckTop + 4], b: [0, 0, b.deckTop + 41], d: 20.2 }], "printed_dark");
    const prof = eggProfile(zEgg0, zEgg1, R, zEggW, 32, 0.28, 0.25);
    const rAt = (z: number) => { for (let i = 1; i < prof.length; i++) if (prof[i][1] >= z) { const [r0, z0] = prof[i - 1], [r1, z1] = prof[i]; return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0); } return prof[prof.length - 1][0]; };
    const zSeam = 355;
    for (const [zr, nm] of [[zSeam, "rib_mid"], [zEgg1 - 30, "rib_top"]] as const) {
      const rr = rAt(zr) - tShell - 0.5;
      for (const s of [1, -1]) b.printed(`${nm}_${s > 0 ? "left" : "right"}`, "spine", [{ op: "revolve", pts: [[10.2, zr - 3], [rr, zr - 3], [rr, zr + 3], [10.2, zr + 3]] },
        { op: "cutbox", min: [-300, s > 0 ? -300 : 0, zr - 10], max: [300, s > 0 ? 0 : 300, zr + 10] }, { op: "lighten", a: [-rr * 0.55, 0, zr], b: [rr * 0.55, 0, zr], r: rr * 0.16, n: 2 }]);
    }
    // egg shell: two bands x two halves, each fits the bed
    const shell = shellOutline(prof, tShell);
    for (const [za, zb, band] of [[zEgg0 - 1, zSeam, "lower"], [zSeam, zEgg1 + 1, "upper"]] as const) for (const s of [1, -1]) {
      const ops: Op[] = [{ op: "revolve", pts: shell, seg: 96 }, { op: "cutbox", min: [-300, -300, -10], max: [300, 300, za] }, { op: "cutbox", min: [-300, -300, zb], max: [300, 300, 900] },
        { op: "cutbox", min: [-300, s > 0 ? -300 : 0, 0], max: [300, s > 0 ? 0 : 300, 900] }, { op: "hole", a: [0, 0, 0], b: [0, 0, 900], d: 22 }];
      b.printed(`shell_${band}_${s > 0 ? "left" : "right"}`, "spine", ops);
    }
    b.A.fastener("M3 x 8 + heat-set inserts (shell to ribs)", 16);
    b.A.buy("insert_m3", 16, "shell to ribs");
    // head: pan servo on top of the spine, egg-shaped head with a dark visor and the camera behind it
    const zTop = zEgg1 + 2;
    const panKey = servoKey(0.05);
    const Tpan = frame([0, 0, zTop + 8], [0, 0, 1], [1, 0, 0]);
    // servo cradle on the top rib through the top of the egg
    b.printed("neck_mount", "spine", [{ op: "cradle", key: panKey, T: Tpan, wall: 3 }, { op: "rod", a: [0, 0, zEgg1 - 34], b: [0, 0, zTop + 8 - 38], r: 15 },
      { op: "hole", a: [0, 0, zEgg1 - 40], b: [0, 0, zEgg1 - 20], d: 20.2 }], "printed");
    b.mount("spine", panKey, Tpan, "head_pan_actuator", "head pan");
    b.servo("head_pan", "spine", "head", Tpan, panKey, -2.6, 2.6);
    const hz0 = zTop + 20, HR = 112, HH = 150;
    const headProf: [number, number][] = [];
    for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 24; headProf.push([HR * Math.cos(a), hz0 + HH / 2 + (HH / 2) * Math.sin(a)]); }
    const scaleX: Mat4 = mul(translation([0, 0, 0]), scaleM(0.9, 1, 1));
    const headOps: Op[] = [{ op: "at", T: scaleX, of: [{ op: "revolve", pts: shellOutline(headProf, 2.4), seg: 96 }] },
      { op: "horn", key: panKey, t: 4 } as Op, { op: "rod", a: [0, 0, zTop + 8], b: [0, 0, hz0 + 3], r: 14 }, { op: "hole", a: [0, 0, zTop + 8 + 3], b: [0, 0, hz0 + 4], d: 9 },
      { op: "hole", a: [70, 0, hz0 + 70], b: [120, 0, hz0 + 70], d: 12 }];
    headOps[1] = { op: "at", T: Tpan, of: [{ op: "horn", key: panKey, t: 4 }] };
    b.A.printedLink("head", { name: "head", ops: b.in("head", headOps) }, { role: "head", material: "printed" });
    b.A.fastener("horn screws", 4);
    // visor: thin dark band on the front of the head
    const visor: Op[] = [{ op: "at", T: scaleX, of: [{ op: "revolve", pts: shellOutline(headProf.map(([r, z]) => [r + 2.5, z]), 1.6), seg: 96 }] },
      { op: "cutbox", min: [-300, -300, -10], max: [300, 300, hz0 + 32] }, { op: "cutbox", min: [-300, -300, hz0 + 118], max: [300, 300, 900] },
      { op: "cutbox", min: [-300, -300, 0], max: [40, 300, 900] }, { op: "hole", a: [70, 0, hz0 + 70], b: [130, 0, hz0 + 70], d: 12 }];
    b.printed("visor", "head", visor, "visor");
    for (const s of [1, -1]) b.printed(s > 0 ? "left_eye" : "right_eye", "head", [{ op: "at", T: frame([100.5, s * 30, hz0 + 78], [1, 0.2 * s, 0], [0, 0, 1]), of: [{ op: "box", min: [-9, -16, 0], max: [9, 16, 2.5], r: 8 }] }], "led");
    b.fab.push({ item: "two 8-LED WS2812 sticks behind translucent eye diffusers (~$8)", usd: 8 });
    cameraModule(b, "head_camera", "head", [86, 0, hz0 + 70]);
    b.printed("camera_bracket", "head", [{ op: "box", min: [70, -16, hz0 + 50], max: [74, 16, hz0 + 88], r: 2 }, { op: "box", min: [40, -16, hz0 + 50], max: [74, 16, hz0 + 54] }, bodyCut("rpi_camera_module_3", b.W.get("head_camera")!)]);
    // arms: two-servo fins hanging along the egg's sides
    const zS = zEggW + 10, yS = rAt(zS) + 30;
    for (const s of [1, -1]) {
      const prefix = s > 0 ? "left_arm" : "right_arm";
      const T = frame([0, s * yS, zS], [0, 0, -1], [1, 0, 0]);
      attachArm(b, prefix, { dof: 2, kinds: ["P", "P"], gripper: false, payloadKg: payload, reachM: 0.2, basePlateMm: 46, ladder: "feetech" }, "spine", T, "printed");
      const ri = rAt(zS) - tShell;
      b.printed(`${prefix}_shoulder`, "spine", [{ op: "box", min: [-14, s > 0 ? 10 : -yS + 20, zS - 3], max: [14, s > 0 ? yS - 20 : -10, zS + 3] },
        { op: "box", min: [-23, s > 0 ? yS - 23 : -yS - 23, zS], max: [23, s > 0 ? yS + 23 : -yS + 23, zS + 4], r: 4 },
        { op: "box", min: [-14, s > 0 ? ri - 10 : -yS + 20, zS], max: [14, s > 0 ? yS - 20 : -ri + 10, zS + 4] }]);
    }
    // cut the shell where the shoulder brackets pass
    for (const l of b.A.design.printed.filter((p) => p.name.startsWith("shell_upper"))) void l;
    const eng = engineer(b, { motor, wheel, nDriven: 2, battery, compute, casterMaxKg: Number(part("ball_caster_pololu_2692").specs.max_robot_mass_kg) });
    return { b, eng, compute };
  });
  const { b } = result, A = b.A;
  A.design.assumptions.push(
    "EVA cannot hover: this EVA rolls on a hidden differential-drive base (two 37D gearmotors, two ball casters) under a dark skirt; the egg rides on a 20 mm aluminium spine above it, so the gap reads as the film's hover.",
    "The egg body is four printed PETG shell segments (two bands, two halves) screwed to two printed ribs on the spine; the head is one print (230 x 200 x 150 mm) with a dark visor band and two LED eye diffusers.",
    "The head turns on a single pan servo; the film's free-floating head tilt is not reproduced. The arms are two-servo fins hanging beside the egg (they cannot fold flush into the body like the film's).",
    "The camera looks out through a 12 mm hole in the visor centre.",
  );
  A.design.request = { ...req };
  const spec = A.finish(`EVA-style companion robot: ${A.design.performance.mass_kg} kg, hidden diff-drive base, pan head with camera, two servo fins`);
  costing(b, spec, req.budget);
  return spec;
}

// ----------------------------------------------------------------------------------- Baymax
export function designBaymax(req: MobileRequest = {}): RobotSpecification {
  const sensors = defaults(req, ["camera", "imu"]);
  const payload = req.payloadKg ?? 0.3;
  const zSh = 820, ySh = 175, splay = 22 * D2R;
  const result = sizeAndBuild((motor, battery) => {
    const b = new Build(req.name ?? "baymax_robot", "character_baymax", req.prompt);
    const ch = characterChassis(b, { motor, perSide: 2, drivenPerSide: 2, wheelbase: 240, yFace: 125, L: 340, W: 260 });
    const { items, compute } = electronicsFor(sensors.filter((x) => x !== "lidar"), 4, battery, sensors.includes("depth"), true);
    electronicsBay(b, items, { x0: -166, x1: 166, y0: -126, y1: 126 }, [{ x0: -30, x1: 30, y0: -30, y1: 30 }], ch.top);
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
      const T = frame([0, s * ySh, zSh - 6], z, [1, 0, 0]);
      attachArm(b, prefix, { dof: 3, kinds: ["Y", "P", "P"], gripper: false, payloadKg: payload, reachM: 0.42, basePlateMm: 70 }, "shoulder_yoke", T, "fabric");
      // mitten hand on the tool flange
      const tool = b.arms[b.arms.length - 1].tool, Tt = b.pose(tool.link), p = apply(Tt, tool.xyz_m.map((v) => v * 1000) as Vec3);
      b.W.set(tool.link, Tt);
      const zt = apply(Tt, [0, 0, 1]).map((v, i) => v - Tt[12 + i]) as Vec3;
      b.printed(`${prefix}_mitten`, tool.link, [{ op: "hull", of: [{ op: "rod", a: p, b: [p[0] + zt[0] * 60, p[1] + zt[1] * 60, p[2] + zt[2] * 60], r: 34 }, { op: "rod", a: [p[0] + zt[0] * 20, p[1] + zt[1] * 20, p[2] + zt[2] * 20], b: [p[0] + zt[0] * 90, p[1] + zt[1] * 90, p[2] + zt[2] * 90], r: 26 }] },
        { op: "keepout", key: b.A.design.joints.find((j) => j.joint === `${prefix}_elbow_pitch`)?.actuator ?? "feetech_sts3215_c047", T: Tt }], "fabric", "hand");
    }
    // head: pan servo on the yoke centre, printed head shell with two eyes and a camera
    const panKey = servoKey(0.08);
    const Tpan = frame([0, 0, zSh + 34], [0, 0, 1], [1, 0, 0]);
    b.printed("neck_mount", "shoulder_yoke", [{ op: "cradle", key: panKey, T: Tpan, wall: 3 }, { op: "box", min: [-26, -24, zSh], max: [26, 24, zSh + 4], r: 4 }], "printed");
    b.mount("shoulder_yoke", panKey, Tpan, "head_pan_actuator", "head pan");
    b.servo("head_pan", "shoulder_yoke", "head", Tpan, panKey, -1.4, 1.4);
    const hz0 = zSh + 60, HR = 105, HH = 130;
    const headProf: [number, number][] = [];
    for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (Math.PI * i) / 24; headProf.push([HR * Math.cos(a), hz0 + HH / 2 + (HH / 2) * Math.sin(a)]); }
    const sx = mul(translation([0, 0, 0]), scaleM(0.78, 1, 1));
    const head: Op[] = [{ op: "at", T: sx, of: [{ op: "revolve", pts: shellOutline(headProf, 2.4), seg: 96 }] }, { op: "at", T: Tpan, of: [{ op: "horn", key: panKey, t: 4 }] },
      { op: "rod", a: [0, 0, zSh + 38], b: [0, 0, hz0 + 3], r: 14 }, { op: "hole", a: [0, 0, zSh + 37], b: [0, 0, hz0 + 4], d: 9 }, { op: "hole", a: [60, 0, hz0 + 68], b: [100, 0, hz0 + 68], d: 12 }];
    b.A.printedLink("head", { name: "head", ops: b.in("head", head) }, { role: "head", material: "fabric" });
    b.A.fastener("horn screws", 4);
    b.printed("eyes", "head", [{ op: "at", T: frame([78.5, 0, hz0 + 68], [1, 0, 0], [0, 0, 1]), of: [{ op: "rod", a: [0, 28, 0], b: [0, 28, 3], r: 11 }, { op: "rod", a: [0, -28, 0], b: [0, -28, 3], r: 11 }, { op: "box", min: [-1.5, -28, 0], max: [1.5, 28, 2] }] }], "visor");
    cameraModule(b, "head_camera", "head", [70, 0, hz0 + 68]);
    b.printed("camera_bracket", "head", [{ op: "box", min: [55, -16, hz0 + 46], max: [59, 16, hz0 + 86], r: 2 }, { op: "box", min: [30, -16, hz0 + 46], max: [59, 16, hz0 + 50] }, bodyCut("rpi_camera_module_3", b.W.get("head_camera")!)]);
    // soft cover: sewn ripstop body (pear shape) zipped over the frame; negligible structure
    const prof: [number, number][] = [[150, 70], [205, 120], [228, 220], [232, 330], [222, 460], [200, 600], [170, 720], [140, 790], [95, 840], [70, zSh + 30]];
    b.fabricated("soft_cover", "spine", [{ op: "at", T: scaleM(0.82, 1, 1), of: [{ op: "revolve", pts: shellOutline(prof, 1.5), seg: 96 }] }],
      { density: 0, massKg: 0.55, material: "fabric", item: "sewn white ripstop body cover with zip and foam lining, about 2 m^2 (~$60)", usd: 60, role: "cover" });
    if (sensors.includes("depth")) depthCamera(b, 192, 0, 620, 600, "spine");
    const eng = engineer(b, { motor, wheel: ch.wheel, nDriven: 4, battery, compute, skid: true });
    return { b, eng, compute };
  });
  const { b } = result, A = b.A;
  A.design.assumptions.push(
    "Baymax's inflatable vinyl body is a sewn ripstop cover with a foam-lined zip, bought or sewn, with negligible structural role; it hangs on the shoulder yoke and hides a 4WD skid-steer base. It is not inflated, so it does not cushion like the film's.",
    "Structure: 2020 aluminium extrusion spine and a 6 mm aluminium shoulder yoke; arms are three servos each (shoulder yaw, shoulder pitch, elbow) splayed 22 deg so they clear the belly; the hands are printed mittens covered with the same fabric.",
    `Each arm is sized as mounted to lift ${payload} kg in the mitten at full reach; the tipping check includes both arms stretched forward with that payload.`,
    "The head turns on one pan servo; a camera looks out between the eyes through a 12 mm hole.",
  );
  A.design.request = { ...req };
  const spec = A.finish(`Baymax-style service robot: ${A.design.performance.mass_kg} kg, about ${(1 + (zSh + 190) / 1000 - 1).toFixed(2)} m tall, 4WD hidden base, two 3-servo arms, pan head with camera`);
  costing(b, spec, req.budget);
  return spec;
}

export const MOBILE_DESIGNERS = { designDiffDrive, designFourWheel, designMecanum, designRover, designWallE, designEva, designBaymax };
void rotZ;
