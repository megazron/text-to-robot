// Two-finger parallel gripper, built like the open-source servo grippers it is modelled on:
// one bus servo turns a printed pinion between two racks; each rack belongs to a finger
// carriage that slides on two hardened 8 mm rods in LM8UU bushings, so both fingers move
// in opposite directions and stay parallel. The second finger follows the first through a
// URDF <mimic> (the rack-and-pinion makes the coupling exact), so one motor drives both.
// The housing slides over a separate ISO-style adapter plate (4 x M6 on a 50 mm bolt circle)
// and is held by four radial M4 screws, so the adapter can be bolted to the robot first.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, hornRadiusMm, type Vec3 } from "@ttr/parts";
import { frame, mul, I4, apply, translation, type Mat4, type Op } from "@ttr/solid";
import { Assembly } from "../assembly.ts";
import { totalMass } from "../kin.ts";
import { bodyMm, plugWindowOps, gearOps, rackOps, recordCost, mountSensors, sensorTypes, type DesignRequest } from "./common.ts";

const WALL = 3;
export interface GripCfg { module: number; teeth: number; gearT: number; stroke: number; carriage: number; fingerLen: number; fingerT: number; fingerW: number; adapterT: number; adapterR: number; boltPcd: number; mu: number; safety: number; petgAllowMpa: number; }
/** Stock rod lengths in the parts library (mm). */
const RODS = [110, 130];
export const rodLenFor = (c: GripCfg) => { const need = 2 * (c.stroke + c.carriage + 1 + 4); const L = RODS.find((r) => r >= need && r <= need + 12); if (!L) throw new Error(`no stock rod for a ${need} mm gripper frame`); return L; };
export const GRIP: GripCfg = {
  module: 1.5, teeth: 14, gearT: 8, stroke: 30, carriage: 30, fingerLen: 62, fingerT: 12, fingerW: 26,
  adapterT: 10, adapterR: 31.5, boltPcd: 50, mu: 0.5, safety: 1.5,
  /** layer-direction (weakest) allowable bending stress of PETG used for the finger check, MPa */
  petgAllowMpa: 20,
};
export const pinionRadiusMm = (c: GripCfg = GRIP) => (c.module * c.teeth) / 2;

export interface GripperBuild {
  servo: string; rp: number; stroke: number; links: string[];
  /** tool centre point (between the finger pads) in the adapter frame, mm */
  tcp: Vec3;
  forceRatedN: number; forcePeakN: number; holdKg: number; speedMs: number; massKg: number;
  heightMm: number; checks: { name: string; pass: boolean; detail: string }[];
}

/** Heights (mm, adapter frame: z = 0 at the robot face, +z towards the fingers). */
export function gripperLevels(servo: string, c: GripCfg = GRIP) {
  const b = bodyMm(servo), AT = c.adapterT;
  const floor = AT + 16;                               // cradle floor on two end supports: room for the bus plug + cable below
  const zs = floor + WALL + -b.min[2];                 // servo output (horn) face
  const zr0 = zs + 4, zr1 = zr0 + c.gearT;         // pinion teeth / racks
  const zc0 = zr1 + 1, rod1 = zc0 + 10.5, rod2 = rod1 + 36, zc1 = rod2 + 10.5; // carriages and rods (stacked in z)
  return { AT, zs, zr0, zr1, zc0, rod1, rod2, zc1, tip: zc1 + c.fingerLen };
}

