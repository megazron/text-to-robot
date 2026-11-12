// Electrical simulation of a robot from its wiring record: the harness as a circuit, solved for its operating point
// (and stepped in time), with faults. What becomes what:
//
// * every power, ground and motor wire: a resistor, ohm_per_m of its gauge (WIRING table) times its cut length; the
//   return wires are in the record, so both conductors are modelled and ground shift shows up at every part;
// * a lever splice: one node; pins a part joins inside itself (same pin name, all its ground pins): one node;
// * battery: open-circuit voltage from its state of charge behind its internal resistance; mains supply: its output
//   voltage up to its current limit; main switch and fuses: small resistances in the positive lead, fuses open by
//   their datasheet curve;
// * a switching regulator: the buck element (constant efficiency, dropout, current limit); a board that sources a
//   rail from its own regulator (a controller's 5 V or 3.3 V pin): a linear regulator from its supply pin, or a
//   limited source when the board is powered from outside the harness (USB);
// * an H-bridge driver: the bridge's drop between its motor supply and the motor, the other motor lead on the
//   driver's ground, 100 % duty; a brushed motor or a servo: the motor element (winding resistance = rated voltage
//   over stall current, so a stalled one is a locked rotor); every other part: its record's current, drawn while
//   its supply allows.
//
// Scenarios: "idle" (actuators at their idle or no-load current), "typical" (every part at its record's typical
// current at once), "stall" (every actuator locked, the rest typical), "peak" (every actuator locked and every other
// part at its record's peak). The harness budget in the wiring record assumes less at once (`rails[].budget`).
//
// Nothing here is measured. A number comes from the catalog and the electrical records, from a datasheet table in
// data.ts, or from an estimate, and every estimate used is in the result's `assumptions` with the parts it stands for.
import type { RobotSpecification } from "@ttr/robot-schema";
import { electrical, CATALOG, WIRING, actuatorFamily, type ElectricalRecord } from "@ttr/parts";
import { connectorFamily, type WiringRecord, type RailRec, type NetRec } from "../wiring.ts";
import { withBranchFuses, fuseIdOf } from "../circuit/model.ts";
import { electricalReport } from "../circuit/electrical.ts";
import { Circuit, Diode, Fuse, Motor, Regulator, Resistor, VSource, CurrentLoad, type Element, type Solution, type Tv, type Ctx } from "./mna.ts";
import { ESTIMATES, FUSE_MINI, cellOhm, chemistryOf, ocvCell, socOfCell, type EstimateId } from "./data.ts";

export type Scenario = "idle" | "typical" | "peak" | "stall";
export type Fault =
  /** a hard short from a rail (or any power net) to ground; `at` picks the pin, default the rail's source end */
  | { kind: "short"; rail?: string; net?: string; at?: string; ohm?: number }
  /** a wire that is broken or unplugged, by its id in the wiring record */
  | { kind: "open"; wire: string }
  /** a motor or servo held still: locked rotor */
  | { kind: "stall"; inst: string }
  /** the battery at a state of charge (0..1), or resting at `volts` */
  | { kind: "low_battery"; soc?: number; volts?: number };
export interface SimOptions {
  faults?: Fault[];
  scenario?: Scenario;
  /** battery state of charge, 0..1; default 0.5 */
  soc?: number;
  /**
   * Also step in time: the faults are applied at `t_fault_s` (default a tenth of `t_end_s`). `capacitors` adds bulk
   * capacitance you fitted (the catalog holds none), each from a pin to that part's ground.
   */
  transient?: { t_end_s: number; dt_s: number; t_fault_s?: number; method?: "trap" | "be"; capacitors?: { at: string; uf: number }[] };
  /** current of a part in amperes, in place of its record's */
  loads?: Record<string, number>;
  /** share of its typical current every motor and servo draws in the "typical" scenario, 0..1; default 1 (all of them at once) */
  actuator_load?: number;
}
export type Severity = "info" | "warning" | "error";
export interface SimEvent {
  kind: "brown_out" | "unpowered" | "over_voltage" | "motor_over_voltage" | "regulator_dropout" | "regulator_limit" | "regulator_off" | "regulator_overload" | "fuse_blown" | "fuse_overload"
    | "wire_overcurrent" | "connector_overcurrent" | "switch_overcurrent" | "source_limit" | "supply_overload" | "battery_cutoff" | "battery_overcurrent" | "logic_level" | "short";
  severity: Severity; message: string;
  inst?: string; wire?: string; rail?: string; fuse?: string; pin?: string; value?: number; limit?: number;
  /** a blown fuse: the window it opens in, seconds after the overload starts */
  opens_s?: [number, number];
}
export interface Assumption { id: string; value: number | string; unit: string; note: string; parts: string[]; }
export interface SimWire {
  /** amperes from the wire's `from` end to its `to` end (negative: the other way) */
  current_a: number; from_v: number; to_v: number; drop_v: number; loss_w: number; ohm: number; awg: number | null;
  /** the gauge's bundled ampacity and its free-air rating; `load_pct` is against the bundled figure */
  ampacity_a: number | null; free_air_a: number | null; load_pct: number | null; open: boolean;
}
export interface SimPart {
  key: string; role: string;
  /** "ok", or what is wrong; "external": powered from outside the harness; "not_simulated": no supply wire in the harness */
  state: "ok" | "brown_out" | "unpowered" | "over_voltage" | "external" | "not_simulated";
  /** the pin its supply is read at, the voltage from there to its own ground pin, and that ground pin's shift from the reference */
  supply_pin: string | null; supply_v: number | null; ground_v: number | null;
  /** the supply range of its record (null when it is not checked, as for a motor behind a bridge) */
  min_v: number | null; max_v: number | null;
  /** every supply pin it takes current at, against its own ground */
  supplies: { pin: string; v: number; nominal_v: number | null }[];
  /** what the part itself draws and takes */
  current_a: number; power_w: number; basis: string;
  /** motors and servos */
  motor?: { stalled: boolean; speed_rad_s: number | null; stall_ohm: number; heat_w: number };
  note?: string;
}
export interface SimRail {
  nominal_v: number; source: string;
  /** voltage at the source's output pin and the lowest supply any load on the rail sees (pin against its own ground) */
  source_v: number | null; min_v: number | null; min_at: string | null; sag_v: number | null;
  current_a: number | null;
  /** what the harness was sized for, from the wiring record */
  budget: { typical_a: number; peak_a: number; simultaneous: string };
}
export interface SimSource { key: string; type: "battery" | "supply" | "external"; emf_v: number; ohm: number; terminal_v: number; current_a: number; power_w: number; internal_w: number; soc: number | null; limit_a: number | null; state: string; min_v: number | null; }
export interface SimRegulator { inst: string; type: "buck" | "linear"; from: string; to: string | null; set_v: number; vin: number; vout: number; iin: number; iout: number; loss_w: number; efficiency: number | null; limit_a: number | null; state: "regulating" | "dropout" | "limit" | "off" | "blocked"; }
export interface SimFuse { inst: string; rating_a: number; ohm: number; current_a: number; load_pct: number; blown: boolean; opens_s: [number, number] | null; }
export interface SimPower { sources_w: number; source_internal_w: number; wires_w: number; switches_fuses_w: number; regulators_w: number; drivers_w: number; loads_w: number; fault_w: number; balance_w: number; }
export interface SimState {
  /** voltage of every wired pin, `inst.port.pin`, against the reference (the main source's negative terminal) */
  pins: Record<string, number>;
  /** the conductors: pins joined by a splice or inside a part */
  nodes: { id: string; v: number; pins: string[]; nets: string[] }[];
  nets: Record<string, { kind: string; nominal_v: number | null; min_v: number; max_v: number }>;
  /** by wire id, as electronics3d names them (a lead cut by a branch fuse is W27a and W27b, and also listed whole as W27) */
  wires: Record<string, SimWire>;
  rails: Record<string, SimRail>;
  parts: Record<string, SimPart>;
  sources: Record<string, SimSource>;
  regulators: Record<string, SimRegulator>;
  fuses: Record<string, SimFuse>;
  power: SimPower;
  events: SimEvent[];
}
export interface SimTransient {
  ok: boolean; reason?: string; t_s: number[]; t_fault_s: number; method: "trap" | "be";
  rails: Record<string, { source_v: (number | null)[]; min_v: (number | null)[] }>;
  sources: Record<string, { current_a: number[]; terminal_v: number[] }>;
  fuses: Record<string, { current_a: number[]; blown_at_s: number | null }>;
  /** each event at the first step it shows */
  events: (SimEvent & { t_s: number })[];
  note: string;
}
export interface SimResult extends SimState {
  robot: string; scenario: Scenario; soc: number | null;
  /** false: no steady operating point was found, `reason` says why, and every table below is empty */
  converged: boolean; reason?: string; iterations: number;
  /** largest sum of currents at any node, amperes */
  kcl_max_residual_a: number | null;
  faults: { fault: Fault; note: string }[];
  /** messages of the events that are warnings or errors */
  warnings: string[];
  /** fuses that opened: the state above is the settled one after they did; `before_trip` is the moment before the first opened */
  trips: { fuse: string; rating_a: number; current_a: number; opens_s: [number, number] }[];
  before_trip?: SimState;
  /** every circuit element with the current into it at each of its nodes */
  elements: { name: string; kind: string; nodes: string[]; i_a: number[] }[];
  assumptions: Assumption[];
  /** what the model leaves out */
  model: string[];
  not_simulated: string[];
  transient?: SimTransient;
}

