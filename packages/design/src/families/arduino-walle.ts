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
const Tpca = place([0, 1, 0], [-1, 0, 0], [0, 0, 1], [70.4, -31.1, 5]), Tbuck = place([0, 1, 0], [-1, 0, 0], [0, 0, 1], [-58.8, -21.6, 5]);
const USB_X = -BX + WALL + 0.3 + 8.5 + 3.6, USB_Z = 70 + 31 + 8.9, SW_Y = 40, SW_Z = 100;

/** The netlist: pack through fuse and switch; TT motors on the drivers; the servos on their own buck 5 V through the PCA9685. */
function wire(H: Harness, motors: string[]) {
  H.mainPower("VBAT", { source: "battery", pos: "@power", neg: "@ground", sw: "main_switch", simultaneous: 2, simNote: "two motors stalling at once, the rest running" });
  H.regulator("controller", "VBAT", "5V_LOGIC", { vin: "VIN", gin: "GND", vout: "5V", gout: "GND", volts: 5, cont: 0.2, peakLimit: 0.4 });
  H.regulator("servo_regulator", "VBAT", "5V_SERVO", { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-", volts: 5, efficiency: 0.85, simNote: "every servo stalled at once" });
  wireDrivers(H, 2, motors);
  H.notes.push("Board to board wires on the breadboard are jumper wires in the rows of the two pins; the cut list length is the most a jumper needs.");
  H.feed("5V_SERVO", "servo_driver", { v: "v_plus.V+", g: "v_plus.GND", typ: 0.01, peak: 0.01 });
  ["neck_pan_servo", "neck_tilt_servo", "left_arm_servo", "right_arm_servo"].forEach((s, ch) => {
    const r = H.rec(s).current_a.v, d = H.rails.get("5V_SERVO")!.feeds[0];
    d.typ += r.typical; d.peak += r.peak;
    H.net(`SERVO${ch}_PWM`, "signal"); H.net(`SERVO${ch}_V`, "power", 5);
    H.wire(`SERVO${ch}_PWM`, `servo_driver.ch${ch}.PWM${ch}`, `${s}.@pwm`); H.wire(`SERVO${ch}_V`, `servo_driver.ch${ch}.V+`, `${s}.@power`, { typ: r.typical, peak: r.peak }); H.wire("GND", `servo_driver.ch${ch}.GND`, `${s}.@ground`, { typ: r.typical, peak: r.peak });
  });
  H.feed("5V_LOGIC", "servo_driver", { v: "control_in.VCC", g: "control_in.GND", typ: 0.01, peak: 0.01 });
  H.signals("controller", "servo_driver", [["A4", "SDA", "I2C_SDA"], ["A5", "SCL", "I2C_SCL"]]);
  H.feed("5V_LOGIC", "ultrasonic", { v: "VCC", g: "GND" });
  H.signals("controller", "ultrasonic", [["D11", "TRIG"], ["D12", "ECHO"]]);
}

export function designArduinoWallE(req: ArduinoWallERequest = {}): RobotSpecification {
  const A = new Assembly(req.name ?? "wall_e", "arduino_walle", req.prompt);
  // his own filament colours, kept out of the shared palette: sun-faded yellow, weathered grey, dark smoked lenses
  A.spec.materials.push({ name: "walle", color: [0.85, 0.6, 0.14, 1] }, { name: "walle_grey", color: [0.58, 0.58, 0.55, 1] }, { name: "visor", color: [0.02, 0.02, 0.03, 1] });
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
  const Tarm = (side: 1 | -1): Mat4 => place([0, 0, 1], [side, 0, 0], [0, side, 0], [10, side * (BY + 0.5), 112]);
  for (const side of [1, -1] as const) body.push({ op: "cradle", key: SERVO, T: Tarm(side), wall: 2.5 });
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
  body.push({ op: "at", T: translation([0, 0, Z0 + WALL]), of: [...standoffOps("pca9685_clone", Tpca), ...standoffOps("buck_lm2596", Tbuck)] });
  for (const z of [Tbb[14] - 2.4, Tbb[14] + 54.8]) body.push({ op: "box", min: [-BX + WALL - 0.2, Tbb[13], z], max: [-BX + WALL + 6, Tbb[13] + 82.5, z + 2.4] });
  // USB of the Nano through the left wall, main switch in the rear wall, both above the tracks
  body.push({ op: "cutbox", min: [USB_X - 7, -BY - 1, USB_Z - 5], max: [USB_X + 7, -BY + WALL + 1, USB_Z + 5] });
  body.push({ op: "cutbox", min: [-BX - 1, SW_Y - 9.7, SW_Z - 6.7], max: [-BX + WALL + 1, SW_Y + 9.7, SW_Z + 6.7] });
  // battery and electronics: screw holes through the floor
  for (const h of part(PACK).holes) body.push({ op: "hole", a: [-38.5 + h.pos[0], h.pos[1], Z0 - 1], b: [-38.5 + h.pos[0], h.pos[1], Z0 + WALL + 1], d: 3.2 });
  // compactor door on the front, proud of the wall; its seams and hinge bars, and the panel seams of the side walls
  const DOOR: [number, number] = [BX - 0.2, BX + 1.6];
  body.push({ op: "box", min: [DOOR[0], -BY + 10, 26], max: [DOOR[1], BY - 10, 134], r: 0 });
  for (const bx of [9.5, 35.5]) body.push({ op: "hole", a: [BX - WALL - 1, -22.5 + bx, zS + 10], b: [BX + 3, -22.5 + bx, zS + 10], d: 16.5 });   // through the door too
  for (const z of [88, 112]) body.push({ op: "cutbox", min: [BX + 0.6, -BY + 9, z], max: [BX + 3, BY - 9, z + 1.6] });
  for (const z of [34, 126]) for (const y of [-BY + 15, BY - 15]) body.push({ op: "rod", a: [DOOR[0], y, z], b: [DOOR[1] + 0.9, y, z], r: 2.4 });
  for (const side of [1, -1] as const) for (const x of [-54, 54]) {
    const y = side > 0 ? [BY - 0.8, BY + 1] : [-BY - 1, -BY + 0.8];
    body.push({ op: "cutbox", min: [x - 0.8, y[0], 74], max: [x + 0.8, y[1], Z1 + 1] });
  }
  A.cadLink("body", { name: "body", edge: 1.0, ops: body }, { role: "base", material: "walle" });
  // charge gauge on the door: a dark plate, its slots showing the yellow behind (and the seam it covers)
  const gauge: Op[] = [{ op: "box", min: [BX + 1.6, 16, 92], max: [BX + 3.6, 46, 128], r: 0 }];
  for (let k = 0; k < 5; k++) gauge.push({ op: "cutbox", min: [BX + 1, 21, 96.5 + k * 6], max: [BX + 5, 41, 100 + k * 6] });
  A.cadLink("charge_gauge", { name: "charge_gauge", edge: 0.5, ops: gauge }, { material: "printed_dark" });
  A.fixed("charge_gauge_mount", "body", "charge_gauge", translation([0, 0, 0]));

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
    const loop = (r: number, pad: number): Op[] => [-XA, XA].map((x) => ({ op: "rod" as const, a: [x, y0 - pad, ZC] as Vec3, b: [x, y1 + pad, ZC] as Vec3, r }));
    const track: Op[] = [{ op: "hull", of: loop(R + BELT, 0) }, { op: "hull", of: loop(R + 0.3, 1), cut: true }];
    // tread grooves across the straight runs (outer 1.2 mm), so the track grips without anything below the wheels
    for (let x = -XA + 6; x <= XA - 6; x += 12) for (const z of [ZC - R - BELT, ZC + R + BELT]) track.push({ op: "cutbox", min: [x - 1.5, y0 - 1, z - 1.2], max: [x + 1.5, y1 + 1, z + 1.2] });
    const name = `track_${side > 0 ? "left" : "right"}`;
    // the track's frame sits inside the body: its placeholder collision (the wheels model the contact) stays off the floor
    const tl = A.cadLink(name, { name, edge: 0.4, ops: [{ op: "at", T: translation([0, 0, -80]), of: track }] }, { material: "rubber" });
    tl.collision = { type: "sphere", radius: 0.002 };   // visual only: its contact is modelled by the wheels it wraps
    A.fixed(`${name}_mount`, "body", name, translation([0, 0, 80]));
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
  A.mount("body", "buck_lm2596", mul(translation([0, 0, Z0 + WALL]), Tbuck), "servo_regulator", "LM2596 set to 5.0 V for the servos");
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
  A.cadLink("lid", { name: "lid", edge: 0.8, ops: lid }, { material: "walle" });
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
  A.cadLink("neck", { name: "neck", edge: 0.6, ops: neck }, { material: "printed_dark" });
  A.revolute("neck_pan", "lid", "neck", Tpan, SERVO, -1.4, 1.4);
  A.mount("neck", SERVO, Ttilt, "neck_tilt_servo", "neck tilt servo");

  // ---------------- head (tilt output frame: x = down, y = backwards, z = left): binocular eyes on a back plate
  // world offsets from the tilt axis: X forward, Y left, Z up  ->  tilt frame (-Z, -X, Y)
  const W = (X: number, Y: number, Z: number): Vec3 => [-Z, -X, Y - yo];
  const head: Op[] = [
    { op: "horn", key: SERVO, t: 4, extra: 3 },
    { op: "box", min: [-62, -12, 0], max: [0, 12, 4], r: 3 },                                           // plate on the horn, up to the eyes
    { op: "box", min: [W(10, 0, 56)[0], W(10, 0, 56)[1], W(0, -42, 0)[2]], max: [W(-10, 0, 36)[0], W(-10, 0, 36)[1], 4], r: 0 },  // bridge over the servo
  ];
  for (const Y of [27, -27]) {
    head.push({ op: "rod", a: W(-14, Y, 46), b: W(30, Y, 46), r: 17 });
    head.push({ op: "rod", a: W(-19, Y, 46), b: W(-14, Y, 46), r: 13 }, { op: "rod", a: W(22, Y, 46), b: W(33, Y, 46), r: 19.5 });   // rear cap, lens hood
  }
  for (const Y of [27, -27]) head.push({ op: "hole", a: W(22, Y, 46), b: W(34, Y, 46), d: 27 });   // lens recesses
  A.cadLink("head", { name: "head", edge: 0.8, ops: head }, { material: "walle_grey" });
  A.revolute("neck_tilt", "neck", "head", Ttilt, SERVO, -0.7, 0.7);
  // smoked lenses glued into the recesses
  for (const [n, Y] of [["left", 27], ["right", -27]] as const) {
    A.cadLink(`${n}_lens`, { name: `${n}_lens`, edge: 0.4, ops: [{ op: "rod", a: W(22.1, Y, 46), b: W(25, Y, 46), r: 13.3 }, { op: "hole", a: W(24, Y, 46), b: W(26, Y, 46), d: 9 }] }, { material: "visor" });
    A.fixed(`${n}_lens_mount`, "head", `${n}_lens`, translation([0, 0, 0]));
  }

  // ---------------- arms: plates on the arm servo horns, pointing forwards, two-prong hands
  for (const side of [1, -1] as const) {
    const name = `${side > 0 ? "left" : "right"}_arm`, fwd = side;   // servo y axis = side * world x
    const arm: Op[] = [
      { op: "horn", key: SERVO, t: 4, extra: 3 },
      { op: "beam", a: [0, 0, 2], b: [0, fwd * 26, 2], w: 16, h: 4, up: [0, 0, 1] },                     // flat over the horn, leaving its screw reachable
      { op: "beam", a: [0, fwd * 24, 6], b: [0, fwd * 66, 6], w: 16, h: 12, up: [0, 0, 1] },              // box-section forearm with a lightening window
      { op: "cutbox", min: [-4.5, Math.min(fwd * 32, fwd * 56), -1], max: [4.5, Math.max(fwd * 32, fwd * 56), 13] },
      { op: "box", min: [-14, Math.min(fwd * 64, fwd * 76), 0], max: [14, Math.max(fwd * 64, fwd * 76), 12], r: 2 },   // palm
      { op: "box", min: [-14, Math.min(fwd * 74, fwd * 94), 3], max: [-5, Math.max(fwd * 74, fwd * 94), 9], r: 2 },     // two fingers
      { op: "box", min: [5, Math.min(fwd * 74, fwd * 94), 3], max: [14, Math.max(fwd * 74, fwd * 94), 9], r: 2 },
    ];
    A.cadLink(name, { name, edge: 0.6, ops: arm }, { material: "walle_grey" });
    A.mount("body", SERVO, Tarm(side), `${name}_servo`, "arm servo");
    A.revolute(`${name}_lift`, "body", name, Tarm(side), SERVO, -1.0, 1.0);
  }
  A.fastener("M2 self-tapping (servo tabs, from the servo kits)", 2 * 4);

  // ---------------- the body is the compartment: its lid, exits and vents on record, then the harness
  const H = new Harness(A);
  const inBody = ["battery", "breadboard", "controller", "motor_driver_1", "motor_driver_2", "servo_driver", "servo_regulator"];
  registerBay(A, { name: "body_bay", tub: "body", lid: "lid", parent: "body", T: translation([0, 0, 0]), min: [-BX + WALL, -BY + WALL, Z0 + WALL], max: [BX - WALL, BY - WALL, Z1], parts: inBody, screws: 4, vent_area_mm2: Math.round(VENTS * 52 * 3.2), note: "the hollow body itself",
    exits: [{ id: "body_bay.neck_leads", kind: "grommet", face: "lid", at: [EXIT_X, 0, Z1 + LID], normal: [0, 0, 1], hole_mm: 8 }, { id: "body_bay.usb", kind: "usb", face: "y-", at: [USB_X, -BY, USB_Z], normal: [0, -1, 0], hole_mm: 10 }, { id: "body_bay.switch", kind: "switch", face: "x-", at: [-BX, SW_Y, SW_Z], normal: [-1, 0, 0], hole_mm: 13, part: "main_switch" }] }, H);
  for (const n of ["main_switch", "ultrasonic", "neck_pan_servo", "left_arm_servo", "right_arm_servo", ...["front_left", "front_right", "rear_left", "rear_right"].map((t) => `${t}_motor`)]) H.bayOf.set(n, "body_bay");
  wire(H, ["front_left_motor", "front_right_motor", "rear_left_motor", "rear_right_motor"]);

  // ---------------- checks
  limitsFromGeometry(A, ["neck_pan", "neck_tilt", "left_arm_lift", "right_arm_lift"], [{ neck_pan: 1.2, neck_tilt: 0.6 }, { neck_pan: -1.2, neck_tilt: -0.6 }, { left_arm_lift: 0.9, right_arm_lift: -0.9 }],
    0.06, [["body", "track_left"], ["body", "track_right"]]);
  finishWiring(H);
  enclosureChecks(A);
  for (const j of ["neck_pan", "neck_tilt", "left_arm_lift", "right_arm_lift"]) {
    let w = 0;
    for (const q of [{}, { neck_tilt: 0.6 }, { neck_tilt: -0.6 }, { [j]: 0.9 }, { [j]: -0.9 }]) w = Math.max(w, Math.abs(gravityTorques(A.spec, q)[j] ?? 0));
    const r = rating(SERVO);
    A.design.joints.push({ joint: j, actuator: SERVO, required_nm: +(w * DYNAMIC_FACTOR).toFixed(4), rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: +(r.peak_nm / Math.max(w * DYNAMIC_FACTOR, 1e-6)).toFixed(2), speed_rad_s: r.speed_rad_s, note: "worst static gravity load" });
    A.check(`torque:${j}`, r.rated_nm >= w && r.peak_nm >= w * DYNAMIC_FACTOR, `holds ${w.toFixed(4)} N·m (SG90 rated ${r.rated_nm} N·m continuous)`);
  }
  const m = totalMass(A.spec), g = 9.81, rr = ZC / 1000, rt = rating(MOTOR);
  const slope = m * (g * Math.sin(10 * Math.PI / 180) + 0.5 + 0.03 * g) * rr / wheelJoints.length;
  A.check("drive:torque", slope <= rt.rated_nm, `${m.toFixed(2)} kg on a 10 deg slope accelerating 0.5 m/s^2: ${slope.toFixed(4)} N·m per wheel vs ${rt.rated_nm} N·m continuous`);
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
  const servoStall = 4 * electrical(SERVO)!.current_a.v.peak, buckA = electrical("buck_lm2596")!.current_a.v.peak;
  A.check("power:servo_supply", servoStall <= buckA, `four SG90s stalled together draw ${servoStall.toFixed(1)} A of the LM2596's ${buckA} A peak (2 A continuous)`);
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
  return A.finish(`Arduino WALL-E: TPU tracks on 4 TT motors, pan/tilt binocular head, 2 servo arms, ${m.toFixed(2)} kg, $${bom.cost_usd.toFixed(0)} of parts`);
}
