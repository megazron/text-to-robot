import type { RobotSpecification } from "@ttr/robot-schema";
import { nDofArm, scara } from "./arms.ts";
import { diffDrive, fourWheel, mecanum } from "./mobile.ts";
import { quadruped } from "./legged.ts";
import { humanoid } from "./humanoid.ts";

export * from "./builder.ts";
export * from "./arms.ts";
export * from "./mobile.ts";
export * from "./legged.ts";
export * from "./humanoid.ts";
export * from "./grippers.ts";

export interface TemplateInfo {
  id: string;
  title: string;
  description: string;
  build: (prompt?: string) => RobotSpecification;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: "arm_2dof", title: "2 DOF arm", description: "Minimal 2-joint planar arm", build: (p) => nDofArm(2, { name: "arm_2dof", prompt: p, gripper: "none" }) },
  { id: "arm_3dof", title: "3 DOF arm", description: "3-joint arm", build: (p) => nDofArm(3, { name: "arm_3dof", prompt: p }) },
  { id: "arm_6dof", title: "6 DOF arm", description: "Industrial-style 6-axis arm", build: (p) => nDofArm(6, { name: "arm_6dof", prompt: p }) },
  { id: "arm_7dof", title: "7 DOF arm", description: "Redundant 7-axis arm", build: (p) => nDofArm(7, { name: "arm_7dof", prompt: p }) },
  { id: "scara", title: "SCARA", description: "RRPR selective-compliance arm", build: (p) => scara({ name: "scara", prompt: p }) },
  { id: "humanoid", title: "Humanoid", description: "Torso, head, two 7-DOF arms + grippers", build: (p) => humanoid({ prompt: p }) },
  { id: "diff_drive", title: "Differential drive", description: "Two driven wheels + caster", build: (p) => diffDrive("diff_drive_robot", p) },
  { id: "four_wheel", title: "Four-wheel robot", description: "Four driven wheels", build: (p) => fourWheel("four_wheel_robot", p) },
  { id: "mecanum", title: "Mecanum robot", description: "Four holonomic wheels", build: (p) => mecanum("mecanum_robot", p) },
  { id: "quadruped", title: "Quadruped", description: "Four 3-DOF legs", build: (p) => quadruped("quadruped", p) },
];

export function getTemplate(id: string): TemplateInfo | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
export const listTemplates = (): TemplateInfo[] => TEMPLATES;
