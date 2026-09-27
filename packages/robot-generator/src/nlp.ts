// Deterministic natural-language understanding for local generation + a modification
// engine used by every provider. No ML: ordered keyword/regex rules, negation-aware
// matching and unit-aware quantities. Every request is either applied, approximated
// with a stated substitute, or reported as ignored; nothing is dropped silently.
import type { RobotSpecification, Geometry, Sensor, SensorType, Joint, Pose, Vec3 } from "@ttr/robot-schema";
import { poseToMat } from "@ttr/kinematics";
import { meshGeometry } from "@ttr/mesh";
import { safeName, pose, ARM } from "@ttr/robot-schema";
import { nDofArm, scara, humanoid, diffDrive, fourWheel, mecanum, quadruped, hexapod, roverArm, ironManSuit, wearableExosuit, ironManMark43, wallE, eva, baymax, attachParallelGripper, attachSuctionGripper, cyl, box, link, joint } from "@ttr/robot-templates";
import { normalize, find, findAll, mentions, negates, isNegated, isDirectlyNegated, extractDofRaw, extractLengths, extractMasses, extractSpeeds, parseBudget, extractName, extractColour, maskNames, ROBOT_NOUN, COLOURS, type Length, type Hit } from "./text.ts";

export const MAX_ARM_DOF = 12;

/** Requested DOF, clamped to what the serial-arm generator supports (1..12). */
export function extractDof(text: string): number | undefined {
  const raw = extractDofRaw(text);
  return raw === undefined ? undefined : Math.min(MAX_ARM_DOF, Math.max(1, Math.round(raw)));
}

type GripperKind = "parallel" | "suction" | "none";

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

// ---------------- request vocabulary ----------------
const RX = {
  suit: /iron[\s-]?man|exosuit|exo[\s-]?skeleton|wearable|power(?:ed)?\s+(?:armou?r|suit)|mech\s+suit|battle\s+(?:suit|mech)/,
  wallE: /wall[\s-]?e\b|trash[\s-]?compactor|garbage\s+robot/,
  eva: /\beva\b|probe\s+droid|egg[\s-]?shaped|hover(?:ing)?\s+(?:robot|droid|bot)/,
  baymax: /baymax|\binflatable\b|healthcare\s+companion/,
  humanoid: /humanoid|\bbiped(?:al)?\b|\b(?:two|2)[\s-]?legged\b|\b(?:two|2) legs\b|torso.*\barms\b|\btwo\s+arms\b/,
  dualArm: /\bdual[\s-]?arm(?:ed)?\b|\bbimanual\b|\btwo[\s-]armed\b/,
  hexapod: /hexapod|\b(?:six|6)[\s-]?legged\b|\b(?:six|6) legs\b|spider|insect|ant[\s-]?bot/,
  octopod: /\b(?:eight|8)[\s-]?legged\b|\b(?:eight|8) legs\b|octopod/,
  roverArm: /(rover|mars|planetary|explorer|loader|wheel(?:ed|s)|track(?:ed|s)|\btank\b|crawler|skid[\s-]?steer|\b4wd\b|mecanum|mobile\s+(?:base|robot|platform)).*\b(arms?|manipulat\w*)\b|\b(arms?|manipulat\w*)\b.*(rover|mars|planetary|mobile\s+base|wheels|wheeled|tracks|tracked)|mobile\s+manipulat/,
  quadruped: /quadruped|\b(?:four|4)[\s-]?legged\b|\b(?:four|4) legs\b|\bdog\b|robo[\s-]?dog|\blegged\b/,
  scara: /\bscara\b/,
  mecanum: /mecanum/,
  omni: /omni[\s-]?(?:wheels?|directional)|holonomic/,
  fourWheel: /\b(?:four|4)[\s-]?wheel(?:ed|s)?\b|\b4wd\b|skid[\s-]?steer/,
  tracked: /\btrack(?:ed|s)\b|\btank\b|\bcrawler\b|\btreads?\b/,
  diffDrive: /diff(?:erential)?[\s-]?drive|\b(?:two|2)[\s-]?wheel(?:ed|s)?\b|mobile\s+(?:base|robot|platform)|\brover\b|robot(?:ic)?\s+vacuum|vacuum\s+(?:cleaner|robot)|turtlebot|cleaning\s+robot|delivery\s+robot|wheeled\s+robot/,
  legs: /\blegs\b|\bwalking\s+robot\b/,
  wheels: /\bwheels\b|\bwheeled\b/,
  gripper: /gripper|end[\s-]?effector|\bclaw\b|suction\s+cup/,
  arm: /\barms?\b|manipulator|\bcobot\b|industrial\s+robot|pick[\s-](?:and|&|n)[\s-]place/,
  hand: /robot(?:ic)?\s+hand|dexterous\s+hand|\bprosthetic\b/,
};

/** Families we do not generate; each says why and what to try instead. */
const UNSUPPORTED: [RegExp, string][] = [
  [/\bdrones?\b|quad[\s-]?copter|multi[\s-]?rotor|\buav\b|hexacopter|\baircraft\b/, "Aerial robots (drones, multirotors) are not supported yet. Try a wheeled rover, legged robot or arm."],
  [/\bdelta\s+robot|parallel\s+(?:robot|manipulator|kinematic)|stewart\s+platform|\bhexapod\s+platform/, "Parallel-kinematics robots (delta, Stewart) are not supported yet. Try a SCARA or a serial arm."],
  [/\bgantry\b|\bcartesian\s+robot|\bxyz\s+(?:stage|robot)/, "Cartesian/gantry robots are not supported yet. Try a SCARA or a serial arm."],
  [/\bsnake\s+robot|\bserpentine\b/, "Snake robots are not supported yet. Try a hexapod or a serial arm."],
  [/underwater|\bauv\b|\brov\b|submarine|\bboat\b|\bfish\s+robot/, "Underwater and marine robots are not supported yet. Try a wheeled rover."],
];

const SUPPORTED_HINT = "Try an arm (\"6 DOF arm with a gripper\"), SCARA, gripper, wheeled base (differential, four-wheel, mecanum), mobile manipulator, quadruped, hexapod, humanoid, wearable exosuit or a character (WALL-E, EVA, Baymax, Iron Man).";

function gripperRequest(t: string): { kind: GripperKind; explicit: boolean; note?: string } {
  const noGripper = negates(t, /gripper|end[\s-]?effector|claw|hand/) && !mentions(t, /gripper|end[\s-]?effector|claw|suction/);
  if (noGripper) return { kind: "none", explicit: true };
  if (mentions(t, /suction|vacuum\s+(?:gripper|cup|tool)|\bvacuum\b(?!\s+(?:cleaner|robot))/) && !mentions(t, /robot(?:ic)?\s+vacuum|vacuum\s+(?:cleaner|robot)/)) return { kind: "suction", explicit: true };
  const multi = find(t, /\b(?:three|four|five|3|4|5|multi)[\s-]?finger(?:ed)?\b|dexterous/);
  if (multi) return { kind: "parallel", explicit: true, note: `"${multi.text}" gripper approximated by a two-finger parallel gripper` };
  return { kind: "parallel", explicit: mentions(t, RX.gripper) };
}

interface Choice { family: string; label: string; matched: string; build: () => RobotSpecification; usesDof?: boolean; usesGripper?: boolean; approx?: string; }

