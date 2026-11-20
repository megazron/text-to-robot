// Bill of materials for robots built by the design engine: every line is the real part the
// design uses (catalog key, supplier, datasheet), plus filament and fasteners for the printed
// structure. Nothing is chosen here; the design already sized everything.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part } from "@ttr/parts";
import type { BillOfMaterials, BomLine } from "./select.ts";
import type { Tier } from "./catalog.ts";

interface Record_ {
  family: string; summary: string;
  purchased: { key: string; qty: number; uses: string[] }[];
  printed: { name: string; mass_kg: number; check: { volume_cm3: number; bbox_mm: number[]; fits_bed: boolean } }[];
  joints: { joint: string; actuator: string; required_nm: number; rated_nm: number; peak_nm: number; margin: number; unit?: "N" | "N·m" }[];
  checks: { name: string; pass: boolean; detail: string }[];
  performance: Record<string, number | string>;
  assumptions: string[];
  fasteners: Record<string, number>;
  wiring?: { bom: { item: string; qty: number; unit: string; unit_usd: number; subtotal_usd: number; spec: string; source: string }[]; total_wire_m: number };
}
export const designRecord = (spec: RobotSpecification) => (spec.metadata as { design?: Record_ }).design;

const FILAMENT_USD_PER_KG = 22;   // PETG spool, street price
const PRINT_CM3_PER_HOUR = 12;    // 0.4 mm nozzle, 0.2 mm layers, 4 perimeters
const FASTENER_USD = 0.12;        // stainless socket screw / insert, bulk

