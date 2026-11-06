// Desktop SCARA arm in the class of the open-source HowToMechatronics SCARA: J1 turns a column
// carrying the Z stage, the Z carriage carries the inner arm with J2 at its end, a bus servo rolls
// the wrist and a rack-and-pinion parallel gripper hangs below it.
//   J1, J2: NEMA17 + 5.18:1 planetary, each output on two thin-section bearings (the gearbox shaft
//           only transmits torque; the bearing pair takes the overhung moment).
//   Z:      NEMA17 on top of the column driving a Tr8x8 lead screw (608 bearing at the bottom),
//           carriage on two 8 mm rods with four LM8UU bushings and a brass flange nut.
//   Drive:  three TMC2209 drivers + ESP32-S3 + 24 V / 12 V supplies in a printed controller box
//           placed outside the arm's reach.
// J1/J2 are sized from the built arm's inertia about each axis at full reach (horizontal joints
// see no gravity torque), Z from the moving weight through the screw efficiency.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, type Vec3 } from "@ttr/parts";
import { frame, I4, apply, invert, translation, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { axisInertia, gravityTorques, totalMass, fk, descendants, linkCom, type PointLoad } from "../kin.ts";
import { bodyMm, inFrame, rel, recordCost, mountSensors, sensorTypes, plugWindowOps, type DesignRequest } from "./common.ts";
import { registerBay, enclosureChecks, exposed } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { busChain } from "../netlist.ts";
import { buildParallelGripper, chooseGripperServo, gripperLevels, GRIP, type GripCfg } from "./gripper.ts";

/** A compact version of the parallel gripper for a 0.3 m arm: 40 mm opening, 50 mm fingers. */
const SCARA_GRIP: GripCfg = { ...GRIP, stroke: 20, fingerLen: 50 };

const BASE_T = 8;              // base plate
const HOUSING = 33;            // bearing housing: 5 web + 4 screw heads + 7 bearing + 10 spacer + 7 bearing
const RODS_Y = 36, SCREW_X = -32, PLATFORM_R = 62, PLATFORM_T = 12;
const CARRIAGE_H = 56;
/** Design targets for sizing (documented in the assumptions). */
const TARGET = { j1Speed: 3, j2Speed: 4, j1Accel: 8, j2Accel: 12, wristAccel: 30, zAccel: 2, frictionNm: 0.08, gearEff: 0.9, stepperMargin: 1.5, tableClear: 13 };

const shaftD = (key: string) => Number(part(key).specs.shaft_d_mm ?? 8);
const bearingSpec = (key: string) => { const s = part(key).specs; return { D: Number(s.od_mm), d: Number(s.bore_mm), B: Number(s.width_mm), oid: Number(s.outer_ring_id_mm), iod: Number(s.inner_ring_od_mm), C0: Number(s.static_load_kn) * 1000 }; };

/** Housing cuts for a motor face bolted to a plate and two bearings in a stack (world, along `up`). */
function housingCuts(motor: string, T: Mat4, bearing: string, c: Vec3, faceZ: number, dir: 1 | -1): Op[] {
  const b = bearingSpec(bearing), z = (dz: number) => faceZ + dir * dz, ops: Op[] = [];
  const hole = (d: number, z0: number, z1: number): Op => ({ op: "hole", a: [c[0], c[1], Math.min(z(z0), z(z1)) - 0.05], b: [c[0], c[1], Math.max(z(z0), z(z1)) + 0.05], d });
  ops.push(hole(22.6, -0.1, 2.3));                              // gearbox / motor pilot
  ops.push(hole(b.oid + 0.2, 5, 9));                             // screw-head pocket (inside the outer-ring shoulder)
  ops.push(hole(b.D, 9, 9 + b.B));                               // first bearing seat
  ops.push(hole(b.oid + 0.2, 9 + b.B, HOUSING - b.B));          // spacer bore between the outer rings
  ops.push(hole(b.D, HOUSING - b.B, HOUSING + 0.2));            // second bearing seat
  for (const h of part(motor).holes) if (h.axis[2] > 0.5 && Math.abs(h.pos[2]) < 0.6) { const p = apply(T, h.pos); ops.push({ op: "hole", a: [p[0], p[1], Math.min(z(-0.1), z(5.1))], b: [p[0], p[1], Math.max(z(-0.1), z(5.1))], d: 3.4 }); }
  ops.push({ op: "keepout", key: motor, T });
  return ops;
}
/** Output hub: spigot through both inner rings, clamped on the shaft, shoulder on the outer inner-ring face. */
function hubOps(motor: string, bearing: string, c: Vec3, faceZ: number, dir: 1 | -1): Op[] {
  const b = bearingSpec(bearing), z = (dz: number) => faceZ + dir * dz, d = shaftD(motor), L = bodyMm(motor).max[2];
  const seg = (z0: number, z1: number) => [Math.min(z(z0), z(z1)), Math.max(z(z0), z(z1))];
  const [s0, s1] = seg(9.2, HOUSING + 0.6), [h0, h1] = seg(HOUSING, HOUSING + 0.6), [b0, b1] = seg(9, L + 1);
  return [
    { op: "rod", a: [c[0], c[1], s0], b: [c[0], c[1], s1], r: b.d / 2 - 0.3 },
    { op: "rod", a: [c[0], c[1], h0], b: [c[0], c[1], h1], r: b.iod / 2 - 0.2 },
    { op: "hole", a: [c[0], c[1], b0], b: [c[0], c[1], b1], d },
    { op: "hole", a: [c[0], c[1], z(16)], b: [c[0], c[1] + b.d / 2 + 2, z(16)], d: 3.3 },   // M4 set screw onto the D-flat
  ];
}

interface Plan { L1: number; L2: number; j1: string; j2: string; wrist: string; grip: string; payload: number; sensors: string[]; }

function build(name: string, prompt: string | undefined, p: Plan) {
  const A = new Assembly(name, "scara", prompt);
  const { L1, L2 } = p;
  const b1 = "bearing_6808", b2 = "bearing_6806zz";
  // ---------------- heights (world mm) ----------------
  const zf1 = Math.ceil(BASE_T + 4 - bodyMm(p.j1).min[2]);
  const zp0 = zf1 + HOUSING + 0.6, zp1 = zp0 + PLATFORM_T;
  const zT = zp1 + 319;                                  // column top plate top (lead screw 300 + bearing + coupler)
  const gl = gripperLevels(p.grip, SCARA_GRIP);
  const wb = bodyMm(p.wrist);
  // carriage at its lowest allowed height: fingertips TARGET.tableClear above the table
  const carriageLowMech = zp1 + 5.5;
  // chain below the carriage top: arm1 (HOUSING) + 0.6 gap + forearm (16) + 2 gap to the wrist face, then the gripper
  const tipBelowCarriageTop = HOUSING + 0.6 + 16 + 2 + gl.tip;
  const zcb0 = Math.max(carriageLowMech, TARGET.tableClear + tipBelowCarriageTop - CARRIAGE_H);
  const zcbMax = zp1 + 280 - 2 - CARRIAGE_H;
  const stroke = Math.floor(zcbMax - zcb0);
  const za1 = zcb0 + CARRIAGE_H, zfb = za1 - HOUSING - 0.6 - 16, zw = zfb - 2;

  // ---------------- frames ----------------
  const T1 = frame([0, 0, zf1], [0, 0, 1], [1, 0, 0]);
  const Tz = frame([0, 0, zcb0], [0, 0, 1], [1, 0, 0]);
  const T2 = frame([L1, 0, za1], [0, 0, -1], [1, 0, 0]);
  const Tw = frame([L1 + L2, 0, zw], [0, 0, -1], [1, 0, 0]);
  const TzMotor = frame([SCREW_X, 0, zT], [0, 0, -1], [1, 0, 0]);
  const want = sensorTypes(p.sensors);

  // ---------------- base ----------------
  const tower = 34;
  const base: Op[] = [
    { op: "box", min: [-90, -90, 0], max: [90, 90, BASE_T], r: 20 },
    { op: "hull", of: [{ op: "box", min: [-46, -46, 0], max: [46, 46, BASE_T], r: 12 }, { op: "box", min: [-tower, -tower, BASE_T], max: [tower, tower, BASE_T + 14], r: 8 }] },
    { op: "box", min: [-tower, -tower, BASE_T], max: [tower, tower, zf1], r: 8 },
    { op: "hull", of: [{ op: "box", min: [-tower, -tower, zf1 - 8], max: [tower, tower, zf1], r: 8 }, { op: "rod", a: [0, 0, zf1], b: [0, 0, zf1 + HOUSING], r: bearingSpec(b1).D / 2 + 8 }] },
    { op: "cutbox", min: [-tower + 7, -tower + 7, BASE_T + 4], max: [tower - 7, tower - 7, zf1 - 0.01] },
    ...housingCuts(p.j1, T1, b1, [0, 0, 0], zf1, 1),
  ];
  for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) base.push({ op: "cutbox", min: [ax ? (ax > 0 ? tower - 9 : -tower - 1) : -15, ay ? (ay > 0 ? tower - 9 : -tower - 1) : -15, BASE_T + 14], max: [ax ? (ax > 0 ? tower + 1 : -tower + 9) : 15, ay ? (ay > 0 ? tower + 1 : -tower + 9) : 15, zf1 - 14] });
  for (const x of [-1, 1]) for (const y of [-1, 1]) base.push({ op: "hole", a: [x * 75, y * 75, -1], b: [x * 75, y * 75, BASE_T + 1], d: 5.5 }, { op: "hole", a: [x * 75, y * 75, BASE_T - 0.01], b: [x * 75, y * 75, BASE_T + 6], d: 10 });
  A.printedLink("base_link", { name: "base_link", ops: base }, { role: "base", material: "printed_dark" });
  A.fastener("M5 x 16 socket head (base to bench)", 4);
  A.mount("base_link", p.j1, T1, "j1_motor", "J1 drive");
  for (const zc of [zf1 + 9 + 3.5, zf1 + HOUSING - 3.5]) A.mount("base_link", b1, translation([0, 0, zc]), `j1_bearing_${zc < zf1 + 20 ? "lower" : "upper"}`, "J1 output bearings");
  A.fastener("M3 x 8 socket head (motor face)", 8);

  // ---------------- column (J1) ----------------
  A.revolute("j1", "base_link", "column", T1, p.j1, -2.9, 2.9).limit!.velocity = TARGET.j1Speed;
  const column: Op[] = [
    ...hubOps(p.j1, b1, [0, 0, 0], zf1, 1),
    { op: "rod", a: [0, 0, zp0], b: [0, 0, zp1], r: PLATFORM_R },
    ...[-1, 1].map((s): Op => ({ op: "rod", a: [0, s * RODS_Y, zp1 - 0.01], b: [0, s * RODS_Y, zp1 + 12], r: 9 })),
    { op: "rod", a: [SCREW_X, 0, zp1 - 0.01], b: [SCREW_X, 0, zp1 + 3], r: 14 },
  ];
  for (const s of [-1, 1]) column.push({ op: "hole", a: [0, s * RODS_Y, zp1 - 10], b: [0, s * RODS_Y, zp1 + 12.1], d: 8 }, { op: "hole", a: [0, s * RODS_Y, zp1 + 6], b: [s * 12, s * RODS_Y, zp1 + 6], d: 2.9 });
  column.push({ op: "hole", a: [SCREW_X, 0, zp1 - 7], b: [SCREW_X, 0, zp1 + 3.1], d: 22 }, { op: "hole", a: [SCREW_X, 0, zp1 - 9], b: [SCREW_X, 0, zp1 - 6.9], d: 14 });
  for (const deg of [0, 50, -50, 130, -130]) { const a = (deg * Math.PI) / 180; column.push({ op: "hole", a: [44 * Math.cos(a), 44 * Math.sin(a), zp0 - 1], b: [44 * Math.cos(a), 44 * Math.sin(a), zp1 + 1], d: 15 }); } // lightening, clear of rods and screw
  A.printedLink("column", { name: "column", ops: inFrame(T1, column) }, { role: "joint_housing", material: "printed_accent" });
  for (const s of [-1, 1]) A.mount("column", "rod_8mm_h8_300", rel(T1, frame([0, s * RODS_Y, zp1 - 10], [0, 0, 1], [1, 0, 0])), `z_rod_${s > 0 ? "left" : "right"}`, "Z guide rods", "metal");
  A.mount("column", "bearing_608zz", rel(T1, translation([SCREW_X, 0, zp1 - 3.5])), "z_screw_bearing", "lead screw bottom bearing");
  A.mount("column", "leadscrew_t8x8_300", rel(T1, translation([SCREW_X, 0, zp1 - 7])), "z_lead_screw", "Z lead screw", "metal");
  // column top plate with the Z motor
  const topOps: Op[] = [
    { op: "hull", of: [...[-1, 1].map((s): Op => ({ op: "rod", a: [0, s * RODS_Y, zT - 8], b: [0, s * RODS_Y, zT], r: 12 })), { op: "box", min: [SCREW_X - 26, -26, zT - 8], max: [want.includes("depth") ? 18 : 12, 26, zT], r: 6 }] },
    ...[-1, 1].map((s): Op => ({ op: "rod", a: [0, s * RODS_Y, zp1 + 280], b: [0, s * RODS_Y, zT - 7.9], r: 9 })),
    ...[-1, 1].map((s): Op => ({ op: "hole", a: [0, s * RODS_Y, zp1 + 279.9], b: [0, s * RODS_Y, zp1 + 290.1], d: 8 })),
    { op: "hole", a: [SCREW_X, 0, zT - 9], b: [SCREW_X, 0, zT + 1], d: 23 },
    { op: "keepout", key: "nema17_42x40", T: TzMotor },
  ];
  for (const h of part("nema17_42x40").holes) { const q = apply(TzMotor, h.pos); topOps.push({ op: "hole", a: [q[0], q[1], zT - 9], b: [q[0], q[1], zT + 1], d: 3.4 }); }
  if (want.includes("depth")) topOps.push({ op: "hole", a: [4, 7.5, zT - 9], b: [4, 7.5, zT + 1], d: 6.6 });
  A.printedLink("column_top", { name: "column_top", ops: inFrame(T1, topOps) }, { role: "link", material: "printed_dark" });
  A.fixed("column_top_mount", "column", "column_top", I4());
  A.mount("column_top", "nema17_42x40", rel(T1, TzMotor), "z_motor", "Z drive");
  A.mount("column_top", "coupler_5x8", rel(T1, frame([SCREW_X, 0, zT - 12], [0, 0, -1], [1, 0, 0])), "z_coupler", "motor to lead screw", "metal");
  A.fastener("M3 x 8 socket head (motor face)", 4);
  A.fastener("M3 x 6 set screw (rod clamps)", 4);

  // ---------------- Z carriage + inner arm ----------------
  const zr = rating("nema17_42x40"), sc = part("leadscrew_t8x8_300").specs, lead = Number(sc.lead_mm) / 1000, eta = Number(sc.efficiency);
  const zForcePeak = (2 * Math.PI * eta * zr.peak_nm) / lead, zSpeed = (zr.speed_rad_s * lead) / (2 * Math.PI);
  const zj = A.prismatic("z", "column", "inner_arm", rel(T1, Tz), 0, stroke / 1000, +zForcePeak.toFixed(1), +zSpeed.toFixed(4), [0, 0, 1]);
  zj.dynamics = { damping: 20, friction: 3 };
  const armW = 22;
  const inner: Op[] = [
    { op: "box", min: [-46, -48, zcb0], max: [16, 48, zcb0 + CARRIAGE_H], r: 10 },
    { op: "hull", of: [{ op: "box", min: [0, -30, za1 - 22], max: [16, 30, za1] }, { op: "rod", a: [L1, 0, za1 - 22], b: [L1, 0, za1], r: armW + 4 }] },
    { op: "rod", a: [L1, 0, za1 - HOUSING], b: [L1, 0, za1], r: bearingSpec(b2).D / 2 + 7 },
    ...[-1, 1].map((s): Op => ({ op: "hole", a: [0, s * RODS_Y, zcb0 - 1], b: [0, s * RODS_Y, zcb0 + CARRIAGE_H + 1], d: 15 })),
    { op: "hole", a: [SCREW_X, 0, zcb0 - 1], b: [SCREW_X, 0, zcb0 + CARRIAGE_H + 1], d: 11 },
    { op: "hole", a: [SCREW_X, 0, zcb0 - 0.1], b: [SCREW_X, 0, zcb0 + 12], d: 10.6 },
    ...housingCuts(p.j2, T2, b2, [L1, 0, 0], za1, -1),
  ];
  for (const h of part("leadnut_t8_brass").holes.slice(0, 4)) { const q = apply(translation([SCREW_X, 0, zcb0]), h.pos); inner.push({ op: "hole", a: [q[0], q[1], zcb0 - 0.1], b: [q[0], q[1], zcb0 + 6.8], d: 4.0 }); }
  const span = L1 - 16 - (bearingSpec(b2).D / 2 + 7);
  if (span > 50) inner.push({ op: "lighten", a: [16 + 10, 0, 0], b: [L1 - bearingSpec(b2).D / 2 - 7 - 10, 0, 0], r: 8, n: Math.max(1, Math.floor(span / 34)) });
  if (want.includes("imu")) for (const [hx, hy] of [[2.54, 2.54], [23.06, 2.54], [2.54, 20.16], [23.06, 20.16]]) { const q: Vec3 = [-40 + hx, -11.35 + hy, zcb0 + CARRIAGE_H]; inner.push({ op: "rod", a: q, b: [q[0], q[1], q[2] + 4], r: 2 }, { op: "hole", a: [q[0], q[1], q[2] - 4], b: [q[0], q[1], q[2] + 4.1], d: 1.6 }); }
  A.printedLink("inner_arm", { name: "inner_arm", ops: inFrame(Tz, inner) }, { role: "link", material: "printed" });
  for (const s of [-1, 1]) for (const zc of [zcb0 + 15, zcb0 + 41]) A.mount("inner_arm", "lm8uu", rel(Tz, translation([0, s * RODS_Y, zc])), `z_bushing_${s > 0 ? "l" : "r"}${zc < zcb0 + 30 ? "1" : "2"}`, "Z carriage bushings");
  A.mount("inner_arm", "leadnut_t8_brass", rel(Tz, translation([SCREW_X, 0, zcb0])), "z_nut", "Z lead nut", "metal");
  A.mount("inner_arm", p.j2, rel(Tz, T2), "j2_motor", "J2 drive");
  for (const dz of [9 + 3.5, HOUSING - 3.5]) A.mount("inner_arm", b2, rel(Tz, translation([L1, 0, za1 - dz])), `j2_bearing_${dz < 20 ? "upper" : "lower"}`, "J2 output bearings");
  A.fastener("M3 x 8 socket head + heat-set insert (lead nut)", 4);
  A.fastener("M3 x 8 socket head (motor face)", 4);

  // ---------------- forearm (J2) ----------------
  const R = gripperReach(p.grip);
  const cosLim = (R * R - L1 * L1 - L2 * L2) / (2 * L1 * L2), j2lim = cosLim <= -1 ? 2.6 : Math.min(2.6, Math.acos(Math.max(-1, Math.min(1, cosLim))) - 0.03);
  A.revolute("j2", "inner_arm", "outer_arm", rel(Tz, T2), p.j2, -+j2lim.toFixed(3), +j2lim.toFixed(3)).limit!.velocity = TARGET.j2Speed;
  const wx = L1 + L2;
  const outer: Op[] = [
    ...hubOps(p.j2, b2, [L1, 0, 0], za1, -1),
    { op: "hull", of: [{ op: "rod", a: [L1, 0, zfb], b: [L1, 0, zfb + 16], r: 24 }, { op: "box", min: [wx + wb.min[0] - 3, -(wb.max[1] + 3), zfb], max: [wx + wb.max[0] + 3, wb.max[1] + 3, zfb + 16], r: 3 }] },
    { op: "rod", a: [L1, 0, zfb + 15.9], b: [L1, 0, za1 - HOUSING - 0.6], r: bearingSpec(b2).iod / 2 - 0.2 },
    { op: "cradle", key: p.wrist, T: Tw, wall: 3 },
    ...plugWindowOps(p.wrist, Tw),
  ];
  const fspan = L2 + wb.min[0] - 24 - 6;
  if (fspan > 40) outer.push({ op: "lighten", a: [L1 + 24 + 6, 0, 0], b: [wx + wb.min[0] - 3, 0, 0], r: 7, n: Math.max(1, Math.floor(fspan / 30)) });
  const camT = frame([wx - 85 + 12.5, 11.93, zfb - 3], [0, 0, -1], [-1, 0, 0]);
  if (want.includes("camera")) for (const [hx, hy] of [[2, 2], [23, 2], [2, 14.5], [23, 14.5]]) { const q = apply(camT, [hx, hy, 0]); outer.push({ op: "rod", a: [q[0], q[1], q[2]], b: [q[0], q[1], zfb + 0.1], r: 1.9 }, { op: "hole", a: [q[0], q[1], q[2] - 0.1], b: [q[0], q[1], zfb + 6], d: 1.6 }); }
  A.printedLink("outer_arm", { name: "outer_arm", ops: inFrame(T2, outer) }, { role: "link", material: "printed_accent" });
  A.mount("outer_arm", p.wrist, rel(T2, Tw), "wrist_servo", "wrist roll");

  // ---------------- wrist + gripper ----------------
  A.revolute("wrist_roll", "outer_arm", "wrist_flange", rel(T2, Tw), p.wrist, -3.0, 3.0);
  const g = buildParallelGripper(A, Tw, p.grip, "wrist_flange", { horn: p.wrist }, "", [], SCARA_GRIP);
  A.spec.end_effectors.push({ name: "gripper", type: "parallel_gripper", attach_link: "gripper_body" });

  // ---------------- controller box, outside the reach ----------------
  const reachOut = L1 + L2 + R - 0;
  const bx0 = -Math.ceil(reachOut + 30) - 171;
  const box: Op[] = [
    { op: "box", min: [bx0, -103, 0], max: [bx0 + 171, 103, 86], r: 6 },
    { op: "cutbox", min: [bx0 + 3, -100, 3], max: [bx0 + 168, 100, 91] },
    ...[-1, 1].map((s): Op => ({ op: "box", min: [bx0 + 3, s > 0 ? 96 : -100, 43], max: [bx0 + 168, s > 0 ? 100 : -96, 46] })),
  ];
  for (let k = 0; k < 8; k++) for (const s of [-1, 1]) box.push({ op: "cutbox", min: [bx0 + 22 + k * 17, s > 0 ? 99 : -104, 12], max: [bx0 + 30 + k * 17, s > 0 ? 104 : -99, 36] });
  const psu24 = translation([bx0 + 6, -99, 3]), psu12 = translation([bx0 + 6, 2, 3]);
  for (const [key, T] of [["psu_24v_lrs150", psu24], ["psu_12v_lrs75", psu12]] as const) for (const h of part(key).holes) if (h.axis[2] < -0.5) { const q = apply(T, h.pos); box.push({ op: "hole", a: [q[0], q[1], -1], b: [q[0], q[1], 4], d: 3.4 }); }
  // fused, switched mains inlet in the far wall (its body stands in the room left of the supplies), gland where the harness leaves, USB of the controller
  box.push({ op: "cutbox", min: [bx0 - 1, -31.6, 52.3], max: [bx0 + 4, 15.6, 79.7] });
  box.push({ op: "hole", a: [bx0 + 166, 40, 60], b: [bx0 + 173, 40, 60], d: 12.5 });
  box.push({ op: "cutbox", min: [bx0 + 40, -104, 52], max: [bx0 + 80, -99, 68] });
  A.printedLink("controller_box", { name: "controller_box", ops: box }, { role: "base", material: "printed_dark" });
  A.fixed("controller_box_mount", "base_link", "controller_box", I4());
  A.mount("controller_box", "psu_24v_lrs150", psu24, "psu_24v", "24 V stepper supply");
  A.mount("controller_box", "psu_12v_lrs75", psu12, "psu_12v", "12 V servo supply");
  // electronics deck on the ledges: ESP32-S3 and the three drivers clamped at their board ends, servo bus adapter on standoffs
  const dz = 49;
  const deck: Op[] = [{ op: "box", min: [bx0 + 3.3, -99.7, 46], max: [bx0 + 167.7, 99.7, dz], r: 2 }];
  // boards without mounting holes sit in four corner clips (slots for the board edge), clear of connectors and pins
  const clampBoxes: [number, number, number, number][] = [];
  const clamp = (x0: number, y0: number, L: number, W: number, zb: number, t: number) => {
    for (const [xa, xb] of [[x0 - 4, x0 + 0.4], [x0 + L - 0.4, x0 + L + 4]]) for (const [ya, yb] of [[y0 - 1.5, y0 + 2.2], [y0 + W - 2.2, y0 + W + 1.5]]) clampBoxes.push([xa, xb, ya, yb]), deck.push({ op: "box", min: [xa, ya, dz - 0.1], max: [xb, yb, zb + t + 1.5] });
    deck.push({ op: "cutbox", min: [x0 - 0.15, y0 - 0.15, zb - 0.05], max: [x0 + L + 0.15, y0 + W + 0.15, zb + t + 0.05] });
  };
  const espT = translation([bx0 + 20, -60, dz + 9]);
  clamp(bx0 + 20, -60, 62.74, 25.4, dz + 9, 1.6);
  const tmcT = [0, 1, 2].map((k) => translation([bx0 + 100, -60 + k * 22, dz + 12]));
  for (let k = 0; k < 3; k++) clamp(bx0 + 100, -60 + k * 22, 20.3, 15.2, dz + 12, 1.6);
  // ventilation slots through the deck, except where a board clip stands (a slot under a clip leaves it floating)
  for (let k = 0; k < 6; k++) {
    const y0 = -90 + k * 30, y1 = -80 + k * 30;
    let xs: [number, number][] = [[bx0 + 15, bx0 + 155]];
    for (const [xa, xb, ya, yb] of clampBoxes) if (ya < y1 + 1 && yb > y0 - 1) xs = xs.flatMap(([a, b]) => [[a, Math.min(b, xa - 2)], [Math.max(a, xb + 2), b]] as [number, number][]).filter(([a, b]) => b - a > 6);
    for (const [a, b] of xs) deck.push({ op: "cutbox", min: [a, y0, 45], max: [b, y1, 50] });
  }
  const wsT = translation([bx0 + 20, 20, dz + 6]);
  for (const [hx, hy] of [[3, 3], [39, 3], [3, 30], [39, 30]]) deck.push({ op: "rod", a: [bx0 + 20 + hx, 20 + hy, dz - 0.1], b: [bx0 + 20 + hx, 20 + hy, dz + 6], r: 2.5 }, { op: "hole", a: [bx0 + 20 + hx, 20 + hy, dz - 1], b: [bx0 + 20 + hx, 20 + hy, dz + 6.1], d: 1.8 });
  A.printedLink("controller_deck", { name: "controller_deck", ops: deck }, { role: "link", material: "printed" });
  A.fixed("controller_deck_mount", "controller_box", "controller_deck", I4());
  A.mount("controller_deck", "esp32_s3_devkitc1", espT, "controller", "ESP32-S3 motion controller");
  tmcT.forEach((T, k) => A.mount("controller_deck", "tmc2209_stepstick", T, `driver_${["j1", "j2", "z"][k]}`, "stepper drivers (J1, J2, Z)"));
  A.mount("controller_deck", "waveshare_bus_servo_adapter", wsT, "servo_bus", "wrist + gripper servo bus");
  A.fastener("M3 x 6 socket head (PSU bottom)", 4);
  // lid over the whole box: screws into four corner lugs, slots over the supplies
  const lugs: [number, number][] = [[bx0 + 9, -94], [bx0 + 162, -94], [bx0 + 9, 94], [bx0 + 162, 94]];
  const lid: Op[] = [{ op: "box", min: [bx0, -103, 86.2], max: [bx0 + 171, 103, 89], r: 6 }, { op: "box", min: [bx0 + 3.4, -99.6, 83], max: [bx0 + 167.6, 99.6, 86.3], r: 3 }, { op: "cutbox", min: [bx0 + 6, -97, 82], max: [bx0 + 165, 97, 86] }];
  for (let k = 0; k < 16; k++) lid.push({ op: "cutbox", min: [bx0 + 24, -84 + k * 11, 81], max: [bx0 + 150, -80 + k * 11, 90] });
  for (const [x, y] of lugs) lid.push({ op: "hole", a: [x, y, 81], b: [x, y, 90], d: 3.4 });
  A.printedLink("controller_lid", { name: "controller_lid", ops: lid }, { material: "printed_dark" });
  A.fixed("controller_lid_mount", "controller_box", "controller_lid", I4());
  A.amendProgram("controller_box", lugs.flatMap(([x, y]): Op[] => [{ op: "box", min: [x - 5, y - 5, 71], max: [x + 5, y + 5, 86] }, { op: "hole", a: [x, y, 74], b: [x, y, 87], d: 2.6 }]));
  A.fastener("M3 x 10 self-tapping (controller lid)", 4);
  A.mount("controller_box", "iec_c14_fused_switched", frame([bx0, -8, 66], [-1, 0, 0], [0, 0, 1]), "mains_inlet", "fused, switched mains inlet");
  A.fastener("M2 x 6 screw (bus adapter)", 4);

  // ---------------- sensors ----------------
  mountSensors(A, p.sensors, {
    camera: { link: "outer_arm", T: rel(T2, camT), use: "eye-in-hand camera looking down past the gripper" },
    depth: { link: "column_top", T: rel(T1, frame([4, 0, zT + 12.5], [0, 0, 1], [0, 1, 0])), use: "depth camera on the column, looking along the arm" },
    imu: { link: "inner_arm", T: rel(Tz, translation([-40, -11.35, zcb0 + CARRIAGE_H + 4])), use: "IMU on the Z carriage (vibration / collision detection)" },
  });
  A.spec.root = "base_link";
  return { A, g, frames: { T1, Tz, T2, Tw }, stroke, zcb0, zw, zf1, bx0 };
}

