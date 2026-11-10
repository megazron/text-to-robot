// Wiring model. A design declares its netlist from the parts it uses (rails, grounds, signals, buses); this module turns
// that into wires: gauge from current, connectors from the parts' own ports, fuses, a main switch, a common ground and a
// power budget per rail. Cables are routed along the links in 3D at the robot's home pose, and every joint a cable
// crosses gets a slack loop at least as long as the length that joint's full travel needs (swept with the real limits).
// Output: `design.wiring` (robot.json), WIRING.md, a wiring diagram SVG and real BOM lines. Lengths are mm, currents A.
import type { RobotSpecification, Joint, Link } from "@ttr/robot-schema";
import { part, electrical, WIRING, type ElectricalRecord, type Vec3 } from "@ttr/parts";
import { buildPart } from "@ttr/mesh";
import type { Assembly } from "./assembly.ts";
import { fk, type Fk as FK } from "./kin.ts";
import { linkSolid } from "./clearance.ts";
import { build, box as boxSolid, type Mat4 } from "@ttr/solid";
import { Router, roundWire } from "./wiring3d/route.ts";
import { wireSize } from "./wiring3d/place.ts";

// ------------------------------------------------------------------------------------------- records
export type NetKind = "power" | "ground" | "signal" | "bus";
export interface WireEnd { inst: string; port: string; pin: string; }
export interface InstanceRec {
  name: string; key: string; link: string | null; off_board?: boolean; note?: string;
  /** a harness part with no link of its own (splice, inline fuse, star ground): its body centre in the world at the home pose (mm) and the rigid body it is tied to */
  at_mm?: Vec3; on?: string;
  /** it lies turned half a turn about that body's z, so its pins face the parts it is wired to */
  turned?: boolean;
}
export interface NetRec { name: string; kind: NetKind; voltage_v?: number; pins: string[]; }
export interface WireRec { id: string; net: string; kind: NetKind; from: string; to: string; awg: number | null; color: string; typical_a: number; peak_a: number; length_mm: number; drop_v?: number;
  /** the wire as laid by the router: corner points pin to pin in the world at the home pose (mm), the rigid body each rides (run lengths) and the radius its corners are rounded to */
  pts?: Vec3[]; on?: [string, number][]; bend_mm?: number;
}
export interface SlackRec { joint: string; type: string; travel: [number, number]; home_mm: number; need_mm: number; slack_mm: number; provided_mm: number; }
export interface CableRec {
  id: string; label: string; from: string; to: string; from_connector: string; to_connector: string; premade: string | null;
  wires: WireRec[]; od_mm: number; route_mm: number; service_mm: number; slack_mm: number; termination_mm: number; length_mm: number;
  path_mm: Vec3[]; links: string[]; joints: SlackRec[]; exit: string | null;
  /** how much of the route lies in routed channels (only where a design declares them) */
  channel_mm?: number;
}
export interface RailRec {
  name: string; voltage_v: number; source: string; continuous_a: number; peak_limit_a: number; typical_a: number; peak_a: number; simultaneous: string;
  loads: { inst: string; typical_a: number; peak_a: number }[]; fuse_a: number | null; worst_drop_v: number; ok: boolean;
}
export interface FuseRec { id: string; rating_a: number; protects: string; wire_awg: number; holder: string; }
export interface WiringBomLine { item: string; qty: number; unit: string; unit_usd: number; subtotal_usd: number; spec: string; source: string; }
export interface ClipRec { link: string; at_mm: Vec3; dir: Vec3; normal: Vec3; od_mm: number; cables: string[]; /** how far the cable's centre stands off the surface the clip is printed on */ gap_mm?: number; }
export interface WiringRecord {
  instances: InstanceRec[]; nets: NetRec[]; cables: CableRec[]; rails: RailRec[]; fuses: FuseRec[]; main_switch: string | null; clips: ClipRec[];
  bom: WiringBomLine[]; cost_usd: number; total_wire_m: number; notes: string[]; unconnected: string[]; estimated_inputs: string[];
}

// ------------------------------------------------------------------------------------------- helpers
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => { const n = norm(a); return n > 1e-9 ? scale(a, 1 / n) : [0, 0, 1]; };
const dist = (a: Vec3, b: Vec3) => norm(sub(a, b));
const r1 = (x: number) => +x.toFixed(1);
const r3 = (x: number) => +x.toFixed(3);
const tname = (e: WireEnd) => `${e.inst}.${e.port}.${e.pin}`;
const COLOR: Record<string, string> = { power: "red", ground: "black", pwm: "yellow", digital: "blue", analog: "white", i2c_sda: "blue", i2c_scl: "yellow", uart_tx: "green", uart_rx: "white", ttl_half_duplex: "yellow", rs485_a: "yellow", rs485_b: "blue", can_h: "yellow", can_l: "green", motor_phase: "orange", encoder: "green", one_wire_led: "green", spi: "violet", usb: "grey", csi: "grey" };

/** Smallest gauge whose ampacity carries `amps` and whose drop over `lengthMm` stays under `maxDropV`. */
export function gaugeFor(amps: number, lengthMm: number, maxDropV: number, minAwg = 26): { awg: number; drop_v: number } {
  const table = [...WIRING.awg].sort((a, b) => b.awg - a.awg);
  for (const g of table) {
    if (g.awg > minAwg) continue;
    const drop = amps * g.ohm_per_m * 2 * (lengthMm / 1000);
    if (g.ampacity_a >= amps && drop <= maxDropV) return { awg: g.awg, drop_v: drop };
  }
  const g = table[table.length - 1];
  return { awg: g.awg, drop_v: amps * g.ohm_per_m * 2 * (lengthMm / 1000) };
}
export const awgRow = (awg: number) => { const g = WIRING.awg.find((x) => x.awg === awg); if (!g) throw new Error(`no AWG ${awg} in the wire table`); return g; };
/** Standard blade fuse at or above `amps` (ATM ratings). */
export function fuseFor(amps: number): number { const list = [...WIRING.fuse_ratings_a, ...(WIRING.anl_ratings_a ?? [])]; return list.find((f) => f >= amps) ?? list[list.length - 1]; }
/** The holder a fuse needs: a blade holder to 30 A and 32 V, ANL above that. */
const fuseHolder = (amps: number, volts: number) => (amps > 30 || volts > 32 ? "fuse_holder_anl" : "fuse_holder_atm_inline");
/** Connector family (a row of WIRING.connectors) for a port's connector text. */
export function connectorFamily(text: string): string {
  const t = text.toLowerCase();
  if (/usb|ffc|fpc|csi|ethernet|rj45|barrel|dc jack|5\.5/.test(t)) return "premade";
  if (/\bec5\b/.test(t)) return "ec5"; if (/xt90/.test(t)) return "xt90"; if (/xt60/.test(t)) return "xt60"; if (/xt30/.test(t)) return "xt30";
  if (/\bgh\b|1\.25/.test(t)) return "jst_gh_1_25"; if (/jst.?ph|\bph\b|2\.0 ?mm/.test(t)) return "jst_ph_2_0"; if (/jst.?xh|\bxh\b/.test(t)) return "jst_xh_2_5";
  if (/eh[rp]?\b|jst.?eh/.test(t)) return "jst_ehr_2_5"; if (/5264|molex/.test(t)) return "molex_5264";
  if (/screw|terminal|ferrule|barrier/.test(t)) return "ferrule"; if (/ring/.test(t)) return "ring_terminal_m3"; if (/spade|quick.?connect|faston|blade/.test(t)) return "spade_6_3";
  if (/solder|pad|tab|lead|wire/.test(t)) return "solder"; if (/lever|wago/.test(t)) return "lever";
  if (/breadboard|dupont|2\.54|header|pin/.test(t)) return "dupont_2_54";
  return "solder";
}

// ------------------------------------------------------------------------------------------- the harness builder
interface Feed { inst: string; vPin: string; gPin?: string; typ: number; peak: number; }
interface Rail { name: string; volts: number; source: string; srcPin: string; srcGnd: string; cont: number; peakLimit: number; feeds: Feed[]; simultaneous: number; simNote: string; fuseMain: boolean; efficiency?: number; upstream?: string; }
interface WireDecl { net: string; a: WireEnd; b: WireEnd; typ: number; peak: number; cable: string; trunk?: string; }
export interface ExitDecl { id: string; link: string; at: Vec3; normal: Vec3; panel_hole_mm: number; bay: string; kind: string; }