export function buildDesignedBom(spec: RobotSpecification, budget?: number, payloadKg?: number): BillOfMaterials {
  const d = designRecord(spec)!;
  const lines: BomLine[] = [];
  const category: Record<string, string> = { actuator: "Actuator", sensor: "Sensor", compute: "Compute", battery: "Power", misc: "Power", motor_driver: "Electronics", wheel: "Drive", bearing: "Mechanical", horn: "Mechanical", fastener: "Fasteners", insert: "Fasteners" };
  // built from the user's parts (metadata.inventory): every line says how many they have and how many to buy
  const owned = (spec.metadata as { inventory?: { owned?: Record<string, number> } }).inventory?.owned;
  for (const p of d.purchased) {
    const c = part(p.key), have = owned ? Math.min(p.qty, owned[p.key] ?? 0) : undefined;
    lines.push({ category: category[c.category] ?? "Other", name: c.name, qty: p.qty, unit_cost: c.price_usd, subtotal: +(c.price_usd * p.qty).toFixed(2),
      spec: specLine(p.key), note: `${p.uses.slice(0, 4).join("; ")}${p.uses.length > 4 ? "; …" : ""} · ${c.supplier_url}`, ...(owned ? { key: p.key, have, buy: p.qty - have! } : {}) });
  }
  const grams = d.printed.reduce((s, p) => s + p.mass_kg * 1000, 0), cm3 = d.printed.reduce((s, p) => s + p.check.volume_cm3, 0);
  // a painted robot's filament is bought in its colour (the dark trim and the accents as before)
  const colour = (spec.metadata as { colour?: string }).colour;
  const look = (spec.metadata as { look?: { colours: { body: string; accent: string; trim: string } } }).look;
  if (look) {
    // a designed look is bought as filament in its colours: the body, the dark trim, the accents and a clear spool for the lenses
    const tone = (m?: string) => (m === "trim_light" ? "lens" : m === "printed_accent" || m === "badge" ? "accent" : m === "printed_dark" || m === "shell_trim" ? "trim" : "body");
    const label: Record<string, string> = { body: `${look.colours.body} for the body`, trim: `${look.colours.trim} for the trim`, accent: `${look.colours.accent} for the accents`, lens: "clear, for the light lenses" };
    for (const t of ["body", "trim", "accent", "lens"]) {
      const ps = d.printed.filter((p) => tone(spec.links.find((l) => l.name === ((p as { link?: string }).link ?? p.name))?.material) === t);
      if (!ps.length) continue;
      const g = ps.reduce((s, p) => s + p.mass_kg * 1000, 0), v = ps.reduce((s, p) => s + p.check.volume_cm3, 0), usd = +((g / 1000) * FILAMENT_USD_PER_KG * 1.15).toFixed(2);
      lines.push({ category: "Printed structure", name: `PETG filament (${label[t]}) for ${ps.length} printed part${ps.length > 1 ? "s" : ""}`, qty: 1, unit_cost: usd, subtotal: usd,
        spec: `${g.toFixed(0)} g of parts (+15 % supports/waste), about ${(v / PRINT_CM3_PER_HOUR).toFixed(1)} h of printing`, note: ps.map((p) => p.name).join(", ") });
    }
  } else lines.push({ category: "Printed structure", name: `PETG filament${colour ? ` (${colour} for the body)` : ""} for ${d.printed.length} printed parts`, qty: 1, unit_cost: +((grams / 1000) * FILAMENT_USD_PER_KG * 1.15).toFixed(2),
    subtotal: +((grams / 1000) * FILAMENT_USD_PER_KG * 1.15).toFixed(2), spec: `${grams.toFixed(0)} g of parts (+15 % supports/waste), about ${(cm3 / PRINT_CM3_PER_HOUR).toFixed(1)} h of printing`, note: d.printed.map((p) => p.name).join(", ") });
  const nFast = Object.values(d.fasteners).reduce((a, b) => a + b, 0);
  if (nFast) lines.push({ category: "Fasteners", name: "Screws, nuts and inserts", qty: nFast, unit_cost: FASTENER_USD, subtotal: +(nFast * FASTENER_USD).toFixed(2), spec: Object.entries(d.fasteners).map(([k, v]) => `${v}x ${k}`).join("; ") });
  // wiring: every line comes from the routed harness (wire by gauge and length, contacts, shrink, ties, grommets)
  for (const w of d.wiring?.bom ?? []) lines.push({ category: "Wiring", name: w.item, qty: w.qty, unit_cost: w.unit_usd, subtotal: w.subtotal_usd, spec: `${w.qty} ${w.unit}: ${w.spec}`, note: `price ${w.source}` });
  const total = +lines.reduce((s, l) => s + l.subtotal, 0).toFixed(2);
  if (owned) for (const l of lines) if (l.have === undefined) { l.have = 0; l.buy = l.qty; }
  const toBuy = owned ? +lines.reduce((s, l) => s + (l.buy ?? 0) * l.unit_cost, 0).toFixed(2) : undefined;
  const torqueChecks = d.checks.filter((c) => c.name.startsWith("torque:"));
  const sizingPass = torqueChecks.every((c) => c.pass);
  const failing = d.checks.filter((c) => !c.pass);
  const tier: Tier = d.joints.some((j) => j.actuator.startsWith("cubemars")) ? "research" : d.joints.some((j) => j.actuator.startsWith("dxl")) ? "prosumer" : "hobby";
  return {
    robot_name: spec.robot_name, ...(budget !== undefined ? { budget } : {}), tier, lines, total, feasible: budget === undefined || (toBuy ?? total) <= budget,
    ...(toBuy !== undefined ? { to_buy_total: toBuy, owned_total: +(total - toBuy).toFixed(2) } : {}), sizing_pass: sizingPass, hardware_verified: false,
    actuator_sizing: d.joints.map((j) => ({ joint: j.joint, required_effort: j.required_nm, effort_unit: (j.unit ?? "N·m") as "N" | "N·m",
      ...(j.unit === "N" ? { required_force_n: j.required_nm } : { required_torque_nm: j.required_nm }), chosen: part(j.actuator).name, margin: `${j.margin}x` })),
    warnings: [...failing.map((c) => `${c.name}: ${c.detail}`), ...(budget !== undefined && total > budget ? [`total $${total} exceeds the $${budget} budget`] : [])],
    notes: [d.summary, ...(payloadKg ?? d.performance.payload_kg ? [`Sized for a ${payloadKg ?? d.performance.payload_kg} kg payload.`] : []), ...d.assumptions,
      "Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering."],
  };
}

function specLine(key: string): string {
  const s = part(key).specs;
  // a coupler or a brake has a torque rating but no peak or voltage: only the figures the part has
  if (s.rated_torque_nm) {
    const peak = s.peak_torque_nm ?? s.stall_torque_nm;
    return `${s.rated_torque_nm} N·m rated${peak !== undefined ? ` / ${peak} N·m peak` : ""}${s.voltage_v !== undefined ? `, ${s.voltage_v} V` : ""}`;
  }
  if (s.energy_wh) return `${s.voltage_v} V, ${s.energy_wh} Wh`;
  if (s.voltage_v) return `${s.voltage_v} V`;
  return part(key).datasheet_url;
}