/** Closest the wrist axis may come to the J1 axis: column platform radius + the gripper's swept radius, mm. */
function gripperReach(_grip: string): number {
  const halfLen = SCARA_GRIP.stroke + SCARA_GRIP.carriage + 11, halfW = 27;
  return PLATFORM_R + Math.hypot(halfLen, halfW) + 5;
}
/** Weight x horizontal lever (N·m) of everything a vertical-axis joint carries: the moment its bearings take. */
function overhung(spec: RobotSpecification, joint: string, loads: PointLoad[]): number {
  const f = fk(spec, {}), j = spec.joints.find((x) => x.name === joint)!, below = descendants(spec, j.child), p = f.joint[joint].p;
  let mx = 0, my = 0;
  for (const l of spec.links) if (below.has(l.name)) { const T = f.link[l.name], c = linkCom(l); const w = [0, 1].map((i) => T.R[i][0] * c[0] + T.R[i][1] * c[1] + T.R[i][2] * c[2] + T.p[i]); mx += l.mass * (w[0] - p[0]); my += l.mass * (w[1] - p[1]); }
  for (const L of loads) if (below.has(L.link)) { const T = f.link[L.link]; const w = [0, 1].map((i) => T.R[i][0] * L.at[0] + T.R[i][1] * L.at[1] + T.R[i][2] * L.at[2] + T.p[i]); mx += L.massKg * (w[0] - p[0]); my += L.massKg * (w[1] - p[1]); }
  return 9.81 * Math.hypot(mx, my);
}