function chooseFamily(t: string, prompt: string, dof: number | undefined, g: GripperKind, heightM?: number, explicitGripper = false): Choice {
  // "no camera on my quadruped" negates the camera, not the quadruped: only "not a quadruped" rejects a family
  const hit = (rx: RegExp) => find(t, rx)?.text ?? [...t.matchAll(new RegExp(rx.source, "g"))].find((m) => !isDirectlyNegated(t, m.index!))?.[0];
  let m: string | undefined;

  if ((m = hit(RX.suit))) {
    // a suit is WORN: build the wearable exoskeleton; "battle mech" (standalone robot) is a humanoid
    if (/\bmech\b(?!\s+suit)/.test(t) && !/iron[\s-]?man|exo|wearable|suit/.test(t)) return { family: "battle_mech", label: "humanoid battle mech", matched: m, build: () => ironManSuit("battle_mech", prompt) };
    if (/iron[\s-]?man|mark\s*(?:[ivx]+|\d+)|armou?r|movie|ultron/.test(t)) return { family: "iron_man_mark_43", label: "Iron Man Mark 43 wearable suit", matched: m, build: () => ironManMark43({ prompt, ...(heightM ? { height_m: heightM } : {}) }) };
    return { family: "exosuit", label: "wearable exoskeleton", matched: m, build: () => wearableExosuit({ prompt, styled: false, name: "exosuit", ...(heightM ? { height_m: heightM } : {}) }) };
  }
  if ((m = hit(RX.wallE))) return { family: "wall_e", label: "WALL-E character", matched: m, build: () => wallE("wall_e", prompt) };
  if ((m = hit(RX.eva))) return { family: "eva", label: "EVA character", matched: m, build: () => eva("eva", prompt) };
  if ((m = hit(RX.baymax))) return { family: "baymax", label: "Baymax character", matched: m, build: () => baymax("baymax", prompt) };
  for (const [rx, why] of UNSUPPORTED) if (mentions(t, rx)) throw new Error(why);
  const humanoidOf = (matched: string, approx?: string): Choice => ({ family: "humanoid", label: "humanoid", matched, approx, usesDof: true, usesGripper: true,
    build: () => humanoid({ armDof: dof ?? 7, gripper: g !== "none", prompt }) });
  if ((m = hit(RX.humanoid))) return humanoidOf(m);
  if ((m = hit(RX.dualArm))) return humanoidOf(m, "dual-arm robot built on the humanoid template (includes legs)");
  if ((m = hit(RX.hexapod))) return { family: "hexapod", label: "hexapod", matched: m, build: () => hexapod("hexapod", prompt) };
  if ((m = hit(RX.octopod))) return { family: "hexapod", label: "hexapod", matched: m, approx: "eight legs approximated by the six-legged hexapod", build: () => hexapod("hexapod", prompt) };
  if ((m = hit(RX.roverArm))) return { family: "rover_arm", label: "mobile manipulator (wheeled rover + arm)", matched: m, usesDof: true, usesGripper: true,
    approx: mentions(t, RX.tracked) ? "tracks approximated by the wheeled rover base" : mentions(t, RX.mecanum) || mentions(t, RX.omni) ? "the arm is mounted on the wheeled rover base, not a mecanum base" : undefined,
    build: () => { const s = roverArm("rover_arm", dof ?? 6, prompt, { gripper: g === "none" ? "none" : "parallel" }); if (g === "suction") replaceGripperWithSuction(s); return s; } };
  if ((m = hit(RX.quadruped))) return { family: "quadruped", label: "quadruped", matched: m, build: () => quadruped("quadruped", prompt) };
  if ((m = hit(RX.scara))) return { family: "scara", label: "SCARA", matched: m, usesGripper: true,
    build: () => { const s = scara({ prompt }); const tip = explicitGripper && g !== "none" ? armTip(s) : undefined;
      if (tip) (g === "suction" ? attachSuctionGripper : attachParallelGripper)(s, tip.link, tip.atZ); return s; } };
  if ((m = hit(RX.mecanum))) return { family: "mecanum", label: "mecanum-wheel base", matched: m, build: () => mecanum("mecanum_robot", prompt) };
  if ((m = hit(RX.omni))) return { family: "mecanum", label: "mecanum-wheel base", matched: m, approx: "omni-directional drive built with mecanum wheels", build: () => mecanum("mecanum_robot", prompt) };
  if ((m = hit(RX.fourWheel))) return { family: "four_wheel", label: "four-wheel skid-steer base", matched: m, build: () => fourWheel("four_wheel_robot", prompt) };
  if ((m = hit(RX.tracked))) return { family: "four_wheel", label: "four-wheel skid-steer base", matched: m, approx: "tracks approximated by a four-wheel skid-steer base", build: () => fourWheel("four_wheel_robot", prompt) };
  if ((m = hit(RX.diffDrive))) return { family: "diff_drive", label: "differential-drive base", matched: m, build: () => diffDrive("diff_drive_robot", prompt) };
  if ((m = hit(RX.legs))) return { family: "quadruped", label: "quadruped", matched: m, build: () => quadruped("quadruped", prompt) };
  if ((m = hit(RX.wheels)) && !mentions(t, RX.arm)) return { family: "diff_drive", label: "differential-drive base", matched: m, build: () => diffDrive("diff_drive_robot", prompt) };
  if ((m = hit(RX.gripper)) && !mentions(t, RX.arm)) return { family: "gripper", label: `standalone ${g === "suction" ? "suction" : "parallel"} gripper`, matched: m, usesGripper: true,
    build: () => standaloneGripper(g === "suction" ? "suction" : "parallel", prompt) };
  if (mentions(t, RX.hand)) throw new Error("Dexterous robot hands are not supported yet. Try \"two-finger parallel gripper\" or a humanoid.");
  m = hit(RX.arm);
  if (!m && dof === undefined) throw new Error(`Robot type not recognised. ${SUPPORTED_HINT}`);
  const n = dof ?? 6;
  return { family: "serial_arm", label: `${n}-DOF serial arm`, matched: m ?? `${n} DOF`, usesDof: true, usesGripper: true,
    build: () => { const s = nDofArm(n, { name: `arm_${n}dof`, prompt, gripper: g === "none" ? "none" : "parallel" }); if (g === "suction") replaceGripperWithSuction(s); return s; } };
}

const ARM_FAMILIES = new Set(["serial_arm", "rover_arm", "scara"]);
/** templates with a generic structural material we may recolour (characters keep their livery) */
const RECOLOURABLE = new Set(["serial_arm", "rover_arm", "scara", "humanoid", "quadruped", "hexapod", "diff_drive", "four_wheel", "mecanum", "gripper"]);

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
  for (const x of masses) if (x !== payload) ignored.push(x.context === "payload" ? `payload ${x.raw}: only one payload is sized; using ${payload!.raw}` : `mass ${x.raw}: target robot mass is not adjustable; masses follow geometry and materials`);

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

const dofOf = (s: RobotSpecification) => s.joints.filter((j) => j.type !== "fixed").length;

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

function standaloneGripper(kind: "parallel" | "suction", prompt: string): RobotSpecification {
  const spec = nDofArm(0, { name: kind === "suction" ? "suction_gripper" : "parallel_gripper", prompt, gripper: "none" });
  // nDofArm(0) is just a base; attach the gripper to it
  const attach = "base_link";
  if (kind === "suction") attachSuctionGripper(spec, attach, 0.12);
  else attachParallelGripper(spec, attach, 0.12);
  spec.metadata.notes.push("Standalone gripper on a mount.");
  return spec;
}

// ---------------- geometry edits ----------------
const len3 = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
const NON_STRUCTURAL = new Set(["sensor", "joint_housing", "joint_mount", "contact_pad"]);

function geometryLength(g: Geometry): number | undefined {
  if (g.type === "cylinder" || g.type === "capsule") return g.length;
  if (g.type === "box") return g.size[2];
  if (g.type === "mesh") return g.bbox.max[2] - g.bbox.min[2];
  return undefined;
}

/** Stretch a geometry along its principal (z) axis; undefined when it cannot be stretched. */
function stretchGeometry(g: Geometry, f: number): Geometry | undefined {
  if (g.type === "cylinder" || g.type === "capsule") return { ...g, length: g.length * f };
  if (g.type === "box") return { ...g, size: [g.size[0], g.size[1], g.size[2] * f] };
  if (g.type === "mesh" && g.part === "arm_spar") {
    const s = g.scale ?? [1, 1, 1];
    return meshGeometry(g.part, g.file, g.params, [s[0], s[1], s[2] * f]);
  }
  return undefined;
}

