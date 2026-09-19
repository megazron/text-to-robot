// Sci-fi characters built from real mechanisms: every part is a rigid body with
// a real joint, mass and actuator budget, so it simulates in MuJoCo/PyBullet.
import type { RobotSpecification, Sensor } from "@ttr/robot-schema";
import { emptySpec, pose } from "@ttr/robot-schema";
import { box, cyl, sph, link, joint, DEFAULT_MATERIALS } from "./builder.ts";
import { humanoid } from "./humanoid.ts";
import { attachParallelGripper } from "./grippers.ts";

const capsule = (radius: number, length: number) => ({ type: "capsule" as const, radius, length });
function sensor(spec: RobotSpecification, name: string, type: Sensor["type"], parent: string, xyz: [number, number, number]) {
  spec.sensors.push({ name, type, parent, origin: pose(xyz), params: {} });
}

/** Iron Man style powered exosuit: armoured humanoid, repulsor thrusters in the palms and boots, HUD camera + IMU. */
export function ironManSuit(name = "iron_man_suit", prompt?: string): RobotSpecification {
  const spec = humanoid({ name, armDof: 7, gripper: false, legs: true, prompt });
  spec.materials = [...DEFAULT_MATERIALS,
    { name: "armor_red", color: [0.72, 0.08, 0.08, 1] }, { name: "armor_gold", color: [0.85, 0.65, 0.13, 1] }, { name: "arc_blue", color: [0.4, 0.85, 1.0, 1] }];
  // armour plating: thicker segments, red/gold palette
  for (const l of spec.links) {
    if (l.name === "torso") { l.material = "armor_red"; }
    else if (/head/.test(l.name)) { l.material = "armor_gold"; }
    else if (/upper_arm|forearm|thigh|shin/.test(l.name)) { l.material = /thigh|shin/.test(l.name) ? "armor_red" : "armor_gold"; if (l.geometry.type === "cylinder") l.geometry.radius *= 1.35; }
    else if (/shoulder|elbow|wrist|foot/.test(l.name)) l.material = "armor_red";
  }
  // Enlarged arm shells need extra lateral clearance from the torso.
  for(const j of spec.joints)if(/^(left|right)_arm_joint_1$/.test(j.name))j.origin.xyz[1]*=1.12;
  // arc reactor on the chest (visual + small mass)
  spec.links.push(link("arc_reactor", cyl(0.035, 0.015), { material: "arc_blue", role: "sensor", origin: pose() }));
  spec.joints.push(joint("arc_reactor_joint", "fixed", "torso", "arc_reactor", { origin: pose([0.085, 0, 0.44 + 0.18], [0, Math.PI / 2, 0]) }));
  // repulsor thrusters: palms (end of each arm chain) and boots
  const tips = spec.links.filter((l) => /wrist_3$/.test(l.name)).map((l) => l.name);
  for (const t of tips) {
    const n = t.replace("wrist_3", "palm_repulsor");
    spec.links.push(link(n, cyl(0.03, 0.02), { material: "arc_blue", role: "sensor", origin: pose() }));
    spec.joints.push(joint(`${n}_joint`, "fixed", t, n, { origin: pose([0, 0, -0.07]) }));
  }
  for (const f of ["left_foot", "right_foot"]) {
    const n = f.replace("foot", "boot_thruster");
    spec.links.push(link(n, cyl(0.03, 0.02), { material: "arc_blue", role: "sensor", origin: pose() }));
    spec.joints.push(joint(`${n}_joint`, "fixed", f, n, { origin: pose([-0.04, 0, -0.03]) }));
  }
  sensor(spec, "hud_camera", "camera", "head", [0.08, 0, 0.02]);
  sensor(spec, "suit_imu", "imu", "torso", [0, 0, 0.5]);
  spec.metadata.notes.push("Iron Man style exosuit: armoured humanoid (25 actuated joints), palm + boot thrusters as fixed mounts, HUD camera, IMU. Thrust is not modelled as a force; it is a mount point for a propulsion actuator.");
  return spec;
}

