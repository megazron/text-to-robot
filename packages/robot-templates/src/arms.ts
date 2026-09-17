import type { RobotSpecification } from "@ttr/robot-schema";
import { ARM, emptySpec, pose } from "@ttr/robot-schema";
import { cyl, link, joint, DEFAULT_MATERIALS } from "./builder.ts";
import { attachParallelGripper } from "./grippers.ts";

export interface ArmOptions { name?: string; gripper?: "parallel" | "none"; prompt?: string; }

interface Seg { role: string; length: number; radius: number; axis: [number, number, number]; }

/** role/geometry table for an N-DOF serial arm (ensures upper_arm + forearm exist for DOF>=3) */
function segments(dof: number): Seg[] {
  const segs: Seg[] = [];
  const axisAt = (i: number): [number, number, number] => (i === 0 ? [0, 0, 1] : i % 2 === 1 ? [0, 1, 0] : [0, 0, 1]);
  for (let i = 0; i < dof; i++) {
    let role = `link_${i + 1}`;
    let length = 0.09, radius = ARM.link_radius;
    if (i === 0) { role = "shoulder"; length = 0.10; }
    else if (i === 1) { role = "upper_arm"; length = ARM.segment_length; }
    else if (i === 2) { role = "forearm"; length = ARM.segment_length; }
    else if (i >= dof - 3) { role = `wrist_${3 - (dof - 1 - i)}`; length = ARM.wrist_length * (1 - 0.15 * (dof - 1 - i)); }
    segs.push({ role, length: Math.max(0.03, length), radius, axis: axisAt(i) });
  }
  // de-duplicate wrist labels if dof small
  const seen = new Set<string>();
  for (const s of segs) { if (seen.has(s.role)) s.role = s.role + "_b"; seen.add(s.role); }
  return segs;
}

export function nDofArm(dof: number, opts: ArmOptions = {}): RobotSpecification {
  const spec = emptySpec(opts.name ?? `arm_${dof}dof`, opts.prompt);
  spec.materials = [...DEFAULT_MATERIALS];
  // base
  spec.links.push(link("base_link", cyl(ARM.base_radius, ARM.base_height), {
    material: "base_mat", role: "base", origin: pose([0, 0, ARM.base_height / 2]),
  }));
  const segs = segments(dof);
  let parent = "base_link";
  let parentTopZ = ARM.base_height; // first joint sits on top of the base
  segs.forEach((s, i) => {
    const child = s.role;
    spec.links.push(link(child, cyl(s.radius, s.length), { material: "link_mat", role: s.role, origin: pose([0, 0, s.length / 2]) }));
    spec.joints.push(joint(`joint_${i + 1}`, "revolute", parent, child, { origin: pose([0, 0, parentTopZ]), axis: s.axis }));
    parent = child;
    parentTopZ = s.length;
  });
  if ((opts.gripper ?? "parallel") === "parallel") attachParallelGripper(spec, parent, parentTopZ);
  spec.metadata.notes.push(`Generated ${dof}-DOF serial arm from template.`);
  return spec;
}

export function scara(opts: ArmOptions = {}): RobotSpecification {
  const spec = emptySpec(opts.name ?? "scara", opts.prompt);
  spec.materials = [...DEFAULT_MATERIALS];
  spec.links.push(link("base_link", cyl(0.06, 0.20), { material: "base_mat", role: "base", origin: pose([0, 0, 0.10]) }));
  spec.links.push(link("upper_arm", cyl(0.035, 0.25), { material: "link_mat", role: "upper_arm", origin: pose([0.125, 0, 0], [0, Math.PI / 2, 0]) }));
  spec.joints.push(joint("joint_1", "revolute", "base_link", "upper_arm", { origin: pose([0, 0, 0.20]), axis: [0, 0, 1] }));
  spec.links.push(link("forearm", cyl(0.03, 0.20), { material: "link_mat", role: "forearm", origin: pose([0.10, 0, 0], [0, Math.PI / 2, 0]) }));
  spec.joints.push(joint("joint_2", "revolute", "upper_arm", "forearm", { origin: pose([0.25, 0, 0]), axis: [0, 0, 1] }));
  spec.links.push(link("spindle", cyl(0.02, 0.12), { material: "accent_mat", role: "wrist", origin: pose([0, 0, -0.06]) }));
  spec.joints.push(joint("joint_3", "prismatic", "forearm", "spindle", { origin: pose([0.20, 0, 0]), axis: [0, 0, 1], lower: -0.1, upper: 0, effort: 80, velocity: 0.4 }));
  spec.joints.push(joint("joint_4", "revolute", "spindle", "tool", { origin: pose([0, 0, -0.12]), axis: [0, 0, 1] }));
  spec.links.push(link("tool", cyl(0.015, 0.03), { material: "accent_mat", role: "wrist", origin: pose([0, 0, -0.015]) }));
  spec.metadata.notes.push("Generated SCARA (RRPR) from template.");
  return spec;
}
