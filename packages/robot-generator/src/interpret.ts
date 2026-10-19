// Deterministic natural-language understanding for local generation. No ML: ordered
// keyword/regex rules, negation-aware matching and unit-aware quantities. Every
// request is either applied, approximated with a stated substitute, or reported as
// ignored; nothing is dropped silently.
import type { RobotSpecification, SensorType } from "@ttr/robot-schema";
import { safeName } from "@ttr/robot-schema";
import { fk } from "@ttr/design";
import { normalize, find, findAll, mentions, negates, extractDofMentions, type DofMention, extractLengths, extractMasses, extractSpeeds, parseBudget, extractName, extractColour, maskNames, COLOURS } from "./text.ts";
import { MAX_ARM_DOF, RX, gripperRequest, chooseFamily, RECOLOURABLE, ARM_FAMILIES, type Choice, type GripperKind, type DesignContext } from "./families.ts";
import { translateKeywords } from "./lexicon.ts";
import { applySizeDirectives, designedSizes, reportDesignedReach } from "./sizing.ts";
import { applyInlineSensors, requestedSensors, sensorCount, SENSOR_WORDS, UNMODELLED_SENSORS } from "./sensors.ts";
import { dofOf } from "./spec-utils.ts";

export { MAX_ARM_DOF } from "./families.ts";

/** Requested DOF, clamped to what the serial-arm generator supports (1..12). */
export function extractDof(text: string): number | undefined {
  const raw = extractDofMentions(translateKeywords(normalize(text)).text)[0]?.value;
  return raw === undefined ? undefined : Math.min(MAX_ARM_DOF, Math.max(1, Math.round(raw)));
}

/** What the parser understood. `ignored`, `approximations` and `conflicts` are surfaced as warnings. */
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
  /** requests that contradict each other ("2 DOF ... 7 joints"); each says which one was used */
  conflicts: string[];
}

export interface PromptResult { spec: RobotSpecification; interpretation: Interpretation; }

/** Sensors a designed robot carries, reported like inline sensors (type + the link they sit on). */
const designedSensors = (spec: RobotSpecification) => spec.sensors.map((x) => ({ type: x.type, mount: x.parent }));

