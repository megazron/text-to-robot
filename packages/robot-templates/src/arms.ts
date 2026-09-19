import type { RobotSpecification } from "@ttr/robot-schema";
import { ARM, emptySpec, pose } from "@ttr/robot-schema";
import { meshGeometry } from "@ttr/mesh";
import { hollowChassis } from "./mechanics.ts";
import { box, cyl, link, joint, DEFAULT_MATERIALS } from "./builder.ts";
import { attachParallelGripper } from "./grippers.ts";

export interface ArmOptions { name?: string; gripper?: "parallel" | "none"; prompt?: string; }

interface Seg { role: string; length: number; radius: number; axis: [number, number, number]; }

/** role/geometry table for an N-DOF serial arm (ensures upper_arm + forearm exist for DOF>=3) */
function segments(dof: number): Seg[] {
  const segs: Seg[] = [];
  const axisAt = (i: number): [number, number, number] => {
    if(dof===2)return [0,1,0]; // Both joints lie in the same vertical plane.
    if(dof===6)return [[0,0,1],[0,1,0],[0,1,0],[0,0,1],[0,1,0],[0,0,1]][i] as [number,number,number];
    if(dof===3 && i===2)return [0,1,0];
    return i===0 ? [0,0,1] : i%2===1 ? [0,1,0] : [0,0,1];
  };
  for (let i = 0; i < dof; i++) {
    let role = `link_${i + 1}`;
    let length = 0.09, radius = ARM.link_radius;
    if (i === 0) { role = "shoulder"; length = dof===2 ? ARM.segment_length : 0.10; }
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
  spec.links.push(link("base_link", box(ARM.base_radius*2.4,ARM.base_radius*2.4,ARM.base_height), {
    material: "base_mat", role: "base", origin: pose([0, 0, ARM.base_height / 2]),
  }));
  hollowChassis(spec);
  const segs = segments(dof);
  let parent = "base_link";
  let parentTopZ = ARM.base_height + (dof > 0 ? .040 : 0); // clear the removable lid
  segs.forEach((s, i) => {
    const child = s.role;
    const gap=Math.min(.040,s.length*.30), radius=Math.min(s.radius*.72,s.length*.24);
    spec.links.push(link(child, meshGeometry("arm_spar",`${child}_spar.stl`,{length:s.length,radius,neck:radius*.40,gap}), { material: "link_mat", role: s.role, origin: pose([0, 0, s.length / 2]) }));
    // Fixed frame offsets define a bent, nonsingular home layout; joint values
    // remain zero at home. Two-axis arms retain a common pitch plane.
    const bend=i===1 ? .55 : i===2 && dof!==7 ? -1.1 : 0;
    const mount=pose([0,0,parentTopZ],[0,bend,0]);
    spec.joints.push(joint(`joint_${i + 1}`, "revolute", parent, child, { origin: mount, axis: s.axis,effort:[12,12,8,4,3,2,2][i]??2,velocity:1.5 }));
    const hub=`${child}_joint_hub`;
    const rotation:[number,number,number]=s.axis[1] ? [Math.PI/2,0,0] : [0,0,0];
    if (i === 0 && s.axis[1]) {
      // Pitch hub sits between yoke cheeks, not on a tangent-contact pedestal.
      // Bearing/shaft interfaces within the 6 mm side clearance remain unqualified.
      for(const side of [-1,1]) {
        const mountName=side>0?'shoulder_mount_left':'shoulder_mount_right';
        spec.links.push(link(mountName,box(.020,.008,.044),{
          material:'base_mat',role:'joint_mount',origin:pose([0,side*.023,ARM.base_height+.022]),
        }));
        spec.joints.push(joint(`${mountName}_fixed`,'fixed','base_link',mountName));
      }
    } else if (i === 0) {
      const supportHeight = .040 - .013;
      spec.links.push(link('shoulder_mount', cyl(.020, supportHeight), {
        material: 'base_mat', role: 'joint_mount', origin: pose([0, 0, ARM.base_height + supportHeight / 2]),
      }));
      spec.joints.push(joint('shoulder_mount_fixed', 'fixed', 'base_link', 'shoulder_mount'));
    }
    spec.links.push(link(hub,cyl(radius*1.18,.026),{mass:.12,material:'accent_mat',role:'joint_housing',origin:pose([0,0,0],rotation)}));
    spec.joints.push(joint(`${hub}_mount`,'fixed',child,hub));

    parent = child;
    parentTopZ = s.length;
  });
  if ((opts.gripper ?? "parallel") === "parallel") attachParallelGripper(spec, parent, parentTopZ);
  spec.metadata.notes.push(`Generated ${dof}-DOF serial arm. 2-axis version is planar; 6-axis version has parallel shoulder/elbow pitch axes and a three-axis wrist. Joint offsets and motor capacities remain design assumptions.`);
  return spec;
}

export function scara(opts: ArmOptions = {}): RobotSpecification {
  const spec = emptySpec(opts.name ?? "scara", opts.prompt);
  spec.materials = [...DEFAULT_MATERIALS];
  spec.links.push(link("base_link", box(.12,.12,.35), { material: "base_mat", role: "base", origin: pose([0, 0, 0.175]) }));
  hollowChassis(spec);
  spec.links.push(link("upper_arm", cyl(0.035, 0.25), { material: "link_mat", role: "upper_arm", origin: pose([0.125, 0, 0], [0, Math.PI / 2, 0]) }));
  spec.joints.push(joint("joint_1", "revolute", "base_link", "upper_arm", { origin: pose([0, 0, 0.39]), axis: [0, 0, 1] }));
  spec.links.push(link("forearm", cyl(0.03, 0.20), { material: "link_mat", role: "forearm", origin: pose([0.10, 0, 0], [0, Math.PI / 2, 0]) }));
  spec.joints.push(joint("joint_2", "revolute", "upper_arm", "forearm", { origin: pose([0.25, 0, 0]), axis: [0, 0, 1] }));
  spec.links.push(link("spindle", cyl(0.02, 0.12), { material: "accent_mat", role: "wrist", origin: pose([0, 0, -0.06]) }));
  spec.joints.push(joint("joint_3", "prismatic", "forearm", "spindle", { origin: pose([0.20, 0, 0]), axis: [0, 0, 1], lower: -0.1, upper: 0, effort: 80, velocity: 0.4 }));
  spec.joints.push(joint("joint_4", "revolute", "spindle", "tool", { origin: pose([0, 0, -0.12]), axis: [0, 0, 1] }));
  spec.links.push(link("tool", cyl(0.015, 0.03), { material: "accent_mat", role: "wrist", origin: pose([0, 0, -0.015]) }));
  spec.metadata.notes.push("Generated SCARA (RRPR) from template.");
  return spec;
}