/** Scale a link's length by f: its visual and collision geometry, its frame offset and
 *  every downstream joint offset, so the chain stays connected. */
function scaleLinkLength(spec: RobotSpecification, linkName: string, f: number): boolean {
  const l = spec.links.find((x) => x.name === linkName);
  if (!l) return false;
  const geometry = stretchGeometry(l.geometry, f);
  if (!geometry) return false;
  l.geometry = geometry;
  if (l.collision) l.collision = stretchGeometry(l.collision, f) ?? structuredClone(geometry);
  l.origin.xyz = l.origin.xyz.map((v) => v * f) as [number, number, number];
  l.mass *= f;            // volume (and mass at constant density) scales with length
  l.inertia = undefined;  // recomputed by finalize
  for (const j of spec.joints) if (j.parent === linkName) j.origin.xyz = j.origin.xyz.map((v) => v * f) as [number, number, number];
  return true;
}

function describeLen(spec: RobotSpecification, name: string): string {
  const l = spec.links.find((x) => x.name === name);
  const v = l && geometryLength(l.geometry);
  return v === undefined ? "?" : `${v.toFixed(3)}m`;
}

/** Joints from the root to `linkName`, in order. */
function chainTo(spec: RobotSpecification, linkName: string): Joint[] {
  const byChild = new Map(spec.joints.map((j) => [j.child, j]));
  const out: Joint[] = [];
  for (let j = byChild.get(linkName); j; j = byChild.get(j.parent)) out.unshift(j);
  return out;
}

const TOOL_LENGTH: Record<string, number> = { two_finger_gripper: ARM.gripper_palm[2] + ARM.finger[2], parallel_gripper: ARM.gripper_palm[2] + ARM.finger[2], suction_gripper: 0.04 };

interface ReachModel { reach: number; scalable: string[]; horizontal: boolean; }

/** Stretched reach from the first pitch axis (or, for all-vertical-axis SCARA arms, the
 *  base yaw axis in the horizontal plane) to the tool tip of the first end effector. */
function reachModel(spec: RobotSpecification): ReachModel | undefined {
  const ee = spec.end_effectors[0];
  const tip = ee ? spec.joints.find((j) => j.parent === ee.attach_link && spec.links.find((l) => l.name === j.child)?.role === "gripper")?.child ?? ee.attach_link
    : [...spec.links].reverse().find((l) => /^(?:wrist|forearm|link_)/.test(l.role ?? ""))?.name;
  if (!tip) return undefined;
  const chain = chainTo(spec, tip);
  const moving = chain.filter((j) => j.type === "revolute" || j.type === "continuous");
  if (!moving.length) return undefined;
  const horizontal = moving.every((j) => Math.abs(j.axis[2]) > 0.99);
  const start = horizontal ? chain.indexOf(moving[0]) : chain.findIndex((j) => (j.type === "revolute" || j.type === "continuous") && Math.abs(j.axis[2]) < 0.5);
  if (start < 0) return undefined;
  const after = chain.slice(start + 1);
  const size = (j: Joint) => horizontal ? Math.hypot(j.origin.xyz[0], j.origin.xyz[1]) : len3(j.origin.xyz);
  const reach = after.reduce((s, j) => s + size(j), 0) + (ee ? TOOL_LENGTH[ee.type] ?? 0 : 0);
  const roles = new Set(["shoulder", "upper_arm", "forearm"]);
  const scalable = chain.slice(start).map((j) => j.child).filter((c) => roles.has(spec.links.find((l) => l.name === c)?.role ?? "") && after.some((j) => j.parent === c && size(j) > 1e-6));
  return scalable.length ? { reach, scalable, horizontal } : undefined;
}

const REACH_LIMITS = { min: 0.15, max: 3 };
const MIN_SEGMENT = 0.05;

/** Rescale the upper arm/forearm so the stretched reach equals `target` metres. */
function setReach(spec: RobotSpecification, target: number): { ok: boolean; message: string } {
  const model = reachModel(spec);
  if (!model) return { ok: false, message: "this robot has no serial arm whose reach can be set" };
  const segLen = (name: string) => {
    const kids = spec.joints.filter((j) => j.parent === name && !NON_STRUCTURAL.has(spec.links.find((l) => l.name === j.child)?.role ?? ""));
    return Math.max(0, ...kids.map((j) => model.horizontal ? Math.hypot(j.origin.xyz[0], j.origin.xyz[1]) : len3(j.origin.xyz)));
  };
  const variable = model.scalable.reduce((s, n) => s + segLen(n), 0);
  const fixed = model.reach - variable;
  const clamped = Math.min(REACH_LIMITS.max, Math.max(REACH_LIMITS.min, target));
  const f = (clamped - fixed) / variable;
  const shortest = Math.min(...model.scalable.map(segLen).filter((v) => v > 0));
  if (!(f * shortest >= MIN_SEGMENT)) return { ok: false, message: `a ${target.toFixed(2)} m reach would leave the ${model.scalable.join("/")} under ${MIN_SEGMENT * 100} cm (the wrist, shoulder and tool alone span ${fixed.toFixed(2)} m)` };
  for (const n of model.scalable) scaleLinkLength(spec, n, f);
  const after = reachModel(spec)!.reach;
  const note = clamped !== target ? ` (requested ${target.toFixed(2)} m; supported ${REACH_LIMITS.min}–${REACH_LIMITS.max} m)` : "";
  return { ok: true, message: `reach ${after.toFixed(2)} m${note}` };
}

function applySizeDirectives(spec: RobotSpecification, t: string, family: string, lengths: Length[], stature: Length | undefined, dimensions: string[], ignored: string[]) {
  const isArm = ARM_FAMILIES.has(family);
  const sized = (words: string) => find(t, new RegExp(String.raw`\b(?:${words})\b[\s-]+(?:(?!with|for|on|to|that|and|or|parts?|objects?|boxes|items)[a-z0-9-]+[\s-]+){0,3}?${ROBOT_NOUN}\b`));
  const small = sized("small|mini|compact|tiny|desktop|miniature"), large = sized("large|big|huge|giant");
  const reachLen = lengths.find((l) => l.context === "reach") ?? (isArm ? lengths.find((l) => !l.context || l.context === "length") : undefined);
  const describe = (l: Length) => l.context === "position" ? "positions and part sizes are not modelled" : `overall ${l.context ?? "size"} is not adjustable for the ${family.replace(/_/g, " ")} template${isArm ? "; state a reach instead" : ""}`;
  if (!isArm && (small || large)) ignored.push(`"${(small ?? large)!.text.split(/[\s-]/)[0]}": the ${family.replace(/_/g, " ")} template has a fixed size`);
  if (isArm && !reachLen) {
    const scaleWord = small ? 0.7 : large ? 1.4 : undefined;
    if (scaleWord) {
      const model = reachModel(spec);
      if (model) { const r = setReach(spec, model.reach * scaleWord); if (r.ok) dimensions.push(`${small ? "small" : "large"}: ${r.message}`); }
    }
  }
  for (const l of lengths) {
    if (l === stature) continue;
    if (l === reachLen && isArm) {
      const current = reachModel(spec)?.reach;
      if (current !== undefined && ((l.bound === "max" && current <= l.metres) || (l.bound === "min" && current >= l.metres))) {
        dimensions.push(`reach ${current.toFixed(2)} m (${l.bound === "max" ? "within" : "meets"} the ${l.raw} limit)`);
        continue;
      }
      const r = setReach(spec, l.metres);
      if (r.ok) dimensions.push(r.message); else ignored.push(`${l.raw}: ${r.message}`);
    } else {
      const what = l.context && l.context !== "position" ? `${l.context} ${l.raw}` : l.raw;
      ignored.push(`${what}: ${describe(l)}`);
    }
  }
}

// ---------------- sensors ----------------
type Box3 = { min: Vec3; max: Vec3 };

