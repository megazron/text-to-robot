// WALL-E on Arduino parts, laid out like the DIY replicas that are actually built: a hollow printed body houses four
// TT gear motors (their gearboxes pass through windows in the side walls so the wheels sit right outside), each side's
// two wheels carry a printed TPU tank track, the lid holds the neck pan servo, a printed neck carries the tilt servo
// and the binocular head, and two arm servos stand inside the side walls with their horns outside. A Nano runs a
// PCA9685 (servos) and two TB6612FNG drivers (one motor per channel) from a 2S 18650 pack; an LM2596 makes the servo
// 5 V. Every printed part is an exact CAD solid (@ttr/kernel); screws are listed in the build record.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, electrical, type Vec3 } from "@ttr/parts";
import { frame, mul, translation, type Mat4 } from "@ttr/solid";
import type { Op } from "@ttr/kernel";
import { Assembly } from "../assembly.ts";
import { totalMass, gravityTorques } from "../kin.ts";
import { DYNAMIC_FACTOR } from "../sizing.ts";
import { limitsFromGeometry } from "./legkit.ts";
import { motorT, wireDrivers } from "./arduino-car.ts";
import { registerBay, enclosureChecks, exposed, standoffOps } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";

export interface ArduinoWallERequest { name?: string; prompt?: string; budget?: number; }