export function designScara(req: DesignRequest = {}): RobotSpecification {
  const payload = req.payloadKg ?? 0.5, reach = (req.reachM ?? 0.3) * 1000;
  const L1 = Math.round(reach * 0.55), L2 = Math.round(reach - L1);
  const grip = chooseGripperServo(payload, req.budget);
  const wristLadder = ["feetech_sts3215_c047", "feetech_sts3250"];
  const plan: Plan = { L1, L2, j1: "nema17_42x40_pg5", j2: "nema17_42x40_pg5", wrist: wristLadder[0], grip, payload, sensors: req.sensors ?? [] };
  let b = build(req.name ?? "scara_arm", req.prompt, plan), res = analyse(b, plan);
  if (!res.wristOk && plan.wrist !== wristLadder[1]) { plan.wrist = wristLadder[1]; b = build(req.name ?? "scara_arm", req.prompt, plan); res = analyse(b, plan); }
  const { A } = b;
  A.design.request = { ...req };
  record(A, b, plan, res);
  wireScara(A, new Harness(A), b);
  recordCost(A);
  return A.finish(`SCARA arm: ${(reach / 1000).toFixed(2)} m reach, ${b.stroke} mm Z stroke, ${payload} kg payload; NEMA17 + 5.18:1 planetary on J1/J2, Tr8x8 lead-screw Z, ${part(plan.wrist).name} wrist, parallel gripper`);
}

