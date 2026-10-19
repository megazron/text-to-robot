// Size directives: reach, link lengths and size words, applied to template geometry.
import type { RobotSpecification, Geometry, Joint, Vec3 } from "@ttr/robot-schema";
import { forwardKinematics, multiply, poseToMat } from "@ttr/kinematics";
import { ARM } from "@ttr/robot-schema";
import { meshGeometry } from "@ttr/mesh";
import { find, ROBOT_NOUN, type Length } from "./text.ts";
import { ARM_FAMILIES } from "./families.ts";
import { len3, geometryLength, chainTo } from "./spec-utils.ts";
import { placedBounds } from "./sensors.ts";

export const NON_STRUCTURAL = new Set(["sensor", "joint_housing", "joint_mount", "contact_pad"]);

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
export function scaleLinkLength(spec: RobotSpecification, linkName: string, f: number): boolean {
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

export function describeLen(spec: RobotSpecification, name: string): string {
  const l = spec.links.find((x) => x.name === name);
  const v = l && geometryLength(l.geometry);
  return v === undefined ? "?" : `${v.toFixed(3)}m`;
}

const TOOL_LENGTH: Record<string, number> = { two_finger_gripper: ARM.gripper_palm[2] + ARM.finger[2], parallel_gripper: ARM.gripper_palm[2] + ARM.finger[2], suction_gripper: 0.04 };

interface ReachModel { reach: number; scalable: string[]; horizontal: boolean; }

/** Stretched reach from the first pitch axis (or, for all-vertical-axis SCARA arms, the
 *  base yaw axis in the horizontal plane) to the tool tip of the first end effector. */
export function reachModel(spec: RobotSpecification): ReachModel | undefined {
  const designed = (spec.metadata as { design?: { performance?: { reach_m?: unknown } } }).design?.performance?.reach_m;
  if (typeof designed === "number") return { reach: designed, scalable: [] } as unknown as ReachModel;
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

export interface ReachResult { ok: boolean; message: string; /** built at the nearest feasible reach instead */ approximate?: boolean; }

/** Rescale the upper arm/forearm so the stretched reach equals `target` metres. With
 *  `nearest`, a reach too short for the template is built at the shortest feasible one. */
export function setReach(spec: RobotSpecification, target: number, opts: { nearest?: boolean } = {}): ReachResult {
  const model = reachModel(spec);
  if (!model) return { ok: false, message: "this robot has no serial arm whose reach can be set" };
  const segLen = (name: string) => {
    const kids = spec.joints.filter((j) => j.parent === name && !NON_STRUCTURAL.has(spec.links.find((l) => l.name === j.child)?.role ?? ""));
    return Math.max(0, ...kids.map((j) => model.horizontal ? Math.hypot(j.origin.xyz[0], j.origin.xyz[1]) : len3(j.origin.xyz)));
  };
  const variable = model.scalable.reduce((s, n) => s + segLen(n), 0);
  const fixed = model.reach - variable;
  const clamped = Math.min(REACH_LIMITS.max, Math.max(REACH_LIMITS.min, target));
  let f = (clamped - fixed) / variable;
  const shortest = Math.min(...model.scalable.map(segLen).filter((v) => v > 0));
  const tooShort = !(f * shortest >= MIN_SEGMENT);
  if (tooShort && !opts.nearest) {
    const message = `a ${target.toFixed(2)} m reach would leave the ${model.scalable.join("/")} under ${MIN_SEGMENT * 100} cm`
      + ` (the wrist, shoulder and tool alone span ${fixed.toFixed(2)} m)`;
    return { ok: false, message };
  }
  if (tooShort) f = MIN_SEGMENT / shortest;
  for (const n of model.scalable) scaleLinkLength(spec, n, f);
  const after = reachModel(spec)!.reach;
  if (tooShort) {
    return { ok: true, approximate: true, message: `reach ${after.toFixed(2)} m, the shortest this arm template allows (${target.toFixed(2)} m requested;`
      + ` the shoulder, wrist and tool alone span ${fixed.toFixed(2)} m)` };
  }
  const note = clamped !== target ? ` (requested ${target.toFixed(2)} m; supported ${REACH_LIMITS.min}–${REACH_LIMITS.max} m)` : "";
  return { ok: true, message: `reach ${after.toFixed(2)} m${note}` };
}

/** Set every scalable arm segment (upper arm, forearm, ...) to `metres` long. */
function setLinkLengths(spec: RobotSpecification, metres: number): ReachResult & { kept?: string[] } {
  const model = reachModel(spec);
  if (!model) return { ok: false, message: "this robot has no serial arm whose link lengths can be set" };
  if (!(metres >= 0.02 && metres <= 1.5)) return { ok: false, message: `${metres.toFixed(3)} m is outside the supported 0.02–1.5 m per-link range` };
  for (const n of model.scalable) {
    const cur = geometryLength(spec.links.find((l) => l.name === n)!.geometry);
    if (cur) scaleLinkLength(spec, n, metres / cur);
  }
  const armRoles = /^(?:shoulder|upper_arm|forearm|wrist_\d(?:_b)?|link_\d+)$/;
  const kept = spec.links.filter((l) => armRoles.test(l.role ?? "") && !model.scalable.includes(l.name)).map((l) => l.name);
  return { ok: true, kept, message: `${model.scalable.join(", ")} ${metres.toFixed(2)} m each; reach ${reachModel(spec)!.reach.toFixed(2)} m` };
}

/** Overall extent [x, y, z] of the robot in its home pose, in metres. */
export function overallSize(spec: RobotSpecification): Vec3 {
  const frames = forwardKinematics(spec);
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const l of spec.links) {
    const frame = frames.get(l.name);
    if (!frame) continue;
    const b = placedBounds(l.geometry, multiply(frame, poseToMat(l.origin)));
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.min[k]); hi[k] = Math.max(hi[k], b.max[k]); }
  }
  return [0, 1, 2].map((k) => Number.isFinite(hi[k] - lo[k]) ? hi[k] - lo[k] : 0) as Vec3;
}

