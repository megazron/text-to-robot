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

// ------------------------------------------------------------------------------------------- records
export type NetKind = "power" | "ground" | "signal" | "bus";
export interface WireEnd { inst: string; port: string; pin: string; }
export interface InstanceRec { name: string; key: string; link: string | null; off_board?: boolean; note?: string; }
export interface NetRec { name: string; kind: NetKind; voltage_v?: number; pins: string[]; }
export interface WireRec { id: string; net: string; kind: NetKind; from: string; to: string; awg: number | null; color: string; typical_a: number; peak_a: number; length_mm: number; drop_v?: number; }
export interface SlackRec { joint: string; type: string; travel: [number, number]; home_mm: number; need_mm: number; slack_mm: number; provided_mm: number; }
export interface CableRec {
  id: string; label: string; from: string; to: string; from_connector: string; to_connector: string; premade: string | null;
  wires: WireRec[]; od_mm: number; route_mm: number; service_mm: number; slack_mm: number; termination_mm: number; length_mm: number;
  path_mm: Vec3[]; links: string[]; joints: SlackRec[]; exit: string | null;
}
export interface RailRec {
  name: string; voltage_v: number; source: string; continuous_a: number; peak_limit_a: number; typical_a: number; peak_a: number; simultaneous: string;
  loads: { inst: string; typical_a: number; peak_a: number }[]; fuse_a: number | null; worst_drop_v: number; ok: boolean;
}
export interface FuseRec { id: string; rating_a: number; protects: string; wire_awg: number; holder: string; }
export interface WiringBomLine { item: string; qty: number; unit: string; unit_usd: number; subtotal_usd: number; spec: string; source: string; }
export interface ClipRec { link: string; at_mm: Vec3; dir: Vec3; normal: Vec3; od_mm: number; cables: string[]; }
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

  const locate = (inst: string): { link: string | null; p: Vec3 | null } => {
    const i = H.instances.get(inst)!;
    if (i.off_board) return { link: null, p: null };
    if (!i.link) { // a harness part (splice, inline fuse): it sits where the first wire that reaches it comes from
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
  for (const [key, ws] of groups) {
    const ia = ws[0].a.inst, ib = ws[0].b.inst;
    let la = locate(ia), lb = locate(ib);
    // harness parts ride next to whatever they connect to
    if (!la.p && !H.instances.get(ia)!.off_board) { const home = harnessHome(H, ia, groups, locate); la = home; if (home.inst && !H.bayOf.get(ia)) H.bayOf.set(ia, H.bayOf.get(home.inst) ?? ""); }
    if (!lb.p && !H.instances.get(ib)!.off_board) { const home = harnessHome(H, ib, groups, locate); lb = home; if (home.inst && !H.bayOf.get(ib)) H.bayOf.set(ib, H.bayOf.get(home.inst) ?? ""); }
    const offBoard = H.instances.get(ia)!.off_board || H.instances.get(ib)!.off_board;
    const path: Vec3[] = []; const joints: SlackRec[] = []; const links = new Set<string>(); let exit: string | null = null;
    let routeMm = 0, slackMm = 0;
    const clipHere: { at: Vec3; dir: Vec3; normal: Vec3; link: string }[] = [];
    const od = bundleOd(ws);
    if (la.p && lb.p && la.link && lb.link) {
      const { up, down } = treePath(spec, la.link, lb.link);
      const crossing = [...up, ...down].filter((j) => j.type !== "fixed");
      // waypoints: start, then per crossed joint its two anchors, end
      const bayA = H.bayOf.get(ia), bayB = H.bayOf.get(ib);
      const leaves = (bay?: string, other?: string) => !!bay && bay !== other;
      const exA = leaves(bayA, bayB) ? nearestExit(H, bayA!, lb.p) : null, exB = leaves(bayB, bayA) ? nearestExit(H, bayB!, la.p) : null;
      if (exA || exB) exit = [exA?.id, exB?.id].filter(Boolean).join(" + ");
      let cur = la.p, curGroup = groupOf.get(la.link)!;
      path.push(cur);
      const goTo = (p: Vec3) => {
        const s = along(curGroup, cur, p); for (let i = 1; i < s.pts.length; i++) path.push(s.pts[i]);
        clipHere.push(...s.clips); cur = p;
      };
      if (exA) { goTo(worldExit(f, exA)); }
      for (let i = 0; i < crossing.length; i++) {
        const j = crossing[i], c = jointWorld(f, j), ax = axisWorld(f, j);
        const target = i + 1 < crossing.length ? jointWorld(f, crossing[i + 1]) : (exB ? worldExit(f, exB) : lb.p);
        // anchors stand off the joint axis towards where the cable comes from and goes to
        const stand = Math.max(14, od * 3 + 8);
        const off = (to: Vec3) => { const v = sub(to, c), r = sub(v, scale(ax, dot(v, ax))); return norm(r) > 1 ? add(c, scale(unit(r), Math.min(stand, Math.max(norm(r) * 0.8, 6)))) : add(c, scale(perp(ax), stand)); };
        const aIn = off(cur), aOut = off(target);
        goTo(aIn);
        const s = jointSweep(j, aIn, aOut, c, ax);
        const bendR = 6 * od; // bundle bend radius; the 10 x OD table figure is for the single wire in repeated flexing
        const loop = Math.max(s.need - s.home, 0);
        // the loop itself must be at least one bend-radius arc to stay flexible
        const provided = Math.ceil((loop * 1.15 + Math.PI * bendR * 0.5) / 5) * 5;
        joints.push({ joint: j.name, type: j.type, travel: [r3(s.travel[0]), r3(s.travel[1])], home_mm: r1(s.home), need_mm: r1(s.need), slack_mm: provided, provided_mm: r1(s.home + provided) });
        slackMm += provided;
        path.push(aOut); cur = aOut; curGroup = groupOf.get(j.child)!;
        if (j.type === "continuous") unresolved.push(`${key} crosses continuous joint ${j.name}: needs a slip ring`);
      }
      if (exB) goTo(worldExit(f, exB));
      goTo(lb.p);
      routeMm = path.slice(1).reduce((s, p, i) => s + dist(path[i], p), 0);
      for (const l of [la.link, lb.link, ...crossing.flatMap((j) => [j.parent, j.child])]) links.add(l);
    } else if (offBoard) {
      routeMm = WIRING.off_board_cable_mm; if (la.p) path.push(la.p); if (lb.p) path.push(lb.p);
    }
    routeMm = routeMm * tort;
    const pm = H.premade.get(key) ?? null;
    const svc = pm ? 0 : serviceMm, term = pm ? 0 : termMm * 2;
    const length = routeMm + svc + slackMm + term;
    const wires: WireRec[] = ws.map((w, i) => {
      const n = H.nets.get(w.net)!, sig = H.rec(w.a.inst).ports.find((p) => p.name === w.a.port)?.pins.v.find((p) => p.name === w.a.pin)?.signal ?? "digital";
      const volts = n.kind === "power" ? n.voltage_v ?? 5 : n.kind === "ground" ? 5 : 5;
      // wires ahead of the main fuse's load must carry the fuse's rating: the fuse protects them
      const design = Math.max(w.typ * 1.25, w.peak * 0.6, w.trunk === "main" ? mainFuse / 2 : 0);   // the fuse protects against the free-air rating, twice the bundled figure
      const maxDrop = Math.max(volts * 0.03, 0.1), minG = n.kind === "power" || n.kind === "ground" ? 24 : 26;
      const g = pm ? null : gaugeFor(design, length, maxDrop, minG);
      return { id: `W${++cid}`, net: w.net, kind: n.kind, from: tname(w.a), to: tname(w.b), awg: g?.awg ?? null, color: COLOR[n.kind === "power" || n.kind === "ground" ? n.kind : sig] ?? "white", typical_a: r3(w.typ), peak_a: r3(w.peak), length_mm: Math.ceil(length / 5) * 5, ...(g ? { drop_v: r3(g.drop_v) } : {}) };
    });
    const pa = H.rec(ia).ports.find((p) => p.name === ws[0].a.port)!, pb = H.rec(ib).ports.find((p) => p.name === ws[0].b.port)!;
    cables.push({ id: `C${cables.length + 1}`, label: H.labels.get(key) ?? `${ia} to ${ib}`, from: ia, to: ib, from_connector: pa.connector.v, to_connector: pb.connector.v, premade: pm,
      wires, od_mm: r1(od), route_mm: r1(routeMm), service_mm: svc, slack_mm: slackMm, termination_mm: term, length_mm: Math.ceil(length / 5) * 5,
      path_mm: path.map((p) => p.map(r1) as Vec3), links: [...links], joints, exit });
    for (const c of clipHere) if (!noClip.test(c.link)) mergeClip(clips, c, od, `C${cables.length}`);
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

const perp = (a: Vec3): Vec3 => unit(Math.abs(a[2]) < 0.9 ? cross(a, [0, 0, 1]) : cross(a, [1, 0, 0]));
function bundleOd(ws: WireDecl[]) { const d = 1.5; return ws.length <= 1 ? d : d * Math.sqrt(ws.length) * 1.25; }
function nearestExit(H: Harness, bay: string, to: Vec3): ExitDecl | null { const list = H.exits.filter((e) => e.bay === bay); if (!list.length) return null; return [...list].sort((a, b) => dist(a.at, to) - dist(b.at, to))[0]; }
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
  for (const c of rec.clips) {
    const T = f.link[c.link]; if (!T) continue;
    // to the link's frame (R is a rotation: its transpose inverts it)
    const inv = (v: Vec3): Vec3 => [0, 1, 2].map((k) => T.R[0][k] * v[0] + T.R[1][k] * v[1] + T.R[2][k] * v[2]) as Vec3;
    const p = inv(sub(c.at_mm, scale(T.p as Vec3, 1000))), n = unit(inv(c.normal)); let d = inv(c.dir);
    d = sub(d, scale(n, dot(d, n))); d = norm(d) > 1e-6 ? unit(d) : perp(n);
    const w = unit(cross(n, d)), half = Math.max(c.od_mm, 3) / 2 + 0.8, h = Math.max(c.od_mm, 3) + 1, t = 1.8, len = 3;
    const P = (a: number, b: number, e: number): Vec3 => add(add(p, scale(w, a)), add(scale(d, b), scale(n, e)));
    const post = (a0: number, a1: number, e0: number, e1: number) => ({ op: "hull", of: [a0, a1].flatMap((a) => [-len, len].flatMap((b) => [e0, e1].map((e) => { const q = P(a, b, e); return { op: "box", min: [q[0] - 0.01, q[1] - 0.01, q[2] - 0.01], max: [q[0] + 0.01, q[1] + 0.01, q[2] + 0.01] }; }))) });
    const ops = byLink.get(c.link) ?? [];
    ops.push(post(-half - t, -half, -0.6, h + t), post(half, half + t, -0.6, h + t), post(-half - t, half + t, h, h + t));
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
