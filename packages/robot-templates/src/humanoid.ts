import type { RobotSpecification } from "@ttr/robot-schema";
import { HUMANOID, emptySpec, pose } from "@ttr/robot-schema";
import { box, cyl, sph, link, joint, DEFAULT_MATERIALS } from "./builder.ts";
import { attachParallelGripper } from "./grippers.ts";

function appendArm(spec: RobotSpecification, side: "left" | "right", dof: number, mountY: number, gripper: boolean) {
  const p = `${side}_`;
  const seg = HUMANOID.arm_segment, r = HUMANOID.arm_radius;
  const axisAt = (i: number): [number, number, number] => (i % 2 === 0 ? [0, 1, 0] : [1, 0, 0]);
  const names = ["shoulder", "upper_arm", "elbow", "forearm", "wrist_1", "wrist_2", "wrist_3"];
  let parent = "torso";
  let firstOrigin = pose([0, mountY, HUMANOID.torso[2] / 2 - 0.03]);
  let parentLen = 0;
  for (let i = 0; i < dof; i++) {
    const role = names[Math.min(i, names.length - 1)];
    const child = `${p}${role}`;
    const len = i === 1 || i === 3 ? seg : 0.06;
    spec.links.push(link(child, cyl(r, len), { material: "link_mat", role, origin: pose([0, 0, -len / 2]) }));
    spec.joints.push(joint(`${p}joint_${i + 1}`, "revolute", parent, child, {
      origin: i === 0 ? firstOrigin : pose([0, 0, -parentLen]), axis: axisAt(i),
    }));
    parent = child; parentLen = len;
  }
  if (gripper) attachParallelGripper(spec, parent, -parentLen, p);
}

export interface HumanoidOptions { name?: string; armDof?: number; gripper?: boolean; prompt?: string; }

export function humanoid(opts: HumanoidOptions = {}): RobotSpecification {
  const spec = emptySpec(opts.name ?? "humanoid_robot", opts.prompt);
  spec.materials = [...DEFAULT_MATERIALS];
  const [tx, ty, tz] = HUMANOID.torso;
  spec.links.push(link("torso", box(tx, ty, tz), { material: "base_mat", role: "base", origin: pose([0, 0, tz / 2 + 0.6]) }));
  spec.links.push(link("head", sph(HUMANOID.head), { material: "link_mat", role: "link", origin: pose() }));
  spec.joints.push(joint("neck_joint", "revolute", "torso", "head", { origin: pose([0, 0, tz / 2 + 0.6 + tz / 2 + HUMANOID.head]), axis: [0, 0, 1], lower: -1.2, upper: 1.2 }));
  const dof = opts.armDof ?? 7;
  const g = opts.gripper ?? true;
  // torso frame is elevated; shoulders relative to torso link origin (its visual is offset, joints use torso frame)
  appendArm(spec, "left", dof, ty / 2, g);
  appendArm(spec, "right", dof, -ty / 2, g);
  spec.metadata.notes.push(`Generated humanoid: torso, head, two ${dof}-DOF arms${g ? " with grippers" : ""}.`);
  return spec;
}
