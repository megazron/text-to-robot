// Iron Man Mark 43 (Avengers: Age of Ultron) as a wearable powered exoskeleton under
// polygon-mesh armour. Panel map and palette follow the Mark 43's layout: red-dominant
// with a gold faceplate, red centre-chest trapezoid around a circular arc reactor, red
// abdominal segments, gold biceps, red gauntlets with gold hatches, red pauldrons with a
// gold edge, red knee caps and instep trim, red boots, back flight-stabiliser flaps.
// Opening panels are hinged; trim rides on its panel. Neck and digit joints articulate
// independently. These are proposed mechanisms, not qualified wearable hardware.
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
  // Rest hands follow the forearm rather than ending in horizontal paddles.
  for(const side of ["left","right"]) {
    const wrist=spec.joints.find(j=>j.name===`${side}_wrist_flexion`)!;
    wrist.origin.rpy=[0,Math.PI/2,0];
  }
  const A = anthropometrics(opts.height_m ?? 1.75,opts); const T = A.shoulderZ - A.hipZ;
  // the exosuit's plain helmet sphere is replaced by the polygon helmet (its cranium keeps the name `helmet`
  // so the HUD camera mount and the wearer's head weld still resolve)
  spec.links = spec.links.filter((l) => l.name !== "helmet"); spec.joints = spec.joints.filter((j) => j.child !== "helmet");
  spec.materials.push(
    { name: RED, color: [0.43, 0.018, 0.026, 1] }, { name: GOLD, color: [0.72, 0.51, 0.23, 1] }, { name: GUN, color: [0.085, 0.092, 0.11, 1] },
    { name: GLOW, color: [0.88, 0.98, 1.0, 1] }, { name: DARK, color: [0.06, 0.06, 0.07, 1] });
  for (const l of spec.links) if (l.material === "steel") l.material = GUN;   // the exo frame reads as one dark machine under the armour
  let hinges = 0;
  const mesh = (part: string, file: string, params: Record<string, number | string> = {}, scale?: V3) => {
    if(part==="limb_shell") { part="mark43_limb";params={...params,style:file.includes("thigh")?"thigh":/shin|calf/.test(file)?"shin":file.includes("bicep")?"arm":"forearm"}; }
    if(part==="armour_plate") {
      const style=/pectoral/.test(file)?"pectoral":/chest_centre/.test(file)?"sternum":/ab_plate/.test(file)?"abdomen":/lat_plate/.test(file)?"flank":/thigh_stripe/.test(file)?"thigh":/shin_stripe|shin_guard/.test(file)?"shin":/gauntlet/.test(file)?"gauntlet":/back_shell/.test(file)?"sternum":/flight_flap/.test(file)?"pectoral":/belt|codpiece/.test(file)?"belt":/collar_plate/.test(file)?"collar":null;
      if(style){part="mark43_panel";params={...params,style};}
    }
    return meshGeometry(part,file,params,scale) as unknown as Geometry;
  };
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
    part(`${s}_cheek_panel`, "spine_frame", mesh("helmet_cheek_panel", `helmet_${s}_cheek_panel.stl`, { side: s }), [HM[0], sign * 0.10, HM[2]], [0, 0, 0], RED, 0.16, { axis: [0, 0, 1], open: sign * 1.0, effort: 1.5, origin: [0, -sign * 0.10, 0] });
  }
  const chinP: V3 = [HM[0] + 0.02, 0, HM[2] - 0.10];
  part("chin_guard", "spine_frame", mesh("helmet_chin_guard", "helmet_chin_guard.stl"), chinP, [0, 0, 0], RED, 0.14, { axis: [0, 1, 0], open: 0.6, effort: 1.5, origin: [HM[0] - chinP[0], 0, HM[2] - chinP[2]] });

  // Move the complete helmet assembly together around a neck pivot. Previously
  // each helmet part was welded to the torso, so the head could never turn.
  const neckPivot: V3 = [HM[0], 0, HM[2] - .105];
  spec.links.push(link("neck_yaw_carrier", {type:"cylinder",radius:.035,length:.012}, {mass:.12,material:GUN}));
  spec.links.push(link("neck_pitch_carrier", {type:"cylinder",radius:.028,length:.010}, {mass:.10,material:GUN}));
  spec.joints.push(joint("neck_yaw", "revolute", "spine_frame", "neck_yaw_carrier", {origin:pose(neckPivot),axis:[0,0,1],lower:-.65,upper:.65,effort:4,velocity:1}));
  spec.joints.push(joint("neck_pitch", "revolute", "neck_yaw_carrier", "neck_pitch_carrier", {origin:pose(),axis:[0,1,0],lower:-.25,upper:.30,effort:4,velocity:1}));
  for(const j of spec.joints) {
    if(j.parent==="spine_frame" && (j.child==="helmet" || /^(helmet_.*(?:ear_pod|crown_panel)|faceplate|(?:left|right)_cheek_panel|chin_guard)$/.test(j.child))) {
      j.parent="neck_pitch_carrier";
      j.origin.xyz=j.origin.xyz.map((v,i)=>v-neckPivot[i]) as V3;
    }
  }

  // ================= TORSO =================
  // exo frame underneath: chest strap plate (x 0.125..0.155), backpack (x −0.255..−0.095, 0.32 wide), yoke at z 0.504
  const chestZ = T * 0.68 + 0.015;
  const strap = spec.links.find((l) => l.name === "chest_plate")!;   // exo chest strap plate: slimmer under the armour
  strap.geometry = { type: "box", size: [0.02, 0.28, 0.24] }; strap.origin = pose([0.125, 0, chestZ]);
  part("neck_ring", "spine_frame", mesh("ring", "neck_ring.stl", { outer: 0.08, inner:0.070, height: 0.025 }), [0.02, 0, T + 0.02], [0, 0, 0], GUN, 0.30);
  // red collar plate over the shoulder yoke and clavicles
  part("collar_plate", "spine_frame", mesh("armour_plate", "collar_plate.stl", { w: 0.32, h: 0.065, t: 0.006, R: 0.30, corner: 0.02, taper: 0.15 }), [0.10, 0, T + 0.035], [0, 0, 0], RED, 0.40);
  // red pectoral shell in two halves; each hinges on a vertical axis at the armpit and swings forward/outward for donning
  for (const [s, sign] of SIDES) {
    const pivot: V3 = [0.10, sign * 0.24, chestZ];
    part(`${s}_chest_door`, "spine_frame", mesh("mark43_chest", `${s}_chest_door.stl`, { side: sign, section: "lower" }),
      pivot, [0, 0, 0], RED, 1.2, { axis: [0, 0, 1], open: sign * 1.2, effort: 6, origin: [0.03 - pivot[0], -pivot[1], 0] });
    part(`${s}_pectoral_trim`, `${s}_chest_door`, mesh("mark43_chest", `${s}_pectoral_trim.stl`, {side:sign,section:"upper"}), [0.03-pivot[0],-pivot[1],0], [0,0,0], RED, 0.25);
  }
  // red centre trapezoid (wider at the collar) carrying the circular arc reactor; stays on the harness when the doors open
  part("chest_centre", "spine_frame", mesh("armour_plate", "chest_centre.stl", { w: 0.095, h: 0.22, t: 0.006, R: 0.5, corner: 0.015, taper: -0.35 }), [0.204, 0, chestZ + 0.02], [0, 0, 0], RED, 0.35);
  part("arc_reactor_housing", "chest_centre", mesh("disc", "arc_reactor_housing.stl", { radius: 0.035, depth: 0.008, chamfer: 0.005 }), [0.004, 0, 0.02], [0, PI / 2, 0], GUN, 0.20);
  part("arc_reactor", "arc_reactor_housing", mesh("disc", "arc_reactor.stl", { radius: 0.027, depth: 0.005, chamfer: 0.002 }), [0, 0, 0.008], [0, 0, 0], GLOW, 0.05);
  // red abdominal segments fold with the trunk
  const abZ = [0.215, 0.145, 0.075], abW = [0.255, 0.235, 0.215], abX = [0.175, 0.164, 0.153];
  for (let i = 0; i < 3; i++)
    part(`ab_plate_${i + 1}`, "spine_frame", mesh("armour_plate", `ab_plate_${i + 1}.stl`, { w: abW[i], h: 0.069, t: 0.005, R: 0.20, corner: 0.012 }), [abX[i], 0, abZ[i]], [0, 0, 0], RED, 0.22, { axis: [0, 1, 0], open: 0.35, effort: 2 });
  // side plates close the gap between chest and back; hinged on their rear edge, they are the torso's donning doors
  for (const [s, sign] of SIDES)
    part(`${s}_lat_plate`, "spine_frame", mesh("limb_shell", `${s}_lat_plate.stl`, {length:.40,rTop:.198,rBottom:.163,a0:sign>0?.55:-2.60,a1:sign>0?2.60:-.55,thick:.005}, [.72,1,1]), [-.10,sign*.10,chestZ+.11], [0,0,0], GUN, .60, {axis:[0,0,1],open:sign*1.2,effort:4,origin:[.10,-sign*.10,0]});
  // back shell over the battery pack, with the Mark 43's flight-stabiliser flaps (hinged at their top edge)
  part("back_shell", "spine_frame", mesh("armour_plate", "back_shell.stl", { w: 0.38, h: 0.46, t: 0.006, R: 0.45, corner: 0.03 }), [-0.29, 0, chestZ - 0.02], [0, 0, PI], RED, 1.3);
  for (const [s, sign] of SIDES) {
    part(`${s}_flight_flap`, "back_shell", mesh("armour_plate", `${s}_flight_flap.stl`, { w: 0.12, h: 0.18, t: 0.004, R: 0.5, corner: 0.015, taper: 0.3 }), [0.008, -sign * 0.10, 0.21], [0, 0, 0], RED, 0.18, { axis: [0, 1, 0], open: -1.0, effort: 2, origin: [0, 0, -0.09] });
    part(`${s}_back_vent`, "back_shell", mesh("disc", `${s}_back_vent.stl`, { radius: 0.03, depth: 0.012, chamfer: 0.003 }), [0.010, -sign * 0.09, -0.14], [0, PI/2, 0], GUN, 0.05);
  }
  // pelvis: slimmer exo frame box under a red belt (front + rear) and the hip flaps
  const pelvis = spec.links.find((l) => l.name === "pelvis_frame")!;
  pelvis.geometry = mesh("ring","pelvis_frame.stl",{outer:.17,inner:.155,height:.09},[.22/.34,1,1]); pelvis.origin = pose([0, 0, A.hipZ + 0.065]);
  part("belt_plate", "pelvis_frame", mesh("armour_plate", "belt_plate.stl", { w: 0.34, h: 0.075, t: 0.006, R: 0.6, corner: 0.02 }), [0.14, 0, A.hipZ + 0.02], [0, 0, 0], RED, 0.7);
  part("rear_belt_plate", "pelvis_frame", mesh("armour_plate", "rear_belt_plate.stl", { w: 0.34, h: 0.075, t: 0.006, R: 0.6, corner: 0.02 }), [-0.14, 0, A.hipZ + 0.02], [0, 0, PI], RED, 0.7);
  part("codpiece", "pelvis_frame", mesh("armour_plate", "codpiece.stl", { w: 0.13, h: 0.14, t: 0.006, R: 0.15, corner: 0.03, taper: 0.4 }), [0.15, 0, A.hipZ - 0.04], [0, 0, 0], RED, 0.35, { axis: [0, 1, 0], open: 0.6, effort: 2, origin: [0, 0, -0.07] });

  // Angled gold lateral rib plates flank the red segmented abdomen.
  for(const [side,sign] of SIDES) {
    for(let i=0;i<3;i++) part(`${side}_rib_${i}`,"spine_frame",mesh("mark43_panel",`${side}_rib_${i}.stl`,{style:"flank",w:.105,h:.054,t:.004,R:.30}),[.090-i*.006,sign*(.170-i*.009),.23-i*.065],[0,sign*.13,sign*1.02],GOLD,.08);
    part(`${side}_chest_inlay`,`${side}_chest_door`,mesh("mark43_panel",`${side}_chest_inlay.stl`,{style:"flank",w:.110,h:.175,t:.004,R:.22}),[.068,-sign*.086,-.025],[0,0,sign*.78],"mk43_titanium",.09);
    part(`${side}_chest_inlay_centre`,`${side}_chest_door`,mesh("mark43_panel",`${side}_chest_inlay_centre.stl`,{style:"flank",w:.075,h:.130,t:.003,R:.22}),[.074,-sign*.080,-.025],[0,0,sign*.78],RED,.06);
  }

  // ================= ARMS =================
  // limb shells are centred on the wearer's limb axis (0.05 inboard of the strut); the fixed outer shell wraps
  // front→outside→back, the inner clamshell hinges on the front seam and swings outward for donning
  const wrap = (r: number, sign: number) => ({ outer: { a0: sign > 0 ? -1.05 : -3.67, a1: sign > 0 ? 3.67 : 1.05 }, inner: { a0: sign > 0 ? -2.62 : 1.05, a1: sign > 0 ? -1.05 : 2.62 }, seam: [r * Math.cos(1.05), -sign * r * Math.sin(1.05)] as [number, number] });
  for (const [s, sign] of SIDES) {
    // red pauldron: dome capping the shoulder module, tilted outward, lifts on an x hinge
    part(`${s}_pauldron`, `${s}_shoulder_module`, mesh("mark43_shoulder", `${s}_pauldron.stl`, { side:sign }), [0, sign * 0.025, 0.035], [-sign * 0.22, 0, 0], RED, 0.65, { axis: [1, 0, 0], open: -sign * 0.8, effort: 3 });
    part(`${s}_pauldron_edge`, `${s}_pauldron`, mesh("armour_plate", `${s}_pauldron_edge.stl`, { w: 0.09, h: 0.03, t: 0.004, R: 0.13, corner: 0.008 }), [0.107, 0, 0.024], [0, 0, 0], "mk43_titanium", 0.06);
    // bicep: gold outer sleeve + gold inner clamshell
    const ua = 0.075, uw = wrap(ua, sign), uz = -A.uarm * 0.12, uy = -sign * 0.05;
    part(`${s}_bicep_sleeve`, `${s}_upper_arm_strut`, mesh("limb_shell", `${s}_bicep_sleeve.stl`, { length: A.uarm * 0.82, rTop: ua, rBottom: ua - 0.01, ...uw.outer, thick: 0.005, bulge: 0.04 }), [0, uy, uz], [0, 0, 0], GOLD, 0.45);
    part(`${s}_bicep_clamshell`, `${s}_upper_arm_strut`, mesh("limb_shell", `${s}_bicep_clamshell.stl`, { length: A.uarm * 0.82, rTop: ua, rBottom: ua - 0.01, ...uw.inner, thick: 0.005, bulge: 0.04 }),
      [uw.seam[0], uy + uw.seam[1], uz], [0, 0, 0], GOLD, 0.25, { axis: [0, 0, 1], open: -sign * 1.4, effort: 3, origin: [-uw.seam[0], -uw.seam[1], 0] });
    part(`${s}_elbow_cap`, `${s}_elbow_module`, mesh("dome", `${s}_elbow_cap.stl`, { radius: 0.055, height: 0.04, thick: 0.004 }), [-0.055, uy, 0], [0, -PI / 2, 0], RED, 0.18, { axis: [0, 1, 0], open: 0.5, effort: 2 });
    // forearm gauntlet: red outer sleeve + gold inner clamshell + gold missile hatch on the outer face
    const fa = 0.066, fw = wrap(fa, sign), fz = -A.farm * 0.11, fy = -sign * 0.045;
    part(`${s}_gauntlet_sleeve`, `${s}_forearm_strut`, mesh("limb_shell", `${s}_gauntlet_sleeve.stl`, { length: A.farm * 0.87, rTop: fa, rBottom: fa - 0.012, ...fw.outer, thick: 0.005, bulge: 0.02 }), [0, fy, fz], [0, 0, 0], RED, 0.40);
    part(`${s}_gauntlet_clamshell`, `${s}_forearm_strut`, mesh("limb_shell", `${s}_gauntlet_clamshell.stl`, { length: A.farm * 0.87, rTop: fa, rBottom: fa - 0.012, ...fw.inner, thick: 0.005, bulge: 0.02 }),
      [fw.seam[0], fy + fw.seam[1], fz], [0, 0, 0], GOLD, 0.22, { axis: [0, 0, 1], open: -sign * 1.4, effort: 3, origin: [-fw.seam[0], -fw.seam[1], 0] });
    part(`${s}_gauntlet_stripe`, `${s}_gauntlet_sleeve`, mesh("armour_plate", `${s}_gauntlet_stripe.stl`, { w: 0.03, h: 0.10, t: 0.003, R: 0.07, corner: 0.006 }), [fa + 0.001, 0, -0.09], [0, 0, 0], GOLD, 0.03);
    part(`${s}_gauntlet_hatch`, `${s}_gauntlet_sleeve`, mesh("armour_plate", `${s}_gauntlet_hatch.stl`, { w: 0.045, h: 0.04, t: 0.003, R: 0.07, corner: 0.006 }), [0, sign * (fa + 0.002), -0.035], [0, 0, sign * PI / 2], GOLD, 0.05, { axis: [0, 1, 0], open: -1.2, effort: 1.5, origin: [0, 0, -0.02] });
    // hand: red plate over the back of the hand platform, repulsor in the palm, gold articulated fingers
    part(`${s}_hand_plate`, `${s}_hand`, mesh("armour_plate", `${s}_hand_plate.stl`, { w: 0.09, h: 0.12, t: 0.005, R: 0.09, corner: 0.015 }), [0.035, fy, -0.017], [0, -PI / 2, 0], RED, 0.18);
    part(`${s}_palm_repulsor`, `${s}_hand`, mesh("disc", `${s}_palm_repulsor.stl`, { radius: 0.026, depth: 0.008, chamfer: 0.002 }), [0.03, fy, -0.056], [PI, 0, 0], GLOW, 0.06);
    // Three distinct phalanges per finger. Their local +X follows the hand;
    // +Y flexion curls toward the palm (-Z), rather than moving a rigid strip.
    for (let f = 0; f < 4; f++) {
      const lengths = [[.033,.023,.017],[.036,.025,.018],[.034,.024,.017],[.027,.019,.015]][f];
      let parent = `${s}_hand`;
      for(let k=0;k<3;k++) {
        const name=k===0?`${s}_finger_${f+1}`:`${s}_finger_${f+1}_${k===1?"middle":"distal"}`;
        const len=lengths[k];
        part(name,parent,mesh("mark43_panel",`${name}.stl`,{style:"gauntlet",w:.017,h:len-.009,t:.009,R:.25}),
          k===0?[.100,fy-.030+f*.020,-.030]:[lengths[k-1],0,0],
          [0,0,0],RED,.012,{axis:[0,1,0],open:k===1?1.55:1.15,effort:.35});
        const finger=spec.links.at(-1)!;
        finger.origin=pose([len/2,0,.004],[0,PI/2,0]);
        part(`${name}_knuckle`,name,mesh("disc",`${name}_knuckle.stl`,{radius:.0035,depth:.018,chamfer:.0007}),
          [0,-.009,0],[-PI/2,0,0],GUN,.003);
        parent=name;
      }
    }
    // Two thumb segments, with a splayed base frame for opposition.
    part(`${s}_thumb`,`${s}_hand`,mesh("mark43_panel",`${s}_thumb.stl`,{style:"gauntlet",w:.020,h:.030,t:.010,R:.25}),
      [.040,fy-sign*.048,-.03],[0,0,-sign*.85],RED,.016,{axis:[0,1,0],open:1.0,effort:.4});
    spec.links.at(-1)!.origin=pose([.017,0,.004],[0,PI/2,0]);
    part(`${s}_thumb_distal`,`${s}_thumb`,mesh("mark43_panel",`${s}_thumb_distal.stl`,{style:"gauntlet",w:.018,h:.023,t:.009,R:.25}),
      [.034,0,0],[0,0,0],RED,.012,{axis:[0,1,0],open:1.2,effort:.3});
    spec.links.at(-1)!.origin=pose([.013,0,.004],[0,PI/2,0]);
  }

  // ================= LEGS =================
  for (const [s, sign] of SIDES) {
    const ly = -sign * 0.045;   // wearer's leg axis, inboard of the strut
    // hip flap on the pelvis side, hinged at its top edge
    part(`${s}_hip_flap`, "pelvis_frame", mesh("armour_plate", `${s}_hip_flap.stl`, { w: 0.14, h: 0.15, t: 0.006, R: 0.18, corner: 0.03, taper: 0.2 }), [0.0, sign * (A.hipY + 0.105), A.hipZ + 0.075], [0, 0, sign * PI / 2], RED, 0.38, { axis: [0, 1, 0], open: -0.7, effort: 2, origin: [0, 0, -0.075] });
    // thigh: red outer shell + red inner clamshell
    const tr = 0.110, tw = wrap(tr, sign), tz = -A.thigh * 0.10;
    part(`${s}_thigh_shell`, `${s}_thigh_strut`, mesh("limb_shell", `${s}_thigh_shell.stl`, { length: A.thigh * 0.88, rTop: tr, rBottom: tr - 0.02, ...tw.outer, thick: 0.006, bulge: 0.03 }), [0, ly, tz], [0, 0, 0], RED, 0.85);
    part(`${s}_thigh_clamshell`, `${s}_thigh_strut`, mesh("limb_shell", `${s}_thigh_clamshell.stl`, { length: A.thigh * 0.88, rTop: tr, rBottom: tr - 0.02, ...tw.inner, thick: 0.006, bulge: 0.03 }),
      [tw.seam[0], ly + tw.seam[1], tz], [0, 0, 0], RED, 0.48, { axis: [0, 0, 1], open: -sign * 1.4, effort: 3, origin: [-tw.seam[0], -tw.seam[1], 0] });
    part(`${s}_knee_cap`, `${s}_knee_module`, mesh("mark43_panel", `${s}_knee_cap.stl`, {style:"knee",w:.12,h:.145,t:.012,R:.20}), [0.085, ly, 0], [0, 0, 0], RED, 0.30, { axis: [0, 1, 0], open: -0.6, effort: 2 });
    // shin: red outer shell + red inner (calf) clamshell
    const sr = 0.094, sw = wrap(sr, sign), sz = -A.shank * 0.10;
    part(`${s}_shin_shell`, `${s}_shank_strut`, mesh("limb_shell", `${s}_shin_shell.stl`, { length: A.shank * 0.88, rTop: sr, rBottom: sr - 0.02, ...sw.outer, thick: 0.006, bulge: 0.02 }), [0, ly, sz], [0, 0, 0], RED, 0.65);
    part(`${s}_calf_clamshell`, `${s}_shank_strut`, mesh("limb_shell", `${s}_calf_clamshell.stl`, { length: A.shank * 0.88, rTop: sr, rBottom: sr - 0.02, ...sw.inner, thick: 0.006, bulge: 0.02 }),
      [sw.seam[0], ly + sw.seam[1], sz], [0, 0, 0], RED, 0.42, { axis: [0, 0, 1], open: -sign * 1.4, effort: 3, origin: [-sw.seam[0], -sw.seam[1], 0] });
    // boot (frame: ankle joint; sole box top at z −0.07, bottom −0.105, toe at x 0.18, heel at x −0.14)
    part(`${s}_shin_stripe`, `${s}_shin_shell`, mesh("mark43_limb_inset",`${s}_shin_stripe.stl`,{style:"shin",length:A.shank*.88,rTop:sr,rBottom:sr-.02,a0:-.50,a1:.50,u0:.12,u1:.90,offset:.003}),[0,0,0],[0,0,0],GOLD,.05);
    part(`${s}_thigh_stripe`, `${s}_thigh_shell`, mesh("mark43_limb_inset",`${s}_thigh_stripe.stl`,{style:"thigh",length:A.thigh*.88,rTop:tr,rBottom:tr-.02,a0:-.85,a1:.85,u0:.08,u1:.87,offset:.003}),[0,0,0],[0,0,0],GOLD,.05);
    part(`${s}_shin_guard`, `${s}_boot`, mesh("armour_plate", `${s}_shin_guard.stl`, { w: 0.10, h: 0.10, t: 0.005, R: 0.10, corner: 0.02 }), [0.09, ly, 0.06], [0, 0, 0], RED, 0.26, { axis: [0, 1, 0], open: -0.7, effort: 2, origin: [0, 0, -0.05] });
    part(`${s}_boot_toe`, `${s}_boot`, mesh("mark43_boot", `${s}_boot_toe.stl`), [0, ly, 0], [0, 0, 0], RED, 0.30);
    part(`${s}_boot_trim`, `${s}_boot`, mesh("mark43_panel", `${s}_boot_trim.stl`, { style:"shin", w: 0.075, h: 0.08, t: 0.005, R: 0.12, corner: 0.01 }), [0.10, ly, -0.03], [0, -0.75, 0], GOLD, 0.12);
    part(`${s}_heel_thruster`, `${s}_boot`, mesh("disc", `${s}_heel_thruster.stl`, { radius: 0.028, depth: 0.03, chamfer: 0.004 }), [-0.14, ly, -0.068], [0, -PI / 2, 0], GLOW, 0.12);
    part(`${s}_thruster_cover`, `${s}_boot`, mesh("armour_plate", `${s}_thruster_cover.stl`, { w: 0.08, h: 0.07, t: 0.004, R: 0.1, corner: 0.01 }), [-0.145, ly, -0.02], [0, 0, PI], RED, 0.07, { axis: [0, 1, 0], open: -1.3, effort: 1.5, origin: [0, 0, -0.03] });
    part(`${s}_ankle_flap`, `${s}_boot`, mesh("armour_plate", `${s}_ankle_flap.stl`, { w: 0.06, h: 0.08, t: 0.004, R: 0.08, corner: 0.01 }), [0.0, ly + sign * 0.13, 0.02], [0, 0, sign * PI / 2], RED, 0.09, { axis: [0, 1, 0], open: -0.8, effort: 1.5, origin: [0, 0, -0.04] });
  }

  // Layered shields and narrow metallic edge details break up the large shells.
  spec.materials.push({name:"mk43_titanium",color:[.40,.43,.46,1]});
  for(const [side,sign] of SIDES) {
    const ly=-sign*.045;
    part(`${side}_clavicle_cover`,`${side}_shoulder_module`,mesh("mark43_panel",`${side}_clavicle_cover.stl`,{style:"collar",w:.095,h:.075,t:.004,R:.25}),[.071,-sign*.015,.012],[0,0,0],RED,.05);
    part(`${side}_back_scapula`,"back_shell",mesh("mark43_panel",`${side}_back_scapula.stl`,{style:"pectoral",w:.16,h:.18,t:.006,R:.4}),[.015,sign*.093,.07],[0,0,-sign*.16],RED,.10);
    for(let i=0;i<3;i++)part(`${side}_back_grille_${i}`,"back_shell",mesh("mark43_panel",`${side}_back_grille_${i}.stl`,{style:"collar",w:.10,h:.012,t:.004,R:.4}),[.024,sign*.10,-.055-i*.023],[0,0,0],GUN,.01);

    part(`${side}_hip_cowl`,`${side}_hip_module`,mesh("mark43_limb",`${side}_hip_cowl.stl`,{style:"arm",length:.10,rTop:.086,rBottom:.080,a0:-1.5,a1:4.7,thick:.004}),[0,0,0],[sign*PI/2,0,0],RED,.12);
    part(`${side}_hip_outer_plate`,`${side}_hip_module`,mesh("mark43_panel",`${side}_hip_outer_plate.stl`,{style:"thigh",w:.125,h:.16,t:.005,R:.3}),[0,sign*.102,0],[0,0,sign*PI/2],RED,.10);
    for(const [region,length,rTop,rBottom] of [["thigh",A.thigh*.88,.110,.090],["shin",A.shank*.88,.094,.074]] as const) {
      const parent=`${side}_${region}_shell`,params={style:region,length,rTop,rBottom};
      part(`${side}_${region}_ridge`,parent,mesh("mark43_limb_inset",`${side}_${region}_ridge.stl`,{...params,a0:-.18,a1:.18,u0:.15,u1:.82,offset:.006}),[0,0,0],[0,0,0],RED,.07);
      part(`${side}_${region}_edge`,parent,mesh("mark43_limb_inset",`${side}_${region}_edge.stl`,{...params,a0:sign>0?.78:-.85,a1:sign>0?.85:-.78,u0:.13,u1:.82,offset:.006}),[0,0,0],[0,0,0],"mk43_titanium",.025);
    }
    part(`${side}_knee_bezel`,`${side}_knee_cap`,mesh("mark43_panel",`${side}_knee_bezel.stl`,{style:"knee",w:.09,h:.115,t:.003,R:.20}),[.006,0,.005],[0,0,0],GUN,.04);
    part(`${side}_knee_face`,`${side}_knee_cap`,mesh("mark43_panel",`${side}_knee_face.stl`,{style:"knee",w:.077,h:.090,t:.004,R:.20}),[.012,0,.009],[0,0,0],RED,.04);
    for(const [region,radius,depth] of [["knee",.063,.084],["ankle",.053,.074],["elbow",.048,.074]] as const)
      part(`${side}_${region}_motor_cover`,`${side}_${region}_module`,mesh("disc",`${side}_${region}_motor_cover.stl`,{radius,depth:.009,chamfer:.006}),[0,sign*depth,0],[-sign*PI/2,0,0],RED,.05);
    part(`${side}_bicep_front`,`${side}_bicep_sleeve`,mesh("mark43_limb_inset",`${side}_bicep_front.stl`,{style:"arm",length:A.uarm*.82,rTop:.075,rBottom:.065,a0:-.42,a1:.42,u0:.12,u1:.88,offset:.003}),[0,0,0],[0,0,0],RED,.06);
    part(`${side}_forearm_crest`,`${side}_gauntlet_sleeve`,mesh("mark43_limb_inset",`${side}_forearm_crest.stl`,{style:"forearm",length:A.farm*.87,rTop:.066,rBottom:.054,a0:-.6,a1:.6,u0:.08,u1:.88,offset:.004}),[0,0,0],[0,0,0],RED,.06);
  }

  // Film production photos show silver edge trim, small mechanical interfaces
  // and segmented knuckle armour, not additional large gold rectangles.
  for(const [side,sign] of SIDES) {
    for(let i=0;i<3;i++) {
      part(`${side}_rib_edge_${i}`,"spine_frame",mesh("mark43_panel",`${side}_rib_edge_${i}.stl`,{style:"flank",w:.086,h:.041,t:.0025,R:.30}),[.093-i*.006,sign*(.176-i*.009),.23-i*.065],[0,sign*.13,sign*1.02],"mk43_titanium",.025);
      part(`${side}_rib_insert_${i}`,"spine_frame",mesh("mark43_panel",`${side}_rib_insert_${i}.stl`,{style:"flank",w:.067,h:.027,t:.002,R:.30}),[.095-i*.006,sign*(.179-i*.009),.23-i*.065],[0,sign*.13,sign*1.02],GUN,.012);
    }
    part(`${side}_collar_inlay`,"spine_frame",mesh("mark43_panel",`${side}_collar_inlay.stl`,{style:"collar",w:.095,h:.041,t:.003,R:.4}),[.165,sign*.102,T-.014],[0,0,0],"mk43_titanium",.03);

  }
  const detailedHinges=spec.joints.filter(j=>j.name.endsWith('_hinge')&&/chest_door|lat_plate|thigh_clamshell|gauntlet_clamshell/.test(j.name));
  for(const hinge of detailedHinges) {
    // 3 mm pin with 3.2 mm bore. These are dimensioned interface concepts;
    // leaf brackets, retention and bearing/load qualification remain unverified.
    const ringGeom=mesh("ring",`${hinge.child}_hinge_knuckle.stl`,{outer:.0055,inner:.0016,height:.009});
    part(`${hinge.child}_moving_knuckle`,hinge.child,ringGeom,[0,0,0],[0,0,0],"mk43_titanium",.006);
    for(const sign of [-1,1])part(`${hinge.child}_fixed_knuckle_${sign>0?"upper":"lower"}`,hinge.parent,ringGeom,
      [hinge.origin.xyz[0],hinge.origin.xyz[1],hinge.origin.xyz[2]+sign*.0105],hinge.origin.rpy,"mk43_titanium",.006);
    part(`${hinge.child}_hinge_pin`,hinge.child,{type:"cylinder",radius:.0015,length:.034},[0,0,0],[0,0,0],GUN,.0019);
  }
  spec.metadata.notes.push("Added 3 mm pin / 3.2 mm bore hinge interfaces and layered rib/knuckle detail. Pins and bores are dimensioned concepts, not structurally qualified mounting assemblies; manual release and ventilation are unverified.");

  spec.metadata.notes.push("Neck yaw/pitch and three-segment fingers are independently articulated concepts. Joint limits and actuator loads are provisional; no tendon routing, human neck clearance or grasp force is validated.");
  spec.metadata.notes.push(`Iron Man Mark 43 (Age of Ultron) as a wearable powered exoskeleton under polygon-mesh armour: ${hinges} servo-driven hinged plates (motorised helmet: faceplate, crown panel, two cheek panels, chin guard; chest doors, torso side doors, flight-stabiliser flaps, folding ab segments, codpiece, pauldrons, bicep/gauntlet clamshells, gauntlet hatches, fingers, hip flaps, thigh/calf clamshells, knee caps, shin guards, thruster covers, ankle flaps). Panel map and palette follow the Mark 43 layout; repulsors/thrusters are mount points, not modelled propulsion.`);
  return spec;
}
