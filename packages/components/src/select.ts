import type { RobotSpecification, Joint } from "@ttr/robot-schema";
import { GRAVITY } from "@ttr/robot-schema";
import { linkPositions } from "@ttr/kinematics";
import { ACTUATORS, SENSORS, COMPUTE, POWER, STRUCTURE, type Tier, type Actuator } from "./catalog.ts";

export interface BomLine { category: string; name: string; qty: number; unit_cost: number; subtotal: number; spec: string; note?: string; }
export interface BillOfMaterials {
  robot_name: string; budget?: number; tier: Tier;
  lines: BomLine[]; total: number; feasible: boolean; sizing_pass: boolean; hardware_verified: false;
  actuator_sizing: { joint: string; required_effort: number; effort_unit: "N" | "N·m"; required_torque_nm?: number; required_force_n?: number; chosen: string; margin: string }[];
  warnings: string[]; notes: string[];
}

function tierForBudget(budget?: number): Tier {
  if (budget === undefined) return "prosumer";
  if (budget < 300) return "hobby";
  if (budget < 3000) return "prosumer";
  return "research";
}

function subtree(spec: RobotSpecification, root: string): Set<string> {
  const kids = new Map<string, string[]>();
  for (const j of spec.joints) { if (!kids.has(j.parent)) kids.set(j.parent, []); kids.get(j.parent)!.push(j.child); }
  const out = new Set<string>(); const st = [root];
  while (st.length) { const n = st.pop()!; if (out.has(n)) continue; out.add(n); for (const c of kids.get(n) ?? []) st.push(c); }
  return out;
}

/** Neutral-pose gravity proxy, not a full-workspace or dynamic load bound. */
function requiredTorque(spec: RobotSpecification, j: Joint, pos: Record<string, number[]>): number {
  const down = subtree(spec, j.child);
  const jp = pos[j.child] ?? [0, 0, 0];
  let torque = 0, mass = 0;
  for (const l of spec.links) {
    if (!down.has(l.name)) continue;
    const p = pos[l.name] ?? jp;
    const horiz = Math.hypot(p[0] - jp[0], p[1] - jp[1]) + (l.geometry.type === "cylinder" ? l.geometry.length / 2 : 0.02);
    torque += l.mass * GRAVITY * horiz;
    mass += l.mass;
  }
  if (j.type === "prismatic") return mass * GRAVITY; // vertical force (N)
  return torque;
}

const capacity = (a:Actuator) => a.kind === "linear" ? (a.force_n ?? 0) : (a.torque ?? 0);

function pickActuator(reqTorque: number, tier: Tier, type:Joint["type"]): Actuator | undefined {
  const safety = 1.5;
  const pool = ACTUATORS.filter((a) => !a.requires_custom_design && a.tiers.includes(tier) && (type === "prismatic" ? a.kind === "linear" : type === "continuous" ? ["stepper","bldc"].includes(a.kind) : a.kind !== "linear"));
  const fit = pool.filter((a) => capacity(a) >= reqTorque * safety).sort((a, b) => a.unit_cost - b.unit_cost);
  if (fit.length) return fit[0];
  return pool.sort((a, b) => capacity(b) - capacity(a))[0]; // strongest available if none meets margin
}

function pushMerged(map: Map<string, BomLine>, line: BomLine) {
  const key = line.category + "|" + line.name;
  const ex = map.get(key);
  if (ex) { ex.qty += line.qty; ex.subtotal = +(ex.qty * ex.unit_cost).toFixed(2); if(line.note && !ex.note?.includes(line.note))ex.note=[ex.note,line.note].filter(Boolean).join("; "); }
  else map.set(key, { ...line, subtotal: +(line.qty * line.unit_cost).toFixed(2) });
}