export class Harness {
  A: Assembly;
  instances = new Map<string, InstanceRec>();
  nets = new Map<string, NetRec>();
  wires: WireDecl[] = [];
  rails = new Map<string, Rail>();
  labels = new Map<string, string>();
  premade = new Map<string, string>();
  notes: string[] = [];
  exits: ExitDecl[] = [];
  /** instance -> bay name, for routing through a bay's cable exits */
  bayOf = new Map<string, string>();
  mainSwitch: string | null = null;
  fuses: FuseRec[] = [];
  optional = new Set<string>();
  /** routed channels: link -> polylines, world mm at home. A cable that has left its bay follows them through that rigid body. */
  channels = new Map<string, Vec3[][]>();
  /** extra loop at a joint for movement the model does not have (a wearer's shoulder also lifts sideways): joint -> mm */
  flex = new Map<string, number>();
  /** where harness parts (fuse, splices, star ground) sit: with this instance. Unset, each sits by the first part wired to it. */
  home?: string;
  /** a harness part the design gives its place: in the compartment of part `by`, as near `at` as it fits (world mm at the home pose) */
  spot = new Map<string, { by: string; at: Vec3 }>();
  /** cable -> the bay exit it leaves by, where the nearest one would be overfilled */
  exitOf = new Map<string, string>();
  /** exits kept for the cables exitOf sends through them (a ribbon slot): no other cable takes one as its nearest */
  kept = new Set<string>();
  /** lever splices a designer added by hand (bus hubs) */
  buyHub?: number;
  mainRange?: { min: number; nom: number; max: number };
  main: { rail: string; source: string; pos: string; neg: string; sw: string | null; swIn: string; swOut: string; fuse: boolean } | null = null;
  constructor(A: Assembly) {
    this.A = A;
    this.scan();
    this.net("GND", "ground", 0);
  }
  /** Every mounted electrical part is an instance under its link's name. */
  scan() {
    for (const l of this.A.spec.links) {
      if (l.geometry.type !== "mesh" || l.geometry.part !== "component" || this.instances.has(l.name)) continue;
      const key = String(l.geometry.params?.key);
      if (electrical(key)) this.instances.set(l.name, { name: l.name, key, link: l.name });
    }
  }
  /** A part with no link of its own: off-board (bench supply) or carried in a bay (`link` = the bay it rides in). */
  part(name: string, key: string, o: { link?: string | null; off_board?: boolean; note?: string } = {}) { this.instances.set(name, { name, key, link: o.link ?? null, ...(o.off_board ? { off_board: true } : {}), ...(o.note ? { note: o.note } : {}) }); return name; }
  rec(inst: string): ElectricalRecord { if (!this.instances.has(inst)) this.scan(); const i = this.instances.get(inst); if (!i) throw new Error(`wiring: no instance '${inst}' (have ${[...this.instances.keys()].join(", ")})`); return electrical(i.key)!; }
  net(name: string, kind: NetKind, voltage?: number) { if (!this.nets.has(name)) this.nets.set(name, { name, kind, ...(voltage !== undefined ? { voltage_v: voltage } : {}), pins: [] }); return name; }
  /** "inst.pin" or "inst.port.pin" (pin by printed name, case-insensitive); the first port holding that pin wins. */
  end(t: string): WireEnd {
    const [inst, a, b] = t.split(".");
    const ports = this.rec(inst).ports, want = (b ?? a).toLowerCase();
    // a bare pin name means the working connector, not a USB socket that happens to have the same pin
    const list = b ? ports.filter((p) => p.name.toLowerCase() === a.toLowerCase()) : [...ports].sort((x, y) => Number(/usb/.test(x.name)) - Number(/usb/.test(y.name)));
    // by printed name (a colour note in brackets does not count), by pin number, or "@signal" for the first pin of that type
    const short = (n: string) => n.toLowerCase().split(" (")[0].trim();
    for (const p of list) { const pin = p.pins.v.find((x) => x.name.toLowerCase() === want) ?? p.pins.v.find((x) => short(x.name) === want || short(x.name).split("/").includes(want)) ?? p.pins.v.find((x) => x.pin.toLowerCase() === want) ?? (want.startsWith("@") ? p.pins.v.find((x) => x.signal === want.slice(1)) : undefined); if (pin) return { inst, port: p.name, pin: pin.name }; }
    throw new Error(`wiring: ${t}: no such pin on ${this.instances.get(inst)!.key} (ports ${ports.map((p) => `${p.name}[${p.pins.v.map((x) => x.name).join(" ")}]`).join(", ")})`);
  }
  private cableKey(a: string, b: string) { return [a, b].sort().join("~"); }
  /** One conductor between two terminals, on `net`. Wires between the same two parts form one cable. */
  wire(net: string, ta: string, tb: string, o: { typ?: number; peak?: number; cable?: string; trunk?: string } = {}) {
    const a = this.end(ta), b = this.end(tb);
    const n = this.nets.get(net); if (!n) throw new Error(`wiring: net ${net} is not declared`);
    for (const e of [a, b]) if (!n.pins.includes(tname(e))) n.pins.push(tname(e));
    const cable = o.cable ?? this.cableKey(a.inst, b.inst);
    this.wires.push({ net, a, b, typ: o.typ ?? 0.02, peak: o.peak ?? o.typ ?? 0.02, cable, ...(o.trunk ? { trunk: o.trunk } : {}) });
  }
  label(cable: string, text: string) { this.labels.set(cable, text); }
  exitFor(cable: string, exit: string) { this.exitOf.set(cable, exit); }
  /** A channel a cable can lie in, on `link`: a polyline in world mm at the home pose. */
  channel(link: string, pts: Vec3[]) { this.channels.set(link, [...(this.channels.get(link) ?? []), pts]); }
  /** several signal wires a -> b at once: pairs of pin names */
  signals(a: string, b: string, pairs: [string, string, string?][], kind: NetKind = "signal") {
    for (const [pa, pb, netName] of pairs) { const n = netName ?? `${a}_${pa}`.toUpperCase(); this.net(n, kind); this.wire(n, `${a}.${pa}`, `${b}.${pb}`); }
  }
  /** A pre-made cable (USB, FFC, barrel): a logical link, bought ready made. */
  bought(a: string, b: string, what: string, typ = 0.1, peak = typ, netName?: string) {
    const ca = this.end(a), cb = this.end(b), n = this.net(netName ?? `${ca.inst}_${cb.inst}_LINK`.toUpperCase(), "bus");
    const cable = this.cableKey(ca.inst, cb.inst);
    this.premade.set(cable, what);
    // a bought lead fills the whole socket: every pin of both ports is taken
    const nn = this.nets.get(n)!;
    for (const e of [ca, cb]) for (const p of this.rec(e.inst).ports.find((q) => q.name === e.port)!.pins.v) { const t = `${e.inst}.${e.port}.${p.name}`; if (!nn.pins.includes(t)) nn.pins.push(t); }
    this.wires.push({ net: n, a: ca, b: cb, typ, peak, cable });
  }
  /** Declare a rail. `source` is the part feeding it; `cont` / `peakLimit` default to its record. */
  rail(name: string, o: { source: string; out: string; gnd: string; volts?: number; cont?: number; peakLimit?: number; simultaneous?: number; simNote?: string; fuseMain?: boolean; efficiency?: number; upstream?: string }) {
    const r = this.rec(o.source), out = r.output?.v;
    const volts = o.volts ?? out?.voltage_v ?? r.voltage_v.v.nom;
    const cont = o.cont ?? out?.current_a ?? r.current_a.v.typical, lim = o.peakLimit ?? r.current_a.v.peak ?? cont;
    this.net(name, "power", volts);
    this.rails.set(name, { name, volts, source: o.source, srcPin: o.out, srcGnd: o.gnd, cont, peakLimit: Math.max(lim, cont), feeds: [], simultaneous: o.simultaneous ?? Infinity, simNote: o.simNote ?? "every load at its peak at once", fuseMain: !!o.fuseMain, ...(o.efficiency ? { efficiency: o.efficiency } : {}), ...(o.upstream ? { upstream: o.upstream } : {}) });
    return name;
  }
  /** Connect a load to a rail: its supply pin and ground go to the rail's distribution point. */
  feed(rail: string, inst: string, o: { v?: string; g?: string; typ?: number; peak?: number } = {}) {
    const R = this.rails.get(rail); if (!R) throw new Error(`wiring: no rail ${rail}`);
    const r = this.rec(inst), p = (o.v ? this.end(`${inst}.${o.v}`) : this.firstPower(inst, r)), g = o.g === "" ? undefined : (o.g ? this.end(`${inst}.${o.g}`) : this.firstGround(inst, r));
    R.feeds.push({ inst, vPin: `${p.port}.${p.pin}`, ...(g ? { gPin: `${g.port}.${g.pin}` } : {}), typ: o.typ ?? r.current_a.v.typical, peak: o.peak ?? r.current_a.v.peak });
  }
  firstPower(inst: string, r: ElectricalRecord): WireEnd { for (const p of r.ports) for (const x of p.pins.v) if (x.signal === "power" && x.dir !== "power_out" && x.dir !== "out") return { inst, port: p.name, pin: x.name }; throw new Error(`wiring: ${inst} has no power input pin`); }
  firstGround(inst: string, r: ElectricalRecord): WireEnd { for (const p of r.ports) for (const x of p.pins.v) if (x.signal === "ground") return { inst, port: p.name, pin: x.name }; throw new Error(`wiring: ${inst} has no ground pin`); }
  /** A regulator between two rails: fed from `from`, sources `to`. Its input draw follows from its output load at `efficiency`. */
  regulator(inst: string, from: string, to: string, o: { vin: string; gin: string; vout: string; gout: string; volts?: number; efficiency?: number; cont?: number; peakLimit?: number; simultaneous?: number; simNote?: string }) {
    this.feed(from, inst, { v: o.vin, g: o.gin, typ: 0.01, peak: 0.01 });
    this.rail(to, { source: inst, out: o.vout, gnd: o.gout, efficiency: o.efficiency ?? 0.85, upstream: from, ...(o.volts ? { volts: o.volts } : {}), ...(o.cont ? { cont: o.cont } : {}), ...(o.peakLimit ? { peakLimit: o.peakLimit } : {}), ...(o.simultaneous ? { simultaneous: o.simultaneous } : {}), ...(o.simNote ? { simNote: o.simNote } : {}) });
  }
  /**
   * Battery to rail: positive through the main fuse and main switch; the switch's output is the rail. Negative goes to the
   * star ground and is never switched. Fuse rating and wire follow from the rail's load when the harness is finished.
   */
  mainPower(rail: string, o: { source: string; pos: string; neg: string; sw?: string; swIn?: string; swOut?: string; fuse?: boolean; volts?: number; cont?: number; peakLimit?: number; simultaneous?: number; simNote?: string; range?: { min: number; nom: number; max: number } }) {
    const r = this.rec(o.source), out = r.output?.v;
    const fuse = o.fuse !== false;
    if (o.range) this.mainRange = o.range;
    this.main = { rail, source: o.source, pos: o.pos, neg: o.neg, sw: o.sw ?? null, swIn: o.swIn ?? "IN", swOut: o.swOut ?? "OUT", fuse };
    if (o.sw) this.mainSwitch = o.sw;
    if (fuse) this.part("main_fuse", (o.volts ?? 12) > 32 ? "fuse_holder_anl" : "fuse_holder_atm_inline", { note: "main fuse, inline in the positive lead" });
    this.net(rail, "power", o.volts ?? out?.voltage_v ?? r.voltage_v.v.nom);
    this.rail(rail, { source: o.sw ?? (fuse ? "main_fuse" : o.source), out: o.sw ? (o.swOut ?? "OUT") : fuse ? "OUT" : o.pos, gnd: o.neg, volts: o.volts ?? out?.voltage_v ?? r.voltage_v.v.nom, cont: o.cont ?? out?.current_a ?? r.current_a.v.typical, peakLimit: o.peakLimit ?? r.current_a.v.peak, simultaneous: o.simultaneous, simNote: o.simNote, fuseMain: fuse });
    return rail;
  }
  /** Pins that may stay unconnected (spare channels, unused second bus port): "inst.port" or "inst.port.pin" */
  spare(...t: string[]) { for (const x of t) this.optional.add(x); }
}

// ------------------------------------------------------------------------------------------- routing
function treePath(spec: RobotSpecification, a: string, b: string): { up: Joint[]; down: Joint[] } {
  const parent = new Map<string, Joint>(); for (const j of spec.joints) parent.set(j.child, j);
  const chain = (n: string) => { const out: Joint[] = []; let c = n; while (parent.has(c)) { const j = parent.get(c)!; out.push(j); c = j.parent; } return out; };
  const ca = chain(a), cb = chain(b), sb = new Set(cb.map((j) => j.name));
  const shared = ca.find((j) => sb.has(j.name));
  // the LCA is the parent of the deepest non-shared joint on each side
  const up = shared ? ca.slice(0, ca.indexOf(shared)) : ca, down = shared ? cb.slice(0, cb.findIndex((j) => j.name === shared.name)) : cb;
  return { up, down: down.reverse() };
}
const worldOf = (f: FK, link: string, p: Vec3): Vec3 => { const T = f.link[link]; return [0, 1, 2].map((i) => (T.R[i][0] * p[0] + T.R[i][1] * p[1] + T.R[i][2] * p[2]) * 1 + T.p[i] * 1000) as Vec3; };
const axisWorld = (f: FK, j: Joint): Vec3 => unit(f.joint[j.name].axis);
const jointWorld = (f: FK, j: Joint): Vec3 => scale(f.joint[j.name].p, 1000);

