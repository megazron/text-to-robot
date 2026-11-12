// Arduino desk arm: the small hobby-servo arm people actually build (MeArm / SG90-arm class). A yaw servo stands in a
// printed base; a turntable bolts to its horn and holds the shoulder servo; every link is a plate screwed to the
// driving servo's horn with the next servo in a cradle at its end; a one-servo claw closes a moving jaw against a
// fixed one. No bearings or metal hardware beyond the servos' own screws: the servo output bearing carries each joint,
// which is why link lengths are searched down to what each servo holds continuously at full stretch.
// Every printed part is an exact CAD solid (@ttr/kernel). Controller: Arduino Uno clone + PCA9685 clone, 5 V supply.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, electrical, hornRadiusMm, type Vec3 } from "@ttr/parts";
import { translation, type Mat4 } from "@ttr/solid";
import type { Op } from "@ttr/kernel";
import { Assembly } from "../assembly.ts";
import { gravityTorques, totalMass, axisInertias, type PointLoad } from "../kin.ts";
import { DYNAMIC_FACTOR, MIN_SPEED, loadedSpeed } from "../sizing.ts";
import { limitsFromGeometry } from "./legkit.ts";
import { bay, enclosureChecks, supplyBox, panelPose, type ExitSpec } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { boardProfile, PinPlan, type FirmwareRecord } from "./parts-pins.ts";

export interface ArduinoArmRequest {
  name?: string; prompt?: string; budget?: number;
  /** servos allowed, weakest first (the designer picks per joint) */
  servos?: string[];
  payloadKg?: number;
  gripper?: boolean;
  /** upper arm and forearm pivot-to-pivot lengths (mm); searched when omitted */
  lengths?: [number, number];
  /** controller board (default the Uno clone; the Nano drives the PCA9685 the same way over I2C) */
  board?: "arduino_uno_clone" | "arduino_nano_clone" | "arduino_uno_r3" | "arduino_nano_v3" | "esp32_devkit_v1";
  /** how many of each servo there are (parts mode): a joint takes the weakest servo left that holds it */
  servoCounts?: Record<string, number>;
  /** servo driver: a PCA9685 board (default) or "direct" (servo signals straight from the board's pins) */
  servoDriver?: "pca9685_clone" | "pca9685_16ch" | "direct";
  /** servo supply: the 5 V adapter or bench supply sized from the stall current (default), or a battery from the parts list */
  supply?: string;
}

const WALL = 2.5, PLATE = 4, EDGE = 0.6;
/** base plate, and the electronics console behind the yaw servo: cavity floor height, length, width, height */
// (the lid stands over the Uno's sockets by a jumper's housing, its first bend and the bundle it joins; the PCA9685's
// V+ terminal has room for its wire's ferrule and first bend before the side wall)
const BASE_T = 5, CON = { floor: 2.4, L: 88, Wd: 106, H: 41, x1: -29.4 };
const body = (k: string) => part(k).bbox_mm!;
/** servo frame placed by rotation columns (x, y, z) and origin, column-major mm */
const place = (x: Vec3, y: Vec3, z: Vec3, o: Vec3): Mat4 => [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];
/** output face height above the cradle floor for a servo whose body hangs below its output (servo -z) */
const depth = (k: string) => -body(k).min[2];

interface Built { spec: RobotSpecification; A: Assembly; reach: number; tcp: { link: string; at: Vec3 }; }