/** Axis-aligned bounds of a geometry placed at `origin`, in the frame `origin` is expressed in. */
function placedBounds(g: Geometry, origin: Pose): Box3 {
  const half: Vec3 = g.type === "box" ? [g.size[0] / 2, g.size[1] / 2, g.size[2] / 2]
    : g.type === "cylinder" ? [g.radius, g.radius, g.length / 2]
    : g.type === "capsule" ? [g.radius, g.radius, g.length / 2 + g.radius]
    : g.type === "sphere" ? [g.radius, g.radius, g.radius] : [0, 0, 0];
  const lo: Vec3 = g.type === "mesh" ? g.bbox.min : [-half[0], -half[1], -half[2]];
  const hi: Vec3 = g.type === "mesh" ? g.bbox.max : half;
  const m = poseToMat(origin);
  const out: Box3 = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) {
    const p = [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
    for (let k = 0; k < 3; k++) { out.min[k] = Math.min(out.min[k], p[k]); out.max[k] = Math.max(out.max[k], p[k]); }
  }
  return out;
}

/** Outer envelope of a link together with the fixed housing panels that share its frame
 *  (a hollow chassis is a bottom plate plus lid and wall panels). */
export function bodyEnvelope(spec: RobotSpecification, name: string): Box3 {
  const l = spec.links.find((x) => x.name === name)!;
  const env = placedBounds(l.geometry, l.origin);
  for (const j of spec.joints) {
    if (j.parent !== name || j.type !== "fixed") continue;
    const c = spec.links.find((x) => x.name === j.child);
    if (c?.role !== "housing") continue;
    const b = placedBounds(c.geometry, { xyz: [c.origin.xyz[0] + j.origin.xyz[0], c.origin.xyz[1] + j.origin.xyz[1], c.origin.xyz[2] + j.origin.xyz[2]], rpy: c.origin.rpy });
    for (let k = 0; k < 3; k++) { env.min[k] = Math.min(env.min[k], b.min[k]); env.max[k] = Math.max(env.max[k], b.max[k]); }
  }
  return env;
}

const SENSOR_SIZE = { box: [0.04, 0.06, 0.03] as Vec3, lidar: { radius: 0.03, length: 0.05 } };
const MOUNT_CLEARANCE = 0.07;

/** Where a sensor sits on its parent's outer surface (never buried inside the body):
 *  IMUs inside the body centre, lidars on top, cameras on the front face of a head,
 *  on the side of a wrist, or on the top edge of a base. Top-surface spots avoid
 *  anything else mounted there (an arm's shoulder, another sensor). */
function mountPose(spec: RobotSpecification, parent: string, type: SensorType, onWrist: boolean): Pose {
  const env = bodyEnvelope(spec, parent);
  const mid = (k: number) => (env.min[k] + env.max[k]) / 2;
  if (type === "imu") return pose([mid(0), mid(1), mid(2)]);
  const lidar = type === "lidar";
  const [bx, , bz] = SENSOR_SIZE.box;
  if (onWrist) return pose([env.max[0] + (lidar ? SENSOR_SIZE.lidar.radius : bx / 2), mid(1), Math.max(mid(2), env.max[2] - 0.03)]);
  const head = /head|helmet|visor/.test(parent);
  if (head && !lidar) return pose([env.max[0] + bx / 2, mid(1), mid(2)]);
  const topZ = env.max[2] + (lidar ? 0 : bz / 2);
  const inset = lidar ? SENSOR_SIZE.lidar.radius : bx / 2;
  const front = env.max[0] - inset, rear = env.min[0] + inset, centre = mid(0);
  const spots = (lidar ? [centre, rear, front] : [front, centre, rear]).map((x) => [x, mid(1)] as const);
  const occupied = spec.joints.filter((j) => j.parent === parent && j.origin.xyz[2] > mid(2) && spec.links.find((c) => c.name === j.child)?.role !== "housing").map((j) => j.origin.xyz);
  const free = spots.find(([x, y]) => occupied.every((o) => Math.hypot(o[0] - x, o[1] - y) >= MOUNT_CLEARANCE));
  if (free) return pose([free[0], free[1], topZ]);
  // crowded top (a small arm base): hang the sensor on the front face instead
  return pose([env.max[0] + (lidar ? SENSOR_SIZE.lidar.radius : bx / 2), mid(1), mid(2) - (lidar ? SENSOR_SIZE.lidar.length / 2 : 0)]);
}

function addSensor(spec: RobotSpecification, type: SensorType, where: string): string[] {
  const changes: string[] = [];
  // choose attach link
  let parent = spec.links.find((l) => /head/.test(l.name))?.name;
  const wrist = /wrist|gripper|hand/.test(where);
  if (wrist) parent = spec.end_effectors[0]?.attach_link ?? [...spec.links].reverse().find((l) => /wrist|flange|tool/.test(l.name) && l.role !== "sensor")?.name ?? parent;
  if (/front|base|chassis/.test(where)) parent = spec.links.find((l) => l.role === "base")?.name ?? parent;
  parent ??= spec.links.find((l) => l.role === "base")?.name ?? spec.links[0]?.name;
  if (!parent) return changes;
  const index = Math.max(0, ...spec.sensors.filter((s) => s.type === type).map((s) => parseInt(s.name.split("_").pop() ?? "0", 10) || 0)) + 1;
  const sname = `${type}_${index}`;
  const geom: Geometry = type === "lidar" ? cyl(SENSOR_SIZE.lidar.radius, SENSOR_SIZE.lidar.length) : box(...SENSOR_SIZE.box);
  const lname = `${sname}_link`;
  const onWrist = wrist && /wrist|flange|tool|hand|gripper/.test(parent + " " + (spec.links.find((l) => l.name === parent)?.role ?? ""));
  const origin = mountPose(spec, parent, type, onWrist);
  spec.links.push(link(lname, geom, { material: "sensor_mat", role: "sensor", origin: pose([0, 0, geom.type === "cylinder" ? geom.length / 2 : 0]) }));
  spec.joints.push(joint(`${sname}_joint`, "fixed", parent, lname, { origin }));
  const sensor: Sensor = { name: sname, type, parent: lname, origin: pose(), params: {} };
  spec.sensors.push(sensor);
  changes.push(`+ Added link: ${lname}`);
  changes.push(`+ Added joint: ${sname}_joint`);
  changes.push(`+ Added ${type} sensor: ${sname} on ${parent}`);
  return changes;
}

/** Remove a sensor with its mount link and joint (and anything hanging off that link). */
function removeSensor(spec: RobotSpecification, s: Sensor): string[] {
  const doomed = subtreeLinks(spec, s.parent);
  const sensorJoint = spec.joints.find((j) => j.child === s.parent);
  const onlySensor = spec.links.find((l) => l.name === s.parent)?.role === "sensor";
  spec.sensors = spec.sensors.filter((x) => x !== s);
  if (!onlySensor) return [`- Removed ${s.type} sensor: ${s.name}`];
  spec.links = spec.links.filter((l) => !doomed.has(l.name));
  spec.joints = spec.joints.filter((j) => !doomed.has(j.child));
  spec.sensors = spec.sensors.filter((x) => !doomed.has(x.parent));
  return [`- Removed link: ${s.parent}`, ...(sensorJoint ? [`- Removed joint: ${sensorJoint.name}`] : []), `- Removed ${s.type} sensor: ${s.name}`];
}

function subtreeLinks(spec: RobotSpecification, root: string): Set<string> {
  const out = new Set<string>([root]);
  let grew = true;
  while (grew) { grew = false; for (const j of spec.joints) if (out.has(j.parent) && !out.has(j.child)) { out.add(j.child); grew = true; } }
  return out;
}

