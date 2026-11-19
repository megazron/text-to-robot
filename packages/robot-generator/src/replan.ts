// Modify as an edit of the robot's plan. A designed robot is read back into the plan that builds it (its body, wheels,
// arms and their joints, gripper, sensors, shell, colour, payload, budget), each clause of the change edits that plan,
// and the robot is designed again from it by the same parser and designers as a new prompt: "only 4 wheels" on a six-wheel
// rover gives a four-wheel rover with its drive, wiring, power, BOM, URDF, CAD and firmware made for four wheels, never a
// part stacked on the old one. Every field that changed is said ("~ 6 wheels -> 4 wheels"); what the new design could not
// do is said too ("!"). Used when a change needs a body the old design's own request cannot express (a wheel count its
// family does not have, more or fewer arms, a look added or taken off, a size); in-place edits stay in modify.ts.
import type { RobotSpecification } from "@ttr/robot-schema";
import { designOf, type ShellRequest } from "@ttr/design";
import { normalize, extractColour, extractDofRaw, extractMasses, parseBudget, COLOURS } from "./text.ts";
import { builtShape } from "./fidelity.ts";
import { readShell } from "./shape.ts";
import { MAX_ARM_DOF } from "./families.ts";

export type Base = "diff" | "three" | "four" | "mecanum" | "rover" | "quadruped" | "hexapod" | "humanoid" | "drone" | "arm" | "cell" | "torso";
export interface Plan {
  base: Base; wheels: number; arms: number[]; gripper: boolean; sensors: string[];
  shell?: ShellRequest & { said?: string }; colour?: string; payloadKg?: number; budget?: number; reachM?: number; heightM?: number;
}
const BASE_OF: Record<string, Base> = { mobile_diff_drive: "diff", mobile_skid_steer: "four", mobile_mecanum: "mecanum", mobile_rocker_bogie: "rover", quadruped: "quadruped", hexapod: "hexapod", humanoid: "humanoid", drone_quad: "drone", arm: "arm", arm_workcell: "cell" };
const NUM: Record<string, number> = { a: 1, an: 1, one: 1, single: 1, two: 2, both: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, another: 1, second: 1 };
const WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/** The plan a designed robot was built from, read back from its design record and its joints; undefined for other robots. */
export function planFromSpec(spec: RobotSpecification): Plan | undefined {
  const d = designOf(spec) as (ReturnType<typeof designOf> & { request?: Record<string, any> }) | undefined;
  let base = d ? BASE_OF[d.family] : undefined;
  if (!d || !base) return undefined;
  const b = builtShape(spec), req = (d.request ?? {}) as Record<string, any>, meta = spec.metadata as { colour?: string };
  if (base === "diff" && b.wheels === 3) base = "three";
  if (base === "cell" && req.layout === "torso") base = "torso";
  const sensors = [...new Set(((req.sensors as string[] | undefined) ?? spec.sensors.map((s) => s.type)).filter((s) => ["camera", "depth", "lidar", "imu"].includes(s)))].filter((s) => s !== "imu" || base === "arm");
  return { base, wheels: base === "rover" ? (Number(req.wheels ?? b.driven) >= 6 ? 6 : 4) : b.wheels, arms: b.arms.map((a) => a.dof),
    gripper: spec.end_effectors.length > 0, sensors, ...(req.shell ? { shell: req.shell } : {}), ...(meta.colour ? { colour: meta.colour } : {}),
    ...(req.payloadKg !== undefined && base !== "humanoid" ? { payloadKg: req.payloadKg } : {}), ...(req.budget !== undefined ? { budget: req.budget } : {}),
    ...(req.reachM !== undefined ? { reachM: req.reachM } : {}), ...(req.heightM !== undefined ? { heightM: req.heightM } : {}) };
}

