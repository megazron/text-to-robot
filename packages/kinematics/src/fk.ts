// Forward kinematics: world transform of every link for a set of joint values.
import type { RobotSpecification, Joint, Vec3 } from "@ttr/robot-schema";
import { findRoot } from "@ttr/robot-schema";
import { type Mat4, identity, multiply, poseToMat, axisAngle, translation, position } from "./transforms.ts";

export type JointValues = Record<string, number>;

function jointMotion(j: Joint, value: number): Mat4 {
  switch (j.type) {
    case "revolute":
    case "continuous":
      return axisAngle(j.axis, value);
    case "prismatic": {
      const n = Math.hypot(...j.axis) || 1;
      const t: Vec3 = [(j.axis[0] / n) * value, (j.axis[1] / n) * value, (j.axis[2] / n) * value];
      return translation(t);
    }
    case "fixed":
      return identity();
  }
}

/** clamp a value to a joint's limits when it has them */
export function clampToLimit(j: Joint, value: number): number {
  if ((j.type === "revolute" || j.type === "prismatic") && j.limit && j.limit.lower !== undefined && j.limit.upper !== undefined) {
    return Math.min(j.limit.upper, Math.max(j.limit.lower, value));
  }
  return value;
}

export function forwardKinematics(spec: RobotSpecification, values: JointValues = {}): Map<string, Mat4> {
  const world = new Map<string, Mat4>();
  const { root } = findRoot(spec);
  if (!root) return world;
  world.set(root, identity());
  const childrenOf = new Map<string, Joint[]>();
  for (const j of spec.joints) {
    if (!childrenOf.has(j.parent)) childrenOf.set(j.parent, []);
    childrenOf.get(j.parent)!.push(j);
  }
  const stack: string[] = [root];
  const guard = new Set<string>();
  while (stack.length) {
    const parent = stack.pop()!;
    if (guard.has(parent)) continue;
    guard.add(parent);
    const pw = world.get(parent)!;
    for (const j of childrenOf.get(parent) ?? []) {
      const v = clampToLimit(j, values[j.name] ?? 0);
      const cw = multiply(multiply(pw, poseToMat(j.origin)), jointMotion(j, v));
      world.set(j.child, cw);
      stack.push(j.child);
    }
  }
  return world;
}

/** convenience: world-space position of each link origin */
export function linkPositions(spec: RobotSpecification, values: JointValues = {}): Record<string, Vec3> {
  const out: Record<string, Vec3> = {};
  for (const [name, m] of forwardKinematics(spec, values)) out[name] = position(m);
  return out;
}
