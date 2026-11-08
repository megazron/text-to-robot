// Deterministic natural-language understanding for local generation. No ML: ordered
// keyword/regex rules, negation-aware matching and unit-aware quantities. Every
// request is either applied, approximated with a stated substitute, or reported as
// ignored; nothing is dropped silently.
import type { RobotSpecification, SensorType } from "@ttr/robot-schema";
import { safeName } from "@ttr/robot-schema";
import { fk } from "@ttr/design";
import { normalize, find, findAll, mentions, negates, extractDofMentions, type DofMention, extractLengths, extractMasses, extractSpeeds, parseBudget, extractName, extractColour, maskNames, COLOURS } from "./text.ts";
import { MAX_ARM_DOF, RX, gripperRequest, chooseFamily, RECOLOURABLE, type Choice, type GripperKind, type DesignContext } from "./families.ts";
import { translateKeywords } from "./lexicon.ts";
import { applySizeDirectives, designedSizes, reportDesignedReach } from "./sizing.ts";
import { applyInlineSensors, requestedSensors, sensorCount, SENSOR_WORDS, UNMODELLED_SENSORS } from "./sensors.ts";
import { dofOf } from "./spec-utils.ts";

export { MAX_ARM_DOF } from "./families.ts";

/** Requested DOF, clamped to what the serial-arm generator supports (1..12). */
// Designers are deterministic in their request and take seconds (sizing loops, exact clearance sweeps):
// a process keeps the last designs it built, and hands out copies (callers edit specs in place).
const designCache = new Map<string, RobotSpecification>();
function buildCached(choice: Choice, ctx: DesignContext): RobotSpecification {
  if (!choice.designed) return choice.build(ctx);
  const key = `${choice.family}|${choice.label}|${JSON.stringify(ctx)}`, hit = designCache.get(key);
  if (hit) return structuredClone(hit);
  const spec = choice.build(ctx);
  if (designCache.size >= 64) designCache.delete(designCache.keys().next().value as string);
  designCache.set(key, structuredClone(spec));
  return spec;
}

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
  /** engineering checks the designed robot fails (it was built, but would not work as asked) */
  warnings?: string[];
}

export interface PromptResult { spec: RobotSpecification; interpretation: Interpretation; }