const SENSOR_WORDS: [RegExp, SensorType][] = [
  [/\blidars?\b|laser\s*scan(?:ner)?s?|\blaser\s+range/, "lidar"],
  [/\bdepth\b|rgb-?d\b|\bstereo\b|\b3d\s+camera|\btof\s+camera/, "depth"],
  [/\bcameras?\b|\bvision\b|\beyes?\b|\boptical\b|\bwebcam\b/, "camera"],
  [/\bimus?\b|\bgyro(?:scope)?s?\b|acceleromet\w*/, "imu"],
];

const UNMODELLED_SENSORS = /\bforce[\s/-]*(?:torque\s+)?sensors?\b|\bf\/t\s+sensors?\b|\bultrasonic(?:\s+sensors?)?|\bsonars?\b|\bgps\b|\bbumpers?(?:\s+sensors?)?|\binfrared(?:\s+sensors?)?|\bir\s+sensors?\b|\bthermal\s+cameras?\b|\bmicrophones?\b|\btactile\s+sensors?\b|\btouch\s+sensors?\b|\bproximity\s+sensors?\b|\bgas\s+sensors?\b|\btemperature\s+sensors?\b/;
const CAMERA_WORDS = /\bcameras?\b|\bvision\b|\beyes?\b|\boptical\b|\bwebcams?\b/;

/** "depth camera" / "stereo camera" is one depth sensor; "RGB-D camera" is colour + depth. */
function cameraHit(t: string): Hit | undefined {
  return findAll(t, CAMERA_WORDS).find((h) => !/\b(?:depth|stereo|3d|tof|thermal)\s+$/.test(t.slice(Math.max(0, h.index - 8), h.index)));
}

/** Where the text puts this sensor: "wrist camera", "lidar on the front", else `fallback`. */
function locationOf(t: string, hit: Hit, fallback: string): string {
  const before = t.slice(Math.max(0, hit.index - 20), hit.index).split(/[,;.]|\bbut\b|\band\b/).pop() ?? "";
  const after = t.slice(hit.index + hit.text.length, hit.index + hit.text.length + 30).split(/[,;.]|\bbut\b|\band\b|\bwith\b/)[0];
  const near = before + " " + after;
  if (/\b(?:wrist|gripper|end[\s-]?effector|hand|tool|eye[\s-]in[\s-]hand)\b/.test(near)) return "wrist";
  if (/\b(?:front|base|chassis|body|deck)\b/.test(near)) return "front";
  if (/\b(?:head|top|mast)\b/.test(near)) return "head";
  return fallback;
}

/** "two cameras", "a pair of lidars" (capped at 4). */
function countOf(t: string, hit: Hit): number {
  const m = t.slice(Math.max(0, hit.index - 18), hit.index).match(/\b(two|three|four|2|3|4|a pair of|pair of|dual|twin)\s+(?:[a-z-]+\s+)?$/);
  if (!m || !/s\b/.test(hit.text)) return 1;
  return ({ two: 2, three: 3, four: 4, "a pair of": 2, "pair of": 2, dual: 2, twin: 2 } as Record<string, number>)[m[1]] ?? Math.min(4, parseInt(m[1], 10));
}

function applyInlineSensors(spec: RobotSpecification, t: string): { type: SensorType; mount: string }[] {
  const out: { type: SensorType; mount: string }[] = [];
  const lidar = find(t, SENSOR_WORDS[0][0]), depth = find(t, SENSOR_WORDS[1][0]), camera = cameraHit(t), imu = find(t, SENSOR_WORDS[3][0]);
  const wants: [Hit | undefined, SensorType, string][] = [
    [lidar, "lidar", lidar && locationOf(t, lidar, "head")],
    [depth, "depth", depth && locationOf(t, depth, "head")],
    [camera, "camera", camera && locationOf(t, camera, "head")],
    [imu, "imu", "base"],
  ] as [Hit | undefined, SensorType, string][];
  for (const [hit, type, where] of wants) {
    if (!hit) continue;
    const want = countOf(t, hit), have = spec.sensors.filter((x) => x.type === type).length;
    for (let i = have; i < want || (i === 0 && have === 0); i++) addSensor(spec, type, where);   // templates that already carry the sensor win
    for (const s of spec.sensors.filter((x) => x.type === type).slice(0, Math.max(want, 1))) {
      out.push({ type, mount: spec.joints.find((j) => j.child === s.parent)?.parent ?? s.parent });
    }
  }
  // an explicit "no camera" removes a sensor a template would otherwise carry
  for (const [rx, type] of SENSOR_WORDS) if (negates(t, rx) && !out.some((o) => o.type === type))
    for (const s of spec.sensors.filter((x) => x.type === type)) removeSensor(spec, s);
  return out;
}

// ---------------- grippers ----------------
/** Replace every gripper (both hands on a humanoid) with a suction or parallel gripper. */
function swapGrippers(spec: RobotSpecification, to: "suction" | "parallel"): number {
  const { roots } = removeGripper(spec);
  for (const r of roots) {
    const prefix = r.parent.match(/^((?:left|right)_)/)?.[1] ?? "";
    (to === "suction" ? attachSuctionGripper : attachParallelGripper)(spec, r.parent, r.atZ, prefix);
  }
  return roots.length;
}

function replaceGripperWithSuction(spec: RobotSpecification): string[] {
  const n = swapGrippers(spec, "suction");
  return n ? [`~ Replaced ${n > 1 ? `${n} parallel grippers` : "parallel gripper"} with suction ${n > 1 ? "grippers" : "gripper"}`] : [];
}

/** Remove every gripper link (and pads/fingers under it). Returns where each was mounted. */
function removeGripper(spec: RobotSpecification): { removed: string[]; roots: { parent: string; atZ: number }[] } {
  const roots = spec.joints.filter((j) => spec.links.find((l) => l.name === j.child)?.role === "gripper" && spec.links.find((l) => l.name === j.parent)?.role !== "gripper");
  if (!roots.length) return { removed: [], roots: [] };
  const doomed = new Set<string>();
  for (const r of roots) for (const n of subtreeLinks(spec, r.child)) doomed.add(n);
  spec.links = spec.links.filter((l) => !doomed.has(l.name));
  spec.joints = spec.joints.filter((j) => !doomed.has(j.child));
  spec.sensors = spec.sensors.filter((s) => !doomed.has(s.parent));
  spec.end_effectors = spec.end_effectors.filter((e) => !roots.some((r) => r.parent === e.attach_link));
  return { removed: [...doomed], roots: roots.map((r) => ({ parent: r.parent, atZ: r.origin.xyz[2] })) };
}

/** Distal link of a single serial arm and the offset of its tip. */
function armTip(spec: RobotSpecification): { link: string; atZ: number } | undefined {
  const armRoles = /^(?:shoulder|upper_arm|forearm|wrist_\d(?:_b)?|link_\d+|elbow|wrist)$/;
  const arm = spec.links.filter((l) => armRoles.test(l.role ?? ""));
  const tips = arm.filter((l) => !spec.joints.some((j) => j.parent === l.name && armRoles.test(spec.links.find((c) => c.name === j.child)?.role ?? "")));
  if (tips.length !== 1) return undefined;
  const tip = tips[0], len = geometryLength(tip.geometry) ?? 0.05;
  return { link: tip.name, atZ: Math.sign(tip.origin.xyz[2] || 1) * len };
}

// ---------------- modification engine ----------------
export interface ModResult { spec: RobotSpecification; changes: string[]; }