export const MODEL_NOTES: string[] = [
  "Connectors, lever splices, board traces and solder joints are 0 ohm; only wires, the main switch, fuses, the battery and bridge drivers have resistance.",
  "A part draws its record's current whatever its voltage, until the supply falls under its minimum; below that its current falls with the voltage.",
  "A motor or servo draws its load current while the voltage can push it through the winding, and its stall current is its voltage over (rated voltage / stall current).",
  "Motor drivers run at 100 % duty.",
  "A switching regulator has one efficiency at every load; in current limit it holds its limit (no hiccup, foldback or thermal shutdown).",
  "A fuse stays closed under 135 % of its rating and opens inside its datasheet's window above; in a transient it opens at the geometric mean of that window.",
  "The catalog holds no capacitance or inductance, so a transient is a sequence of operating points in which fuses heat; capacitors appear only where you add them.",
  "The mains side of a supply, bought leads (USB, camera) and signal wires are not simulated; logic levels are checked at nominal voltages.",
  "A driver whose logic supply has failed is reported, but its bridge is still modelled as switched on.",
];

type Term = { id: string; inst: string; port: string; pin: string; signal: string; dir: string };
interface Sink { node: string; nominal: number | undefined; pin: string; }
interface Source { node: string; vset: number | undefined; pin: string; rail: RailRec | undefined; }
interface PartModel {
  inst: string; key: string; role: string; rec: ElectricalRecord; gnd: string; gndPin: string | null; sinks: Sink[]; sources: Source[];
  supply?: { hi: string; lo: string; pin: string; check: boolean; min: number; max: number }; own?: { el: Element; basis: string }; motor?: Motor; extra: Element[]; note?: string;
}
interface EWire { id: string; orig: string; net: string; from: string; to: string; awg: number | null; kind: "power" | "ground" | "phase"; typical_a: number; peak_a: number; length_mm: number; el?: Resistor; ohm: number; }

const splitT = (t: string): [string, string, string] => { const a = t.indexOf("."), b = t.indexOf(".", a + 1); return [t.slice(0, a), t.slice(a + 1, b), t.slice(b + 1)]; };
const PASSIVE = new Set(["battery", "psu", "switch", "protection", "splice", "carrier"]);
const f2 = (x: number) => (Math.abs(x) < 0.005 ? "0.00" : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));