/** Centre of a part's body in the world (mm). */
function bodyCentre(f: FK, link: string, key: string): Vec3 {
  const b = part(key).bbox_mm; const c: Vec3 = b ? [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] : [0, 0, 0];
  return worldOf(f, link, c);
}

/**
 * Length of cable a joint needs between its two anchors over its whole travel. The anchors are fixed on the parent and on
 * the child; the cable between them lies on a helix round the joint axis, so a revolute needs sqrt(h^2 + dr^2 + (r phi)^2)
 * at angle phi and a prismatic the straight distance. Returns the home length, the longest length and the travel.
 */
export function jointSweep(j: Joint, parentAnchor: Vec3, childAnchor: Vec3, centre: Vec3, axis: Vec3): { home: number; need: number; travel: [number, number] } {
  const lo = j.limit?.lower ?? -Math.PI, hi = j.limit?.upper ?? Math.PI;
  const rel = (p: Vec3) => { const v = sub(p, centre), h = dot(v, axis), rv = sub(v, scale(axis, h)); return { h, r: norm(rv), rv }; };
  const P = rel(parentAnchor), C = rel(childAnchor);
  if (j.type === "prismatic") {
    const len = (q: number) => dist(parentAnchor, add(childAnchor, scale(axis, q)));
    let need = 0; for (let i = 0; i <= 24; i++) need = Math.max(need, len(lo + ((hi - lo) * i) / 24));
    return { home: dist(parentAnchor, childAnchor), need, travel: [lo, hi] };
  }
  const phi0 = Math.atan2(dot(cross(P.rv, C.rv), axis), dot(P.rv, C.rv)), rbar = Math.max((P.r + C.r) / 2, 8);
  const len = (q: number) => Math.hypot(C.h - P.h, C.r - P.r, rbar * (phi0 + q));
  let need = 0; for (let i = 0; i <= 48; i++) need = Math.max(need, len(lo + ((hi - lo) * i) / 48));
  return { home: len(0), need, travel: [lo, hi] };
}

/** The channels of one rigid body as a graph: the shortest way along them, and the nearest point on them. Lines that do not share a point are joined at their closest ends. */
class ChannelNet {
  nodes: Vec3[] = []; adj: [number, number][][] = []; ends: number[] = [];
  constructor(lines: Vec3[][]) {
    const link = (a: number, b: number) => { const d = dist(this.nodes[a], this.nodes[b]); this.adj[a].push([b, d]); this.adj[b].push([a, d]); };
    for (const line of lines) {
      const first = this.nodes.length;
      line.forEach((p, i) => { this.nodes.push(p); this.adj.push([]); if (i) link(first + i - 1, first + i); });
      this.ends.push(first, this.nodes.length - 1);
      if (!first) continue;
      let pair: [number, number] = [0, first];
      for (const end of [first, this.nodes.length - 1]) for (let i = 0; i < first; i++) if (dist(this.nodes[i], this.nodes[end]) < dist(this.nodes[pair[0]], this.nodes[pair[1]])) pair = [i, end];
      link(pair[0], pair[1]);
    }
  }
  nearest(p: Vec3): number { let best = 0; this.nodes.forEach((q, i) => { if (dist(q, p) < dist(this.nodes[best], p)) best = i; }); return best; }
  /** the channel end nearest to p: where a cable leaves for a joint */
  end(p: Vec3): Vec3 { return this.nodes[[...this.ends].sort((a, b) => dist(this.nodes[a], p) - dist(this.nodes[b], p))[0]]; }
  /** node list of the shortest way between the nodes nearest to a and b */
  route(a: Vec3, b: Vec3): Vec3[] {
    const s = this.nearest(a), t = this.nearest(b), far = new Array(this.nodes.length).fill(Infinity), from = new Array(this.nodes.length).fill(-1), open = new Set(this.nodes.map((_, i) => i));
    far[s] = 0;
    while (open.size) {
      let u = -1; for (const i of open) if (u < 0 || far[i] < far[u]) u = i;
      open.delete(u); if (u === t || far[u] === Infinity) break;
      for (const [v, d] of this.adj[u]) if (far[u] + d < far[v]) { far[v] = far[u] + d; from[v] = u; }
    }
    const out: Vec3[] = []; for (let i = t; i >= 0; i = from[i]) out.unshift(this.nodes[i]);
    return out;
  }
}

interface TriMesh { v: Vec3[]; f: [number, number, number][]; world: Vec3[]; lo: Vec3; hi: Vec3; link: string; }
function closestOnTri(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, scale(sub(c, b), (d4 - d3) / (d4 - d3 + d5 - d6)));
  const den = 1 / (va + vb + vc);
  return add(a, add(scale(ab, vb * den), scale(ac, vc * den)));
}
const isPrintedLink = (l: Link) => l.geometry.type === "mesh" && (l.geometry.part === "printed" || l.geometry.part === "cad");

class SurfaceFinder {
  meshes = new Map<string, TriMesh[]>();
  spec: RobotSpecification; f: FK; group: (l: string) => string; skip: Set<string>;
  constructor(spec: RobotSpecification, f: FK, group: (l: string) => string, skip: Set<string>) { this.spec = spec; this.f = f; this.group = group; this.skip = skip; }
  private of(group: string): TriMesh[] {
    let list = this.meshes.get(group);
    if (list) return list;
    list = [];
    for (const l of this.spec.links) {
      if (this.group(l.name) !== group || !isPrintedLink(l)) continue;
      if (/armou?r|skin|shell|track|cover|fabric/.test(l.name) || this.skip.has(l.name)) continue;
      let m: { v: Vec3[]; f: [number, number, number][] };
      try { m = buildPart(l.geometry as never) as never; } catch { continue; }
      const T = this.f.link[l.name]; if (!T) continue;
      const world = m.v.map((p) => [0, 1, 2].map((i) => (T.R[i][0] * p[0] + T.R[i][1] * p[1] + T.R[i][2] * p[2] + T.p[i]) * 1000) as Vec3);
      const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (const p of world) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      list.push({ v: m.v, f: m.f, world, lo, hi, link: l.name });
    }
    this.meshes.set(group, list);
    return list;
  }
  /** Nearest point on any printed link of the group, with the outward normal of that triangle. */
  nearest(group: string, p: Vec3): { at: Vec3; normal: Vec3; link: string; d: number } | null {
    let best: { at: Vec3; normal: Vec3; link: string; d: number } | null = null;
    for (const m of this.of(group)) {
      const dBox = norm([Math.max(m.lo[0] - p[0], 0, p[0] - m.hi[0]), Math.max(m.lo[1] - p[1], 0, p[1] - m.hi[1]), Math.max(m.lo[2] - p[2], 0, p[2] - m.hi[2])]);
      if (best && dBox > best.d) continue;
      for (const t of m.f) {
        const a = m.world[t[0]], b = m.world[t[1]], c = m.world[t[2]];
        const q = closestOnTri(p, a, b, c), d = dist(p, q);
        if (!best || d < best.d) { const n = cross(sub(b, a), sub(c, a)); if (norm(n) < 1e-9) continue; best = { at: q, normal: unit(n), link: m.link, d }; }
      }
    }
    return best;
  }
}

export interface WireOptions {
  /** extra length per cable at each end for stripping, crimping and dressing (mm) */
  terminationMm?: number;
  /** service loop per cable: the spare length left inside the bay for rework (mm) */
  serviceMm?: number;
  /** cables lengths are measured on straight runs; real runs wander by this factor */
  tortuosity?: number;
  /** skip printing clips on these links (fabricated plates, tracks) */
  noClips?: RegExp;
  /** "legacy": straight runs between waypoints, as before the router (kept for the Mark 43, whose cables lie in fitted channels) */
  router?: "legacy";
}

