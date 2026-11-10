// The circuit as a schematic sees it, built from a wiring record and nothing else: parts with reference designators and
// the pins this robot uses, and electrical nodes. A node is what is really one conductor: the wires of the record joined
// end to end, lever splices (a splice is a junction, not a part), pins a part ties together inside itself (a bus servo's
// two DATA pins, a board's GND pins), and pins two nets share. A bought lead (USB, camera FFC) is a cable node between
// two whole ports.
import { electrical, part, type Pin } from "@ttr/parts";
import type { WiringRecord, NetKind, WireRec } from "../wiring.ts";

export type Side = "left" | "right" | "top" | "bottom";
export type SymbolKind = "battery" | "psu" | "inlet" | "switch" | "fuse" | "regulator" | "board" | "ic" | "motor" | "servo" | "stepper" | "sensor" | "led" | "module";
export interface CPin {
  /** schematic pin id: the record terminal `inst.port.pin`, or `inst.port#k` for the k-th lead into a whole port */
  id: string; inst: string; port: string; name: string; num: string; signal: string; dir: string;
  /** record terminals this pin stands for (one, or every pin of a port for a bought lead) */
  members: string[]; nc?: boolean; bundle?: boolean; side?: Side;
}
export interface CPart { inst: string; key: string; ref: string; role: string; kind: SymbolKind; value: string; pins: CPin[]; unusedPorts: string[]; note?: string; }
export type NodeKind = NetKind | "cable";
export interface CNode { id: string; name: string; nets: string[]; kind: NodeKind; voltage_v?: number; pins: string[]; cable?: string; }
export interface CircuitModel { robot: string; parts: CPart[]; nodes: CNode[]; pin: Map<string, CPin>; nodeOf: Map<string, CNode>; part: Map<string, CPart>; emptyNets: string[]; splices: string[]; }

const PREFIX: Record<string, string> = { battery: "BT", psu: "PS", inlet: "J", switch: "SW", fuse: "F", regulator: "U", board: "A", ic: "U", module: "U", motor: "M", servo: "M", stepper: "M", sensor: "U", led: "D" };
const SHOW_ALL = new Set(["controller", "driver", "regulator", "adapter"]);
/** pins a part does not tie together by name: separate sockets of the same kind */
const NO_TIE = new Set(["usb", "csi"]);
export const shortPin = (s: string) => s.split(" (")[0].trim();