function build(w0: WiringRecord, opts: SimOptions, scenario: Scenario) {
  const w = withBranchFuses(w0), c = new Circuit();
  const inst = new Map(w.instances.map((i) => [i.name, i]));
  const rec = (i: string) => (inst.has(i) ? electrical(inst.get(i)!.key) : undefined);
  const role = (i: string) => rec(i)?.role ?? "";
  const specs = (i: string): Record<string, any> => CATALOG[inst.get(i)!.key]?.specs ?? {};
  const netBy = new Map<string, NetRec>(w.nets.map((n) => [n.name, n])), railBy = new Map(w.rails.map((r) => [r.name, r]));
  const skipped: string[] = [], assumed = new Map<string, Assumption>();
  const assume = (id: string, value: number | string, unit: string, note: string, partName: string) => { const a = assumed.get(id) ?? { id, value, unit, note, parts: [] }; if (!a.parts.includes(partName)) a.parts.push(partName); assumed.set(id, a); };
  const est = (id: EstimateId, partName: string) => { const e = ESTIMATES[id]; assume(id, e.value, e.unit, e.note, partName); return e.value; };
  const tr = opts.transient, tFault = tr ? tr.t_fault_s ?? tr.t_end_s / 10 : 0, active = (t: number) => t >= tFault;

  // ---- the wires that carry power, and their terminals
  const T = new Map<string, Term>(), wires: EWire[] = [];
  const term = (t: string): Term | undefined => {
    const had = T.get(t); if (had) return had;
    const [i, p, n] = splitT(t), pin = rec(i)?.ports.find((q) => q.name === p)?.pins.v.find((x) => x.name === n);
    return pin ? { id: t, inst: i, port: p, pin: n, signal: pin.signal, dir: pin.dir } : undefined;
  };
  let mains = false, leads = 0;
  for (const cab of w.cables) {
    if (cab.premade) { leads++; continue; }
    for (const x of cab.wires) {
      const a = term(x.from), b = term(x.to); if (!a || !b) continue;
      const sig = [a.signal, b.signal];
      if (sig.includes("mains") || (netBy.get(x.net)?.voltage_v ?? 0) > 60) { mains = true; continue; }
      if (!sig.every((s) => s === "power" || s === "ground" || s === "motor_phase")) continue;
      T.set(a.id, a); T.set(b.id, b);
      const orig = /[ab]$/.test(x.id) && !w0.cables.some((q) => q.wires.some((y) => y.id === x.id)) ? x.id.slice(0, -1) : x.id;
      wires.push({ id: x.id, orig, net: x.net, from: x.from, to: x.to, awg: x.awg, kind: sig.includes("motor_phase") ? "phase" : x.kind === "ground" ? "ground" : "power", typical_a: x.typical_a, peak_a: x.peak_a, length_mm: x.length_mm, ohm: 0 });
    }
  }
  if (mains) skipped.push("the mains side of the supply");
  if (leads) skipped.push(`${leads} bought lead${leads === 1 ? "" : "s"} (USB, camera): what they power is inside their host's current`);
  /** wired terminals of an instance in the order of its record */
  const termsOf = (i: string): Term[] => { const out: Term[] = [], seen = new Set<string>(); for (const p of rec(i)?.ports ?? []) for (const x of p.pins.v) { const id = `${i}.${p.name}.${x.name}`; if (T.has(id) && !seen.has(id)) { seen.add(id); out.push(T.get(id)!); } } return out; };

  // ---- H-bridges: a driver port with two phase pins wired to a brushed motor
  const bridges: { driver: string; motor: string; port: string; hi: string; lo: string; mhi: string; mlo: string }[] = [], phaseLoads: { driver: string; motor: string }[] = [];
  for (const i of w.instances) {
    if (role(i.name) === "actuator") {
      const ph = termsOf(i.name).filter((t) => t.signal === "motor_phase"); if (!ph.length) continue;
      const far = (t: Term) => { const x = wires.find((q) => q.from === t.id || q.to === t.id)!; return T.get(x.from === t.id ? x.to : x.from)!; };
      const ends = ph.map(far), driver = ends[0].inst;
      const brushed = ph.length === 2 && actuatorFamily(i.key) === "dc_gearmotor" && ends[1].inst === driver && ends[1].port === ends[0].port && ends[0].id !== ends[1].id;
      if (brushed) bridges.push({ driver, motor: i.name, port: ends[0].port, hi: ends[0].id, lo: ends[1].id, mhi: ph[0].id, mlo: ph[1].id });
      else phaseLoads.push({ driver, motor: i.name });
    }
  }

  // ---- nodes: union of splices, pins a part joins inside itself, and the low side of each bridge on its driver's ground
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!; if (r !== x) parent.set(x, r); return r; };
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) { if (ra < rb) parent.set(rb, ra); else parent.set(ra, rb); } };
  const key = (t: string) => (role(splitT(t)[0]) === "splice" ? splitT(t)[0] : t);
  for (const t of T.keys()) find(key(t));
  const firstGround = (i: string) => termsOf(i).find((t) => t.signal === "ground");
  for (const i of w.instances) {
    const r = role(i.name); if (r === "splice" || r === "") continue;
    const ts = termsOf(i.name), byName = new Map<string, Term>();
    for (const t of ts) { if (t.signal === "motor_phase") continue; const k = byName.get(t.pin); if (k) join(k.id, t.id); else byName.set(t.pin, t); }
    if (!["battery", "psu", "switch", "protection"].includes(r)) { const g = ts.filter((t) => t.signal === "ground"); for (let k = 1; k < g.length; k++) join(g[0].id, g[k].id); }
  }
  const looseLow: string[] = [];
  for (const b of bridges) { const g = firstGround(b.driver); if (g) join(b.lo, g.id); else looseLow.push(b.lo); }
  // the reference: the negative terminal of the first battery, else of the first supply
  const mainSource = w.instances.find((i) => role(i.name) === "battery" && firstGround(i.name)) ?? w.instances.find((i) => role(i.name) === "psu" && firstGround(i.name));
  const refRoot = mainSource ? find(firstGround(mainSource.name)!.id) : null;
  const nodeOf = (t: string) => { const r = find(key(t)); return r === refRoot ? "0" : r; };
  for (const lo of looseLow) c.resistor(`tie:${lo}`, nodeOf(lo), "0", 1e-6);

  // ---- wires
  for (const x of wires) {
    if (x.awg === null) { skipped.push(`wire ${x.id}: no gauge in the record`); continue; }
    const row = WIRING.awg.find((g) => g.awg === x.awg); if (!row) { skipped.push(`wire ${x.id}: AWG ${x.awg} is not in the wire table`); continue; }
    x.ohm = Math.max(1e-6, (row.ohm_per_m * x.length_mm) / 1000);
    const a = nodeOf(x.from), b = nodeOf(x.to);
    if (a === b) { skipped.push(`wire ${x.id}: both ends are the same conductor`); continue; }
    x.el = c.add(new Resistor(`w:${x.id}`, c.node(a), c.node(b), x.ohm));
  }

  // ---- what each part does at each of its supply pins
  const netsOf = new Map<string, string[]>();
  for (const n of w.nets) if (n.kind === "power") for (const t of n.pins) netsOf.set(t, [...(netsOf.get(t) ?? []), n.name]);
  const parts = new Map<string, PartModel>();
  for (const i of w.instances) {
    const r = rec(i.name); if (!r) continue;
    const g = firstGround(i.name), P: PartModel = { inst: i.name, key: i.key, role: r.role, rec: r, gnd: g ? nodeOf(g.id) : "0", gndPin: g?.id ?? null, sinks: [], sources: [], extra: [] };
    parts.set(i.name, P);
    if (PASSIVE.has(r.role)) continue;
    const groups = new Map<string, Term[]>();
    for (const t of termsOf(i.name)) if (t.signal === "power") groups.set(nodeOf(t.id), [...(groups.get(nodeOf(t.id)) ?? []), t]);
    for (const [node, list] of groups) {
      const nets = [...new Set(list.flatMap((t) => netsOf.get(t.id) ?? []))], rails = nets.map((n) => railBy.get(n)).filter((x): x is RailRec => !!x), mine = rails.find((x) => x.source === i.name);
      const src = r.role === "regulator" ? list.every((t) => t.dir === "power_out") : mine ? true : rails.length ? false : list.every((t) => t.dir === "power_out");
      const nominal = mine?.voltage_v ?? rails[0]?.voltage_v ?? nets.map((n) => netBy.get(n)?.voltage_v).find((v) => v !== undefined);
      if (src) P.sources.push({ node, vset: nominal, pin: list[0].id, rail: mine }); else P.sinks.push({ node, nominal, pin: list[0].id });
    }
  }

  // ---- sources
  const faults: { fault: Fault; note: string }[] = [];
  const low = (opts.faults ?? []).find((f) => f.kind === "low_battery") as Extract<Fault, { kind: "low_battery" }> | undefined;
  if (opts.soc !== undefined && !(opts.soc >= 0 && opts.soc <= 1)) throw new Error("electrical simulation: soc must be between 0 and 1");
  let socUsed: number | null = null;
  const sources = new Map<string, { el: VSource; type: "battery" | "supply" | "external"; soc: number | null; min_v: number | null; limit: number | null; max_a: number | null; rated_a: number | null }>();
  for (const i of w.instances) {
    const r = rec(i.name); if (!r || (r.role !== "battery" && r.role !== "psu")) continue;
    const ts = termsOf(i.name), pos = ts.find((t) => t.signal === "power" && t.dir === "power_out") ?? ts.find((t) => t.signal === "power"), neg = ts.find((t) => t.signal === "ground");
    if (!pos || !neg) continue;
    if (r.role === "battery") {
      const s = specs(i.name), cells = Number(s.cells) || Math.max(1, Math.round(r.voltage_v.v.nom / 3.7)), ah = Number(s.capacity_mah) / 1000 || 2;
      const chem = chemistryOf(i.key, CATALOG[i.key]?.name ?? "", r.voltage_v.v.nom / cells);
      let soc = opts.soc ?? 0.5;
      if (low) { if (low.volts !== undefined) soc = socOfCell(chem, low.volts / cells); else if (low.soc !== undefined && low.soc >= 0 && low.soc <= 1) soc = low.soc; else throw new Error("electrical simulation: a low_battery fault needs soc (0..1) or volts"); }
      const emf = low?.volts ?? cells * ocvCell(chem, soc), ro = cellOhm(chem, ah);
      assume(`ocv_${chem}`, `${f2(emf)} V at ${Math.round(soc * 100)} %`, "", `open-circuit voltage against state of charge: a typical ${chem.replace("_", "-")} rest curve (data.ts), not measured on this pack`, i.name);
      est(ro.id, i.name);
      socUsed = soc;
      sources.set(i.name, { el: c.add(new VSource(`src:${i.name}`, c.node(nodeOf(pos.id)), c.node(nodeOf(neg.id)), emf, cells * ro.ohm, Infinity, "battery")), type: "battery", soc, min_v: r.voltage_v.v.min, limit: null, max_a: s.max_current_a !== undefined ? Number(s.max_current_a) : null, rated_a: null });
    } else {
      const out = r.output?.v; if (!out) continue;
      sources.set(i.name, { el: c.add(new VSource(`src:${i.name}`, c.node(nodeOf(pos.id)), c.node(nodeOf(neg.id)), out.voltage_v, 0, r.current_a.v.peak, "supply")), type: "supply", soc: null, min_v: null, limit: r.current_a.v.peak, max_a: null, rated_a: out.current_a });
    }
  }
  if (low) faults.push({ fault: low, note: socUsed === null ? "no battery in this harness: nothing changed" : `battery at ${Math.round(socUsed * 100)} % charge` });

  // ---- main switch and fuses
  const fuses = new Map<string, { el: Fuse; inst: string }>(), switches = new Map<string, Resistor>();
  for (const i of w.instances) {
    const r = role(i.name); if (r !== "switch" && r !== "protection") continue;
    const ts = termsOf(i.name).filter((t) => t.signal === "power"); if (ts.length < 2) continue;
    const a = nodeOf(ts[0].id), b = nodeOf(ts.find((t) => nodeOf(t.id) !== nodeOf(ts[0].id))?.id ?? ts[0].id); if (a === b) continue;
    if (r === "switch") { switches.set(i.name, c.add(new Resistor(`sw:${i.name}`, c.node(a), c.node(b), est("switch_contact_ohm", i.name), false, "switch"))); continue; }
    const id = fuseIdOf(w, i.name), f = w.fuses.find((x) => x.id === id);
    if (!f) { c.resistor(`link:${i.name}`, a, b, 1e-6); skipped.push(`${i.name}: a fuse holder with no fuse in the record, taken as a link`); continue; }
    const row = /atm/.test(i.key) ? FUSE_MINI.rows.find((q) => q.a === f.rating_a) : undefined;
    const ohm = row ? row.mohm / 1000 : est("fuse_other_drop_v", f.id) / f.rating_a;
    fuses.set(f.id, { el: c.add(new Fuse(`fuse:${f.id}`, c.node(a), c.node(b), f.rating_a, ohm, FUSE_MINI.curve)), inst: i.name });
  }

  // ---- regulators, and boards that source a rail
  const regs = new Map<string, { el: Regulator; inst: string; from: string; to: string | null; cont: number | null }>(), externals = new Map<string, VSource>();
  for (const P of parts.values()) {
    if (PASSIVE.has(P.role) || !P.sources.length) continue;
    P.sources.forEach((s, k) => {
      const name = P.sources.length > 1 ? `${P.inst}:${k + 1}` : P.inst;
      if (s.vset === undefined) { skipped.push(`${s.pin}: an output with no voltage in the record`); return; }
      if (P.role === "regulator") {
        const vin = P.sinks[0]; if (!vin) { skipped.push(`${P.inst}: a regulator with no input wired`); return; }
        const v = P.rec.voltage_v.v, out = P.rec.output?.v, rated = out ? out.voltage_v * out.current_a : 0;
        let eff: number;
        if (P.rec.heat_w && rated > 0) { eff = rated / (rated + P.rec.heat_w.v); assume(`efficiency:${P.key}`, +eff.toFixed(3), "", `efficiency of ${P.key} from its record: rated output ${f2(rated)} W over that plus its heat figure ${P.rec.heat_w.v} W (${P.rec.heat_w.src}${P.rec.heat_w.note ? `: ${P.rec.heat_w.note}` : ""}); used at every load`, P.inst); }
        else eff = est("buck_efficiency", P.inst);
        const dropout = v.min > s.vset ? v.min - s.vset : est("buck_dropout_v", P.inst), uvlo = v.min <= s.vset ? v.min : est("buck_uvlo_frac", P.inst) * s.vset;
        regs.set(name, { el: c.add(new Regulator(`reg:${name}`, c.node(vin.node), c.node(s.node), c.node(P.gnd), { type: "buck", vout: s.vset, dropout, i_limit: P.rec.current_a.v.peak, efficiency: eff, uvlo })), inst: P.inst, from: vin.pin, to: s.rail?.name ?? null, cont: out?.current_a ?? null });
      } else if (P.sinks.length) {
        const vin = P.sinks[0], through = vin.nominal !== undefined && vin.nominal <= s.vset + 1e-9;
        const limit = s.rail?.peak_limit_a ?? est("onboard_limit_a", P.inst);
        assume("onboard_linear", "linear", "", "a board's own regulator is modelled as linear (input current = output current) with the dropout estimate; where the board feeds the pin straight through, with none", P.inst);
        regs.set(name, { el: c.add(new Regulator(`reg:${name}`, c.node(vin.node), c.node(s.node), c.node(P.gnd), { type: "linear", vout: s.vset, dropout: through ? 0 : est("linear_dropout_v", P.inst), i_limit: limit })), inst: P.inst, from: vin.pin, to: s.rail?.name ?? null, cont: s.rail?.continuous_a ?? null });
      } else {
        assume("external_supply", "stiff", "", "a board with no supply wire in the harness (it runs from USB) sources its rail as a stiff source at the rail's nominal voltage, limited to the peak current of its record", P.inst);
        externals.set(name, c.add(new VSource(`ext:${name}`, c.node(s.node), c.node(P.gnd), s.vset, 0, P.rec.current_a.v.peak, "external")));
        sources.set(name, { el: externals.get(name)!, type: "external", soc: null, min_v: null, limit: P.rec.current_a.v.peak, max_a: null, rated_a: null });
      }
    });
  }

  // ---- loads
  const stallFaults = new Set((opts.faults ?? []).filter((f) => f.kind === "stall").map((f) => (f as { inst: string }).inst));
  const lockedAll = scenario === "stall" || scenario === "peak", share = opts.actuator_load ?? 1;
  if (!(share >= 0 && share <= 1)) throw new Error("electrical simulation: actuator_load must be between 0 and 1");
  const range = (P: PartModel, check = true) => { const v = P.rec.voltage_v.v; if (v.min !== v.max || !check) return { min: v.min, max: v.max }; const tol = est("single_voltage_tol", P.inst); return { min: v.nom * (1 - tol), max: v.nom * (1 + tol) }; };
  const knee = (P: PartModel, nominal: number | undefined) => { const nom = nominal ?? P.rec.voltage_v.v.nom, m = P.rec.voltage_v.v.min; return Math.max(0.05, Math.min(m > 0 ? m : nom / 2, nom * 0.95)); };
  const drawOf = (P: PartModel): { amps: number; basis: string } => {
    const given = opts.loads?.[P.inst]; if (given !== undefined) { if (!(given >= 0)) throw new Error(`electrical simulation: loads.${P.inst} must be a current in amperes`); return { amps: given, basis: "given in the options" }; }
    const cur = P.rec.current_a.v, s = specs(P.inst);
    if (P.role === "actuator") {
      if (scenario !== "idle") return { amps: cur.typical * share, basis: `${share === 1 ? "" : `${Math.round(share * 100)} % of the `}typical current of its record (${P.rec.current_a.src})` };
      if (s.idle_current_ma !== undefined) return { amps: Number(s.idle_current_ma) / 1000, basis: "idle current of the catalog" };
      if (s.no_load_current_a !== undefined) return { amps: Number(s.no_load_current_a), basis: "no-load current of the catalog" };
      return { amps: cur.typical * est("idle_frac", P.inst), basis: "idle current estimated from the typical" };
    }
    if (P.role === "driver") return { amps: est("driver_quiescent_a", P.inst), basis: "driver supply current, estimated" };
    if (P.role === "adapter" || scenario !== "peak") return { amps: cur.typical, basis: `typical current of its record (${P.rec.current_a.src})` };
    return { amps: cur.peak, basis: `peak current of its record (${P.rec.current_a.src})` };
  };
  const motorOf = (P: PartModel, a: string, b: string) => {
    const s = specs(P.inst), cur = P.rec.current_a.v, vr = Number(s.voltage_v) || P.rec.voltage_v.v.nom, istall = Number(s.stall_current_a) || Number(s.peak_current_a) || cur.peak;
    const ohm = vr / istall, i0 = s.no_load_current_a !== undefined ? Number(s.no_load_current_a) : 0, wnl = Number(s.no_load_speed_rad_s) || 0;
    const d = drawOf(P), fault = stallFaults.has(P.inst);
    const stalled: Tv<boolean> = lockedAll ? true : fault ? active : false;
    P.motor = c.add(new Motor(`motor:${P.inst}`, c.node(a), c.node(b), { ohm, k: wnl > 0 ? (vr - i0 * ohm) / wnl : 0, load_a: Math.min(d.amps, istall), stalled }));
    P.own = { el: P.motor, basis: `${d.basis}; stalled: voltage over ${f2(ohm)} ohm (${f2(vr)} V / ${f2(istall)} A stall, catalog)` };
  };
  for (const b of bridges) {
    const D = parts.get(b.driver)!, Mo = parts.get(b.motor)!, vm = D.sinks[0];
    if (!vm) { skipped.push(`${b.motor}: its driver ${b.driver} has no motor supply wired`); continue; }
    const s = specs(b.driver), vd = Number(s.voltage_drop_v) || 0, bipolar = /bipolar/i.test(String(s.note ?? "")) || /l298/.test(D.key), name = `bridge:${b.driver}:${b.port}`;
    let el: Element;
    if (vd && bipolar) el = c.add(new Diode(name, c.node(vm.node), c.node(nodeOf(b.hi)), vd, 1e-3, "bridge"));
    else el = c.add(new Resistor(name, c.node(vm.node), c.node(nodeOf(b.hi)), vd ? vd / D.rec.current_a.v.typical : est("bridge_ohm", b.driver), false, "bridge"));
    D.extra.push(el);
    motorOf(Mo, nodeOf(b.mhi), nodeOf(b.mlo));
    Mo.supply = { hi: nodeOf(b.mhi), lo: nodeOf(b.mlo), pin: b.mhi, check: false, ...range(Mo, false) };
  }
  const leaves = (P: PartModel, node: string) => wires.some((x) => x.kind === "power" && splitT(x.from)[0] === P.inst && nodeOf(x.from) === node);
  const budgetInto = (P: PartModel, node: string) => wires.filter((x) => x.kind === "power" && splitT(x.to)[0] === P.inst && nodeOf(x.to) === node).reduce((a, x) => a + (scenario === "peak" ? x.peak_a : x.typical_a), 0);
  for (const P of parts.values()) {
    if (PASSIVE.has(P.role) || P.role === "regulator") continue;
    const used = new Set<string>();
    if (P.role === "actuator" && P.motor) { /* behind a bridge: done above */ }
    else if (P.role === "actuator" && phaseLoads.some((q) => q.motor === P.inst)) {
      const D = parts.get(phaseLoads.find((q) => q.motor === P.inst)!.driver)!, vm = D.sinks[0];
      if (vm) { const d = drawOf(P), amps = lockedAll || stallFaults.has(P.inst) ? P.rec.current_a.v.peak : d.amps; P.own = { el: c.add(new CurrentLoad(`load:${P.inst}`, c.node(vm.node), c.node(D.gnd), amps, knee(D, vm.nominal))), basis: `${d.basis}, drawn at its driver's supply (a stepper or brushless motor is not modelled as a winding)` }; P.note = `through ${D.inst}`; }
    } else if (P.role === "actuator" && P.sinks.length) {
      motorOf(P, P.sinks[0].node, P.gnd); used.add(P.sinks[0].node);
      P.supply = { hi: P.sinks[0].node, lo: P.gnd, pin: P.sinks[0].pin, check: true, ...range(P) };
    } else if (P.sinks.length) {
      const d = drawOf(P), hasBridge = bridges.some((b) => b.driver === P.inst) || phaseLoads.some((q) => q.driver === P.inst);
      const at = P.role === "driver" ? [...P.sinks].sort((x, y) => (x.nominal ?? 0) - (y.nominal ?? 0))[0] : P.sinks[0];
      P.own = { el: c.add(new CurrentLoad(`load:${P.inst}`, c.node(at.node), c.node(P.gnd), d.amps, knee(P, at.nominal))), basis: d.basis };
      used.add(at.node); if (hasBridge) used.add(P.sinks[0].node);
      P.supply = { hi: P.sinks[0].node, lo: P.gnd, pin: P.sinks[0].pin, check: true, ...range(P) };
    }
    // other supply pins that only take current (an encoder's Vcc): the current the harness was sized for
    for (const s of P.sinks) {
      if (used.has(s.node) || leaves(P, s.node)) continue;
      const amps = budgetInto(P, s.node); if (!(amps > 0)) continue;
      assume("secondary_pins", "wiring record", "", "a second supply pin of a part (an encoder's Vcc, a driver's logic supply) draws the current the wiring record sized its wire for", P.inst);
      P.extra.push(c.add(new CurrentLoad(`load:${P.inst}:${splitT(s.pin)[2]}`, c.node(s.node), c.node(P.gnd), amps, Math.max(0.05, (s.nominal ?? 3.3) / 2))));
    }
    if (stallFaults.has(P.inst) && !P.motor && !phaseLoads.some((q) => q.motor === P.inst)) throw new Error(`electrical simulation: ${P.inst} is not a motor or servo that can stall`);
  }
  for (const i of stallFaults) { if (!parts.has(i)) throw new Error(`electrical simulation: no part ${i} to stall`); faults.push({ fault: { kind: "stall", inst: i }, note: parts.get(i)!.motor ? "rotor locked: its current is its voltage over its winding resistance" : "drawn at its record's peak current" }); }
  if (bridges.length) assume("full_duty", 100, "% duty", "motor drivers switched fully on", bridges[0].driver);

  // ---- faults
  const shorts: { el: Resistor; name: string }[] = [];
  for (const f of opts.faults ?? []) {
    if (f.kind === "open") {
      const hit = wires.filter((x) => (x.id === f.wire || x.orig === f.wire) && x.el);
      if (!hit.length) throw new Error(`electrical simulation: no simulated wire ${f.wire} to open (signal wires and bought leads are not simulated)`);
      for (const x of hit) x.el!.open = active;
      faults.push({ fault: f, note: `${hit[0].from} to ${hit[hit.length - 1].to} (${hit[0].net}) disconnected` });
    } else if (f.kind === "short") {
      const name = f.rail ?? f.net, net = name ? netBy.get(name) : undefined;
      if (!name || !net || net.kind !== "power") throw new Error(`electrical simulation: no rail or power net ${name ?? ""} to short`);
      let at = f.at;
      if (!at) { const src = railBy.get(name)?.source, own = net.pins.filter((t) => T.has(t)), mine = own.filter((t) => splitT(t)[0] === src); at = mine.find((t) => T.get(t)!.dir === "out" || T.get(t)!.dir === "power_out") ?? mine[mine.length - 1] ?? own[0]; }
      if (!at || !T.has(at)) throw new Error(`electrical simulation: ${name} has no simulated pin${f.at ? ` ${f.at}` : ""} to short`);
      const P = parts.get(splitT(at)[0]), g = P && !PASSIVE.has(P.role) ? P.gnd : "0", node = nodeOf(at);
      if (node === g) throw new Error(`electrical simulation: ${at} is already on ground`);
      const ohm = f.ohm ?? est("short_ohm", name);
      const el = c.switch(`short:${name}${shorts.length ? `:${shorts.length + 1}` : ""}`, node, g, active, ohm);
      shorts.push({ el, name });
      faults.push({ fault: f, note: `${f2(ohm * 1000)} milliohm from ${at} to ground` });
    } else if (f.kind !== "stall" && f.kind !== "low_battery") throw new Error(`electrical simulation: unknown fault kind ${(f as { kind: string }).kind}`);
  }
  for (const cap of tr?.capacitors ?? []) {
    if (!T.has(cap.at) || !(cap.uf > 0)) throw new Error(`electrical simulation: capacitor at ${cap.at}: no such simulated pin, or no capacitance`);
    const P = parts.get(splitT(cap.at)[0]);
    c.capacitor(`cap:${cap.at}`, nodeOf(cap.at), P && !PASSIVE.has(P.role) ? P.gnd : "0", cap.uf * 1e-6);
  }
  return { w, w0, c, T, wires, parts, sources, fuses, switches, regs, shorts, bridges, nodeOf, netsOf, netBy, railBy, faults, skipped, soc: socUsed, tFault, role, rec, assumptions: () => [...assumed.values()] };
}
type Model = ReturnType<typeof build>;

