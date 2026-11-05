// Arduino mode: the same prompt, built only from cheap Arduino-ecosystem parts, offered as price tiers.
// Each option is a complete, checked design; options over the stated budget are marked, and when nothing
// can be built the result says what can.
import type { RobotSpecification } from "@ttr/robot-schema";
import { designArduinoCar, designArm, type ArduinoTier } from "@ttr/design";
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
const works = (s: RobotSpecification) => design(s).checks.every((c) => c.pass || c.name === "budget");

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
    const dof = Math.max(2, Math.min(6, extractDof(prompt) ?? 4)), gripper = gripperRequest(t).kind !== "none";
    if ((extractDof(prompt) ?? 4) > 6) notes.push(`${extractDof(prompt)} DOF: hobby-servo arms are built with up to 6 joints`);
    const tiers: [string, string, string[], number][] = [
      ["cheapest", "cheapest that works (SG90 micro servos)", ["hobby_sg90"], 0.2],
      ["stronger", "stronger (MG90S / MG996R metal gears)", ["hobby_mg90s", "hobby_mg996r"], 0.3],
      ["best", "best on Arduino (up to DS3218 20 kg servos)", ["hobby_mg90s", "hobby_mg996r", "hobby_ds3218"], 0.36],
    ];
    for (const [tier, tierLabel, only, maxReach] of tiers) {
      // the longest reach (in 2 cm steps) at which these servos hold the arm and its payload continuously
      const build = (reachM: number) => designArm({ name: `arduino_arm_${dof}dof`, dof, gripper, prompt, budget, ladder: "hobby", onlyActuators: only, cheapParts: true, reachM, ...(payload ? { payloadKg: payload } : {}) });
      let s = build(maxReach);
      for (let r = maxReach - 0.02; !works(s) && r >= 0.08; r -= 0.02) s = build(+r.toFixed(2));
      options.push(option(tier, `${tierLabel}, ${Math.round(Number(design(s).performance.reach_m ?? 0) * 100)} cm reach`, s, budget));
    }
  } else {
    notes.push(`An Arduino version of the ${label} is not designed yet (being rebuilt on the new CAD kernel). Arduino robots available now: cars (2WD / 4WD) and servo arms.`);
  }
  if (budget !== undefined && options.length && options.every((o) => o.over_budget))
    notes.push(`every option costs more than your $${budget} budget; the cheapest is $${Math.min(...options.map((o) => o.cost_usd)).toFixed(0)}`);
  options.sort((a, b) => a.cost_usd - b.cost_usd);
  return { family, label, options, notes };
}
