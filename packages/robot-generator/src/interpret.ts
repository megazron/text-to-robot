// Deterministic natural-language understanding for local generation. No ML: ordered
// keyword/regex rules, negation-aware matching and unit-aware quantities. Every
// request is either applied, approximated with a stated substitute, or reported as
// ignored; nothing is dropped silently.
import type { RobotSpecification, SensorType } from "@ttr/robot-schema";
import { safeName } from "@ttr/robot-schema";
import { normalize, findAll, mentions, extractDofRaw, extractLengths, extractMasses, extractSpeeds, parseBudget, extractName, extractColour, maskNames, COLOURS } from "./text.ts";
import { MAX_ARM_DOF, RX, gripperRequest, chooseFamily, RECOLOURABLE, type GripperKind } from "./families.ts";
import { applySizeDirectives } from "./sizing.ts";
import { applyInlineSensors, UNMODELLED_SENSORS } from "./sensors.ts";
import { dofOf } from "./spec-utils.ts";

export { MAX_ARM_DOF } from "./families.ts";

/** Requested DOF, clamped to what the serial-arm generator supports (1..12). */
export function extractDof(text: string): number | undefined {
  const raw = extractDofRaw(text);
  return raw === undefined ? undefined : Math.min(MAX_ARM_DOF, Math.max(1, Math.round(raw)));
}

/** What the parser understood. `ignored` and `approximations` are surfaced as warnings. */
export interface Interpretation {
  family: string;
  label: string;
  /** the words that selected the template */
  matched: string;
  dof: number;
  gripper?: GripperKind;
  sensors: { type: SensorType; mount: string }[];
  dimensions: string[];
  name?: string;
  colour?: string;
  budget_usd?: number;
  payload_kg?: number;
  wearer_height_m?: number;
  approximations: string[];
  ignored: string[];
}

export interface PromptResult { spec: RobotSpecification; interpretation: Interpretation; }