/** Adapter plate: bolts to the robot flange (or to a servo horn) and receives the gripper housing. */
function adapterOps(mount: { horn?: string }, c: GripCfg): Op[] {
  const { adapterT: AT, adapterR: R, boltPcd } = c, ops: Op[] = [];
  if (mount.horn) {
    ops.push({ op: "horn", key: mount.horn, t: 4, extra: Math.max(4, R - hornRadiusMm(mount.horn)) }, { op: "rod", a: [0, 0, 3.9], b: [0, 0, AT], r: R });
  } else {
    ops.push({ op: "rod", a: [0, 0, 0], b: [0, 0, AT], r: R });
    for (let k = 0; k < 4; k++) {  // ISO 9409-1-50-4-M6 style: 4 x M6 on PCD 50 at 45 deg, heads sunk in the plate
      const a = Math.PI / 4 + (k * Math.PI) / 2, p: Vec3 = [(boltPcd / 2) * Math.cos(a), (boltPcd / 2) * Math.sin(a), 0];
      ops.push({ op: "hole", a: [p[0], p[1], -1], b: [p[0], p[1], AT + 1], d: 6.6 }, { op: "hole", a: [p[0], p[1], AT - 6.4], b: [p[0], p[1], AT + 1], d: 11 });
    }
    ops.push({ op: "hole", a: [0, 0, -1], b: [0, 0, 4], d: 31.6 }); // centring recess for a 31.5 mm robot-flange spigot
  }
  for (let k = 0; k < 4; k++) { // radial M4 heat-set inserts that take the housing screws
    const a = (k * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a);
    ops.push({ op: "hole", a: [c * (R - 9.1), s * (R - 9.1), AT / 2], b: [c * (R + 1), s * (R + 1), AT / 2], d: 5.6 });
  }
  return ops;
}

/** Sensor boards that can sit on top of the end walls (component frame -> gripper frame, mm). */
export function gripperSensorSlots(servo: string, c: GripCfg = GRIP): Partial<Record<"camera" | "imu", Mat4>> {
  const L = gripperLevels(servo, c), XE = c.stroke + c.carriage + 1, top = L.rod2 + 12 + 4;
  return { camera: translation([XE + 5 - 12.5, -11.93, top]), imu: translation([-XE - 5 - 12.8, -11.35, top]) };
}
const PAD_HOLES: Record<string, [number, number][]> = { camera: [[2, 2], [23, 2], [2, 14.5], [23, 14.5]], imu: [[2.54, 2.54], [23.06, 2.54], [2.54, 20.16], [23.06, 20.16]] };

function bodyOps(servo: string, servoT: Mat4, sensors: ("camera" | "imu")[], c: GripCfg): Op[] {
  const L = gripperLevels(servo, c), { AT, adapterR: R, stroke: S, carriage: CW } = { ...c, ...L };
  const XE = S + CW + 1, half = rodLenFor(c) / 2, YW = 27, b = bodyMm(servo);
  const ops: Op[] = [
    // floor: housing footprint merged with a disc that covers the adapter
    { op: "hull", of: [{ op: "box", min: [-XE - 10, -YW, AT], max: [XE + 10, YW, AT + 4] }, { op: "rod", a: [0, 0, AT], b: [0, 0, AT + 4], r: R + 4.5 }] },
    // skirt around the adapter plate
    { op: "rod", a: [0, 0, 0], b: [0, 0, AT + 0.5], r: R + 4.5 }, { op: "hole", a: [0, 0, -1], b: [0, 0, AT], d: 2 * R + 0.5 },
    { op: "cradle", key: servo, T: servoT, wall: WALL },
    // end walls carry the rods; low side rails stiffen the frame
    ...[-1, 1].map((s): Op => ({ op: "box", min: [s > 0 ? XE : -XE - 10, -YW, AT], max: [s > 0 ? XE + 10 : -XE, YW, L.rod2 + 12], r: 3 })),
    ...[-1, 1].map((s): Op => ({ op: "box", min: [-XE - 10, s > 0 ? YW - 4 : -YW, AT], max: [XE + 10, s > 0 ? YW : -YW + 4, L.zs - 6] })),
  ];
  for (const z of [L.rod1, L.rod2]) for (const s of [-1, 1]) ops.push({ op: "hole", a: [s * (XE - 1), 0, z], b: [s * (half + 0.3), 0, z], d: 8.0 }, { op: "hole", a: [s * (XE + 4), -YW - 1, z], b: [s * (XE + 4), -4, z], d: 2.9 }); // rod pockets + M3 set screws
  for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2, c = Math.cos(a), s = Math.sin(a); ops.push({ op: "hole", a: [c * (R - 2), s * (R - 2), AT / 2], b: [c * (R + 6), s * (R + 6), AT / 2], d: 4.5 }); } // radial M4 clearance
  // servo bottom case screws are driven from below through the floor before the housing goes on the adapter
  for (const h of part(servo).holes) {
    if (h.axis[2] > -0.5 || Math.hypot(h.pos[0], h.pos[1]) < hornRadiusMm(servo) + 1) continue;
    const p = apply(servoT, h.pos);
    ops.push({ op: "hole", a: [p[0], p[1], AT - 1], b: [p[0], p[1], p[2] + 0.5], d: 2.6 + (h.thread === "M3" ? 0.8 : 0) });
  }
  // the cradle stands on two end supports; the bus plug and cable run underneath and out of a side window
  const cz = L.zs + b.min[2] - WALL;
  for (const [xa, xb] of [[b.min[0] - WALL, b.min[0] + 7], [b.max[0] - 7, b.max[0] + WALL]]) ops.push({ op: "box", min: [xa, b.min[1] - WALL, AT + 2], max: [xb, b.max[1] + WALL, cz + 0.5] });
  ops.push({ op: "cutbox", min: [-24, -YW - 1, AT + 4], max: [-6, -YW + 5, AT + 15] });
  const slots = gripperSensorSlots(servo, c);
  for (const t of sensors) for (const [hx, hy] of PAD_HOLES[t]) { const p = apply(slots[t]!, [hx, hy, 0]); ops.push({ op: "rod", a: [p[0], p[1], p[2] - 4.5], b: [p[0], p[1], p[2]], r: 1.9 }, { op: "hole", a: [p[0], p[1], p[2] - 6], b: [p[0], p[1], p[2] + 1], d: 1.6 }); }
  ops.push(...plugWindowOps(servo, servoT));
  return ops;
}