/** The prompt that builds a plan (the parser reads it back exactly: tests/modify.test.ts holds it to that). */
export function planPrompt(p: Plan): string {
  const n = (k: number) => WORD[k] ?? String(k), arms = p.arms, dof = arms[0] ?? 6, same = arms.every((x) => x === dof);
  const armWords = arms.length === 1 ? `a ${dof} dof arm` : same ? `${n(arms.length)} ${dof} dof arms` : `${arms.length} arms (${arms.map((a) => `a ${a} dof`).join(" and ")})`;
  let body: string;
  switch (p.base) {
    case "arm": body = `a ${dof} dof robot arm`; break;
    case "cell": body = arms.length <= 1 ? `a ${dof} dof robot arm` : `${armWords.replace(/ arms/, " robot arms")} on a table`; break;
    case "torso": body = `a dual arm humanoid torso with ${dof} dof arms`; break;
    case "rover": body = `a ${n(p.wheels)} wheel rover${arms.length ? ` with ${armWords}` : ""}`; break;
    case "quadruped": body = `a quadruped${arms.length ? ` with ${armWords}` : ""}`; break;
    case "hexapod": body = "a hexapod"; break;
    case "humanoid": body = `a humanoid${arms.length ? `, ${dof} dof per arm` : ""}`; break;
    case "drone": body = "a quadcopter drone"; break;
    case "mecanum": body = "a mecanum wheel robot"; break;
    case "three": body = "a three wheel robot"; break;
    case "four": body = "a four wheel robot"; break;
    default: body = "a two wheel differential drive robot";
  }
  const parts = [body];
  const shell = p.shell ? `${p.shell.shape === "emoji" && p.shell.emoji ? p.shell.emoji : p.shell.shape} shaped${p.shell.style && p.shell.style !== "plain" ? `, ${p.shell.style}` : ""}` : "";
  if (shell) parts[0] = `${parts[0]}, ${shell}`;
  const withs = [...p.sensors.map((s) => (s === "depth" ? "a depth camera" : s === "imu" ? "an imu" : `a ${s}`))];
  if (["arm", "cell", "torso", "rover", "quadruped", "humanoid"].includes(p.base) && arms.length) withs.push(p.gripper ? "a gripper" : "no gripper");
  if (withs.length) parts.push(`with ${withs.join(" and ")}`);
  if (p.colour) parts.push(`painted ${p.colour}`);
  if (p.payloadKg !== undefined) parts.push(`carrying ${p.payloadKg} kg`);
  if (p.reachM !== undefined && ["arm", "cell"].includes(p.base)) parts.push(`with ${Math.round(p.reachM * 1000)} mm reach`);
  if (p.heightM !== undefined && p.base === "humanoid") parts.push(`${p.heightM.toFixed(2)} m tall`);
  if (p.budget !== undefined) parts.push(`budget $${p.budget}`);
  return parts.join(" ");
}

/** What changed between two plans, in words ("6 wheels -> 4 wheels", "colour -> red"). */
export function planDiff(a: Plan, b: Plan): string[] {
  const out: string[] = [];
  const baseName: Record<Base, string> = { diff: "two-wheel base", three: "three-wheel base", four: "four-wheel base", mecanum: "mecanum base", rover: "rover", quadruped: "quadruped", hexapod: "hexapod", humanoid: "humanoid", drone: "drone", arm: "arm", cell: "work cell", torso: "torso" };
  if (a.wheels !== b.wheels) out.push(`~ ${a.wheels} wheels -> ${b.wheels} wheels`);
  if (a.base !== b.base) out.push(`~ ${baseName[a.base]} -> ${baseName[b.base]}`);
  if (a.arms.length !== b.arms.length) out.push(`~ ${a.arms.length} arm${a.arms.length === 1 ? "" : "s"} -> ${b.arms.length} arm${b.arms.length === 1 ? "" : "s"}`);
  else if (a.arms.join() !== b.arms.join()) out.push(`~ ${a.arms.join(", ")} DOF -> ${b.arms.join(", ")} DOF`);
  if (a.gripper !== b.gripper && b.arms.length) out.push(b.gripper ? "+ gripper" : "- gripper");
  for (const s of b.sensors) if (!a.sensors.includes(s)) out.push(`+ ${s}`);
  for (const s of a.sensors) if (!b.sensors.includes(s)) out.push(`- ${s}`);
  const sh = (p: Plan) => (p.shell ? `${p.shell.shape === "emoji" ? `${p.shell.emoji} emoji` : p.shell.shape}${p.shell.style && p.shell.style !== "plain" ? ` (${p.shell.style})` : ""}` : "");
  if (sh(a) !== sh(b)) out.push(!b.shell ? `- ${sh(a)} shell` : !a.shell ? `+ ${sh(b)} shell` : `~ ${sh(a)} shell -> ${sh(b)} shell`);
  if (a.colour !== b.colour && b.colour) out.push(`~ colour -> ${b.colour}`);
  if (a.payloadKg !== b.payloadKg && b.payloadKg !== undefined) out.push(`~ payload -> ${b.payloadKg} kg`);
  if (a.budget !== b.budget && b.budget !== undefined) out.push(`~ budget -> $${b.budget}`);
  if (a.reachM !== b.reachM && b.reachM !== undefined) out.push(`~ reach -> ${Math.round(b.reachM * 1000)} mm`);
  if (a.heightM !== b.heightM && b.heightM !== undefined) out.push(`~ height -> ${b.heightM.toFixed(2)} m`);
  return out;
}