function analyse(b: ReturnType<typeof build>, p: Plan) {
  const { A, g } = b, s = A.spec;
  const tcpLocal = apply(invert(b.frames.Tw), g.tcp).map((x) => x / 1000) as Vec3;
  const loads: PointLoad[] = [{ link: "wrist_flange", at: tcpLocal, massKg: p.payload }];
  const out = { J1: axisInertia(s, "j1", {}, loads), J2: axisInertia(s, "j2", {}, loads), Jw: axisInertia(s, "wrist_roll", {}, loads), tilt1: 0, tilt2: 0, zN: 0, wristOk: true, zStaticN: 0 };
  // overhung (tilting) moment the J1/J2 bearing pairs carry: weight x horizontal lever, arm stretched out
  out.tilt1 = overhung(s, "j1", loads); out.tilt2 = overhung(s, "j2", loads);
  out.zStaticN = gravityTorques(s, {}, loads).z ?? 0;
  const wristReq = out.Jw * TARGET.wristAccel + 0.02;
  out.wristOk = rating(p.wrist).rated_nm >= wristReq * TARGET.stepperMargin;
  return out;
}

/** Netlist: one supply per voltage from the inlet; three steppers on TMC2209s from the ESP32; wrist and gripper on the servo bus. */
function wireScara(A: Assembly, H: Harness, b: ReturnType<typeof build>) {
  const x0 = b.bx0;
  registerBay(A, { name: "controller_bay", tub: "controller_box", lid: "controller_lid", solids: ["controller_box", "controller_lid"], parent: "controller_box", T: translation([0, 0, 0]), min: [x0 + 3, -100, 3], max: [x0 + 168, 100, 86], screws: 4, vent_area_mm2: 16 * 126 * 4 + 2 * 8 * 8 * 24,
    parts: ["psu_24v", "psu_12v", "controller", "driver_j1", "driver_j2", "driver_z", "servo_bus"],
    exits: [{ id: "controller_bay.harness", kind: "gland", face: "x+", at: [x0 + 171, 40, 60], normal: [1, 0, 0], hole_mm: 12.5 }, { id: "controller_bay.usb", kind: "usb", face: "y-", at: [x0 + 60, -103, 60], normal: [0, -1, 0], hole_mm: 16 }, { id: "controller_bay.mains", kind: "switch", face: "x-", at: [x0, -8, 66], normal: [-1, 0, 0], hole_mm: 27, part: "mains_inlet" }] }, H);
  H.mainSwitch = "mains_inlet";
  for (const [i, psu] of (["psu_24v", "psu_12v"] as const).entries()) for (const [n, a, c] of [[`MAINS_L${i}`, "L", "AC/L"], [`MAINS_N${i}`, "N", "AC/N"], [`MAINS_E${i}`, "E", "FG"]] as const) { H.net(n, "power", 230); H.wire(n, `mains_inlet.load.${a}`, `${psu}.ac_in.${c}`, { typ: 1, peak: 2 }); }
  H.notes.push("Mains side: IEC inlet to both supplies' AC terminals with insulated spades, earth wired first, lid on before plugging in. Have it checked if you are not qualified to wire mains.");
  H.mainPower("V24", { source: "psu_24v", pos: "DC OUTPUT +V", neg: "DC OUTPUT -V", fuse: false, volts: 24, cont: 6.5, peakLimit: 7.1, simNote: "all three steppers at full current" });
  H.rail("V12", { source: "psu_12v", out: "DC OUTPUT +V", gnd: "DC OUTPUT -V", volts: 12, cont: 6, peakLimit: 6.6, simultaneous: 1, simNote: "one servo stalled, the other running" });
  const pins = ["4", "5", "6", "7", "15", "16", "17", "18", "8", "3", "9", "10"];
  (["j1", "j2", "z"] as const).forEach((n, i) => {
    const d = `driver_${n}`, m = `${n}_motor`, r = H.rec(m).current_a.v;
    H.feed("V24", d, { v: "VM", g: "GND", typ: r.typical * 0.6, peak: r.peak });
    H.net(`${n}_VIO`.toUpperCase(), "power", 3.3); H.wire(`${n}_VIO`.toUpperCase(), "controller.3V3", `${d}.VIO`, { typ: 0.02 });
    H.signals("controller", d, [[pins[i * 3], "STEP", `${n}_STEP`.toUpperCase()], [pins[i * 3 + 1], "DIR", `${n}_DIR`.toUpperCase()], [pins[i * 3 + 2], "EN", `${n}_EN`.toUpperCase()]]);
    for (const [c, pin] of [["M1A", "A (black)"], ["M1B", "A\\ (green)"], ["M2A", "B (red)"], ["M2B", "B\\ (blue)"]] as const) { const nn = `${n}_${c}`.toUpperCase(); H.net(nn, "signal"); H.wire(nn, `${d}.${c}`, `${m}.${pin}`, { typ: r.typical * 0.6, peak: r.peak }); }
  });
  busChain(H, { adapter: "servo_bus", servos: ["wrist_servo", "gripper_servo"], rail: "V12" });
  H.spare("servo_bus.dc_in");
  H.notes.push("The ESP32-S3 runs from its USB lead to the PC; its 3V3 drives the stepper drivers' logic. Ground joins through the bus and control wires.");
  H.wire("GND", "controller.G", "driver_j1.GND", { typ: 0.02 });
  H.spare("controller.j1.5V");
  for (const x of A.spec.links.map((l) => l.name).filter((n) => /_sensor$/.test(n))) { H.scan(); exposed(A, x, "on its mount, wired to the host PC", [20, 20]); for (const p of H.rec(x).ports) H.spare(`${x}.${p.name}`); }
  finishWiring(H);
  enclosureChecks(A);
}