const MOTOR = "tt_gearmotor_1to48", WHEEL = "wheel_65mm_tt", PACK = "pack_2s_18650", SERVO = "hobby_sg90";
const R = 32.5, BELT = 3, ZC = R + BELT;            // wheel radius, track thickness, axle height
const SHOULDER = "hobby_mg90s", UPPER = 56, FORE = 74, ELBOW_Z = 31;   // arm: metal-gear shoulders; upper arm, forearm to the palm; elbow servo output height
const HAND_X = 15.5, THUMB_L = 44;                    // hand servo output across the palm, thumb length
const X_TOP = -14, Z_TOP = ZC + 52, R_IDLE = 16;      // top idler: the third corner of the triangular track
const XA = 65;                                       // axles at +-XA (motor cans meet 8 mm apart in the middle)
const BX = 85, BY = 64, Z0 = 16, Z1 = 146, WALL = 2.4, LID = 4;
const place = (x: Vec3, y: Vec3, z: Vec3, o: Vec3): Mat4 => [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
const sb = () => part(SERVO).bbox_mm!;
const EXIT_X = -8, VENTS = 14;

/** four locating walls just inside the body's walls, stopping short of its rounded inner corners (radius rc) */
function lipWalls(hx: number, hy: number, t: number, z0: number, z1: number, rc = 6): Op[] {
  return [
    { op: "box", min: [-hx + rc, -hy, z0], max: [hx - rc, -hy + t, z1] }, { op: "box", min: [-hx + rc, hy - t, z0], max: [hx - rc, hy, z1] },
    { op: "box", min: [-hx, -hy + rc, z0], max: [-hx + t, hy - rc, z1] }, { op: "box", min: [hx - t, -hy + rc, z0], max: [hx, hy - rc, z1] },
  ];
}

/** Electronics poses (mm). The boards sit 5 mm up on standoffs; the breadboard's end comes close to the left wall for the Nano's USB. */
const Tbb = place([0, 1, 0], [0, 0, 1], [1, 0, 0], [-BX + WALL + 0.3, -58.3, 70]);
const Tpca = place([0, 1, 0], [-1, 0, 0], [0, 0, 1], [70.4, -31.1, 5]), Tbuck = place([0, 1, 0], [-1, 0, 0], [0, 0, 1], [-58.8, -21.6, 5]), Tbuck2 = place([0, -1, 0], [0, 0, 1], [-1, 0, 0], [BX - WALL - 5, 21.8, 96 - Z0 - WALL]);   // the arm regulator stands on the front wall, above the sensor
const USB_X = -BX + WALL + 0.3 + 8.5 + 3.6, USB_Z = 70 + 31 + 8.9, SW_Y = 40, SW_Z = 100;

/** The netlist: pack through fuse and switch; TT motors on the drivers; the servos on their own buck 5 V through the PCA9685. */
function wire(H: Harness, motors: string[]) {
  H.mainPower("VBAT", { source: "battery", pos: "@power", neg: "@ground", sw: "main_switch", simultaneous: 2, simNote: "two motors stalling at once, the rest running" });
  H.regulator("controller", "VBAT", "5V_LOGIC", { vin: "VIN", gin: "GND", vout: "5V", gout: "GND", volts: 5, cont: 0.2, peakLimit: 0.4 });
  H.regulator("servo_regulator", "VBAT", "5V_SERVO", { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-", volts: 5, efficiency: 0.85, simNote: "every servo on it stalled at once" });
  H.regulator("arm_regulator", "VBAT", "5V_ARMS", { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-", volts: 5, efficiency: 0.85, simNote: "every servo on it stalled at once" });
  wireDrivers(H, 2, motors);
  H.notes.push("Board to board wires on the breadboard are jumper wires in the rows of the two pins; the cut list length is the most a jumper needs.");
  H.feed("5V_SERVO", "servo_driver", { v: "v_plus.V+", g: "v_plus.GND", typ: 0.01, peak: 0.01 });
  // the PCA9685 gives every servo its signal; its V+ terminal feeds the neck and hands, the arms take 5 V straight from their own regulator
  ["neck_pan_servo", "neck_tilt_servo", "left_hand_servo", "right_hand_servo", "left_arm_servo", "right_arm_servo", "left_elbow_servo", "right_elbow_servo"].forEach((s, ch) => {
    const r = H.rec(s).current_a.v;
    H.net(`SERVO${ch}_PWM`, "signal");
    H.wire(`SERVO${ch}_PWM`, `servo_driver.ch${ch}.PWM${ch}`, `${s}.@pwm`);
    if (ch < 4) {
      const d = H.rails.get("5V_SERVO")!.feeds[0];
      d.typ += r.typical; d.peak += r.peak;
      H.net(`SERVO${ch}_V`, "power", 5);
      H.wire(`SERVO${ch}_V`, `servo_driver.ch${ch}.V+`, `${s}.@power`, { typ: r.typical, peak: r.peak }); H.wire("GND", `servo_driver.ch${ch}.GND`, `${s}.@ground`, { typ: r.typical, peak: r.peak });
    } else H.feed("5V_ARMS", s, { v: "@power", g: "@ground", typ: r.typical, peak: r.peak });
  });
  H.feed("5V_LOGIC", "servo_driver", { v: "control_in.VCC", g: "control_in.GND", typ: 0.01, peak: 0.01 });
  H.signals("controller", "servo_driver", [["A4", "SDA", "I2C_SDA"], ["A5", "SCL", "I2C_SCL"]]);
  H.feed("5V_LOGIC", "ultrasonic", { v: "VCC", g: "GND" });
  H.signals("controller", "ultrasonic", [["D11", "TRIG"], ["D12", "ECHO"]]);
}

export function designArduinoWallE(req: ArduinoWallERequest = {}): RobotSpecification {
  const A = new Assembly(req.name ?? "wall_e", "arduino_walle", req.prompt);
  // his own filament colours, kept out of the shared palette: sun-faded yellow, weathered grey, dark smoked lenses
  A.spec.materials.push({ name: "walle", color: [0.85, 0.6, 0.14, 1] }, { name: "walle_grey", color: [0.58, 0.58, 0.55, 1] }, { name: "visor", color: [0.02, 0.02, 0.03, 1] }, { name: "walle_rust", color: [0.36, 0.22, 0.14, 1] });
  const axles = [{ xa: XA, can: -1 as const }, { xa: -XA, can: 1 as const }];
  const motorHoles = part(MOTOR).holes.map((h) => h.pos[0]);

  // ---------------- body: hollow box, motor windows + brackets, arm servo cradles, lid bosses
  const body: Op[] = [
    { op: "box", min: [-BX, -BY, Z0], max: [BX, BY, Z1], r: 8 },
    // hollow with corners rounded concentric to the outside (8 - wall): square inner corners leave a 0.1 mm wall
    { op: "subtract", of: [{ op: "box", min: [-BX + WALL, -BY + WALL, Z0 + WALL], max: [BX - WALL, BY - WALL, Z1 + 1], r: 8 - WALL }] },
  ];
  for (const { xa, can } of axles) for (const side of [1, -1] as const) {
    // window: the gearbox and motor can pass through the wall so the output face is flush with the outside
    const xs = [xa - can * 13, xa + can * 63];
    body.push({ op: "cutbox", min: [Math.min(...xs), side > 0 ? BY - WALL - 1 : -BY - 1, ZC - 12.5], max: [Math.max(...xs), side > 0 ? BY + 1 : -BY + WALL + 1, ZC + 12.5] });
    // bracket standing on the floor against the gearbox's inner face, two M3 through-bolts, rear shaft stub clearance
    const yb = [side * (BY - 22.0), side * (BY - 19.0)], xb = [xa - can * 8, xa + can * 40];
    body.push({ op: "box", min: [Math.min(...xb), Math.min(...yb), Z0], max: [Math.max(...xb), Math.max(...yb), ZC + 11.25], r: 0 });
    for (const hx of motorHoles) body.push({ op: "hole", a: [xa + can * hx, side * (BY - 25), ZC], b: [xa + can * hx, side * (BY - 16), ZC], d: 3.2 });
    body.push({ op: "hole", a: [xa, side * (BY - 25), ZC], b: [xa, side * (BY - 16), ZC], d: 8 });
  }
  // arm servos: inside the side walls, output through the wall, body pointing up
  const Tarm = (side: 1 | -1): Mat4 => place([0, 0, 1], [side, 0, 0], [0, side, 0], [10, side * (BY + 0.5), 120]);
  for (const side of [1, -1] as const) body.push({ op: "cradle", key: SHOULDER, T: Tarm(side), wall: 2.5 });
  // lid bosses in the corners (M3 self-tapping from the lid)
  for (const x of [-BX + 7, BX - 7]) for (const y of [-BY + 7, BY - 7]) {
    body.push({ op: "rod", a: [x, y, Z1 - 22], b: [x, y, Z1], r: 4.5 });
    body.push({ op: "hole", a: [x, y, Z1 - 15], b: [x, y, Z1 + 1], d: 2.5 });
  }
  // HC-SR04 behind the front panel: two 16.5 mm holes for the transducers, M2 pilot holes for its corner screws
  const zS = 60;
  for (const bx of [9.5, 35.5]) body.push({ op: "hole", a: [BX - WALL - 1, -22.5 + bx, zS + 10], b: [BX + 1, -22.5 + bx, zS + 10], d: 16.5 });
  for (const h of part("hc_sr04").holes) body.push({ op: "hole", a: [BX - WALL - 1, -22.5 + h.pos[0], zS + h.pos[1]], b: [BX + 1, -22.5 + h.pos[0], zS + h.pos[1]], d: 1.6 });
  // electronics on standoffs at their real hole patterns; breadboard held on the rear wall between two ledges
  body.push({ op: "at", T: translation([0, 0, Z0 + WALL]), of: [...standoffOps("pca9685_clone", Tpca), ...standoffOps("buck_lm2596", Tbuck), ...standoffOps("buck_lm2596", Tbuck2)] });
  for (const z of [Tbb[14] - 2.4, Tbb[14] + 54.8]) body.push({ op: "box", min: [-BX + WALL - 0.2, Tbb[13], z], max: [-BX + WALL + 6, Tbb[13] + 82.5, z + 2.4] });
  // USB of the Nano through the left wall, main switch in the rear wall, both above the tracks
  body.push({ op: "cutbox", min: [USB_X - 7, -BY - 1, USB_Z - 5], max: [USB_X + 7, -BY + WALL + 1, USB_Z + 5] });
  body.push({ op: "cutbox", min: [-BX - 1, SW_Y - 9.7, SW_Z - 6.7], max: [-BX + WALL + 1, SW_Y + 9.7, SW_Z + 6.7] });
  // battery and electronics: screw holes through the floor
  for (const h of part(PACK).holes) body.push({ op: "hole", a: [-38.5 + h.pos[0], h.pos[1], Z0 - 1], b: [-38.5 + h.pos[0], h.pos[1], Z0 + WALL + 1], d: 3.2 });
  // compactor door on the front, proud of the wall; its seams and hinge bars, and the panel seams of the side walls
  const DOOR: [number, number] = [BX - 0.2, BX + 1.6];
  body.push({ op: "box", min: [DOOR[0], -BY + 10, 26], max: [DOOR[1], BY - 10, 108], r: 0 });
  for (const bx of [9.5, 35.5]) body.push({ op: "hole", a: [BX - WALL - 1, -22.5 + bx, zS + 10], b: [BX + 3, -22.5 + bx, zS + 10], d: 16.5 });   // through the door too
  for (const z of [52, 88]) body.push({ op: "cutbox", min: [BX + 0.6, -BY + 9, z], max: [BX + 3, BY - 9, z + 1.6] });
  for (const z of [33, 101]) for (const y of [-BY + 15, BY - 15]) body.push({ op: "rod", a: [DOOR[0], y, z], b: [DOOR[1] + 0.9, y, z], r: 2.4 });
  for (const side of [1, -1] as const) for (const x of [-54, 54]) {
    const y = side > 0 ? [BY - 0.8, BY + 1] : [-BY - 1, -BY + 0.8];
    body.push({ op: "cutbox", min: [x - 0.8, y[0], 74], max: [x + 0.8, y[1], Z1 + 1] });
  }
  // the rear hatch: its outline and a hinge bar, below the switch
  for (const [z0, z1, y0, y1] of [[28, 29.6, -46, 46], [84, 85.6, -46, 46], [28, 85.6, -46, -44.4], [28, 85.6, 44.4, 46]]) body.push({ op: "cutbox", min: [-BX - 1, y0, z0], max: [-BX + 0.8, y1, z1] });
  A.cadLink("body", { name: "body", edge: 1.0, ops: body }, { role: "base", material: "walle" });
  // the grey band across the top of the front, with the charge gauge let into it; the dark name plate low on the door
  A.cadLink("front_band", { name: "front_band", edge: 0.5, ops: [{ op: "box", min: [BX, -BY + 2, 112], max: [BX + 2, BY - 2, Z1], r: 0 },
    { op: "cutbox", min: [BX + 1.2, -BY, 118], max: [BX + 3, BY, 119.2] }] }, { material: "walle_grey" });
  A.fixed("front_band_mount", "body", "front_band", translation([0, 0, 0]));
  const gauge: Op[] = [{ op: "box", min: [BX + 2, 8, 122], max: [BX + 4, 40, 142], r: 0 }];
  for (let k = 0; k < 4; k++) gauge.push({ op: "cutbox", min: [BX + 1, 13, 125 + k * 4], max: [BX + 5, 35, 127 + k * 4] });
  A.cadLink("charge_gauge", { name: "charge_gauge", edge: 0.5, ops: gauge }, { material: "printed_dark" });
  A.fixed("charge_gauge_mount", "body", "charge_gauge", translation([0, 0, 0]));
  A.cadLink("name_plate", { name: "name_plate", edge: 0.5, ops: [{ op: "box", min: [BX + 1.6, -40, 34], max: [BX + 3.2, 40, 47], r: 0 }] }, { material: "printed_dark" });
  A.fixed("name_plate_mount", "body", "name_plate", translation([0, 0, 0]));

  // ---------------- drive: motors, wheels, TPU tracks
  const wheelJoints: string[] = [];
  for (const { xa, can } of axles) for (const side of [1, -1] as const) {
    const tag = `${xa > 0 ? "front" : "rear"}_${side > 0 ? "left" : "right"}`;
    A.mount("body", MOTOR, motorT(xa, side, can, BY, ZC), `${tag}_motor`, "drive motor");
    A.fastener("M3x25 socket head + nut (motor through-bolt)", 2);
    const Tw = mul(translation([xa, side * (BY + 1), ZC]), frame([0, 0, 0], [0, side, 0], [1, 0, 0]));
    const wheel = A.mount("body", WHEEL, Tw, `${tag}_wheel`, "track drive wheel");
    // the track rides on the wheels: in simulation each wheel touches the ground with the track's outer radius
    wheel.collision = { type: "cylinder", radius: (R + BELT) / 1000, length: 0.026 };
    A.spec.joints.pop();
    A.continuous(`${tag}_wheel_joint`, "body", `${tag}_wheel`, Tw, MOTOR);
    wheelJoints.push(`${tag}_wheel_joint`);
  }
  for (const side of [1, -1] as const) {
    const y0 = side > 0 ? BY + 1 : -BY - 28, y1 = side > 0 ? BY + 28 : -BY - 1;
    // a triangle round the two drive wheels and the top idler, the film's tread
    const loop = (r: number, rt: number, pad: number): Op[] => [...[-XA, XA].map((x) => ({ op: "rod" as const, a: [x, y0 - pad, ZC] as Vec3, b: [x, y1 + pad, ZC] as Vec3, r })),
      { op: "rod" as const, a: [X_TOP, y0 - pad, Z_TOP] as Vec3, b: [X_TOP, y1 + pad, Z_TOP] as Vec3, r: rt }];
    const track: Op[] = [{ op: "hull", of: loop(R + BELT, R_IDLE + BELT, 0) }, { op: "hull", of: loop(R + 0.3, R_IDLE + 0.3, 1), cut: true }];
    // tread bars across every straight run, 1.2 mm deep
    for (let x = -XA + 6; x <= XA - 6; x += 12) track.push({ op: "cutbox", min: [x - 1.5, y0 - 1, ZC - R - BELT - 1], max: [x + 1.5, y1 + 1, ZC - R - BELT + 1.2] });
    for (const xa of [XA, -XA]) {
      const dx = X_TOP - xa, dz = Z_TOP - ZC, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, sgn = xa > 0 ? -1 : 1;
      const a = Math.asin((R - R_IDLE) / L), px = sgn * uz * -1, pz = sgn * ux * 1, nx = px * Math.cos(a) + ux * Math.sin(a), nz = pz * Math.cos(a) + uz * Math.sin(a);
      const n: Vec3 = nz > 0 ? [nx, 0, nz] : [-nx, 0, -nz], t: Vec3 = [n[2], 0, -n[0]], rr = R + BELT;   // n: outward, t: along the run
      const span = Math.sqrt(L * L - (R - R_IDLE) ** 2), sx = xa + n[0] * rr, sz = ZC + n[2] * rr, dir = (X_TOP + n[0] * (R_IDLE + BELT) - sx) * t[0] + (Z_TOP + n[2] * (R_IDLE + BELT) - sz) * t[2] > 0 ? 1 : -1;
      for (let d = 8; d < span - 4; d += 12) {
        const o: Vec3 = [sx + t[0] * dir * d, 0, sz + t[2] * dir * d];
        track.push({ op: "at", T: place(t, [0, 1, 0], n[2] * t[0] - n[0] * t[2] > 0 ? n : [-n[0], 0, -n[2]], o), of: [{ op: "cutbox", min: [-1.5, y0 - 1, -1.2], max: [1.5, y1 + 1, 1.2] }] });
      }
    }
    const name = `track_${side > 0 ? "left" : "right"}`;
    // the track's frame sits inside the body: its placeholder collision (the wheels model the contact) stays off the floor
    const tl = A.cadLink(name, { name, edge: 0.4, ops: [{ op: "at", T: translation([0, 0, -80]), of: track }] }, { material: "rubber" });
    tl.collision = { type: "sphere", radius: 0.002 };   // visual only: its contact is modelled by the wheels it wraps
    A.fixed(`${name}_mount`, "body", name, translation([0, 0, 80]));
    // top idler on a pin through the side wall; it turns with the track
    const lr = side > 0 ? "left" : "right", yc = side * (BY + 14.5), Ti = mul(translation([X_TOP, yc, Z_TOP]), frame([0, 0, 0], [0, side, 0], [1, 0, 0]));
    const idler: Op[] = [{ op: "rod", a: [0, 0, -11], b: [0, 0, 11], r: R_IDLE }, { op: "hole", a: [0, 0, -12], b: [0, 0, 12], d: 4 }];
    for (let k = 0; k < 5; k++) { const w = (2 * Math.PI * k) / 5; idler.push({ op: "hole", a: [9 * Math.cos(w), 9 * Math.sin(w), -12], b: [9 * Math.cos(w), 9 * Math.sin(w), 12], d: 6 }); }
    A.cadLink(`${lr}_idler`, { name: `${lr}_idler`, edge: 0.6, ops: idler }, { material: "printed_dark" });
    const ij = A.continuous(`${lr}_idler_joint`, "body", `${lr}_idler`, Ti, null);
    ij.mimic = { joint: `front_${lr}_wheel_joint`, multiplier: +(R / R_IDLE).toFixed(4), offset: 0 };
    const il = A.spec.links.find((l) => l.name === `${lr}_idler`)!; il.collision = { type: "sphere", radius: 0.002 };
    A.fastener("M4 x 45 shoulder bolt (idler pin)", 1);
  }

  // ---------------- front distance sensor (board z = forwards, board x across, board y up)
  A.mount("body", "hc_sr04", place([0, 1, 0], [0, 0, 1], [1, 0, 0], [BX - WALL - 1.6, -22.5, zS]), "ultrasonic", "HC-SR04 distance sensor (obstacle avoidance)");
  A.spec.sensors.push({ name: "front_range", type: "range", parent: "ultrasonic", origin: { xyz: [0.0225, 0.01, 0.0136], rpy: [0, 0, 0] }, params: { range_m: 4, min_range_m: 0.02, beam_deg: 15 } });
  A.fastener("M2x6 self-tapping (sensor)", 4);
  exposed(A, "ultrasonic", "transducers look out through two 16.5 mm windows in the front wall", [45, 20]);

  // ---------------- electronics inside the body
  A.mount("body", PACK, translation([-38.5, 0, Z0 + WALL]), "battery", "2S 18650 pack");
  A.fastener("M3x8 countersunk + nut (pack)", 2);
  A.mount("body", "breadboard_400", Tbb, "breadboard", "plug-in wiring: Nano + two TB6612FNG", "printed");
  A.mount("breadboard", "arduino_nano_clone", translation([4, 31, 8.5]), "controller", "Arduino Nano (runs the generated sketch)");
  for (let i = 0; i < 2; i++) A.mount("breadboard", "tb6612fng_module", translation([4 + i * 24, 4, 8.5]), `motor_driver_${i + 1}`, "TB6612FNG dual motor driver");
  A.mount("body", "pca9685_clone", mul(translation([0, 0, Z0 + WALL]), Tpca), "servo_driver", "PCA9685 servo driver (I2C)");
  A.mount("body", "buck_lm2596", mul(translation([0, 0, Z0 + WALL]), Tbuck), "servo_regulator", "LM2596 set to 5.0 V for the neck and hand servos");
  A.mount("body", "buck_lm2596", mul(translation([0, 0, Z0 + WALL]), Tbuck2), "arm_regulator", "LM2596 set to 5.0 V for the shoulder and elbow servos");
  A.mount("body", "switch_kcd1", frame([-BX, SW_Y, SW_Z], [-1, 0, 0], [0, 0, 1]), "main_switch", "main power switch");
  A.fastener("M2.5x6 + nut (PCA9685) / M3x6 (LM2596)", 6);

  // ---------------- lid with the neck pan servo hanging below it
  const Tpan = translation([22, 0, Z1 + LID + 1]);
  const lid: Op[] = [
    { op: "box", min: [-BX, -BY, Z1], max: [BX, BY, Z1 + LID], r: 8 },
    // locating lip: four 2 mm walls just inside the body walls (built as walls, not a hollowed box: cuts apply to the
    // whole part and would sever the servo cradle hanging through it)
    ...lipWalls(BX - WALL - 0.3, BY - WALL - 0.3, 2, Z1 - 4, Z1 + 1),
    { op: "cradle", key: SERVO, T: Tpan, wall: 2.5 },
  ];
  for (const x of [-BX + 7, BX - 7]) for (const y of [-BY + 7, BY - 7]) lid.push({ op: "hole", a: [x, y, Z1 - 6], b: [x, y, Z1 + LID + 1], d: 3.4 });
  // neck leads leave through a grommet beside the pan servo; slots over the drivers and regulator let the heat out
  lid.push({ op: "hole", a: [EXIT_X, 0, Z1 - 1], b: [EXIT_X, 0, Z1 + LID + 1], d: 8 });
  for (let k = 0; k < VENTS; k++) lid.push({ op: "cutbox", min: [-72, -48 + k * 7, Z1 - 5], max: [-20, -44.8 + k * 7, Z1 + LID + 1] });
  A.cadLink("lid", { name: "lid", edge: 0.8, ops: lid }, { material: "walle_grey" });
  A.fixed("lid_mount", "body", "lid", translation([0, 0, 0]));
  A.fastener("M3x10 self-tapping (lid)", 4);
  A.mount("lid", SERVO, Tpan, "neck_pan_servo", "neck pan servo");

  // ---------------- neck (pan output frame): horn plate, column, tilt servo cradle (axis along +y)
  const yo = 14, hT = 78, b = sb();
  const Ttilt = place([0, 0, -1], [-1, 0, 0], [0, 1, 0], [0, yo, hT]);
  const neck: Op[] = [
    { op: "horn", key: SERVO, t: 4, extra: 3, channel: hT },
    { op: "box", min: [-9, -9, 0], max: [9, 9, hT - b.max[0] - 2], r: 3 },
    { op: "box", min: [-11.5, -11.5, 16], max: [11.5, 11.5, 20], r: 3 }, { op: "box", min: [-11.5, -11.5, 30], max: [11.5, 11.5, 34], r: 3 },   // collars of the telescoping tube
    { op: "box", min: [b.min[1] - 2.5, yo + b.min[2] - 2.5, hT - b.max[0] - 4], max: [b.max[1] + 2.5, yo - 1, hT - b.max[0] - 1.5], r: 0 },
    { op: "cradle", key: SERVO, T: Ttilt, wall: 2.5 },
  ];
  A.cadLink("neck", { name: "neck", edge: 0.6, ops: neck }, { material: "walle_rust" });
  A.revolute("neck_pan", "lid", "neck", Tpan, SERVO, -1.4, 1.4);
  A.mount("neck", SERVO, Ttilt, "neck_tilt_servo", "neck tilt servo");

  // ---------------- head (tilt output frame: x = down, y = backwards, z = left): binocular eyes on a back plate
  // world offsets from the tilt axis: X forward, Y left, Z up  ->  tilt frame (-Z, -X, Y)
  const W = (X: number, Y: number, Z: number): Vec3 => [-Z, -X, Y - yo];
  const head: Op[] = [
    { op: "horn", key: SERVO, t: 4, extra: 3 },
    { op: "box", min: [-62, -12, 0], max: [0, 12, 4], r: 3 },                                           // plate on the horn, up to the eyes
    { op: "box", min: [W(10, 0, 50)[0], W(10, 0, 50)[1], W(0, -16, 0)[2]], max: [W(-10, 0, 38)[0], W(-10, 0, 38)[1], 4], r: 0 },  // bridge over the servo
  ];
  // each eye: a binocular barrel drawn in to its inner top corner, seen from the front a sad tilted teardrop; a deep lens well
  for (const S of [1, -1]) {
    const barrel = (x0: number, x1: number, grow: number): Op => ({ op: "hull", of: [{ op: "rod", a: W(x0, S * 37, 44), b: W(x1, S * 37, 44), r: 25 + grow }, { op: "rod", a: W(x0, S * 17, 60), b: W(x1, S * 17, 60), r: 12 + grow }] });
    head.push(barrel(-16, 22, 0), barrel(20, 30, 1.5));
  }
  for (const Y of [37, -37]) head.push({ op: "hole", a: W(18, Y, 44), b: W(32, Y, 44), d: 39 }, { op: "hole", a: W(-13, Y, 44), b: W(19, Y, 44), d: 44 });   // lens wells, hollow barrels
  A.cadLink("head", { name: "head", edge: 0.8, ops: head }, { material: "walle_grey" });
  A.revolute("neck_tilt", "neck", "head", Ttilt, SERVO, -0.7, 0.7);
  // smoked lenses glued into the wells, an iris ring in each
  for (const [n, Y] of [["left", 37], ["right", -37]] as const) {
    A.cadLink(`${n}_lens`, { name: `${n}_lens`, edge: 0.4, ops: [{ op: "rod", a: W(18.1, Y, 44), b: W(21, Y, 44), r: 19.3 }, { op: "rod", a: W(21, Y, 44), b: W(23.5, Y, 44), r: 14 }, { op: "hole", a: W(22.5, Y, 44), b: W(25, Y, 44), d: 10 }] }, { material: "visor" });
    A.fixed(`${n}_lens_mount`, "head", `${n}_lens`, translation([0, 0, 0]));
  }

  // ---------------- arms: a shoulder on each side wall, a boxy upper arm carrying the elbow servo, a forearm widening to the
  // wrist, then a hand: two fixed fingers and a servo-driven thumb.
  for (const side of [1, -1] as const) {
    const lr = side > 0 ? "left" : "right", name = `${lr}_arm`, fore = `${lr}_forearm`, f = side;
    // upper arm frame (the shoulder servo's output): x up, y = f * forward, z out of the body
    const Y = (a: number, b: number): [number, number] => [Math.min(f * a, f * b), Math.max(f * a, f * b)];
    const blk = (x0: number, x1: number, a: number, b: number, z0: number, z1: number, r = 0): Op => ({ op: "box", min: [x0, Y(a, b)[0], z0], max: [x1, Y(a, b)[1], z1], r });
    const Te = place([0, f, 0], [-f, 0, 0], [0, 0, 1], [0, f * UPPER, ELBOW_Z]);
    const upper: Op[] = [
      { op: "horn", key: SHOULDER, t: 4, extra: 3 },
      { op: "beam", a: [0, 0, 4.5], b: [0, f * 30, 4.5], w: 16, h: 4, up: [0, 0, 1] },                 // rides above the servo's gear boss as the arm turns
      { op: "cradle", key: SERVO, T: Te, wall: 2.5 },
      blk(-9, 9, 22, 44, 2.5, 9),
    ];
    A.cadLink(name, { name, edge: 0.6, ops: upper }, { material: "walle_grey" });
    A.mount("body", SHOULDER, Tarm(side), `${name}_servo`, "shoulder servo");
    A.revolute(`${name}_lift`, "body", name, Tarm(side), SHOULDER, -1.0, 1.0);
    A.mount(name, SERVO, Te, `${lr}_elbow_servo`, "elbow servo");
    // forearm frame (the elbow servo's output): x forward, y = -f * up, z out of the body. A channel open towards the body,
    // widening from the elbow to the wrist; the hand servo lies in the palm with its output across
    const Th = place([1, 0, 0], [0, 0, f], [0, -f, 0], [FORE, -f * HAND_X, 8.5]);
    const shape = (z0: number, z1: number, pad: number): Op => ({ op: "hull", of: [{ op: "box", min: [12 + pad, -9 + pad, z0], max: [14 + pad, 9 - pad, z1] }, { op: "box", min: [FORE - 22, -14 + pad, z0], max: [FORE - 20 - pad, 14 - pad, z1] }] });
    const forearm: Op[] = [
      { op: "horn", key: SERVO, t: 4, extra: 3 },
      { op: "beam", a: [0, 0, 2], b: [20, 0, 2], w: 16, h: 4, up: [0, 0, 1] },
      shape(0, 16, 0),
      { op: "hull", cut: true, of: [{ op: "box", min: [18, -6.8, -1], max: [20, 6.8, 14] }, { op: "box", min: [FORE - 26, -11.8, -1], max: [FORE - 24, 11.8, 14] }] },
      { op: "box", min: [FORE - 22, -15, 0], max: [FORE - 16, 15, 16.5] },                              // wrist collar
      { op: "cradle", key: SERVO, T: Th, wall: 2.5 },
      { op: "box", min: [FORE + 15, Math.min(f * -14, f * 12), 1.5], max: [FORE + 22, Math.max(f * -14, f * 12), 15.5] },   // knuckles, then two fingers (mirrored per side)
      { op: "box", min: [FORE + 20, Math.min(f * -14, f * -6), 1.5], max: [FORE + 48, Math.max(f * -14, f * -6), 7.5], r: 2 }, { op: "box", min: [FORE + 20, Math.min(f * 1, f * 9), 1.5], max: [FORE + 48, Math.max(f * 1, f * 9), 7.5], r: 2 },
    ];
    A.cadLink(fore, { name: fore, edge: 0.6, ops: forearm }, { material: "walle_grey" });
    // the hazard stripes on the forearm: a dark plate with slanted slots, the grey showing through
    const stripes: Op[] = [{ op: "box", min: [24, -11, 16], max: [FORE - 26, 11, 18] }];
    for (let k = 0; k < 2; k++) stripes.push({ op: "subtract", of: [{ op: "beam", a: [30 + k * 8, -5, 17], b: [34 + k * 8, 5, 17], w: 3, h: 5, up: [0, 0, 1] }] });
    A.cadLink(`${lr}_arm_stripes`, { name: `${lr}_arm_stripes`, edge: 0, ops: stripes }, { material: "printed_dark" });
    A.fixed(`${lr}_arm_stripes_mount`, fore, `${lr}_arm_stripes`, translation([0, 0, 0]));
    A.revolute(`${lr}_elbow`, name, fore, Te, SERVO, -1.5, 1.5);
    // thumb on the hand servo's horn, then a finger across, over the two fixed fingers
    const thumb: Op[] = [
      { op: "horn", key: SERVO, t: 4, extra: 3 },
      { op: "beam", a: [0, 0, 2], b: [THUMB_L, -f * -8, 2], w: 12, h: 4, up: [0, 0, 1] },
      { op: "box", min: [THUMB_L - 5, Math.min(f * 3, f * 13), -HAND_X - 13], max: [THUMB_L + 5, Math.max(f * 3, f * 13), 4], r: 2 },
    ];
    A.cadLink(`${lr}_thumb`, { name: `${lr}_thumb`, edge: 0.5, ops: thumb }, { material: "walle_grey" });
    A.mount(fore, SERVO, Th, `${lr}_hand_servo`, "hand servo");
    A.revolute(`${lr}_hand`, fore, `${lr}_thumb`, Th, SERVO, -0.6, 0.6);
  }
  A.fastener("M2 self-tapping (servo tabs, from the servo kits)", 2 * 8);

  // ---------------- the body is the compartment: its lid, exits and vents on record, then the harness
  const H = new Harness(A);
  const inBody = ["battery", "breadboard", "controller", "motor_driver_1", "motor_driver_2", "servo_driver", "servo_regulator", "arm_regulator"];
  registerBay(A, { name: "body_bay", tub: "body", lid: "lid", parent: "body", T: translation([0, 0, 0]), min: [-BX + WALL, -BY + WALL, Z0 + WALL], max: [BX - WALL, BY - WALL, Z1], parts: inBody, screws: 4, vent_area_mm2: Math.round(VENTS * 52 * 3.2), note: "the hollow body itself",
    exits: [{ id: "body_bay.neck_leads", kind: "grommet", face: "lid", at: [EXIT_X, 0, Z1 + LID], normal: [0, 0, 1], hole_mm: 8 }, { id: "body_bay.usb", kind: "usb", face: "y-", at: [USB_X, -BY, USB_Z], normal: [0, -1, 0], hole_mm: 10 }, { id: "body_bay.switch", kind: "switch", face: "x-", at: [-BX, SW_Y, SW_Z], normal: [-1, 0, 0], hole_mm: 13, part: "main_switch" }] }, H);
  for (const n of ["main_switch", "ultrasonic", "neck_pan_servo", "left_arm_servo", "right_arm_servo", ...["front_left", "front_right", "rear_left", "rear_right"].map((t) => `${t}_motor`)]) H.bayOf.set(n, "body_bay");
  wire(H, ["front_left_motor", "front_right_motor", "rear_left_motor", "rear_right_motor"]);

  // ---------------- checks
  limitsFromGeometry(A, ["neck_pan", "neck_tilt", "left_arm_lift", "right_arm_lift", "left_elbow", "right_elbow", "left_hand", "right_hand"], [{ neck_pan: 1.2, neck_tilt: 0.6 }, { neck_pan: -1.2, neck_tilt: -0.6 }, { left_arm_lift: -0.8, right_arm_lift: 0.8 }, { left_hand: 0.5, right_hand: -0.5 }],
    0.06, [["body", "track_left"], ["body", "track_right"]]);
  finishWiring(H);
  enclosureChecks(A);
  for (const j of ["neck_pan", "neck_tilt", "left_arm_lift", "right_arm_lift", "left_elbow", "right_elbow", "left_hand", "right_hand"]) {
    let w = 0;
    for (const q of [{}, { neck_tilt: 0.6 }, { neck_tilt: -0.6 }, { [j]: 0.9 }, { [j]: -0.9 }]) w = Math.max(w, Math.abs(gravityTorques(A.spec, q)[j] ?? 0));
    const key = /arm_lift/.test(j) ? SHOULDER : SERVO, r = rating(key);
    A.design.joints.push({ joint: j, actuator: key, required_nm: +(w * DYNAMIC_FACTOR).toFixed(4), rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: +(r.peak_nm / Math.max(w * DYNAMIC_FACTOR, 1e-6)).toFixed(2), speed_rad_s: r.speed_rad_s, note: "worst static gravity load" });
    A.check(`torque:${j}`, r.rated_nm >= w && r.peak_nm >= w * DYNAMIC_FACTOR, `holds ${w.toFixed(4)} N·m (${key === SERVO ? "SG90" : "MG90S"} rated ${r.rated_nm} N·m continuous)`);
  }
  const m = totalMass(A.spec), g = 9.81, rr = ZC / 1000, rt = rating(MOTOR);
  const slope = m * (g * Math.sin(10 * Math.PI / 180) + 0.25 + 0.03 * g) * rr / wheelJoints.length;
  A.check("drive:torque", slope <= rt.rated_nm, `${m.toFixed(2)} kg on a 10 deg slope accelerating 0.25 m/s^2: ${slope.toFixed(4)} N·m per wheel vs ${rt.rated_nm} N·m continuous`);
  // turning on the spot drags the tracks sideways: per side force = mu * m g * L / (4 B); checked on a grippy floor (mu 1.0,
  // TPU on wood or tile) so the motors never stall in a turn
  const L = 2 * XA / 1000, B = 2 * (BY + 14.5) / 1000, Fturn = 1.0 * m * g * L / (4 * B);
  const tauTurn = (Fturn * rr) / 2;
  A.check("drive:skid_turn", tauTurn * DYNAMIC_FACTOR <= rt.peak_nm, `turning on the spot (mu 1.0, contact ${L * 1000} mm, track gauge ${(B * 1000).toFixed(0)} mm): ${tauTurn.toFixed(4)} N·m per wheel x ${DYNAMIC_FACTOR} vs stall ${rt.peak_nm} N·m (short transient, as for the skid-steer bases)`);
  const vmax = rt.speed_rad_s * rr * 0.8;
  // a tracked base turns slower than its no-slip rate: the tracks slide sideways (same model as the skid-steer bases), and
  // a track drags along its whole length, so its TT motors run at their torque limit through the turn; the extra 0.4 is the
  // shortfall that limit causes in simulation (mean 1.3 rad/s on the grippy test floor)
  const chi = 1 + 2 * (L / B) ** 2 + 0.4, turnRate = (0.5 * vmax) / (B / 2) / chi;
  A.check("drive:top_speed", vmax >= 0.3, `${vmax.toFixed(2)} m/s`);
  const servoStall = 2 * electrical(SERVO)!.current_a.v.peak + 2 * electrical(SHOULDER)!.current_a.v.peak, buckA = electrical("buck_lm2596")!.current_a.v.peak;
  A.check("power:servo_supply", servoStall <= buckA, `the four servos on the busier regulator stalled together draw ${servoStall.toFixed(1)} A of the LM2596's ${buckA} A peak (2 A continuous)`);
  A.check("power:driver_current", Number(part(MOTOR).specs.stall_current_a) <= Number(part("tb6612fng_module").specs.peak_current_a), "one TT motor per TB6612FNG channel (stall 1.5 A <= 3.2 A peak)");
  const runtime = Number(part(PACK).specs.energy_wh) * 0.8 / (4 * 6 * 0.35 + 0.6 + 4 * 0.3) * 60;
  A.check("power:runtime", runtime >= 45, `${runtime.toFixed(0)} min (four drive motors + idling servos)`);
  const bom = A.bom();
  bom.cost_usd = +(bom.cost_usd + (A.design.wiring?.cost_usd ?? 0)).toFixed(2);
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `$${bom.cost_usd.toFixed(2)} of parts vs $${req.budget} budget`);
  A.design.performance = { mass_kg: +m.toFixed(3), top_speed_m_s: +vmax.toFixed(2), runtime_min: +runtime.toFixed(0), cost_usd: bom.cost_usd, height_mm: 0, tier: "cheapest", tier_label: "Arduino WALL-E",
    turn_rate_rad_s: +turnRate.toFixed(2), turn_slip_factor: +chi.toFixed(2) };
  A.design.assumptions.push("tracks print in TPU 95A (flexible), everything else in PETG/PLA+; the body prints open side up without supports",
    "TT motor continuous torque taken as 30 % of the 0.8 kg.cm stall; a turn on the spot is a short transient above that (the tracks slide sideways), so spin in bursts on carpet or rubber floors", "prices are typical single-unit marketplace prices and vary by seller");
  A.design.home = {};
  A.design.request = { ...req } as Record<string, unknown>;
  return A.finish(`Arduino WALL-E: TPU tracks on 4 TT motors, pan/tilt binocular head, two-joint arms with gripping hands, ${m.toFixed(2)} kg, $${bom.cost_usd.toFixed(0)} of parts`);
}