const count = (w: string | undefined) => (w === undefined ? undefined : NUM[w] ?? (Number.isFinite(parseInt(w, 10)) ? parseInt(w, 10) : undefined));
const NUMW = String.raw`(\d+|a|an|one|single|two|both|three|four|five|six|seven|eight|another|second)`;

/** A wheel count the clause asks for ("only 4 wheels", "make it 3 wheeled", "6 wheels instead"), or more / fewer. */
export function wheelAsk(c: string, cur: number): number | undefined {
  const m = c.match(new RegExp(String.raw`\b(\d+|two|three|four|five|six|eight)[\s-]+wheel(?:s|ed)?\b`));
  if (m && /\b(?:only|just|change|make|use|switch|convert|turn|set|instead|give|with|to|have|has|should|want)\b|^\s*(?:\d+|two|three|four|five|six|eight)[\s-]+wheel/.test(c)) return count(m[1]);
  if (/\b(?:remove|drop|take\s+off|fewer|less)\b[^,;]*\bwheels?\b/.test(c)) { const k = count(c.match(new RegExp(String.raw`\b(?:remove|drop|take\s+off)\s+${NUMW}\s+wheels?`))?.[1]) ?? (cur >= 6 ? 2 : 1); return Math.max(2, cur - k); }
  if (/\b(?:add|more|extra)\b[^,;]*\bwheels?\b/.test(c)) { const k = count(c.match(new RegExp(String.raw`\badd\s+${NUMW}\s+(?:more\s+|extra\s+)?wheels?`))?.[1]) ?? (cur >= 4 ? 2 : 1); return cur + k; }
  return undefined;
}
/** An arm count the clause asks for ("remove one arm", "add another arm", "make it 3 arms", "only one arm"). */
export function armAsk(c: string, cur: number): number | undefined {
  if (/\b(?:dof|joints?|axes|axis|degrees?)\b/.test(c) && !/\b\w+\s+arms\b/.test(c)) return undefined;
  const rm = c.match(new RegExp(String.raw`\b(?:remove|drop|delete|take\s+off|get\s+rid\s+of)\s+(?:the\s+)?${NUMW}?\s*(?:of\s+the\s+)?(?:left\s+|right\s+|extra\s+|second\s+)?arms?\b`));
  if (rm) return /\b(?:all|both)\b|\barms\b(?!\s+but)/.test(c) && !rm[1] ? 0 : Math.max(0, cur - (count(rm[1]) ?? 1));
  const add = c.match(new RegExp(String.raw`\b(?:add|attach|mount|give\s+it|put)\s+${NUMW}?\s*(?:more\s+|extra\s+|other\s+)?(?:robot(?:ic)?\s+)?arms?\b`));
  if (add) return cur + (count(add[1]) ?? 1);
  const set = c.match(new RegExp(String.raw`\b(?:only\s+|just\s+)?${NUMW}\s+(?:robot(?:ic)?\s+)?arms\b|\b(?:only|just)\s+(one|a\s+single|a)\s+arm\b`));
  if (set) return count((set[1] ?? set[2] ?? "").replace(/^a\s+single$/, "one"));
  return undefined;
}
/** "no shell", "remove the shape", "without the heart", "plain look": the look taken off. */
export const removesShell = (c: string, shell?: ShellRequest) => /\b(?:no|remove|without|drop|take\s+off|get\s+rid\s+of|delete)\s+(?:the\s+|its\s+|any\s+)?(?:shells?|shape|look|cover|costume|disguise)\b|\bplain\s+(?:look|robot)\b/.test(c)
  || (!!shell && new RegExp(String.raw`\b(?:remove|without|drop|take\s+off|no)\s+(?:the\s+)?${shell.shape}\b`).test(c));
/** "make it bigger", "twice as big", "20 % smaller": a size factor */
export function sizeAsk(c: string): number | undefined {
  if (!/\b(?:bigger|larger|smaller|tinier|big|large|small|size|scale|taller|shorter)\b/.test(c) || /\b(?:arm|forearm|upper|wrist|leg|wheel|base|deck|reach|battery|batteries|pack|motor|servo|camera|lidar|screen|gripper|head|budget|payload)s?\b/.test(c)) return undefined;
  const down = /\b(?:smaller|tinier|small|shorter|less|reduce|shrink)\b/.test(c), pct = c.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/);
  if (pct) return down ? 1 - parseFloat(pct[1]) / 100 : 1 + parseFloat(pct[1]) / 100;
  if (/\btwice\b|\bdouble\b|\b2x\b/.test(c)) return 2;
  if (/\bhalf\b|\bhalve\b/.test(c)) return 0.5;
  return down ? 0.8 : 1.25;
}