/** Outcome lists the size directives write into (shared with the Interpretation). */
export interface SizeNotes { dimensions: string[]; approximations: string[]; ignored: string[]; conflicts: string[]; }

const SMALL = "small|mini|compact|tiny|desktop|miniature", LARGE = "large|big|huge|giant";

/** "each link 25 cm", "links of 30 cm", "25 cm per link". */
function isPerLink(t: string, l: Length): boolean {
  if (!/\b(?:links?|segments?)\b/.test(t)) return false;
  const before = t.slice(Math.max(0, l.index - 28), l.index), after = t.slice(l.index + l.raw.length, l.index + l.raw.length + 28);
  return /\beach\b[^,;.]*$|\b(?:per|every)\s+(?:link|segment)\b[^,;.]*$|\b(?:links?|segments?)\s+(?:of|are|is|at)\s*(?:about\s+)?$/.test(before)
    || /^\s*(?:long\s+)?(?:each|per\s+(?:link|segment)|(?:long\s+)?links?|segments?)\b/.test(after);
}

/** Apply reach, per-link length and size words; report every length that cannot be honoured. */
export function applySizeDirectives(spec: RobotSpecification, t: string, family: string, label: string, lengths: Length[], stature: Length | undefined, notes: SizeNotes) {
  const { dimensions, approximations, ignored, conflicts } = notes;
  const isArm = ARM_FAMILIES.has(family);
  const sized = (words: string) => find(t, new RegExp(String.raw`\b(?:${words})\b[\s-]+(?:(?!with|for|on|to|that|and|or|parts?|objects?|boxes|items)[a-z0-9-]+[\s-]+){0,3}?${ROBOT_NOUN}\b`));
  const small = sized(SMALL), large = sized(LARGE);
  const word = (h: { text: string }) => h.text.split(/[\s-]/)[0];
  if (small && large) conflicts.push(`"${word(small)}" and "${word(large)}" contradict each other; used "${word(small)}"`);
  const perLink = isArm ? lengths.find((l) => isPerLink(t, l)) : undefined;
  // An explicitly stated reach wins over every other length.
  const reaches = lengths.filter((l) => l.context === "reach");
  const reachLen = reaches[0] ?? (isArm ? lengths.find((l) => l !== perLink && (!l.context || l.context === "length")) : undefined);
  const size = () => overallSize(spec);
  const builtAt = (ctx: Length["context"]) => {
    const [x, y, z] = size();
    return ctx === "height" ? `${z.toFixed(2)} m tall` : ctx === "width" ? `${y.toFixed(2)} m wide` : ctx === "length" ? `${x.toFixed(2)} m long` : `${Math.max(x, y, z).toFixed(2)} m across`;
  };
  const describe = (l: Length) => {
    if (l.context === "position") return "positions and part sizes are not modelled";
    if (isArm) return `the ${label}'s overall ${l.context ?? "size"} cannot be set; only its reach and link lengths can`;
    return `the ${label} template has a fixed size (built about ${builtAt(l.context)}); scaling to a stated size is not supported`;
  };
  if (!isArm && (small || large)) ignored.push(`"${word((small ?? large)!)}": the ${family.replace(/_/g, " ")} template has a fixed size`);
  if (isArm && !reachLen && !perLink) {
    const scaleWord = small ? 0.7 : large ? 1.4 : undefined;
    if (scaleWord) {
      const model = reachModel(spec);
      if (model) { const r = setReach(spec, model.reach * scaleWord); if (r.ok) dimensions.push(`${small ? "small" : "large"}: ${r.message}`); }
    }
  }
  for (const l of lengths) {
    if (l === stature) continue;
    if (l === perLink) {
      if (reachLen) { ignored.push(`each link ${l.raw}: the stated reach ${reachLen.raw} takes precedence over per-link lengths`); continue; }
      const r = setLinkLengths(spec, l.metres);
      if (!r.ok) { ignored.push(`each link ${l.raw}: ${r.message}`); continue; }
      dimensions.push(r.message);
      if (r.kept?.length) approximations.push(`each link ${l.raw}: ${r.kept.join(", ")} keep${r.kept.length === 1 ? "s" : ""} the template length (only the main arm segments are resized)`);
    } else if (l === reachLen && isArm) {
      const current = reachModel(spec)?.reach;
      if (current !== undefined && ((l.bound === "max" && current <= l.metres) || (l.bound === "min" && current >= l.metres))) {
        dimensions.push(`reach ${current.toFixed(2)} m (${l.bound === "max" ? "within" : "meets"} the ${l.raw} limit)`);
        continue;
      }
      const r = setReach(spec, l.metres, { nearest: true });
      if (!r.ok) ignored.push(`${l.raw}: ${r.message}`);
      else if (r.approximate) { dimensions.push(`reach ${reachModel(spec)!.reach.toFixed(2)} m`); approximations.push(`${l.raw}: ${r.message}`); }
      else dimensions.push(r.message);
    } else if (l.context === "reach" && reachLen && isArm) {
      conflicts.push(`reach ${l.raw} contradicts the earlier reach ${reachLen.raw}; used ${reachLen.raw}`);
    } else {
      const what = l.context && l.context !== "position" ? `${l.context} ${l.raw}` : l.raw;
      ignored.push(`${what}: ${describe(l)}`);
    }
  }
}