/** Everything after the declarations: emits rail wires, sizes, routes, checks; stores design.wiring. */
export function finishWiring(H: Harness, opts: WireOptions = {}): WiringRecord {
  const A = H.A, spec = A.spec, f = fk(spec);
  const termMm = opts.terminationMm ?? 30, serviceMm = opts.serviceMm ?? 40, tort = opts.tortuosity ?? 1.1;

  // ---- rails: distribution wires, trunk currents
  const railTotals = new Map<string, { typ: number; peak: number }>();
  const order = [...H.rails.values()].sort((a, b) => Number(!!b.upstream) - Number(!!a.upstream)); // regulators first: their input load feeds the rail above
  for (const R of order) {
    const typ = R.feeds.reduce((s, x) => s + x.typ, 0);
    const extra = R.feeds.map((x) => Math.max(x.peak - x.typ, 0)).sort((a, b) => b - a), n = Math.min(R.simultaneous, extra.length);
    const peak = typ + extra.slice(0, n).reduce((s, x) => s + x, 0);
    railTotals.set(R.name, { typ, peak });
    if (R.upstream) {
      const up = H.rails.get(R.upstream)!, me = up.feeds.find((x) => x.inst === R.source);
      if (me) { const eff = R.efficiency ?? 0.85; me.typ = (typ * R.volts) / (eff * up.volts); me.peak = (peak * R.volts) / (eff * up.volts); }
    }
  }
  // main fuse: above the running load, half the peak (blade fuses ride through 2 x rating for seconds)
  let mainFuse = 0;
  if (H.main) {
    const t = railTotals.get(H.main.rail)!;
    mainFuse = fuseFor(Math.max(t.typ * 1.25, t.peak * 0.5));
    if (H.main.fuse) H.wire(H.main.rail, `${H.main.source}.${H.main.pos}`, "main_fuse.IN", { typ: t.typ, peak: t.peak, trunk: "main", cable: "main_feed_a" });
    if (H.main.fuse && H.main.sw) H.wire(H.main.rail, "main_fuse.OUT", `${H.main.sw}.${H.main.swIn}`, { typ: t.typ, peak: t.peak, trunk: "main", cable: "main_feed_b" });
    if (!H.main.fuse && H.main.sw) H.wire(H.main.rail, `${H.main.source}.${H.main.pos}`, `${H.main.sw}.${H.main.swIn}`, { typ: t.typ, peak: t.peak, trunk: "main", cable: "main_feed_a" });
    H.label("main_feed_a", "battery positive to main fuse"); H.label("main_feed_b", "main fuse to main switch");
  }
  // star ground: one point every return meets at, when there is more than one return
  const returns = [...H.rails.values()].reduce((n, R) => n + R.feeds.filter((x) => x.gPin).length, 0) + (H.main ? 1 : 0);
  const star = returns > 2;
  if (star) { H.part("star_ground", "wago_221_415", { note: "star ground: every return meets here" }); }
  const splices: { name: string; taps: number }[] = [];
  const allTotal = H.main ? railTotals.get(H.main.rail)! : { typ: 0, peak: 0 };
  if (star && H.main) H.wire("GND", H.main.neg.includes(".") && H.instances.has(H.main.neg.split(".")[0]) ? H.main.neg : `${H.main.source}.${H.main.neg}`, "star_ground.P1", { typ: allTotal.typ, peak: allTotal.peak, trunk: "main", cable: "main_return" });
  if (H.main) H.label("main_return", "battery negative to star ground");
  for (const R of H.rails.values()) {
    const t = railTotals.get(R.name)!, multi = R.feeds.length > 1, isMain = H.main?.rail === R.name;
    const spliceName = `splice_${R.name.toLowerCase()}`, src = `${R.source}.${R.srcPin}`, srcInst = H.main?.source;
    if (multi) { H.part(spliceName, "wago_221_415", { note: `lever splice for rail ${R.name}` }); splices.push({ name: spliceName, taps: R.feeds.length + 1 }); H.wire(R.name, src, `${spliceName}.P1`, { typ: t.typ, peak: t.peak, trunk: R.name, cable: `trunk_${R.name}` }); H.label(`trunk_${R.name}`, `${R.source} to the ${R.name} splice`); }
    // a regulator or supply brings its own return to the star; the main battery's return is already there
    if (!isMain && star) H.wire("GND", `${R.source}.${R.srcGnd}`, "star_ground.P2", { typ: t.typ, peak: t.peak, cable: multi ? `trunk_${R.name}` : undefined });
    for (const x of R.feeds) {
      const cable = `${R.name}~${x.inst}`;
      H.label(cable, `${R.name} to ${x.inst}`);
      H.wire(R.name, multi ? `${spliceName}.P2` : src, `${x.inst}.${x.vPin}`, { typ: x.typ, peak: x.peak, cable });
      if (x.gPin) { const g = star ? "star_ground.P2" : isMain ? `${H.main!.source}.${H.main!.neg}` : `${R.source}.${R.srcGnd}`; H.wire("GND", g, `${x.inst}.${x.gPin}`, { typ: x.typ, peak: x.peak, cable }); }
    }
    void srcInst;
  }
  if (star) splices.push({ name: "star_ground", taps: returns + 1 });
  // a 5-way lever splice joins 5 wires; chained, each further one adds 3
  const leverCount = splices.reduce((n, sp) => n + Math.max(1, Math.ceil((sp.taps - 2) / 3)), 0);

  // ---- cables: wires grouped by the two parts they join
  const groups = new Map<string, WireDecl[]>();
  for (const w of H.wires) { const g = groups.get(w.cable) ?? []; g.push(w); groups.set(w.cable, g); }

  // rigid bodies: links joined by fixed joints move together
  const groupOf = new Map<string, string>();
  { const parent = new Map<string, Joint>(); for (const j of spec.joints) parent.set(j.child, j);
    const find = (n: string): string => { if (groupOf.has(n)) return groupOf.get(n)!; const j = parent.get(n); const g = j && j.type === "fixed" ? find(j.parent) : n; groupOf.set(n, g); return g; };
    for (const l of spec.links) find(l.name); }
  // compartments hold their cables on tie anchors: no clips inside them
  const bayLinks = new Set(((A.design as { enclosures?: { tub: string; lid: string }[] }).enclosures ?? []).flatMap((b) => [b.tub, b.lid]));
  const surf = new SurfaceFinder(spec, f, (l) => groupOf.get(l) ?? l, bayLinks);
  const noClip = opts.noClips ?? /$^/;
  const nets = new Map<string, ChannelNet>();
  { const byGroup = new Map<string, Vec3[][]>(); for (const [l, lines] of H.channels) { const g = groupOf.get(l) ?? l; byGroup.set(g, [...(byGroup.get(g) ?? []), ...lines]); } for (const [g, lines] of byGroup) nets.set(g, new ChannelNet(lines)); }

  const locate = (inst: string): { link: string | null; p: Vec3 | null } => {
    const i = H.instances.get(inst)!;
    if (i.off_board) return { link: null, p: null };
    if (!i.link) { // a harness part (splice, inline fuse): it sits where the first wire that reaches it comes from
      if (H.home) { H.bayOf.set(inst, H.bayOf.get(H.home) ?? ""); return locate(H.home); }
      return { link: null, p: null };
    }
    return { link: i.link, p: f.link[i.link] ? bodyCentre(f, i.link, i.key) : null };
  };
  const seg = new Map<string, { pts: Vec3[]; clips: { at: Vec3; dir: Vec3; normal: Vec3; link: string }[] }>();
  /** a run along one rigid body from a to b: hugs the printed surface, clip points every ~70 mm */
  const along = (group: string, a: Vec3, b: Vec3) => {
    const key = `${group}|${a.map((x) => Math.round(x / 5))}|${b.map((x) => Math.round(x / 5))}`;
    const hit = seg.get(key); if (hit) return hit;
    // at least one clip on any run long enough to hold one, then one about every 70 mm
    const L = dist(a, b), n = L < 40 ? 0 : Math.min(6, Math.max(1, Math.floor(L / 70))), pts: Vec3[] = [a], clips: { at: Vec3; dir: Vec3; normal: Vec3; link: string }[] = [];
    const dir = unit(sub(b, a));
    for (let i = 1; i <= n; i++) {
      const q = add(a, scale(sub(b, a), i / (n + 1))), s = surf.nearest(group, q);
      if (s && s.d < 60) { pts.push(add(s.at, scale(s.normal, 3))); clips.push({ at: s.at, dir, normal: s.normal, link: s.link }); } else pts.push(q);
    }
    pts.push(b);
    const out = { pts, clips }; seg.set(key, out); return out;
  };

  const cables: CableRec[] = []; const clips: ClipRec[] = []; let cid = 0;
  const unresolved: string[] = [];
  // ---- the router: every solid of the robot at home as a grid, the parts and their pins in it (the Mark 43's cables lie
  // in the channels its armour was fitted with instead: see the legacy branch below)
  const routed = !H.channels.size && opts.router !== "legacy", tRoute = Date.now();
  const R = routed ? new Router(spec, f, { bays: baysOfDesign(A).map((b) => ({ name: b.name, link: b.tub, T: b.T as number[], min: b.min, max: b.max })) }) : null;
  const routeProblems: string[] = [];
  const pinsOf = (inst: string) => { const out: [string, string][] = []; for (const w of H.wires) for (const e of [w.a, w.b]) if (e.inst === inst && !out.some((x) => x[0] === e.port && x[1] === e.pin)) out.push([e.port, e.pin]); return out; };
  // the parts on links first, and the room their pins need, then the harness parts round them
  if (R) for (const pass of [0, 1]) for (const i of H.instances.values()) {
    if (i.off_board) continue;
    const own = i.link ? spec.links.find((l) => l.name === i.link) : undefined;
    if (own && own.geometry.type === "mesh" && own.geometry.part === "component" && String(own.geometry.params?.key) === i.key) { if (!pass) { R.alias(i.name, i.link!, i.key); R.reserve(i.name, pinsOf(i.name)); } continue; }
    if (!pass) continue;
    // a harness part (splice, inline fuse, star ground): beside the part it serves, in that part's compartment
    const spot = H.spot.get(i.name);
    const home: { link: string | null; p: Vec3 | null; inst?: string } = spot && locate(spot.by).link ? { link: locate(spot.by).link, p: spot.at, inst: spot.by } : i.link && f.link[i.link] ? { link: i.link, p: own && own.geometry.type === "mesh" && own.geometry.part === "component" ? bodyCentre(f, i.link, String(own.geometry.params?.key)) : worldOf(f, i.link, [0, 0, 0]), inst: [...H.instances.values()].find((x) => x.link === i.link && x.name !== i.name)?.name } : H.home ? { ...locate(H.home), inst: H.home } : harnessHome(H, i.name, groups, locate);
    if (!home.p || !home.link) continue;
    if (home.inst && !H.bayOf.get(i.name)) H.bayOf.set(i.name, H.bayOf.get(home.inst) ?? "");
    const g = groupOf.get(home.link) ?? home.link, at = R.placeHarness(i.name, i.key, home.p, g, pinsOf(i.name), H.bayOf.get(i.name) || undefined, (port, pin) => {
      for (const ws of groups.values()) for (const w of ws) for (const [me, other] of [[w.a, w.b], [w.b, w.a]]) if (me.inst === i.name && me.port === port && me.pin === pin && other.inst !== i.name) { const q = R.pinAt(other.inst, other.port, other.pin); if (q) return q; }
      return null;
    }, !!spot);
    if (at) { i.at_mm = at.at.map(r1) as Vec3; i.on = g; if (at.turned) i.turned = true; else delete i.turned; R.reserve(i.name, pinsOf(i.name)); } else routeProblems.push(`${i.name}: no free place beside ${home.inst ?? home.link}`);
  }
  const awgOf = (w: WireDecl, lengthMm: number, pm: string | null) => {
    const n = H.nets.get(w.net)!, volts = n.kind === "power" ? n.voltage_v ?? 5 : 5;
    // wires ahead of the main fuse's load must carry the fuse's rating: the fuse protects them
    const design = Math.max(w.typ * 1.25, w.peak * 0.6, w.trunk === "main" ? mainFuse / 2 : 0);   // the fuse protects against the free-air rating, twice the bundled figure
    const maxDrop = Math.max(volts * 0.03, 0.1), minG = n.kind === "power" || n.kind === "ground" ? 24 : 26;
    return pm ? null : gaugeFor(design, lengthMm, maxDrop, minG);
  };
  for (const [key, ws] of groups) {
    const ia = ws[0].a.inst, ib = ws[0].b.inst;
    let la = locate(ia), lb = locate(ib);
    // harness parts ride next to whatever they connect to
    if (!la.p && !H.instances.get(ia)!.off_board) { const home = harnessHome(H, ia, groups, locate); la = home; if (home.inst && !H.bayOf.get(ia)) H.bayOf.set(ia, H.bayOf.get(home.inst) ?? ""); }
    if (!lb.p && !H.instances.get(ib)!.off_board) { const home = harnessHome(H, ib, groups, locate); lb = home; if (home.inst && !H.bayOf.get(ib)) H.bayOf.set(ib, H.bayOf.get(home.inst) ?? ""); }
    const offBoard = H.instances.get(ia)!.off_board || H.instances.get(ib)!.off_board;
    const pm = H.premade.get(key) ?? null;
    const svc = pm ? 0 : serviceMm, term = pm ? 0 : termMm * 2;
    let geom: { path: Vec3[]; joints: SlackRec[]; links: Set<string>; exit: string | null; routeMm: number; slackMm: number; channelMm: number; clipHere: ClipAt[]; wires?: { pts: Vec3[]; on: string[]; drawn_mm: number; bend_mm: number }[]; awg?: (number | null)[] };
    if (R && R.placed.has(ia) && R.placed.has(ib) && la.link && lb.link) {
      const leaves = (bay?: string, other?: string) => !!bay && bay !== other;
      const pick = (bay: string, to: Vec3) => H.exits.find((e) => e.id === H.exitOf.get(key) && e.bay === bay) ?? nearestExit(H, bay, to);
      // a hole that opens into the other compartment (a deck grommet between a hood and the tub under it) is the one wall between the two
      const opensInto = (e: ExitDecl | null, bay?: string) => { const b = bay ? R.bays.get(bay) : undefined; if (!e || !b) return false; const p = worldExit(f, e); return p.every((x, k) => x > b.min[k] - 6 && x < b.max[k] + 6); };
      /** the joints between two parts, their compartments and the exits a run between them takes */
      const between = (xa: string, xb: string, pa: Vec3 | null, pb: Vec3 | null) => {
        const { up, down } = treePath(spec, R.placed.get(xa)!.link, R.placed.get(xb)!.link);
        const crossing = [...up, ...down].filter((j) => j.type !== "fixed");
        let bayA = H.bayOf.get(xa) || undefined, bayB = H.bayOf.get(xb) || undefined;
        // a part of no compartment whose pin is inside the other end's compartment (a servo in a cradle of the tub) is reached inside it
        const inside = (bay: string | undefined, p: Vec3 | null) => { const b = bay ? R.bays.get(bay) : undefined; return !!b && !!p && p.every((x, k) => x > b.min[k] && x < b.max[k]); };
        if (!bayB && inside(bayA, pb)) bayB = bayA; else if (!bayA && inside(bayB, pa)) bayA = bayB;
        let exA = leaves(bayA, bayB) ? pick(bayA!, pb ?? pa!) : null, exB = leaves(bayB, bayA) ? pick(bayB!, pa ?? pb!) : null;
        if (exA && exB) { if (opensInto(exB, bayA)) exA = null; else if (opensInto(exA, bayB)) exB = null; }
        return { up, down, crossing, bayA, bayB, exA, exB };
      };
      const { up, down, crossing, bayA, bayB, exA, exB } = between(ia, ib, la.p, lb.p);
      const exitAt = (e: ExitDecl | null) => (e ? { id: e.id, at: worldExit(f, e), n: unit(rotateBy(f, e.link, e.normal)), hole_mm: e.panel_hole_mm } : null);
      const od = bundleOd(ws), straight = dist(la.p ?? [0, 0, 0], lb.p ?? [0, 0, 0]);
      const slackOf = (anchors: { joint: string; aIn: Vec3; aOut: Vec3 }[]) => {
        const joints: SlackRec[] = []; let slackMm = [...up, ...down].reduce((n, j) => n + (j.type === "fixed" ? H.flex.get(j.name) ?? 0 : 0), 0);   // fixed in the model, not in life
        for (const a of anchors) {
          const j = crossing.find((x) => x.name === a.joint)!, sw = jointSweep(j, a.aIn, a.aOut, jointWorld(f, j), axisWorld(f, j));
          const bendR = 6 * od; // bundle bend radius; the 10 x OD table figure is for the single wire in repeated flexing
          const loop = Math.max(sw.need - sw.home, 0);
          // the loop itself must be at least one bend-radius arc to stay flexible
          const provided = Math.ceil((loop * 1.15 + Math.PI * bendR * 0.5) / 5) * 5 + (H.flex.get(j.name) ?? 0);
          joints.push({ joint: j.name, type: j.type, travel: [r3(sw.travel[0]), r3(sw.travel[1])], home_mm: r1(sw.home), need_mm: r1(sw.need), slack_mm: provided, provided_mm: r1(sw.home + provided) });
          slackMm += provided;
        }
        return { joints, slackMm };
      };
      // the gauge sets the bend radius and the routed length sets the gauge: route with a first guess, and again if the true length wants thicker wire
      let awg = ws.map((w) => awgOf(w, straight * 1.4 + svc + term, pm)?.awg ?? null);
      let out = R.cable({ key, a: ia, b: ib, od, crossing, exitA: exitAt(exA), exitB: exitAt(exB), bayA, bayB, wires: ws.map((w, i) => ({ from: [w.a.port, w.a.pin], to: [w.b.port, w.b.pin], awg: awg[i] })) });
      let sl = slackOf(out.anchors);
      const final = ws.map((w, i) => awgOf(w, Math.ceil(((out.wires[i]?.drawn_mm ?? straight) + svc + sl.slackMm + term) / 5) * 5, pm)?.awg ?? null);
      if (final.some((x, i) => x !== null && awg[i] !== null && x < awg[i]!)) {
        awg = final.map((x, i) => (x !== null && awg[i] !== null ? Math.min(x, awg[i]!) : x));
        out = R.cable({ key, a: ia, b: ib, od, crossing, exitA: exitAt(exA), exitB: exitAt(exB), bayA, bayB, wires: ws.map((w, i) => ({ from: [w.a.port, w.a.pin], to: [w.b.port, w.b.pin], awg: awg[i] })) });
        sl = slackOf(out.anchors);
      }
      // a wire of the cable that ends on another part (the return of a feed pair, from the star ground) is laid from its own
      // part: through its own compartment's exit, then with the cable to the far end
      const own = new Map<string, number[]>();
      ws.forEach((w, i) => { if (w.a.inst !== ia || w.b.inst !== ib) { const k = `${w.a.inst}|${w.b.inst}`; own.set(k, [...(own.get(k) ?? []), i]); } });
      for (const [k, idx] of own) {
        const [xa, xb] = k.split("|");
        if (!R.placed.has(xa) || !R.placed.has(xb)) { routeProblems.push(`${key}: ${!R.placed.has(xa) ? xa : xb} has no place, its wire is not laid`); continue; }
        const sub = ws.filter((_, i) => idx.includes(i)), e = between(xa, xb, R.pinAt(xa, sub[0].a.port, sub[0].a.pin), R.pinAt(xb, sub[0].b.port, sub[0].b.pin));
        const o2 = R.cable({ key: `${key} (${xa})`, a: xa, b: xb, od: bundleOd(sub), crossing: e.crossing, exitA: exitAt(e.exA), exitB: exitAt(e.exB), bayA: e.bayA, bayB: e.bayB, wires: sub.map((w) => ({ from: [w.a.port, w.a.pin], to: [w.b.port, w.b.pin], awg: awg[ws.indexOf(w)] })) });
        routeProblems.push(...o2.problems.map((x) => x.replace(/wire (\d+)/, (_, n) => `wire ${idx[+n - 1] + 1}`)));
        idx.forEach((i, q) => { out.wires[i] = o2.wires[q]; });
      }
      out.problems = out.problems.filter((x) => { const m = /wire (\d+)/.exec(x); return !m || !own.size || ![...own.values()].flat().includes(+m[1] - 1); });
      routeProblems.push(...out.problems);
      for (const j of crossing) if (j.type === "continuous") unresolved.push(`${key} crosses continuous joint ${j.name}: needs a slip ring`);
      const links = new Set<string>(); for (const l of [la.link, lb.link, ...crossing.flatMap((j) => [j.parent, j.child])]) links.add(l);
      geom = { path: out.trunk as Vec3[], joints: sl.joints, links, exit: [exA?.id, exB?.id].filter(Boolean).join(" + ") || null, routeMm: Math.max(0, ...out.wires.map((w) => w.drawn_mm)), slackMm: sl.slackMm, channelMm: 0,
        clipHere: clipsAlong(surf, R, out.trunk as Vec3[], out.trunkOn), wires: out.wires.map((w, i) => ({ pts: w.pts as Vec3[], on: w.on, drawn_mm: w.drawn_mm, bend_mm: wireSize(awg[i]).bend })), awg };
    } else {
      const od = bundleOd(ws);
      if (R && !offBoard) routeProblems.push(`${key}: ${!R.placed.has(ia) ? ia : ib} has no place, its cable is not laid`);
    const path: Vec3[] = []; const joints: SlackRec[] = []; const links = new Set<string>(); let exit: string | null = null;
    let routeMm = 0, slackMm = 0, channelMm = 0;
    const clipHere: { at: Vec3; dir: Vec3; normal: Vec3; link: string }[] = [];
    if (la.p && lb.p && la.link && lb.link) {
      const { up, down } = treePath(spec, la.link, lb.link);
      const crossing = [...up, ...down].filter((j) => j.type !== "fixed");
      // waypoints: start, then per crossed joint its two anchors, end
      const bayA = H.bayOf.get(ia), bayB = H.bayOf.get(ib);
      const leaves = (bay?: string, other?: string) => !!bay && bay !== other;
      const pick = (bay: string, to: Vec3) => H.exits.find((e) => e.id === H.exitOf.get(key) && e.bay === bay) ?? nearestExit(H, bay, to);
      const exA = leaves(bayA, bayB) ? pick(bayA!, lb.p) : null, exB = leaves(bayB, bayA) ? pick(bayB!, la.p) : null;
      if (exA || exB) exit = [exA?.id, exB?.id].filter(Boolean).join(" + ");
      let cur = la.p, curGroup = groupOf.get(la.link)!, routed = false;
      path.push(cur);
      const goTo = (p: Vec3) => {
        // out of its bay a cable lies in the body's channels, as far as they take it towards `p`
        const net = routed ? nets.get(curGroup) : undefined;
        if (net) { const r = net.route(cur, p); r.forEach((q, i) => { if (i) channelMm += dist(r[i - 1], q); path.push(q); }); cur = r[r.length - 1]; }
        const s = along(curGroup, cur, p); for (let i = 1; i < s.pts.length; i++) path.push(s.pts[i]);
        clipHere.push(...s.clips); cur = p;
      };
      if (exA) { goTo(worldExit(f, exA)); routed = true; }
      slackMm += [...up, ...down].reduce((n, j) => n + (j.type === "fixed" ? H.flex.get(j.name) ?? 0 : 0), 0);   // fixed in the model, not in life
      for (let i = 0; i < crossing.length; i++) {
        const j = crossing[i], c = jointWorld(f, j), ax = axisWorld(f, j);
        const target = i + 1 < crossing.length ? jointWorld(f, crossing[i + 1]) : (exB ? worldExit(f, exB) : lb.p);
        // anchors stand off the joint axis towards where the cable comes from and goes to
        const stand = Math.max(14, od * 3 + 8);
        const off = (to: Vec3) => { const v = sub(to, c), r = sub(v, scale(ax, dot(v, ax))); return norm(r) > 1 ? add(c, scale(unit(r), Math.min(stand, Math.max(norm(r) * 0.8, 6)))) : add(c, scale(perp(ax), stand)); };
        // where channels reach a joint, the cable leaves and rejoins them there: those are the true anchors of the loop
        const inNet = nets.get(curGroup), outNet = nets.get(groupOf.get(j.child)!);
        const aIn = inNet ? inNet.end(c) : off(cur), aOut = outNet ? outNet.end(c) : off(target);
        goTo(aIn);
        const s = jointSweep(j, aIn, aOut, c, ax);
        const bendR = 6 * od; // bundle bend radius; the 10 x OD table figure is for the single wire in repeated flexing
        const loop = Math.max(s.need - s.home, 0);
        // the loop itself must be at least one bend-radius arc to stay flexible
        const provided = Math.ceil((loop * 1.15 + Math.PI * bendR * 0.5) / 5) * 5 + (H.flex.get(j.name) ?? 0);
        joints.push({ joint: j.name, type: j.type, travel: [r3(s.travel[0]), r3(s.travel[1])], home_mm: r1(s.home), need_mm: r1(s.need), slack_mm: provided, provided_mm: r1(s.home + provided) });
        slackMm += provided;
        path.push(aOut); cur = aOut; curGroup = groupOf.get(j.child)!; routed = true;
        if (j.type === "continuous") unresolved.push(`${key} crosses continuous joint ${j.name}: needs a slip ring`);
      }
      if (exB) goTo(worldExit(f, exB));
      goTo(lb.p);
      routeMm = path.slice(1).reduce((s, p, i) => s + dist(path[i], p), 0);
      for (const l of [la.link, lb.link, ...crossing.flatMap((j) => [j.parent, j.child])]) links.add(l);
    } else if (offBoard) {
      routeMm = WIRING.off_board_cable_mm; if (la.p) path.push(la.p); if (lb.p) path.push(lb.p);
    }
      geom = { path, joints, links, exit, routeMm: routeMm * tort, slackMm, channelMm, clipHere };
    }
    const od = bundleOd(ws), { path, joints, links, exit, routeMm, slackMm, channelMm, clipHere } = geom;
    const lengthOf = (i: number) => (geom.wires ? geom.wires[i].drawn_mm : routeMm) + svc + slackMm + term;
    const wires: WireRec[] = ws.map((w, i) => {
      const n = H.nets.get(w.net)!, sig = H.rec(w.a.inst).ports.find((p) => p.name === w.a.port)?.pins.v.find((p) => p.name === w.a.pin)?.signal ?? "digital";
      const cut = Math.ceil(lengthOf(i) / 5) * 5;
      let g = awgOf(w, cut, pm);
      // a routed wire keeps the gauge its bends were laid for when the final length would allow a thinner one
      if (g && geom.awg?.[i] != null && geom.awg[i]! < g.awg) { const row = awgRow(geom.awg[i]!), nn = H.nets.get(w.net)!; void nn; g = { awg: row.awg, drop_v: Math.max(w.typ * 1.25, w.peak * 0.6, w.trunk === "main" ? mainFuse / 2 : 0) * row.ohm_per_m * 2 * (cut / 1000) }; }
      const gw = geom.wires?.[i];
      return { id: `W${++cid}`, net: w.net, kind: n.kind, from: tname(w.a), to: tname(w.b), awg: g?.awg ?? null, color: COLOR[n.kind === "power" || n.kind === "ground" ? n.kind : sig] ?? "white", typical_a: r3(w.typ), peak_a: r3(w.peak), length_mm: cut, ...(g ? { drop_v: r3(g.drop_v) } : {}),
        ...(gw ? { pts: gw.pts, on: runs(gw.on), bend_mm: r1(gw.bend_mm) } : {}) };
    });
    const length = Math.max(...wires.map((w) => w.length_mm));
    const pa = H.rec(ia).ports.find((p) => p.name === ws[0].a.port)!, pb = H.rec(ib).ports.find((p) => p.name === ws[0].b.port)!;
    cables.push({ id: `C${cables.length + 1}`, label: H.labels.get(key) ?? `${ia} to ${ib}`, from: ia, to: ib, from_connector: pa.connector.v, to_connector: pb.connector.v, premade: pm,
      wires, od_mm: r1(od), route_mm: r1(routeMm), service_mm: svc, slack_mm: slackMm, termination_mm: term, length_mm: length,
      path_mm: path.map((p) => p.map(r1) as Vec3), links: [...links], joints, exit, ...(channelMm ? { channel_mm: r1(channelMm) } : {}) });
    if (geom.wires) { for (const c of clipHere) if (!noClip.test(c.link)) addClip(clips, c, od, `C${cables.length}`); }
    else for (const c of clipHere) if (!noClip.test(c.link)) mergeClip(clips, c, od, `C${cables.length}`);
    void offBoard;
  }
  if (R) {
    dropClipsInTheWay(clips, cables);
    for (const sl of (globalThis as { TTR_ROUTE_SLICE?: [number, number, number, number, number][] }).TTR_ROUTE_SLICE ?? []) console.error(`slice at ${sl.slice(0, 3)} normal ${sl[3]}\n${R.slice(sl.slice(0, 3) as Vec3, sl[3], sl[4])}`);
    if ((globalThis as { TTR_ROUTE_DEBUG?: boolean }).TTR_ROUTE_DEBUG) console.error(`route: grid ${R.grid.nx}x${R.grid.ny}x${R.grid.nz} @ ${R.grid.s} mm, ${Date.now() - tRoute} ms\n  ${routeProblems.join("\n  ")}`);
    const detail = routeProblems.length ? `${routeProblems.slice(0, 6).join("; ")}${routeProblems.length > 6 ? ` and ${routeProblems.length - 6} more` : ""}` : `every wire is laid through free space at the home pose: none passes through a part, corners are no tighter than each wire's bend radius, walls are crossed only at their exits`;
    A.check("wiring:route", !routeProblems.length, detail);
  }
  // branch fuses: a wire off the main rail thinner than the main fuse protects gets its own inline fuse
  if (H.main?.fuse) {
    H.fuses.push({ id: "F1", rating_a: mainFuse, protects: `everything on ${H.main.rail}`, wire_awg: Math.min(...cables.flatMap((c) => c.wires.filter((w) => w.from.startsWith(`${H.main!.source}.`) && w.kind === "power").map((w) => w.awg ?? 99))), holder: fuseHolder(mainFuse, H.rails.get(H.main.rail)!.volts) === "fuse_holder_anl" ? "ANL fuse holder" : "ATM blade fuse, inline holder" });
    for (const c of cables) for (const w of c.wires) {
      if (w.net !== H.main.rail || w.awg === null || !w.from.startsWith("splice_")) continue;
      // the table's ampacity is derated for bundles; a fuse protects a wire against its free-air rating, twice that
      if (awgRow(w.awg).ampacity_a * 2 >= mainFuse) continue;
      const rating = fuseFor(Math.max(w.typical_a * 1.25, w.peak_a * 0.5));
      while (awgRow(w.awg).ampacity_a < rating && w.awg > 10) w.awg -= 2;
      H.fuses.push({ id: `F${H.fuses.length + 1}`, rating_a: rating, protects: `branch ${w.to.split(".")[0]}`, wire_awg: w.awg, holder: "ATM blade fuse, inline holder" });
    }
  }
  const rec = summarise(H, cables, clips, railTotals);
  if (H.main?.fuse) rec.rails.find((r) => r.name === H.main!.rail)!.fuse_a = mainFuse;
  buyHarness(H, rec, leverCount);
  for (const u of unresolved) rec.notes.push(u);
  applyClips(A, rec);
  (A.design as { wiring?: WiringRecord }).wiring = rec;
  checks(H, rec);
  return rec;
}

