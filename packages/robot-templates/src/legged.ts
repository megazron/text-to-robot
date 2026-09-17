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

export function hexapod(name = "hexapod", prompt?: string): RobotSpecification {
  const spec = emptySpec(name, prompt); spec.materials = [...DEFAULT_MATERIALS];
  const bodyH = 0.18;
  spec.links.push(link("base_link", cyl(0.16, 0.06), { material: "base_mat", role: "base", origin: pose([0, 0, bodyH]) }));
  const legs: [string, number][] = [["front_left", 60], ["mid_left", 0], ["rear_left", -60], ["front_right", 120], ["mid_right", 180], ["rear_right", -120]];
  for (const [leg, deg] of legs) {
    const a = (deg * Math.PI) / 180, R = 0.15;
    const x = R * Math.cos(a), y = R * Math.sin(a);
    const coxa = `${leg}_coxa`, femur = `${leg}_femur`, tibia = `${leg}_tibia`;
    spec.links.push(link(coxa, cyl(0.02, 0.05), { material: "accent_mat", role: "link", origin: pose([0.025, 0, 0], [0, Math.PI / 2, 0]) }));
    spec.joints.push(joint(`${leg}_coxa_joint`, "revolute", "base_link", coxa, { origin: pose([x, y, bodyH], [0, 0, a]), axis: [0, 0, 1], lower: -0.7, upper: 0.7 }));
    spec.links.push(link(femur, cyl(0.016, 0.10), { material: "link_mat", role: "link", origin: pose([0.05, 0, 0], [0, Math.PI / 2, 0]) }));
    spec.joints.push(joint(`${leg}_femur_joint`, "revolute", coxa, femur, { origin: pose([0.05, 0, 0]), axis: [0, 1, 0], lower: -1.2, upper: 1.2 }));
    spec.links.push(link(tibia, cyl(0.013, 0.12), { material: "link_mat", role: "link", origin: pose([0, 0, -0.06]) }));
    spec.joints.push(joint(`${leg}_tibia_joint`, "revolute", femur, tibia, { origin: pose([0.10, 0, 0], [0, Math.PI / 2, 0]), axis: [0, 1, 0], lower: -2.2, upper: 0.4 }));
  }
  spec.metadata.notes.push("Generated hexapod (6 legs x 3 DOF = 18 DOF) from template.");
  return spec;
}
