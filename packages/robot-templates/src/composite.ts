import type { RobotSpecification } from "@ttr/robot-schema";
import { MOBILE, pose } from "@ttr/robot-schema";
import { cyl, link, joint } from "./builder.ts";
import { fourWheel } from "./mobile.ts";
import { nDofArm, type ArmOptions } from "./arms.ts";
import { attachParallelGripper } from "./grippers.ts";

/** A wheeled base with a serial arm mounted on top -- e.g. a planetary rover / mobile manipulator. */
export function roverArm(name = "rover_arm", dof = 6, prompt?: string, opts: ArmOptions = {}): RobotSpecification {
  const base = fourWheel(name, prompt);
  const arm = nDofArm(dof, { name: "arm", gripper: "none" });
  // graft the arm chain onto the rover's base_link, renaming the arm base joint
  const armBase = arm.links.find((l) => l.name === "base_link")!;
  for(const part of arm.links.filter(l=>l.name.startsWith('base_link_'))){
    const previous=part.name;part.name=previous.replace('base_link_','arm_mount_');
    if(part.geometry.type==='mesh')part.geometry.file=part.name+'.stl';
    for(const j of arm.joints){if(j.parent===previous)j.parent=part.name;if(j.child===previous){j.child=part.name;j.name=part.name+'_mount';}}
  }
  armBase.name = "arm_mount"; armBase.role = "link";
  if(armBase.geometry.type==='mesh')armBase.geometry.file='arm_mount.stl';
  for (const j of arm.joints) { if (j.parent === "base_link") j.parent = "arm_mount"; }
  // mount joint from rover base to the arm mount, on top of the chassis
  base.links.push(...arm.links.filter((l) => l !== armBase), armBase);
  base.joints.push(joint("arm_mount_joint", "fixed", "base_link", "arm_mount", { origin: pose([0, 0, MOBILE.chassis[2] + MOBILE.wheel_radius]) }));
  base.joints.push(...arm.joints);
  const tip = arm.joints.filter(j=>j.type!=="fixed").at(-1)?.child ?? "arm_mount";
  if ((opts.gripper ?? "parallel") === "parallel") {
    const seg = arm.links.find((l) => l.name === tip)!;
    attachParallelGripper(base, tip, seg.origin.xyz[2]*2);
  }
  base.robot_name = name;
  base.metadata.notes.push(`Generated rover + ${dof}-DOF arm (mobile manipulator) from templates.`);
  return base;
}