function build(req: ArduinoArmRequest, keys: { yaw: string; shoulder: string; elbow: string; grip: string }, L1: number, L2: number): Built {
  const A = new Assembly(req.name ?? "arduino_arm", "arduino_arm", req.prompt), gripper = req.gripper !== false;
  // ---------------- base: footed disc + yaw servo cradle (servo vertical, output up)
  // the servo stands on a riser so the console behind it (lid just under the turntable) is tall enough for the servo plugs
  const zY = Math.max(depth(keys.yaw) + WALL + 1.5, BASE_T + CON.floor + CON.H + 2.8 + 1.5);
  const Ty = place([1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, zY]);
  const yb = body(keys.yaw), zServo = zY + yb.min[2];
  const baseOps: Op[] = [{ op: "box", min: [-128, -58, 0], max: [55, 58, BASE_T], r: 10 },
    { op: "box", min: [yb.min[0] - WALL, yb.min[1] - WALL, 0], max: [yb.max[0] + WALL, yb.max[1] + WALL, zServo - WALL + 0.2], r: 3 }, { op: "cradle", key: keys.yaw, T: Ty, wall: WALL }];
  for (const x of [-118, 45]) for (const y of [-48, 48]) baseOps.push({ op: "hole", a: [x, y, -1], b: [x, y, 6], d: 4.3 });   // clamp / screw to the desk
  A.cadLink("base_link", { name: "base_link", edge: EDGE, ops: baseOps }, { role: "base", material: "printed_dark" });
  A.mount("base_link", keys.yaw, Ty, "yaw_servo", "base yaw servo");

  // ---------------- turntable: horn plate on the yaw servo + riser holding the shoulder servo (axis horizontal, along +y)
  const yo = 14, hS = body(keys.shoulder).max[0] + WALL + PLATE + 2;      // shoulder output face y, axis height
  const Ts = place([0, 0, -1], [-1, 0, 0], [0, 1, 0], [0, yo, hS]);       // servo x down, y backwards, output towards +y
  const sb = body(keys.shoulder);
  const turntable: Op[] = [
    { op: "horn", key: keys.yaw, t: PLATE, extra: 4, channel: hS + 30 },   // the shoulder cradle stands on it: centre channel, horn screws from below
    { op: "box", min: [-sb.max[1] - WALL, yo + sb.min[2] - WALL, 0], max: [-sb.min[1] + WALL, yo - 1, hS - sb.max[0] + 0.5], r: 0 },   // riser
    { op: "cradle", key: keys.shoulder, T: Ts, wall: WALL },
  ];
  A.cadLink("turntable", { name: "turntable", edge: EDGE, ops: turntable });
  A.revolute("yaw", "base_link", "turntable", Ty, keys.yaw, -Math.PI / 2, Math.PI / 2);
  A.mount("turntable", keys.shoulder, Ts, "shoulder_servo", "shoulder servo");

  // ---------------- upper arm (shoulder output frame): horn plate, beam along -x (up at zero), elbow servo cradle
  const eb = body(keys.elbow), zE = PLATE + 0.8 + depth(keys.elbow);
  const Te = translation([-L1, 0, zE]);
  const hornR = (k: string) => hornRadiusMm(k) + 4;
  const upper: Op[] = [
    { op: "horn", key: keys.shoulder, t: PLATE, extra: 4 },
    { op: "beam", a: [0, 0, PLATE / 2], b: [-L1 - eb.min[0] * 0, 0, PLATE / 2], w: Math.min(16, 2 * hornR(keys.shoulder)), h: PLATE, up: [0, 0, 1] },
    { op: "box", min: [-L1 + eb.min[0] - WALL, eb.min[1] - WALL, 0], max: [-L1 + eb.max[0] + WALL, eb.max[1] + WALL, PLATE], r: 3 },  // pad under the cradle
    { op: "cradle", key: keys.elbow, T: Te, wall: WALL },
  ];
  A.cadLink("upper_arm", { name: "upper_arm", edge: EDGE, ops: upper });
  A.revolute("shoulder", "turntable", "upper_arm", Ts, keys.shoulder, -Math.PI / 2, Math.PI / 2);
  A.mount("upper_arm", keys.elbow, Te, "elbow_servo", "elbow servo");

  // ---------------- forearm (elbow output frame): horn plate, beam, claw servo + fixed jaw at the end
  const gb = body(keys.grip), zG = PLATE + 0.8 + depth(keys.grip), Tg = translation([-L2, 0, zG]);
  const fore: Op[] = [
    { op: "horn", key: keys.elbow, t: PLATE, extra: 4 },
    { op: "beam", a: [0, 0, PLATE / 2], b: [-L2, 0, PLATE / 2], w: 14, h: PLATE, up: [0, 0, 1] },
  ];
  let tipX = -L2 - 10;
  if (gripper) {
    fore.push({ op: "box", min: [-L2 + gb.min[0] - WALL, gb.min[1] - WALL, 0], max: [-L2 + gb.max[0] + WALL, gb.max[1] + WALL, PLATE], r: 3 },
      { op: "cradle", key: keys.grip, T: Tg, wall: WALL },
      // fixed jaw: a finger standing up to the moving jaw's plane, outside the claw horn's swing, bridged to the cradle pad
      { op: "box", min: [-L2 - 52, 22.5, 0], max: [-L2 - 24, 28.5, zG + PLATE], r: 0 },
      { op: "box", min: [-L2 - 30, 5, 0], max: [-L2 - 22, 23, PLATE], r: 0 });
    tipX = -L2 - 40;
  }
  A.cadLink("forearm", { name: "forearm", edge: EDGE, ops: fore });
  A.revolute("elbow", "upper_arm", "forearm", Te, keys.elbow, -2.1, 2.1);
  let tcp = { link: "forearm", at: [tipX / 1000, 0, (gripper ? zG : PLATE) / 1000] as Vec3 };
  if (gripper) {
    A.mount("forearm", keys.grip, Tg, "claw_servo", "claw servo");
    // moving jaw on the claw servo horn, swinging in the plane z = 0..PLATE of the claw output frame
    const jaw: Op[] = [{ op: "horn", key: keys.grip, t: PLATE, extra: 3 }, { op: "box", min: [-50, 15.5, 0], max: [-6, 21.5, PLATE], r: 0 }];
    A.cadLink("claw_jaw", { name: "claw_jaw", edge: EDGE, ops: jaw }, { material: "printed_accent" });
    A.revolute("claw", "forearm", "claw_jaw", Tg, keys.grip, -0.6, 0.35);
    tcp = { link: "forearm", at: [(-L2 - 40) / 1000, 0.022, (zG + PLATE / 2) / 1000] };
  }
  const reach = (L1 + L2 + (gripper ? 40 : 10)) / 1000;
  return { spec: A.spec, A, reach, tcp };
}

