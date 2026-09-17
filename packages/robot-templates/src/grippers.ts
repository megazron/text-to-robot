import type { Link, Joint, RobotSpecification, EndEffector } from "@ttr/robot-schema";
import { ARM, pose } from "@ttr/robot-schema";
import { box, link, joint } from "./builder.ts";

/** Attach a parallel two-finger gripper onto `attachLink`, ending at distal end
 *  offset `atZ`. Mutates and returns the spec. */
export function attachParallelGripper(spec: RobotSpecification, attachLink: string, atZ: number, prefix = ""): RobotSpecification {
  const p = prefix;
  const palm = box(ARM.gripper_palm[0], ARM.gripper_palm[1], ARM.gripper_palm[2]);
  const [fx, fy, fz] = ARM.finger;
  spec.links.push(link(`${p}gripper_base`, palm, { material: "gripper_mat", role: "gripper", origin: pose([0, 0, ARM.gripper_palm[2] / 2]) }));
  spec.joints.push(joint(`${p}gripper_base_joint`, "fixed", attachLink, `${p}gripper_base`, { origin: pose([0, 0, atZ]) }));
  for (const [side, sign] of [["left", 1], ["right", -1]] as const) {
    const fname = `${p}${side}_finger`;
    spec.links.push(link(fname, box(fx, fy, fz), { material: "gripper_mat", role: "gripper", origin: pose([0, 0, fz / 2]) }));
    spec.joints.push(joint(`${p}${side}_finger_joint`, "prismatic", `${p}gripper_base`, fname, {
      origin: pose([0, sign * (ARM.gripper_palm[1] / 2 - fy), ARM.gripper_palm[2]]),
      axis: [0, sign, 0], lower: 0, upper: 0.03, effort: 40, velocity: 0.3,
    }));
  }
  spec.end_effectors.push({ name: `${p || "main_"}gripper`, type: "two_finger_gripper", attach_link: attachLink } as EndEffector);
  return spec;
}

/** Attach a suction gripper (single cylinder cup). */
export function attachSuctionGripper(spec: RobotSpecification, attachLink: string, atZ: number, prefix = ""): RobotSpecification {
  const p = prefix;
  spec.links.push(link(`${p}suction_cup`, { type: "cylinder", radius: 0.025, length: 0.04 }, { material: "gripper_mat", role: "gripper", origin: pose([0, 0, 0.02]) }));
  spec.joints.push(joint(`${p}suction_joint`, "fixed", attachLink, `${p}suction_cup`, { origin: pose([0, 0, atZ]) }));
  spec.end_effectors.push({ name: `${p || "main_"}suction`, type: "suction_gripper", attach_link: attachLink });
  return spec;
}