function buildBomAtTier(spec: RobotSpecification, tier: Tier, budget?: number): BillOfMaterials {
  const warnings: string[] = ["Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.", "Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified."]; const notes: string[] = [];
  const lines = new Map<string, BomLine>();
  const sizing: BillOfMaterials["actuator_sizing"] = [];
  const pos = linkPositions(spec, {});
  const actuated = spec.joints.filter((j) => j.type !== "fixed" && !j.passive);

  let motorPowerW = 0;
  for (const j of actuated) {
    // physics estimate from the robot's own downstream mass, floored by the designer-declared effort
    // (a wearable exoskeleton, for example, must move the wearer's limbs, not just its own struts)
    const designed = j.limit?.effort && !(j.inferred ?? []).includes("limit") ? j.limit.effort * 0.8 : 0;
    const req = Math.max(requiredTorque(spec, j, pos), designed);
    const a = pickActuator(req, tier, j.type);
    if (!a) { warnings.push(`no actuator found for joint ${j.name}`); continue; }
    const unit=j.type === "prismatic" ? "N" : "N·m";
    const rated=capacity(a),met = rated >= req * 1.5;
    if (!met) warnings.push(`joint ${j.name} needs ~${req.toFixed(2)} ${unit}; strongest in ${tier} tier is ${a.name} (${rated} ${unit}) — increase budget for a stronger actuator`);
    sizing.push({ joint: j.name, required_effort:+req.toFixed(3),effort_unit:unit, ...(j.type === "prismatic" ? {required_force_n:+req.toFixed(3)} : {required_torque_nm:+req.toFixed(3)}), chosen: a.name, margin: met ? `${(rated / (req || 1e-3)).toFixed(1)}x` : "UNDERSIZED" });
    pushMerged(lines, { category: "Actuator", name: a.name, qty: 1, unit_cost: a.unit_cost, subtotal: a.unit_cost, spec: `${a.spec} (${rated} ${unit})`, note: `joint ${j.name}${a.source_url ? "; rating source: "+a.source_url : "; rating duty/source unverified"}` });
    if (a.needs_driver) pushMerged(lines, { category: "Motor driver", name: a.needs_driver, qty: 1, unit_cost: a.driver_cost ?? 0, subtotal: a.driver_cost ?? 0, spec: `driver for ${a.name}` });
    motorPowerW += a.kind === "bldc" ? 60 : a.kind === "stepper" || a.kind === "linear" ? 12 : a.kind === "smart_servo" ? 12 : 5;
  }

  // sensors
  const hasHeavySensor = spec.sensors.some((s) => s.type === "camera" || s.type === "lidar" || s.type === "depth");
  for (const s of spec.sensors) {
    const pool = (SENSORS[s.type] ?? []).filter((p) => p.tiers.includes(tier));
    const part = pool[0] ?? (SENSORS[s.type] ?? [])[0];
    if (part) pushMerged(lines, { category: "Sensor", name: part.name, qty: 1, unit_cost: part.unit_cost, subtotal: part.unit_cost, spec: part.spec, note: s.name });
  }

  // compute
  const needSbc = hasHeavySensor || actuated.length >= 6;
  const computePool = COMPUTE.filter((c) => c.tiers.includes(tier) && (needSbc ? c.ros2 : true));
  const compute = (needSbc ? computePool.filter((c) => c.ros2) : computePool).sort((a, b) => a.level - b.level)[0] ?? COMPUTE[2];
  pushMerged(lines, { category: "Compute", name: compute.name, qty: 1, unit_cost: compute.unit_cost, subtotal: compute.unit_cost, spec: compute.spec });
  const computeW = compute.level >= 4 ? 30 : compute.level >= 3 ? 8 : 2;

  // power
  const totalW = motorPowerW * 0.4 + computeW; // duty-cycled motors
  const battery = POWER.batteries.filter((b) => b.tiers.includes(tier)).sort((a, b) => a.cost - b.cost).find((b) => b.wh >= totalW * 0.5)
    ?? POWER.batteries.filter((b) => b.tiers.includes(tier)).slice(-1)[0] ?? POWER.batteries[1];
  pushMerged(lines, { category: "Power", name: battery.name, qty: 1, unit_cost: battery.cost, subtotal: battery.cost, spec: `${battery.wh} Wh; est. load ${totalW.toFixed(0)} W` });
  pushMerged(lines, { category: "Power", name: POWER.regulator.name, qty: 1, unit_cost: POWER.regulator.cost, subtotal: POWER.regulator.cost, spec: POWER.regulator.spec });
  pushMerged(lines, { category: "Power", name: POWER.distribution.name, qty: 1, unit_cost: POWER.distribution.cost, subtotal: POWER.distribution.cost, spec: POWER.distribution.spec });

  // structure
  const mass = spec.links.reduce((s, l) => s + l.mass, 0);
  const perKg = tier === "research" ? STRUCTURE.alu_cost_per_kg : STRUCTURE.print_cost_per_kg;
  const structCost = Math.max(8, +(mass * 1.4 * perKg).toFixed(2)); // 1.4x for supports/waste
  pushMerged(lines, { category: "Structure", name: tier === "research" ? "Aluminium frame + brackets" : "3D-printed frame (PLA/PETG)", qty: 1, unit_cost: structCost, subtotal: structCost, spec: `~${(mass * 1.4).toFixed(2)} kg material @ $${perKg}/kg` });
  pushMerged(lines, { category: "Structure", name: STRUCTURE.fasteners.name, qty: 1, unit_cost: STRUCTURE.fasteners.cost, subtotal: STRUCTURE.fasteners.cost, spec: STRUCTURE.fasteners.spec });

  // wiring / misc (12% of electronics)
  const arr = [...lines.values()];
  const electronics = arr.filter((l) => ["Actuator", "Motor driver", "Sensor", "Compute", "Power"].includes(l.category)).reduce((s, l) => s + l.subtotal, 0);
  const misc = +(electronics * 0.12).toFixed(2);
  pushMerged(lines, { category: "Wiring & misc", name: "Wiring, connectors, JST/Dupont, sleeving", qty: 1, unit_cost: misc, subtotal: misc, spec: "~12% of electronics" });

  const finalLines = [...lines.values()];
  const total = +finalLines.reduce((s, l) => s + l.subtotal, 0).toFixed(2);
  const feasible = budget === undefined ? true : total <= budget;
  if (budget !== undefined && !feasible) notes.push(`Estimated build cost $${total} exceeds the $${budget} budget by $${(total - budget).toFixed(2)}. Consider fewer DOF, lighter links, or the demo/hobby tier.`);
  notes.push(`Tier: ${tier}. Prices are planning estimates (USD), not quotes. Structure assumes ${tier === "research" ? "machined aluminium" : "FDM 3D printing"}.`);

  return { robot_name: spec.robot_name, budget, tier, lines: finalLines, total, feasible, sizing_pass: sizing.length===actuated.length && sizing.every(s=>s.margin!=="UNDERSIZED"), hardware_verified:false, actuator_sizing: sizing, warnings, notes };
}