/** Edit a plan by one clause; returns what the clause did ("!" for what it could not), or undefined when it is not a plan edit. */
export function editPlan(p: Plan, clause: string, original: string): string[] | undefined {
  const c = normalize(clause);
  // a look: "make it look like a shoe", "heart shaped", "🦄", "no shell"
  if (removesShell(c, p.shell)) { if (!p.shell) return ["! It has no shell to take off"]; delete p.shell; return []; }
  const look = /\b(?:look|looks|looking|shaped|shape|style|styled|cartoon|cute|retro|steampunk|sleek|boxy)\b|\p{Extended_Pictographic}/u.test(clause) ? readShell(c, clause.trim()) : undefined;
  if (look) { p.shell = { shape: look.shape, style: look.style, ...(look.emoji ? { emoji: look.emoji } : {}) }; return look.note ? [`= ${look.note}`] : []; }
  const wheeled = ["diff", "three", "four", "mecanum", "rover"].includes(p.base), counted = /\b(?:\d+|two|three|four|five|six|eight)[\s-]+wheel/.test(c) && !/\b(?:add|remove|drop|more|fewer|less|extra|another|take\s+off)\b/.test(c);
  // (more or fewer: of the driven wheels, a two-wheel base's casters not counted)
  const w = /\bwheel/.test(c) && (wheeled || counted) ? wheelAsk(c, !counted && (p.base === "diff" || p.base === "three") ? 2 : p.wheels) : undefined;
  if (w !== undefined) {
    if (w <= 1) return [`! ${w === 1 ? "One wheel" : "No wheels"}: a robot cannot balance on ${w === 1 ? "one" : "none"} without a self-balancing controller; kept ${p.wheels}`];
    // a walking, flying or fixed robot asked for a number of wheels becomes a wheeled one (an arm rides on the rover)
    if (!wheeled) p.base = p.arms.length ? "rover" : "four";
    p.wheels = w;
    if (p.arms.length) { p.base = "rover"; if (w !== 4 && w !== 6) { p.wheels = w < 5 ? 4 : 6; return [`! a rover carrying an arm is designed on 4 or 6 wheels: built ${p.wheels}`]; } return []; }
    p.base = w === 2 ? "diff" : w === 3 ? "three" : w === 4 ? (p.base === "mecanum" ? "mecanum" : "four") : "rover";
    if (w >= 5 && w !== 6) { p.wheels = 6; return [`! ${w} wheels: the rover is designed with 4 or 6 wheels, built 6`]; }
    return [];
  }
  const a = /\barms?\b/.test(c) ? armAsk(c, p.arms.length) : undefined;
  if (a !== undefined) {
    const dof = p.arms[0] ?? 6;
    if (a === p.arms.length) return [`! It already has ${a} arm${a === 1 ? "" : "s"}`];
    if (p.base === "humanoid") return ["! A humanoid has its two arms by design"];
    if (p.base === "hexapod" || p.base === "drone") { if (a > 0) return [`! The ${p.base} has no mount for an arm; a quadruped or a rover carries one`]; return []; }
    if (p.base === "quadruped" && a > 1) { p.arms = [dof]; return ["! A quadruped carries one arm on its back: built one"]; }
    if (["diff", "three", "four", "mecanum"].includes(p.base) && a > 0) { p.base = "rover"; p.wheels = p.wheels >= 5 ? 6 : 6; }
    if (p.base === "rover" && a > 2) { p.arms = [dof, dof]; return ["! The rover's lid takes two arms side by side: built two (a work cell takes up to 4)"]; }
    if (p.base === "arm" || p.base === "cell" || p.base === "torso") { p.base = a <= 1 ? "arm" : "cell"; if (a > 4) { p.arms = Array(4).fill(dof); return ["! A work cell takes up to 4 arms: built 4"]; } if (a === 0) return ["! Removing the only arm leaves no robot; kept one"]; }
    if (!p.arms.length && a > 0) p.gripper = true;   // a new arm comes with its gripper
    p.arms = Array(a).fill(dof);
    if (!a && p.base === "rover") { /* a rover with no arm is the six-wheel rover */ }
    return [];
  }
  const size = sizeAsk(c);
  if (size !== undefined) {
    if (p.base === "humanoid") { const cur = p.heightM ?? 0.6, f = size > 1 ? Math.min(size, 1.1) : Math.max(size, 0.9); p.heightM = +Math.min(1.3, Math.max(0.5, cur * f)).toFixed(3); return f !== size ? [`! a humanoid grows or shrinks 10 % a step (its legs are re-sized each time): built ${p.heightM} m`] : []; }
    if (p.base === "arm" || p.base === "cell") { const cur = p.reachM ?? 0.42; p.reachM = +Math.min(0.8, Math.max(0.15, cur * size)).toFixed(3); return []; }
    if (p.shell) { return [`! The ${p.base === "drone" ? "drone" : "base"} is sized from what it carries, so it is not made bigger; its shell follows it. "carry 3 kg" sizes the drive and the deck for a load`]; }
    return [`! A ${p.base === "drone" ? "drone" : "wheeled base"} is sized from its parts and what it carries, not by a scale: say what it should carry ("carry 3 kg") and it is designed for that`];
  }
  // the colour, the joints of the arms, sensors and the gripper, payload and budget: the in-place edits do these when no
  // other clause needs a new body; here they go into the plan with the rest
  const col = extractColour(`${c} robot`) ?? c.match(new RegExp(String.raw`\b(${Object.keys(COLOURS).join("|")})\b`))?.[1];
  if (col && /\b(?:paint|colou?r|make|change|turn|set|red|blue|green|yellow|orange|black|white|purple|pink|grey|gray|silver|gold)\b/.test(c) && !/\b(?:camera|lidar|eyes?|leds?|lights?)\b/.test(c)) { p.colour = col; return []; }
  const dof = extractDofRaw(c);
  if (dof !== undefined && p.arms.length) { const t = Math.min(MAX_ARM_DOF, Math.max(1, Math.round(dof))); p.arms = p.arms.map(() => t); return t !== dof ? [`! ${dof} DOF: arms are built with 1 to ${MAX_ARM_DOF} joints, built ${t}`] : []; }
  if (/\bgripper|claw|end[\s-]?effector\b/.test(c)) {
    if (!p.arms.length) return ["! It has no arm to hold a gripper"];
    p.gripper = !/\b(?:remove|drop|delete|without|no|take\s+off)\b/.test(c); return [];
  }
  const sensor = c.match(/\b(depth\s+camera|camera|lidar|imu)\b/)?.[1];
  if (sensor && /\b(?:add|remove|drop|delete|without|no|mount|put|give|take\s+off)\b/.test(c)) {
    const s = sensor.startsWith("depth") ? "depth" : sensor;
    if (/\b(?:remove|drop|delete|without|no|take\s+off)\b/.test(c)) p.sensors = p.sensors.filter((x) => x !== s); else if (!p.sensors.includes(s)) p.sensors.push(s);
    return [];
  }
  const kg = extractMasses(c).find((x) => x.context === "payload") ?? (/\b(?:carry|lift|hold|payload)\b/.test(c) ? extractMasses(c)[0] : undefined);
  if (kg) { p.payloadKg = +kg.kg.toFixed(3); return []; }
  const usd = parseBudget(c).usd;
  if (usd !== undefined) { p.budget = usd; return []; }
  void original;
  return undefined;
}

