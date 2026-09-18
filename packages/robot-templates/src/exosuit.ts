// Wearable powered exoskeleton ("Iron Man suit" done for real): a frame a person
// stands INSIDE. Struts run down the outside of the limbs, cuffs strap to the
// thigh/shin/upper-arm/forearm, actuator modules sit at the hip/knee/ankle/
// shoulder/elbow, a back pack carries power + compute. Geometry follows adult
// anthropometrics (Winter): H = 1.75 m. Link masses are the exoskeleton's own;
// the wearer is added in simulation (python: ttr_mujoco.exo.add_wearer).
//
// Naming convention (the simulator welds the wearer to these): pelvis_frame,
// spine_frame, {side}_thigh_cuff, {side}_shank_cuff, {side}_boot,
// {side}_upper_arm_cuff, {side}_forearm_cuff, {side}_hand, helmet.
import type { RobotSpecification, Sensor } from "@ttr/robot-schema";
import { emptySpec, pose } from "@ttr/robot-schema";
import { box, cyl, sph, link, joint, DEFAULT_MATERIALS } from "./builder.ts";

export interface ExosuitOptions { name?: string; height_m?: number; styled?: boolean; prompt?: string; }

/** adult anthropometric landmarks for a given stature (Winter). metres; Z up, X forward, Y left */
export function anthropometrics(H = 1.75) {
  const ankleZ = 0.045 * H / 1.75 + 0.06, shank = 0.246 * H, thigh = 0.245 * H;
  const kneeZ = ankleZ + shank, hipZ = kneeZ + thigh, shoulderZ = hipZ + 0.288 * H, headZ = H - 0.065;
  return { H, ankleZ, shank, thigh, kneeZ, hipZ, shoulderZ, headZ, uarm: 0.186 * H, farm: 0.146 * H, hipY: 0.13, shY: 0.235 };
}

