// Arduino car: the cheapest robot that really drives. TT gear motors bolted to printed brackets under a
// filleted chassis plate, 65 mm wheels, a ball caster on a printed pillar (2WD), a 2S 18650 pack, an Arduino
// on a half breadboard with a TB6612FNG driver (plug-in wiring, no soldering), an HC-SR04 in a printed front
// bracket. Every printed part is an exact CAD solid (@ttr/kernel): STEP for CAD tools, STL for the slicer.
//
// Tiers: cheapest (2WD + ball caster) and stronger (4WD: twice the drive torque, climbs and pushes more).
// Each tier is checked like every other design (torque on a 10 deg slope, speed, driver current, motor
// voltage, runtime, print bed) and priced from the parts list.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, type Vec3 } from "@ttr/parts";
import { frame, mul, translation, type Mat4 } from "@ttr/solid";
import type { Op, Program } from "@ttr/kernel";
import { Assembly } from "../assembly.ts";
import { totalMass } from "../kin.ts";
import { withSolids, interferences } from "../clearance.ts";

export type ArduinoTier = "cheapest" | "stronger";
export interface ArduinoCarRequest {
  name?: string; prompt?: string; tier?: ArduinoTier; budget?: number;
  /** 2 (with a ball caster) or 4 driven wheels */
  wheels?: 2 | 4;
  /** cargo on the deck, kg */
  payloadKg?: number;
  /** "ultrasonic" (HC-SR04, default), "none" */
  sensor?: "ultrasonic" | "none";
}

const MOTOR = "tt_gearmotor_1to48", WHEEL = "wheel_65mm_tt", BALL = "steel_ball_12_7mm", PACK = "pack_2s_18650";
const R = 32.5;                        // wheel radius (mm)
// axle height, plate underside (0.2 mm above the motor top: printed faces never meet a part exactly), plate thickness
const ZC = R, ZP = ZC + 11.25 + 0.2, T = 4;
const ZT = ZP + T;                     // deck top
const YF = 56;                         // motor output face |y| (plate edge)
const DRIVE = { slopeDeg: 10, accel: 0.5, crr: 0.03, speedFactor: 0.8, usableEnergy: 0.8 };

const TIERS: Record<ArduinoTier, { wheels: 2 | 4; board: string; label: string; slopeDeg: number }> = {
  // two TT motors run over their continuous rating up a 10 deg ramp: the 2WD car is rated for floors and 5 deg ramps
  cheapest: { wheels: 2, board: "arduino_nano_clone", label: "cheapest that works (floors, ramps up to 5 deg)", slopeDeg: 5 },
  stronger: { wheels: 4, board: "arduino_nano_clone", label: "stronger (4WD, ramps up to 10 deg)", slopeDeg: 10 },
};

/** Motor placement: shaft along +-y at the plate edge, can towards +-x. Column-major, mm. */
export function motorT(xa: number, side: 1 | -1, canDir: 1 | -1, yf = YF, zc = ZC): Mat4 {
  const X: Vec3 = [canDir, 0, 0], Z: Vec3 = [0, side, 0];
  const Y: Vec3 = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]];
  return [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, xa, side * yf, zc, 1];
}
const motorHoles = () => part(MOTOR).holes.map((h) => h.pos[0]);

/** Bracket hanging under the plate against the motor's inner face, with its two M3 bolts and the rear shaft stub. */
function bracketOps(xa: number, side: 1 | -1, canDir: 1 | -1): Op[] {
  const y0 = side * (YF - 22.0), y1 = side * (YF - 19.0), xs = [xa - canDir * 8, xa + canDir * 40];
  const ops: Op[] = [{ op: "box", min: [Math.min(...xs), Math.min(y0, y1), ZC - 11.25], max: [Math.max(...xs), Math.max(y0, y1), ZP + 0.5], r: 0 }];
  for (const hx of motorHoles()) ops.push({ op: "hole", a: [xa + canDir * hx, side * (YF - 24), ZC], b: [xa + canDir * hx, side * (YF - 16), ZC], d: 3.2 });
  ops.push({ op: "hole", a: [xa, side * (YF - 24), ZC], b: [xa, side * (YF - 16), ZC], d: 8 });
  return ops;
}