/** Size words for designed arms: they become design inputs (reach, segment lengths) rather than
 *  rescaled geometry. Returns the inputs plus the notes; `report` adds what was actually built. */
export function designedSizes(t: string, label: string, lengths: Length[], stature: Length | undefined, notes: SizeNotes) {
  const { dimensions, ignored, conflicts } = notes;
  const sized = (words: string) => find(t, new RegExp(String.raw`\b(?:${words})\b[\s-]+(?:(?!with|for|on|to|that|and|or|parts?|objects?|boxes|items)[a-z0-9-]+[\s-]+){0,3}?${ROBOT_NOUN}\b`));
  const small = sized(SMALL), large = sized(LARGE);
  const word = (h: { text: string }) => h.text.split(/[\s-]/)[0];
  if (small && large) conflicts.push(`"${word(small)}" and "${word(large)}" contradict each other; used "${word(small)}"`);
  const perLink = lengths.find((l) => isPerLink(t, l));
  const reaches = lengths.filter((l) => l.context === "reach");
  const reachLen = reaches[0] ?? lengths.find((l) => l !== perLink && l !== stature && (!l.context || l.context === "length"));
  const out: { reachM?: number; segments?: { upper_arm: number; forearm: number }; requested?: Length; limit?: Length; word?: string } = {};
  if (!reachLen && !perLink && (small || large)) { out.reachM = small ? 0.25 : 0.65; out.word = small ? "small" : "large"; }
  for (const l of lengths) {
    if (l === stature) continue;
    if (l === perLink) {
      if (reachLen) { ignored.push(`each link ${l.raw}: the stated reach ${reachLen.raw} takes precedence over per-link lengths`); continue; }
      if (l.metres < 0.06 || l.metres > 1.2) { ignored.push(`each link ${l.raw}: outside the supported 0.06–1.2 m per link`); continue; }
      out.segments = { upper_arm: l.metres, forearm: l.metres };
      dimensions.push(`upper_arm, forearm ${l.metres.toFixed(2)} m each`);
    } else if (l === reachLen) {
      if (l.bound) out.limit = l; else { out.reachM = l.metres; out.requested = l; }
    } else if (l.context === "reach") {
      conflicts.push(`reach ${l.raw} contradicts the earlier reach ${reachLen!.raw}; used ${reachLen!.raw}`);
    } else {
      const what = l.context && l.context !== "position" ? `${l.context} ${l.raw}` : l.raw;
      ignored.push(`${what}: ${l.context === "position" ? "positions and part sizes are not modelled" : `the ${label}'s overall ${l.context ?? "size"} cannot be set; only its reach and link lengths can`}`);
    }
  }
  return out;
}
/** After design: record the reach that was built against what was asked. */
export function reportDesignedReach(spec: RobotSpecification, asked: ReturnType<typeof designedSizes>, notes: SizeNotes) {
  const built = reachModel(spec)?.reach;
  if (built === undefined) return;
  if (asked.word) notes.dimensions.push(`${asked.word}: reach ${built.toFixed(2)} m`);
  if (asked.limit) {
    const l = asked.limit, ok = l.bound === "max" ? built <= l.metres : built >= l.metres;
    if (ok) notes.dimensions.push(`reach ${built.toFixed(2)} m (${l.bound === "max" ? "within" : "meets"} the ${l.raw} limit)`);
    else notes.approximations.push(`${l.raw} limit: built reach ${built.toFixed(2)} m`);
  }
  if (!asked.requested) return;
  const l = asked.requested;
  if (Math.abs(built - l.metres) <= 0.02) { notes.dimensions.push(`reach ${built.toFixed(2)} m`); return; }
  notes.dimensions.push(`reach ${built.toFixed(2)} m`);
  notes.approximations.push(`${l.raw}: reach ${built.toFixed(2)} m, the ${built > l.metres ? "shortest" : "longest"} this arm design allows (actuator bodies set the spacing)`);
}
