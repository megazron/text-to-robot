import type { RobotSpecification } from "@ttr/robot-schema";
export type RobotClass = "manipulator" | "mobile" | "locomotion" | "gripper";
export function classify(spec: RobotSpecification): RobotClass {
  const moving=spec.joints.filter(j=>j.type!=='fixed');
  if(moving.length>0 && moving.every(j=>j.type==='prismatic'&&/finger/.test(j.name)))return 'gripper';
  const roles = new Set(spec.links.map((l) => l.role));
  const hasWheel = spec.links.some((l) => l.role === "wheel");
  const legJoints = spec.joints.filter((j) => /hip|thigh|knee|femur|tibia|coxa|leg/.test(j.name)).length;
  if (legJoints >= 6 || (roles.has("base") && spec.links.some((l) => l.name === "torso"))) return "locomotion";
  if (hasWheel) return "mobile";
  return "manipulator";
}
