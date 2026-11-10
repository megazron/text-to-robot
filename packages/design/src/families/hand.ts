// Dexterous five-finger hand, tendon-driven like the open-source InMoov hand: five MG90S servos in the printed forearm
// pull braided lines over printed spools to curl the four fingers and the thumb; a sixth servo in the palm swings the
// thumb across the palm (opposition). Each finger has three phalanges on pins; the line runs over all three joints, so
// the middle and end joints follow the base joint (modelled as URDF mimic joints: one motor per finger, underactuated).
// An Arduino Nano and a PCA9685 in a bench control case drive the servos from a 5 V adapter.
//
// Checks: fingertip force from servo torque through spool and joint radii, the grip it gives (a power grasp of a
// cylinder held by friction), closing speed, servo current against the supply, print fit, nothing collides when curled.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, type Vec3 } from "@ttr/parts";
import { frame, mul, translation, invert, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { totalMass } from "../kin.ts";
import { controlCase, enclosureChecks } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { withSolids, interferences } from "../clearance.ts";
import { recordCost, type DesignRequest } from "./common.ts";

const SERVO = "hobby_mg996r", SWING = "hobby_mg90s";   // flexion servos in the forearm (as in InMoov), a micro servo in the palm for the thumb swing
const SPOOL_R = 6, JOINT_R = 8;               // tendon spool radius on the servo, tendon moment arm at each finger joint (mm)
const ZS = 14;                                // flexion servo output faces (forearm frame z)
const MU = 0.6, G = 9.81;                      // silicone fingertip pads on a dry object
const FINGERS = [{ name: "index", y: 27, L: [42, 26, 20] }, { name: "middle", y: 9, L: [45, 28, 21] }, { name: "ring", y: -9, L: [42, 26, 20] }, { name: "little", y: -27, L: [34, 22, 18] }];
const PALM = { x0: 0, x1: 88, y: 40, z: 12 };

/**
 * One phalanx from joint a to joint b (along +x): a round tongue at a that turns in the slot of the part before it, a
 * narrow neck (so the curled finger clears the fork it turns in), the body, and at b a fork (a slot between two cheeks)
 * for the next tongue, unless it is the tip. A pin hole at each joint and a groove underneath for the tendon.
 */
function phalanxOps(a: Vec3, b: Vec3, w: number, t: number, last: boolean, tongue: number): Op[] {
  const r = t / 2, y0 = a[1], neck = a[0] + 12, xe = b[0] - (last ? 4 : 0), rodY = (x: number, half: number, rr: number): Op => ({ op: "rod", a: [x, y0 - half, a[2]], b: [x, y0 + half, a[2]], r: rr });
  const ops: Op[] = [{ op: "hull", of: [rodY(a[0], tongue, r), rodY(neck, tongue, r - 0.5)] }, { op: "hull", of: [rodY(neck, w / 2, r - 0.5), rodY(xe, w / 2 - (last ? 1 : 0), r - (last ? 1 : 0.5))] }];
  // the fork's slot is square-ended (a round one leaves feather edges that do not print)
  if (!last) ops.push({ op: "cutbox", min: [b[0] - r - 1.2, y0 - (w / 2 - 2.5), b[2] - r - 1], max: [b[0] + r + 1, y0 + (w / 2 - 2.5), b[2] + r + 1] }, { op: "hole", a: [b[0], y0 - w, b[2]], b: [b[0], y0 + w, b[2]], d: 2.1 });
  ops.push({ op: "hole", a: [a[0], y0 - w, a[2]], b: [a[0], y0 + w, a[2]], d: 2.1 });
  ops.push({ op: "cutbox", min: [a[0] + 4, y0 - 1.2, a[2] - r - 1], max: [b[0] - r - 1.2, y0 + 1.2, a[2] - r + 1.0] });
  return ops;
}
/** Phalanx widths at their far end, and the tongue each turns on (the slot of the part before it, less 0.4 mm). */
const WIDTH = [12, 11, 10], TONGUE = [4.1, 12 / 2 - 2.5 - 0.4, 11 / 2 - 2.5 - 0.4];

const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function designHand(req: DesignRequest = {}): RobotSpecification {
  const A = new Assembly(req.name ?? "robot_hand", "hand_dexterous", req.prompt);
  A.design.request = { ...req } as Record<string, unknown>;
  const I = translation([0, 0, 0]);

  // ---------------- forearm: a printed tray holding five servos upright in two rows, a lid, and an arm-mount flange at its rear
  // two staggered rows of MG996R, output up, long axis along the forearm
  const servoT: Mat4[] = [[-190, 20], [-130, 20], [-70, 20], [-160, -20], [-100, -20]].map(([x, y]) => frame([x, y, ZS], [0, 0, 1], [1, 0, 0]));
  const fx0 = -190 - 36.65 - 6, fx1 = -4, FW = 42, zF = ZS - 44.1 - 3.5;
  const fore: Op[] = [{ op: "box", min: [fx0, -FW, zF], max: [fx1, FW, zF + 3], r: 6 }];
  for (const s of [-1, 1]) fore.push({ op: "box", min: [fx0, s > 0 ? FW - 3 : -FW, zF], max: [fx1, s > 0 ? FW : -FW + 3, ZS + 7], r: 1 });
  fore.push({ op: "box", min: [fx0, -FW, zF], max: [fx0 + 3, FW, ZS + 7] });
  for (const T of servoT) fore.push({ op: "cradle", key: SERVO, T, wall: 2.4 });
  // rear flange: 4 x M6 on PCD 50 (the same adapter as the grippers), so the hand bolts to an arm's tool flange
  const zc = (zF + ZS + 7) / 2;
  fore.push({ op: "box", min: [fx0 - 8, -32, zc - 30], max: [fx0, 32, zc + 30], r: 3 });
  for (const [y, z] of [[-17.7, -17.7], [17.7, -17.7], [-17.7, 17.7], [17.7, 17.7]]) fore.push({ op: "hole", a: [fx0 - 9, y, zc + z], b: [fx0 + 1, y, zc + z], d: 6.6 });
  // the wrist end wall with one eyelet per tendon, and the palm's mounting tongue
  fore.push({ op: "box", min: [fx1 - 3, -FW, zF], max: [fx1, FW, ZS + 7] });
  for (let k = 0; k < 5; k++) fore.push({ op: "hole", a: [fx1 - 4, -24 + k * 12, -6], b: [fx1 + 1, -24 + k * 12, -6], d: 2.5 });
  A.printedLink("base_link", { name: "base_link", ops: fore }, { role: "base", material: "printed_dark" });
  A.spec.root = "base_link";
  const lid: Op[] = [{ op: "box", min: [fx0 + 3, -FW, ZS + 7.2], max: [fx1 - 3, FW, ZS + 9.6], r: 4 }];
  for (let k = 0; k < 9; k++) lid.push({ op: "cutbox", min: [fx0 + 20 + k * 24, -26, ZS + 7], max: [fx0 + 28 + k * 24, 26, ZS + 10] });
  A.printedLink("forearm_lid", { name: "forearm_lid", ops: lid }, { material: "printed_accent" });
  A.fixed("forearm_lid_mount", "base_link", "forearm_lid", I);
  servoT.forEach((T, k) => {
    A.mount("base_link", SERVO, T, `${k < 4 ? FINGERS[k].name : "thumb"}_servo`, `${k < 4 ? FINGERS[k].name : "thumb"} flexion (pulls its tendon)`);
    // the spool presses on the servo's own spline (a round horn screwed under it) and is held by the horn screw
    A.printedLink(`spool_${k + 1}`, { name: `spool_${k + 1}`, ops: [{ op: "at", T, of: [{ op: "rod", a: [0, 0, 0.7], b: [0, 0, 2], r: SPOOL_R + 3 }, { op: "rod", a: [0, 0, 2], b: [0, 0, 5], r: SPOOL_R }, { op: "rod", a: [0, 0, 5], b: [0, 0, 6.3], r: SPOOL_R + 3 }, { op: "hole", a: [0, 0, 0], b: [0, 0, 7], d: 3.2 }, { op: "hole", a: [3.6, 0, 0], b: [3.6, 0, 7], d: 1.6 }] }] }, { material: "printed_accent" });
    A.fixed(`spool_${k + 1}_mount`, `${k < 4 ? FINGERS[k].name : "thumb"}_servo`, `spool_${k + 1}`, invert(T));
  });
  A.fastener("M4 x 12 (servo ears)", 20); A.fastener("braided fishing line 0.5 mm (40 kg), 2 m (tendons)", 1); A.fastener("M3 x 8 (lid)", 4);

  // ---------------- palm, with the thumb-swing servo inside it
  const palm: Op[] = [{ op: "box", min: [-4, -PALM.y, -PALM.z], max: [PALM.x1 - 8, PALM.y, PALM.z], r: 2 },
    // knuckle forks for the four fingers at the far edge
    ...FINGERS.flatMap((f): Op[] => [-1, 1].map((s): Op => ({ op: "box", min: [PALM.x1 - 10, f.y + s * 6 - 1.5, -5], max: [PALM.x1 + 4, f.y + s * 6 + 1.5, 5], r: 1 }))),
    ...FINGERS.map((f): Op => ({ op: "hole", a: [PALM.x1, f.y - 9, 0], b: [PALM.x1, f.y + 9, 0], d: 2.1 })),
    // tendon grooves to every finger, open on the palm face and closed by the glued palm pad; the thumb-swing servo sits on the back of the palm in a cradle
    { op: "cradle", key: SWING, T: frame([28, 20, 12 + 8.5], [1, 0, 0], [0, 1, 0]), wall: 2 },
    ...FINGERS.map((f): Op => ({ op: "subtract", of: [{ op: "beam", a: [-5, f.y * 0.5, -PALM.z + 0.8], b: [PALM.x1 - 6, f.y, -PALM.z + 0.8], w: 2.4, h: 2.4 }] }))];
  A.printedLink("palm", { name: "palm", ops: palm }, { material: "printed" });
  A.fixed("palm_mount", "base_link", "palm", I);
  A.fastener("M3 x 12 (palm to forearm)", 4);
  const thumbServoT = frame([28, 20, 12 + 8.5], [1, 0, 0], [0, 1, 0]);
  A.mount("palm", SWING, thumbServoT, "thumb_swing_servo", "thumb opposition (direct drive)");

  // ---------------- fingers: base joint actuated (tendon), middle and end joints mimic it
  const r = rating(SERVO), tendonN = r.rated_nm / (SPOOL_R / 1000), jointNm = tendonN * (JOINT_R / 1000);
  const bend = (name: string, parent: string, parentW: Mat4, at: Vec3, axis: Vec3, x: Vec3, child: string, lim: [number, number], mimic?: { joint: string; m: number }, key = SERVO) => {
    const W = frame(at, axis, x);
    const j = A.revolute(name, parent, child, mul(invert(parentW), W), key, lim[0], lim[1]);
    j.limit!.effort = +(jointNm * 1.2).toFixed(3);
    if (mimic) j.mimic = { joint: mimic.joint, multiplier: mimic.m, offset: 0 };
    return W;
  };
  const tips: { finger: string; link: string; at: Vec3 }[] = [];
  const PW = translation([0, 0, 0]);
  for (const f of FINGERS) {
    let x = PALM.x1, parent = "palm", parentW = PW;
    const names = [`${f.name}_proximal`, `${f.name}_middle`, `${f.name}_distal`], joints = [`${f.name}_mcp`, `${f.name}_pip`, `${f.name}_dip`];
    for (let k = 0; k < 3; k++) {
      const W = bend(joints[k], parent, parentW, [x, f.y, 0], [0, 1, 0], [1, 0, 0], names[k], k === 0 ? [0, 1.45] : [0, 1.5], k === 0 ? undefined : { joint: joints[0], m: k === 1 ? 1.0 : 0.8 });
      const a: Vec3 = [x, f.y, 0], b: Vec3 = [x + f.L[k], f.y, 0];
      A.printedLink(names[k], { name: names[k], ops: [{ op: "at", T: invert(W), of: phalanxOps(a, b, WIDTH[k], k === 0 ? 14 : 12, k === 2, TONGUE[k]) }] }, { material: k % 2 ? "printed" : "printed_accent" });
      parent = names[k]; parentW = W; x += f.L[k];
    }
    tips.push({ finger: f.name, link: names[2], at: [x - 6, f.y, -6] });
    A.fastener("2 mm steel pin, 18 mm (finger joints)", 3); A.fastener("elastic cord (finger return), 0.3 m", 1);
  }
  // thumb: swing about the palm's long axis, then two flexion joints along the thumb
  const tb: Vec3 = [30, 41, 0];
  const swingW = bend("thumb_swing", "palm", PW, [28, 20, 20.5], [1, 0, 0], [0, 1, 0], "thumb_base", [0, 1.0], undefined, SWING);
  A.spec.joints[A.spec.joints.length - 1].limit!.effort = rating(SWING).peak_nm;
  const u: Vec3 = [Math.SQRT1_2, Math.SQRT1_2, 0], ax: Vec3 = [-Math.SQRT1_2, Math.SQRT1_2, 0];
  // thumb links are phalanxOps in a frame with x along the thumb (u) and y along its joint axes (ax)
  const t0: Vec3 = [tb[0] + 30, tb[1] + 18, 0], thumbF = (o: Vec3): Mat4 => frame(o, cross3(u, ax), u);
  const tmW = bend("thumb_mcp", "thumb_base", swingW, t0, ax, u, "thumb_proximal", [0, 1.2]);
  const t1: Vec3 = [t0[0] + u[0] * 32, t0[1] + u[1] * 32, 0];
  const tiW = bend("thumb_ip", "thumb_proximal", tmW, t1, ax, u, "thumb_distal", [0, 1.3], { joint: "thumb_mcp", m: 0.9 });
  const t2: Vec3 = [t1[0] + u[0] * 26, t1[1] + u[1] * 26, 0];
  // the base: a round horn disc on the swing servo, an arm out to a fork at t0 (cheeks either side of the proximal tongue)
  const back: Vec3 = [t0[0] - u[0] * 15, t0[1] - u[1] * 15, 0];
  A.printedLink("thumb_base", { name: "thumb_base", ops: [{ op: "at", T: invert(swingW), of: [
    { op: "at", T: thumbServoT, of: [{ op: "rod", a: [0, 0, 1.0], b: [0, 0, 4.0], r: 6 }, { op: "hole", a: [0, 0, 0], b: [0, 0, 4.5], d: 2.2 }] },
    { op: "hull", of: [{ op: "rod", a: [31.5, 20, 20.5], b: [35, 20, 20.5], r: 7 }, { op: "rod", a: [44, 46, 18], b: [48, 46, 18], r: 6 }] },
    { op: "hull", of: [{ op: "rod", a: [44, 46, 18], b: [48, 46, 18], r: 6 }, { op: "rod", a: [back[0], back[1], -6], b: [back[0], back[1], 6], r: 6 }] },
    { op: "at", T: thumbF(t0), of: [...[-1, 1].map((sy): Op => ({ op: "box", min: [-16, sy > 0 ? 4.5 : -7.5, -6], max: [4, sy > 0 ? 7.5 : -4.5, 6], r: 1 })), { op: "hole", a: [0, -9, 0], b: [0, 9, 0], d: 2.1 }] }] }] }, { material: "printed_accent" });
  A.printedLink("thumb_proximal", { name: "thumb_proximal", ops: [{ op: "at", T: mul(invert(tmW), thumbF(t0)), of: phalanxOps([0, 0, 0], [32, 0, 0], 12, 14, false, 4.1) }] }, { material: "printed" });
  A.printedLink("thumb_distal", { name: "thumb_distal", ops: [{ op: "at", T: mul(invert(tiW), thumbF(t0)), of: phalanxOps([32, 0, 0], [58, 0, 0], 11, 12, true, TONGUE[1]) }] }, { material: "printed_accent" });
  tips.push({ finger: "thumb", link: "thumb_distal", at: t2 });
  A.design.tcp = { link: "palm", xyz: [0.06, 0, -0.03] };
  // the URDF root is a mounting point 200 mm above the bench (the hand bolts to an arm's flange or a stand); the case sits on the bench
  A.frameLink("stand"); A.fixed("stand_mount", "stand", "base_link", translation([0, 0, 200])); A.spec.root = "stand";

  // ---------------- control case on the bench: Nano + PCA9685, 5 V adapter
  const H = new Harness(A);
  controlCase(A, H, { parent: "stand", T: translation([-520, -60, -200]), psu: "psu_5v_lrs50", psuUse: "5 V 10 A servo supply (V+ terminal of the PCA9685)", boards: [{ name: "controller", key: "arduino_nano_clone", use: "Arduino Nano (serial commands from the PC)" }, { name: "servo_driver", key: "pca9685_clone", use: "16-channel PWM servo driver" }] });
  H.mainPower("V_SERVO", { source: "power_supply", pos: "DC OUTPUT +V", neg: "DC OUTPUT -V", fuse: false, volts: 5, cont: 10, peakLimit: 11, simultaneous: 3, simNote: "three flexion servos stalled on an object, the rest moving" });
  H.feed("V_SERVO", "servo_driver", { v: "v_plus.V+", g: "v_plus.GND", typ: 0.01, peak: 0.01 });
  const servos = ["index_servo", "middle_servo", "ring_servo", "little_servo", "thumb_servo", "thumb_swing_servo"];
  servos.forEach((s, ch) => {
    const rr = H.rec(s).current_a.v, d = H.rails.get("V_SERVO")!.feeds[0];
    // at most three flexion servos stall on an object at once (the rail rating); the others draw their running current
    d.typ += rr.typical; d.peak += ch < 3 ? rr.peak : rr.typical;
    H.net(`SERVO${ch}_PWM`, "signal"); H.net(`SERVO${ch}_V`, "power", 5);
    H.wire(`SERVO${ch}_PWM`, `servo_driver.ch${ch}.PWM${ch}`, `${s}.@pwm`); H.wire(`SERVO${ch}_V`, `servo_driver.ch${ch}.V+`, `${s}.@power`, { typ: rr.typical, peak: rr.peak }); H.wire("GND", `servo_driver.ch${ch}.GND`, `${s}.@ground`, { typ: rr.typical, peak: rr.peak });
  });
  for (let ch = servos.length; ch < 16; ch++) H.spare(`servo_driver.ch${ch}`);
  H.net("5V_LOGIC", "power", 5);
  H.wire("5V_LOGIC", "controller.5V", "servo_driver.control_in.VCC", { typ: 0.01 }); H.wire("GND", "controller.GND", "servo_driver.control_in.GND", { typ: 0.01 });
  H.signals("controller", "servo_driver", [["SDA", "SDA", "I2C_SDA"], ["SCL", "SCL", "I2C_SCL"]]);
  H.spare("servo_driver.control_out", "controller.j2_analog_side.VIN", "controller.icsp");
  H.notes.push("The Nano runs from its USB cable (serial commands from the PC); the servos from the adapter. Servo leads are extended to the forearm in one braided sleeve.");
  finishWiring(H, { noClips: /proximal|middle|distal|thumb_base|spool/ });
  enclosureChecks(A);

  // ---------------- clearance open and fully curled (fingers into a fist, thumb across)
  const skip = new Set<string>();
  for (const j of A.spec.joints) if (j.type === "fixed" && /servo|spool/.test(j.child)) skip.add(`${j.parent}|${j.child}`);
  skip.add("palm|thumb_swing_servo");
  const fist = Object.fromEntries(FINGERS.map((f) => [`${f.name}_mcp`, 1.2]));
  const hits = [{}, { ...fist, thumb_swing: 1.0, thumb_mcp: 0.6 }].flatMap((q) => withSolids(A.spec, (mdl) => interferences(mdl, q, undefined, 2, skip)).map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`));
  A.check("clearance:fist", hits.length === 0, hits.length ? `intersecting: ${[...new Set(hits)].slice(0, 6).join(", ")}` : "no part intersects another open or curled into a fist");

  // ---------------- grip
  const tipN = (L: number[]) => jointNm / ((L[0] + L[1] * 0.7 + L[2] * 0.4) / 1000);   // base-joint torque at the tip of the curled finger
  const fingerForces = FINGERS.map((f) => tipN(f.L)), thumbN = jointNm / 0.045, squeeze = Math.min(thumbN, fingerForces.reduce((s, x) => s + x, 0));
  const holdKg = (2 * MU * squeeze) / G;
  for (const f of FINGERS) A.design.joints.push({ joint: `${f.name}_mcp`, actuator: SERVO, required_nm: +(jointNm * 0.5).toFixed(3), rated_nm: +jointNm.toFixed(3), peak_nm: +(jointNm * r.peak_nm / r.rated_nm).toFixed(3), margin: 2, speed_rad_s: +(r.speed_rad_s * SPOOL_R / JOINT_R).toFixed(2),
    note: `servo ${r.rated_nm} N·m on a ${SPOOL_R} mm spool pulls the tendon with ${tendonN.toFixed(1)} N; ${JOINT_R} mm moment arm at each joint` });
  A.check("grip:power_grasp", holdKg >= 0.15, `fingertips push ${fingerForces.map((x) => x.toFixed(1)).join(" / ")} N, the thumb ${thumbN.toFixed(1)} N: a power grasp squeezes ${squeeze.toFixed(1)} N and holds ${holdKg.toFixed(2)} kg by friction (mu ${MU}, silicone pads)`);
  A.check("speed:close", r.speed_rad_s * SPOOL_R / JOINT_R / 1.45 > 1, `closes in about ${(1.45 / (r.speed_rad_s * SPOOL_R / JOINT_R)).toFixed(2)} s from fully open`);
  const amps = 3 * Number(H.rec("index_servo").current_a.v.peak) + 2 * Number(H.rec("index_servo").current_a.v.typical) + Number(H.rec("thumb_swing_servo").current_a.v.typical);
  A.check("power:supply", amps <= 10, `${amps.toFixed(1)} A with three flexion servos stalled on an object and the others moving vs the 10 A supply (four stalled at once trips the supply's current limit for a moment; the firmware staggers the grip)`);
  if (req.budget !== undefined) A.check("budget", recordCost(A) <= req.budget, `$${recordCost(A).toFixed(2)} of parts vs $${req.budget} budget`);
  (A.design as unknown as { tips: typeof tips }).tips = tips.map((t) => ({ ...t, at: t.at.map((x) => x / 1000) as Vec3 }));
  A.design.performance = { fingers: 5, actuators: 6, dof: 16, actuated_dof: 6, tendon_force_n: +tendonN.toFixed(1), squeeze_n: +squeeze.toFixed(1), holds_kg: +holdKg.toFixed(2), payload_kg: +holdKg.toFixed(2),
    close_time_s: +(1.45 / (r.speed_rad_s * SPOOL_R / JOINT_R)).toFixed(2), mass_kg: +totalMass(A.spec).toFixed(3), actuator: part(SERVO).name, mount: "rear flange, 4 x M6 on PCD 50 (fits the arms' tool flange)" };
  A.design.assumptions.push(
    "Each finger is underactuated: one tendon over three joints, elastic cord on the back to open it. The middle and end joints are modelled as following the base joint (mimic); a real tendon finger also wraps round an object's shape.",
    "Fingertip forces use the MG996R's rated torque (not its stall torque) through a 6 mm spool: a household-object hand (cups, fruit, small tools), not a crushing grip.",
    "Glue silicone pads (or print TPU caps) on the fingertips and palm: the grip numbers assume friction 0.6.",
  );
  recordCost(A);
  return A.finish(`Five-finger tendon hand: 5 MG996R flexion servos in the forearm, an MG90S thumb swing, 16 joints, squeezes about ${squeeze.toFixed(0)} N, holds about ${holdKg.toFixed(2)} kg`);
}