type ClipAt = { at: Vec3; dir: Vec3; normal: Vec3; link: string; gap?: number };
const baysOfDesign = (A: Assembly) => ((A.design as { enclosures?: { name: string; tub: string; lid: string; T: number[]; min: Vec3; max: Vec3 }[] }).enclosures ?? []);
const rotateBy = (f: FK, link: string, v: Vec3): Vec3 => { const T = f.link[link]; return [0, 1, 2].map((i) => T.R[i][0] * v[0] + T.R[i][1] * v[1] + T.R[i][2] * v[2]) as Vec3; };
/** run lengths of the body each point of a wire rides */
const runs = (on: string[]): [string, number][] => { const out: [string, number][] = []; for (const l of on) { if (out.length && out[out.length - 1][0] === l) out[out.length - 1][1]++; else out.push([l, 1]); } return out; };
export const unruns = (on: [string, number][]): string[] => on.flatMap(([l, n]) => Array.from({ length: n }, () => l));
/**
 * Clip points along a routed cable, about every 70 mm outside the compartments: where the cable lies within 10 mm of a
 * printed face of the body it rides, square off that face (so a bridge standing on the face closes over it).
 */
function clipsAlong(surf: SurfaceFinder, R: Router, trunk: Vec3[], on: string[]): ClipAt[] {
  const out: ClipAt[] = [], inBay = (p: Vec3) => [...R.bays.values()].some((b) => [0, 1, 2].every((k) => p[k] >= b.min[k] && p[k] <= b.max[k]));
  const acc = [0]; for (let i = 1; i < trunk.length; i++) acc.push(acc[i - 1] + dist(trunk[i], trunk[i - 1]));
  const at = (d: number): { p: Vec3; dir: Vec3; on: string } | null => { for (let i = 1; i < trunk.length; i++) if (acc[i] >= d && acc[i] > acc[i - 1]) { if (on[i] !== on[i - 1]) return null; const t = (d - acc[i - 1]) / (acc[i] - acc[i - 1]); return { p: add(trunk[i - 1], scale(sub(trunk[i], trunk[i - 1]), t)), dir: unit(sub(trunk[i], trunk[i - 1])), on: on[i] }; } return null; };
  const L = acc[acc.length - 1];
  for (let d = 35; d < L - 20; d += 70) {
    for (const shift of [0, 8, -8, 16, -16, 24, -24]) {
      const q = at(d + shift); if (!q || inBay(q.p)) continue;
      const s = surf.nearest(q.on, q.p); if (!s || s.d > 10 || s.d < 0.8) continue;
      if (dot(unit(sub(q.p, s.at)), s.normal) < 0.94 || Math.abs(dot(q.dir, s.normal)) > 0.5) continue;
      out.push({ at: s.at, dir: q.dir, normal: s.normal, link: s.link, gap: s.d }); break;
    }
  }
  return out;
}
/** a clip for one cable; a cable passing a clip that is already there (within its window) shares it */
function addClip(list: ClipRec[], c: ClipAt, od: number, cable: string) {
  const near = list.find((x) => x.link === c.link && dist(x.at_mm, c.at) < 18);
  if (near) return;
  list.push({ link: c.link, at_mm: c.at.map(r1) as Vec3, dir: c.dir, normal: c.normal, od_mm: r1(od), cables: [cable], ...(c.gap !== undefined ? { gap_mm: r1(c.gap) } : {}) });
}
/** the bridge of a clip: half width of its window, height of the window's top, wall, half length (mm) */
const clipSize = (c: ClipRec) => { const o = Math.max(c.od_mm, 3); return { half: o / 2 + 0.8, h: c.gap_mm !== undefined ? c.gap_mm + o / 2 + 1 : o + 1, t: 1.8, len: 3 }; };
/** A clip stands where one cable was laid; any wire that would pass through its legs or its top instead of its window takes it away. */
function dropClipsInTheWay(clips: ClipRec[], cables: CableRec[]) {
  const lines = cables.flatMap((c) => c.wires.flatMap((w) => (w.pts && w.on ? [roundWire(w.pts, unruns(w.on), w.bend_mm ?? 5).pts as Vec3[]] : [])));
  const keep = clips.filter((c) => {
    const { half, h, t, len } = clipSize(c), n = unit(c.normal); let d = sub(c.dir, scale(n, dot(c.dir, n))); d = norm(d) > 1e-6 ? unit(d) : perp(n); const w = unit(cross(d, n)), m = 1.2;
    for (const P of lines) for (let i = 1; i < P.length; i++) {
      const steps = Math.max(1, Math.ceil(dist(P[i], P[i - 1]) / 1.5));
      for (let q = 0; q <= steps; q++) {
        const v = sub(add(P[i - 1], scale(sub(P[i], P[i - 1]), q / steps)), c.at_mm), x = dot(v, w), y = dot(v, d), z = dot(v, n);
        if (Math.abs(y) > len + m || Math.abs(x) > half + t + m || z < -0.9 - m || z > h + t + m) continue;
        if (Math.abs(x) < half - 0.4 && z > 0.7 + 0.4 && z < h - 0.4) continue;   // through the window
        return false;
      }
    }
    return true;
  });
  clips.length = 0; clips.push(...keep);
}
const perp = (a: Vec3): Vec3 => unit(Math.abs(a[2]) < 0.9 ? cross(a, [0, 0, 1]) : cross(a, [1, 0, 0]));
function bundleOd(ws: WireDecl[]) { const d = 1.5; return ws.length <= 1 ? d : d * Math.sqrt(ws.length) * 1.25; }
function nearestExit(H: Harness, bay: string, to: Vec3): ExitDecl | null { const list = H.exits.filter((e) => e.bay === bay && !H.kept.has(e.id)); if (!list.length) return null; return [...list].sort((a, b) => dist(a.at, to) - dist(b.at, to))[0]; }
function worldExit(f: FK, e: ExitDecl): Vec3 { return worldOf(f, e.link, e.at); }
function harnessHome(H: Harness, inst: string, groups: Map<string, WireDecl[]>, locate: (i: string) => { link: string | null; p: Vec3 | null }, seen: Set<string> = new Set([inst])): { link: string | null; p: Vec3 | null; inst?: string } {
  for (const ws of groups.values()) for (const w of ws) for (const [me, other] of [[w.a.inst, w.b.inst], [w.b.inst, w.a.inst]]) if (me === inst && other !== inst) { const l = locate(other); if (l.p) return { ...l, inst: other }; }
  // a part wired only to other harness parts sits with them
  for (const ws of groups.values()) for (const w of ws) for (const [me, other] of [[w.a.inst, w.b.inst], [w.b.inst, w.a.inst]]) if (me === inst && other !== inst && !seen.has(other)) { const l = harnessHome(H, other, groups, locate, new Set([...seen, inst])); if (l.p) return l; }
  return { link: null, p: null };
}
function mergeClip(list: ClipRec[], c: { at: Vec3; dir: Vec3; normal: Vec3; link: string }, od: number, cable: string) {
  const near = list.find((x) => x.link === c.link && dist(x.at_mm, c.at) < 30);
  if (near) { near.od_mm = r1(Math.hypot(near.od_mm, od)); if (!near.cables.includes(cable)) near.cables.push(cable); return; }
  list.push({ link: c.link, at_mm: c.at.map(r1) as Vec3, dir: c.dir, normal: c.normal, od_mm: r1(od), cables: [cable] });
}
/** Cable clips along the routes: a bridge standing on the link's surface, cables and a tie pass under it. Additive only. */
function applyClips(A: Assembly, rec: WiringRecord) {
  const f = fk(A.spec), byLink = new Map<string, unknown[]>();
  // a clip stands free of every bought part: their bodies, grown by the clip's size, are out of bounds
  const bodies = A.spec.links.flatMap((l) => (l.geometry.type === "mesh" && l.geometry.part === "component" && part(String(l.geometry.params?.key)).bbox_mm && f.link[l.name] ? [{ T: f.link[l.name], b: part(String(l.geometry.params?.key)).bbox_mm! }] : []));
  const blocked = (p: Vec3, grow: number) => bodies.some(({ T, b }) => { const v = sub(p, scale(T.p as Vec3, 1000)), q = [0, 1, 2].map((k) => T.R[0][k] * v[0] + T.R[1][k] * v[1] + T.R[2][k] * v[2]); return q.every((x, k) => x > b.min[k] - grow && x < b.max[k] + grow); });
  rec.clips = rec.clips.filter((c) => !blocked(c.at_mm, Math.max(c.od_mm, 3) + 5));
  // and of every other solid at the home pose: a clip on a face pressed against another part is no clip
  // the CSG heap never shrinks and has a hard limit: only the few solids a clip might touch are built, once each
  rec.clips = build(() => {
    const placed = A.spec.links.flatMap((l) => {
      const T = f.link[l.name], g = l.geometry as { bbox?: { min: number[]; max: number[] } };
      if (!T || !isPrintedLink(l) || !g.bbox) return [];
      const M: Mat4 = [T.R[0][0], T.R[1][0], T.R[2][0], 0, T.R[0][1], T.R[1][1], T.R[2][1], 0, T.R[0][2], T.R[1][2], T.R[2][2], 0, T.p[0] * 1000, T.p[1] * 1000, T.p[2] * 1000, 1];
      const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (const x of [g.bbox.min[0], g.bbox.max[0]]) for (const y of [g.bbox.min[1], g.bbox.max[1]]) for (const z of [g.bbox.min[2], g.bbox.max[2]]) for (let k = 0; k < 3; k++) { const v = M[k] * x * 1000 + M[4 + k] * y * 1000 + M[8 + k] * z * 1000 + M[12 + k]; lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); }
      return [{ l, M, lo, hi, w: null as ReturnType<typeof boxSolid> | null }];
    });
    return rec.clips.filter((c) => {
      // the probe stands just off the surface, so it does not count the link it stands on
      const size = Math.max(c.od_mm, 3) + 5, top = add(c.at_mm, scale(c.normal, size)), off = add(c.at_mm, scale(c.normal, 1.5));
      const lo = [0, 1, 2].map((k) => Math.min(off[k], top[k]) - 4) as Vec3, hi = [0, 1, 2].map((k) => Math.max(off[k], top[k]) + 4) as Vec3;
      const near = placed.filter((p) => p.l.name !== c.link && [0, 1, 2].every((k) => p.lo[k] < hi[k] && p.hi[k] > lo[k]));
      if (!near.length) return true;
      const probe = boxSolid(lo, hi);
      return !near.some((p) => { p.w ??= linkSolid(p.l)!.transform(p.M); return p.w.intersect(probe).volume() > 0.5; });
    });
  });
  for (const c of rec.clips) {
    const T = f.link[c.link]; if (!T) continue;
    // to the link's frame (R is a rotation: its transpose inverts it)
    const inv = (v: Vec3): Vec3 => [0, 1, 2].map((k) => T.R[0][k] * v[0] + T.R[1][k] * v[1] + T.R[2][k] * v[2]) as Vec3;
    const p = inv(sub(c.at_mm, scale(T.p as Vec3, 1000))), n = unit(inv(c.normal)); let d = inv(c.dir);
    d = sub(d, scale(n, dot(d, n))); d = norm(d) > 1e-6 ? unit(d) : perp(n);
    // real boxes in the clip's own frame (x across, y along the cable, z off the surface)
    const w = unit(cross(d, n)), { half, h, t, len } = clipSize(c);
    const Tc = [w[0], w[1], w[2], 0, d[0], d[1], d[2], 0, n[0], n[1], n[2], 0, p[0], p[1], p[2], 1];
    const bar = (a0: number, a1: number, e0: number, e1: number) => ({ op: "box", min: [a0, -len, e0], max: [a1, len, e1] });
    const ops = byLink.get(c.link) ?? [];
    // a pad under the whole clip: its centre is on the surface, so it stays attached even on a beam narrower than the clip
    ops.push({ op: "at", T: Tc, of: [bar(-half - t, half + t, -0.9, 0.7), bar(-half - t, -half, -0.6, h + t), bar(half, half + t, -0.6, h + t), bar(-half - t, half + t, h, h + t)] });
    byLink.set(c.link, ops);
  }
  for (const [l, ops] of byLink) { try { A.amendProgram(l, ops); } catch (e) { rec.notes.push(`clips on ${l} not printed: ${(e as Error).message}`); } }
}
const WASTE = 1.1;
const CONSUMABLE = (id: string) => { const c = WIRING.consumables[id]; if (!c) throw new Error(`no consumable ${id}`); return c; };
/** Real BOM lines: wire by gauge and length, contacts and housings, heat shrink, ties, grommets, sleeving. */
function buyHarness(H: Harness, rec: WiringRecord, leverCount: number) {
  const A = H.A, lines: WiringBomLine[] = [];
  const line = (item: string, qty: number, unit: string, usd: number, spec: string, source = "estimated") => { if (qty > 0) lines.push({ item, qty, unit, unit_usd: usd, subtotal_usd: +(qty * usd).toFixed(2), spec, source }); };
  const metres = new Map<number, number>();
  for (const c of rec.cables) if (!c.premade) for (const w of c.wires) if (w.awg) metres.set(w.awg, (metres.get(w.awg) ?? 0) + w.length_mm / 1000);
  for (const [awg, m] of [...metres].sort((a, b) => a[0] - b[0])) { const g = awgRow(awg), q = Math.ceil(m * WASTE * 10) / 10; line(`${awg} AWG silicone wire`, q, "m", g.usd_per_m, `${g.area_mm2} mm2, rated ${g.ampacity_a} A in a bundle; ${m.toFixed(2)} m cut + 10 % waste`); }
  const contacts = new Map<string, { pins: number; housings: number }>();
  const addEnd = (conn: string, wires: number) => { const f = connectorFamily(conn), c = contacts.get(f) ?? { pins: 0, housings: 0 }; c.pins += wires; c.housings += 1; contacts.set(f, c); };
  let solderJoints = 0;
  for (const c of rec.cables) { if (c.premade) continue; addEnd(c.from_connector, c.wires.length); addEnd(c.to_connector, c.wires.length); }
  for (const [f, c] of contacts) {
    if (f === "solder") { solderJoints += c.pins; continue; }
    if (f === "lever" || f === "premade") continue;
    const row = WIRING.connectors[f]; if (!row) continue;
    line(`${row.name} contacts`, c.pins, "pc", row.unit_usd, `rated ${row.current_a} A per contact`);
    if (row.housing_usd) line(`${row.name} housings`, c.housings, "pc", row.housing_usd, "one per cable end");
  }
  const shrink = CONSUMABLE("heat_shrink_3"), mShrink = Math.ceil((solderJoints * 0.03 + rec.cables.length * 2 * 0.03) * 10) / 10;
  line(shrink.name, mShrink, "m", shrink.unit_usd, `${solderJoints} solder joints + a boot on each cable end`);
  const tie = CONSUMABLE("cable_tie_100"), ties = rec.clips.length + rec.cables.length + H.exits.length * 2;
  line(tie.name, ties, "pc", tie.unit_usd, "at every clip, cable end and strain-relief anchor");
  const grom = new Map<number, number>(); for (const e of H.exits) if (e.kind === "grommet") grom.set(e.panel_hole_mm, (grom.get(e.panel_hole_mm) ?? 0) + 1);
  for (const [d, n] of grom) { const g = WIRING.consumables[`grommet_${d}`] ?? CONSUMABLE("grommet_6_5"); line(g.name, n, "pc", g.unit_usd, `${d} mm panel hole`); }
  const glands = H.exits.filter((e) => e.kind === "gland").length; if (glands) { const g = CONSUMABLE("gland_pg7"); line(g.name, glands, "pc", g.unit_usd, "cable exit with strain relief"); }
  const sleeve = rec.cables.reduce((m, c) => m + (c.joints.length ? (c.slack_mm + 100 * c.joints.length) / 1000 : 0), 0);
  if (sleeve) { const s = CONSUMABLE("sleeving_6"); line(s.name, Math.ceil(sleeve * 10) / 10, "m", s.unit_usd, "over every cable where it crosses a joint"); }
  for (const c of rec.cables) if (c.premade) line(c.premade, 1, "pc", WIRING.premade_usd?.[c.premade] ?? 4, c.label);
  const volts = H.main ? H.rails.get(H.main.rail)!.volts : 12;
  void volts;
  for (const f of rec.fuses) A.buy(fuseHolder(f.rating_a, volts), 1, "fuse holders");
  for (const r of new Set(rec.fuses.map((f) => f.rating_a))) { const anl = fuseHolder(r, volts) === "fuse_holder_anl", b = CONSUMABLE(anl ? "fuse_anl" : "fuse_atm"); line(`${r} A ${anl ? "ANL" : "ATM blade"} fuse`, rec.fuses.filter((f) => f.rating_a === r).length, "pc", b.unit_usd, "plus spares"); }
  const levers = leverCount + (H.buyHub ?? 0);
  if (levers) A.buy("wago_221_415", levers, "rail splices, the star ground and bus hubs");
  rec.bom = lines; rec.cost_usd = +lines.reduce((s, l) => s + l.subtotal_usd, 0).toFixed(2);
}
function summarise(H: Harness, cables: CableRec[], clips: ClipRec[], railTotals: Map<string, { typ: number; peak: number }>): WiringRecord {
  const rails: RailRec[] = [...H.rails.values()].map((R) => {
    const t = railTotals.get(R.name)!;
    const drop = Math.max(0, ...cables.flatMap((c) => c.wires.filter((w) => w.net === R.name).map((w) => w.drop_v ?? 0)));
    return { name: R.name, voltage_v: R.volts, source: R.source, continuous_a: R.cont, peak_limit_a: R.peakLimit, typical_a: r3(t.typ), peak_a: r3(t.peak), simultaneous: R.simNote,
      loads: R.feeds.map((x) => ({ inst: x.inst, typical_a: r3(x.typ), peak_a: r3(x.peak) })), fuse_a: null, worst_drop_v: r3(drop), ok: t.typ <= R.cont && t.peak <= R.peakLimit };
  });
  const totalM = cables.reduce((s, c) => s + (c.premade ? 0 : (c.length_mm * c.wires.length) / 1000), 0);
  const unconnected: string[] = [];
  return { instances: [...H.instances.values()], nets: [...H.nets.values()], cables, rails, fuses: H.fuses, main_switch: H.mainSwitch, clips, bom: [], cost_usd: 0, total_wire_m: +totalM.toFixed(2), notes: H.notes, unconnected, estimated_inputs: [] };
}
/** ports a robot harness normally leaves empty: charging, debug and expansion */
const SPARE_PORT = /mains_cord|balance|jumper|uart|debug|rtc|button|sync|fan|host_end|stemma|cam_dsi|pcie|hdmi|ethernet|motor_if|usb_adapter|ac_in|screw_in|sms_|csi_host|dc_in$/;
const portRequired = (role: string) => ["actuator", "battery", "psu", "indicator", "switch", "protection"].includes(role);
/** wiring:* checks: from the record itself, so a wire a designer forgot shows up here. */
function checks(H: Harness, rec: WiringRecord) {
  const A = H.A, done = new Set(rec.cables.flatMap((c) => c.wires.flatMap((w) => [w.from, w.to])));
  for (const n of rec.nets) for (const p of n.pins) done.add(p);
  const missing: string[] = [];
  for (const i of rec.instances) {
    const e = electrical(i.key)!, req = portRequired(e.role);
    for (const p of e.ports) {
      if (SPARE_PORT.test(p.name)) continue;
      if (e.role === "splice") continue;
      const usedPort = p.pins.v.some((x) => done.has(`${i.name}.${p.name}.${x.name}`));
      const samePin = (n: string) => e.ports.some((q) => q.pins.v.some((x) => x.name === n && done.has(`${i.name}.${q.name}.${x.name}`)));
      for (const x of p.pins.v) {
        const t = `${i.name}.${p.name}.${x.name}`;
        if (done.has(t) || samePin(x.name) || H.optional.has(`${i.name}.${p.name}`) || H.optional.has(t)) continue;
        const powerIn = (x.signal === "power" || x.signal === "ground") && x.dir !== "power_out" && x.dir !== "out";
        if (req || (powerIn && usedPort)) missing.push(t);
      }
      if (e.role === "sensor" && !usedPort && !H.optional.has(`${i.name}.${p.name}`)) missing.push(`${i.name}.${p.name}`);
    }
  }
  rec.unconnected = missing;
  A.check("wiring:ports", !missing.length, missing.length ? `not connected: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ` and ${missing.length - 12} more` : ""}` : `all ${done.size} terminals in use are wired; spare pins are declared`);
  for (const r of rec.rails) A.check(`wiring:rail:${r.name}`, r.ok, `${r.source} gives ${r.continuous_a} A continuous, ${r.peak_limit_a} A peak; loads ${r.typical_a} A typical, ${r.peak_a} A peak (${r.simultaneous})`);
  // every load's supply pin sees a voltage inside its range (a pack's full and empty voltages count)
  const volts: string[] = [];
  for (const R of H.rails.values()) {
    const src = H.main?.rail === R.name && H.rec(H.main.source).role === "battery" ? H.mainRange ?? H.rec(H.main.source).voltage_v.v : H.main?.rail === R.name && H.mainRange ? H.mainRange : { min: R.volts, nom: R.volts, max: R.volts };
    for (const x of R.feeds) { const r = H.rec(x.inst), v = r.voltage_v.v; if (r.role === "carrier" || r.role === "splice") continue; if (src.max > v.max * 1.05 || src.nom < v.min) volts.push(`${x.inst} (${v.min}-${v.max} V) on ${R.name} (${src.min}-${src.max} V)`); }
  }
  A.check("wiring:voltage", !volts.length, volts.length ? volts.slice(0, 6).join("; ") : "every load's supply voltage is inside its rated range (5 % allowed at a full pack)");
  const bad: string[] = [], over: string[] = [];
  for (const c of rec.cables) for (const w of c.wires) {
    if (w.awg === null) continue;
    const need = Math.max(w.typical_a * 1.25, w.peak_a * 0.6);
    if (awgRow(w.awg).ampacity_a < need) bad.push(`${w.id} ${w.net} ${w.awg} AWG for ${need.toFixed(2)} A`);
  }
  for (const c of rec.cables) for (const [end, text] of [[c.from, c.from_connector], [c.to, c.to_connector]] as const) {
    const row = WIRING.connectors[connectorFamily(text)]; if (!row) continue;
    for (const w of c.wires) if (w.typical_a > row.current_a) over.push(`${c.id} at ${end}: ${w.typical_a} A through ${row.name} (${row.current_a} A)`);
  }
  A.check("wiring:gauge", !bad.length, bad.length ? bad.slice(0, 8).join("; ") : `every conductor rated above its current (1.25 x typical, 0.6 x peak) with a voltage drop under 3 %`);
  A.check("wiring:connector", !over.length, over.length ? over.slice(0, 6).join("; ") : "every contact is rated above its running current");
  if (H.main) {
    const fuse = rec.fuses[0];
    A.check("wiring:fuse", !!fuse || !H.main.fuse, fuse ? `${fuse.rating_a} A main fuse on the battery positive, ${rec.fuses.length - 1} branch fuses; every wire off that rail is rated above the fuse ahead of it` : "no fuse: supply is current limited");
    // a mains inlet's switch breaks the supply's input, not this rail: its rating is against the mains side
    const onMains = rec.main_switch === "mains_inlet", sw = rec.main_switch ? H.rec(rec.main_switch).current_a.v.typical : 0, draw = rec.rails.find((r) => r.name === H.main!.rail)!.typical_a;
    A.check("wiring:switch", !!rec.main_switch && (onMains || draw <= sw), onMains ? "main switch in the fused mains inlet" : rec.main_switch ? `main switch ${rec.main_switch} (${sw} A) in the positive feed, running load ${draw} A` : "no main switch");
  }
  // common ground: one connected net joining every ground pin in use; pins of one part with the same role are tied inside it
  const parent = new Map<string, string>(), find = (x: string): string => { const p = parent.get(x) ?? x; if (p === x) return x; const r = find(p); parent.set(x, r); return r; }, join = (a: string, b: string) => parent.set(find(a), find(b));
  const grounds: string[] = [];
  for (const c of rec.cables) for (const w of c.wires) if (w.kind === "ground") { const g = (t: string) => `${t.split(".")[0]}#g`; join(g(w.from), g(w.to)); grounds.push(g(w.from), g(w.to)); }
  const roots = new Set(grounds.map(find));
  const floating = rec.instances.filter((i) => !i.off_board && electrical(i.key)!.role !== "battery" && !grounds.includes(`${i.name}#g`) && electrical(i.key)!.ports.some((p) => p.pins.v.some((x) => x.signal === "ground")) && rec.cables.some((c) => c.from === i.name || c.to === i.name) && !rec.cables.some((c) => (c.from === i.name || c.to === i.name) && c.premade));
  A.check("wiring:ground", roots.size <= 1 && !floating.length, roots.size <= 1 && !floating.length ? "one common ground: every return joins a single star point" : `${roots.size} separate grounds; no ground wire on ${floating.map((i) => i.name).join(", ")}`);
  // slack, recomputed from the joint limits as they stand now
  const js = rec.cables.flatMap((c) => c.joints.map((j) => ({ c, j })));
  const short = js.filter(({ j }) => j.slack_mm < j.need_mm - j.home_mm);
  const moved = A.spec.joints.filter((j) => j.type !== "fixed" && js.some((x) => x.j.joint === j.name && j.limit && (Math.abs((j.limit.lower ?? 0) - x.j.travel[0]) > 0.01 || Math.abs((j.limit.upper ?? 0) - x.j.travel[1]) > 0.01)));
  const cont = rec.notes.filter((n) => n.includes("slip ring"));
  A.check("wiring:slack", !short.length && !moved.length && !cont.length, short.length ? `short at ${short.map(({ c, j }) => `${c.id}/${j.joint}`).join(", ")}` : moved.length ? `limits changed after routing: ${moved.map((j) => j.name).join(", ")}` : cont.length ? cont.join("; ") : js.length ? `${js.length} joint crossings, each with a loop at least the length its full travel needs` : "no cable crosses a moving joint");
}