function record(A: Assembly, b: ReturnType<typeof build>, p: Plan, r: ReturnType<typeof analyse>) {
  const g = 9.81;
  const joint = (name: string, key: string, req: number, note: string, marginOn: "rated" | "peak") => {
    const rt = rating(key), margin = (marginOn === "rated" ? rt.rated_nm : rt.peak_nm) / Math.max(req, 1e-9);
    A.design.joints.push({ joint: name, actuator: key, required_nm: +req.toFixed(3), rated_nm: rt.rated_nm, peak_nm: rt.peak_nm, margin: +margin.toFixed(2), speed_rad_s: rt.speed_rad_s, note });
    return margin;
  };
  // J1 / J2: inertial loads (axes vertical: gravity gives no torque about them)
  for (const [j, J, acc, key] of [["j1", r.J1, TARGET.j1Accel, p.j1], ["j2", r.J2, TARGET.j2Accel, p.j2]] as const) {
    const req = (J * acc) / TARGET.gearEff + TARGET.frictionNm;
    const m = joint(j, key, req, `inertia ${J.toFixed(4)} kg·m² (arm stretched, ${p.payload} kg at the TCP) x ${acc} rad/s² / ${TARGET.gearEff} gearbox efficiency + ${TARGET.frictionNm} N·m bearing/seal friction`, "rated");
    A.check(`torque:${j}`, m >= TARGET.stepperMargin, `needs ${req.toFixed(2)} N·m to reach ${acc} rad/s²; ${part(key).name} gives ${rating(key).rated_nm} N·m permissible (${m.toFixed(2)}x, stepper rule >= ${TARGET.stepperMargin}x to avoid lost steps)`);
    const direct = rating("nema17_42x40").rated_nm;
    A.design.assumptions.push(`${j.toUpperCase()}: a direct-drive NEMA17 (${direct} N·m pull-out) would give only ${(direct / ((J * acc) + TARGET.frictionNm)).toFixed(2)}x margin, so the 5.18:1 planetary is used.`);
  }
  // bearing pairs carry the overhung moment
  for (const [j, M, bearing, gap] of [["j1", r.tilt1, "bearing_6808", HOUSING - 7 - 9], ["j2", r.tilt2, "bearing_6806zz", HOUSING - 7 - 9]] as const) {
    const F = M / ((gap + 7) / 1000), C0 = bearingSpec(bearing).C0;
    A.check(`bearing:${j}`, F * 2 <= C0, `overhung moment ${M.toFixed(2)} N·m on two ${part(bearing).specs.designation} spaced ${gap + 7} mm: ${F.toFixed(0)} N radial each vs C0 ${C0} N (safety 2)`);
  }
  // Z: weight + acceleration through the screw efficiency
  const zMass = r.zStaticN / g, zReqN = r.zStaticN + zMass * TARGET.zAccel + 4 * 2; // + bushing / wiper drag
  const sc = part("leadscrew_t8x8_300").specs, lead = Number(sc.lead_mm) / 1000, eta = Number(sc.efficiency), etaB = Number(sc.backdrive_efficiency);
  const zTorque = (zReqN * lead) / (2 * Math.PI * eta), zr = rating("nema17_42x40");
  const zm = zr.rated_nm / zTorque;
  // the record is in joint space like the URDF (z is prismatic): force in N and speed in m/s at the carriage
  const toN = (nm: number) => (2 * Math.PI * eta * nm) / lead;
  A.design.joints.push({ joint: "z", actuator: "nema17_42x40", required_nm: +zReqN.toFixed(1), rated_nm: +toN(zr.rated_nm).toFixed(1), peak_nm: +toN(zr.peak_nm).toFixed(1), margin: +zm.toFixed(2),
    speed_rad_s: +((zr.speed_rad_s * lead) / (2 * Math.PI)).toFixed(4), unit: "N",
    note: `joint space (N, m/s at the carriage): lifts ${zMass.toFixed(2)} kg (carriage, arms, wrist, gripper, payload) at ${TARGET.zAccel} m/s²: ${zReqN.toFixed(0)} N on a Tr8x8 screw (lead 8 mm, efficiency ${eta}) = ${zTorque.toFixed(3)} N·m motor torque; the NEMA17's ${zr.rated_nm} N·m rated gives ${toN(zr.rated_nm).toFixed(0)} N` });
  A.check("torque:z", zm >= TARGET.stepperMargin, `needs ${zTorque.toFixed(3)} N·m at the motor, NEMA17 gives ${zr.rated_nm} N·m (${zm.toFixed(1)}x)`);
  const holdNm = (r.zStaticN * lead * etaB) / (2 * Math.PI), holdM = Number(part("nema17_42x40").specs.holding_torque_nm) * 0.5 / Math.max(holdNm, 1e-9);
  A.check("z:holding", holdM >= 3, `the 8 mm-lead screw is back-drivable (efficiency ${etaB}): the load applies ${holdNm.toFixed(3)} N·m to the motor; the energised NEMA17 at 50 % hold current gives ${(Number(part("nema17_42x40").specs.holding_torque_nm) * 0.5).toFixed(3)} N·m (${holdM.toFixed(0)}x)`);
  A.design.assumptions.push("Unpowered, the Z carriage slowly back-drives the 8 mm-lead screw and settles on its lower stop; a 2 mm-lead screw would self-lock at a quarter of the speed.");
  // wrist
  const wReq = r.Jw * TARGET.wristAccel + 0.02, wm = joint("wrist_roll", p.wrist, wReq, `gripper + payload inertia ${r.Jw.toFixed(5)} kg·m² x ${TARGET.wristAccel} rad/s² + 0.02 N·m`, "rated");
  A.check("torque:wrist_roll", wm >= TARGET.stepperMargin, `needs ${wReq.toFixed(3)} N·m, ${part(p.wrist).name} rated ${rating(p.wrist).rated_nm} N·m (${wm.toFixed(1)}x)`);
  // gripper
  for (const c of b.g.checks) A.check(c.name, c.pass, c.detail);
  A.check("grip:hold", b.g.holdKg >= p.payload * GRIP.safety, `${b.g.forceRatedN.toFixed(1)} N per finger at rated servo torque, friction ${GRIP.mu}: holds ${b.g.holdKg.toFixed(2)} kg vs ${p.payload} kg x ${GRIP.safety}`);
  const rg = rating(p.grip);
  A.design.joints.push({ joint: "finger_a", actuator: p.grip, required_nm: +((p.payload * GRIP.safety * g * 2 * b.g.rp) / 1000 / (2 * GRIP.mu)).toFixed(3), rated_nm: rg.rated_nm, peak_nm: rg.peak_nm, margin: +(b.g.holdKg / (p.payload * GRIP.safety)).toFixed(2), speed_rad_s: rg.speed_rad_s, note: "gripper pinion; finger_b and the pinion mimic finger_a" });
  // power
  const stepA = 3 * Number(part("nema17_42x40_pg5").specs.current_a) * 0.6, servoA = Number(part(p.wrist).specs.stall_current_a ?? 2) + Number(part(p.grip).specs.stall_current_a ?? 2);
  A.check("power:24v", stepA <= 6.5 * 0.8, `three steppers draw ~${stepA.toFixed(1)} A from the supply at 24 V (chopper drivers, 60 % of phase current) vs 6.5 A`);
  A.check("power:12v", servoA <= 6, `wrist and gripper servos both stalled draw ${servoA.toFixed(1)} A vs the 6 A supply`);
  A.check("drivers:current", Number(part("nema17_42x40_pg5").specs.phase_current_a) <= Number(part("tmc2209_stepstick").specs.current_rms_a), `motor phase current ${part("nema17_42x40_pg5").specs.phase_current_a} A vs TMC2209 ${part("tmc2209_stepstick").specs.current_rms_a} A RMS`);
  const backlash = Number(part(p.j1).specs.backlash_deg ?? 1) * Math.PI / 180;
  const err = (p.L1 + p.L2) * backlash + p.L2 * Number(part(p.j2).specs.backlash_deg ?? 1) * Math.PI / 180;
  A.design.performance = {
    reach_m: (p.L1 + p.L2) / 1000, inner_arm_mm: p.L1, outer_arm_mm: p.L2, z_stroke_mm: b.stroke, payload_kg: p.payload, mass_kg: +totalMass(A.spec).toFixed(3),
    j1_range_deg: 332, j2_range_deg: +((A.spec.joints.find((j) => j.name === "j2")!.limit!.upper! * 2 * 180) / Math.PI).toFixed(0),
    tcp_speed_m_s: +((TARGET.j1Speed * (p.L1 + p.L2)) / 1000).toFixed(2), z_speed_mm_s: +(rating("nema17_42x40").speed_rad_s * 8 / (2 * Math.PI)).toFixed(0),
    worst_backlash_error_mm: +err.toFixed(1), j1_inertia_kgm2: +r.J1.toFixed(4), j2_inertia_kgm2: +r.J2.toFixed(4),
    gripper_stroke_mm: 2 * SCARA_GRIP.stroke, grip_force_rated_n: +b.g.forceRatedN.toFixed(1), lowest_fingertip_mm: TARGET.tableClear,
  };
  A.design.assumptions.push(
    `Sizing targets: J1 ${TARGET.j1Accel} rad/s², J2 ${TARGET.j2Accel} rad/s², wrist ${TARGET.wristAccel} rad/s², Z ${TARGET.zAccel} m/s² with ${p.payload} kg at full reach; steppers keep >= ${TARGET.stepperMargin}x margin on their usable torque so they do not lose steps.`,
    "J1 and J2 are vertical axes: gravity loads their bearings, not their motors. Each output hub runs in two thin-section bearings that carry the overhung moment; the gearbox shaft only transmits torque.",
    `Planetary backlash (${part(p.j1).specs.backlash_deg}° per joint) limits repeatability to about ±${(err / 2).toFixed(1)} mm at the TCP; a GT2 belt reduction (as in the HowToMechatronics build) or a low-backlash gearbox improves it.`,
    `Joint speed limits are configured below the gearmotor's ${rating(p.j1).speed_rad_s} rad/s no-load speed (J1 ${TARGET.j1Speed} rad/s, J2 ${TARGET.j2Speed} rad/s): stepper pull-out torque falls with speed, and these limits keep the sized acceleration available.`,
    `Z travel starts where the fingertips are ${TARGET.tableClear} mm above the table/base plate; the controller box stands outside the swept radius.`,
    `J2 is limited to ±${(A.spec.joints.find((j) => j.name === "j2")!.limit!.upper! * 180 / Math.PI).toFixed(0)}° so the gripper never swings into the column or base.`,
    "Steppers run open loop with sensorless homing (TMC2209 StallGuard) or end-stop switches (not modelled); the ESP32-S3 runs the kinematics and talks to the drivers over STEP/DIR + UART and to the servos over the bus adapter.",
    "Controller box: printed case with a screwed lid and an electronics deck; mains come in through a fused, switched IEC inlet, earth wired first.",
  );
}
