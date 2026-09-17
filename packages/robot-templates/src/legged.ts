import type { RobotSpecification } from "@ttr/robot-schema";
import { emptySpec, pose } from "@ttr/robot-schema";
import { box, cyl, link, joint, DEFAULT_MATERIALS } from "./builder.ts";

export function quadruped(name = "quadruped", prompt?: string): RobotSpecification {
  const spec = emptySpec(name, prompt); spec.materials = [...DEFAULT_MATERIALS];
  const bodyH = 0.35;
  spec.links.push(link("base_link", box(0.4, 0.2, 0.1), { material: "base_mat", role: "base", origin: pose([0, 0, bodyH]) }));
  const corners: [string, number, number][] = [
    ["front_left", 0.18, 0.12], ["front_right", 0.18, -0.12],
    ["rear_left", -0.18, 0.12], ["rear_right", -0.18, -0.12],
  ];
  for (const [leg, x, y] of corners) {
    const hip = `${leg}_hip`, upper = `${leg}_thigh`, lower = `${leg}_shin`;
    spec.links.push(link(hip, cyl(0.03, 0.05), { material: "accent_mat", role: "link", origin: pose([0, 0, 0], [Math.PI / 2, 0, 0]) }));
    spec.joints.push(joint(`${leg}_hip_joint`, "revolute", "base_link", hip, { origin: pose([x, y, bodyH - 0.05]), axis: [1, 0, 0], lower: -0.8, upper: 0.8 }));
    spec.links.push(link(upper, cyl(0.022, 0.16), { material: "link_mat", role: "link", origin: pose([0, 0, -0.08]) }));
    spec.joints.push(joint(`${leg}_thigh_joint`, "revolute", hip, upper, { origin: pose([0, 0, 0]), axis: [0, 1, 0], lower: -1.6, upper: 1.6 }));
    spec.links.push(link(lower, cyl(0.018, 0.16), { material: "link_mat", role: "link", origin: pose([0, 0, -0.08]) }));
    spec.joints.push(joint(`${leg}_knee_joint`, "revolute", upper, lower, { origin: pose([0, 0, -0.16]), axis: [0, 1, 0], lower: -2.4, upper: 0 }));
  }
  spec.metadata.notes.push("Generated quadruped (12-DOF) from template.");
  return spec;
}