/** Sensors a designed robot carries, reported like inline sensors (type + the link they sit on). */
const designedSensors = (spec: RobotSpecification) => spec.sensors.map((x) => ({ type: x.type, mount: spec.joints.find((j) => j.child === x.parent)?.parent ?? x.parent }));

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
  const ignored: string[] = [], approximations: string[] = [], dimensions: string[] = [], conflicts: string[] = [], warnings: string[] = [];
  if (translation.mapped.length) approximations.push(`read non-English keywords as English: ${translation.mapped.join(", ")}`);

  // A stated stature fits a wearable suit to its wearer.
  // a standalone battle mech is a robot, not something worn
  const standaloneMech = /\bmech\b(?!\s+suit)/.test(t) && !/iron[\s-]?man|exo|wearable|suit/.test(t);
  const suitish = mentions(t, RX.suit) && !standaloneMech;
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
  const asked = choice.designed && (choice.family === "serial_arm" || choice.family === "scara") ? designedSizes(t, choice.label, lengths, stature, { dimensions, approximations, ignored, conflicts }) : undefined;
  const hobby = hobbyServos(t);
  const ctx: DesignContext = { ...(hobby ? { hobby } : {}), prompt, budget: budget.usd, payloadKg: payload ? +payload.kg.toFixed(3) : undefined, reachM: asked?.reachM, segments: asked?.segments,
    sensors: requestedSensors(t).filter((type) => !negates(t, SENSOR_WORDS.find(([, k]) => k === type)![0])),
    excludeSensors: SENSOR_WORDS.filter(([rx]) => negates(t, rx)).map(([, k]) => k), ...(heightM ? { heightM } : {}) };
  // a standing robot's stated height is a design input of the humanoid / mech designers
  const robotHeight = !suitish && choice.designed && (choice.family === "humanoid" || choice.family === "battle_mech")
    ? lengths.find((l) => l.context === "height") : undefined;
  let spec: RobotSpecification;
  if (robotHeight) {
    // the designers scale legs and torso from the height; one correction step lands the built height on the target
    const built = (s: RobotSpecification) => (s.metadata as { design?: { performance?: { height_m?: number } } }).design?.performance?.height_m ?? 0;
    spec = buildCached(choice, { ...ctx, heightM: robotHeight.metres });
    const h0 = built(spec);
    if (h0 > 0 && Math.abs(h0 - robotHeight.metres) / robotHeight.metres > 0.03) {
      const again = buildCached(choice, { ...ctx, heightM: +(robotHeight.metres * robotHeight.metres / h0).toFixed(3) });
      if (Math.abs(built(again) - robotHeight.metres) < Math.abs(h0 - robotHeight.metres)) spec = again;
    }
    const h = built(spec);
    if (Math.abs(h - robotHeight.metres) / robotHeight.metres <= 0.03) dimensions.push(`height ${h.toFixed(2)} m`);
    else approximations.push(`${robotHeight.raw}: humanoids are designed 0.5-0.85 m tall on servos and up to about 1.3 m on QDD actuators; built ${h.toFixed(2)} m tall`);
    if (choice.family === "humanoid" && robotHeight.metres > 0.9) approximations.push("full-size humanoid: built on CubeMars quasi-direct-drive leg actuators (servo legs cannot carry it)");
    lengths.splice(lengths.indexOf(robotHeight), 1);
  } else spec = buildCached(choice, ctx);
  // record what kind of robot this is, so simulators and exporters pick the right tests and controllers
  const meta = spec.metadata as unknown as Record<string, unknown>;
  if (!meta.family && !(meta.design as { family?: string } | undefined)?.family) meta.family = choice.family;
  if (hobby) {
    if (choice.family === "serial_arm" && choice.designed) dimensions.push(`hobby servos${hobby.only ? ` (${hobby.only.map((k) => k.replace("hobby_", "").toUpperCase()).join(", ")})` : ""} on an Arduino Uno + PCA9685`);
    else if (choice.family.startsWith("arduino_") || choice.family === "iron_man_mark_43") { /* designed around Arduino parts */ }
    else ignored.push(`hobby servos / Arduino: only arms are designed for hobby servos so far; the ${choice.label} uses its standard actuators`);
  }
  if (asked) reportDesignedReach(spec, asked, { dimensions, approximations, ignored, conflicts });
  namedParts(t, spec, { dimensions, approximations });
  // engineering checks that fail are shown with the result, not only in the build report
  const failed = ((spec.metadata as { design?: { checks?: { name: string; pass: boolean; detail: string }[] } }).design?.checks ?? []).filter((c) => !c.pass);
  if (failed.length) {
    const weak = failed.filter((c) => c.name.startsWith("torque:")).map((c) => c.name.slice(7));
    const hint = weak.length && hobby?.only ? ` (try stronger servos, e.g. "with MG996R servos", a shorter reach or a lighter payload)` : weak.length ? " (try a shorter reach or a lighter payload)" : "";
    warnings.push(`design check failed: ${failed.slice(0, 4).map((c) => `${c.name}: ${c.detail.split(" — ")[0]}`).join("; ")}${failed.length > 4 ? ` and ${failed.length - 4} more` : ""}${hint}`);
  }
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
    dimensions.push(choice.family === "iron_man_mark_43" ? `sized for a ${heightM.toFixed(2)} m wearer` : `fitted to a ${heightM.toFixed(2)} m wearer`);
    if (Math.abs(heightM - 1.75) > 0.005) approximations.push(choice.family === "iron_man_mark_43"
      ? `the armour is scaled as a whole from its 1.75 m design to ${heightM.toFixed(2)} m (there is no body model); joint limits and clearances were measured at 1.75 m`
      : "suit proportions scaled from the 1.75 m reference; clearance and wearer-contact audits cover the reference size only");
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
    if (spec.end_effectors.length || choice.designed) payloadKg = +payload.kg.toFixed(3); // designed bases carry it as cargo
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
    // report the tool that was actually built (a pick-and-place SCARA gets a suction cup without asking)
    ...(choice.usesGripper ? { gripper: !spec.end_effectors.length ? "none" as GripperKind : /suction/.test(spec.end_effectors[0].type) ? "suction" as GripperKind : g === "none" ? "parallel" as GripperKind : g } : {}),
    sensors, dimensions, ...(name ? { name: spec.robot_name } : {}),
    ...(colour && !ignored.some((i) => i.startsWith("colour")) ? { colour } : {}),
    ...(budget.usd !== undefined ? { budget_usd: budget.usd } : {}),
    ...(payloadKg !== undefined ? { payload_kg: payloadKg } : {}),
    ...(heightM ? { wearer_height_m: heightM } : {}),
    approximations, ignored, conflicts, ...(warnings.length ? { warnings } : {}),
  };
  return { spec, interpretation };
}

