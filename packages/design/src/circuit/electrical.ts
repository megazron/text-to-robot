// Numbers a builder needs beyond the power budget, each computed from the wiring record and the parts' catalog and
// electrical records, with the source of every input: battery runtime at typical and peak draw, heat in each regulator,
// and whether every logic signal is read correctly by the pin it drives (3.3 V into 5 V inputs, 5 V into 3.3 V pins).
import { electrical, part } from "@ttr/parts";
import type { WiringRecord } from "../wiring.ts";
import { buildModel, type CircuitModel } from "./model.ts";

/** share of a pack's energy used before its cut-off (LiPo and Li-ion to about 3.5 V a cell under load) */
export const USABLE = 0.8;
export interface RuntimeRow { battery: string; key: string; energy_wh: number; capacity_mah: number; rail: string; volts: number; typical_a: number; peak_a: number; typical_min: number; peak_min: number; c_rate_peak: number; max_a: number | null; source: string; }
export interface SupplyRow { supply: string; key: string; rail: string; volts: number; rating_a: number; typical_a: number; peak_a: number; load_pct: number; }
export interface RegulatorRow { regulator: string; key: string; kind: "switching" | "linear"; from: string; to: string; vin: number; vout: number; iout_typ: number; iout_peak: number; pin_w: number; pout_w: number; loss_typ_w: number; loss_peak_w: number; efficiency: number | null; rated_heat_w: number | null; ok: boolean; note: string; }
export type LogicVerdict = "ok" | "marginal" | "too_low" | "over_voltage" | "unknown";
export interface LogicRow { net: string; from: string; to: string; voh: number | null; vih: number | null; max_in: number | null; verdict: LogicVerdict; advice: string; sources: string[]; }
export interface ElectricalReport { runtime: RuntimeRow[]; supplies: SupplyRow[]; regulators: RegulatorRow[]; logic: LogicRow[]; unchecked: string[]; sources: { what: string; src: string; url?: string; note?: string }[]; }

const r2 = (x: number) => +x.toFixed(2), r3 = (x: number) => +x.toFixed(3);

