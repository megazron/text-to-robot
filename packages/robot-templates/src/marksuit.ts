// Movie-style "Mark" armour on top of the wearable exoskeleton: dozens of small
// articulated plates, every one a real hinged link with its own servo, that swing
// OPEN for donning and lock CLOSED. Closed = joint angle 0; open = upper limit.
// The donning sequence is driven in simulation (ttr_mujoco render --motion don).
import type { RobotSpecification, Geometry } from "@ttr/robot-schema";
import { pose } from "@ttr/robot-schema";
import { box, cyl, link, joint } from "./builder.ts";
import { wearableExosuit, anthropometrics, type ExosuitOptions } from "./exosuit.ts";

const capsule = (radius: number, length: number): Geometry => ({ type: "capsule", radius, length });
type V3 = [number, number, number];

export function ironManMarkSuit(opts: ExosuitOptions = {}): RobotSpecification {
  const spec = wearableExosuit({ ...opts, name: opts.name ?? "iron_man_mark_suit", styled: false });
  const A = anthropometrics(opts.height_m ?? 1.75);
  const T = A.shoulderZ - A.hipZ;   // trunk length above the pelvis frame
  spec.materials.push(
    { name: "hot_rod_red", color: [0.62, 0.05, 0.06, 1] }, { name: "gold_titanium", color: [0.83, 0.62, 0.16, 1] },
    { name: "gunmetal", color: [0.22, 0.23, 0.26, 1] }, { name: "arc_glow", color: [0.55, 0.9, 1.0, 1] }, { name: "eye_glow", color: [0.75, 0.95, 1.0, 1] });
  let hinges = 0;
  /** an armour plate on `parent`: fixed if `open` is 0, otherwise a hinged servo plate (closed=0, open=`open` rad) */
  const plate = (name: string, parent: string, g: Geometry, mount: V3, mountRpy: V3, geomOffset: V3, material: string, mass: number,
                 axis: V3 = [0, 0, 1], open = 0, effort = 4) => {
    spec.links.push(link(name, g, { mass, material, role: "armor", origin: pose(geomOffset) }));
    if (open === 0) spec.joints.push(joint(`${name}_mount`, "fixed", parent, name, { origin: pose(mount, mountRpy) }));
    else { hinges++; spec.joints.push(joint(`${name}_hinge`, "revolute", parent, name, { origin: pose(mount, mountRpy), axis, lower: Math.min(0, open), upper: Math.max(0, open), effort, velocity: 3 })); }
  };

  // ---------------- helmet: dome, jaw, faceplate that flips up, glowing eyes ----------------
  const hz = A.headZ - A.hipZ;                                   // helmet centre above pelvis frame (spine_frame frame)
  plate("helmet_dome", "spine_frame", capsule(0.115, 0.06), [0.02, 0, hz + 0.02], [0, 0, 0], [0, 0, 0], "hot_rod_red", 1.2);
  plate("helmet_jaw", "helmet_dome", box(0.10, 0.20, 0.06), [0.05, 0, -0.10], [0, 0, 0], [0.02, 0, 0], "hot_rod_red", 0.5);
  plate("faceplate", "helmet_dome", box(0.03, 0.17, 0.19), [0.085, 0, 0.09], [0, 0, 0], [0.02, 0, -0.10], "gold_titanium", 0.55, [0, 1, 0], -1.4, 3);
  plate("left_eye", "faceplate", box(0.006, 0.035, 0.012), [0.04, 0.04, -0.06], [0, 0, 0], [0, 0, 0], "eye_glow", 0.02);
  plate("right_eye", "faceplate", box(0.006, 0.035, 0.012), [0.04, -0.04, -0.06], [0, 0, 0], [0, 0, 0], "eye_glow", 0.02);
  plate("helmet_crest", "helmet_dome", box(0.06, 0.03, 0.05), [-0.06, 0, 0.09], [0, 0, 0], [0, 0, 0], "gold_titanium", 0.1);

  // ---------------- torso: chest halves open outward, ab segments, back doors, air-brake flaps ----------------
  const chestZ = T * 0.62;
  plate("sternum_bar", "spine_frame", box(0.03, 0.06, 0.34), [0.155, 0, chestZ], [0, 0, 0], [0, 0, 0], "gunmetal", 0.6);
  plate("arc_reactor_housing", "sternum_bar", cyl(0.045, 0.025), [0.02, 0, 0.02], [0, Math.PI / 2, 0], [0, 0, 0], "arc_glow", 0.3);
  for (const [s, sign] of [["left", 1], ["right", -1]] as const) {
    plate(`${s}_chest_plate`, "sternum_bar", box(0.03, 0.15, 0.30), [0.005, sign * 0.03, 0], [0, 0, 0], [0.01, sign * 0.085, 0], "hot_rod_red", 1.1, [0, 0, 1], sign * 1.1, 6);
    plate(`${s}_pectoral_trim`, `${s}_chest_plate`, box(0.02, 0.05, 0.10), [0.03, sign * 0.14, 0.08], [0, 0, 0], [0, 0, 0], "gold_titanium", 0.15);
    plate(`${s}_back_door`, "spine_frame", box(0.03, 0.16, 0.36), [-0.13, sign * 0.03, chestZ], [0, 0, 0], [-0.01, sign * 0.09, 0], "hot_rod_red", 1.0, [0, 0, 1], -sign * 1.2, 6);
    plate(`${s}_air_brake`, `${s}_back_door`, box(0.015, 0.10, 0.14), [-0.02, sign * 0.10, 0.16], [0, 0, 0], [0, 0, 0.07], "gold_titanium", 0.2, [0, 1, 0], -1.0, 2);
    plate(`${s}_lat_plate`, "spine_frame", box(0.14, 0.02, 0.22), [0.0, sign * 0.20, chestZ - 0.02], [0, 0, 0], [0, 0, 0], "hot_rod_red", 0.5);
  }
  for (let i = 0; i < 3; i++) {   // segmented abdominal plates that fold with the trunk
    const z = T * 0.38 - i * 0.075;
    plate(`ab_plate_${i + 1}`, i === 0 ? "sternum_bar" : `ab_plate_${i}`, box(0.03, 0.26, 0.07), i === 0 ? [0.0, 0, -0.20] : [0, 0, -0.075], [0, 0, 0], [0.005, 0, -0.035], i % 2 ? "gold_titanium" : "hot_rod_red", 0.35, [0, 1, 0], 0.35, 2);
  }
  plate("belt_plate", "pelvis_frame", box(0.34, 0.42, 0.09), [0, 0, A.hipZ + 0.02], [0, 0, 0], [0, 0, 0], "gold_titanium", 0.9);
  plate("codpiece", "pelvis_frame", box(0.06, 0.14, 0.16), [0.16, 0, A.hipZ - 0.06], [0, 0, 0], [0, 0, -0.06], "hot_rod_red", 0.4, [0, 1, 0], 0.6, 2);

  // ---------------- shoulders: pauldrons that lift, bicep + forearm clamshells, gauntlet hatch, palm repulsor ----------------
  for (const [s, sign] of [["left", 1], ["right", -1]] as const) {
    plate(`${s}_pauldron`, `${s}_shoulder_module`, capsule(0.09, 0.08), [0, sign * 0.06, 0.05], [Math.PI / 2, 0, 0], [0, 0, 0], "hot_rod_red", 0.7, [1, 0, 0], sign * 0.7, 3);
    plate(`${s}_pauldron_trim`, `${s}_pauldron`, box(0.10, 0.02, 0.06), [0.0, sign * 0.10, 0.02], [0, 0, 0], [0, 0, 0], "gold_titanium", 0.1);
    // bicep clamshell: outer half fixed to the strut, inner half hinged (opens for donning)
    plate(`${s}_bicep_outer`, `${s}_upper_arm_strut`, capsule(0.075, A.uarm * 0.45), [0, sign * 0.02, -A.uarm * 0.45], [0, 0, 0], [0, 0, 0], "gold_titanium", 0.55);
    plate(`${s}_bicep_inner`, `${s}_upper_arm_strut`, box(0.10, 0.02, A.uarm * 0.5), [0.055, -sign * 0.075, -A.uarm * 0.45], [0, 0, 0], [-0.045, -sign * 0.01, 0], "gold_titanium", 0.35, [0, 0, 1], -sign * 1.5, 3);
    plate(`${s}_elbow_cap`, `${s}_elbow_module`, box(0.08, 0.06, 0.08), [0.05, 0, 0], [0, 0, 0], [0, 0, 0], "hot_rod_red", 0.25, [0, 1, 0], -0.5, 2);
    // forearm gauntlet clamshell
    plate(`${s}_gauntlet_outer`, `${s}_forearm_strut`, capsule(0.062, A.farm * 0.5), [0, sign * 0.015, -A.farm * 0.5], [0, 0, 0], [0, 0, 0], "gold_titanium", 0.45);
    plate(`${s}_gauntlet_inner`, `${s}_forearm_strut`, box(0.09, 0.02, A.farm * 0.55), [0.045, -sign * 0.06, -A.farm * 0.5], [0, 0, 0], [-0.04, -sign * 0.01, 0], "gold_titanium", 0.3, [0, 0, 1], -sign * 1.5, 3);
    plate(`${s}_gauntlet_hatch`, `${s}_gauntlet_outer`, box(0.05, 0.03, 0.01), [0.0, 0, 0.03], [0, 0, 0], [0.025, 0, 0.0], "hot_rod_red", 0.06, [0, 1, 0], -1.2, 1.5);
    plate(`${s}_hand_plate`, `${s}_hand`, box(0.11, 0.08, 0.02), [0.02, -sign * 0.045, -0.06], [0, 0, 0], [0, 0, 0], "hot_rod_red", 0.25);
    plate(`${s}_palm_repulsor`, `${s}_hand_plate`, cyl(0.028, 0.012), [0.0, 0, -0.012], [0, 0, 0], [0, 0, 0], "arc_glow", 0.08);
    for (let f = 0; f < 4; f++) plate(`${s}_finger_${f + 1}`, `${s}_hand_plate`, box(0.07, 0.014, 0.014), [0.09, -0.027 + f * 0.018, 0.0], [0, 0, 0], [0.035, 0, 0], "gold_titanium", 0.03, [0, 1, 0], 1.3, 1);
    plate(`${s}_thumb`, `${s}_hand_plate`, box(0.05, 0.014, 0.014), [0.03, sign * 0.045, 0.0], [0, 0, sign * 0.8], [0.025, 0, 0], "gold_titanium", 0.03, [0, 0, 1], -sign * 0.9, 1);
  }

  // ---------------- legs: hip flaps, thigh clamshells, knee caps, shin clamshells, boots with thruster covers ----------------
  for (const [s, sign] of [["left", 1], ["right", -1]] as const) {
    plate(`${s}_hip_flap`, "pelvis_frame", box(0.14, 0.03, 0.16), [0.02, sign * 0.20, A.hipZ - 0.02], [0, 0, 0], [0, 0, -0.08], "hot_rod_red", 0.4, [1, 0, 0], -sign * 0.6, 2);
    plate(`${s}_thigh_outer`, `${s}_thigh_strut`, capsule(0.10, A.thigh * 0.45), [0, -sign * 0.02, -A.thigh * 0.45], [0, 0, 0], [0, 0, 0], "hot_rod_red", 0.9);
    plate(`${s}_thigh_inner`, `${s}_thigh_strut`, box(0.14, 0.025, A.thigh * 0.5), [0.07, -sign * 0.10, -A.thigh * 0.45], [0, 0, 0], [-0.06, -sign * 0.012, 0], "hot_rod_red", 0.5, [0, 0, 1], -sign * 1.4, 3);
    plate(`${s}_knee_cap`, `${s}_knee_module`, box(0.09, 0.09, 0.10), [0.07, -sign * 0.045, 0.0], [0, 0, 0], [0, 0, 0], "gold_titanium", 0.35, [0, 1, 0], -0.6, 2);
    plate(`${s}_shin_outer`, `${s}_shank_strut`, capsule(0.085, A.shank * 0.42), [0, -sign * 0.02, -A.shank * 0.45], [0, 0, 0], [0, 0, 0], "hot_rod_red", 0.7);
    plate(`${s}_calf_shell`, `${s}_shank_strut`, box(0.12, 0.025, A.shank * 0.5), [-0.06, -sign * 0.09, -A.shank * 0.45], [0, 0, 0], [0.05, -sign * 0.012, 0], "hot_rod_red", 0.45, [0, 0, 1], sign * 1.4, 3);
    plate(`${s}_boot_toe_cap`, `${s}_boot`, box(0.10, 0.12, 0.06), [0.14, -sign * 0.045, -A.ankleZ + 0.05], [0, 0, 0], [0, 0, 0], "hot_rod_red", 0.35);
    plate(`${s}_boot_shin_guard`, `${s}_boot`, box(0.03, 0.11, 0.12), [0.06, -sign * 0.045, 0.02], [0, 0, 0], [0, 0, 0.06], "gold_titanium", 0.3, [0, 1, 0], 0.7, 2);
    plate(`${s}_heel_thruster`, `${s}_boot`, cyl(0.032, 0.03), [-0.10, -sign * 0.045, -A.ankleZ + 0.035], [0, 0, 0], [0, 0, 0], "arc_glow", 0.15);
    plate(`${s}_thruster_cover`, `${s}_boot`, box(0.07, 0.08, 0.012), [-0.06, -sign * 0.045, -A.ankleZ + 0.06], [0, 0, 0], [-0.035, 0, 0], "hot_rod_red", 0.08, [0, 1, 0], -1.3, 1.5);
    plate(`${s}_ankle_flap`, `${s}_boot`, box(0.06, 0.02, 0.08), [0.0, -sign * 0.115, 0.02], [0, 0, 0], [0, 0, 0.04], "hot_rod_red", 0.1, [1, 0, 0], sign * 0.8, 1.5);
  }

  spec.metadata.notes.push(`Mark-style articulated armour over the wearable exoskeleton: ${hinges} hinged plates with their own servos (faceplate, chest halves, back doors, air-brake flaps, ab segments, codpiece, pauldrons, bicep/forearm clamshells, gauntlet hatches, fingers, hip flaps, thigh/calf clamshells, knee caps, shin guards, thruster covers, ankle flaps). Closed = 0 rad, open = joint limit; the donning sequence closes them in order. Repulsors/thrusters are mount points, not modelled propulsion.`);
  return spec;
}
