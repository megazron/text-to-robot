// Gripper swaps, removal and arm-tip lookup shared by generation and modification.
import type { RobotSpecification } from "@ttr/robot-schema";
import { attachParallelGripper, attachSuctionGripper } from "@ttr/robot-templates";
import { geometryLength, subtreeLinks } from "./spec-utils.ts";

/** Replace every gripper (both hands on a humanoid) with a suction or parallel gripper. */
export function swapGrippers(spec: RobotSpecification, to: "suction" | "parallel"): number {
  const { roots } = removeGripper(spec);
  for (const r of roots) {
    const prefix = r.parent.match(/^((?:left|right)_)/)?.[1] ?? "";
    (to === "suction" ? attachSuctionGripper : attachParallelGripper)(spec, r.parent, r.atZ, prefix);
  }
  return roots.length;
}

export function replaceGripperWithSuction(spec: RobotSpecification): string[] {
  const n = swapGrippers(spec, "suction");
  return n ? [`~ Replaced ${n > 1 ? `${n} parallel grippers` : "parallel gripper"} with suction ${n > 1 ? "grippers" : "gripper"}`] : [];
}

/** Remove every gripper link (and pads/fingers under it). Returns where each was mounted. */
export function removeGripper(spec: RobotSpecification): { removed: string[]; roots: { parent: string; atZ: number }[] } {
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
export function armTip(spec: RobotSpecification): { link: string; atZ: number } | undefined {
  const armRoles = /^(?:shoulder|upper_arm|forearm|wrist_\d(?:_b)?|link_\d+|elbow|wrist)$/;
  const arm = spec.links.filter((l) => armRoles.test(l.role ?? ""));
  const tips = arm.filter((l) => !spec.joints.some((j) => j.parent === l.name && armRoles.test(spec.links.find((c) => c.name === j.child)?.role ?? "")));
  if (tips.length !== 1) return undefined;
  const tip = tips[0], len = geometryLength(tip.geometry) ?? 0.05;
  return { link: tip.name, atZ: Math.sign(tip.origin.xyz[2] || 1) * len };
}