/** One finger link (carriage + rack + finger) in the adapter frame at the open position. side: +1 = +x finger. */
function fingerOps(servo: string, side: 1 | -1, c: GripCfg): Op[] {
  const L = gripperLevels(servo, c), { stroke: S, carriage: CW, fingerLen: FL, fingerT: FT, fingerW: FW, module: m } = c;
  const rp = pinionRadiusMm(c), yr = rp + 1.25 * m, Y = yr + 6;
  const x0 = S, x1 = S + CW;
  const sx = (a: number, b: number): [number, number] => (side > 0 ? [a, b] : [-b, -a]);
  const [cx0, cx1] = sx(x0, x1), [fx0, fx1] = sx(x0, x0 + FT), [rx0, rx1] = sx(-8, x1), [gx0, gx1] = sx(x0, x0 + 22);
  const ops: Op[] = [
    { op: "box", min: [cx0, -Y, L.zc0], max: [cx1, Y, L.zc1], r: 2 },
    ...rackOps(m, rx0, rx1, side * rp, side, L.zr0, L.zr1, 6),
    { op: "box", min: [cx0, side > 0 ? yr : -Y, L.zr1 - 0.5], max: [cx1, side > 0 ? Y : -yr, L.zc0 + 0.5] },
    // finger: full section at the root, tapering in width and thickness towards the tip (inner pad face stays flat)
    { op: "hull", of: [
      { op: "box", min: [fx0, -FW / 2, L.zc1 - 1], max: [fx1, FW / 2, L.zc1 + 6] },
      { op: "box", min: [side > 0 ? x0 : -x0 - FT * 0.6, -FW * 0.38, L.zc1 + FL - 1], max: [side > 0 ? x0 + FT * 0.6 : -x0, FW * 0.38, L.zc1 + FL] },
      { op: "box", min: [gx0, -FW / 2, L.zc1 - 1], max: [gx1, FW / 2, L.zc1 + 4] }] },
  ];
  for (const z of [L.rod1, L.rod2]) ops.push({ op: "hole", a: [cx0 - 1, 0, z], b: [cx1 + 1, 0, z], d: 15.0 });
  // grip pad grooves on the inner face
  for (let k = 1; k <= 5; k++) { const z = L.zc1 + FL - k * 7; ops.push({ op: "cutbox", min: [side > 0 ? x0 - 0.1 : -x0 - 0.8, -FW / 2 - 0.1, z - 1.6], max: [side > 0 ? x0 + 0.8 : -x0 + 0.1, FW / 2 + 0.1, z] }); }
  // lightening window through the finger
  ops.push({ op: "hole", a: [side * (x0 - 1), 0, L.zc1 + 14], b: [side * (x0 + FT + 1), 0, L.zc1 + 14], d: 10 });
  return ops;
}