/** The console: Uno and PCA9685 on standoffs at their real hole patterns, USB and power at the rear, leads out at the front and up by the turntable. */
function console_(A: Assembly, req: ArduinoArmRequest, supplyA: number): Harness {
  const H = new Harness(A), board = req.board ?? "arduino_uno_clone", uno = board === "arduino_uno_clone" || board === "arduino_uno_r3", { L, Wd, H: CH, floor, x1 } = CON;
  const drv = req.servoDriver ?? "pca9685_clone", batt = req.supply && part(req.supply).category === "battery" ? req.supply : undefined;
  const Tb = uno ? translation([7.5, 2, 5]) : translation([7.5, 18, 13]);
  const exits: ExitSpec[] = [
    { id: "usb", face: "x-", u: uno ? 2 + 38.1 : 18 + 9, v: 5 + (uno ? 7 : 3), kind: "usb", w: 14, h: 13 },
    batt ? { id: "power_in", face: "x-", u: 61, v: CH / 2, kind: "grommet", d: 8, noAnchor: true } : supplyA === 4 ? { id: "power_in", face: "x-", u: 61, v: CH / 2, kind: "jack", d: 8, part: { name: "power_jack", key: "dc_jack_5521_panel", use: "adapter socket" } } : { id: "power_in", face: "x-", u: 61, v: CH / 2, kind: "grommet", d: 8, noAnchor: true },
    // the switch in the side wall by the rear corner: nothing stands behind it there, its leads turn over the Uno
    // (its bezel 0.2 mm proud of the wall's face: flush, the two meshes share a face and read as touching)
    { id: "switch", face: "y+", u: 12, v: CH / 2, kind: "switch", w: 19.4, h: 13.4, part: { name: "main_switch", key: "switch_kcd1", use: "servo power switch", Tpanel: panelPose([12, Wd + 0.2, CH / 2], [0, 1, 0], 2.4) } },
    // the yaw servo's lead leaves its cradle by the slot low in the cradle's +y wall: the grommet faces past that wall, far
    // enough to the side for the lead to turn into the slot
    { id: "yaw_lead", face: "x+", u: Wd / 2 + 32, v: 22, kind: "grommet", d: 6.5 },
    { id: "arm_leads", face: "lid", u: L - 9, v: Wd / 2, kind: "grommet", d: 8 },
  ];
  bay(A, { name: "console", parent: "base_link", T: translation([x1 - L, -Wd / 2, BASE_T + floor]), size: [L, Wd, CH], cad: true, corner: 5, material: "printed_dark", lidMaterial: "printed_accent",
    parts: [{ name: "controller", key: board, T: Tb, use: drv === "direct" ? "controller (USB serial commands, drives the servos from its pins)" : "controller (USB serial commands, I2C to the servo driver)", kind: uno ? "board" : "board" },
      ...(drv === "direct" ? [] : [{ name: "servo_driver", key: drv, T: translation([24, 62, 5]), use: "16-channel PWM servo driver (I2C)" }])],
    exits, vents: [req.servoCounts ? { face: "lid", a0: 10, a1: L - 20, b0: 8, b1: Wd - 8 } : { face: "lid", a0: 14, a1: 70, b0: 58, b1: Wd - 8 }] }, H);
  if (batt) {
    H.part("battery", batt, { off_board: true, note: "battery beside the arm on the desk, its leads into the console" }); A.buy(batt, 1, "servo battery");
    if (electrical(batt)!.voltage_v.v.max > 6.3) { H.part("servo_regulator", "buck_lm2596", { off_board: true, note: "LM2596 set to 5.0 V, taped to the battery" }); A.buy("buck_lm2596", 1, "5 V servo regulator"); }
  } else if (supplyA === 4) { H.part("power_supply", "psu_5v4a_adapter", { off_board: true, note: "wall adapter, plugs into the console" }); A.buy("psu_5v4a_adapter", 1, "5 V 4 A servo supply"); }
  else supplyBox(A, H, { parent: "base_link", T: translation([-322, -45, 2.4]), key: "psu_5v_lrs50", use: "5 V 10 A servo supply", cad: true });
  return H;
}
/** The netlist: adapter to jack, switch, the driver's V+ terminal, one PCA channel per servo, I2C and logic from the Uno. */
function wireArm(H: Harness, supplyA: number, gripper: boolean, req: ArduinoArmRequest = {}): FirmwareRecord {
  const names = ["yaw_servo", "shoulder_servo", "elbow_servo", ...(gripper ? ["claw_servo"] : [])];
  const board = req.board ?? "arduino_uno_clone", uno = board === "arduino_uno_clone", bp = boardProfile(board), batt = req.supply && part(req.supply).category === "battery" ? req.supply : undefined;
  const fw: FirmwareRecord = { board, fqbn: bp.fqbn, language: bp.language, mission: "arm", sensors: {}, servos: {}, notes: [] };
  if (batt || req.servoDriver === "direct" || req.servoCounts) return wirePartsArm(H, names, req, bp, fw, batt);
  if (supplyA === 4) H.bought("power_supply.dc_out.@power", "power_jack.plug_side.+", "barrel", 0.5, 4, "ADAPTER");
  H.spare("controller.janalog.VIN", "controller.power_jack");
  H.mainPower("V_SERVO", { ...(supplyA === 4 ? { source: "power_jack", pos: "CENTRE", neg: "SLEEVE" } : { source: "power_supply", pos: "DC OUTPUT +V", neg: "DC OUTPUT -V" }), sw: "main_switch", fuse: false, volts: 5, cont: supplyA, peakLimit: supplyA === 4 ? 4 : 11, simNote: "every servo stalled at once" });
  H.feed("V_SERVO", "servo_driver", { v: "v_plus.V+", g: "v_plus.GND", typ: 0.01, peak: 0.01 });
  names.forEach((s, ch) => {
    const r = H.rec(s).current_a.v, d = H.rails.get("V_SERVO")!.feeds[0];
    d.typ += r.typical; d.peak += r.peak;
    H.net(`SERVO${ch}_PWM`, "signal"); H.net(`SERVO${ch}_V`, "power", 5);
    H.wire(`SERVO${ch}_PWM`, `servo_driver.ch${ch}.PWM${ch}`, `${s}.@pwm`); H.wire(`SERVO${ch}_V`, `servo_driver.ch${ch}.V+`, `${s}.@power`, { typ: r.typical, peak: r.peak }); H.wire("GND", `servo_driver.ch${ch}.GND`, `${s}.@ground`, { typ: r.typical, peak: r.peak });
    H.label(`servo_driver~${s}`.split("~").sort().join("~"), `PCA9685 channel ${ch} to ${s}`);
    fw.servos[s.replace(/_servo$/, "")] = { pin: `PCA9685 ch${ch}`, channel: ch, key: H.instances.get(s)!.key, centre_deg: 90, range_deg: [0, 180] };
  });
  H.net("5V_LOGIC", "power", 5);
  // the logic supply and ground from the power header (a bare GND would name the DC jack's)
  H.wire("5V_LOGIC", uno ? "controller.janalog.5V" : "controller.5V", "servo_driver.control_in.VCC", { typ: 0.01 }); H.wire("GND", uno ? "controller.janalog.GND" : "controller.GND", "servo_driver.control_in.GND", { typ: 0.01 });
  H.signals("controller", "servo_driver", [["SDA", "SDA", "I2C_SDA"], ["SCL", "SCL", "I2C_SCL"]]);
  H.notes.push("The Uno runs from its USB cable (it takes serial commands from the PC), the servos from the adapter; the two grounds join at the I2C lead.");
  fw.servo_driver = { key: "pca9685_clone", sda: "A4", scl: "A5", address: "0x40" };
  return fw;
}
/**
 * Parts mode: the servos on a battery from the parts list (through an LM2596 when it is above 6 V) and/or straight off the
 * board's pins. The sketch moves one joint at a time, so the battery sees at most two servos stalled together.
 */