/** WALL-E: tracked base with two drive wheels per track, a telescoping neck, binocular camera head and two 3-DOF arms with grippers. */
export function wallE(name = "wall_e", prompt?: string): RobotSpecification {
  const spec = emptySpec(name, prompt); spec.materials = [...DEFAULT_MATERIALS, { name: "rust_yellow", color: [0.82, 0.62, 0.12, 1] }];
  const W = 0.30, D = 0.30, H = 0.28, tr = 0.06;
  spec.links.push(link("base_link", box(D, W, H), { material: "rust_yellow", role: "base", origin: pose([0, 0, H / 2 + tr]) }));
  for (const [side, y] of [["left", W / 2 + 0.05], ["right", -(W / 2 + 0.05)]] as const) {
    spec.links.push(link(`${side}_track`, box(D + 0.08, 0.08, tr * 2), { material: "wheel_mat", role: "wheel", origin: pose([0, 0, tr]) }));
    spec.joints.push(joint(`${side}_track_joint`, "fixed", "base_link", `${side}_track`, { origin: pose([0, y, 0]) }));
    for (const [pos, x] of [["front", D / 2], ["rear", -D / 2]] as const) {
      const w = `${side}_${pos}_wheel`;
      spec.links.push(link(w, cyl(tr, 0.06), { material: "wheel_mat", role: "wheel", origin: pose([0, 0, 0], [Math.PI / 2, 0, 0]) }));
      spec.joints.push(joint(`${w}_joint`, "continuous", "base_link", w, { origin: pose([x, y, tr]), axis: [0, 1, 0] }));
    }
  }
  // telescoping neck (prismatic) + tilt, binocular head with two cameras
  spec.links.push(link("neck", cyl(0.025, 0.14), { material: "link_mat", role: "link", origin: pose([0, 0, 0.07]) }));
  spec.joints.push(joint("neck_lift", "prismatic", "base_link", "neck", { origin: pose([D / 2 - 0.05, 0, H + tr]), axis: [0, 0, 1], lower: 0, upper: 0.12, effort: 40, velocity: 0.3 }));
  spec.links.push(link("head", box(0.10, 0.20, 0.08), { material: "rust_yellow", role: "link", origin: pose([0.03, 0, 0]) }));
  spec.joints.push(joint("head_tilt", "revolute", "neck", "head", { origin: pose([0, 0, 0.14]), axis: [0, 1, 0], lower: -0.8, upper: 0.8 }));
  for (const [side, y] of [["left", 0.07], ["right", -0.07]] as const) {
    spec.links.push(link(`${side}_eye`, cyl(0.035, 0.06), { material: "base_mat", role: "sensor", origin: pose([0, 0, 0], [0, Math.PI / 2, 0]) }));
    spec.joints.push(joint(`${side}_eye_joint`, "fixed", "head", `${side}_eye`, { origin: pose([0.08, y, 0]) }));
    sensor(spec, `${side}_eye_camera`, "camera", `${side}_eye`, [0.03, 0, 0]);
  }
  // two 3-DOF arms with grippers, mounted on the front corners
  for (const [side, y, sign] of [["left", W / 2, 1], ["right", -W / 2, -1]] as const) {
    let parent = "base_link"; let len = 0;
    const segs: [string, number, [number, number, number]][] = [["shoulder", 0.05, [0, 1, 0]], ["upper_arm", 0.14, [0, 0, 1]], ["forearm", 0.14, [0, 1, 0]]];
    segs.forEach(([role, L, axis], i) => {
      const n = `${side}_${role}`;
      spec.links.push(link(n, cyl(0.02, L), { material: "link_mat", role, origin: pose([L / 2, 0, 0], [0, Math.PI / 2, 0]) }));
      spec.joints.push(joint(`${side}_arm_joint_${i + 1}`, "revolute", parent, n, { origin: i === 0 ? pose([D / 2, y + sign * 0.02, H * 0.7 + tr]) : pose([len, 0, 0]), axis, lower: -1.8, upper: 1.8 }));
      parent = n; len = L;
    });
    attachParallelGripper(spec, parent, 0, `${side}_`);
    const gb = spec.joints.find((j) => j.name === `${side}_gripper_base_joint`)!; gb.origin = pose([len, 0, 0], [0, Math.PI / 2, 0]);
  }
  spec.metadata.notes.push("WALL-E: tracked base (4 driven wheels), telescoping neck, binocular camera head, two 3-DOF arms with grippers.");
  return spec;
}

