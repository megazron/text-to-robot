// Modification engine: applies a natural-language edit to an existing spec, clause by
// clause, and reports every change (+ added, - removed, ~ changed, ! refused, ? not understood).
import type { RobotSpecification, SensorType } from "@ttr/robot-schema";
import { safeName, pose } from "@ttr/robot-schema";
import { nDofArm, attachParallelGripper, attachSuctionGripper, cyl, link, joint } from "@ttr/robot-templates";
import { normalize, find, mentions, negates, extractDofRaw, extractLengths, parseBudget, extractColour, maskNames, COLOURS } from "./text.ts";
import { MAX_ARM_DOF, chooseFamily, RECOLOURABLE } from "./families.ts";
import { interpretPrompt } from "./interpret.ts";
import { translateKeywords } from "./lexicon.ts";
import { scaleLinkLength, describeLen, reachModel, setReach } from "./sizing.ts";
import { addSensor, removeSensor, SENSOR_WORDS, cameraHit, locationOf, countOf } from "./sensors.ts";
import { swapGrippers, replaceGripperWithSuction, removeGripper, armTip } from "./grippers.ts";
import { geometryLength, linksByRoles } from "./spec-utils.ts";

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
  try { return spec.metadata.source_prompt ? chooseFamily(translateKeywords(maskNames(spec.metadata.source_prompt)).text, "", undefined, "parallel").family : undefined; }
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

