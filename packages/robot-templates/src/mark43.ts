// Iron Man Mark 43 (Avengers: Age of Ultron) as a wearable powered exoskeleton under
// polygon-mesh armour. Panel map and palette follow the Mark 43's layout: red-dominant
// with a gold faceplate, gold centre-chest trapezoid around a circular arc reactor, gold
// abdominal segments, gold biceps, red gauntlets with gold hatches, red pauldrons with a
// gold edge, gold knee caps and instep trim, red boots, back flight-stabiliser flaps.
// Every plate is a hinged, servo-driven mesh link; closed = 0 rad, open = joint limit.
//
// Part frame conventions (see @ttr/mesh):  armour_plate normal = +x, width along y, height
// along z, curving back at the edges;  limb_shell hangs from z=0 down −length around the z
// axis, angle 0 = +x (front), +90° = +y;  dome / disc axis = +z, rim / back face at z=0.
import type { RobotSpecification, Geometry } from "@ttr/robot-schema";
import { pose } from "@ttr/robot-schema";
import { meshGeometry } from "@ttr/mesh";
import { link, joint } from "./builder.ts";
import { wearableExosuit, anthropometrics, type ExosuitOptions } from "./exosuit.ts";

type V3 = [number, number, number];
const RED = "mk43_red", GOLD = "mk43_gold", GUN = "gunmetal", GLOW = "arc_glow", DARK = "visor_dark";
const PI = Math.PI;

interface Hinge { axis?: V3; open?: number; effort?: number; origin?: V3 }

