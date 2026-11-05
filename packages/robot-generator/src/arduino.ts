// Arduino mode: the same prompt, built only from cheap Arduino-ecosystem parts, offered as price tiers.
// Each option is a complete, checked design; options over the stated budget are marked, and when nothing
// can be built the result says what can.
import type { RobotSpecification } from "@ttr/robot-schema";
import { designArduinoCar, designArduinoArm, type ArduinoTier } from "@ttr/design";
import { part } from "@ttr/parts";
import { normalize, parseBudget, extractMasses } from "./text.ts";
import { chooseFamily, gripperRequest } from "./families.ts";
import { extractDof } from "./interpret.ts";

export interface ArduinoOption {
  tier: string; label: string; robot: RobotSpecification; cost_usd: number;
  /** names of engineering checks this option fails (empty = works) */
  failing: string[];
  /** over the budget stated in the prompt */
  over_budget: boolean;
  summary: string;
}
export interface ArduinoResult { family: string; label: string; options: ArduinoOption[]; notes: string[]; }

const CAR_FAMILIES = new Set(["diff_drive", "four_wheel", "mecanum"]);
const design = (s: RobotSpecification) => (s.metadata as { design?: { summary: string; checks: { name: string; pass: boolean }[]; performance: Record<string, unknown>; purchased: { key: string; qty: number }[] } }).design!;
/** parts cost of a design from its purchase list */
const costOf = (s: RobotSpecification) => design(s).purchased.reduce((sum, p) => sum + part(p.key).price_usd * p.qty, 0);

function option(tier: string, label: string, robot: RobotSpecification, budget?: number): ArduinoOption {
  const d = design(robot), cost = costOf(robot);
  return { tier, label, robot, cost_usd: +cost.toFixed(2), failing: d.checks.filter((c) => !c.pass && c.name !== "budget").map((c) => c.name),
    over_budget: budget !== undefined && cost > budget, summary: d.summary };
}

/** Arduino versions of the robot a prompt asks for, cheapest first. */
export function arduinoOptions(prompt: string): ArduinoResult {
  const t = normalize(prompt), budget = parseBudget(t).usd, notes: string[] = [];
  const payload = extractMasses(t).find((m) => m.context === "payload")?.kg;
  let family: string, label: string;
  try { const c = chooseFamily(t, prompt, extractDof(prompt), gripperRequest(t).kind, undefined, gripperRequest(t).explicit); family = c.family; label = c.label; }
  catch (e) { return { family: "unknown", label: "unknown", options: [], notes: [(e as Error).message] }; }
  const options: ArduinoOption[] = [];

  if (CAR_FAMILIES.has(family) || (family === "rover_arm" && !/\barm\b/.test(t))) {
    if (family === "mecanum") notes.push("mecanum wheels are not in the Arduino parts range: built as a TT-motor car");
    for (const tier of ["cheapest", "stronger"] as ArduinoTier[]) {
      const s = designArduinoCar({ name: "arduino_car", prompt, tier, budget, ...(payload ? { payloadKg: payload } : {}) });
      options.push(option(tier, design(s).performance.tier_label as string, s, budget));
    }
    if (family === "four_wheel") notes.push("you asked for four wheels: the 4WD option is the 'stronger' tier");
  } else if (family === "serial_arm") {
    const gripper = gripperRequest(t).kind !== "none" || !/\bno\s+gripper\b/.test(t);
    if ((extractDof(prompt) ?? 3) !== 3) notes.push(`${extractDof(prompt)} DOF asked: the Arduino desk arm is 3 DOF (yaw, shoulder, elbow) + claw`);
    // every tier uses the cheapest servo that holds each joint; tiers differ in what they carry
    const pool = ["hobby_sg90", "hobby_mg90s", "hobby_mg996r", "hobby_ds3218"];
    const tiers: [string, string, number][] = [["cheapest", "cheapest that works", 0.02], ["stronger", "stronger", 0.1], ["best", "best on Arduino", 0.2]];
    for (const [tier, tierLabel, kg] of tiers) {
      const s = designArduinoArm({ name: "arduino_arm", prompt, budget, servos: pool, gripper, payloadKg: payload ?? kg });
      options.push(option(tier, `${tierLabel}: carries ${Math.round((payload ?? kg) * 1000)} g, ${Math.round(Number(design(s).performance.reach_m) * 100)} cm reach`, s, budget));
      if (payload !== undefined) break;   // a stated payload: one design for it
    }
  } else {
    notes.push(`An Arduino version of the ${label} is not designed yet (being rebuilt on the new CAD kernel). Arduino robots available now: cars (2WD / 4WD) and servo arms.`);
  }
  if (budget !== undefined && options.length && options.every((o) => o.over_budget))
    notes.push(`every option costs more than your $${budget} budget; the cheapest is $${Math.min(...options.map((o) => o.cost_usd)).toFixed(0)}`);
  options.sort((a, b) => a.cost_usd - b.cost_usd);
  return { family, label, options, notes };
}