/**
 * Add a parallel gripper to an assembly. `G` is the world pose of the adapter frame (z = approach),
 * `adapter` the name of the adapter link (the caller joins it to the robot, or it is the root).
 */
export function buildParallelGripper(A: Assembly, G: Mat4, servo: string, adapter: string, mount: { horn?: string } = {}, prefix = "", sensors: ("camera" | "imu")[] = [], c: GripCfg = GRIP): GripperBuild {
  const L = gripperLevels(servo, c), rp = pinionRadiusMm(c), S = c.stroke;
  const servoT = frame([0, 0, L.zs], [0, 0, 1], [1, 0, 0]);
  const n = (s: string) => `${prefix}${s}`;
  A.printedLink(adapter, { name: adapter, ops: adapterOps(mount, c) }, { role: mount.horn ? "wrist" : "base", material: "printed_dark" });
  A.printedLink(n("gripper_body"), { name: n("gripper_body"), ops: bodyOps(servo, servoT, sensors, c) }, { role: "gripper", material: "printed_dark" });
  A.fixed(n("gripper_body_mount"), adapter, n("gripper_body"), I4());
  A.mount(n("gripper_body"), servo, servoT, n("gripper_servo"), "gripper pinion drive");
  const r = rating(servo);
  const forcePeak = r.peak_nm / (2 * rp / 1000), forceRated = r.rated_nm / (2 * rp / 1000), speed = (r.speed_rad_s * rp) / 1000;
  // URDF convention for parallel grippers: the first finger is the actuated joint (its force and speed are the
  // servo's torque and speed through the pinion); the second finger and the pinion itself mimic it.
  const pin = A.revolute(n("gripper_pinion"), n("gripper_body"), n("pinion"), servoT, servo, 0, +(S / rp).toFixed(4));
  pin.mimic = { joint: n("finger_a"), multiplier: +(1000 / rp).toFixed(6), offset: 0 };
  A.printedLink(n("pinion"), { name: n("pinion"), ops: [{ op: "horn", key: servo, t: 4, channel: c.gearT + 2 }, ...gearOps(c.module, c.teeth, 4, 4 + c.gearT, 90)] }, { role: "gripper", material: "printed_accent" });
  const half = rodLenFor(c) / 2;
  for (const [side, nm] of [[1, "finger_a"], [-1, "finger_b"]] as const) {
    A.printedLink(n(nm), { name: n(nm), ops: fingerOps(servo, side, c) }, { role: "gripper", material: side > 0 ? "printed_accent" : "printed" });
    const j = A.prismatic(n(nm), n("gripper_body"), n(nm), I4(), 0, S / 1000, +forcePeak.toFixed(2), +speed.toFixed(4), [-side, 0, 0]);
    j.dynamics = { damping: 2, friction: 0.3 }; // two LM8UU per carriage: rolling friction ~0.003 x load, plus rack mesh
    if (side < 0) j.mimic = { joint: n("finger_a"), multiplier: 1, offset: 0 };
    for (const z of [L.rod1, L.rod2]) A.mount(n(nm), "lm8uu", frame([side * (S + c.carriage / 2), 0, z], [1, 0, 0], [0, 0, 1]), n(`${nm}_bushing_${z === L.rod1 ? "lower" : "upper"}`), "finger carriage bushings");
  }
  for (const z of [L.rod1, L.rod2]) A.mount(n("gripper_body"), `rod_8mm_h8_${rodLenFor(c)}`, frame([-half, 0, z], [1, 0, 0], [0, 0, 1]), n(`gripper_rod_${z === L.rod1 ? "lower" : "upper"}`), "finger guide rods", "metal");
  A.fastener("M6 x 16 socket head (adapter to robot flange)", mount.horn ? 0 : 4);
  A.fastener("M4 x 10 socket head + M4 heat-set insert (housing to adapter, radial)", 4);
  A.fastener("M3 x 6 set screw (rod retention)", 4);
  A.fastener(`servo case screws (${part(servo).specs.case_screw ? "M2 x 6" : "M2.5 x 6"})`, 4);
  A.fastener("horn screws", 4);
  // ---- engineering checks ----
  const g = 9.81, holdKg = (2 * c.mu * forceRated) / g;
  const tcpZ = L.zc1 + c.fingerLen - 15, lever = (L.zc1 + c.fingerLen - 8 - L.zc1) / 1000;
  const sigma = (6 * forcePeak * lever) / ((c.fingerW / 1000) * (c.fingerT / 1000) ** 2) / 1e6;
  const pitchArm = (tcpZ - (L.rod1 + L.rod2) / 2) / 1000, bushingN = (forcePeak * pitchArm) / ((L.rod2 - L.rod1) / 1000) + forcePeak / 2;
  const checks = [
    { name: "grip:fingers_parallel", pass: true, detail: `rack-and-pinion (m${c.module}, ${c.teeth} teeth, pitch radius ${rp} mm) drives both fingers in opposite directions on two 8 mm rods: pads stay parallel by construction` },
    { name: "grip:finger_stress", pass: sigma <= c.petgAllowMpa, detail: `stall force ${forcePeak.toFixed(0)} N at ${(lever * 1000).toFixed(0)} mm gives ${sigma.toFixed(1)} MPa in the ${c.fingerW} x ${c.fingerT} mm finger root vs ${c.petgAllowMpa} MPa allowable (PETG across layers)` },
    { name: "grip:bushing_load", pass: bushingN <= part("lm8uu").specs.static_load_n, detail: `pitch moment of the stall force over the ${L.rod2 - L.rod1} mm rod spacing loads one LM8UU with ${bushingN.toFixed(0)} N vs ${part("lm8uu").specs.static_load_n} N static rating` },
  ];
  const links = [adapter, n("gripper_body"), n("pinion"), n("finger_a"), n("finger_b")];
  const mass = A.spec.links.filter((l) => links.includes(l.name) || l.name.startsWith(n("gripper_")) || l.name.startsWith(n("finger_"))).reduce((s, l) => s + l.mass, 0);
  return { servo, rp, stroke: S, links, tcp: apply(G, [0, 0, tcpZ]), forceRatedN: forceRated, forcePeakN: forcePeak, holdKg, speedMs: speed, massKg: mass, heightMm: L.tip, checks };
}