export function wearableExosuit(opts: ExosuitOptions = {}): RobotSpecification {
  const H = opts.height_m ?? 1.75;
  const spec = emptySpec(opts.name ?? "iron_man_exosuit", opts.prompt);
  spec.materials = [...DEFAULT_MATERIALS,
    { name: "carbon", color: [0.13, 0.14, 0.16, 1] }, { name: "steel", color: [0.55, 0.57, 0.6, 1] },
    { name: "armor_red", color: [0.70, 0.08, 0.08, 1] }, { name: "armor_gold", color: [0.85, 0.65, 0.13, 1] },
    { name: "arc_blue", color: [0.4, 0.85, 1.0, 1] }, { name: "strap", color: [0.2, 0.2, 0.22, 1] }];
  const styled = opts.styled ?? true;
  const plate = styled ? "armor_red" : "carbon", pod = styled ? "armor_gold" : "steel";

  // anthropometric landmarks (m), Z up, X forward, Y left
  const ankleZ = 0.045 * H / 1.75 + 0.06, shank = 0.246 * H, thigh = 0.245 * H;
  const kneeZ = ankleZ + shank, hipZ = kneeZ + thigh, shoulderZ = hipZ + 0.288 * H, headZ = H - 0.065;
  const uarm = 0.186 * H, farm = 0.146 * H;
  const hipY = 0.13, shY = 0.235;          // strut lines lie OUTSIDE the limbs
  const add = (s: Sensor) => spec.sensors.push(s);

  // ---- trunk frame ----
  spec.links.push(link("pelvis_frame", box(0.30, 0.38, 0.10), { mass: 3.0, material: "carbon", role: "base", origin: pose([0, 0, hipZ + 0.02]) }));
  spec.links.push(link("spine_frame", box(0.05, 0.08, shoulderZ - hipZ), { mass: 2.2, material: "carbon", role: "link", origin: pose([-0.11, 0, (shoulderZ - hipZ) / 2]) }));
  spec.joints.push(joint("trunk_flex", "revolute", "pelvis_frame", "spine_frame", { origin: pose([0, 0, hipZ]), axis: [0, 1, 0], lower: -0.35, upper: 0.5, effort: 120, velocity: 2 }));
  spec.links.push(link("backpack", box(0.16, 0.32, 0.42), { mass: 9.0, material: "carbon", role: "link", origin: pose([-0.175, 0, (shoulderZ - hipZ) * 0.55]) }));
  spec.joints.push(joint("backpack_mount", "fixed", "spine_frame", "backpack", { origin: pose() }));
  spec.links.push(link("chest_plate", box(0.03, 0.34, 0.30), { mass: 1.6, material: plate, role: "link", origin: pose([0.14, 0, (shoulderZ - hipZ) * 0.6]) }));
  spec.joints.push(joint("chest_plate_mount", "fixed", "spine_frame", "chest_plate", { origin: pose() }));
  spec.links.push(link("shoulder_yoke", box(0.06, 2 * shY + 0.06, 0.06), { mass: 1.4, material: "steel", role: "link", origin: pose([-0.06, 0, 0]) }));
  spec.joints.push(joint("shoulder_yoke_mount", "fixed", "spine_frame", "shoulder_yoke", { origin: pose([0, 0, shoulderZ - hipZ]) }));
  if (styled) {
    spec.links.push(link("arc_reactor", cyl(0.04, 0.02), { mass: 0.3, material: "arc_blue", role: "sensor", origin: pose() }));
    spec.joints.push(joint("arc_reactor_mount", "fixed", "chest_plate", "arc_reactor", { origin: pose([0.16, 0, (shoulderZ - hipZ) * 0.62], [0, Math.PI / 2, 0]) }));
  }
  spec.links.push(link("helmet", sph(0.125), { mass: 1.3, material: pod, role: "link", origin: pose() }));
  spec.joints.push(joint("neck_mount", "fixed", "spine_frame", "helmet", { origin: pose([0.02, 0, headZ - hipZ]) }));
  add({ name: "hud_camera", type: "camera", parent: "helmet", origin: pose([0.11, 0, 0.02]), params: {} });
  add({ name: "trunk_imu", type: "imu", parent: "spine_frame", origin: pose([-0.08, 0, 0.2]), params: {} });

  // ---- legs ----
  for (const [side, s] of [["left", 1], ["right", -1]] as const) {
    const y = s * hipY;
    // hip: abduction (X) then flexion (Y); actuator module at the hip
    spec.links.push(link(`${side}_hip_module`, cyl(0.065, 0.09), { mass: 2.4, material: pod, role: "link", origin: pose([0, s * 0.045, 0], [Math.PI / 2, 0, 0]) }));
    spec.joints.push(joint(`${side}_hip_abduction`, "revolute", "pelvis_frame", `${side}_hip_module`, { origin: pose([0, y, hipZ]), axis: [1, 0, 0], lower: -0.3, upper: 0.5, effort: 120, velocity: 3 }));
    spec.links.push(link(`${side}_thigh_strut`, box(0.055, 0.04, thigh), { mass: 1.4, material: "carbon", role: "link", origin: pose([0, 0, -thigh / 2]) }));
    spec.joints.push(joint(`${side}_hip_flexion`, "revolute", `${side}_hip_module`, `${side}_thigh_strut`, { origin: pose(), axis: [0, 1, 0], lower: -0.5, upper: 2.0, effort: 150, velocity: 4 }));
    spec.links.push(link(`${side}_thigh_cuff`, cyl(0.105, 0.07), { mass: 0.45, material: "strap", role: "link", origin: pose() }));
    spec.joints.push(joint(`${side}_thigh_cuff_mount`, "fixed", `${side}_thigh_strut`, `${side}_thigh_cuff`, { origin: pose([0, -s * 0.045, -thigh * 0.55]) }));
    if (styled) { spec.links.push(link(`${side}_thigh_plate`, box(0.03, 0.14, thigh * 0.6), { mass: 0.6, material: plate, role: "link", origin: pose() }));
      spec.joints.push(joint(`${side}_thigh_plate_mount`, "fixed", `${side}_thigh_strut`, `${side}_thigh_plate`, { origin: pose([0.10, -s * 0.045, -thigh * 0.5]) })); }
    // knee module + shank
    spec.links.push(link(`${side}_knee_module`, cyl(0.06, 0.08), { mass: 2.2, material: pod, role: "link", origin: pose([0, s * 0.04, 0], [Math.PI / 2, 0, 0]) }));
    spec.joints.push(joint(`${side}_knee_module_mount`, "fixed", `${side}_thigh_strut`, `${side}_knee_module`, { origin: pose([0, 0, -thigh]) }));
    spec.links.push(link(`${side}_shank_strut`, box(0.05, 0.035, shank), { mass: 1.1, material: "carbon", role: "link", origin: pose([0, 0, -shank / 2]) }));
    spec.joints.push(joint(`${side}_knee_flexion`, "revolute", `${side}_knee_module`, `${side}_shank_strut`, { origin: pose(), axis: [0, 1, 0], lower: -2.2, upper: 0.05, effort: 150, velocity: 5 }));
    spec.links.push(link(`${side}_shank_cuff`, cyl(0.085, 0.07), { mass: 0.4, material: "strap", role: "link", origin: pose() }));
    spec.joints.push(joint(`${side}_shank_cuff_mount`, "fixed", `${side}_shank_strut`, `${side}_shank_cuff`, { origin: pose([0, -s * 0.045, -shank * 0.5]) }));
    // ankle module + boot with insole force sensor
    spec.links.push(link(`${side}_ankle_module`, cyl(0.05, 0.07), { mass: 1.5, material: pod, role: "link", origin: pose([0, s * 0.035, 0], [Math.PI / 2, 0, 0]) }));
    spec.joints.push(joint(`${side}_ankle_module_mount`, "fixed", `${side}_shank_strut`, `${side}_ankle_module`, { origin: pose([0, 0, -shank]) }));
    spec.links.push(link(`${side}_boot`, box(0.32, 0.12, 0.035), { mass: 1.3, material: plate, role: "link", origin: pose([0.02, -s * 0.045, -ankleZ + 0.0175]) }));
    spec.joints.push(joint(`${side}_ankle_flexion`, "revolute", `${side}_ankle_module`, `${side}_boot`, { origin: pose(), axis: [0, 1, 0], lower: -0.6, upper: 0.6, effort: 100, velocity: 4 }));
    add({ name: `${side}_insole_force`, type: "force", parent: `${side}_boot`, origin: pose([0.05, -s * 0.045, -ankleZ]), params: { channels: 4 } });
    if (styled) { spec.links.push(link(`${side}_boot_thruster`, cyl(0.035, 0.02), { mass: 0.2, material: "arc_blue", role: "sensor", origin: pose() }));
      spec.joints.push(joint(`${side}_boot_thruster_mount`, "fixed", `${side}_boot`, `${side}_boot_thruster`, { origin: pose([-0.06, -s * 0.045, -ankleZ + 0.045]) })); }
  }

  // ---- arms ----
  for (const [side, s] of [["left", 1], ["right", -1]] as const) {
    const y = s * shY;
    spec.links.push(link(`${side}_shoulder_module`, cyl(0.055, 0.08), { mass: 1.6, material: pod, role: "link", origin: pose([0, s * 0.04, 0], [Math.PI / 2, 0, 0]) }));
    spec.joints.push(joint(`${side}_shoulder_abduction`, "revolute", "shoulder_yoke", `${side}_shoulder_module`, { origin: pose([0, y, 0]), axis: [1, 0, 0], lower: -0.3, upper: 2.6, effort: 60, velocity: 3 }));
    spec.links.push(link(`${side}_upper_arm_strut`, box(0.04, 0.035, uarm), { mass: 0.8, material: "carbon", role: "upper_arm", origin: pose([0, 0, -uarm / 2]) }));
    spec.joints.push(joint(`${side}_shoulder_flexion`, "revolute", `${side}_shoulder_module`, `${side}_upper_arm_strut`, { origin: pose(), axis: [0, 1, 0], lower: -1.0, upper: 3.0, effort: 60, velocity: 3 }));
    spec.links.push(link(`${side}_upper_arm_cuff`, cyl(0.06, 0.06), { mass: 0.3, material: "strap", role: "link", origin: pose() }));
    spec.joints.push(joint(`${side}_upper_arm_cuff_mount`, "fixed", `${side}_upper_arm_strut`, `${side}_upper_arm_cuff`, { origin: pose([0, -s * 0.05, -uarm * 0.55]) }));
    if (styled) { spec.links.push(link(`${side}_shoulder_plate`, box(0.14, 0.06, 0.16), { mass: 0.5, material: pod, role: "link", origin: pose() }));
      spec.joints.push(joint(`${side}_shoulder_plate_mount`, "fixed", `${side}_shoulder_module`, `${side}_shoulder_plate`, { origin: pose([0, s * 0.05, 0.04]) })); }
    spec.links.push(link(`${side}_elbow_module`, cyl(0.045, 0.07), { mass: 1.1, material: pod, role: "link", origin: pose([0, s * 0.035, 0], [Math.PI / 2, 0, 0]) }));
    spec.joints.push(joint(`${side}_elbow_module_mount`, "fixed", `${side}_upper_arm_strut`, `${side}_elbow_module`, { origin: pose([0, 0, -uarm]) }));
    spec.links.push(link(`${side}_forearm_strut`, box(0.035, 0.03, farm), { mass: 0.6, material: "carbon", role: "forearm", origin: pose([0, 0, -farm / 2]) }));
    spec.joints.push(joint(`${side}_elbow_flexion`, "revolute", `${side}_elbow_module`, `${side}_forearm_strut`, { origin: pose(), axis: [0, 1, 0], lower: -2.4, upper: 0.05, effort: 40, velocity: 4 }));
    spec.links.push(link(`${side}_forearm_cuff`, cyl(0.05, 0.06), { mass: 0.25, material: "strap", role: "link", origin: pose() }));
    spec.joints.push(joint(`${side}_forearm_cuff_mount`, "fixed", `${side}_forearm_strut`, `${side}_forearm_cuff`, { origin: pose([0, -s * 0.045, -farm * 0.55]) }));
    spec.links.push(link(`${side}_hand`, box(0.10, 0.07, 0.03), { mass: 0.35, material: plate, role: "gripper", origin: pose([0.02, -s * 0.045, -0.04]) }));
    spec.joints.push(joint(`${side}_wrist_flexion`, "revolute", `${side}_forearm_strut`, `${side}_hand`, { origin: pose([0, 0, -farm]), axis: [1, 0, 0], lower: -0.8, upper: 0.8, effort: 15, velocity: 4 }));
    if (styled) { spec.links.push(link(`${side}_palm_repulsor`, cyl(0.03, 0.015), { mass: 0.15, material: "arc_blue", role: "sensor", origin: pose() }));
      spec.joints.push(joint(`${side}_palm_repulsor_mount`, "fixed", `${side}_hand`, `${side}_palm_repulsor`, { origin: pose([0.02, -s * 0.045, -0.06]) })); }
  }
  spec.metadata.notes.push(`Wearable powered exoskeleton for a ${H} m adult: 17 actuated joints (trunk, 2x hip ab/flex, knee, ankle, 2x shoulder ab/flex, elbow, wrist), lateral struts, strap cuffs, joint actuator modules, 9 kg power/compute back pack, insole force sensors, trunk IMU, HUD camera. The wearer is added in simulation (ttr_mujoco --wearer). Thrusters are mount points, not modelled propulsion.`);
  return spec;
}