function snapshot(M: Model, x: Float64Array, ctx: Ctx, logic: SimEvent[]): SimState {
  const { c, w } = M, v = (node: string) => (c.has(node) ? c.v(x, node) : 0), events: SimEvent[] = [];
  const ev = (e: SimEvent) => events.push(e);
  // ---- pins, nodes, nets
  const pins: Record<string, number> = {}, byNode = new Map<string, string[]>();
  for (const t of M.T.keys()) { const n = M.nodeOf(t); if (!c.has(n)) continue; pins[t] = v(n); byNode.set(n, [...(byNode.get(n) ?? []), t]); }
  const nodes = [...byNode].map(([id, ps]) => ({ id, v: v(id), pins: ps.sort(), nets: [...new Set(ps.flatMap((t) => M.netsOf.get(t) ?? []))].sort() })).sort((a, b) => a.id.localeCompare(b.id));
  const nets: SimState["nets"] = {};
  for (const n of w.nets) { const vs = n.pins.filter((t) => t in pins).map((t) => pins[t]); if (vs.length) nets[n.name] = { kind: n.kind, nominal_v: n.voltage_v ?? null, min_v: Math.min(...vs), max_v: Math.max(...vs) }; }
  // ---- wires
  const wires: Record<string, SimWire> = {}, power: SimPower = { sources_w: 0, source_internal_w: 0, wires_w: 0, switches_fuses_w: 0, regulators_w: 0, drivers_w: 0, loads_w: 0, fault_w: 0, balance_w: 0 };
  const pinAmps = new Map<string, number>();
  for (const xw of M.wires) {
    if (!xw.el) continue;
    const i = xw.el.current(x, ctx), row = WIRING.awg.find((g) => g.awg === xw.awg) as ({ ampacity_a: number; chassis_free_air_a?: number } | undefined);
    const a = pins[xw.from], b = pins[xw.to], amp = row?.ampacity_a ?? null, free = row?.chassis_free_air_a ?? null;
    wires[xw.id] = { current_a: i, from_v: a, to_v: b, drop_v: a - b, loss_w: xw.ohm * i * i, ohm: xw.ohm, awg: xw.awg, ampacity_a: amp, free_air_a: free, load_pct: amp ? (Math.abs(i) / amp) * 100 : null, open: xw.el.isOpen(ctx) };
    power.wires_w += xw.ohm * i * i;
    for (const t of [xw.from, xw.to]) pinAmps.set(t, Math.max(pinAmps.get(t) ?? 0, Math.abs(i)));
    if (amp && Math.abs(i) > amp * 1.0001) ev({ kind: "wire_overcurrent", severity: free && Math.abs(i) > free ? "error" : "warning", wire: xw.id, value: Math.abs(i), limit: amp, message: `wire ${xw.id} (${xw.awg} AWG, ${xw.net}) carries ${f2(Math.abs(i))} A: over its ${amp} A in a bundle${free ? (Math.abs(i) > free ? ` and over its ${free} A in free air` : `, under its ${free} A in free air (fine for a short peak)`) : ""}` });
  }
  // a lead cut by a branch fuse, also under the id the wiring record gives the whole lead
  for (const xw of M.wires) if (xw.orig !== xw.id && wires[xw.id]) { const p = wires[xw.orig], q = wires[xw.id]; wires[xw.orig] = p ? { ...p, to_v: q.to_v, drop_v: p.from_v - q.to_v, loss_w: p.loss_w + q.loss_w, ohm: p.ohm + q.ohm, open: p.open || q.open } : { ...q }; }
  // ---- connectors, switches, splices at the wire ends
  const through = new Map<string, number>();
  for (const [t, amps] of pinAmps) {
    const term = M.T.get(t)!, r = M.rec(term.inst)!, ro = r.role;
    if (ro === "protection") continue;
    if (ro === "switch" || ro === "splice") { through.set(term.inst, Math.max(through.get(term.inst) ?? 0, amps)); continue; }
    const fam = connectorFamily(r.ports.find((p) => p.name === term.port)!.connector.v), lim = WIRING.connectors[fam]?.current_a;
    if (lim && amps > lim * 1.0001) ev({ kind: "connector_overcurrent", severity: "warning", inst: term.inst, pin: t, value: amps, limit: lim, message: `${t}: ${f2(amps)} A through a ${WIRING.connectors[fam].name} contact rated ${lim} A` });
  }
  for (const [name, amps] of through) { const lim = M.rec(name)!.current_a.v.typical, sw = M.role(name) === "switch"; if (lim > 0 && amps > lim * 1.0001) ev({ kind: sw ? "switch_overcurrent" : "connector_overcurrent", severity: "warning", inst: name, value: amps, limit: lim, message: `${name} carries ${f2(amps)} A, over its ${lim} A rating` }); }
  // ---- sources
  const sources: Record<string, SimSource> = {};
  for (const [name, s] of M.sources) {
    const i = s.el.current(x), tv = s.el.volts(x), heat = s.el.heat(x), st = s.el.state(x, ctx), key = M.parts.get(name.split(":")[0])?.key ?? "";
    sources[name] = { key, type: s.type, emf_v: s.el.emf(ctx), ohm: s.el.ohm, terminal_v: tv, current_a: i, power_w: tv * i, internal_w: heat, soc: s.soc, limit_a: s.limit, state: st, min_v: s.min_v };
    power.sources_w += tv * i + heat; power.source_internal_w += heat;
    if (st === "limit") ev({ kind: "source_limit", severity: "error", inst: name, value: i, limit: s.limit!, message: `${name} is in current limit at ${f2(i)} A: its output has fallen to ${f2(tv)} V` });
    else if (s.rated_a !== null && i > s.rated_a * 1.0001) ev({ kind: "supply_overload", severity: "warning", inst: name, value: i, limit: s.rated_a, message: `${name} delivers ${f2(i)} A, over its ${s.rated_a} A rating (its limit is ${s.limit} A)` });
    if (s.type === "battery" && s.min_v !== null && tv < s.min_v) ev({ kind: "battery_cutoff", severity: "error", inst: name, value: tv, limit: s.min_v, message: `${name} is at ${f2(tv)} V under load, under the ${s.min_v} V its record gives as the lowest it may go` });
    if (s.max_a !== null && i > s.max_a) ev({ kind: "battery_overcurrent", severity: "warning", inst: name, value: i, limit: s.max_a, message: `${name} delivers ${f2(i)} A, over the ${s.max_a} A the pack is rated for` });
  }
  // ---- switch, fuses
  for (const el of M.switches.values()) power.switches_fuses_w += el.ohm * el.current(x, ctx) ** 2;
  const fuses: Record<string, SimFuse> = {};
  for (const [id, f] of M.fuses) {
    const i = f.el.current(x, ctx), m = Math.abs(i) / f.el.rating;
    fuses[id] = { inst: f.inst, rating_a: f.el.rating, ohm: f.el.ohm, current_a: i, load_pct: m * 100, blown: f.el.blown, opens_s: f.el.blown ? null : f.el.window(i) };
    power.switches_fuses_w += f.el.ohm * i * i;
    if (!f.el.blown && m > 1.0001 && !f.el.window(i)) ev({ kind: "fuse_overload", severity: m > f.el.curve.hold ? "warning" : "info", fuse: id, inst: f.inst, value: Math.abs(i), limit: f.el.rating, message: m > f.el.curve.hold ? `fuse ${id} (${f.el.rating} A) carries ${f2(Math.abs(i))} A, ${m > 1.2 ? Math.round(m * 100) : (m * 100).toFixed(1)} % of its rating: its datasheet promises neither that it holds nor that it opens` : `fuse ${id} (${f.el.rating} A) carries ${f2(Math.abs(i))} A: above its rating, inside the 110 % it must hold for 100 hours` });
  }
  // ---- regulators
  const regulators: Record<string, SimRegulator> = {};
  for (const [name, r] of M.regs) {
    const o = r.el.out(x, ctx), st = r.el.state(x, ctx), sp = r.el.spec;
    regulators[name] = { inst: r.inst, type: sp.type, from: r.from, to: r.to, set_v: sp.vout, vin: o.vin, vout: o.vout, iin: o.iin, iout: o.iout, loss_w: o.loss_w, efficiency: o.vin * o.iin > 1e-9 ? (o.vout * o.iout) / (o.vin * o.iin) : null, limit_a: Number.isFinite(sp.i_limit) ? sp.i_limit : null, state: st };
    power.regulators_w += o.loss_w;
    const what = `${r.inst}${r.to ? ` (${r.to})` : ""}`;
    if (st === "dropout") ev({ kind: "regulator_dropout", severity: "warning", inst: r.inst, rail: r.to ?? undefined, value: o.vout, limit: sp.vout, message: `${what} is in dropout: ${f2(o.vin)} V in is under the ${f2(sp.vout + sp.dropout)} V it needs, so its ${f2(sp.vout)} V output is at ${f2(o.vout)} V` });
    else if (st === "off") ev({ kind: "regulator_off", severity: "error", inst: r.inst, rail: r.to ?? undefined, value: o.vin, message: `${what} has stopped: only ${f2(o.vin)} V at its input` });
    else if (st === "limit") ev({ kind: "regulator_limit", severity: "error", inst: r.inst, rail: r.to ?? undefined, value: o.iout, limit: sp.i_limit, message: `${what} is in current limit at ${f2(o.iout)} A: its ${f2(sp.vout)} V output has fallen to ${f2(o.vout)} V` });
    else if (r.cont !== null && o.iout > r.cont * 1.0001) ev({ kind: "regulator_overload", severity: "warning", inst: r.inst, rail: r.to ?? undefined, value: o.iout, limit: r.cont, message: `${what} delivers ${f2(o.iout)} A, over its ${r.cont} A continuous rating (limit ${sp.i_limit} A)` });
  }
  // ---- parts
  const parts: Record<string, SimPart> = {};
  for (const P of M.parts.values()) {
    if (P.role === "splice" || P.role === "carrier" || P.role === "battery" || P.role === "psu" || P.role === "switch" || P.role === "protection") continue;
    const own = P.own ? P.own.el.current(x, ctx) : 0, ownW = P.own ? P.own.el.current(x, ctx) * P.own.el.volts(x) : 0;
    let extraA = 0, extraW = 0;
    for (const e of P.extra) { const p = e.current(x, ctx) * e.volts(x); if (e.kind === "bridge") power.drivers_w += p; else { power.loads_w += p; extraA += e.current(x, ctx); } extraW += p; }
    power.loads_w += ownW;
    const out: SimPart = { key: P.key, role: P.role, state: "ok", supply_pin: P.supply?.pin ?? null, supply_v: null, ground_v: c.has(P.gnd) && P.gndPin ? v(P.gnd) : null, min_v: null, max_v: null, supplies: P.sinks.map((s) => ({ pin: s.pin, v: v(s.node) - v(P.gnd), nominal_v: s.nominal ?? null })), current_a: own + extraA, power_w: ownW + extraW, basis: P.own?.basis ?? (P.role === "regulator" ? "a regulator: see regulators" : "no current of its own in the model"), ...(P.note ? { note: P.note } : {}) };
    if (P.motor) out.motor = { stalled: P.motor.state(x, ctx) === "stalled", speed_rad_s: P.motor.k > 0 ? P.motor.speed(x, ctx) : null, stall_ohm: P.motor.ohm, heat_w: P.motor.heat(x, ctx) };
    if (P.role === "regulator") { const s = P.sinks[0]; if (s) { out.supply_pin = s.pin; out.supply_v = v(s.node) - v(P.gnd); out.min_v = P.rec.voltage_v.v.min; out.max_v = P.rec.voltage_v.v.max; if (out.supply_v > out.max_v * 1.0001) { out.state = "over_voltage"; ev({ kind: "over_voltage", severity: "warning", inst: P.inst, pin: s.pin, value: out.supply_v, limit: out.max_v, message: `${P.inst} gets ${f2(out.supply_v)} V at its input, over the ${f2(out.max_v)} V maximum of its record` }); } } else out.state = "not_simulated"; }
    else if (P.supply) {
      const sv = v(P.supply.hi) - v(P.supply.lo), r = P.supply; out.supply_v = sv;
      if (P.supply.check) {
        out.min_v = r.min; out.max_v = r.max;
        if (sv < 0.1 * r.min || sv < 0.05) { out.state = "unpowered"; ev({ kind: "unpowered", severity: "error", inst: P.inst, pin: P.supply.pin, value: sv, limit: r.min, message: `${P.inst} has no supply (${f2(sv)} V at ${splitT(P.supply.pin)[2]})` }); }
        else if (sv < r.min - 1e-6) { out.state = "brown_out"; ev({ kind: "brown_out", severity: "error", inst: P.inst, pin: P.supply.pin, value: sv, limit: r.min, message: `${P.inst} gets ${f2(sv)} V at ${splitT(P.supply.pin)[2]}, under the ${f2(r.min)} V minimum of its record${P.role === "controller" ? " (the record holds no reset threshold, so this is its supply limit, not the voltage it resets at)" : ""}` }); }
        else if (sv > r.max + 1e-6) { out.state = "over_voltage"; ev({ kind: "over_voltage", severity: "warning", inst: P.inst, pin: P.supply.pin, value: sv, limit: r.max, message: `${P.inst} gets ${f2(sv)} V at ${splitT(P.supply.pin)[2]}, over the ${f2(r.max)} V maximum of its record` }); }
      } else {
        const max = r.max;
        if (sv > max + 1e-6) ev({ kind: "motor_over_voltage", severity: "info", inst: P.inst, pin: P.supply.pin, value: sv, limit: max, message: `${P.inst} sees ${f2(sv)} V at 100 % duty, over its ${f2(max)} V rating: keep the PWM duty under ${Math.floor((max / sv) * 100)} %` });
      }
    } else if (P.sources.length && !P.sinks.length) { out.state = "external"; out.note = "powered from outside the harness (USB)"; }
    else if (!P.own) { out.state = "not_simulated"; out.note = out.note ?? "no supply wire in the simulated harness (powered through a bought lead, or not at all)"; }
    // a second supply pin (a driver's logic supply, an encoder's Vcc) at under half its nominal voltage
    if (out.state === "ok") for (const s of out.supplies) if (s.pin !== out.supply_pin && s.nominal_v && s.v < s.nominal_v / 2) { out.state = "brown_out"; ev({ kind: "brown_out", severity: "error", inst: P.inst, pin: s.pin, value: s.v, limit: s.nominal_v, message: `${P.inst} has ${f2(s.v)} V at ${splitT(s.pin)[2]}, which should be at ${f2(s.nominal_v)} V` }); }
    parts[P.inst] = out;
  }
  for (const s of M.shorts) { const i = s.el.current(x, ctx), p = s.el.ohm * i * i; power.fault_w += p; if (!s.el.isOpen(ctx)) ev({ kind: "short", severity: "info", rail: s.name, value: Math.abs(i), message: `short on ${s.name}: ${f2(Math.abs(i))} A flows through it` }); }
  power.balance_w = power.sources_w - power.source_internal_w - power.wires_w - power.switches_fuses_w - power.regulators_w - power.drivers_w - power.loads_w - power.fault_w;
  // ---- rails
  const rails: Record<string, SimRail> = {};
  for (const r of w.rails) {
    const net = M.netBy.get(r.name), own = (net?.pins ?? []).filter((t) => t in pins);
    const srcPins = own.filter((t) => splitT(t)[0] === r.source), srcPin = srcPins.find((t) => /out/.test(M.T.get(t)!.dir)) ?? srcPins[srcPins.length - 1];
    let min: number | null = null, at: string | null = null;
    for (const t of own) { const P = M.parts.get(splitT(t)[0]); if (!P || PASSIVE.has(P.role) || P.inst === r.source || !P.sinks.some((s) => s.node === M.nodeOf(t))) continue; const sv = pins[t] - (c.has(P.gnd) ? v(P.gnd) : 0); if (min === null || sv < min) { min = sv; at = t; } }
    const reg = [...M.regs.values()].find((q) => q.inst === r.source && q.to === r.name), sw = M.switches.get(r.source), fu = [...M.fuses.values()].find((q) => q.inst === r.source), so = M.sources.get(r.source);
    const amps = reg ? reg.el.out(x, ctx).iout : sw ? Math.abs(sw.current(x, ctx)) : fu ? Math.abs(fu.el.current(x, ctx)) : so ? so.el.current(x) : null;
    rails[r.name] = { nominal_v: r.voltage_v, source: r.source, source_v: srcPin ? pins[srcPin] : null, min_v: min, min_at: at, sag_v: min === null ? null : r.voltage_v - min, current_a: amps, budget: { typical_a: r.typical_a, peak_a: r.peak_a, simultaneous: r.simultaneous } };
  }
  events.push(...logic);
  return { pins, nodes, nets, wires, rails, parts, sources, regulators, fuses, power, events };
}