const VERBS = String.raw`make|add|mount|attach|put|install|fit|include|give(?:\s+it)?|remove|delete|drop|take\s+off|get\s+rid\s+of|replace|swap|change|convert|turn|set|paint|colou?r|rename|call|name|scale|shorten|lengthen|extend|widen|increase|decrease|reduce|keep|leave|refit`;
const VERB = new RegExp(String.raw`^(${VERBS})\b`);
const POLITE = /^(?:(?:please|kindly|also|now|then|and)\s+|(?:can|could|would|will)\s+you\s+(?:please\s+)?|i(?:'d| would)\s+like\s+(?:you\s+)?to\s+|i\s+want\s+(?:you\s+)?to\s+|let's\s+)+/;
const RENAME = /\b(?:rename(?:\s+it)?|call\s+it|name\s+it|(?:change|set)\s+(?:the\s+|its\s+)?name\s+to)\s+(?:to\s+|as\s+)?/;
const REMOVE_VERB = /^(?:remove|delete|drop|take\s+off|get\s+rid\s+of)$/;
const ADD_VERB = /^(?:add|mount|attach|put|install|fit|include|give(?:\s+it)?)$/;

const TARGETS: [RegExp, string[]][] = [
  [/\bupper[\s_-]?arms?\b|\bhumerus\b/, ["upper_arm"]],
  [/\bfore[\s_-]?arms?\b|\blower\s+arms?\b/, ["forearm"]],
  [/\bwrists?\b/, ["wrist_1", "wrist_2", "wrist_3", "wrist"]],
  [/\bshoulders?\b/, ["shoulder"]],
];
const LEGS = /\blegs?\b|\bthighs?\b|\bshins?\b|\bcalf\b|\bcalves\b/;

/** Relative or absolute length request inside one clause. */
function lengthRequest(c: string): { factor?: number; deltaM?: number; absoluteM?: number; defaulted?: boolean } | undefined {
  const lengths = extractLengths(c).filter((l) => l.context !== "height");
  const shorter = /\b(?:shorter|smaller|shorten|reduce|decrease|narrower|less)\b/.test(c);
  const comparative = /\b(?:longer|shorter|bigger|smaller|larger|lengthen|shorten|extend|increase|decrease|reduce)\b/.test(c);
  const pct = c.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/);
  if (pct && comparative) { const p = parseFloat(pct[1]) / 100; return { factor: shorter ? 1 - p : 1 + p }; }
  if (lengths.length) {
    const l = lengths[0];
    if (/\bby\b/.test(c) || (comparative && !/\bto\b/.test(c))) return { deltaM: shorter ? -l.metres : l.metres };
    return { absoluteM: l.metres };
  }
  if (/\btwice\b|\bdouble\b|\b2x\b|\btwo\s+times\b/.test(c)) return { factor: 2 };
  if (/\bhalf\b|\bhalve\b/.test(c)) return { factor: 0.5 };
  const times = c.match(/(\d+(?:\.\d+)?)\s*(?:x|times)\b/);
  if (times) return { factor: parseFloat(times[1]) };
  if (comparative) return { factor: shorter ? 0.8 : 1.2, defaulted: true };
  return undefined;
}

/** Split "make the upper arm 50% longer and the forearm 10% shorter, then add a lidar" into
 *  clauses. A clause without its own verb inherits the previous one ("add a lidar and a camera");
 *  "the forearm and upper arm 10% longer" keeps its shared predicate; quoted text and names
 *  after "rename" are never split. */
export function splitClauses(instruction: string): string[] {
  const quotes: string[] = [];
  let text = normalize(instruction).replace(/"[^"]*"|(?<![a-z0-9])'[^']*'(?![a-z0-9])/g, (q) => `\u0000${quotes.push(q) - 1}\u0000`);
  text = text.replace(new RegExp(String.raw`\.\s*(?=(?:${VERBS})\b)`, "g"), "; ");
  const rename = RENAME.exec(text);
  let renameTail = "";
  if (rename) { renameTail = text.slice(rename.index); text = text.slice(0, rename.index); }
  const parts = text.split(/\s*(?:[;,]|\.\s|\bthen\b|\bbut\b|\balso\b)\s*|\s+and\s+(?!then\b)/)
    .map((p) => p.replace(POLITE, "").replace(/[?!.\s]+$/, "").replace(/\s+please$/, "").trim()).filter(Boolean);
  if (renameTail) parts.push(renameTail.replace(/[?!.\s]+$/, "").trim());
  const out: string[] = [];
  let verb = "";
  for (const p of parts) {
    const m = p.match(VERB);
    if (m) { verb = m[1]; out.push(p); }
    else out.push(verb ? `${verb} ${p}` : p);
  }
  // shared predicate: "make the forearm" + "make upper arm 10% longer" -> one clause
  for (let i = out.length - 2; i >= 0; i--) {
    const a = out[i], b = out[i + 1], v = a.match(VERB)?.[1];
    if (v && b.startsWith(v + " ") && TARGETS.some(([rx]) => rx.test(a)) && !lengthRequest(a) && lengthRequest(b))
      out.splice(i, 2, `${a} and ${b.slice(v.length + 1)}`);
  }
  return out.map((c) => c.replace(/\u0000(\d+)\u0000/g, (_, i) => quotes[+i]));
}

function linksByRoles(spec: RobotSpecification, roles: string[]): string[] {
  return spec.links.filter((l) => roles.includes(l.role ?? "") || roles.includes(l.name)).map((l) => l.name);
}

type Outcome = { changes: string[]; understood: boolean };
const isWearable = (spec: RobotSpecification) => spec.links.some((l) => l.name === "pelvis_frame");

function modifyLengths(spec: RobotSpecification, c: string): Outcome | undefined {
  if (!/\b(?:long|longer|short|shorter|length|lengthen|shorten|extend|reach|bigger|smaller|larger|size|scale|arms?|forearm|upper|wrist|legs?|twice|double|half|halve|times|\d+x)\b/.test(c)) return undefined;
  if (/\bwider\b|\bwide\b|\bnarrower\b/.test(c)) return undefined;
  const req = lengthRequest(c);
  if (!req) return undefined;
  if (isWearable(spec)) return { changes: ["! Suit limbs follow the wearer; say \"fit it to a 1.85 m wearer\""], understood: true };
  if (mentions(c, LEGS)) return { changes: ["! Resizing legs is not supported yet (it moves the feet and changes balance)"], understood: true };
  const changes: string[] = [];
  const explicit = TARGETS.filter(([rx]) => mentions(c, rx));
  const reachy = /\breach\b/.test(c) || (!explicit.length && (/\barms?\b|\bit\b|\brobot\b/.test(c) || !/\b(?:base|wheels?|head|torso|body|chassis)\b/.test(c)));
  const model = spec.end_effectors.length <= 1 ? reachModel(spec) : undefined;

  if (!explicit.length && reachy && model) {
    const target = req.absoluteM ?? (req.deltaM !== undefined ? model.reach + req.deltaM : model.reach * req.factor!);
    const before = model.reach;
    const r = setReach(spec, target);
    if (!r.ok) return { changes: [`! Cannot set reach: ${r.message}`], understood: true };
    changes.push(`~ reach ${before.toFixed(3)}m -> ${reachModel(spec)!.reach.toFixed(3)}m (${model.scalable.join(", ")} rescaled)${req.defaulted ? " — no amount given, used 20%" : ""}`);
    return { changes, understood: true };
  }
  const names = explicit.length ? explicit.flatMap(([, roles]) => linksByRoles(spec, roles)) : linksByRoles(spec, ["upper_arm", "forearm"]);
  if (!names.length) return { changes: [`! No ${explicit.length ? explicit[0][1][0].replace("_", " ") : "arm"} link to resize on this robot`], understood: true };
  const perSide = names.filter((x) => !x.startsWith("right_")).length;
  for (const n of names) {
    const cur = geometryLength(spec.links.find((l) => l.name === n)!.geometry);
    if (!cur) continue;
    let f = req.factor ?? 1;
    if (req.absoluteM !== undefined) f = req.absoluteM / cur;
    if (req.deltaM !== undefined) f = (cur + req.deltaM / perSide) / cur;
    const next = cur * f;
    if (!(next >= 0.02 && next <= 3)) { changes.push(`! ${n}: ${next.toFixed(3)} m is outside the 0.02–3 m range; unchanged`); continue; }
    const before = describeLen(spec, n);
    if (scaleLinkLength(spec, n, f)) changes.push(`~ ${n} length ${before} -> ${describeLen(spec, n)}${req.defaulted ? " (no amount given, used 20%)" : ""}`);
    else changes.push(`! ${n} is a sculpted part and cannot be resized`);
  }
  return { changes, understood: true };
}

