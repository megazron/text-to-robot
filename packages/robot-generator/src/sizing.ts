// Size directives: reach, link lengths and size words, applied to template geometry.
import type { RobotSpecification, Geometry, Joint } from "@ttr/robot-schema";
import { ARM } from "@ttr/robot-schema";
import { meshGeometry } from "@ttr/mesh";
import { find, ROBOT_NOUN, type Length } from "./text.ts";
import { ARM_FAMILIES } from "./families.ts";
import { len3, geometryLength, chainTo } from "./spec-utils.ts";

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
export function setReach(spec: RobotSpecification, target: number): { ok: boolean; message: string } {
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
  if (!(f * shortest >= MIN_SEGMENT)) {
    const message = `a ${target.toFixed(2)} m reach would leave the ${model.scalable.join("/")} under ${MIN_SEGMENT * 100} cm`
      + ` (the wrist, shoulder and tool alone span ${fixed.toFixed(2)} m)`;
    return { ok: false, message };
  }
  for (const n of model.scalable) scaleLinkLength(spec, n, f);
  const after = reachModel(spec)!.reach;
  const note = clamped !== target ? ` (requested ${target.toFixed(2)} m; supported ${REACH_LIMITS.min}–${REACH_LIMITS.max} m)` : "";
  return { ok: true, message: `reach ${after.toFixed(2)} m${note}` };
}

export function applySizeDirectives(spec: RobotSpecification, t: string, family: string, lengths: Length[], stature: Length | undefined, dimensions: string[], ignored: string[]) {
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