const EMPTY = (): SimState => ({ pins: {}, nodes: [], nets: {}, wires: {}, rails: {}, parts: {}, sources: {}, regulators: {}, fuses: {}, power: { sources_w: 0, source_internal_w: 0, wires_w: 0, switches_fuses_w: 0, regulators_w: 0, drivers_w: 0, loads_w: 0, fault_w: 0, balance_w: 0 }, events: [] });

/**
 * Simulate a robot's electrics. `wiring` defaults to the record the robot carries (`metadata.design.wiring`).
 * Returns the operating point (node voltages per pin, current per wire, each rail's lowest voltage, each part's
 * supply, heat in wires and regulators) with events for everything out of range, after any fuse that must open has
 * opened. When no steady state exists the result says so (`converged: false`) and holds no numbers.
 */
export function simulate(spec: RobotSpecification, wiring?: WiringRecord | null, opts: SimOptions = {}): SimResult {
  const w0 = wiring ?? (spec.metadata as { design?: { wiring?: WiringRecord } } | undefined)?.design?.wiring;
  if (!w0?.cables?.length) throw new Error("electrical simulation: this robot has no wiring record");
  const scenario = opts.scenario ?? "typical";
  if (!["idle", "typical", "peak", "stall"].includes(scenario)) throw new Error(`electrical simulation: unknown scenario ${scenario}`);
  const M = build(w0, opts, scenario), sol: Solution = M.c.dc();
  const head = { robot: spec.robot_name, scenario, soc: M.soc, faults: M.faults, assumptions: M.assumptions(), model: MODEL_NOTES, not_simulated: M.skipped };
  if (!sol.ok) return { ...head, converged: false, reason: sol.reason ?? "no steady operating point found", iterations: sol.iterations, kcl_max_residual_a: null, warnings: [`no steady operating point: ${sol.reason ?? ""}`], trips: sol.trips, elements: [], ...EMPTY() };
  // logic levels: the static report of the wiring record (nominal voltages)
  const logic: SimEvent[] = [];
  for (const l of electricalReport(w0).logic) if (l.verdict === "over_voltage" || l.verdict === "too_low" || l.verdict === "marginal") logic.push({ kind: "logic_level", severity: l.verdict === "marginal" ? "info" : "warning", value: l.voh ?? undefined, limit: (l.verdict === "over_voltage" ? l.max_in : l.vih) ?? undefined, message: `${l.net}: ${l.from} into ${l.to}: ${l.advice}` });
  const state = snapshot(M, sol.x, sol.ctx, logic);
  const trips: SimEvent[] = sol.trips.map((t) => { const id = t.fuse.replace(/^fuse:/, ""); return { kind: "fuse_blown", severity: "error", fuse: id, inst: M.fuses.get(id)?.inst, value: Math.abs(t.current_a), limit: t.rating_a, opens_s: t.opens_s, message: `fuse ${id} (${t.rating_a} A) opens: ${f2(Math.abs(t.current_a))} A is ${Math.round((Math.abs(t.current_a) / t.rating_a) * 100)} % of its rating, which its datasheet clears in ${fmtS(t.opens_s[0])} to ${fmtS(t.opens_s[1])}` }; });
  state.events = [...trips, ...state.events];
  let before: SimState | undefined;
  if (sol.before_trip) { for (const f of M.fuses.values()) f.el.blown = false; before = snapshot(M, sol.before_trip.x, sol.ctx, []); for (const t of sol.trips) M.c.el<Fuse>(t.fuse).blown = true; }
  const elements = M.c.elements.map((e) => ({ name: e.name, kind: e.kind, nodes: e.nodes.map((n) => M.c.nodeNames[n]), i_a: e.terminal(sol.x, sol.ctx) }));
  const res: SimResult = { ...head, converged: true, iterations: sol.iterations, kcl_max_residual_a: sol.kcl_a, warnings: state.events.filter((e) => e.severity !== "info").map((e) => e.message), trips: sol.trips.map((t) => ({ ...t, fuse: t.fuse.replace(/^fuse:/, "") })), ...(before ? { before_trip: before } : {}), elements, ...state };
  if (opts.transient) res.transient = transient(M, opts.transient, logic);
  return res;
}
const fmtS = (s: number) => (s >= 100 ? `${s.toFixed(0)} s` : s >= 1 ? `${s.toFixed(1)} s` : `${(s * 1000).toFixed(0)} ms`);