export function electricalReport(w: WiringRecord, model?: CircuitModel): ElectricalReport {
  const m = model ?? buildModel(w, "");
  const keyOf = new Map(w.instances.map((i) => [i.name, i.key]));
  const role = (i: string) => electrical(keyOf.get(i) ?? "")?.role ?? "";
  const sources: ElectricalReport["sources"] = [];
  const cite = (what: string, s?: { src: string; url?: string; note?: string }) => { if (s && !sources.some((x) => x.what === what)) sources.push({ what, src: s.src, ...(s.url ? { url: s.url } : {}), ...(s.note ? { note: s.note } : {}) }); };
  // ---- the main rail: the rail no regulator feeds
  const fedBy = (r: string) => w.rails.find((up) => up.loads.some((l) => l.inst === w.rails.find((x) => x.name === r)!.source) && up.name !== r);
  const main = w.rails.find((r) => !fedBy(r.name)) ?? w.rails[0];
  // ---- runtime
  const runtime: RuntimeRow[] = [], supplies: SupplyRow[] = [];
  const packs = w.instances.filter((i) => role(i.name) === "battery");
  if (packs.length && main) {
    const wh = packs.reduce((a, i) => a + Number(part(i.key).specs.energy_wh ?? 0), 0);
    for (const i of packs) {
      const c = part(i.key), share = Number(c.specs.energy_wh) / wh;
      const typ = main.typical_a, peak = main.peak_a, e = Number(c.specs.energy_wh) * USABLE;
      const watts = (a: number) => a * main.voltage_v * share;
      const maxA = c.specs.max_current_a !== undefined ? Number(c.specs.max_current_a) : null;
      runtime.push({ battery: i.name, key: i.key, energy_wh: Number(c.specs.energy_wh), capacity_mah: Number(c.specs.capacity_mah), rail: main.name, volts: main.voltage_v, typical_a: typ, peak_a: peak,
        typical_min: typ > 0 ? r2((e / watts(typ)) * 60) : Infinity, peak_min: peak > 0 ? r2((e / watts(peak)) * 60) : Infinity,
        c_rate_peak: r2((peak * share * (main.voltage_v / Number(c.specs.voltage_v ?? main.voltage_v))) / (Number(c.specs.capacity_mah) / 1000)), max_a: maxA, source: c.datasheet_url || c.supplier_url });
      cite(`${c.name} capacity and energy`, { src: c.datasheet_url ? "datasheet" : "catalog", url: c.datasheet_url || c.supplier_url });
    }
  }
  for (const i of w.instances.filter((x) => role(x.name) === "psu")) {
    const rail = main;
    const e = electrical(i.key)!, rating = e.output?.v.current_a ?? e.current_a.v.typical;
    supplies.push({ supply: i.name, key: i.key, rail: rail.name, volts: rail.voltage_v, rating_a: rating, typical_a: rail.typical_a, peak_a: rail.peak_a, load_pct: r2((rail.typical_a / rating) * 100) });
    cite(`${part(i.key).name} output`, e.output ?? e.current_a);
  }
  // ---- regulators: what goes in minus what comes out
  const regulators: RegulatorRow[] = [];
  for (const r of w.rails) {
    const up = fedBy(r.name); if (!up) continue;
    const src = r.source, key = keyOf.get(src)!, e = electrical(key)!, linear = e.role !== "regulator";
    const load = up.loads.find((l) => l.inst === src)!;
    let pin: number, loss: number, lossPeak: number;
    if (linear) { pin = up.voltage_v * r.typical_a; loss = (up.voltage_v - r.voltage_v) * r.typical_a; lossPeak = (up.voltage_v - r.voltage_v) * r.peak_a; }
    else { pin = up.voltage_v * load.typical_a; loss = pin - r.voltage_v * r.typical_a; lossPeak = up.voltage_v * load.peak_a - r.voltage_v * r.peak_a; }
    const rated = e.heat_w?.v ?? null;
    const ok = linear ? lossPeak <= 1 : rated === null || loss <= rated * 1.0001;
    regulators.push({ regulator: src, key, kind: linear ? "linear" : "switching", from: up.name, to: r.name, vin: up.voltage_v, vout: r.voltage_v, iout_typ: r.typical_a, iout_peak: r.peak_a, pin_w: r3(pin), pout_w: r3(r.voltage_v * r.typical_a), loss_typ_w: r3(loss), loss_peak_w: r3(lossPeak),
      efficiency: pin > 0 ? r3((r.voltage_v * r.typical_a) / pin) : null, rated_heat_w: rated, ok,
      note: linear ? `on-board linear regulator: (Vin - Vout) x Iout${lossPeak > 1 ? "; over 1 W at peak, move these loads to a buck converter" : ""}` : `input from the ${up.name} budget at the converter efficiency the budget assumes${rated !== null ? `; the part is rated for about ${rated} W of heat` : ""}` });
    if (e.heat_w) cite(`${part(key).name} heat`, e.heat_w);
  }
  // ---- logic levels, per signal conductor
  const logic: LogicRow[] = [], unchecked = new Set<string>();
  const nodeVolt = (inst: string, pinName: string) => { for (const p of m.pin.values()) if (p.inst === inst && (p.name === pinName || p.id.endsWith(`.${pinName}`))) { const n = m.nodeOf.get(p.id); if (n?.voltage_v !== undefined) return n.voltage_v; } return null; };
  const levels = (inst: string) => {
    const key = keyOf.get(inst)!, L = electrical(key)?.logic; if (!L) return null;
    const io = L.v.supply_pin ? nodeVolt(inst, L.v.supply_pin) : L.v.io_v ?? null;
    if (io === null) return null;
    const vih = L.v.vih_frac !== undefined ? L.v.vih_frac * io : L.v.vih_v ?? null;
    cite(`${part(key).name} logic levels`, L);
    return { io, vih, max: L.v.supply_pin && L.v.vih_frac !== undefined ? Math.max(L.v.max_in_v, io + 0.3) : L.v.max_in_v, src: L.url ?? L.src };
  };
  const SKIP = new Set(["motor_phase", "can_h", "can_l", "rs485_a", "rs485_b", "usb", "csi", "cable", "power", "ground", "mains"]);
  for (const n of m.nodes) {
    if (n.kind === "power" || n.kind === "ground" || n.kind === "cable") continue;
    const pins = n.pins.map((t) => m.pin.get(t)!).filter((p) => !SKIP.has(p.signal));
    if (pins.length < 2) continue;
    const drivers = pins.filter((p) => p.dir === "out" || p.dir === "bidir"), receivers = pins.filter((p) => p.dir === "in" || p.dir === "bidir");
    for (const d of drivers) for (const r of receivers) {
      if (d.inst === r.inst) continue;
      // a bus of identical servos passes its own levels along: only adapter to servo and controller to device is checked
      if (keyOf.get(d.inst) === keyOf.get(r.inst)) continue;
      const a = levels(d.inst), b = levels(r.inst);
      const from = `${m.part.get(d.inst)!.ref} ${d.name}`, to = `${m.part.get(r.inst)!.ref} ${r.name}`;
      if (!a || !b) { for (const [x, v] of [[d.inst, a], [r.inst, b]] as const) if (!v) unchecked.add(part(keyOf.get(x)!).name); logic.push({ net: n.name, from, to, voh: a?.io ?? null, vih: b?.vih ?? null, max_in: b?.max ?? null, verdict: "unknown", advice: "no published logic levels for one side", sources: [] }); continue; }
      const voh = a.io, vih = b.vih ?? 0, max = b.max;
      const verdict: LogicVerdict = voh > max + 0.05 ? "over_voltage" : voh < vih ? "too_low" : voh < vih + 0.4 ? "marginal" : "ok";
      const advice = verdict === "over_voltage" ? `${r2(voh)} V into a ${r2(max)} V input: add a level shifter (or a 2:1 divider on a one-way line)` : verdict === "too_low" ? `${r2(voh)} V high is under the ${r2(vih)} V threshold: add a level shifter` : verdict === "marginal" ? `under 0.4 V of margin over the ${r2(vih)} V threshold: short wires, or a level shifter` : "levels match";
      logic.push({ net: n.name, from, to, voh: r2(voh), vih: r2(vih), max_in: r2(max), verdict, advice, sources: [String(a.src), String(b.src)] });
    }
  }
  return { runtime, supplies, regulators, logic, unchecked: [...unchecked].sort(), sources };
}