function sensorTypesIn(c: string): SensorType[] {
  return SENSOR_WORDS.filter(([rx]) => mentions(c, rx)).map(([, type]) => type)
    .filter((type, _, all) => !(type === "camera" && all.includes("depth") && !/rgb-?d/.test(c) && /\b(?:depth|stereo|3d|tof)\s+cameras?\b/.test(c)));
}

function modifySensors(spec: RobotSpecification, c: string, verb: string): Outcome | undefined {
  const everything = /\b(?:everything|all\s+(?:the\s+)?sensors|every\s+sensor|all\s+of\s+them)\b/.test(c);
  let types = sensorTypesIn(c);
  if (REMOVE_VERB.test(verb) && everything) {
    const kept = new Set(SENSOR_WORDS.filter(([rx]) => negates(c, rx)).map(([, type]) => type));
    types = [...new Set(spec.sensors.map((x) => x.type))].filter((x) => !kept.has(x));
    if (!types.length) return { changes: ["! No sensors to remove"], understood: true };
  }
  if (!types.length) return undefined;
  const changes: string[] = [];
  if (REMOVE_VERB.test(verb)) {
    for (const type of types) {
      const matches = spec.sensors.filter((s) => s.type === type);
      if (!matches.length) changes.push(`! No ${type} to remove`);
      for (const s of matches) changes.push(...removeSensor(spec, s));
    }
    return { changes, understood: true };
  }
  if (ADD_VERB.test(verb)) {
    for (const type of types) {
      const hit = type === "camera" ? cameraHit(c) : find(c, SENSOR_WORDS.find(([, t]) => t === type)![0]);
      const where = hit ? locationOf(c, hit, "head") : "head";
      for (let i = 0; i < (hit ? countOf(c, hit) : 1); i++) changes.push(...addSensor(spec, type, where));
    }
    return { changes, understood: true };
  }
  return undefined;
}

function modifyGripper(spec: RobotSpecification, c: string, verb: string): Outcome | undefined {
  if (!/gripper|end[\s-]?effector|\bclaw\b|suction|vacuum|two[\s-]?finger|parallel\s+jaw/.test(c)) return undefined;
  const hasSuction = spec.end_effectors.some((e) => e.type === "suction_gripper");
  const hasParallel = spec.end_effectors.some((e) => e.type !== "suction_gripper");
  const wantsSuction = /suction|vacuum/.test(c) && !/(?:replace|swap|change)\s+(?:the\s+|both\s+)?(?:suction|vacuum)/.test(c);
  if (REMOVE_VERB.test(verb)) {
    const r = removeGripper(spec);
    return { changes: r.removed.length ? [`- Removed ${r.roots.length > 1 ? `${r.roots.length} grippers` : "gripper"} (${r.removed.length} links)`] : ["! No gripper to remove"], understood: true };
  }
  if (/^(?:replace|swap|change|convert|turn|make)$/.test(verb) || /\binstead\b/.test(c)) {
    if (wantsSuction && hasParallel) return { changes: replaceGripperWithSuction(spec), understood: true };
    if (!wantsSuction && hasSuction) {
      const n = swapGrippers(spec, "parallel");
      return { changes: [`~ Replaced ${n > 1 ? `${n} suction grippers` : "suction gripper"} with two-finger parallel ${n > 1 ? "grippers" : "gripper"}`], understood: true };
    }
    return { changes: [`! The gripper is already ${hasSuction ? "a suction gripper" : hasParallel ? "a parallel gripper" : "absent; try \"add a gripper\""}`], understood: true };
  }
  if (ADD_VERB.test(verb)) {
    if (spec.end_effectors.length) return { changes: ["! This robot already has a gripper; try \"replace the gripper with a suction cup\""], understood: true };
    const tip = armTip(spec);
    if (!tip) return { changes: ["! No single arm tip found to mount a gripper on"], understood: true };
    if (wantsSuction) attachSuctionGripper(spec, tip.link, tip.atZ); else attachParallelGripper(spec, tip.link, tip.atZ);
    return { changes: [`+ Added ${wantsSuction ? "suction" : "two-finger parallel"} gripper on ${tip.link}`], understood: true };
  }
  return undefined;
}

function isSerialArm(spec: RobotSpecification): boolean {
  return spec.metadata.notes.some((n) => /-DOF serial arm/.test(n)) && !spec.links.some((l) => l.role === "wheel");
}

const COUNT: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** "make it 7 DOF", "add two joints": regenerate a serial arm, keeping its gripper type, colour and sensors. */
function modifyDof(spec: RobotSpecification, c: string): { spec: RobotSpecification; outcome: Outcome } | undefined {
  const rel = c.match(/\b(add|remove|drop|delete)\s+(an?|one|two|three|four|five|six|\d+)\s+(?:more\s+|extra\s+)?(?:joints?|axes|axis|dof|degrees?\s+of\s+freedom)\b/)
    ?? c.match(/\b(add|give\s+it)\s+(an?|one|two|three|\d+)?\s*(?:more|extra|additional)\s+(?:joints?|axes|axis|dof)\b/);
  const raw = rel ? undefined : extractDofRaw(c);
  if (raw === undefined && !rel) return undefined;
  if (!isSerialArm(spec)) return { spec, outcome: { changes: ["! Changing DOF is supported for serial arms only"], understood: true } };
  const current = spec.joints.filter((j) => j.type === "revolute" && /^joint_\d+$/.test(j.name)).length;
  const delta = rel ? (COUNT[rel[2] ?? "one"] ?? parseInt(rel[2], 10)) * (/^(?:remove|drop|delete)$/.test(rel[1]) ? -1 : 1) : 0;
  const wanted = raw ?? current + delta;
  const target = Math.min(MAX_ARM_DOF, Math.max(1, wanted));
  if (target === current) return { spec, outcome: { changes: [`! The arm already has ${current} DOF${wanted !== target ? ` (supported range 1–${MAX_ARM_DOF})` : ""}`], understood: true } };
  const suction = spec.end_effectors.some((e) => e.type === "suction_gripper");
  const name = spec.robot_name === `arm_${current}dof` ? `arm_${target}dof` : spec.robot_name;
  const next = nDofArm(target, { name, prompt: spec.metadata.source_prompt, gripper: spec.end_effectors.length && !suction ? "parallel" : "none" });
  if (suction) { const tip = armTip(next); if (tip) attachSuctionGripper(next, tip.link, tip.atZ); }
  next.materials = structuredClone(spec.materials);
  for (const s of spec.sensors) {
    const mount = spec.joints.find((j) => j.child === s.parent)?.parent ?? "";
    addSensor(next, s.type, /wrist|gripper|tool/.test(mount) ? "wrist" : /base/.test(mount) ? "base" : "head");
  }
  const clamp = wanted !== target ? ` (${wanted} requested; supported range 1–${MAX_ARM_DOF})` : "";
  return { spec: next, outcome: { changes: [`~ Rebuilt as a ${target}-DOF arm (was ${current}-DOF)${clamp}; earlier length edits were reset`], understood: true } };
}

/** Family the spec was generated as, recovered from its prompt (characters keep their livery). */
function familyOf(spec: RobotSpecification): string | undefined {
  try { return spec.metadata.source_prompt ? chooseFamily(maskNames(spec.metadata.source_prompt), "", undefined, "parallel").family : undefined; }
  catch { return undefined; }
}