/** Deterministic NL -> RobotSpecification (local generation). */
export function parsePrompt(prompt: string): RobotSpecification {
  return interpretPrompt(prompt).spec;
}

/** One line: "6-DOF serial arm · parallel gripper · camera (wrist) · reach 0.60 m · budget $500". */
const HOBBY_MODELS: [RegExp, string][] = [[/\bsg[\s-]?90\b/, "hobby_sg90"], [/\bmg[\s-]?90s?\b/, "hobby_mg90s"], [/\bmg[\s-]?996r?\b/, "hobby_mg996r"], [/\bds[\s-]?3218\b/, "hobby_ds3218"]];
/** Hobby-servo / Arduino build requested? Named servo models limit the choice to those models. */
export function hobbyServos(t: string): { only?: string[] } | undefined {
  const named = HOBBY_MODELS.filter(([rx]) => rx.test(t)).map(([, k]) => k);
  if (named.length) return { only: named };
  if (/\b(?:hobby|micro|rc|pwm|analog(?:ue)?)\s+servos?\b|\barduino\b|\bpca\s?9685\b|\bservo\s+(?:driver|shield)\b/.test(t)) return {};
  return undefined;
}

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

/** Boards and drivers named in the prompt: used when the design can take them, otherwise the swap is said with the reason. */
const NAMED_PARTS: { rx: RegExp; key: string; label: string; instead: Record<string, string> }[] = [
  { rx: /\barduino\s+nano\b|\bnano\b/, key: "arduino_nano_clone", label: "Arduino Nano",
    instead: { arduino_uno_clone: "the Uno is kept: the board sits on the desk beside the arm, so either works and the sketch is the same" } },
  { rx: /\barduino\s+uno\b|\buno\b/, key: "arduino_uno_clone", label: "Arduino Uno",
    instead: { arduino_nano_clone: "an Arduino Nano is used instead: it plugs into the breadboard with the motor driver (an Uno does not), and the sketch runs unchanged on an Uno wired with jumpers" } },
  { rx: /\bl298n?\b/, key: "l298n_module", label: "L298N",
    instead: { tb6612fng_module: "a TB6612FNG is used instead: the L298N loses about 2 V in its bipolar bridge (TT motors on the 7.4 V pack would run slow and hot) and it does not plug into the breadboard" } },
  { rx: /\btb6612(?:fng)?\b/, key: "tb6612fng_module", label: "TB6612FNG", instead: {} },
  { rx: /\bpca9685\b/, key: "pca9685_clone", label: "PCA9685", instead: {} },
  { rx: /\bhc[\s-]?sr04\b/, key: "hc_sr04", label: "HC-SR04", instead: {} },
];
function namedParts(t: string, spec: RobotSpecification, out: { dimensions: string[]; approximations: string[] }): void {
  const design = (spec.metadata as { design?: { purchased?: { key: string }[] } }).design;
  if (!design?.purchased) return;
  const have = new Set(design.purchased.map((p) => p.key));
  for (const n of NAMED_PARTS) {
    if (!n.rx.test(t)) continue;
    if (have.has(n.key)) { out.dimensions.push(`${n.label} as asked`); continue; }
    const swap = Object.entries(n.instead).find(([k]) => have.has(k));
    out.approximations.push(swap ? `${n.label} named: ${swap[1]}` : `${n.label} named but this design does not use one`);
  }
}