export function symbolKind(key: string, role: string): SymbolKind {
  if (role === "battery") return "battery";
  if (role === "psu") return "psu";
  if (role === "switch") return /iec|inlet/.test(key) ? "inlet" : "switch";
  if (role === "protection") return "fuse";
  if (role === "regulator") return "regulator";
  if (role === "controller") return "board";
  if (role === "actuator") return /nema/.test(key) ? "stepper" : /hobby_|feetech|dxl_|sts|servo/.test(key) ? "servo" : "motor";
  if (role === "sensor") return "sensor";
  if (role === "indicator") return /led_5mm/.test(key) ? "led" : "module";
  return "ic";
}
/** Short value text: the catalog name up to its first bracket or comma. */
export function shortName(key: string) { const n = part(key).name; return n.split(/ \(|, /)[0].replace(/\s+/g, " ").trim(); }

/** The fuse each fuse part stands for: the main fuse is F1, a branch fuse carries its id in its note. */
export function fuseIdOf(w: WiringRecord, inst: string): string | undefined {
  const i = w.instances.find((x) => x.name === inst);
  if (!i) return undefined;
  const m = i.note?.match(/^(F\d+):/);
  if (m) return m[1];
  return inst === "main_fuse" && w.fuses.some((f) => f.id === "F1") ? "F1" : undefined;
}

/**
 * The record lists a branch fuse (F2...) by what it protects but draws it as no part: it sits inline in the lead from
 * the main rail's splice to that part. This returns the record with each branch fuse as a part of its own and its lead
 * cut in two at the fuse (splice to fuse IN, fuse OUT on to the part), so a drawing shows it where it really is.
 * The lead is found by the rule that fused it: a main-rail wire from a splice to the protected part.
 */
export function withBranchFuses(w: WiringRecord): WiringRecord {
  const main = w.rails.find((r) => r.fuse_a != null)?.name;
  const branch = w.fuses.filter((f) => /^branch /.test(f.protects));
  if (!main || !branch.length || w.instances.some((i) => /^F\d+:/.test(i.note ?? ""))) return w;
  const volts = w.rails.find((x) => x.name === main)!.voltage_v;
  const r: WiringRecord = structuredClone(w), claimed = new Set<string>(), names = new Set(r.instances.map((i) => i.name));
  for (const f of branch) {
    const target = f.protects.slice(7);
    const leads = r.cables.flatMap((c) => c.premade ? [] : c.wires.map((x) => ({ c, x }))).filter(({ x }) => x.net === main && x.from.startsWith("splice_") && x.to.split(".")[0] === target && !claimed.has(x.id));
    const hit = leads.find(({ x }) => x.awg === f.wire_awg) ?? leads[0];
    if (!hit) continue;
    claimed.add(hit.x.id);
    let name = `branch_fuse_${target}`;
    for (let k = 2; names.has(name); k++) name = `branch_fuse_${target}_${k}`;
    names.add(name);
    r.instances.push({ name, key: f.rating_a > 30 || volts > 32 ? "fuse_holder_anl" : "fuse_holder_atm_inline", link: null, note: `${f.id}: ${f.rating_a} A branch fuse, inline in the lead to ${target}` });
    const port = electrical(r.instances[r.instances.length - 1].key)!.ports[0].name;
    const inT = `${name}.${port}.IN`, outT = `${name}.${port}.OUT`, near = Math.min(50, Math.round(hit.x.length_mm / 3));
    const a: WireRec = { ...hit.x, id: `${hit.x.id}a`, to: inT, length_mm: near }, b: WireRec = { ...hit.x, id: `${hit.x.id}b`, from: outT, length_mm: hit.x.length_mm - near };
    hit.c.wires.splice(hit.c.wires.indexOf(hit.x), 1, a, b);
    const net = r.nets.find((n) => n.name === main);
    if (net) net.pins.push(inT, outT);
  }
  return r;
}

export function buildModel(w: WiringRecord, robot: string): CircuitModel {
  const inst = new Map(w.instances.map((i) => [i.name, i]));
  const role = (i: string) => electrical(inst.get(i)!.key)?.role ?? "load";
  const isSplice = (i: string) => role(i) === "splice";
  const splices = w.instances.filter((i) => role(i.name) === "splice").map((i) => i.name);
  // ---- bought leads: a cable node between two whole ports
  const premadeNets = new Set<string>(), bundles: { net: string; cable: string; label: string; ends: [string, string][] }[] = [];
  for (const c of w.cables) if (c.premade) for (const x of c.wires) {
    premadeNets.add(x.net);
    const [ai, ap] = x.from.split("."), [bi, bp] = x.to.split(".");
    bundles.push({ net: x.net, cable: c.premade, label: c.label, ends: [[ai, ap], [bi, bp]] });
  }
  // ---- terminals of ordinary wires
  const terms = new Set<string>();
  for (const c of w.cables) if (!c.premade) for (const x of c.wires) for (const t of [x.from, x.to]) if (!isSplice(t.split(".")[0])) terms.add(t);
  for (const n of w.nets) if (!premadeNets.has(n.name)) for (const t of n.pins) if (!isSplice(t.split(".")[0])) terms.add(t);
  // ---- nodes: union-find over wires, splices, ties inside a part
  const parent = new Map<string, string>();
  const find = (x: string): string => { let r = x; while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const key = (t: string) => (isSplice(t.split(".")[0]) ? `splice:${t.split(".")[0]}` : t);
  for (const t of terms) find(t);
  for (const c of w.cables) if (!c.premade) for (const x of c.wires) join(key(x.from), key(x.to));
  const recPin = (t: string): Pin | undefined => { const [i, p, n] = t.split("."); return electrical(inst.get(i)!.key)?.ports.find((q) => q.name === p)?.pins.v.find((x) => x.name === n); };
  const byName = new Map<string, string[]>();
  for (const t of terms) { const [i, , n] = t.split("."), s = recPin(t)?.signal ?? ""; if (NO_TIE.has(s) || n === "LINK") continue; const k = `${i}|${n}`; byName.set(k, [...(byName.get(k) ?? []), t]); }
  for (const list of byName.values()) for (let k = 1; k < list.length; k++) join(list[0], list[k]);
  const groups = new Map<string, string[]>();
  for (const t of terms) { const r = find(t); groups.set(r, [...(groups.get(r) ?? []), t]); }
  // ---- parts and pins
  const parts: CPart[] = [], pin = new Map<string, CPin>();
  const usedInst = new Set([...terms].map((t) => t.split(".")[0]));
  for (const b of bundles) for (const [i] of b.ends) usedInst.add(i);
  const order = w.instances.filter((i) => usedInst.has(i.name) && !isSplice(i.name) && electrical(i.key)!.role !== "carrier");
  for (const i of order) {
    const e = electrical(i.key)!, kind = symbolKind(i.key, e.role);
    const p: CPart = { inst: i.name, key: i.key, ref: "", role: e.role, kind, value: shortName(i.key), pins: [], unusedPorts: [] };
    for (const port of e.ports) {
      const used = port.pins.v.some((x) => terms.has(`${i.name}.${port.name}.${x.name}`));
      const leads = bundles.filter((b) => b.ends.some(([bi, bp]) => bi === i.name && bp === port.name));
      if (!used && !leads.length) { p.unusedPorts.push(port.name); continue; }
      if (leads.length) {
        leads.forEach((b, k) => {
          const id = `${i.name}.${port.name}#${k + 1}`, net = w.nets.find((n) => n.name === b.net)!;
          const members = port.pins.v.map((x) => `${i.name}.${port.name}.${x.name}`).filter((t) => net.pins.includes(t));
          const label = leads.length > 1 ? `${port.name.toUpperCase()} ${k + 1}` : port.name.toUpperCase();
          const cp: CPin = { id, inst: i.name, port: port.name, name: label, num: port.name.match(/j\d+/i)?.[0].toUpperCase() ?? "", signal: "cable", dir: "bidir", members: [...new Set(members)], bundle: true };
          p.pins.push(cp); pin.set(id, cp);
        });
        continue;
      }
      // every pin of a used header on a board (unused ones marked no-connect); only the used pins of a lead or a load
      const seen = new Map<string, CPin>();
      for (const x of port.pins.v) {
        const t = `${i.name}.${port.name}.${x.name}`, isUsed = terms.has(t);
        if (!isUsed && !SHOW_ALL.has(e.role)) continue;
        const prev = seen.get(x.name);
        if (prev) { if (!prev.num.split(",").includes(x.pin)) prev.num = `${prev.num},${x.pin}`; continue; }
        const cp: CPin = { id: t, inst: i.name, port: port.name, name: shortPin(x.name), num: x.pin, signal: x.signal, dir: x.dir, members: [t], ...(isUsed ? {} : { nc: true }) };
        seen.set(x.name, cp); p.pins.push(cp); if (isUsed) pin.set(t, cp);
      }
      for (const cp of seen.values()) { const nums = cp.num.split(","); if (nums.length > 3) cp.num = `${nums.slice(0, 2).join(",")},+${nums.length - 2}`; }
    }
    parts.push(p);
  }
  // reference designators: a fuse keeps its record id (F1 main, F2... branches); the rest by kind prefix in instance-name
  // order, so the same part has the same designator in the schematic, the breadboard view and every rebuild
  const count = new Map<string, number>(), fuseIds = new Set<string>();
  for (const p of parts) if (p.kind === "fuse") { const id = fuseIdOf(w, p.inst); if (id) { p.ref = id; fuseIds.add(id); } }
  const byInst = [...parts].sort((a, b) => a.inst.localeCompare(b.inst, "en", { numeric: true }));
  for (const p of byInst) {
    if (p.ref) continue;
    const pre = PREFIX[p.kind]; let k = (count.get(pre) ?? 0) + 1;
    while (pre === "F" && fuseIds.has(`F${k}`)) k++;
    count.set(pre, k); p.ref = `${pre}${k}`;
  }
  // ---- node records
  const nodes: CNode[] = [], nodeOf = new Map<string, CNode>();
  const netOf = new Map<string, string[]>();
  for (const n of w.nets) if (!premadeNets.has(n.name)) for (const t of n.pins) netOf.set(t, [...(netOf.get(t) ?? []), n.name]);
  const netRec = new Map(w.nets.map((n) => [n.name, n]));
  const rails = new Set(w.rails.map((r) => r.name));
  for (const ts of groups.values()) {
    const pins = ts.filter((t) => pin.has(t));
    if (!pins.length) continue;
    const nets = [...new Set(ts.flatMap((t) => netOf.get(t) ?? []))].sort();
    const kinds = nets.map((x) => netRec.get(x)!.kind);
    const kind: NetKind = kinds.includes("ground") ? "ground" : kinds.includes("power") ? "power" : kinds.includes("bus") ? "bus" : "signal";
    const rail = nets.find((x) => rails.has(x));
    const volt = rail ? w.rails.find((r) => r.name === rail)!.voltage_v : nets.map((x) => netRec.get(x)!.voltage_v).find((v) => v !== undefined);
    nodes.push({ id: "", name: rail ?? "", nets, kind, ...(volt !== undefined && kind === "power" ? { voltage_v: volt } : {}), pins: pins.sort() });
  }
  for (const b of bundles) {
    // the k-th lead into a port takes the k-th socket
    const pick = (i: string, p: string) => { const ks = [...pin.values()].filter((x) => x.bundle && x.inst === i && x.port === p); return ks.find((x) => !nodes.some((n) => n.pins.includes(x.id)))!; };
    const a = pick(b.ends[0][0], b.ends[0][1]), c = pick(b.ends[1][0], b.ends[1][1]);
    nodes.push({ id: "", name: b.net, nets: [b.net], kind: "cable", pins: [a.id, c.id], cable: b.cable });
  }
  const pv0 = new Map(parts.map((p) => [p.inst, p]));
  // names: a rail keeps its own; a net split by a fuse or switch in series keeps its name on the side with most pins
  const taken = new Set<string>();
  const named = nodes.filter((x) => x.name).sort((a, b) => b.pins.length - a.pins.length);
  for (const x of named) { if (taken.has(x.name)) x.name = ""; else taken.add(x.name); }
  const voltName = (x: CNode) => { for (const t of x.pins) { const p = pin.get(t)!; if (p.dir === "power_out" && /^\d+V\d*$/i.test(p.name)) return `+${p.name.toUpperCase()}`; } return ""; };
  for (const x of [...nodes].sort((a, b) => b.pins.length - a.pins.length)) {
    if (x.name) continue;
    const cands = [x.kind === "ground" && x.nets.includes("GND") ? "GND" : "", x.kind === "power" ? voltName(x) : "", ...x.nets.filter((n) => !taken.has(n))].filter(Boolean);
    // the far side of a branch fuse: the rail through that fuse
    const fused = x.pins.map((t) => pv0.get(t.split(".")[0])).find((q) => q?.kind === "fuse" && /^F\d+$/.test(q.ref) && x.pins.some((t) => t.startsWith(`${q.inst}.`) && t.endsWith(".OUT")) && q.inst !== "main_fuse");
    let name = fused && x.kind === "power" ? `${x.nets[0] ?? "NET"}_${fused.ref}` : cands.find((c) => !taken.has(c)) ?? `${x.nets[0] ?? "NET"}`;
    for (let k = 2; taken.has(name); k++) name = `${x.nets[0] ?? "NET"}_${k}`;
    x.name = name; taken.add(name);
  }
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  nodes.forEach((x, i) => { x.id = `N${i + 1}`; for (const t of x.pins) nodeOf.set(t, x); });
  const pv = new Map(parts.map((p) => [p.inst, p]));
  const emptyNets = w.nets.filter((n) => !n.pins.length).map((n) => n.name);
  return { robot, parts, nodes, pin, nodeOf, part: pv, emptyNets, splices };
}