function modifyColour(spec: RobotSpecification, c: string): Outcome | undefined {
  const colour = extractColour(`${c} robot`) ?? c.match(new RegExp(String.raw`\b(${Object.keys(COLOURS).join("|")})\b`))?.[1];
  if (!colour || !/^(?:paint|colou?r|make|change|turn|set)\b/.test(c) || lengthRequest(c)) return undefined;
  if (/\b(?:camera|lidar|sensor|imu|gripper|wheels?|eyes?|visor)\b/.test(c)) return { changes: ["! Only the body colour can be changed; sensors, grippers and wheels keep theirs"], understood: true };
  const family = familyOf(spec);
  if (family && !RECOLOURABLE.has(family)) return { changes: [`! The ${family.replace(/_/g, " ")} keeps its own livery`], understood: true };
  const mat = spec.materials.find((x) => x.name === "link_mat");
  if (!mat) return { changes: [`! This robot has no generic body material to recolour`], understood: true };
  mat.color = [...COLOURS[colour]];
  return { changes: [`~ body colour -> ${colour}`], understood: true };
}

/** "fit it to a 1.85 m wearer": rebuild a suit from its prompt at the new stature. */
function modifyWearer(spec: RobotSpecification, c: string): { spec: RobotSpecification; outcome: Outcome } | undefined {
  const h = extractLengths(c).find((l) => l.context === "height");
  if (!h || !isWearable(spec) || !spec.metadata.source_prompt) return undefined;
  if (h.metres < 1.5 || h.metres > 2.05) return { spec, outcome: { changes: [`! Wearer height ${h.raw} is outside the supported 1.50–2.05 m range`], understood: true } };
  const source = spec.metadata.source_prompt;
  const stripped = extractLengths(source).filter((l) => l.context === "height").reduce((p, l) => p.replace(l.raw, ""), normalize(source));
  const { spec: next } = interpretPrompt(`${stripped} for a ${h.metres.toFixed(3)} m wearer`);
  next.robot_name = spec.robot_name;
  next.metadata.source_prompt = source;
  return { spec: next, outcome: { changes: [`~ Refitted the suit to a ${h.metres.toFixed(2)} m wearer (rebuilt from its prompt; audits cover the 1.75 m reference)`], understood: true } };
}

function modifyBase(spec: RobotSpecification, c: string): Outcome | undefined {
  if (!/\b(?:wider|wide|widen|narrower)\b/.test(c)) return undefined;
  const base = spec.links.find((l) => l.role === "base");
  const f = /narrower/.test(c) ? 1 / 1.3 : 1.3, word = f > 1 ? "widened" : "narrowed";
  if (base && base.geometry.type === "box") {
    base.geometry.size[0] *= f; base.geometry.size[1] *= f;
    if (base.collision?.type === "box") { base.collision.size[0] *= f; base.collision.size[1] *= f; }
    base.mass *= f * f; base.inertia = undefined;
    return { changes: [`~ base ${word} by 30%`], understood: true };
  }
  if (base && base.geometry.type === "cylinder") {
    base.geometry.radius *= f;
    if (base.collision?.type === "cylinder") base.collision.radius *= f;
    base.mass *= f * f; base.inertia = undefined;
    return { changes: [`~ base radius ${word} by 30%`], understood: true };
  }
  return { changes: ["! The base is a hollow machined chassis; its footprint cannot be widened yet"], understood: true };
}

/** Apply a natural-language modification to a spec (mutates a clone). */
export function applyModification(specIn: RobotSpecification, instruction: string): ModResult {
  let spec = structuredClone(specIn);
  const changes: string[] = [];
  const clauses = splitClauses(instruction);
  // "add a camera and a lidar to the wrist": a trailing location covers earlier clauses of the same verb
  const location = (c: string) => c.match(/\b(?:to|on|at)\s+(?:the\s+)?(wrist|gripper|end effector|hand|head|front|base|chassis)\b/)?.[1];
  for (let i = clauses.length - 2; i >= 0; i--) {
    const next = location(clauses[i + 1]), verb = clauses[i].match(VERB)?.[1];
    if (next && !location(clauses[i]) && verb && clauses[i + 1].startsWith(verb)) clauses[i] += ` on the ${next}`;
  }

  for (const c of clauses) {
    const verb = c.match(VERB)?.[1]?.replace(/\s+/g, " ") ?? "";
    const body = c.slice(verb.length).trim();
    let outcome: Outcome | undefined;
    // "…but not the upper arm", "keep the camera", "add a lidar, not a camera": explicit no-ops
    if (/^(?:keep|leave)$/.test(verb) || /^(?:not|except|excluding|without|never)\b/.test(body)) {
      changes.push(`= Left unchanged: ${body.replace(/^(?:not|except|excluding|without|never)\s+/, "") || "as requested"}`);
      continue;
    }
    const rename = RENAME.exec(c);
    if (rename) {
      const raw = c.slice(rename.index + rename[0].length).replace(/^["']|["']$/g, "").trim();
      const before = spec.robot_name;
      spec.robot_name = safeName(raw, spec.robot_name);
      changes.push(`~ renamed ${before} -> ${spec.robot_name}`);
      continue;
    }
    const budget = parseBudget(c).usd;
    if (budget !== undefined) changes.push(`~ budget $${budget} (BOM re-sized)`);
    const rest = budget !== undefined ? c.replace(/(?:with\s+)?(?:a\s+)?budget\b[^,;]*|\$\s*[\d,.]+\s*k?/g, "").trim() : c;
    if (rest !== c && !rest.replace(VERB, "").trim()) continue;
    { const w = modifyWearer(spec, rest); if (w) { spec = w.spec; outcome = w.outcome; } }
    if (!outcome) { const d = modifyDof(spec, rest); if (d) { spec = d.spec; outcome = d.outcome; } }
    outcome ??= modifyColour(spec, rest);
    outcome ??= modifySensors(spec, rest, verb);
    outcome ??= modifyGripper(spec, rest, verb);
    outcome ??= modifyBase(spec, rest);
    if (!outcome && /prismatic|linear\s+(?:joint|slide)|\bslider\b/.test(rest)) {
      const which = /elbow/.test(rest) ? "forearm" : /wrist/.test(rest) ? "wrist" : undefined;
      const cand = spec.joints.find((j) => which ? (j.child.includes(which) || j.parent.includes(which)) && j.type === "revolute" : false) ?? spec.joints.find((j) => j.type === "revolute");
      if (cand) { cand.type = "prismatic"; cand.limit = { lower: 0, upper: 0.2, effort: 80, velocity: 0.5 }; outcome = { changes: [`~ joint ${cand.name} changed to prismatic`], understood: true }; }
      else outcome = { changes: ["! No revolute joint to convert"], understood: true };
    }
    if (!outcome && /\badd\s+(?:\w+\s+)?wheels?\b/.test(rest)) {
      const base = spec.links.find((l) => l.role === "base")?.name;
      const added: string[] = [];
      if (base && !spec.links.some((l) => l.role === "wheel")) {
        for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
          const w = `added_${side}_wheel`;
          spec.links.push(link(w, cyl(0.06, 0.04), { material: "wheel_mat", role: "wheel", origin: pose([0, 0, 0], [Math.PI / 2, 0, 0]) }));
          spec.joints.push(joint(`${w}_joint`, "continuous", base, w, { origin: pose([0, sign * 0.18, 0]), axis: [0, 1, 0] }));
          added.push(`+ Added link: ${w}`);
        }
      }
      outcome = { changes: added.length ? added : ["! This robot already has wheels"], understood: true };
    }
    outcome ??= modifyLengths(spec, rest);
    if (outcome) changes.push(...outcome.changes);
    else if (budget === undefined) changes.push(`? Not understood: "${c}"`);
  }

  if (!changes.length) changes.push(`(no structural change matched "${instruction}")`);
  return { spec, changes };
}

/** parse a budget like "$500", "under 2000 dollars", "budget of 1.5k" (US dollars only) */
export function extractBudget(text: string): number | undefined {
  return parseBudget(text).usd;
}

/** Payload mass (kg) stated in the text, e.g. "lifts 2 kg", "5 kg payload". */
export function extractPayload(text: string): number | undefined {
  return extractMasses(text).find((m) => m.context === "payload")?.kg;
}