export function buildBom(spec: RobotSpecification, budget?: number): BillOfMaterials {
  const tiers: Tier[] = ["hobby", "prosumer", "research"];
  if (budget === undefined) return buildBomAtTier(spec, tierForBudget(undefined), undefined);
  // try to FIT the budget: cheapest tier whose total is within budget; else cheapest overall
  const built = tiers.map((t) => buildBomAtTier(spec, t, budget));
  const feasible = built.filter((b) => b.total <= budget!).sort((a, b) => b.total - a.total); // richest that still fits
  if (feasible.length) return feasible.find(b=>b.sizing_pass) ?? feasible[0];
  const cheapest = built.sort((a, b) => a.total - b.total)[0];
  cheapest.notes.unshift(`No component tier fits the $${budget} budget; showing the cheapest estimate ($${cheapest.total}).`);
  return cheapest;
}

export function bomToMarkdown(bom: BillOfMaterials): string {
  const out: string[] = [];
  out.push(`# Bill of Materials — ${bom.robot_name}`);
  out.push(``, `**Estimated total: $${bom.total}**  ·  tier: ${bom.tier}` + (bom.budget ? `  ·  budget: $${bom.budget} ` + (bom.feasible ? "✅ within budget" : "❌ over budget") : ""), ``);
  out.push(`**Effort sizing: ${bom.sizing_pass ? "passes catalogue estimate" : "fails"}; hardware verified: no.**`, ``);
  out.push(`| Category | Component | Qty | Unit $ | Subtotal $ | Spec |`, `|---|---|--:|--:|--:|---|`);
  for (const l of bom.lines) out.push(`| ${l.category} | ${l.name}${l.note ? ` _(${l.note})_` : ""} | ${l.qty} | ${l.unit_cost} | ${l.subtotal} | ${l.spec} |`);
  out.push(``, `## Actuator sizing`, ``, `| Joint | Required effort | Unit | Chosen actuator | Margin |`, `|---|--:|---|---|--:|`);
  for (const s of bom.actuator_sizing) out.push(`| ${s.joint} | ${s.required_effort} | ${s.effort_unit} | ${s.chosen} | ${s.margin} |`);
  if (bom.warnings.length) { out.push(``, `## Warnings`); for (const w of bom.warnings) out.push(`- ⚠️ ${w}`); }
  out.push(``, `## Notes`); for (const n of bom.notes) out.push(`- ${n}`);
  return out.join("\n") + "\n";
}