export function ironManMark43(opts: ExosuitOptions = {}): RobotSpecification {
  const spec = wearableExosuit({ ...opts, name: opts.name ?? "iron_man_mark_43", styled: false });
  const A = anthropometrics(opts.height_m ?? 1.75); const T = A.shoulderZ - A.hipZ;
  // the exosuit's plain helmet sphere is replaced by the polygon helmet (its cranium keeps the name `helmet`
  // so the HUD camera mount and the wearer's head weld still resolve)
  spec.links = spec.links.filter((l) => l.name !== "helmet"); spec.joints = spec.joints.filter((j) => j.child !== "helmet");
  spec.materials.push(
    { name: RED, color: [0.60, 0.04, 0.05, 1] }, { name: GOLD, color: [0.84, 0.64, 0.17, 1] }, { name: GUN, color: [0.20, 0.21, 0.24, 1] },
    { name: GLOW, color: [0.88, 0.98, 1.0, 1] }, { name: DARK, color: [0.06, 0.06, 0.07, 1] });
  let hinges = 0;
  const mesh = (part: string, file: string, params: Record<string, number | string> = {}, scale?: V3) => meshGeometry(part, file, params, scale) as unknown as Geometry;
  /** mesh armour part on `parent`. `mount` is the part frame (or the hinge pivot when hinged; then `origin`
   *  offsets the geometry from the pivot). Hinged (servo-driven) when `open` != 0. */
  const part = (name: string, parent: string, g: Geometry, mount: V3, mountRpy: V3, material: string, mass: number, h: Hinge = {}) => {
    spec.links.push(link(name, g, { mass, material, role: "armor", origin: pose(h.origin ?? [0, 0, 0]) }));
    const open = h.open ?? 0;
    if (open === 0) spec.joints.push(joint(`${name}_mount`, "fixed", parent, name, { origin: pose(mount, mountRpy) }));
    else { hinges++; spec.joints.push(joint(`${name}_hinge`, "revolute", parent, name, { origin: pose(mount, mountRpy), axis: h.axis ?? [0, 0, 1], lower: Math.min(0, open), upper: Math.max(0, open), effort: h.effort ?? 3, velocity: 3 })); }
  };
  const SIDES = [["left", 1], ["right", -1]] as const;

  // ================= HELMET (1:1 polygon helmet; frame at ear level) =================
  const hz = A.headZ - A.hipZ - 0.01;               // ear level above the pelvis frame, in spine_frame coordinates
  const HM: V3 = [0.02, 0, hz];
  part("helmet", "spine_frame", mesh("helmet_cranium", "helmet_cranium.stl"), HM, [0, 0, 0], RED, 0.95);
  part("helmet_neck_collar", "spine_frame", mesh("helmet_neck_collar", "helmet_neck_collar.stl"), HM, [0, 0, 0], GUN, 0.35);
  for (const [s] of SIDES) part(`helmet_${s}_ear_pod`, "spine_frame", mesh("helmet_ear_pod", `helmet_${s}_ear_pod.stl`, { side: s }), HM, [0, 0, 0], GUN, 0.12);
  // crown panel lifts (axis Y at the back of the panel) to clear the faceplate
  const crownP: V3 = [HM[0] - 0.03, 0, HM[2] + 0.118];
  part("helmet_crown_panel", "spine_frame", mesh("helmet_crown_panel", "helmet_crown_panel.stl"), crownP, [0, 0, 0], RED, 0.25, { axis: [0, 1, 0], open: -0.9, effort: 1.5, origin: [HM[0] - crownP[0], 0, HM[2] - crownP[2]] });
  // faceplate rotates up about the temples (axis Y through the ear line); its features ride on it
  const faceP: V3 = [HM[0], 0, HM[2] + 0.05]; const faceO: V3 = [0, 0, -0.05];
  part("faceplate", "spine_frame", mesh("helmet_faceplate", "helmet_faceplate.stl"), faceP, [0, 0, 0], GOLD, 0.60, { axis: [0, 1, 0], open: -1.45, effort: 2.5, origin: faceO });
  part("forehead_plate", "faceplate", mesh("helmet_forehead_plate", "helmet_forehead_plate.stl"), [0, 0, 0], [0, 0, 0], GOLD, 0.10, { origin: faceO });
  part("mouth_line", "faceplate", mesh("helmet_mouth_line", "helmet_mouth_line.stl"), [0, 0, 0], [0, 0, 0], DARK, 0.03, { origin: faceO });
  for (const [s, sign] of SIDES) {
    part(`${s}_eye_socket`, "faceplate", mesh("helmet_eye_socket", `helmet_${s}_eye_socket.stl`, { side: s }), [0, 0, 0], [0, 0, 0], DARK, 0.02, { origin: faceO });
    part(`${s}_eye_lens`, "faceplate", mesh("helmet_eye_lens", `helmet_${s}_eye_lens.stl`, { side: s }), [0, 0, 0], [0, 0, 0], GLOW, 0.02, { origin: faceO });
    // cheek panels swing outward on vertical axes at the temples
    part(`${s}_cheek_panel`, "spine_frame", mesh("helmet_cheek_panel", `helmet_${s}_cheek_panel.stl`, { side: s }), [HM[0], sign * 0.10, HM[2]], [0, 0, 0], GOLD, 0.16, { axis: [0, 0, 1], open: sign * 1.0, effort: 1.5, origin: [0, -sign * 0.10, 0] });
  }
  const chinP: V3 = [HM[0] + 0.02, 0, HM[2] - 0.10];
  part("chin_guard", "spine_frame", mesh("helmet_chin_guard", "helmet_chin_guard.stl"), chinP, [0, 0, 0], GOLD, 0.14, { axis: [0, 1, 0], open: 0.6, effort: 1.5, origin: [HM[0] - chinP[0], 0, HM[2] - chinP[2]] });

  // ================= TORSO =================
  // exo frame underneath: chest strap plate (x 0.125..0.155), backpack (x −0.255..−0.095, 0.32 wide), yoke at z 0.504
  const chestZ = T * 0.60 + 0.01;
  const strap = spec.links.find((l) => l.name === "chest_plate")!;   // exo chest strap plate: slimmer under the armour
  strap.geometry = { type: "box", size: [0.02, 0.28, 0.24] }; strap.origin = pose([0.125, 0, chestZ]);
  // red collar plate over the shoulder yoke and clavicles
  part("collar_plate", "spine_frame", mesh("armour_plate", "collar_plate.stl", { w: 0.36, h: 0.09, t: 0.006, R: 0.30, corner: 0.02, taper: 0.15 }), [0.10, 0, T + 0.035], [0, 0, 0], RED, 0.40);
  // red pectoral shell in two halves; each hinges on a vertical axis at the armpit and swings forward/outward for donning
  for (const [s, sign] of SIDES) {
    const pivot: V3 = [0.10, sign * 0.24, chestZ];
    part(`${s}_chest_door`, "spine_frame", mesh("chest_plate", `${s}_chest_door.stl`, { w: 0.50, h: 0.34, d: 0.16, t: 0.006, a0: sign > 0 ? 0 : -1.25, a1: sign > 0 ? 1.25 : 0 }),
      pivot, [0, 0, 0], RED, 1.2, { axis: [0, 0, 1], open: sign * 1.2, effort: 6, origin: [0.03 - pivot[0], -pivot[1], 0] });
    part(`${s}_pectoral_trim`, `${s}_chest_door`, mesh("armour_plate", `${s}_pectoral_trim.stl`, { w: 0.06, h: 0.11, t: 0.004, R: 0.30, corner: 0.012, taper: 0.3 }), [0.03 - pivot[0] + 0.158, sign * 0.13 - pivot[1], 0.07], [0, 0, sign * 0.35], GOLD, 0.10);
  }
  // gold centre trapezoid (wider at the collar) carrying the circular arc reactor; stays on the harness when the doors open
  part("chest_centre", "spine_frame", mesh("armour_plate", "chest_centre.stl", { w: 0.10, h: 0.20, t: 0.006, R: 0.5, corner: 0.015, taper: -0.6 }), [0.20, 0, chestZ + 0.02], [0, 0, 0], GOLD, 0.35);
  part("arc_reactor_housing", "chest_centre", mesh("disc", "arc_reactor_housing.stl", { radius: 0.046, depth: 0.014, chamfer: 0.005 }), [0.004, 0, 0.02], [0, PI / 2, 0], GUN, 0.20);
  part("arc_reactor", "arc_reactor_housing", mesh("disc", "arc_reactor.stl", { radius: 0.032, depth: 0.006, chamfer: 0.002 }), [0, 0, 0.014], [0, 0, 0], GLOW, 0.05);
  // gold abdominal segments fold with the trunk
  const abZ = [0.135, 0.085, 0.035], abW = [0.24, 0.22, 0.20], abX = [0.160, 0.150, 0.140];
  for (let i = 0; i < 3; i++)
    part(`ab_plate_${i + 1}`, "spine_frame", mesh("armour_plate", `ab_plate_${i + 1}.stl`, { w: abW[i], h: 0.045, t: 0.005, R: 0.20, corner: 0.012 }), [abX[i], 0, abZ[i]], [0, 0, 0], GOLD, 0.22, { axis: [0, 1, 0], open: 0.35, effort: 2 });
  // side plates close the gap between chest and back; hinged on their rear edge, they are the torso's donning doors
  for (const [s, sign] of SIDES)
    part(`${s}_lat_plate`, "spine_frame", mesh("armour_plate", `${s}_lat_plate.stl`, { w: 0.36, h: 0.24, t: 0.005, R: 0.40, corner: 0.03 }), [-0.27, sign * 0.205, chestZ - 0.01], [0, 0, sign * PI / 2], RED, 0.60, { axis: [0, 0, 1], open: sign * 1.2, effort: 4, origin: [0, -sign * 0.18, 0] });
  // back shell over the battery pack, with the Mark 43's flight-stabiliser flaps (hinged at their top edge)
  part("back_shell", "spine_frame", mesh("armour_plate", "back_shell.stl", { w: 0.38, h: 0.46, t: 0.006, R: 0.45, corner: 0.03 }), [-0.29, 0, chestZ - 0.02], [0, 0, PI], RED, 1.3);
  for (const [s, sign] of SIDES) {
    part(`${s}_flight_flap`, "back_shell", mesh("armour_plate", `${s}_flight_flap.stl`, { w: 0.12, h: 0.18, t: 0.004, R: 0.5, corner: 0.015, taper: 0.3 }), [0.008, -sign * 0.10, 0.21], [0, 0, 0], GOLD, 0.18, { axis: [0, 1, 0], open: -1.0, effort: 2, origin: [0, 0, -0.09] });
    part(`${s}_back_vent`, "back_shell", mesh("disc", `${s}_back_vent.stl`, { radius: 0.03, depth: 0.012, chamfer: 0.003 }), [0.004, -sign * 0.09, -0.14], [0, 0, 0], GUN, 0.05);
  }
  // pelvis: slimmer exo frame box under a red belt (front + rear) and the hip flaps
  const pelvis = spec.links.find((l) => l.name === "pelvis_frame")!;
  pelvis.geometry = { type: "box", size: [0.22, 0.34, 0.09] }; pelvis.origin = pose([0, 0, A.hipZ + 0.02]);
  part("belt_plate", "pelvis_frame", mesh("armour_plate", "belt_plate.stl", { w: 0.42, h: 0.10, t: 0.006, R: 0.6, corner: 0.02 }), [0.14, 0, A.hipZ + 0.02], [0, 0, 0], RED, 0.7);
  part("rear_belt_plate", "pelvis_frame", mesh("armour_plate", "rear_belt_plate.stl", { w: 0.42, h: 0.10, t: 0.006, R: 0.6, corner: 0.02 }), [-0.14, 0, A.hipZ + 0.02], [0, 0, PI], RED, 0.7);
  part("codpiece", "pelvis_frame", mesh("armour_plate", "codpiece.stl", { w: 0.13, h: 0.14, t: 0.006, R: 0.15, corner: 0.03, taper: 0.4 }), [0.15, 0, A.hipZ - 0.04], [0, 0, 0], GOLD, 0.35, { axis: [0, 1, 0], open: 0.6, effort: 2, origin: [0, 0, -0.07] });

  // ================= ARMS =================
  // limb shells are centred on the wearer's limb axis (0.05 inboard of the strut); the fixed outer shell wraps
  // front→outside→back, the inner clamshell hinges on the front seam and swings outward for donning
  const wrap = (r: number, sign: number) => ({ outer: { a0: sign > 0 ? -1.05 : -3.67, a1: sign > 0 ? 3.67 : 1.05 }, inner: { a0: sign > 0 ? -2.62 : 1.05, a1: sign > 0 ? -1.05 : 2.62 }, seam: [r * Math.cos(1.05), -sign * r * Math.sin(1.05)] as [number, number] });
  for (const [s, sign] of SIDES) {
    // red pauldron: dome capping the shoulder module, tilted outward, lifts on an x hinge
    part(`${s}_pauldron`, `${s}_shoulder_module`, mesh("dome", `${s}_pauldron.stl`, { radius: 0.12, height: 0.08, thick: 0.005 }), [0, -sign * 0.02, 0.025], [-sign * 0.45, 0, 0], RED, 0.65, { axis: [1, 0, 0], open: -sign * 0.8, effort: 3 });
    part(`${s}_pauldron_edge`, `${s}_pauldron`, mesh("armour_plate", `${s}_pauldron_edge.stl`, { w: 0.09, h: 0.03, t: 0.004, R: 0.12, corner: 0.008 }), [0.117, 0, 0.022], [0, 0, 0], GOLD, 0.06);
    // bicep: gold outer sleeve + gold inner clamshell
    const ua = 0.075, uw = wrap(ua, sign), uz = -A.uarm * 0.14, uy = -sign * 0.05;
    part(`${s}_bicep_sleeve`, `${s}_upper_arm_strut`, mesh("limb_shell", `${s}_bicep_sleeve.stl`, { length: A.uarm * 0.64, rTop: ua, rBottom: ua - 0.01, ...uw.outer, thick: 0.005, bulge: 0.04 }), [0, uy, uz], [0, 0, 0], GOLD, 0.45);
    part(`${s}_bicep_clamshell`, `${s}_upper_arm_strut`, mesh("limb_shell", `${s}_bicep_clamshell.stl`, { length: A.uarm * 0.64, rTop: ua, rBottom: ua - 0.01, ...uw.inner, thick: 0.005, bulge: 0.04 }),
      [uw.seam[0], uy + uw.seam[1], uz], [0, 0, 0], GOLD, 0.25, { axis: [0, 0, 1], open: -sign * 1.4, effort: 3, origin: [-uw.seam[0], -uw.seam[1], 0] });
    part(`${s}_elbow_cap`, `${s}_elbow_module`, mesh("dome", `${s}_elbow_cap.stl`, { radius: 0.05, height: 0.035, thick: 0.004 }), [-0.055, uy, 0], [0, -PI / 2, 0], RED, 0.18, { axis: [0, 1, 0], open: 0.5, effort: 2 });
    // forearm gauntlet: red outer sleeve + gold inner clamshell + gold missile hatch on the outer face
    const fa = 0.066, fw = wrap(fa, sign), fz = -A.farm * 0.13, fy = -sign * 0.045;
    part(`${s}_gauntlet_sleeve`, `${s}_forearm_strut`, mesh("limb_shell", `${s}_gauntlet_sleeve.stl`, { length: A.farm * 0.68, rTop: fa, rBottom: fa - 0.012, ...fw.outer, thick: 0.005, bulge: 0.02 }), [0, fy, fz], [0, 0, 0], RED, 0.40);
    part(`${s}_gauntlet_clamshell`, `${s}_forearm_strut`, mesh("limb_shell", `${s}_gauntlet_clamshell.stl`, { length: A.farm * 0.68, rTop: fa, rBottom: fa - 0.012, ...fw.inner, thick: 0.005, bulge: 0.02 }),
      [fw.seam[0], fy + fw.seam[1], fz], [0, 0, 0], GOLD, 0.22, { axis: [0, 0, 1], open: -sign * 1.4, effort: 3, origin: [-fw.seam[0], -fw.seam[1], 0] });
    part(`${s}_gauntlet_hatch`, `${s}_gauntlet_sleeve`, mesh("armour_plate", `${s}_gauntlet_hatch.stl`, { w: 0.045, h: 0.04, t: 0.003, R: 0.07, corner: 0.006 }), [0, sign * (fa + 0.002), -0.035], [0, 0, sign * PI / 2], GOLD, 0.05, { axis: [0, 1, 0], open: -1.2, effort: 1.5, origin: [0, 0, -0.02] });
    // hand: red plate over the back of the hand platform, repulsor in the palm, gold articulated fingers
    part(`${s}_hand_plate`, `${s}_hand`, mesh("armour_plate", `${s}_hand_plate.stl`, { w: 0.07, h: 0.10, t: 0.005, R: 0.09, corner: 0.015 }), [0.02, fy, -0.02], [0, -PI / 2, 0], RED, 0.18);
    part(`${s}_palm_repulsor`, `${s}_hand`, mesh("disc", `${s}_palm_repulsor.stl`, { radius: 0.026, depth: 0.008, chamfer: 0.002 }), [0.03, fy, -0.056], [PI, 0, 0], GLOW, 0.06);
    for (let f = 0; f < 4; f++)
      part(`${s}_finger_${f + 1}`, `${s}_hand`, mesh("armour_plate", `${s}_finger_${f + 1}.stl`, { w: 0.014, h: 0.06, t: 0.012, R: 0.5, corner: 0.004 }), [0.075, fy - 0.024 + f * 0.016, -0.03], [0, -PI / 2, 0], GOLD, 0.03, { axis: [0, 1, 0], open: -1.3, effort: 1, origin: [0, 0, 0.03] });
    part(`${s}_thumb`, `${s}_hand`, mesh("armour_plate", `${s}_thumb.stl`, { w: 0.014, h: 0.05, t: 0.012, R: 0.5, corner: 0.004 }), [0.035, fy - sign * 0.04, -0.03], [0, -PI / 2, -sign * 0.8], GOLD, 0.03, { axis: [0, 1, 0], open: -0.9, effort: 1, origin: [0, 0, 0.025] });
  }

  // ================= LEGS =================
  for (const [s, sign] of SIDES) {
    const ly = -sign * 0.045;   // wearer's leg axis, inboard of the strut
    // hip flap on the pelvis side, hinged at its top edge
    part(`${s}_hip_flap`, "pelvis_frame", mesh("armour_plate", `${s}_hip_flap.stl`, { w: 0.14, h: 0.15, t: 0.006, R: 0.18, corner: 0.03, taper: 0.2 }), [0.0, sign * 0.20, A.hipZ + 0.075], [0, 0, sign * PI / 2], RED, 0.38, { axis: [0, 1, 0], open: -0.7, effort: 2, origin: [0, 0, -0.075] });
    // thigh: red outer shell + red inner clamshell
    const tr = 0.115, tw = wrap(tr, sign), tz = -A.thigh * 0.12;
    part(`${s}_thigh_shell`, `${s}_thigh_strut`, mesh("limb_shell", `${s}_thigh_shell.stl`, { length: A.thigh * 0.74, rTop: tr, rBottom: tr - 0.02, ...tw.outer, thick: 0.006, bulge: 0.03 }), [0, ly, tz], [0, 0, 0], RED, 0.85);
    part(`${s}_thigh_clamshell`, `${s}_thigh_strut`, mesh("limb_shell", `${s}_thigh_clamshell.stl`, { length: A.thigh * 0.74, rTop: tr, rBottom: tr - 0.02, ...tw.inner, thick: 0.006, bulge: 0.03 }),
      [tw.seam[0], ly + tw.seam[1], tz], [0, 0, 0], RED, 0.48, { axis: [0, 0, 1], open: -sign * 1.4, effort: 3, origin: [-tw.seam[0], -tw.seam[1], 0] });
    part(`${s}_knee_cap`, `${s}_knee_module`, mesh("dome", `${s}_knee_cap.stl`, { radius: 0.065, height: 0.045, thick: 0.005 }), [0.075, ly, 0], [0, PI / 2, 0], GOLD, 0.30, { axis: [0, 1, 0], open: -0.6, effort: 2 });
    // shin: red outer shell + red inner (calf) clamshell
    const sr = 0.098, sw = wrap(sr, sign), sz = -A.shank * 0.12;
    part(`${s}_shin_shell`, `${s}_shank_strut`, mesh("limb_shell", `${s}_shin_shell.stl`, { length: A.shank * 0.70, rTop: sr, rBottom: sr - 0.02, ...sw.outer, thick: 0.006, bulge: 0.02 }), [0, ly, sz], [0, 0, 0], RED, 0.65);
    part(`${s}_calf_clamshell`, `${s}_shank_strut`, mesh("limb_shell", `${s}_calf_clamshell.stl`, { length: A.shank * 0.70, rTop: sr, rBottom: sr - 0.02, ...sw.inner, thick: 0.006, bulge: 0.02 }),
      [sw.seam[0], ly + sw.seam[1], sz], [0, 0, 0], RED, 0.42, { axis: [0, 0, 1], open: -sign * 1.4, effort: 3, origin: [-sw.seam[0], -sw.seam[1], 0] });
    // boot (frame: ankle joint; sole box top at z −0.07, bottom −0.105, toe at x 0.18, heel at x −0.14)
    part(`${s}_shin_guard`, `${s}_boot`, mesh("armour_plate", `${s}_shin_guard.stl`, { w: 0.10, h: 0.10, t: 0.005, R: 0.10, corner: 0.02 }), [0.09, ly, 0.06], [0, 0, 0], RED, 0.26, { axis: [0, 1, 0], open: -0.7, effort: 2, origin: [0, 0, -0.05] });
    part(`${s}_boot_toe`, `${s}_boot`, mesh("dome", `${s}_boot_toe.stl`, { radius: 0.06, height: 0.06, thick: 0.005 }, [0.6, 1, 1]), [0.17, ly, -0.062], [0, PI / 2, 0], RED, 0.30);
    part(`${s}_boot_trim`, `${s}_boot`, mesh("armour_plate", `${s}_boot_trim.stl`, { w: 0.10, h: 0.08, t: 0.005, R: 0.12, corner: 0.01 }), [0.10, ly, -0.03], [0, -0.75, 0], GOLD, 0.12);
    part(`${s}_heel_thruster`, `${s}_boot`, mesh("disc", `${s}_heel_thruster.stl`, { radius: 0.028, depth: 0.03, chamfer: 0.004 }), [-0.14, ly, -0.068], [0, -PI / 2, 0], GLOW, 0.12);
    part(`${s}_thruster_cover`, `${s}_boot`, mesh("armour_plate", `${s}_thruster_cover.stl`, { w: 0.08, h: 0.07, t: 0.004, R: 0.1, corner: 0.01 }), [-0.145, ly, -0.02], [0, 0, PI], RED, 0.07, { axis: [0, 1, 0], open: -1.3, effort: 1.5, origin: [0, 0, -0.03] });
    part(`${s}_ankle_flap`, `${s}_boot`, mesh("armour_plate", `${s}_ankle_flap.stl`, { w: 0.06, h: 0.08, t: 0.004, R: 0.08, corner: 0.01 }), [0.0, ly + sign * 0.075, 0.02], [0, 0, sign * PI / 2], RED, 0.09, { axis: [0, 1, 0], open: -0.8, effort: 1.5, origin: [0, 0, -0.04] });
  }

  spec.metadata.notes.push(`Iron Man Mark 43 (Age of Ultron) as a wearable powered exoskeleton under polygon-mesh armour: ${hinges} servo-driven hinged plates (motorised helmet: faceplate, crown panel, two cheek panels, chin guard; chest doors, torso side doors, flight-stabiliser flaps, folding ab segments, codpiece, pauldrons, bicep/gauntlet clamshells, gauntlet hatches, fingers, hip flaps, thigh/calf clamshells, knee caps, shin guards, thruster covers, ankle flaps). Panel map and palette follow the Mark 43 layout; repulsors/thrusters are mount points, not modelled propulsion.`);
  return spec;
}