function transient(M: Model, o: NonNullable<SimOptions["transient"]>, _logic: SimEvent[]): SimTransient {
  if (!(o.t_end_s > 0 && o.dt_s > 0)) throw new Error("electrical simulation: transient needs t_end_s and dt_s above zero");
  const method = o.method ?? "trap", note = "A sequence of operating points: the faults are applied at t_fault_s and fuses heat against their datasheet curve. The catalog holds no capacitance or inductance; only capacitors given in the options store energy.";
  const out: SimTransient = { ok: true, t_s: [], t_fault_s: M.tFault, method, rails: {}, sources: {}, fuses: {}, events: [], note };
  const r = M.c.transient({ t_end: o.t_end_s, dt: o.dt_s, method });
  if (!r.ok) { out.ok = false; out.reason = r.reason; }
  // replay the fuses so that each step's snapshot sees them as they were
  const blownAt = new Map(r.events.map((e) => [e.element, e.t]));
  const seen = new Set<string>();
  for (const id of M.fuses.keys()) out.fuses[id] = { current_a: [], blown_at_s: blownAt.get(`fuse:${id}`) ?? null };
  for (let k = 0; k < r.t.length; k++) {
    const t = r.t[k], ctx: Ctx = { mode: k ? "tran" : "dc", t, dt: o.dt_s, method, scale: 1, noLoad: false };
    for (const [id, f] of M.fuses) f.el.blown = (blownAt.get(`fuse:${id}`) ?? Infinity) < t;
    const s = snapshot(M, r.x[k], ctx, []);
    out.t_s.push(t);
    for (const [name, q] of Object.entries(s.rails)) { const a = (out.rails[name] ??= { source_v: [], min_v: [] }); a.source_v.push(q.source_v); a.min_v.push(q.min_v); }
    for (const [name, q] of Object.entries(s.sources)) { const a = (out.sources[name] ??= { current_a: [], terminal_v: [] }); a.current_a.push(q.current_a); a.terminal_v.push(q.terminal_v); }
    for (const [id, q] of Object.entries(s.fuses)) out.fuses[id].current_a.push(q.current_a);
    for (const [id, f] of M.fuses) if (blownAt.get(`fuse:${id}`) === t && !seen.has(`blown:${id}`)) { seen.add(`blown:${id}`); out.events.push({ t_s: t, kind: "fuse_blown", severity: "error", fuse: id, inst: f.inst, limit: f.el.rating, message: `fuse ${id} (${f.el.rating} A) opens at ${fmtS(t)}` }); }
    for (const e of s.events) { const key = `${e.kind}:${e.inst ?? ""}:${e.wire ?? ""}:${e.fuse ?? ""}:${e.rail ?? ""}:${e.pin ?? ""}`; if (!seen.has(key)) { seen.add(key); out.events.push({ t_s: t, ...e }); } }
  }
  return out;
}

