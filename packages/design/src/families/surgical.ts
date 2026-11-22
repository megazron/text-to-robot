// A tabletop surgical robot for teaching and research: instrument arms and a camera arm round a laparoscopic trainer box,
// each arm built as a spherical remote-centre-of-motion (RCM) mechanism, the layout research systems such as the Raven use.
// Two servos turn the arm about two axes that cross at the port in the trainer's lid, so the instrument shaft always passes
// through that one point, as a laparoscopic instrument pivots in the incision. A rail on the second link carries the
// instrument in and out along its shaft (a servo-driven GT2 belt); on the carriage a third servo rolls the instrument, whose
// housing carries the wrist and jaw servos that pull the tip by cables through the 6 mm carbon shaft.
//
// What it is: an educational and research model of how a teleoperated surgical robot moves, built from bought servos and
// printed parts, to be used on practice pads in the trainer box. What it is not: a medical device. It has no regulatory
// clearance, no sterile barrier, no force sensing and no certified safety system, and it must never be used on a person or
// an animal.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, electrical, type Vec3 } from "@ttr/parts";
import { frame, mul, invert, apply, translation, I4, type Mat4, type Op } from "@ttr/solid";
import { Assembly, printedGeometry } from "../assembly.ts";
import { fk, worstTorques, axisInertias, totalMass, type PointLoad } from "../kin.ts";
import { LADDERS, choose, evaluate, DYNAMIC_FACTOR } from "../sizing.ts";
import { controlCase } from "../enclosure.ts";
import { Harness } from "../wiring.ts";
import { wireFixedArm } from "./arm.ts";
import { limitsFromGeometry } from "./legkit.ts";
import { tubeLink, buyTubeStock } from "./common.ts";

export type SurgicalTool = "grasper" | "blade" | "needle" | "drill";
export interface SurgicalRequest {
  name?: string; prompt?: string; budget?: number;
  /** one entry per instrument arm, in order round the trainer (grasper: wrist and jaws; blade / needle: a tool holder on the wrist) */
  instruments: SurgicalTool[];
  /** a camera arm (an endoscope with a camera at its tip) beside the instruments */
  camera?: boolean;
}
export const MAX_SURGICAL_ARMS = 4;

// ---------------------------------------------------------------------------------------------- geometry (mm, degrees)
const TOP = 150;            // trainer lid's top face above the base plate
const LID = 4;              // acrylic lid
const BOX = 270;            // trainer box, outside, square
const PORT_R = 62;          // ports on a circle round the lid's centre
const RCM_DEPTH = 2;        // the remote centre sits in the middle of the lid (the "abdominal wall")
const TAU = 22, TH1 = 55, BETA = 50;   // shaft lean outward; yaw axis lean outward; pitch axis between shaft and tangent
const D1 = 106, D2 = 106;   // RCM point to each servo's output face along its axis
const PLATE = 4, WALL = 3;
const XR = 66, RG = 22;     // insertion rail: rods at x_s = XR, y_s = +-RG in the shaft frame
const R_TIP = 14;           // wrist axis below the RCM point at the home pose (insertion 0)
const R_HB = 150;           // instrument housing's lower face, up the shaft from the RCM point
const R_ROLL = 216;         // roll servo's output face
const ROD = "rod_8mm_h8_130", ROD_L = 130, R_ROD0 = 142;   // rods from r = 142 to 272
const R_CAR = 234;          // carriage (bushing) centre at home
const SHAFT = "cf_tube_6x4_1m";
const SERVO_BASE = "feetech_sts3215_c047";
const G = 9.81;

