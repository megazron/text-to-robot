import type { RobotSpecification } from "@ttr/robot-schema";
import { HUMANOID, emptySpec, pose } from "@ttr/robot-schema";
import { box, cyl, sph, link, joint, DEFAULT_MATERIALS } from "./builder.ts";
import { attachParallelGripper } from "./grippers.ts";

// Frame convention: the root `torso` link frame sits on the ground between the
// feet. Legs hang from hip height; the torso box sits on top of the hips; arms
// hang from the torso's top corners. Everything stays at z >= 0 in the viewer.
const THIGH = 0.20, SHIN = 0.20, FOOT = 0.04;
const HIP_Z = THIGH + SHIN + FOOT;

function appendArm(spec: RobotSpecification, side: "left" | "right", dof: number, mountY: number, shoulderZ: number, gripper: boolean) {
  const p = `${side}_`;
  const seg = HUMANOID.arm_segment, r = HUMANOID.arm_radius;
  const axisAt = (i: number): [number, number, number] => (i % 2 === 0 ? [0, 1, 0] : [1, 0, 0]);
  const names = ["shoulder", "upper_arm", "elbow", "forearm", "wrist_1", "wrist_2", "wrist_3"];
  let parent = "torso";
  let parentLen = 0;
  for (let i = 0; i < dof; i++) {
    const role = names[Math.min(i, names.length - 1)];
    const child = `${p}${role}`;
    const len = i === 1 || i === 3 ? seg : 0.06;
    spec.links.push(link(child, cyl(r, len), { material: "link_mat", role, origin: pose([0, 0, -len / 2]) }));
    spec.joints.push(joint(`${p}arm_joint_${i + 1}`, "revolute", parent, child, {
      origin: i === 0 ? pose([0, mountY, shoulderZ]) : pose([0, 0, -parentLen]), axis: axisAt(i),
      lower: -2.6, upper: 2.6,
    }));
    parent = child; parentLen = len;
  }
  if (gripper) attachParallelGripper(spec, parent, -parentLen, p);
}

function appendLeg(spec: RobotSpecification, side: "left" | "right", hipY: number) {
  const p = `${side}_`;
  spec.links.push(link(`${p}thigh`, cyl(0.045, THIGH), { material: "link_mat", role: "link", origin: pose([0, 0, -THIGH / 2]) }));
  spec.joints.push(joint(`${p}hip_joint`, "revolute", "torso", `${p}thigh`, { origin: pose([0, hipY, HIP_Z]), axis: [0, 1, 0], lower: -1.6, upper: 1.6 }));
  spec.links.push(link(`${p}shin`, cyl(0.04, SHIN), { material: "link_mat", role: "link", origin: pose([0, 0, -SHIN / 2]) }));
  spec.joints.push(joint(`${p}knee_joint`, "revolute", `${p}thigh`, `${p}shin`, { origin: pose([0, 0, -THIGH]), axis: [0, 1, 0], lower: 0, upper: 2.4 }));
  spec.links.push(link(`${p}foot`, box(0.16, 0.08, FOOT), { material: "base_mat", role: "link", origin: pose([0.03, 0, -FOOT / 2]) }));
  spec.joints.push(joint(`${p}ankle_joint`, "revolute", `${p}shin`, `${p}foot`, { origin: pose([0, 0, -SHIN]), axis: [0, 1, 0], lower: -0.8, upper: 0.8 }));
}

export interface HumanoidOptions { name?: string; armDof?: number; gripper?: boolean; legs?: boolean; prompt?: string; }

export function humanoid(opts: HumanoidOptions = {}): RobotSpecification {
  const spec = emptySpec(opts.name ?? "humanoid_robot", opts.prompt);
  spec.materials = [...DEFAULT_MATERIALS];
  const [tx, ty, tz] = HUMANOID.torso;
  const legs = opts.legs ?? true;
  const baseZ = legs ? HIP_Z : 0;
  spec.links.push(link("torso", box(tx, ty, tz), { material: "base_mat", role: "base", origin: pose([0, 0, baseZ + tz / 2]) }));
  spec.links.push(link("head", sph(HUMANOID.head), { material: "link_mat", role: "link", origin: pose() }));
  spec.joints.push(joint("neck_joint", "revolute", "torso", "head", { origin: pose([0, 0, baseZ + tz + HUMANOID.head]), axis: [0, 0, 1], lower: -1.2, upper: 1.2 }));
  const dof = opts.armDof ?? 7;
  const g = opts.gripper ?? true;
  const shoulderZ = baseZ + tz - 0.03;
  appendArm(spec, "left", dof, ty / 2 + HUMANOID.arm_radius, shoulderZ, g);
  appendArm(spec, "right", dof, -(ty / 2 + HUMANOID.arm_radius), shoulderZ, g);
  if (legs) { appendLeg(spec, "left", 0.07); appendLeg(spec, "right", -0.07); }
  spec.metadata.notes.push(`Generated humanoid: torso, head, two ${dof}-DOF arms${g ? " with grippers" : ""}${legs ? ", two 3-DOF legs" : ""}.`);
  return spec;
}