/** Whether a clause needs a new body (a plan edit) rather than an edit of the design in place. */
export function needsReplan(p: Plan, clause: string, inPlaceWheels: number[]): boolean {
  const c = normalize(clause);
  if (removesShell(c, p.shell)) return true;
  if (/\b(?:look|looks|looking|shaped|shape|styled)\b|\p{Extended_Pictographic}/u.test(clause) && readShell(c, clause.trim())) return true;
  const wheeled = ["diff", "three", "four", "mecanum", "rover"].includes(p.base), counted = /\b(?:\d+|two|three|four|five|six|eight)[\s-]+wheel/.test(c) && !/\b(?:add|remove|drop|more|fewer|less|extra|another|take\s+off)\b/.test(c);
  const w = /\bwheel/.test(c) && (wheeled || counted) ? wheelAsk(c, !counted && (p.base === "diff" || p.base === "three") ? 2 : p.wheels) : undefined;
  const now = !counted && (p.base === "diff" || p.base === "three") ? 2 : p.wheels;
  if (w !== undefined && w > 1 && w !== now && !inPlaceWheels.includes(w)) return true;
  if (/\barms?\b/.test(c) && armAsk(c, p.arms.length) !== undefined) return true;
  if (sizeAsk(c) !== undefined && p.base === "humanoid") return true;
  return false;
}