/** EVA: a free-floating egg-shaped body with a hovering head and two floating arm pods (modelled as revolute mounts). */
export function eva(name = "eva", prompt?: string): RobotSpecification {
  const spec = emptySpec(name, prompt); spec.materials = [...DEFAULT_MATERIALS, { name: "gloss_white", color: [0.95, 0.95, 0.97, 1] }, { name: "visor", color: [0.05, 0.1, 0.2, 1] }];
  spec.links.push(link("body", capsule(0.16, 0.30), { material: "gloss_white", role: "base", origin: pose([0, 0, 0.55]) }));
  spec.links.push(link("head", capsule(0.11, 0.10), { material: "gloss_white", role: "link", origin: pose() }));
  spec.joints.push(joint("neck_joint", "revolute", "body", "head", { origin: pose([0, 0, 0.55 + 0.15 + 0.16 + 0.08]), axis: [0, 1, 0], lower: -0.6, upper: 0.6 }));
  spec.links.push(link("visor", box(0.02, 0.14, 0.06), { material: "visor", role: "sensor", origin: pose() }));
  spec.joints.push(joint("visor_joint", "fixed", "head", "visor", { origin: pose([0.10, 0, 0.01]) }));
  sensor(spec, "visor_camera", "camera", "visor", [0.01, 0, 0]);
  for (const [side, y] of [["left", 0.24], ["right", -0.24]] as const) {
    spec.links.push(link(`${side}_arm`, capsule(0.06, 0.28), { material: "gloss_white", role: "upper_arm", origin: pose([0, 0, -0.14]) }));
    spec.joints.push(joint(`${side}_shoulder_joint`, "revolute", "body", `${side}_arm`, { origin: pose([0, y, 0.55 + 0.10]), axis: [0, 1, 0], lower: -2.5, upper: 2.5 }));
    spec.joints.push(joint(`${side}_arm_roll`, "revolute", `${side}_arm`, `${side}_hand`, { origin: pose([0, 0, -0.28]), axis: [0, 0, 1], lower: -1.5, upper: 1.5 }));
    spec.links.push(link(`${side}_hand`, sph(0.07), { material: "gloss_white", role: "gripper", origin: pose() }));
  }
  spec.links.push(link("hover_thruster", cyl(0.10, 0.03), { material: "sensor_mat", role: "sensor", origin: pose() }));
  spec.joints.push(joint("hover_thruster_joint", "fixed", "body", "hover_thruster", { origin: pose([0, 0, 0.55 - 0.15 - 0.16]) }));
  sensor(spec, "flight_imu", "imu", "body", [0, 0, 0.55]);
  spec.metadata.notes.push("EVA: free-floating capsule body, tilting head with visor camera, two 2-DOF arm pods, downward hover thruster mount + flight IMU. In simulation it is a floating base; hovering needs a controller.");
  return spec;
}

/** Baymax: inflatable healthcare companion -- soft, rounded humanoid with short legs and capsule limbs. */
export function baymax(name = "baymax", prompt?: string): RobotSpecification {
  const spec = humanoid({ name, armDof: 4, gripper: false, legs: true, prompt });
  spec.materials = [...DEFAULT_MATERIALS, { name: "vinyl_white", color: [0.97, 0.97, 0.97, 1] }];
  for (const l of spec.links) {
    l.material = "vinyl_white";
    // round torso that stays ABOVE the hips (a capsule that reached into the legs exploded the sim)
    if (l.name === "torso" && l.geometry.type === "box") { const [x, y, z] = l.geometry.size; l.geometry = { type: "capsule", radius: Math.max(x, y) * 0.55, length: z * 0.45 }; l.origin = pose([0, 0, l.origin.xyz[2] + z * 0.12]); }
    else if (l.geometry.type === "cylinder" && /arm|thigh|shin|shoulder|elbow|wrist/.test(l.name)) { l.geometry = { type: "capsule", radius: l.geometry.radius * 1.8, length: Math.max(.005, l.geometry.length - 2*l.geometry.radius*1.8) }; }
    else if (l.name === "head" && l.geometry.type === "sphere") l.geometry.radius *= 0.8;
  }
  // Capsule radius adds two hemispherical ends: preserve the original total span.
  // Move enlarged arms outside the torso and legs rather than intersecting them.
  for(const j of spec.joints)if(/^(left|right)_arm_joint_1$/.test(j.name)) {
    const sign=j.name.startsWith('left')?1:-1;
    j.origin.xyz[1]=sign*.27;
  }
  // static stability: an inflatable body is light up top and planted at the bottom.
  for (const l of spec.links) {
    if (l.name === "torso") l.mass *= 0.35;                                   // air-filled torso
    if (/_arm|elbow|wrist|shoulder/.test(l.name)) l.mass *= 0.5;
    if (/foot/.test(l.name) && l.geometry.type === "box") { l.geometry.size = [0.26, 0.16, 0.05]; l.origin = pose([0.05, 0, -0.025]); l.mass *= 3; }
    if (/thigh|shin/.test(l.name)) l.mass *= 2.5;                             // ballast low down
  }
  for (const j of spec.joints) { if (/hip_joint/.test(j.name)) j.origin.xyz = [j.origin.xyz[0], j.origin.xyz[1] * 1.8, j.origin.xyz[2]]; } // wide stance
  sensor(spec, "face_camera", "camera", "head", [0.07, 0, 0]);
  sensor(spec, "chest_imu", "imu", "torso", [0, 0, 0.5]);
  spec.metadata.notes.push("Baymax: soft rounded humanoid (capsule limbs), 4-DOF arms, short legs, wide planted stance with large feet, face camera. Rigid-body approximation of an inflatable body (light torso, ballast in the legs).");
  return spec;
}