/** Deterministic NL -> RobotSpecification plus a record of how each request was handled. */
export function interpretPrompt(prompt: string): PromptResult {
  if (!normalize(prompt)) throw new Error("empty prompt");
  // names and quoted text ("named Tiny", "called 'Unit 50'") never describe the robot's features
  // basic German/French/Spanish keywords are mapped onto the English vocabulary first
  const translation = translateKeywords(maskNames(prompt));
  const t = translation.text;
  const dofMentions = extractDofMentions(t);
  const rawDof = dofMentions[0]?.value;
  const dof = rawDof === undefined ? undefined : Math.min(MAX_ARM_DOF, Math.max(1, Math.round(rawDof)));
  const grip = gripperRequest(t);
  const g = grip.kind;
  const lengths = extractLengths(t);
  const ignored: string[] = [], approximations: string[] = [], dimensions: string[] = [], conflicts: string[] = [];
  if (translation.mapped.length) approximations.push(`read non-English keywords as English: ${translation.mapped.join(", ")}`);

  // A stated stature fits a wearable suit to its wearer.
  const suitish = mentions(t, RX.suit);
  let heightM: number | undefined;
  const stature = suitish ? lengths.find((l) => l.context === "height" && l.metres > 1) : undefined;
  if (stature) {
    if (stature.metres >= 1.5 && stature.metres <= 2.05) heightM = +stature.metres.toFixed(3);
    else ignored.push(`wearer height ${stature.raw} is outside the supported 1.50–2.05 m range; fitted to 1.75 m`);
  }

  const choice = chooseFamily(t, prompt, dof, g, heightM, grip.explicit);
  const budget = parseBudget(t);
  const masses = extractMasses(t);
  const payload = masses.find((x) => x.context === "payload");
  const asked = choice.designed && ARM_FAMILIES.has(choice.family) ? designedSizes(t, choice.label, lengths, stature, { dimensions, approximations, ignored, conflicts }) : undefined;
  const ctx: DesignContext = { prompt, budget: budget.usd, payloadKg: payload ? +payload.kg.toFixed(3) : undefined, reachM: asked?.reachM, segments: asked?.segments,
    sensors: requestedSensors(t).filter((type) => !negates(t, SENSOR_WORDS.find(([, k]) => k === type)![0])), ...(heightM ? { heightM } : {}) };
  const spec = choice.build(ctx);
  if (asked) reportDesignedReach(spec, asked, { dimensions, approximations, ignored, conflicts });
  if (choice.approx) approximations.push(choice.approx);
  if (grip.note && choice.usesGripper) approximations.push(grip.note);

  if (rawDof !== undefined) {
    const first = dofMentions[0];
    if (first.unit === "link" && choice.usesDof) approximations.push(`"${first.raw}" read as ${dof} DOF (one revolute joint per link)`);
    if (!choice.usesDof) { if (!limbDofs(spec).has(rawDof)) ignored.push(`${rawDof} DOF: the ${choice.label} template has fixed kinematics`); }
    else if (rawDof !== dof) approximations.push(`${rawDof} DOF clamped to ${dof} (supported range 1–${MAX_ARM_DOF})`);
  }
  if (grip.explicit && !choice.usesGripper && !["wall_e", "eva", "baymax", "iron_man_mark_43", "exosuit", "battle_mech"].includes(choice.family))
    ignored.push(`gripper: the ${choice.label} template has no arm (try "mobile manipulator")`);
  if (g === "suction" && choice.family === "humanoid") ignored.push("suction gripper: humanoid hands use two-finger grippers");
  if ((choice.family === "quadruped" || choice.family === "hexapod") && mentions(t, /\b(?:arms?|manipulator)\b/))
    ignored.push(`arm: an arm on a legged base is not supported yet (try "mobile manipulator" for a wheeled base with an arm)`);

  conflicts.push(...dofConflicts(dofMentions, choice), ...familyConflicts(t, choice));
  if (choice.family === "serial_arm" && mentions(t, /\bplanar\b/) && !isPlanar(spec))
    ignored.push(`planar: the ${choice.label} template turns about a vertical base axis; only the 2-DOF arm is planar`);

  // name from prompt if the user names it
  const name = extractName(prompt);
  if (name) spec.robot_name = safeName(name, spec.robot_name);

  if (!asked) applySizeDirectives(spec, t, choice.family, choice.label, lengths, stature, { dimensions, approximations, ignored, conflicts });
  if (heightM) {
    dimensions.push(`fitted to a ${heightM.toFixed(2)} m wearer`);
    if (Math.abs(heightM - 1.75) > 0.005) approximations.push("suit proportions scaled from the 1.75 m reference; clearance and wearer-contact audits cover the reference size only");
  }
  const sensors = choice.designed ? designedSensors(spec) : applyInlineSensors(spec, t);
  if (choice.designed) for (const type of ctx.sensors) {
    const mounted = spec.sensors.filter((x) => x.type === type).length, wanted = sensorCount(t, type);
    if (!mounted) ignored.push(`${type}: the ${choice.label} design has no mount for it yet`);
    else if (wanted > mounted) ignored.push(`${wanted} ${type}s: the ${choice.label} design mounts ${mounted}`);
  }
  for (const x of findAll(t, UNMODELLED_SENSORS)) ignored.push(`${x.text}: only cameras, depth cameras, lidars and IMUs are modelled`);

  const colour = extractColour(t);
  if (colour) {
    const mat = spec.materials.find((x) => x.name === (choice.designed ? "printed_accent" : "link_mat"));
    if (RECOLOURABLE.has(choice.family) && mat) mat.color = [...COLOURS[colour]];
    else ignored.push(`colour "${colour}": the ${choice.label} keeps its own livery`);
  }

  if (budget.unsupported) ignored.push(`budget "${budget.unsupported}": only US-dollar budgets are supported`);
  let payloadKg: number | undefined;
  if (payload) {
    if (spec.end_effectors.length) payloadKg = +payload.kg.toFixed(3);
    else ignored.push(`payload ${payload.raw}: the ${choice.label} has no end effector to carry it`);
  }
  for (const v of extractSpeeds(t)) ignored.push(`speed ${v}: speed targets are not modelled; ${choice.designed ? "speeds follow the chosen actuators' datasheets" : "joint velocity limits come from the template"}`);
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
    approximations, ignored, conflicts,
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

/** Stated joint counts that disagree: "a 2 DOF arm with 7 joints" builds 2 DOF and says so. */
function dofConflicts(mentions: DofMention[], choice: Choice): string[] {
  if (!choice.usesDof || choice.family === "humanoid") return [];   // humanoids state per-limb counts
  const first = mentions[0];
  return mentions.slice(1).filter((m) => m.value !== first?.value)
    .map((m) => `"${m.raw}" contradicts "${first.raw}"; built ${first.value} DOF from the first count stated`);
}

/** Robot types named in the prompt that the chosen template does not provide. */
const OTHER_TYPES: { rx: RegExp; what: string; fits: string[] }[] = [
  { rx: /humanoid|\bbiped(?:al)?\b|\b(?:two|2)[\s-]?legged\b/, what: "humanoid", fits: ["humanoid"] },
  { rx: /quadruped|\b(?:four|4)[\s-]?legged\b|\b(?:four|4) legs\b|robo(?:t)?[\s-]?dog\b/, what: "quadruped", fits: ["quadruped"] },
  { rx: RX.hexapod, what: "hexapod", fits: ["hexapod"] },
  { rx: RX.scara, what: "SCARA", fits: ["scara"] },
  { rx: new RegExp([RX.wheels.source, RX.diffDrive.source, RX.fourWheel.source, RX.mecanum.source, RX.omni.source, RX.tracked.source].join("|")),
    what: "wheeled base", fits: ["diff_drive", "four_wheel", "mecanum", "rover_arm"] },
  // legged bases already report an arm as not applied
  { rx: RX.arm, what: "arm", fits: ["serial_arm", "rover_arm", "scara", "humanoid", "quadruped", "hexapod"] },
];
/** Characters and suits are themed designs; their keywords overlap by design. */
const THEMED = new Set(["wall_e", "eva", "baymax", "iron_man_mark_43", "exosuit", "battle_mech"]);
/** "an arm that is also a rover", "an arm or a rover": two robots in one description. */
const IDENTITY = /\b(?:is|are|be|being)\s+(?:also\s+)?an?\b|\balso\s+an?\b|\bor\s+(?:an?\s+)?\b|\bas well as being\b/;

function familyConflicts(t: string, choice: Choice): string[] {
  if (THEMED.has(choice.family)) return [];
  // quote the keyword with the noun it describes: "wheeled rover", not just "wheeled"
  const phrase = (h: { index: number; text: string }) =>
    (h.text + (t.slice(h.index + h.text.length).match(/^\s+(?:rover|robot|base|platform|chassis|vehicle)\b/)?.[0] ?? "")).trim();
  const out: string[] = [];
  for (const o of OTHER_TYPES) {
    const hit = find(t, o.rx);
    if (hit && !o.fits.includes(choice.family)) out.push(`"${phrase(hit)}" asks for a ${o.what}, but a prompt builds one robot; built the ${choice.label}`);
  }
  if (choice.family === "rover_arm") {
    const arm = find(t, RX.arm), base = find(t, OTHER_TYPES[4].rx);
    if (arm && base) {
      const [a, b] = arm.index < base.index ? [arm, base] : [base, arm];
      if (IDENTITY.test(t.slice(a.index + a.text.length, b.index)))
        out.push(`"${phrase(arm)}" and "${phrase(base)}" describe two different robots; combined them into one mobile manipulator (wheeled base carrying the arm)`);
    }
  }
  return out;
}

/** All moving joints share one axis (a planar chain), compared in the world frame. */
function isPlanar(spec: RobotSpecification): boolean {
  const f = fk(spec), axes = spec.joints.filter((j) => (j.type === "revolute" || j.type === "continuous") && j.name !== "gripper").map((j) => f.joint[j.name].axis);
  return axes.length > 0 && axes.every((a) => Math.abs(a[0] * axes[0][0] + a[1] * axes[0][1] + a[2] * axes[0][2]) > 0.999);
}