const v = (x: number, y: number, z: number): Vec3 => [x, y, z];
const add = (...a: Vec3[]): Vec3 => a.reduce((s, b) => [s[0] + b[0], s[1] + b[1], s[2] + b[2]], [0, 0, 0] as Vec3);
const sc = (k: number, a: Vec3): Vec3 => [k * a[0], k * a[1], k * a[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => sc(1 / Math.hypot(...a), a);
const rad = (d: number) => (d * Math.PI) / 180;
const at = (T: Mat4, of: Op[]): Op => ({ op: "at", T, of });
const bodyOf = (key: string) => part(key).bbox_mm!;

/** One arm's directions (world) and the shaft frame: x_s outward across the shaft, y_s tangential, u0 up the shaft. */
function armFrame(phiDeg: number, portR: number) {
  const c = Math.cos(rad(phiDeg)), s = Math.sin(rad(phiDeg));
  const ex = v(c, s, 0), ey = v(-s, c, 0), ez = v(0, 0, 1);
  const O = v(portR * c, portR * s, TOP - RCM_DEPTH);
  const u0 = unit(add(sc(Math.sin(rad(TAU)), ex), sc(Math.cos(rad(TAU)), ez)));
  const xs = unit(add(sc(Math.cos(rad(TAU)), ex), sc(-Math.sin(rad(TAU)), ez)));
  const ys = ey;
  const a1 = unit(add(sc(Math.sin(rad(TH1)), ex), sc(Math.cos(rad(TH1)), ez)));
  const a2 = unit(add(sc(Math.cos(rad(BETA)), u0), sc(Math.sin(rad(BETA)), ys)));
  /** a point in the shaft frame (x_s, y_s, r along the shaft from the RCM point) */
  const S = (x: number, y: number, r: number): Vec3 => add(O, sc(x, xs), sc(y, ys), sc(r, u0));
  return { O, u0, xs, ys, a1, a2, S, ez };
}

/** The cradle box of a servo at pose T, grown by `pad` (world mm), as a box op in T's frame. */
const servoBlock = (key: string, pad: number): Op => { const b = bodyOf(key); return { op: "box", min: [b.min[0] - pad, b.min[1] - pad, b.min[2] - pad], max: [b.max[0] + pad, b.max[1] + pad, -2], r: 2 }; };

interface ArmPlan { prefix: string; phi: number; tool: SurgicalTool | "camera"; keys: { yaw: string; pitch: string } }

/** Build one arm on the base: its post, mount, RCM yaw and pitch, the insertion rail and carriage, roll, instrument. */
function buildArm(A: Assembly, p: ArmPlan, portR: number) {
  const { O, u0, xs, ys, a1, a2, S } = armFrame(p.phi, portR);
  const n = (s: string) => `${p.prefix}_${s}`;
  // the insertion rail stands beside the shaft on the pitch servo's side (+y_s): rail coordinates (p across the shaft
  // towards the rail, q along the rail's width, r up the shaft)
  const rd = ys, rq = sc(-1, xs);
  const SR = (pp: number, q: number, r: number): Vec3 => add(O, sc(pp, rd), sc(q, rq), sc(r, u0));
  const insertKey = SERVO_BASE, rollKey = SERVO_BASE, tipKey = SERVO_BASE;
  // ---- frames (world mm, home pose). Each servo's output axis is +z of its frame; its body lies towards -x and -z.
  const W1 = frame(add(O, sc(D1, a1)), sc(-1, a1), ys);                 // yaw servo: axis through the RCM point
  const W2 = frame(add(O, sc(D2, a2)), sc(-1, a2), sc(-1, xs));         // pitch servo: axis through the RCM point, body outward
  const Wc = frame(S(0, 0, R_CAR), sc(-1, u0), xs);                     // carriage: insertion runs along -u0 (towards the port)
  const Wr = frame(S(0, 0, R_ROLL), sc(-1, u0), xs);                    // roll servo output, coaxial with the shaft
  const Wins = frame(SR(XR, -9, R_ROD0 + ROD_L + 32), rq, sc(-1, u0));   // insertion servo: axis along y_s, body up the rail
  const rel = (P: Mat4, C: Mat4) => mul(invert(P), C);
  const inFrame = (W: Mat4, ops: Op[]): Op[] => [{ op: "at", T: invert(W), of: ops }];

  // ---- the post: an aluminium tube from the base plate up beside the trainer, and the printed mount on its top
  const c = Math.cos(rad(p.phi)), s = Math.sin(rad(p.phi));
  const P1 = add(O, sc(D1, a1));
  const postR = Math.max(BOX / 2 + 32, portR + D1 * Math.sin(rad(TH1)) + 46), postXY = v(postR * c, postR * s, 0), postTop = P1[2] - 34;
  tubeLink(A, "base_link", I4(), n("post"), v(postXY[0], postXY[1], 2), v(postXY[0], postXY[1], postTop), "al_tube_25x2_1m", "arm posts");
  const Wm = translation(v(postXY[0], postXY[1], postTop));
  const mountOps: Op[] = [
    // split clamp round the tube's top (25 mm), 40 mm tall
    { op: "rod", a: v(postXY[0], postXY[1], postTop - 40), b: v(postXY[0], postXY[1], postTop + 6), r: 12.5 + 5 },
    { op: "hole", a: v(postXY[0], postXY[1], postTop - 41), b: v(postXY[0], postXY[1], postTop + 0.5), d: 25.4 },
    // from the clamp to the yaw servo's cradle
    { op: "hull", of: [{ op: "box", min: v(postXY[0] - 14, postXY[1] - 14, postTop - 2), max: v(postXY[0] + 14, postXY[1] + 14, postTop + 6) }, at(W1, [servoBlock(p.keys.yaw, WALL)])] },
    { op: "cradle", key: p.keys.yaw, T: W1, wall: WALL },
  ];
  A.printedLink(n("base_link"), { name: n("base_link"), ops: inFrame(Wm, mountOps) }, { role: "base", material: "printed_dark" });
  A.fixed(n("mount"), "base_link", n("base_link"), Wm);
  A.fastener("M4 x 30 socket head + nut (post clamp)", 2);

  // ---- RCM yaw: the yaw link carries the pitch servo, its axis also through the RCM point
  A.mount(n("base_link"), p.keys.yaw, rel(Wm, W1), n("rcm_yaw_actuator"), `${p.prefix}: RCM yaw`);
  A.revolute(n("rcm_yaw"), n("base_link"), n("yaw_link"), rel(Wm, W1), p.keys.yaw, -1.2, 1.2);
  // the yaw link goes out round the far side of the shaft's swept cylinder: horn, an elbow 92 mm out, the pitch cradle
  const elbow1 = add(O, sc(60, unit(add(sc(1, xs), sc(1, ys)))), sc(70, u0));
  const yawOps: Op[] = [
    at(W1, [{ op: "horn", key: p.keys.yaw, t: PLATE }]),
    { op: "hull", of: [at(W1, [{ op: "rod", a: v(0, 0, 0), b: v(0, 0, PLATE), r: 13 }]), { op: "rod", a: elbow1, b: elbow1, r: 9 }] },
    { op: "hull", of: [{ op: "rod", a: elbow1, b: elbow1, r: 9 }, at(W2, [servoBlock(p.keys.pitch, WALL)])] },
    { op: "cradle", key: p.keys.pitch, T: W2, wall: WALL },
  ];
  A.printedLink(n("yaw_link"), { name: n("yaw_link"), ops: inFrame(W1, yawOps) }, { material: "printed_accent" });
  A.fastener("horn screws", 4);
  A.fastener("M2 x 6 case screws", 8);

  // ---- RCM pitch: the pitch link carries the insertion rail along the shaft, its servo, belt pulley and idler
  A.mount(n("yaw_link"), p.keys.pitch, rel(W1, W2), n("rcm_pitch_actuator"), `${p.prefix}: RCM pitch`);
  A.revolute(n("rcm_pitch"), n("yaw_link"), n("pitch_link"), rel(W1, W2), p.keys.pitch, -1.0, 1.0);
  const r0 = R_ROD0, r1 = R_ROD0 + ROD_L, blk = 14;
  const block = (rA: number, rB: number): Op => ({ op: "hull", of: [{ op: "rod", a: SR(XR - 10, -RG - 9, rA), b: SR(XR - 10, -RG - 9, rB), r: 1 }, { op: "rod", a: SR(XR + 20, RG + 9, rA), b: SR(XR + 20, RG + 9, rB), r: 1 }, { op: "rod", a: SR(XR - 10, RG + 9, rA), b: SR(XR - 10, RG + 9, rB), r: 1 }, { op: "rod", a: SR(XR + 20, -RG - 9, rA), b: SR(XR + 20, -RG - 9, rB), r: 1 }] });
  const elbow2 = SR(78, 14, 98);
  const Wrail = frame(SR(XR, 0, 0), u0, rd);   // rail frame: z up the rods, origin on the belt line at r = 0
  const pitchOps: Op[] = [
    at(W2, [{ op: "horn", key: p.keys.pitch, t: PLATE }]),
    { op: "hull", of: [at(W2, [{ op: "rod", a: v(0, 0, 0), b: v(0, 0, PLATE), r: 13 }]), { op: "rod", a: elbow2, b: elbow2, r: 9 }] },
    { op: "hull", of: [{ op: "rod", a: elbow2, b: elbow2, r: 9 }, { op: "rod", a: SR(XR + 4, RG + 6, r0 - blk - 6), b: SR(XR + 4, RG + 6, r0 - blk - 1), r: 8 }] },
    // the arm ends in a flange bolted under the lower block (M4 x 2)
    { op: "hull", of: [{ op: "rod", a: SR(XR + 4, RG + 6, r0 - blk - 6), b: SR(XR + 4, RG + 6, r0 - blk - 0.01), r: 9 }, at(Wrail, [{ op: "box", min: [-8, RG - 9, r0 - blk - 6], max: [18, RG + 9, r0 - blk - 0.01] }])] },
  ];
  const railOps: Op[] = [
    block(r0 - blk, r0 + 6), block(r1 - 6, r1 + blk),
    // the spine behind the rods joins the blocks; the insertion servo's cradle stands on the upper block
    { op: "hull", of: [{ op: "rod", a: SR(XR + 18, -RG, r0 - blk + 1), b: SR(XR + 18, -RG, r1 + blk - 1), r: 3 }, { op: "rod", a: SR(XR + 18, RG, r0 - blk + 1), b: SR(XR + 18, RG, r1 + blk - 1), r: 3 }] },
    { op: "hull", of: [{ op: "rod", a: SR(XR - 6, -RG - 9, r1 + blk - 2), b: SR(XR + 14, -RG - 9, r1 + blk - 2), r: 2 }, at(Wins, [servoBlock(insertKey, WALL)])] },
    { op: "cradle", key: insertKey, T: Wins, wall: WALL },
    // rod pockets (8 mm, 6 mm deep) and belt slots through both blocks
    ...[-1, 1].flatMap((k): Op[] => [{ op: "hole", a: SR(XR, k * RG, r0 - 0.01), b: SR(XR, k * RG, r0 + 7), d: 8.2 }, { op: "hole", a: SR(XR, k * RG, r1 - 7), b: SR(XR, k * RG, r1 + 0.01), d: 8.2 }]),
    // the belt runs through both blocks; the idler turns in the lower block's slot on an M3 axle across y_s
    at(Wrail, [{ op: "cutbox", min: [-11.5, -6, r0 - blk - 1], max: [11.5, 6, r0 + 7] }, { op: "cutbox", min: [-9, -6, r1 - 7], max: [9, 6, r1 + blk + 1] }]),
    { op: "hole", a: SR(XR, -RG + 6, r0 - 5), b: SR(XR, RG - 6, r0 - 5), d: 3.2 },
  ];
  A.printedLink(n("pitch_link"), { name: n("pitch_link"), ops: inFrame(W2, pitchOps) }, { material: "printed" });
  A.printedLink(n("rail"), { name: n("rail"), ops: inFrame(W2, railOps) }, { material: "printed" });
  A.fixed(n("rail_mount"), n("pitch_link"), n("rail"), I4());
  A.fastener("M4 x 16 + insert (rail to pitch arm)", 2);
  for (const k of [-1, 1]) A.mount(n("rail"), ROD, rel(W2, frame(SR(XR, k * RG, r0), u0, rd)), n(`rail_rod_${k > 0 ? "a" : "b"}`), `${p.prefix}: insertion rail rods`, "metal");
  A.mount(n("rail"), insertKey, rel(W2, Wins), n("insertion_actuator"), `${p.prefix}: insertion (GT2 belt)`);
  A.mount(n("rail"), "gt2_pulley_20t_5mm", rel(W2, frame(SR(XR, -8, R_ROD0 + ROD_L + 32), rq, u0)), n("insertion_pulley"), `${p.prefix}: insertion belt pulley (on a printed horn adapter)`, "metal");
  A.mount(n("rail"), "gt2_idler_20t_3mm", rel(W2, frame(SR(XR, -4.5, r0 - 5), rq, u0)), n("insertion_idler"), `${p.prefix}: insertion belt idler`, "metal");
  A.fastener("M3 x 25 + nut (idler axle)", 1);
  A.fastener("M3 set screw (rod pockets)", 4);

  // ---- insertion: the carriage on two LM8UU, clamped to the belt, carrying the roll servo coaxial with the shaft
  const stroke = Math.floor((R_CAR - 14 - 2) - (r0 + 6) - 1);   // the carriage stops 1 mm above the lower block
  const carOps: Op[] = [
    // bushing block across the rods and the arm to the roll servo's cradle
    { op: "hull", of: [{ op: "rod", a: SR(XR, -RG, R_CAR - 14), b: SR(XR, -RG, R_CAR + 14), r: 10.5 }, { op: "rod", a: SR(XR, RG, R_CAR - 14), b: SR(XR, RG, R_CAR + 14), r: 10.5 }] },
    { op: "hull", of: [at(Wrail, [{ op: "box", min: [-12, -14, R_CAR - 14], max: [-9, 14, R_CAR + 14] }]), at(Wr, [servoBlock(rollKey, WALL)])] },
    { op: "cradle", key: rollKey, T: Wr, wall: WALL },
    ...[-1, 1].flatMap((k): Op[] => [{ op: "hole", a: SR(XR, k * RG, R_CAR - 16), b: SR(XR, k * RG, R_CAR + 16), d: 9 }, { op: "hole", a: SR(XR, k * RG, R_CAR - 12.1), b: SR(XR, k * RG, R_CAR + 12.1), d: 15.1 }]),
    // the free belt strand passes through; the other is clamped under two M3 screws
    at(Wrail, [{ op: "cutbox", min: [2, -5, R_CAR - 20], max: [11, 5, R_CAR + 20] }]),
  ];
  A.printedLink(n("carriage"), { name: n("carriage"), ops: inFrame(Wc, carOps) }, { material: "printed_accent" });
  A.prismatic(n("insertion"), n("pitch_link"), n("carriage"), rel(W2, Wc), 0, stroke / 1000, 40, 0.03, [0, 0, 1]);
  for (const k of [-1, 1]) A.mount(n("carriage"), "lm8uu", rel(Wc, frame(SR(XR, k * RG, R_CAR), u0, rd)), n(`carriage_bushing_${k > 0 ? "a" : "b"}`), `${p.prefix}: carriage bushings`, "metal");
  A.fastener("M3 x 10 (belt clamp)", 2);

  // ---- roll: the instrument (housing, shaft and tip) turns on the roll servo
  A.mount(n("carriage"), rollKey, rel(Wc, Wr), n("instrument_roll_actuator"), `${p.prefix}: instrument roll`);
  A.revolute(n("instrument_roll"), n("carriage"), n("instrument"), rel(Wc, Wr), rollKey, -2.6, 2.6);
  const Wtip = frame(S(0, 0, -R_TIP), ys, u0);                // wrist axis along y_s
  const housing: Op[] = [at(Wr, [{ op: "horn", key: rollKey, t: PLATE }])];
  let toolNote = "";
  if (p.tool === "camera") {
    // the endoscope: a short housing that holds the shaft, and the camera head at the shaft's tip
    housing.push({ op: "hull", of: [at(Wr, [{ op: "rod", a: v(0, 0, 0), b: v(0, 0, PLATE), r: 13 }]), { op: "rod", a: S(0, 0, R_HB), b: S(0, 0, R_HB + 8), r: 9 }] });
    housing.push({ op: "hole", a: S(0, 0, R_HB - 1), b: S(0, 0, R_HB + 15), d: 6.1 });
    A.printedLink(n("instrument"), { name: n("instrument"), ops: inFrame(Wr, housing) }, { material: "printed_dark" });
    tubeLink(A, n("instrument"), Wr, n("shaft"), S(0, 0, -R_TIP + 6), S(0, 0, R_HB + 14), SHAFT, "instrument shafts");
    const cam = "fpv_camera_micro", cb = bodyOf(cam);
    const Wcam = frame(S(0, 0, -R_TIP - cb.max[2]), sc(-1, u0), xs);   // lens looking down the shaft
    const head: Op[] = [
      at(Wcam, [{ op: "box", min: [cb.min[0] - 2, cb.min[1] - 2, cb.min[2] - 2], max: [cb.max[0] + 2, cb.max[1] + 2, cb.max[2] - 3], r: 3 },
        { op: "cutbox", min: [cb.min[0] - 0.2, cb.min[1] - 0.2, cb.min[2] - 0.2], max: [cb.max[0] + 0.2, cb.max[1] + 0.2, cb.max[2] + 1] }]),
      { op: "rod", a: S(0, 0, -R_TIP + 1), b: S(0, 0, -R_TIP + 16), r: 6 },
      { op: "hole", a: S(0, 0, -R_TIP + 4), b: S(0, 0, -R_TIP + 17), d: 6.1 },
    ];
    A.printedLink(n("camera_head"), { name: n("camera_head"), ops: inFrame(Wr, head) }, { role: "sensor_mount", material: "printed_dark" });
    A.fixed(n("camera_head_mount"), n("instrument"), n("camera_head"), I4());
    A.mount(n("instrument"), cam, rel(Wr, Wcam), n("wrist_camera"), `${p.prefix}: endoscope camera`);
    A.spec.sensors.push({ name: n("wrist_camera"), type: "camera", parent: n("wrist_camera"), origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } });
    toolNote = "camera (19 mm analogue FPV camera in a printed endoscope head)";
    return { O, u0, stroke, tipLink: n("camera_head"), tipAt: apply(invert(Wr), S(0, 0, -R_TIP - cb.max[2])) as Vec3, toolNote, joints: [n("rcm_yaw"), n("rcm_pitch"), n("insertion"), n("instrument_roll")] };
  }
  // instrument housing: the wrist and jaw servos side by side, their output axes along +-y_s, capstans outside
  const Wws = frame(S(0, 40, R_HB + 22), ys, sc(-1, u0));
  const Wjs = frame(S(0, -40, R_HB + 22), sc(-1, ys), sc(-1, u0));
  housing.push(
    { op: "hull", of: [at(Wr, [{ op: "rod", a: v(0, 0, 0), b: v(0, 0, PLATE), r: 13 }]), at(Wws, [servoBlock(tipKey, WALL)]), at(Wjs, [servoBlock(tipKey, WALL)]), { op: "rod", a: S(0, 0, R_HB), b: S(0, 0, R_HB + 10), r: 7 }] },
    { op: "cradle", key: tipKey, T: Wws, wall: WALL }, { op: "cradle", key: tipKey, T: Wjs, wall: WALL },
    { op: "hole", a: S(0, 0, R_HB - 1), b: S(0, 0, R_HB + 15), d: 6.1 },
  );
  A.printedLink(n("instrument"), { name: n("instrument"), ops: inFrame(Wr, housing) }, { material: "printed_dark" });
  A.mount(n("instrument"), tipKey, rel(Wr, Wws), n("wrist_pitch_actuator"), `${p.prefix}: wrist (cable drive)`);
  tubeLink(A, n("instrument"), Wr, n("shaft"), S(0, 0, -R_TIP + 6), S(0, 0, R_HB + 14), SHAFT, "instrument shafts");
  // the wrist: a clevis on the shaft's tip, a pitch joint across it
  A.revolute(n("wrist_pitch"), n("instrument"), n("wrist"), rel(Wr, Wtip), tipKey, -1.2, 1.2);
  // the wrist: a hub on its pin, cheeks round the jaw pin 14 mm down, the fixed jaw beyond them
  const wristOps: Op[] = [
    at(Wtip, [{ op: "rod", a: [0, 0, -3.5], b: [0, 0, 3.5], r: 4 }, { op: "box", min: [-10.5, -3.5, -3.5], max: [-2, 3.5, 3.5] },
      { op: "hole", a: [0, 0, -5], b: [0, 0, 5], d: 1.6 }]),
  ];
  let tipLink = n("wrist"), tipAt: Vec3 = [-20, 0, 0];
  if (p.tool === "grasper") {
    A.mount(n("instrument"), tipKey, rel(Wr, Wjs), n("gripper_actuator"), `${p.prefix}: jaws (cable drive)`);
    // fixed jaw on the clevis, the moving jaw on its own pin
    for (const z of [-1, 1]) wristOps.push(at(Wtip, [{ op: "box", min: [-18, -3.5, z > 0 ? 1.7 : -3.5], max: [-9.5, 3.5, z > 0 ? 3.5 : -1.7] }]));
    wristOps.push(at(Wtip, [{ op: "box", min: [-32, -3.5, -3.5], max: [-17.2, -0.8, 3.5] }, { op: "hole", a: [-14, 0, -5], b: [-14, 0, 5], d: 1.6 }]));
    A.printedLink(n("wrist"), { name: n("wrist"), ops: inFrame(Wtip, wristOps) }, { material: "printed_accent" });
    const Wjaw = mul(Wtip, translation(v(-14, 0, 0)));
    A.revolute(n("gripper"), n("wrist"), n("jaw"), rel(Wtip, Wjaw), tipKey, -0.6, 0);
    A.printedLink(n("jaw"), { name: n("jaw"), ops: inFrame(Wjaw, [at(Wjaw, [{ op: "hull", of: [{ op: "rod", a: [0, 0, -1.4], b: [0, 0, 1.4], r: 3 }, { op: "box", min: [-6, 0.8, -1.4], max: [-4, 3.5, 1.4] }] },
      { op: "box", min: [-18, 0.8, -1.4], max: [-4, 3.5, 1.4], r: 0.5 }, { op: "hole", a: [0, 0, -5], b: [0, 0, 5], d: 1.6 }])]) }, { role: "gripper", material: "printed_accent" });
    A.spec.end_effectors.push({ name: n("gripper"), type: "two_finger_gripper", attach_link: n("wrist") });
    tipAt = [-24, 0, 0];
    toolNote = "grasper (cable-driven wrist and jaws)";
  } else {
    // a tool holder on the wrist: a split clamp for a scalpel handle (No. 3) or a needle guide, no moving jaw
    wristOps.push(at(Wtip, [{ op: "box", min: [-34, -5, -5], max: [-14, 5, 5], r: 1.5 }, { op: "hole", a: [-36, 0, 0], b: [-15, 0, 0], d: p.tool === "needle" ? 2.2 : 3.6 },
      { op: "hole", a: [-24, 0, -6], b: [-24, 0, 6], d: 2.2 }]));
    A.printedLink(n("wrist"), { name: n("wrist"), ops: inFrame(Wtip, wristOps) }, { role: "tool_mount", material: "printed_accent" });
    tipAt = [-34, 0, 0];
    toolNote = p.tool === "needle" ? "needle guide (a 2 mm bore clamp on the wrist)" : p.tool === "drill" ? "drill guide (a 3.6 mm bore clamp for a rotary tool's guide sleeve; the drill is not designed)" : "scalpel holder (a clamp for a No. 3 handle on the wrist; practise with a marker or a blunt dummy blade)";
    A.fastener("M2 x 10 (tool clamp)", 1);
  }
  A.fastener("0.5 mm braided line, crimps (wrist and jaw cables)", 4);
  return { O, u0, stroke, tipLink, tipAt, toolNote, joints: [n("rcm_yaw"), n("rcm_pitch"), n("insertion"), n("instrument_roll"), n("wrist_pitch"), ...(p.tool === "grasper" ? [n("gripper")] : [])] };
}

/** Where each arm stands round the trainer (deg about the lid's centre, 0 = +x), the camera arm at the back (180). */
function layout(instruments: number, camera: boolean): number[] {
  if (camera && !instruments) return [180];
  if (camera) {
    const spread = instruments === 1 ? [0] : instruments === 2 ? [62, -62] : [92, 0, -92];
    return [...spread.slice(0, instruments), 180];
  }
  return instruments === 1 ? [0] : instruments === 2 ? [90, -90] : instruments === 3 ? [120, 0, -120] : [135, 45, -45, -135];
}

export function designSurgical(req: SurgicalRequest): RobotSpecification {
  const tools = req.instruments.slice(0, MAX_SURGICAL_ARMS - (req.camera ? 1 : 0));
  const camera = !!req.camera;
  if (!tools.length && !camera) tools.push("grasper");
  const single = tools.length + (camera ? 1 : 0) === 1;
  const name = req.name ?? (single ? (camera ? "endoscope_holder" : "surgical_arm") : "surgical_robot");
  const phis = layout(tools.length, camera);
  const plans: ArmPlan[] = tools.map((t, i) => ({ prefix: single ? "instrument_arm" : `instrument_arm_${i + 1}`, phi: phis[i], tool: t, keys: { yaw: SERVO_BASE, pitch: SERVO_BASE } }));
  if (camera) plans.push({ prefix: "camera_arm", phi: phis[phis.length - 1], tool: "camera", keys: { yaw: SERVO_BASE, pitch: SERVO_BASE } });
  // ---- size the RCM servos from the built arm's own gravity loads; build again on the stronger servo where one is needed
  let spec = build(req, plans, name);
  for (let k = 0; k < 2; k++) {
    const sized = sizeRcm(spec, plans);
    if (!sized.changed) break;
    spec = build(req, plans, name);
  }
  return spec;
}

/** Choose each arm's yaw and pitch servos from the worst gravity torque over their range; true when a choice changed. */
function sizeRcm(spec: RobotSpecification, plans: ArmPlan[]): { changed: boolean } {
  let changed = false;
  const ladder = LADDERS.feetech.keys as readonly string[];
  for (const p of plans) {
    const yaw = `${p.prefix}_rcm_yaw`, pitch = `${p.prefix}_rcm_pitch`, ins = `${p.prefix}_insertion`;
    const poses = rcmPoses(spec, yaw, pitch, ins);
    const t = worstTorques(spec, poses, []);
    for (const [j, slot] of [[yaw, "yaw"], [pitch, "pitch"]] as const) {
      let I = 0; for (const q of poses) I = Math.max(I, axisInertias(spec, q, [])[j] ?? 0);
      const k = choose(ladder, t[j] ?? 0, I).key;
      if (k !== p.keys[slot]) { p.keys[slot] = k; changed = true; }
    }
  }
  return { changed };
}
const rcmPoses = (spec: RobotSpecification, yaw: string, pitch: string, ins: string) => {
  const lim = (n: string) => spec.joints.find((j) => j.name === n)!.limit!;
  const ly = lim(yaw), lp = lim(pitch), li = lim(ins), out: Record<string, number>[] = [];
  for (const a of [ly.lower!, 0, ly.upper!]) for (const b of [lp.lower!, 0, lp.upper!]) for (const c of [0, li.upper!]) out.push({ [yaw]: a, [pitch]: b, [ins]: c });
  return out;
};

function build(req: SurgicalRequest, plans: ArmPlan[], name: string): RobotSpecification {
  const A = new Assembly(name, "surgical_cart", req.prompt);
  A.spec.root = "base_link";
  A.spec.materials.push({ name: "aluminium", color: [0.56, 0.58, 0.62, 1] }, { name: "trainer", color: [0.2, 0.42, 0.5, 1] }, { name: "acrylic", color: [0.75, 0.85, 0.9, 0.55] });
  const single = plans.length === 1;
  const portR = single ? 0 : PORT_R;
  // ---- the base plate (8 mm aluminium) and the trainer box on it (plywood walls, an acrylic lid with the ports)
  const plateHalf = BOX / 2 + 70;
  const fabLink = (nm: string, ops: Op[], material: string, role: string, density: number) => {
    const geometry = printedGeometry({ name: nm, ops });
    A.spec.links.push({ name: nm, role, geometry, mass: Math.max(geometry.volume * density, 0.01), material, origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } });
  };
  const plateOps: Op[] = [{ op: "box", min: [-plateHalf, -plateHalf, -8], max: [plateHalf, plateHalf, 0], r: 12 }];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) plateOps.push({ op: "hole", a: [sx * (plateHalf - 18), sy * (plateHalf - 18), -9], b: [sx * (plateHalf - 18), sy * (plateHalf - 18), 1], d: 6.5 });
  fabLink("base_link", plateOps, "aluminium", "base", 2700);
  const h = BOX / 2, wall = 6;
  const boxOps: Op[] = [
    { op: "box", min: [-h, -h, 0], max: [h, h, TOP - LID] },
    { op: "cutbox", min: [-h + wall, -h + wall, wall], max: [h - wall, h - wall, TOP] },
    // a viewing window in the front wall (trainers are open at the front for the camera's light and the hands)
    { op: "cutbox", min: [-h - 1, -80, 40], max: [-h + wall + 1, 80, TOP - LID - 20] },
  ];
  fabLink("trainer_box", boxOps, "trainer", "structure", 600);
  A.fixed("trainer_box_mount", "base_link", "trainer_box", I4());
  const lidOps: Op[] = [{ op: "box", min: [-h, -h, TOP - LID], max: [h, h, TOP] }];
  const ports = plans.map((p) => armFrame(p.phi, portR).O);
  plans.forEach((p, i) => lidOps.push({ op: "hole", a: v(ports[i][0], ports[i][1], TOP - LID - 1), b: v(ports[i][0], ports[i][1], TOP + 1), d: p.tool === "camera" ? 40 : 22 }));
  fabLink("trainer_lid", lidOps, "acrylic", "structure", 1190);
  A.fixed("trainer_lid_mount", "trainer_box", "trainer_lid", I4());
  // a silicone practice pad on the trainer's floor, where the instruments meet
  fabLink("practice_pad", [{ op: "box", min: [-60, -60, wall], max: [60, 60, wall + 12], r: 4 }], "rubber", "structure", 1100);
  A.fixed("practice_pad_mount", "trainer_box", "practice_pad", I4());

  // ---- the arms
  const arms = plans.map((p) => ({ p, ...buildArm(A, p, portR) }));
  buyTubeStock(A);
  const prefixes = plans.map((p) => p.prefix);
  // ---- joint limits: every joint swept on the exact solids from the home pose, against the other arms, the trainer and its lid
  const moving = A.spec.joints.filter((j) => (j.type === "revolute" || j.type === "prismatic") && !j.mimic && !/gripper/.test(j.name)).map((j) => j.name);
  const home: Record<string, number> = {};
  limitsFromGeometry(A, moving.filter((j) => !/insertion/.test(j)), [], 0.05, [], () => home, "base");
  A.design.home = Object.fromEntries(arms.map((a) => [`${a.p.prefix}_insertion`, +(Math.min(0.03, a.stroke / 1000)).toFixed(3)]));

  // ---- checks
  const f0 = fk(A.spec, {});
  for (const a of arms) {
    const pre = a.p.prefix;
    // the RCM: at every combination of yaw, pitch and insertion the shaft's axis passes through the port point
    let worst = 0;
    const L = (n: string) => A.spec.joints.find((j) => j.name === `${pre}_${n}`)!.limit!;
    for (const y of [L("rcm_yaw").lower!, 0, L("rcm_yaw").upper!]) for (const pt of [L("rcm_pitch").lower!, 0, L("rcm_pitch").upper!]) for (const d of [0, L("insertion").upper!]) {
      const f = fk(A.spec, { [`${pre}_rcm_yaw`]: y, [`${pre}_rcm_pitch`]: pt, [`${pre}_insertion`]: d });
      const roll = f.joint[`${pre}_instrument_roll`], o = roll.p.map((x) => x * 1000) as Vec3, ax = roll.axis as Vec3;
      const w = add(a.O, sc(-1, o)), off = Math.hypot(...cross(w, ax));
      worst = Math.max(worst, off);
    }
    A.check(`${pre}:rcm`, worst < 0.5, `the shaft's axis passes ${worst.toFixed(3)} mm from the port point at every corner of the yaw, pitch and insertion ranges (a remote centre of motion: both RCM servo axes cross at the port)`);
    const ly = L("rcm_yaw"), lp = L("rcm_pitch");
    A.check(`${pre}:range`, ly.upper! - ly.lower! >= 0.6 && lp.upper! - lp.lower! >= 0.6, `RCM yaw ${deg(ly.lower!)} to ${deg(ly.upper!)} deg, pitch ${deg(lp.lower!)} to ${deg(lp.upper!)} deg, insertion ${a.stroke} mm (each swept on the solids against the other arms and the trainer)`);
  }
  // torque and speed of every servo
  for (const a of arms) {
    const pre = a.p.prefix, poses = rcmPoses(A.spec, `${pre}_rcm_yaw`, `${pre}_rcm_pitch`, `${pre}_insertion`);
    const load: PointLoad[] = [{ link: a.tipLink, at: a.tipAt.map((x) => x / 1000) as Vec3, massKg: 0.05 }];
    const t = worstTorques(A.spec, poses, load);
    for (const j of [`${pre}_rcm_yaw`, `${pre}_rcm_pitch`]) {
      const key = String((A.spec.links.find((l) => l.name === `${j}_actuator`)!.geometry as { params?: { key?: string } }).params?.key);
      let I = 0; for (const q of poses) I = Math.max(I, axisInertias(A.spec, q, load)[j] ?? 0);
      const c = evaluate(key, t[j] ?? 0, I), r = rating(key);
      A.design.joints.push({ joint: j, actuator: key, required_nm: c.required_nm, rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: c.margin, speed_rad_s: c.loaded_speed_rad_s,
        note: `worst static ${(t[j] ?? 0).toFixed(3)} N·m over the joint ranges with a 50 g load at the tip, x ${DYNAMIC_FACTOR} for peaks; ${c.loaded_speed_rad_s} rad/s loaded` });
      A.check(`torque:${j}`, c.ok && c.continuous_ok, `holds ${(t[j] ?? 0).toFixed(2)} N·m continuously (rated ${r.rated_nm}), peaks ${c.required_nm} N·m (peak ${r.peak_nm}, margin ${c.margin}x) - ${part(key).name}`);
      A.check(`speed:${j}`, c.speed_ok, `${c.loaded_speed_rad_s} rad/s loaded (no-load ${r.speed_rad_s} rad/s)`);
      const uj = A.spec.joints.find((x) => x.name === j)!; if (uj.limit && c.loaded_speed_rad_s > 0) uj.limit.velocity = c.loaded_speed_rad_s;
    }
    // insertion: belt thrust against the instrument's weight along the shaft and a 2 N tissue load
    const ins = `${pre}_insertion`, moved = [...descendantsOf(A, `${pre}_carriage`)].reduce((s, l) => s + (A.spec.links.find((x) => x.name === l)?.mass ?? 0), 0);
    const need = moved * G + moved * 1.0 + 2 + 3, pulleyR = Number(part("gt2_pulley_20t_5mm").specs.pitch_diameter_mm) / 2000, thrust = rating(SERVO_BASE).rated_nm / pulleyR;
    const speed = (rating(SERVO_BASE).speed_rad_s * pulleyR * 0.7);
    A.design.joints.push({ joint: ins, actuator: SERVO_BASE, required_nm: +need.toFixed(1), rated_nm: +thrust.toFixed(0), peak_nm: +(rating(SERVO_BASE).peak_nm / pulleyR).toFixed(0), margin: +(thrust / need).toFixed(1), speed_rad_s: +speed.toFixed(3), unit: "N",
      note: `${moved.toFixed(2)} kg on the carriage lifted at 1 m/s^2 + 2 N at the tip + 3 N bushing and belt drag; servo rated torque on a ${(pulleyR * 2000).toFixed(2)} mm GT2 pulley (multi-turn mode)` });
    A.check(`thrust:${ins}`, thrust >= 2 * need, `needs ${need.toFixed(1)} N; the servo on a 20-tooth GT2 pulley gives ${thrust.toFixed(0)} N rated; ${(speed * 1000).toFixed(0)} mm/s`);
    const insJ = A.spec.joints.find((x) => x.name === ins)!; insJ.limit!.effort = +Math.min(thrust, 60).toFixed(0); insJ.limit!.velocity = +speed.toFixed(3);
  }
  // the shaft: a 6 mm carbon tube cantilevered from its housing, 2 N sideways at the tip, fully retracted (longest free length)
  const s = part(SHAFT).specs, E = Number(s.youngs_gpa) * 1000, Iz = Math.PI * (Number(s.od_mm) ** 4 - Number(s.id_mm) ** 4) / 64, Lf = R_HB + R_TIP + 20;
  const defl = 2 * Lf ** 3 / (3 * E * Iz);
  A.check("shaft:deflection", defl <= 2, `2 N sideways at the tip of the ${Lf} mm free shaft (6 x 4 mm carbon, E ${s.youngs_gpa} GPa) bends it ${defl.toFixed(2)} mm`);
  // a shared workspace: a point 60 mm under the lid's centre that every instrument tip reaches and the camera sees
  const target = v(0, 0, TOP - 55);
  const reach = arms.filter((a) => a.p.tool !== "camera").map((a) => ({ pre: a.p.prefix, d: closest(A, a.p.prefix, a.tipLink, a.tipAt, target) }));
  const bad = reach.filter((r) => r.d > 12);
  if (!single) A.check("workspace:shared", !bad.length, `every instrument tip reaches a point 55 mm under the lid's centre (closest: ${reach.map((r) => `${r.pre} ${r.d.toFixed(0)} mm`).join(", ")})${camera(plans) ? "; the camera arm looks at it" : ""}`);
  void f0;

  // ---- electronics: one bus adapter per two arms, the 12 V supplies in a printed control case on the bench beside the plate
  const H = new Harness(A);
  const servoCount = A.spec.links.filter((l) => /_actuator$/.test(l.name)).length;
  const holding = A.spec.links.filter((l) => /_actuator$/.test(l.name)).reduce((sum, l) => sum + Number(electrical(String((l.geometry as { params?: { key?: string } }).params?.key))?.current_a.v.typical ?? 0.2) * 0.5, 0);
  const split = plans.length >= 3;
  const supply12 = holding <= 6 * 0.8 && !split ? "psu_12v_lrs75" : "psu_12v_lrs150";
  const caseT = translation(v(-plateHalf - 30 - 240, -plateHalf + 10, 0));
  controlCase(A, H, { parent: "base_link", T: caseT, psu: supply12, psuUse: `12 V supply for ${split ? "arms 1 and 2" : `the ${plans.length > 1 ? `${plans.length} arms` : "arm"}`}`,
    boards: [{ name: "servo_bus", key: LADDERS.feetech.bus, use: "USB to servo bus (one branch per arm)" }] });
  if (split) controlCase(A, H, { parent: "base_link", T: mul(caseT, translation(v(0, 230, 0))), psu: "psu_12v_lrs150", psuUse: `12 V supply for arms 3${plans.length > 3 ? " and 4" : ""}`, suffix: "_2",
    boards: [{ name: "servo_bus_2", key: LADDERS.feetech.bus, use: "USB to servo bus (arms 3 and 4)" }] });
  wireFixedArm(A, H, "feetech", 6, false, supply12, plans.length > 1 ? prefixes : undefined, split ? prefixes.slice(2) : undefined);
  A.check("power:supply", true, `${servoCount} servos holding the arms draw ~${holding.toFixed(1)} A in all (${split ? "two supplies, two arms each" : `one ${supply12 === "psu_12v_lrs75" ? "6" : "12.5"} A supply`})`);

  // ---- record
  const instruments = arms.filter((a) => a.p.tool !== "camera");
  A.design.performance = {
    arms: plans.length, instrument_arms: instruments.length, camera_arm: camera(plans) ? "yes" : "no",
    instruments: arms.map((a) => `${a.p.prefix}: ${a.toolNote}`).join("; "),
    arm_dofs: arms.map((a) => a.joints.filter((j) => !/gripper/.test(j)).length).join(" + "),
    insertion_stroke_mm: Math.min(...arms.map((a) => a.stroke)), port_circle_mm: portR * 2, trainer_mm: `${BOX} x ${BOX} x ${TOP}`,
    mass_kg: +totalMass(A.spec).toFixed(2), actuators: LADDERS.feetech.label, servos: servoCount, shaft_deflection_mm: +defl.toFixed(2),
  };
  A.design.assumptions.push(
    "An educational and research model of a teleoperated laparoscopic robot, for practice pads in a trainer box. It is not a medical device: no regulatory clearance, no sterile barrier, no force sensing, no certified safety system. Never use it on a person or an animal.",
    `Each arm is a spherical remote-centre-of-motion mechanism: the yaw and pitch servos' axes cross at the port in the trainer's lid (${LID} mm acrylic), so the shaft pivots about that point and never pushes sideways on the "body wall". Insertion slides the instrument along its own axis through the same point.`,
    "Insertion: a 20-tooth GT2 pulley on the insertion servo (on a printed adapter on its horn, the servo in its multi-turn mode) drives a belt loop round an idler; the carriage runs on two LM8UU bushings on 8 mm rods and is clamped to one strand. At power-on it homes by driving up against the upper block with the servo's torque limit set low (the servo reports the stall), then counts turns from there.",
    "The instrument rolls on its servo; the wrist and jaw servos ride on the rolling housing and pull the tip by 0.5 mm braided line through the 6 mm carbon shaft (a pulley at the wrist, a return spring at the jaw), so roll does not wind the cables. The bus cable to the housing has a service loop for the roll range.",
    "Surgeon console: the robot is driven from a PC over the servo bus; teleoperation (two leader arms, a pair of game controllers or a 3D mouse mapped to each instrument's tip, the camera arm on a foot pedal or a button) is software, started from the ROS 2 package and MoveIt groups (one per arm). A real system keeps the instruments still until the surgeon's head is at the viewer; here the PC's software must do that, and the mains switch on the control case is the stop.",
    plans.some((p) => p.tool === "blade") ? "The scalpel holder is a tool mount only: practise with a marker or a blunt dummy blade on the pad. A sharp blade on a robot without force sensing can cut whatever it touches." : "The graspers hold suture needles, rubber bands and pegs on the practice pad.",
    camera(plans) ? "The camera arm carries a 19 mm analogue FPV camera in a printed head (real laparoscopes are 5 to 10 mm), so its port is 40 mm; a USB video capture dongle (not in the parts list) brings the picture to the PC. Light the trainer through its front window." : "Watch the instrument through the trainer's front window, or add a camera arm (\"a surgical robot with 3 instrument arms and a camera arm\").",
    "Print the links in PETG with 4 perimeters and 30 % gyroid; the wrist clevis and jaws are small: print them with a 0.25 mm nozzle or in resin. The trainer box is 6 mm plywood with a 4 mm acrylic lid, or a bought laparoscopic trainer of the same size with the ports drilled where the drawing shows.",
  );
  A.design.request = { ...req } as Record<string, unknown>;
  const spec = A.finish(`${single ? "Surgical arm" : "Surgical robot"}: ${instruments.length} instrument arm${instruments.length > 1 ? "s" : ""}${camera(plans) ? " and a camera arm" : ""} with remote-centre-of-motion mechanisms round a laparoscopic trainer, ${LADDERS.feetech.label}`);
  // cost: bought parts, filament, fasteners, the aluminium, the trainer and the wiring
  const d = (spec.metadata as unknown as { design: { purchased: { key: string; qty: number }[]; printed: { mass_kg: number }[]; fasteners: Record<string, number>; wiring?: { cost_usd?: number }; performance: Record<string, number | string>; checks: { name: string; pass: boolean; detail: string }[] } }).design;
  const fab = [{ item: `${plateHalf * 2} x ${plateHalf * 2} x 8 mm aluminium base plate, laser cut (~$${Math.round(20 + (plateHalf * 2) ** 2 * 8 * 2.7e-6 * 12)})`, usd: Math.round(20 + (plateHalf * 2) ** 2 * 8 * 2.7e-6 * 12) },
    { item: `${BOX} mm laparoscopic trainer box (6 mm plywood, 4 mm acrylic lid, ~$45)`, usd: 45 }, { item: "silicone practice pad (~$15)", usd: 15 },
    { item: `braided line, crimps and springs for ${instruments.length} instrument${instruments.length > 1 ? "s" : ""} (~$${6 * instruments.length})`, usd: 6 * instruments.length }, { item: "GT2 belt cut to length (from the 2 m coil in the parts list)", usd: 0 }];
  const bought = d.purchased.reduce((sum, x) => sum + part(x.key).price_usd * x.qty, 0);
  const printedKg = d.printed.reduce((sum, x) => sum + x.mass_kg, 0), filament = printedKg * 1.15 * 25;
  const fasteners = Object.values(d.fasteners).reduce((sum, k) => sum + k, 0) * 0.12, fb = fab.reduce((sum, f) => sum + f.usd, 0), wiring = Number(d.wiring?.cost_usd ?? 15);
  const total = bought + filament + fasteners + fb + wiring;
  d.performance.cost_usd = Math.round(total);
  d.performance.cost_breakdown = `catalog parts $${bought.toFixed(0)}, filament ${(printedKg * 1.15).toFixed(2)} kg $${filament.toFixed(0)}, fasteners $${fasteners.toFixed(0)}, fabricated/other $${fb.toFixed(0)} (${fab.map((f) => f.item).join("; ")}), wiring $${wiring.toFixed(0)}`;
  if (req.budget !== undefined) d.checks.push({ name: "budget", pass: total <= req.budget, detail: `estimated $${total.toFixed(0)} vs budget $${req.budget}` });
  return spec;
}

