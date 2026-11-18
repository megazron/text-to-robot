// What a built robot has, counted from its joints: arms (and the joints of each), wheels, legs. Compared with what the
// prompt asked for (request.ts), so a count that was not built is always said with the result, never dropped.
import type { RobotSpecification } from "@ttr/robot-schema";
import type { RequestShape } from "./request.ts";

export interface BuiltShape {
  /** joints per arm, one entry per arm, in the robot's order */
  arms: { prefix: string; dof: number }[];
  /** driven wheels plus casters */
  wheels: number;
  /** wheels on a motor (or a passive rocker), casters left out */
  driven: number;
  legs: number;
  family: string;
}

const ARM_JOINT = /(?:^|_)(?:base_yaw|shoulder(?:_\w+)?|upper_arm_(?:roll|yaw)|elbow(?:_\w+)?|forearm_roll|wrist(?:_\w+)?|turret_yaw)$/;
const LEG_JOINT = /(?:^|_)(?:hip|knee|ankle|coxa|femur|tibia|thigh|shin)(?:_\w+)?$/;

export function builtShape(spec: RobotSpecification): BuiltShape {
  const moving = spec.joints.filter((j) => (j.type === "revolute" || j.type === "continuous" || j.type === "prismatic") && !j.mimic && !j.passive);
  const arms = new Map<string, number>(), legs = new Set<string>();
  for (const j of moving) {
    if (/gripper|finger|jaw|thumb|wheel|steer|rocker|bogie|neck|head|eye|lid|door|tail|prop|rotor|thruster/.test(j.name)) continue;
    if (LEG_JOINT.test(j.name)) { legs.add(j.name.replace(LEG_JOINT, "") || "leg"); continue; }
    if (ARM_JOINT.test(j.name)) { const p = j.name.replace(ARM_JOINT, "") || "arm"; arms.set(p, (arms.get(p) ?? 0) + 1); }
  }
  // a hand's wrist or a humanoid's head yaw is not an arm: an arm has at least a shoulder or a base and one more joint
  const rooted = new Set(moving.filter((j) => /(?:^|_)(?:shoulder\w*|base_yaw|turret_yaw)$/.test(j.name) && ARM_JOINT.test(j.name)).map((j) => j.name.replace(ARM_JOINT, "") || "arm"));
  const armList = [...arms].filter(([p]) => rooted.has(p)).map(([prefix, dof]) => ({ prefix, dof }));
  const wheelJoints = spec.joints.filter((j) => /wheel/.test(j.name) && !/steer/.test(j.name) && j.type !== "fixed").length;
  const casters = new Set(spec.joints.filter((j) => /caster/.test(j.name) && j.type !== "fixed").map((j) => j.name.replace(/_(?:roll|spin|swivel|wheel|pivot|ball)$/, ""))).size;
  const family = String((spec.metadata as { design?: { family?: string }; family?: string }).design?.family ?? (spec.metadata as { family?: string }).family ?? "");
  return { arms: armList, wheels: wheelJoints + casters, driven: wheelJoints, legs: legs.size, family };
}

/** Counts asked for and not built, in words; empty when the robot has what was asked. */
export function shapeGaps(asked: RequestShape, built: BuiltShape): string[] {
  const out: string[] = [];
  if (asked.arms) {
    if (built.arms.length !== asked.arms.count) out.push(`${asked.arms.count} arms asked ("${asked.arms.said}"), ${built.arms.length} built`);
    asked.arms.dofs.forEach((d, i) => { const b = built.arms[i]; if (d !== undefined && b && b.dof !== d) out.push(`arm ${i + 1}: ${d} DOF asked, ${b.dof} built`); });
  }
  if (asked.wheels && built.wheels && asked.wheels.count !== built.wheels && asked.wheels.count !== built.driven) out.push(`${asked.wheels.count} wheels asked, ${built.wheels} built`);
  if (asked.legs && built.legs && asked.legs.count !== built.legs) out.push(`${asked.legs.count} legs asked, ${built.legs} built`);
  return out;
}