function wirePartsArm(H: Harness, names: string[], req: ArduinoArmRequest, bp: ReturnType<typeof boardProfile>, fw: FirmwareRecord, batt?: string): FirmwareRecord {
  const direct = req.servoDriver === "direct", pins = new PinPlan(bp, true);
  H.spare("controller.janalog.VIN", "controller.power_jack", "controller.j2_analog_side.VIN", "controller.header_left.VIN", "controller.jpower.VIN");
  if (batt) {
    const reg = H.instances.has("servo_regulator"), b = electrical(batt)!;
    H.mainPower(reg ? "VBAT" : "V_SERVO", { source: "battery", pos: "@power", neg: "@ground", sw: "main_switch", fuse: b.current_a.v.peak > 5, simultaneous: 2, simNote: "two servos stalled at once (the sketch moves one joint at a time)" });
    if (reg) H.regulator("servo_regulator", "VBAT", "V_SERVO", { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-", volts: 5, simultaneous: 2, simNote: "two servos stalled at once (the sketch moves one joint at a time)" });
  } else {
    H.scan();
    if (H.instances.has("power_jack")) { H.bought("power_supply.dc_out.@power", "power_jack.plug_side.+", "barrel", 0.5, 4, "ADAPTER"); H.mainPower("V_SERVO", { source: "power_jack", pos: "CENTRE", neg: "SLEEVE", sw: "main_switch", fuse: false, volts: 5, cont: 4, peakLimit: 4, simNote: "every servo stalled at once" }); }
    else H.mainPower("V_SERVO", { source: "power_supply", pos: "DC OUTPUT +V", neg: "DC OUTPUT -V", sw: "main_switch", fuse: false, volts: 5, cont: 10, peakLimit: 11, simNote: "every servo stalled at once" });
  }
  if (!direct) {
    H.feed("V_SERVO", "servo_driver", { v: "v_plus.V+", g: "v_plus.GND", typ: 0.01, peak: 0.01 });
    H.net("5V_LOGIC", "power", bp.io);
    H.wire("5V_LOGIC", `controller.${bp.logicPin}`, "servo_driver.control_in.VCC", { typ: 0.01 }); H.wire("GND", `controller.${bp.gnd}`, "servo_driver.control_in.GND", { typ: 0.01 });
    const [sda, scl] = pins.i2c();
    H.signals("controller", "servo_driver", [[sda, "SDA", "I2C_SDA"], [scl, "SCL", "I2C_SCL"]]);
    fw.servo_driver = { key: H.instances.get("servo_driver")!.key, sda, scl, address: "0x40" };
  }
  names.forEach((s, ch) => {
    const r = H.rec(s).current_a.v, key = H.instances.get(s)!.key, joint = s.replace(/_servo$/, "");
    if (direct) {
      H.feed("V_SERVO", s, { v: "@power", g: "@ground" });
      const p = pins.servo(); H.signals("controller", s, [[p, "@pwm"]]);
      fw.servos[joint] = { pin: p, key, centre_deg: 90, range_deg: [0, 180] };
    } else {
      const d = H.rails.get("V_SERVO")!.feeds.find((f) => f.inst === "servo_driver")!; d.typ += r.typical; d.peak += r.peak;
      H.net(`SERVO${ch}_PWM`, "signal"); H.net(`SERVO${ch}_V`, "power", 5);
      H.wire(`SERVO${ch}_PWM`, `servo_driver.ch${ch}.PWM${ch}`, `${s}.@pwm`); H.wire(`SERVO${ch}_V`, `servo_driver.ch${ch}.V+`, `${s}.@power`, { typ: r.typical, peak: r.peak }); H.wire("GND", `servo_driver.ch${ch}.GND`, `${s}.@ground`, { typ: r.typical, peak: r.peak });
      fw.servos[joint] = { pin: `PCA9685 ch${ch}`, channel: ch, key, centre_deg: 90, range_deg: [0, 180] };
    }
  });
  // the board runs from its USB cable; its ground joins the servo ground
  if (direct) { H.wire("GND", `controller.${bp.gnd}`, `${names[0]}.@ground`, { typ: 0.01 }); }
  H.notes.push(`The ${part(fw.board).name.split(" (")[0]} runs from its USB cable (serial commands from the PC); the servos from ${batt ? part(batt).name.split(" (")[0] : "the supply"}${direct ? ", their signal wires straight to the board's pins" : ""}. Grounds are joined.`);
  return fw;
}

/** Desk arm on hobby servos. With `lengths` omitted the longest links (10 mm steps) that pass every check are used. */
export function designArduinoArm(req: ArduinoArmRequest = {}): RobotSpecification {
  const pool = req.servos ?? ["hobby_sg90"], payload = req.payloadKg ?? 0.02;
  const pick = (needNm: number) => pool.find((k) => rating(k).rated_nm >= needNm && rating(k).peak_nm >= needNm * DYNAMIC_FACTOR) ?? pool[pool.length - 1];
  // parts mode: as many of each servo as the list has; the shoulder and elbow choose first (they carry the load)
  const counted = (need: Record<string, number>) => {
    const left = { ...req.servoCounts! }, take = (k: string) => { left[k]--; return k; };
    const holds = (k: string, n: number) => rating(k).rated_nm >= n && rating(k).peak_nm >= n * DYNAMIC_FACTOR;
    const avail = () => pool.filter((k) => (left[k] ?? 0) > 0);
    const strongest = () => [...avail()].sort((a, b) => rating(b).rated_nm - rating(a).rated_nm)[0] ?? pool[pool.length - 1];
    const sh = take(avail().find((k) => holds(k, need.shoulder ?? 0)) ?? strongest()), el = take(avail().find((k) => holds(k, need.elbow ?? 0)) ?? strongest());
    const yaw = take(avail()[0] ?? sh), grip = avail()[0] ?? yaw;
    return { yaw, shoulder: sh, elbow: el, grip };
  };
  const tries: [number, number][] = req.lengths ? [req.lengths] : [];
  if (!req.lengths) for (let L = 120; L >= 50; L -= 10) tries.push([L, L]);
  let best: { b: Built; worst: Record<string, number>; keys: Record<string, string>; ok: boolean } | undefined;
  for (const [L1, L2] of tries) {
    // size joint by joint: start from the weakest servo, grow where the load needs it (a bigger servo is heavier: repeat)
    let keys = req.servoCounts ? counted({}) : { yaw: pool[0], shoulder: pool[0], elbow: pool[0], grip: pool[0] };
    let b = build(req, keys, L1, L2), worst: Record<string, number> = {};
    for (let it = 0; it < 4; it++) {
      const loads: PointLoad[] = [{ link: b.tcp.link, at: b.tcp.at, massKg: payload }];
      worst = {};
      // stretched out forwards and sideways at every shoulder / elbow combination that matters
      for (const sh of [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]) for (const el of [0, Math.PI / 2, -Math.PI / 2]) {
        for (const [k, v] of Object.entries(gravityTorques(b.spec, { shoulder: sh, elbow: el }, loads))) worst[k] = Math.max(worst[k] ?? 0, Math.abs(v));
      }
      const next = req.servoCounts ? counted(worst) : { yaw: keys.yaw, shoulder: pick(worst.shoulder ?? 0), elbow: pick(worst.elbow ?? 0), grip: keys.grip };
      if (next.shoulder === keys.shoulder && next.elbow === keys.elbow && next.yaw === keys.yaw && next.grip === keys.grip) break;
      keys = next; b = build(req, keys, L1, L2);
    }
    const ok = (["shoulder", "elbow"] as const).every((j) => rating(keys[j]).rated_nm >= (worst[j] ?? 0) && rating(keys[j]).peak_nm >= (worst[j] ?? 0) * DYNAMIC_FACTOR);
    best = { b, worst, keys, ok };
    if (ok) break;
  }
  const { b, worst, keys } = best!, A = b.A;

  // electronics: Arduino + PCA9685 in the console behind the yaw servo; servos on their own 5 V rail
  const servos = Object.values(keys).slice(0, req.gripper === false ? 3 : 4);
  const stall = servos.reduce((s, k) => s + electrical(k)!.current_a.v.peak, 0), supplyA = stall <= 4 ? 4 : 10;
  const batt = req.supply && part(req.supply).category === "battery" ? req.supply : undefined;
  const H = console_(A, req, supplyA);

  // joint ranges from the geometry (nothing may collide through the range), then the checks
  // the claw too: closed past a few degrees its moving jaw swings into the fixed jaw's bridge (found by scripts/check_motion.py)
  limitsFromGeometry(A, ["yaw", "shoulder", "elbow", ...(req.gripper !== false ? ["claw"] : [])], [{ shoulder: -1.2, elbow: 1.5 }, { shoulder: 1.2, elbow: -1.5 }]);
  // joint speed limits: the speed each servo reaches carrying its load (not its no-load speed)
  const inertia = axisInertias(A.spec, { shoulder: 0, elbow: 0 }, [{ link: b.tcp.link, at: b.tcp.at, massKg: payload }]);
  for (const j of ["shoulder", "elbow"] as const) {
    const v = loadedSpeed(keys[j], worst[j] ?? 0, inertia[j] ?? 0), jt = A.spec.joints.find((x) => x.name === j)!;
    jt.limit!.velocity = +Math.max(v, 0.05).toFixed(3);
    A.check(`speed:${j}`, v >= MIN_SPEED, `${v.toFixed(2)} rad/s carrying the arm and payload (needs >= ${MIN_SPEED} rad/s)`);
  }
  for (const j of ["shoulder", "elbow"] as const) {
    const k = keys[j], r = rating(k), w = worst[j] ?? 0;
    A.design.joints.push({ joint: j, actuator: k, required_nm: +(w * DYNAMIC_FACTOR).toFixed(4), rated_nm: r.rated_nm, peak_nm: r.peak_nm, margin: +(r.peak_nm / Math.max(w * DYNAMIC_FACTOR, 1e-6)).toFixed(2), speed_rad_s: r.speed_rad_s, note: `worst static ${w.toFixed(4)} N·m, arm stretched with ${payload} kg` });
    A.check(`torque:${j}`, r.rated_nm >= w && r.peak_nm >= w * DYNAMIC_FACTOR, `holds ${w.toFixed(4)} N·m continuously (rated ${r.rated_nm}), peaks ${(w * DYNAMIC_FACTOR).toFixed(4)} N·m (stall ${r.peak_nm}) — ${part(k).name.split(" (")[0]}`);
  }
  if (batt) {
    // two servos stalled at most (the sketch moves one joint at a time); AA cells sag under that current
    const b = electrical(batt)!, bs = part(batt).specs, two = [...servos].map((k) => electrical(k)!.current_a.v.peak).sort((a, b) => b - a).slice(0, 2).reduce((a, x) => a + x, 0);
    const rInt = Number(bs.internal_resistance_ohm ?? (bs.internal_resistance_ohm_per_cell ? Number(bs.internal_resistance_ohm_per_cell) * Number(bs.cells ?? 1) : 0.05));
    const sag = b.voltage_v.v.nom - two * rInt, reg = b.voltage_v.v.max > 6.3, vmin = Math.min(...servos.map((k) => electrical(k)!.voltage_v.v.min));
    A.check("power:supply", two <= b.current_a.v.peak && (reg ? sag >= 6.5 : sag >= vmin * 0.95), `two servos stalled at once (the sketch moves one joint at a time) draw ${two.toFixed(2)} A: the ${part(batt).name.split(" (")[0]} gives ${b.current_a.v.peak} A peak and sags to ${sag.toFixed(2)} V${reg ? " ahead of the LM2596 (needs 6.5 V)" : ` at the servos (they need ${vmin} V)`}; all ${servos.length} stalled would be ${stall.toFixed(1)} A`);
  } else A.check("power:supply", stall <= supplyA, `all ${servos.length} servos stalled together draw ${stall.toFixed(1)} A of the ${supplyA} A 5 V supply`);
  A.fastener("M2 self-tapping (servo tabs, from the servo kits)", 2 * servos.length);
  A.fastener("M4 screws or desk clamps (base)", 4);
  const fw = wireArm(H, supplyA, req.gripper !== false, req);
  // parts-mode designs carry their pin plan for the sketch (the stock arm's record stays as it was)
  if (req.servoCounts || req.supply || req.servoDriver) (A.design as { firmware?: FirmwareRecord }).firmware = fw;
  finishWiring(H);
  enclosureChecks(A);
  const bom = A.bom();
  bom.cost_usd = +(bom.cost_usd + (A.design.wiring?.cost_usd ?? 0)).toFixed(2);
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `$${bom.cost_usd.toFixed(2)} of parts vs $${req.budget} budget`);
  const m = totalMass(A.spec);
  A.design.performance = { reach_m: +b.reach.toFixed(3), payload_kg: payload, mass_kg: +m.toFixed(3), cost_usd: bom.cost_usd, dof: 3, gripper: req.gripper !== false ? "one-servo claw" : "none",
    servos: [...new Set(servos.map((k) => part(k).name.split(" (")[0]))].join(" / ") };
  A.design.tcp = { link: b.tcp.link, xyz: b.tcp.at };
  A.design.home = { shoulder: 0.6, elbow: 1.2 };
  A.design.assumptions.push("each joint runs on its servo's own output bearing (no extra bearings), as in MeArm-class kits: links are kept short so the servo holds them continuously",
    "prices are typical single-unit marketplace prices and vary by seller");
  A.design.request = { ...req } as Record<string, unknown>;
  return A.finish(`Arduino desk arm: 3 DOF${req.gripper !== false ? " + claw" : ""}, ${Math.round(b.reach * 1000)} mm reach, ${payload * 1000} g payload, ${m.toFixed(2)} kg, $${bom.cost_usd.toFixed(0)} of parts`);
}