const deg = (r: number) => Math.round((r * 180) / Math.PI);
const camera = (plans: ArmPlan[]) => plans.some((p) => p.tool === "camera");
function descendantsOf(A: Assembly, link: string): Set<string> {
  const out = new Set([link]);
  for (let changed = true; changed;) { changed = false; for (const j of A.spec.joints) if (out.has(j.parent) && !out.has(j.child)) { out.add(j.child); changed = true; } }
  return out;
}
/** The closest an arm's tool point comes to `target` (mm) over a grid of its yaw, pitch and insertion. */
function closest(A: Assembly, pre: string, tip: string, at: Vec3, target: Vec3): number {
  const L = (n: string) => A.spec.joints.find((j) => j.name === `${pre}_${n}`)!.limit!;
  const span = (l: { lower?: number; upper?: number }, k: number) => Array.from({ length: k }, (_, i) => l.lower! + ((l.upper! - l.lower!) * i) / (k - 1));
  let best = Infinity;
  for (const y of span(L("rcm_yaw"), 9)) for (const pt of span(L("rcm_pitch"), 9)) for (const d of span(L("insertion"), 5)) {
    const f = fk(A.spec, { [`${pre}_rcm_yaw`]: y, [`${pre}_rcm_pitch`]: pt, [`${pre}_insertion`]: d }).link[tip];
    const w = [0, 1, 2].map((r) => (f.R[r][0] * at[0] + f.R[r][1] * at[1] + f.R[r][2] * at[2]) / 1000 + f.p[r]).map((x) => x * 1000) as Vec3;
    best = Math.min(best, Math.hypot(w[0] - target[0], w[1] - target[1], w[2] - target[2]));
  }
  return best;
}