export interface SimDischarge {
  /** false: the battery life could not be worked out; `reason` says why */
  ok: boolean; reason?: string;
  robot: string; scenario: Scenario; source: string | null; capacity_ah: number | null;
  /** hours from full until the run ends (null when it does not end before the pack is empty, or not ok) */
  life_h: number | null;
  /** what ends it: the first error the simulation reports as the pack runs down, or "empty" */
  ends: string | null; ends_at_soc: number | null;
  /** one operating point per step of charge, from full down */
  points: { soc: number; t_h: number; emf_v: number; terminal_v: number; current_a: number; power_w: number; rails: Record<string, number | null> }[];
  note: string;
}

/**
 * Battery life: the pack run down from full in steps of charge (default 2 %), the harness solved at every step (its
 * voltage falls with the pack's rest curve and its internal resistance), and the time to use each step's charge
 * worked out from the current the solution draws (trapezoid between steps). It ends at the first step whose
 * operating point has an error (a brown-out, the pack under its cutoff, a regulator off), or when no operating point
 * exists. The faults apply throughout, except a low battery, which this replaces.
 */
export function discharge(spec: RobotSpecification, wiring?: WiringRecord | null, opts: SimOptions & { step?: number } = {}): SimDischarge {
  const w0 = wiring ?? (spec.metadata as { design?: { wiring?: WiringRecord } } | undefined)?.design?.wiring;
  if (!w0?.cables?.length) throw new Error("electrical simulation: this robot has no wiring record");
  const scenario = opts.scenario ?? "typical", step = opts.step ?? 0.02;
  if (!(step > 0 && step <= 0.25)) throw new Error("electrical simulation: discharge step must be above 0 and at most 0.25");
  const note = "Each point is a solved operating point at that state of charge; time is the charge between points over the mean current the solutions draw. The rest curve and internal resistance are estimates (see a simulation's assumptions); the pack's capacity is its catalog rating, and a real pack gives less when cold, old or drained fast.";
  const base = { robot: spec.robot_name, scenario, life_h: null, ends: null, ends_at_soc: null, points: [], note };
  const batteries = w0.instances.filter((i) => electrical(i.key)?.role === "battery");
  if (batteries.length !== 1) return { ...base, ok: false, source: null, capacity_ah: null, reason: batteries.length ? `${batteries.length} batteries: their life is not worked out together` : "the robot has no battery (it runs from a supply)" };
  const b = batteries[0], mah = Number(CATALOG[b.key]?.specs?.capacity_mah);
  if (!(mah > 0)) return { ...base, ok: false, source: b.name, capacity_ah: null, reason: `${b.name} (${b.key}) has no capacity in its catalog record` };
  const ah = mah / 1000, faults = (opts.faults ?? []).filter((f) => f.kind !== "low_battery");
  const out: SimDischarge = { ...base, ok: true, source: b.name, capacity_ah: ah, points: [] };
  let t = 0, prevI: number | null = null;
  for (let k = 0; ; k++) {
    const soc = Math.max(0, +(1 - k * step).toFixed(6));
    const r = simulate(spec, w0, { ...opts, faults, soc, transient: undefined });
    if (!r.converged) { out.ends = `no operating point at ${Math.round(soc * 100)} %: ${r.reason ?? "the solver did not converge"}`; out.ends_at_soc = soc; break; }
    const s = r.sources[b.name], i = Math.max(0, s.current_a);
    if (prevI !== null) { const mean = (prevI + i) / 2; t += mean > 1e-9 ? (step * ah) / mean : Infinity; }
    prevI = i;
    out.points.push({ soc, t_h: t, emf_v: s.emf_v, terminal_v: s.terminal_v, current_a: s.current_a, power_w: s.power_w, rails: Object.fromEntries(Object.entries(r.rails).map(([n, x]) => [n, x.min_v])) });
    const err = r.events.find((e) => e.severity === "error");
    if (err) { out.ends = err.message; out.ends_at_soc = soc; out.life_h = Number.isFinite(t) ? t : null; break; }
    if (soc <= 0) { out.ends = "empty"; out.ends_at_soc = 0; out.life_h = Number.isFinite(t) ? t : null; break; }
  }
  return out;
}
