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
  joints: { joint: string; actuator: string; required_nm: number; rated_nm: number; peak_nm: number; margin: number }[];
  checks: { name: string; pass: boolean; detail: string }[];
  performance: Record<string, number | string>;
  assumptions: string[];
  fasteners: Record<string, number>;
}
export const designRecord = (spec: RobotSpecification) => (spec.metadata as { design?: Record_ }).design;

const FILAMENT_USD_PER_KG = 22;   // PETG spool, street price
const PRINT_CM3_PER_HOUR = 12;    // 0.4 mm nozzle, 0.2 mm layers, 4 perimeters
const FASTENER_USD = 0.12;        // stainless socket screw / insert, bulk

export function buildDesignedBom(spec: RobotSpecification, budget?: number, payloadKg?: number): BillOfMaterials {
  const d = designRecord(spec)!;
  const lines: BomLine[] = [];
  const category: Record<string, string> = { actuator: "Actuator", sensor: "Sensor", compute: "Compute", battery: "Power", misc: "Power", motor_driver: "Electronics", wheel: "Drive", bearing: "Mechanical", horn: "Mechanical", fastener: "Fasteners", insert: "Fasteners" };
  for (const p of d.purchased) {
    const c = part(p.key);
    lines.push({ category: category[c.category] ?? "Other", name: c.name, qty: p.qty, unit_cost: c.price_usd, subtotal: +(c.price_usd * p.qty).toFixed(2),
      spec: specLine(p.key), note: `${p.uses.slice(0, 4).join("; ")}${p.uses.length > 4 ? "; …" : ""} · ${c.supplier_url}` });
  }
  const grams = d.printed.reduce((s, p) => s + p.mass_kg * 1000, 0), cm3 = d.printed.reduce((s, p) => s + p.check.volume_cm3, 0);
  lines.push({ category: "Printed structure", name: `PETG filament for ${d.printed.length} printed parts`, qty: 1, unit_cost: +((grams / 1000) * FILAMENT_USD_PER_KG * 1.15).toFixed(2),
    subtotal: +((grams / 1000) * FILAMENT_USD_PER_KG * 1.15).toFixed(2), spec: `${grams.toFixed(0)} g of parts (+15 % supports/waste), about ${(cm3 / PRINT_CM3_PER_HOUR).toFixed(1)} h of printing`, note: d.printed.map((p) => p.name).join(", ") });
  const nFast = Object.values(d.fasteners).reduce((a, b) => a + b, 0);
  if (nFast) lines.push({ category: "Fasteners", name: "Screws, nuts and inserts", qty: nFast, unit_cost: FASTENER_USD, subtotal: +(nFast * FASTENER_USD).toFixed(2), spec: Object.entries(d.fasteners).map(([k, v]) => `${v}x ${k}`).join("; ") });
  const total = +lines.reduce((s, l) => s + l.subtotal, 0).toFixed(2);
  const torqueChecks = d.checks.filter((c) => c.name.startsWith("torque:"));
  const sizingPass = torqueChecks.every((c) => c.pass);
  const failing = d.checks.filter((c) => !c.pass);
  const tier: Tier = d.joints.some((j) => j.actuator.startsWith("cubemars")) ? "research" : d.joints.some((j) => j.actuator.startsWith("dxl")) ? "prosumer" : "hobby";
  return {
    robot_name: spec.robot_name, ...(budget !== undefined ? { budget } : {}), tier, lines, total, feasible: budget === undefined || total <= budget, sizing_pass: sizingPass, hardware_verified: false,
    actuator_sizing: d.joints.map((j) => ({ joint: j.joint, required_effort: j.required_nm, effort_unit: "N·m" as const, required_torque_nm: j.required_nm, chosen: part(j.actuator).name, margin: `${j.margin}x` })),
    warnings: [...failing.map((c) => `${c.name}: ${c.detail}`), ...(budget !== undefined && total > budget ? [`total $${total} exceeds the $${budget} budget`] : [])],
    notes: [d.summary, ...(payloadKg ?? d.performance.payload_kg ? [`Sized for a ${payloadKg ?? d.performance.payload_kg} kg payload.`] : []), ...d.assumptions,
      "Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering."],
  };
}

function specLine(key: string): string {
  const s = part(key).specs;
  if (s.rated_torque_nm) return `${s.rated_torque_nm} N·m rated / ${s.peak_torque_nm ?? s.stall_torque_nm} N·m peak, ${s.voltage_v} V`;
  if (s.energy_wh) return `${s.voltage_v} V, ${s.energy_wh} Wh`;
  if (s.voltage_v) return `${s.voltage_v} V`;
  return part(key).datasheet_url;
}