export function designArduinoCar(req: ArduinoCarRequest = {}): RobotSpecification {
  const tier = req.tier ?? "cheapest", cfg = { ...TIERS[tier], ...(req.wheels ? { wheels: req.wheels } : {}) };
  const sensor = req.sensor ?? "ultrasonic", payload = req.payloadKg ?? 0;
  const A = new Assembly(req.name ?? "arduino_car", "arduino_car", req.prompt);
  const four = cfg.wheels === 4;
  // axles: 2WD one axle at x = 0 (caster in front); 4WD two axles with the motor cans towards the centre
  const axles: { xa: number; can: 1 | -1 }[] = four ? [{ xa: 66, can: -1 }, { xa: -66, can: 1 }] : [{ xa: 0, can: -1 }];
  const x0 = four ? -100 : -74, x1 = four ? 100 : 90, xc = 60;

  // ---------------- chassis: plate + motor brackets + caster pillar (prints upside down, plate on the bed)
  const ops: Op[] = [{ op: "box", min: [x0, -YF, ZP], max: [x1, YF, ZT], r: 10 }];
  for (const { xa, can } of axles) for (const side of [1, -1] as const) ops.push(...bracketOps(xa, side, can));
  // motor leads up through the plate beside each bracket
  // (at the motor can's end, outboard of the breadboard and battery)
  for (const { xa, can } of axles) for (const side of [1, -1] as const) {
    const xs = [xa + can * 56, xa + can * 66];
    ops.push({ op: "cutbox", min: [Math.min(...xs), side > 0 ? 42 : -52, ZP - 1], max: [Math.max(...xs), side > 0 ? 52 : -42, ZT + 1] });
  }
  // ball caster (2WD): a 1/2 in steel ball snapped into a printed socket at the bottom of a pillar. The socket is
  // 0.2 mm over the ball; its mouth (5.9 mm radius, 2.35 mm below the centre) is 0.45 mm under the ball's radius
  const rb = Number(part(BALL).specs.ball_d_mm) / 2;
  if (!four) {
    ops.push({ op: "rod", a: [xc, 0, rb - 2.35], b: [xc, 0, ZP + 0.5], r: rb + 4.2 });
    ops.push({ op: "sphere", c: [xc, 0, rb], r: rb + 0.2, cut: true });
    ops.push({ op: "hole", a: [xc, 0, -1], b: [xc, 0, rb], d: 2 * (rb - 0.45) });
  }
  // battery pack: two M3 countersunk screws through the plate (rear)
  const xb = x0 + 8;
  for (const h of part(PACK).holes) ops.push({ op: "hole", a: [xb + h.pos[0], h.pos[1], ZP - 1], b: [xb + h.pos[0], h.pos[1], ZT + 1], d: 3.2 });
  // sensor bracket screws (front)
  for (const y of [-20, 20]) ops.push({ op: "hole", a: [x1 - 7, y, ZP - 1], b: [x1 - 7, y, ZT + 1], d: 3.2 });
  const chassis: Program = { name: "chassis", edge: 0.8, ops };
  A.cadLink("chassis", chassis, { role: "base", material: "printed_dark" });

  // ---------------- drive: motors, wheels
  const wheelJoints: string[] = [];
  for (const { xa, can } of axles) for (const side of [1, -1] as const) {
    const tag = `${xa > 0 ? "front" : xa < 0 ? "rear" : "drive"}_${side > 0 ? "left" : "right"}`;
    const Tm = motorT(xa, side, can);
    A.mount("chassis", MOTOR, Tm, `${tag}_motor`, "drive motor");
    A.fastener("M3x25 socket head + nut (motor through-bolt)", 2);
    const Tw = mul(translation([xa, side * (YF + 1), ZC]), frame([0, 0, 0], [0, side, 0], [1, 0, 0]));
    A.mount("chassis", WHEEL, Tw, `${tag}_wheel`, "drive wheel");
    // the wheel turns: replace the fixed mount by a continuous joint driven by the TT motor
    A.spec.joints.pop();
    A.continuous(`${tag}_wheel_joint`, "chassis", `${tag}_wheel`, Tw, MOTOR);
    wheelJoints.push(`${tag}_wheel_joint`);
  }
  if (!four) {
    // the ball rolls freely in its socket: two passive axles at its centre (a ball joint in URDF terms)
    A.buy(BALL, 1, "caster ball (snaps into the printed socket)");
    A.continuous("caster_roll", "chassis", "caster_gimbal", translation([xc, 0, rb]), null, [1, 0, 0]);
    A.frameLink("caster_gimbal");
    A.continuous("caster_spin", "caster_gimbal", "caster_ball", translation([0, 0, 0]), null, [0, 1, 0]);
    A.spec.links.push({ name: "caster_ball", role: "caster", geometry: { type: "sphere", radius: rb / 1000 }, mass: part(BALL).mass_g / 1000, material: "metal", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } });
  }

  // ---------------- deck: battery, breadboard with board + driver
  A.mount("chassis", PACK, translation([xb, 0, ZT]), "battery", "2S 18650 pack");
  A.fastener("M3x8 countersunk + nut (pack)", 2);
  // breadboard turned 90 deg (its 82.5 mm length across the robot) between the pack and the sensor bracket
  const xbb = four ? -10 : 14, Tbb: Mat4 = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, xbb + 54.5, -41.25, ZT, 1];
  A.mount("chassis", "breadboard_400", Tbb, "breadboard", "plug-in wiring for the board and driver", "printed");
  A.mount("breadboard", cfg.board, translation([4, 31, 8.5]), "controller", "Arduino (runs the generated sketch)");
  const drivers = four ? 2 : 1;
  for (let i = 0; i < drivers; i++) A.mount("breadboard", "tb6612fng_module", translation([4 + i * 24, 4, 8.5]), `motor_driver_${i + 1}`, "TB6612FNG dual motor driver");

  // ---------------- front sensor bracket (separate print, two M3 screws through the plate)
  const zb = ZT + 6;
  if (sensor === "ultrasonic") {
    const wall: Op[] = [
      { op: "box", min: [x1 - 16, -26, ZT], max: [x1, 26, ZT + 4], r: 4 },          // foot on the deck
      { op: "box", min: [x1 - 3, -26, ZT], max: [x1, 26, zb + 23], r: 0 },         // front wall
      { op: "box", min: [x1 - 16, -26, ZT], max: [x1 - 3, -23, zb + 12], r: 0 },   // side gussets
      { op: "box", min: [x1 - 16, 23, ZT], max: [x1 - 3, 26, zb + 12], r: 0 },
    ];
    for (const y of [-20, 20]) wall.push({ op: "hole", a: [x1 - 7, y, ZT - 1], b: [x1 - 7, y, ZT + 5], d: 3.2 });
    for (const bx of [9.5, 35.5]) wall.push({ op: "hole", a: [x1 - 5, -22.5 + bx, zb + 10], b: [x1 + 1, -22.5 + bx, zb + 10], d: 16.5 });
    for (const h of part("hc_sr04").holes) wall.push({ op: "hole", a: [x1 - 4, -22.5 + h.pos[0], zb + h.pos[1]], b: [x1 + 1, -22.5 + h.pos[0], zb + h.pos[1]], d: 1.6 });
    A.cadLink("sensor_bracket", { name: "sensor_bracket", edge: 0.6, ops: wall }, { material: "printed_accent" });
    A.fixed("sensor_bracket_mount", "chassis", "sensor_bracket", translation([0, 0, 0]));
    A.fastener("M3x10 + nut (sensor bracket)", 2);
    // HC-SR04: board z (transducers) forward, board x across the robot, board y up
    const Ts: Mat4 = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, x1 - 4.6, -22.5, zb, 1];
    A.mount("sensor_bracket", "hc_sr04", Ts, "ultrasonic", "HC-SR04 distance sensor");
    A.spec.sensors.push({ name: "front_range", type: "range", parent: "ultrasonic", origin: { xyz: [0.0225, 0.01, 0.0136], rpy: [0, 0, 0] }, params: { range_m: 4, min_range_m: 0.02, beam_deg: 15 } });
    A.fastener("M2x6 self-tapping (sensor)", 4);
  }

  // ---------------- nothing intersects anything (bought parts as their body boxes, printed parts as solids)
  // parts that sit on a carrier by design (boards on the breadboard, sensor in its bracket, pack on the deck)
  const carried = new Set(["controller", "motor_driver_1", "motor_driver_2", "breadboard", "battery", "ultrasonic"]);
  const skip = new Set<string>();
  for (const j of A.spec.joints) if (j.type === "fixed" && carried.has(j.child)) skip.add(`${j.parent}|${j.child}`);
  const hits = withSolids(A.spec, (mdl) => interferences(mdl, {}, undefined, 2, skip));
  A.check("clearance:home", hits.length === 0, hits.length ? `intersecting: ${hits.map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`).join(", ")}` : "no printed part or component intersects another");

  // ---------------- engineering checks
  const m = totalMass(A.spec) + payload, g = 9.81, r = R / 1000;
  const nDriven = wheelJoints.length, rt = rating(MOTOR);
  const slope = cfg.slopeDeg, vmax = rt.speed_rad_s * r * DRIVE.speedFactor;
  const F = m * (g * Math.sin(slope * Math.PI / 180) + DRIVE.accel + DRIVE.crr * g);
  // + the gearbox's own loss at cruise speed (the joint damping the simulation uses)
  const loss = (A.spec.joints.find((j) => j.name === wheelJoints[0])?.dynamics?.damping ?? 0) * (vmax / r);
  const perWheel = (F * r) / nDriven + loss;
  A.check("drive:torque", perWheel <= rt.rated_nm, `${m.toFixed(2)} kg on a ${slope} deg slope accelerating ${DRIVE.accel} m/s^2: ${perWheel.toFixed(4)} N·m per wheel (incl. ${loss.toFixed(4)} gearbox loss at speed) vs ${rt.rated_nm} N·m continuous (TT 1:48)`);
  A.check("drive:top_speed", vmax >= 0.3, `${vmax.toFixed(2)} m/s at 6 V (no-load ${rt.speed_rad_s} rad/s x r ${R} mm x ${DRIVE.speedFactor})`);
  const stall = Number(part(MOTOR).specs.stall_current_a), drvPeak = Number(part("tb6612fng_module").specs.peak_current_a);
  A.check("power:driver_current", stall <= drvPeak, `one TT motor per TB6612FNG channel: stall ${stall} A <= ${drvPeak} A channel peak (${part("tb6612fng_module").specs.current_a} A continuous)`);
  const vmaxPack = Number(part(PACK).specs.voltage_max_v), duty = Math.min(1, 6 / vmaxPack);
  A.check("power:motor_voltage", true, `2S pack 6.0-${vmaxPack} V through the TB6612FNG: the sketch caps PWM at ${Math.round(duty * 255)}/255 so the 6 V motors never see more than 6 V average`);
  const motorW = nDriven * 6 * 0.35, logicW = 0.5 + (sensor === "ultrasonic" ? 0.1 : 0);
  const runtimeMin = (Number(part(PACK).specs.energy_wh) * DRIVE.usableEnergy) / (motorW + logicW) * 60;
  A.check("power:runtime", runtimeMin >= 45, `${runtimeMin.toFixed(0)} min driving (${(motorW + logicW).toFixed(1)} W average from ${part(PACK).specs.energy_wh} Wh, ${DRIVE.usableEnergy * 100} % usable)`);

  const bom = A.bom();
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `$${bom.cost_usd.toFixed(2)} of parts vs $${req.budget} budget`);
  A.design.performance = { tier, tier_label: cfg.label, wheels: cfg.wheels, max_slope_deg: cfg.slopeDeg, mass_kg: +m.toFixed(3), top_speed_m_s: +vmax.toFixed(2), runtime_min: +runtimeMin.toFixed(0),
    cost_usd: bom.cost_usd, controller: part(cfg.board).name, length_mm: x1 - x0, width_mm: 2 * (YF + 27) };
  A.design.assumptions.push(`TT motor continuous torque taken as 30 % of the 0.8 kg.cm stall (Adafruit #3777 data)`,
    "prices are typical single-unit marketplace prices for generic modules and vary by seller");
  A.design.request = { ...req } as Record<string, unknown>;
  return A.finish(`Arduino car (${cfg.label}): ${cfg.wheels}WD on TT gear motors, ${m.toFixed(2)} kg, ${vmax.toFixed(2)} m/s, ${runtimeMin.toFixed(0)} min, $${bom.cost_usd.toFixed(0)} of parts`);
}

/** Every tier side by side (cheapest first), for the price picker. */
export const arduinoCarOptions = (req: ArduinoCarRequest = {}) => (Object.keys(TIERS) as ArduinoTier[]).map((tier) => designArduinoCar({ ...req, tier }));