const fmtMin = (x: number) => (!Number.isFinite(x) ? "-" : x >= 120 ? `${(x / 60).toFixed(1)} h` : `${x.toFixed(0)} min`);
/** WIRING.md section. */
export function electricalMarkdown(e: ElectricalReport): string {
  const o: string[] = ["## Electrical calculations", "", "Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.", ""];
  if (e.runtime.length) {
    o.push("### Battery runtime", "", `Usable energy is ${USABLE * 100} % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).`, "", "| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |", "|---|--:|--:|---|--:|--:|--:|--:|--:|--:|");
    for (const r of e.runtime) o.push(`| ${r.battery} (${part(r.key).name.split(" (")[0]}) | ${r.energy_wh} | ${r.capacity_mah} | ${r.rail} ${r.volts} V | ${r.typical_a} | ${fmtMin(r.typical_min)} | ${r.peak_a} | ${fmtMin(r.peak_min)} | ${r.c_rate_peak} C | ${r.max_a ?? "-"} |`);
    o.push("");
  }
  if (e.supplies.length) {
    o.push("### Mains supply", "", "| Supply | Rail | Rated A | Typical A | Peak A | Load at typical |", "|---|---|--:|--:|--:|--:|");
    for (const s of e.supplies) o.push(`| ${s.supply} (${part(s.key).name.split(" (")[0]}) | ${s.rail} ${s.volts} V | ${s.rating_a} | ${s.typical_a} | ${s.peak_a} | ${s.load_pct} % |`);
    o.push("");
  }
  if (e.regulators.length) {
    o.push("### Regulator heat", "", "Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.", "", "| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |", "|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|");
    for (const r of e.regulators) o.push(`| ${r.regulator} | ${r.kind} | ${r.from} ${r.vin} V | ${r.to} ${r.vout} V | ${r.iout_typ} / ${r.iout_peak} | ${r.pin_w} | ${r.pout_w} | ${r.loss_typ_w} / ${r.loss_peak_w} | ${r.efficiency === null ? "-" : `${(r.efficiency * 100).toFixed(0)} %`} | ${r.rated_heat_w ?? "-"} | ${r.ok ? "yes" : "**no**"} |`);
    for (const r of e.regulators) if (r.note) o.push(`- ${r.regulator}: ${r.note}.`);
    o.push("");
  }
  if (e.logic.length) {
    const bad = e.logic.filter((l) => l.verdict === "over_voltage" || l.verdict === "too_low"), marg = e.logic.filter((l) => l.verdict === "marginal");
    o.push("### Logic levels", "", bad.length ? `**${bad.length} signal${bad.length === 1 ? "" : "s"} need a level shifter.**` : marg.length ? `No signal is out of range; ${marg.length} have little margin.` : "Every checked signal is read correctly by the pin it drives.", "", "A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.", "", "| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |", "|---|---|---|--:|--:|--:|---|");
    const tag: Record<LogicVerdict, string> = { ok: "ok", marginal: "marginal", too_low: "**too low**", over_voltage: "**over voltage**", unknown: "not checked" };
    for (const l of e.logic) o.push(`| ${l.net} | ${l.from} | ${l.to} | ${l.voh ?? "-"} | ${l.vih ?? "-"} | ${l.max_in ?? "-"} | ${tag[l.verdict]}${l.verdict !== "ok" ? `: ${l.advice}` : ""} |`);
    if (e.unchecked.length) o.push("", `Not checked (no logic levels in the parts data): ${e.unchecked.join(", ")}.`);
    o.push("");
  }
  if (e.sources.length) {
    o.push("### Sources", "", "| Input | Source |", "|---|---|");
    for (const s of e.sources) o.push(`| ${s.what} | ${s.url ? `[${s.src}](${s.url})` : s.src}${s.note ? `: ${s.note}` : ""} |`);
    o.push("");
  }
  return o.join("\n");
}