/** Servo choice for the gripper: Feetech STS for small budgets, DYNAMIXEL X above that. */
function gripperLadder(budget?: number): string[] {
  return budget !== undefined && budget >= 300 ? ["dxl_xl430_w250", "dxl_xm430_w350", "feetech_sts3250"] : ["feetech_sts3215_c047", "feetech_sts3250", "dxl_xm430_w350"];
}
/** Smallest servo in the ladder whose rated torque holds payload x safety with friction mu. */
export function chooseGripperServo(payloadKg: number, budget?: number): string {
  const rp = pinionRadiusMm() / 1000, ladder = gripperLadder(budget);
  for (const k of ladder) if ((2 * GRIP.mu * rating(k).rated_nm) / (2 * rp) / 9.81 >= payloadKg * GRIP.safety) return k;
  return ladder[ladder.length - 1];
}

export function designGripper(req: DesignRequest = {}): RobotSpecification {
  const payload = req.payloadKg ?? 0.5;
  const servo = chooseGripperServo(payload, req.budget);
  const A = new Assembly(req.name ?? "parallel_gripper", "gripper", req.prompt);
  A.design.request = { ...req };
  const want = sensorTypes(req.sensors).filter((t): t is "camera" | "imu" => t === "camera" || t === "imu");
  const g = buildParallelGripper(A, I4(), servo, "base_link", {}, "", want);
  const slots = gripperSensorSlots(servo);
  mountSensors(A, req.sensors, { camera: { link: "gripper_body", T: slots.camera!, use: "wrist camera between the fingers" }, imu: { link: "gripper_body", T: slots.imu!, use: "gripper IMU" } });
  A.spec.root = "base_link";
  A.spec.end_effectors.push({ name: "gripper", type: "parallel_gripper", attach_link: "gripper_body" });
  for (const c of g.checks) A.check(c.name, c.pass, c.detail);
  A.check("grip:hold", g.holdKg >= payload * GRIP.safety, `rated pinion torque ${rating(servo).rated_nm} N·m gives ${g.forceRatedN.toFixed(1)} N per finger; with friction ${GRIP.mu} two pads hold ${g.holdKg.toFixed(2)} kg vs payload ${payload} kg x ${GRIP.safety}`);
  const r = rating(servo);
  A.design.joints.push({ joint: "finger_a", actuator: servo, required_nm: +((payload * GRIP.safety * 9.81 * 2 * pinionRadiusMm()) / 1000 / (2 * GRIP.mu)).toFixed(3), rated_nm: r.rated_nm, peak_nm: r.peak_nm,
    margin: +(g.holdKg / (payload * GRIP.safety)).toFixed(2), speed_rad_s: r.speed_rad_s, note: `servo torque on the pinion; squeeze force per finger = torque / (2 x ${pinionRadiusMm()} mm pitch radius). finger_a is the actuated prismatic joint; finger_b and the pinion mimic it` });
  // supply and bus
  const dxl = servo.startsWith("dxl_");
  A.buy(dxl ? "dxl_u2d2" : "waveshare_bus_servo_adapter", 1, "USB to servo bus (off-board)");
  A.buy("psu_12v_lrs75", 1, "12 V servo supply (off-board)");
  const stall = Number(part(servo).specs.stall_current_a ?? 2);
  A.check("power:supply", stall <= 6 * 0.8, `servo stall current ${stall} A vs 6 A supply`);
  const open = 2 * GRIP.stroke;
  A.design.performance = {
    stroke_mm: open, max_object_width_mm: open, grip_force_rated_n: +g.forceRatedN.toFixed(1), grip_force_peak_n: +g.forcePeakN.toFixed(1),
    holds_kg_mu05: +g.holdKg.toFixed(2), finger_speed_mm_s: +(g.speedMs * 1000).toFixed(1), close_time_s: +(GRIP.stroke / (g.speedMs * 1000)).toFixed(2),
    payload_kg: payload, mass_kg: +totalMass(A.spec).toFixed(3), height_mm: +g.heightMm.toFixed(1), actuator: part(servo).name,
    mount: "ISO 9409-1-50-4-M6 style adapter (4 x M6 on PCD 50, 31.5 mm centring recess)",
  };
  A.design.assumptions.push(
    `Grip force uses the servo's rated (continuous) torque ${r.rated_nm} N·m; stall torque ${r.peak_nm} N·m gives ${g.forcePeakN.toFixed(0)} N per finger for short squeezes.`,
    `Friction coefficient ${GRIP.mu} between the printed pads (or TPU/rubber pads glued into the grooves) and the object; safety factor ${GRIP.safety}.`,
    "The fingers are coupled by the rack-and-pinion: finger_a is the actuated prismatic joint (servo torque / pitch radius), finger_b and the pinion carry a URDF <mimic> of it (MuJoCo: joint equality constraints), so one actuator drives both fingers.",
    "Rack/pinion teeth are module 1.5 printed in PETG; grease them and expect backlash of a few tenths of a millimetre.",
    "Servo bus adapter and 12 V supply sit off the gripper (cable through the window under the servo).",
    "The adapter plate bolts to the robot first (heads sunk in the plate), then the housing slides over it and is fixed by four radial M4 screws.",
  );
  recordCost(A);
  return A.finish(`Parallel gripper: ${open} mm stroke, ${g.forceRatedN.toFixed(0)} N rated squeeze per finger, ${part(servo).name}`);
}
void mul;