/** Deterministic NL -> RobotSpecification plus a record of how each request was handled. */
export function interpretPrompt(prompt: string): PromptResult {
  if (!normalize(prompt)) throw new Error("empty prompt");
  // names and quoted text ("named Tiny", "called 'Unit 50'") never describe the robot's features
  const t = maskNames(prompt);
  const rawDof = extractDofRaw(t);
  const dof = extractDof(t);
  const grip = gripperRequest(t);
  const g = grip.kind;
  const lengths = extractLengths(t);
  const ignored: string[] = [], approximations: string[] = [], dimensions: string[] = [];

  // A stated stature fits a wearable suit to its wearer.
  const suitish = mentions(t, RX.suit);
  let heightM: number | undefined;
  const stature = suitish ? lengths.find((l) => l.context === "height" && l.metres > 1) : undefined;
  if (stature) {
    if (stature.metres >= 1.5 && stature.metres <= 2.05) heightM = +stature.metres.toFixed(3);
    else ignored.push(`wearer height ${stature.raw} is outside the supported 1.50–2.05 m range; fitted to 1.75 m`);
  }

  const choice = chooseFamily(t, prompt, dof, g, heightM, grip.explicit);
  const spec = choice.build();
  if (choice.approx) approximations.push(choice.approx);
  if (grip.note && choice.usesGripper) approximations.push(grip.note);

  if (rawDof !== undefined) {
    if (!choice.usesDof) { if (!limbDofs(spec).has(rawDof)) ignored.push(`${rawDof} DOF: the ${choice.label} template has fixed kinematics`); }
    else if (rawDof !== dof) approximations.push(`${rawDof} DOF clamped to ${dof} (supported range 1–${MAX_ARM_DOF})`);
  }
  if (grip.explicit && !choice.usesGripper && !["wall_e", "eva", "baymax", "iron_man_mark_43", "exosuit", "battle_mech"].includes(choice.family))
    ignored.push(`gripper: the ${choice.label} template has no arm (try "mobile manipulator")`);
  if (g === "suction" && choice.family === "humanoid") ignored.push("suction gripper: humanoid hands use two-finger grippers");
  if ((choice.family === "quadruped" || choice.family === "hexapod") && mentions(t, /\b(?:arms?|manipulator)\b/))
    ignored.push(`arm: an arm on a legged base is not supported yet (try "mobile manipulator" for a wheeled base with an arm)`);

  // name from prompt if the user names it
  const name = extractName(prompt);
  if (name) spec.robot_name = safeName(name, spec.robot_name);

  applySizeDirectives(spec, t, choice.family, lengths, stature, dimensions, ignored);
  if (heightM) {
    dimensions.push(`fitted to a ${heightM.toFixed(2)} m wearer`);
    if (Math.abs(heightM - 1.75) > 0.005) approximations.push("suit proportions scaled from the 1.75 m reference; clearance and wearer-contact audits cover the reference size only");
  }
  const sensors = applyInlineSensors(spec, t);
  for (const x of findAll(t, UNMODELLED_SENSORS)) ignored.push(`${x.text}: only cameras, depth cameras, lidars and IMUs are modelled`);

  const colour = extractColour(t);
  if (colour) {
    const mat = spec.materials.find((x) => x.name === "link_mat");
    if (RECOLOURABLE.has(choice.family) && mat) mat.color = [...COLOURS[colour]];
    else ignored.push(`colour "${colour}": the ${choice.label} keeps its own livery`);
  }

  const budget = parseBudget(t);
  if (budget.unsupported) ignored.push(`budget "${budget.unsupported}": only US-dollar budgets are supported`);
  const masses = extractMasses(t);
  const payload = masses.find((x) => x.context === "payload");
  let payloadKg: number | undefined;
  if (payload) {
    if (spec.end_effectors.length) payloadKg = +payload.kg.toFixed(3);
    else ignored.push(`payload ${payload.raw}: the ${choice.label} has no end effector to carry it`);
  }
  for (const v of extractSpeeds(t)) ignored.push(`speed ${v}: speed targets are not modelled; joint velocity limits come from the template`);
  for (const x of masses) {
    if (x === payload) continue;
    ignored.push(x.context === "payload" ? `payload ${x.raw}: only one payload is sized; using ${payload!.raw}`
      : `mass ${x.raw}: target robot mass is not adjustable; masses follow geometry and materials`);
  }

  spec.metadata.source_prompt = prompt;
  spec.metadata.notes.push(`Interpreted locally: type inferred, DOF=${dofOf(spec)}, gripper=${g}.`);
  const interpretation: Interpretation = {
    family: choice.family, label: choice.label, matched: choice.matched, dof: dofOf(spec),
    ...(choice.usesGripper ? { gripper: spec.end_effectors.length ? g : "none" as GripperKind } : {}),
    sensors, dimensions, ...(name ? { name: spec.robot_name } : {}),
    ...(colour && !ignored.some((i) => i.startsWith("colour")) ? { colour } : {}),
    ...(budget.usd !== undefined ? { budget_usd: budget.usd } : {}),
    ...(payloadKg !== undefined ? { payload_kg: payloadKg } : {}),
    ...(heightM ? { wearer_height_m: heightM } : {}),
    approximations, ignored,
  };
  return { spec, interpretation };
}

/** Deterministic NL -> RobotSpecification (local generation). */
export function parsePrompt(prompt: string): RobotSpecification {
  return interpretPrompt(prompt).spec;
}

/** One line: "6-DOF serial arm · parallel gripper · camera (wrist) · reach 0.60 m · budget $500". */
export function describeInterpretation(i: Interpretation): string {
  const parts = [i.label];
  if (i.name) parts.push(`named ${i.name}`);
  if (i.gripper && i.gripper !== "none") parts.push(`${i.gripper} gripper`);
  if (i.gripper === "none") parts.push("no gripper");
  for (const s of i.sensors) parts.push(`${s.type} (${s.mount})`);
  parts.push(...i.dimensions);
  if (i.colour) parts.push(i.colour);
  if (i.payload_kg !== undefined) parts.push(`payload ${i.payload_kg} kg`);
  if (i.budget_usd !== undefined) parts.push(`budget $${i.budget_usd}`);
  return parts.join(" · ");
}

/** Total DOF plus the DOF of each limb ("two 7 DOF arms", "3 DOF legs"), grouped by side prefix. */
function limbDofs(spec: RobotSpecification): Set<number> {
  const groups = new Map<string, number>();
  for (const j of spec.joints) {
    if (j.type === "fixed" || j.passive) continue;
    const side = j.name.match(/^((?:(?:front|rear|back|middle|mid|left|right)_)+)/)?.[1];
    if (!side) continue;
    const limb = side + (/arm|shoulder|elbow|wrist|finger|thumb/.test(j.name) ? "arm" : /hip|knee|ankle|leg|coxa|femur|tibia/.test(j.name) ? "leg" : "other");
    groups.set(limb, (groups.get(limb) ?? 0) + 1);
  }
  return new Set([dofOf(spec), ...groups.values()]);
}
