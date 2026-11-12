// A car built from the parts someone already has: the Arduino car's chassis (TT gear motors in printed brackets under a
// filleted plate, 65 mm wheels, a ball caster on 2WD) with the electronics compartment laid out for the exact board,
// motor driver, battery and sensors on the list. The deck grows to fit them; every pin is assigned from the board's real
// header, and the checks use those parts' own figures (the L298N's 2 V bridge drop, AA cells sagging under load).
//
// Missions: obstacle (an HC-SR04 or VL53L0X looking ahead, on a scanning servo when there is one), line (an IR line
// sensor under the nose; an ultrasonic too stops it at obstacles), camera (a Raspberry Pi or ESP32-CAM with its camera
// on the nose bracket). Bluetooth, an IMU and a buzzer ride in the compartment when they are on the list.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, electrical, type Vec3 } from "@ttr/parts";
import { frame, mul, translation, type Mat4 } from "@ttr/solid";
import type { Op } from "@ttr/kernel";
import { Assembly } from "../assembly.ts";
import { totalMass } from "../kin.ts";
import { withSolids, interferences } from "../clearance.ts";
import { bay, enclosureChecks, exposed, type BayPart, type ExitSpec } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { motorT } from "./arduino-car.ts";
import { boardProfile, PinPlan, driverProfile, regulatorFor, type FirmwareRecord } from "./parts-pins.ts";

export type CarMission = "obstacle" | "line" | "camera";
export interface PartsCarRequest {
  name?: string; prompt?: string; budget?: number;
  mission?: CarMission;
  wheels?: 2 | 4;
  /** catalog keys (defaults: the Arduino car's Nano clone, TB6612FNG, 2S 18650 pack) */
  board?: string; driver?: string; battery?: string;
  /** forward range sensor: hc_sr04 or vl53l0x_breakout; null for none */
  range?: string | null;
  /** a servo turning the range sensor (scanning head) */
  scanServo?: string | null;
  /** IR line sensor under the nose: line_sensor_3ch, or tcrt5000_module (two of them) */
  line?: string | null;
  /** IR obstacle sensors (two FC-51 at the front corners) */
  irObstacle?: boolean;
  camera?: string | null;
  /** extra modules in the compartment: hc05_bluetooth, mpu6050_gy521, buzzer_active_5v */
  extras?: string[];
  payloadKg?: number;
}

const MOTOR = "tt_gearmotor_1to48", WHEEL = "wheel_65mm_tt", BALL = "steel_ball_12_7mm", BB = "breadboard_400", BUCK = "buck_lm2596";
export const CY_BAY = 47;
const R = 32.5, ZC = R, ZP = ZC + 11.25 + 0.2, T = 4, ZT = ZP + T, YF = 56, CY = 47;
const DRIVE = { accel: 0.5, crr: 0.03, speedFactor: 0.8, usableEnergy: 0.8 };
const bbox = (k: string) => part(k).bbox_mm!;
const dims = (k: string) => { const b = bbox(k); return { x: b.max[0] - b.min[0], y: b.max[1] - b.min[1], z: b.max[2] - b.min[2] }; };
const hasHoles = (k: string) => part(k).holes.some((h) => h.axis[2] < -0.5);
/** a board that plugs into a breadboard (pins below, no screw holes) */
const plugIn = (k: string) => bbox(k).min[2] < -3 && !hasHoles(k);
const rotZ90 = (x: number, y: number, z: number): Mat4 => [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, x, y, z, 1];

export interface Item { name: string; key: string; use: string; kind: "battery" | "board" | "plain"; L: number; W: number; H: number; rot: boolean; standoff: number; carried?: { name: string; key: string; use: string; at: [number, number] }[]; }

/** A bay item, turned so its long side runs along the car unless that makes it too wide. */
export function item(name: string, key: string, use: string, kind: Item["kind"], standoff = 0): Item {
  // the long side along the car (room for the switch and cable runs beside it), unless it is too wide across
  const d = dims(key), rot = d.y > d.x ? d.x <= 84 : d.y > 84;
  const along = rot ? d.y : d.x, across = rot ? d.x : d.y;
  // a module with header pins under it stands on its pins in female jumper housings, not on standoffs
  if (kind === "board" && bbox(key).min[2] < -3) { kind = "plain"; standoff = 0; }
  const top = kind === "board" ? bbox(key).max[2] + standoff : d.z + standoff;
  return { name, key, use, kind, L: along, W: across, H: top, rot, standoff };
}

/**
 * Columns along the car, items side by side across it where they fit (first fit). Every column's items sit against the
 * right-hand (y-) wall, leaving the left side free for the main switch. Returns x offsets per column.
 */
export function pack(items: Item[], gap = 7): { cols: { x0: number; L: number; W: number; items: { it: Item; y0: number }[] }[]; length: number } {
  const cols: { x0: number; L: number; items: { it: Item; y0: number }[]; W: number }[] = [];
  for (const it of items) {
    const c = cols.find((c) => c.W + gap + it.W <= 82 && it.L <= c.L + 30 && (it.L >= c.L - 30 || it.W < 30));
    if (c) { c.items.push({ it, y0: c.W + gap }); c.W += gap + it.W; c.L = Math.max(c.L, it.L); }
    else cols.push({ x0: 0, L: it.L, items: [{ it, y0: 0 }], W: it.W });
  }
  let x = 0;
  for (const c of cols) { c.x0 = x; x += c.L + gap; for (const e of c.items) e.y0 += -CY + 6; }
  return { cols, length: x - gap };
}

/** The main switch goes in the y+ wall beside the emptiest column: make one if none has 25 mm free. */
export function roomForSwitch(P: ReturnType<typeof pack>) {
  if (P.cols.some((c) => 2 * CY - 6 - c.W >= 26)) return;
  P.cols.unshift({ x0: 0, L: 18, W: 0, items: [] }); let x = 0; for (const c of P.cols) { c.x0 = x; x += c.L + 7; } P.length = x - 7;
}
export const switchColumn = (P: ReturnType<typeof pack>) => [...P.cols].sort((a, b) => a.W - b.W)[0];
/** Each item either way round: the turns that give the shortest compartment (items are turned in place). */
export function packBest(items: Item[]) {
  const turnable = items.filter((i) => { const d = dims(i.key); return d.x <= 84 && d.y <= 84 && Math.abs(d.x - d.y) > 3; });
  const flip = (i: Item) => { i.rot = !i.rot; [i.L, i.W] = [i.W, i.L]; };
  const n = Math.min(turnable.length, 7);
  let bestMask = 0, best = pack(items).length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const sel = turnable.filter((_, k) => mask & (1 << k));
    sel.forEach(flip); const len = pack(items).length; sel.forEach(flip);
    if (len < best - 0.5) { best = len; bestMask = mask; }
  }
  turnable.filter((_, k) => bestMask & (1 << k)).forEach(flip);
  return pack(items);
}

/** Everything that decides the deck: the parts in the compartment, their packing and the chassis length. */
function layout(req: PartsCarRequest) {
  const mission = req.mission ?? "obstacle", four = req.wheels === 4;
  const board = req.board ?? "arduino_nano_clone", driver = req.driver ?? "tb6612fng_module", battery = req.battery ?? "pack_2s_18650";
  const range = req.range === undefined ? (mission === "camera" ? null : "hc_sr04") : req.range;
  const scan = range && req.scanServo ? req.scanServo : null;
  const line = mission === "line" ? (req.line ?? "line_sensor_3ch") : req.line ?? null;
  const camera = req.camera ?? (mission === "camera" && /^rpi/.test(board) ? "rpi_camera_module_3" : null);
  const extras = (req.extras ?? []).filter((k) => ["hc05_bluetooth", "mpu6050_gy521", "buzzer_active_5v"].includes(k) && part(k));
  const bp = boardProfile(board), dp = driverProfile(driver);
  const drivers = four && dp.channels < 4 ? 2 : 1;
  const nMotors = four ? 4 : 2;

  // ---------------- what rides in the compartment, rear to front
  const pv = electrical(battery)!.voltage_v.v;
  // a regulated 5 V rail: boards that take only 5 V (Pi, ESP32 boards on 5 V pins) or a scan servo on a pack above 6 V
  const needs5v = bp.supply === "5v" && pv.max > 5.5;
  const servoMax = scan ? electrical(scan)!.voltage_v.v.max : Infinity;
  const servoBuck = !!scan && pv.max > servoMax * 1.05;
  const items: Item[] = [item("battery", battery, part(battery).name.split(":")[0], "battery")];
  // the 5 V regulator is sized to the board (a Raspberry Pi 5 peaks at 5 A) and what runs from it
  const e5 = electrical(board)!.current_a.v, reg5 = regulatorFor(e5.typical + 0.3, e5.peak + 0.3);
  if (needs5v) items.push(item("regulator_5v", reg5.key, `${reg5.label} (board and sensors)`, hasHoles(reg5.key) ? "board" : "plain", hasHoles(reg5.key) ? 4 : 0));
  if (servoBuck) items.push(item("servo_regulator", BUCK, "LM2596 set to 5.0 V for the scan servo", hasHoles(BUCK) ? "board" : "plain", hasHoles(BUCK) ? 4 : 0));
  // plug-in boards and drivers share a breadboard; boards with holes stand on printed standoffs
  // a plug-in board (Nano, ESP32 DevKit) sits on a breadboard with the plug-in drivers; beside a board with screw holes a
  // plug-in driver sits on its own header pins in female jumper housings, no breadboard
  if (plugIn(board)) {
    const it = item("breadboard", BB, "plug-in wiring for the board and driver (stuck to the deck by its adhesive back)", "plain");
    it.carried = [];
    if (plugIn(board)) it.carried.push({ name: "controller", key: board, use: "controller (runs the generated sketch)", at: [4, dims(board).y > 22 ? 27 : 31] });
    for (let i = 0; i < drivers; i++) if (plugIn(driver)) it.carried.push({ name: `motor_driver_${i + 1}`, key: driver, use: `${part(driver).name.split(" (")[0]} motor driver`, at: [4 + i * 24, 4] });
    // a long board leaves no room for a driver beside it on a half breadboard: the driver goes on the deck instead
    if (plugIn(board) && dims(board).x > 50) for (const c of it.carried.filter((c) => c.name.startsWith("motor_driver"))) { it.carried.splice(it.carried.indexOf(c), 1); items.push(item(c.name, c.key, c.use, "plain")); }
    items.push(it);
  }
  if (!plugIn(board)) items.push(item("controller", board, "controller (runs the generated sketch)", hasHoles(board) ? "board" : "plain", hasHoles(board) ? 5 : 0));
  for (let i = 0; i < drivers; i++) if (!plugIn(driver) || !plugIn(board)) items.push(item(`motor_driver_${i + 1}`, driver, `${part(driver).name.split(" (")[0]} motor driver`, hasHoles(driver) && !plugIn(driver) ? "board" : "plain", hasHoles(driver) && !plugIn(driver) ? 5 : 0));
  for (const k of extras) items.push(item(k.replace(/_.*/, "") === "hc05" ? "bluetooth" : k.startsWith("mpu") ? "imu" : "buzzer", k, part(k).name.split(" (")[0], hasHoles(k) ? "board" : "plain", hasHoles(k) ? 4 : 0));
  const P = packBest(items);
  roomForSwitch(P);

  // ---------------- chassis: the deck grows to hold the compartment
  const axles: { xa: number; can: 1 | -1 }[] = four ? [{ xa: 66, can: -1 }, { xa: -66, can: 1 }] : [{ xa: 0, can: -1 }];
  const x0 = four ? -100 : -74, bx = x0 + 9;
  const lineGap = line ? 14 : 0;
  // the front bracket's footprint: 19.4 mm for a fixed sensor, the servo cradle behind it for a scanning one
  const front = scan ? 45 : 19.4;
  const x1 = Math.max(four ? 100 : 90, Math.ceil(bx + P.length + 2 * 1.6 + front)) + lineGap, xe = x1 - front - lineGap, CL = xe - bx, xc = 60;
  return { reg5, mission, four, board, driver, battery, range, scan, line, camera, extras, bp, dp, drivers, nMotors, pv, needs5v, servoBuck, items, P, axles, x0, bx, lineGap, front, x1, xe, CL, xc };
}
/** Length of the car's chassis plate for a request (mm), without designing it: the printer bed takes 250 mm. */
export const partsCarLength = (req: PartsCarRequest) => { const l = layout(req); return l.x1 - l.x0; };

export function designPartsCar(req: PartsCarRequest = {}): RobotSpecification {
  const { reg5, mission, four, board, driver, battery, range, scan, line, camera, extras, bp, dp, drivers, nMotors, needs5v, servoBuck, items, P, axles, x0, bx, lineGap, x1, xe, CL, xc } = layout(req);
  const A = new Assembly(req.name ?? "parts_car", "parts_car", req.prompt);
  const ops: Op[] = [{ op: "box", min: [x0, -YF, ZP], max: [x1, YF, ZT], r: 10 }];
  for (const { xa, can } of axles) for (const side of [1, -1] as const) ops.push(...bracketOps(xa, side, can));
  const leadXs = four ? [-5, 5] : [axles[0].xa + axles[0].can * 61];
  for (const x of leadXs) for (const y of [44.5, -44.5]) ops.push({ op: "hole", a: [x, y, ZP - 1], b: [x, y, ZT + 1], d: 5 });
  const rb = Number(part(BALL).specs.ball_d_mm) / 2;
  if (!four) {
    ops.push({ op: "rod", a: [xc, 0, rb - 2.35], b: [xc, 0, ZP + 0.5], r: rb + 4.2 });
    ops.push({ op: "sphere", c: [xc, 0, rb], r: rb + 0.2, cut: true });
    ops.push({ op: "hole", a: [xc, 0, -1], b: [xc, 0, rb], d: 2 * (rb - 0.45) });
  }
  // boards on standoffs need a floor to stand on (standoffs on an open frame would be loose pieces): a tub then sits on the deck
  const FLOOR = 2.4;
  const zf = ZT, stackTop = Math.max(...items.map((i) => i.H + (i.carried ? 8.5 + Math.max(...i.carried.map((c) => bbox(c.key).max[2])) : 0)));
  const CH = Math.max(26, Math.ceil(stackTop + 8));
  // front bracket screws, line sensor bracket and its lead hole
  for (const y of [-20, 20]) ops.push({ op: "hole", a: [x1 - lineGap - 7, y, ZP - 1], b: [x1 - lineGap - 7, y, ZT + 1], d: 3.2 });
  const lineX = x1 - 8;
  if (line) ops.push({ op: "hole", a: [xe - 8, 0, ZP - 1], b: [xe - 8, 0, ZT + 1], d: 6 });
  // battery screws through the deck (pack holes), as on the Arduino car
  const colOf = (n: string) => P.cols.find((c) => c.items.some((e) => e.it.name === n))!;
  const posOf = (n: string) => { const c = colOf(n), e = c.items.find((x) => x.it.name === n)!; return { x: bx + 1.6 + c.x0 + (c.L - e.it.L) / 2, y: e.y0 }; };
  const bpos = posOf("battery"), bi = items[0];
  const Tbat = placeT(bi, bpos.x - bx, bpos.y + CY, 0);
  for (const h of part(battery).holes) { const p = applyT(Tbat, h.pos); ops.push({ op: "hole", a: [bx + p[0], p[1] - CY, ZP - 1], b: [bx + p[0], p[1] - CY, ZT + 1], d: 3.2 }); }
  A.cadLink("chassis", { name: "chassis", edge: 0.8, ops }, { role: "base", material: "printed_dark" });

  // ---------------- drive
  const wheelJoints: string[] = [], motorNames: string[] = [];
  for (const { xa, can } of axles) for (const side of [1, -1] as const) {
    const tag = `${xa > 0 ? "front" : xa < 0 ? "rear" : "drive"}_${side > 0 ? "left" : "right"}`;
    A.mount("chassis", MOTOR, motorT(xa, side, can, YF, ZC), `${tag}_motor`, "drive motor");
    A.fastener("M3x25 socket head + nut (motor through-bolt)", 2);
    const Tw = mul(translation([xa, side * (YF + 1), ZC]), frame([0, 0, 0], [0, side, 0], [1, 0, 0]));
    A.mount("chassis", WHEEL, Tw, `${tag}_wheel`, "drive wheel");
    A.spec.joints.pop();
    A.continuous(`${tag}_wheel_joint`, "chassis", `${tag}_wheel`, Tw, MOTOR);
    wheelJoints.push(`${tag}_wheel_joint`); motorNames.push(`${tag}_motor`);
  }
  if (!four) {
    A.buy(BALL, 1, "caster ball (snaps into the printed socket)");
    A.continuous("caster_roll", "chassis", "caster_gimbal", translation([xc, 0, rb]), null, [1, 0, 0]);
    A.frameLink("caster_gimbal");
    A.continuous("caster_spin", "caster_gimbal", "caster_ball", translation([0, 0, 0]), null, [0, 1, 0]);
    A.spec.links.push({ name: "caster_ball", role: "caster", geometry: { type: "sphere", radius: rb / 1000 }, mass: part(BALL).mass_g / 1000, material: "metal", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] } });
  }

  // ---------------- compartment
  const H = new Harness(A);
  const W = (x: number, y: number) => [x - bx, y + CY] as const;
  const bayParts: BayPart[] = [];
  // parts that sit on a carrier by design: boards on the breadboard, sensors in their brackets, the pack on the deck
  const carried = new Set<string>(["battery", "main_switch", "ultrasonic", "camera", "ir_left", "ir_right", "line_sensor", "line_left", "line_right", "scan_servo"]);
  for (const it of items) {
    const p = posOf(it.name), Tb = placeT(it, p.x - bx, p.y + CY, it.standoff);
    bayParts.push({ name: it.name, key: it.key, T: Tb, use: it.use, kind: it.kind, ...(it.kind === "board" ? {} : { standoff: false }) });
    carried.add(it.name);
  }
  const ctrl = posOf(plugIn(board) ? "breadboard" : "controller"), ctrlIt = items.find((i) => i.name === (plugIn(board) ? "breadboard" : "controller"))!;
  const switchCol = switchColumn(P);
  const exits: ExitSpec[] = [
    ...leadXs.flatMap((x, i) => ([1, -1] as const).map((sd): ExitSpec => ({ id: `motor_leads_${i}_${sd > 0 ? "l" : "r"}`, face: "floor", u: W(x, 0)[0], v: W(0, sd * 44.5)[1], kind: "grommet", d: 5 }))),
    { id: "usb", face: "y-", u: ctrl.x - bx + ctrlIt.L / 2, v: Math.min(CH - 8, 8.5 + ctrlIt.standoff), kind: "usb", w: 14, h: 9 },
    { id: "switch", face: "y+", u: 1.6 + switchCol.x0 + Math.max(switchCol.L, 18) / 2, v: CH / 2, kind: "switch", w: 19.2, h: 13, part: { name: "main_switch", key: "switch_kcd1", use: "main power switch" } },
    ...(range || camera || req.irObstacle ? [{ id: "sensor", face: "x+", u: CY, v: CH - 6, kind: "grommet", d: 6.5, noAnchor: true } as ExitSpec] : []),
    ...(line ? [{ id: "line_leads", face: "floor", u: W(xe - 8, 0)[0], v: CY, kind: "grommet", d: 6 } as ExitSpec] : []),
  ];
  const rec = bay(A, { name: "electronics_bay", parent: "chassis", T: translation([bx, -CY, zf + FLOOR]), size: [CL, 2 * CY, CH], cad: true, corner: 5, floor: FLOOR, wall: 2, lidT: 2.2, material: "printed_dark", lidMaterial: "printed_accent",
    parts: bayParts, exits, vents: [{ face: "lid", a0: 8, a1: CL - 8, b0: 14, b1: 2 * CY - 14 }] }, H);
  A.fastener("M3x8 countersunk + nut (battery, through the deck)", part(battery).holes.length);
  const bbItem = items.find((i) => i.carried);
  for (const c of bbItem?.carried ?? []) { A.mount("breadboard", c.key, translation([c.at[0], c.at[1], 8.5]), c.name, c.use); H.bayOf.set(c.name, "electronics_bay"); rec.parts.push(c.name); carried.add(c.name); }

  // ---------------- front: range sensor (fixed or on a scan servo), camera, IR obstacle sensors; line sensor under the nose
  const xf = x1 - lineGap, zb = ZT + 6;
  const wall: Op[] = [{ op: "box", min: [xf - 16, -26, ZT], max: [xf, 26, ZT + 4], r: 4 }];
  for (const y of [-20, 20]) wall.push({ op: "hole", a: [xf - 7, y, ZT - 1], b: [xf - 7, y, ZT + 5], d: 3.2 });
  let wallTop = ZT + 4;
  if (range && !scan) {
    wall.push({ op: "box", min: [xf - 3, -26, ZT], max: [xf, 26, zb + 23], r: 0 }, { op: "box", min: [xf - 16, -26, ZT], max: [xf - 3, -23, zb + 12], r: 0 }, { op: "box", min: [xf - 16, 23, ZT], max: [xf - 3, 26, zb + 12], r: 0 });
    wallTop = zb + 23;
    if (range === "hc_sr04") {
      for (const x of [9.5, 35.5]) wall.push({ op: "hole", a: [xf - 5, -22.5 + x, zb + 10], b: [xf + 1, -22.5 + x, zb + 10], d: 16.5 });
      for (const h of part(range).holes) wall.push({ op: "hole", a: [xf - 4, -22.5 + h.pos[0], zb + h.pos[1]], b: [xf + 1, -22.5 + h.pos[0], zb + h.pos[1]], d: 1.6 });
    } else wall.push({ op: "hole", a: [xf - 5, 0, zb + 10], b: [xf + 1, 0, zb + 10], d: 8 });
  }
  if (camera) {
    // a mast at the front: the camera board on its four M2 holes, the lens through a 10 mm window
    const z0 = wallTop, cb = bbox(camera), cw = cb.max[0] - cb.min[0], chh = cb.max[1] - cb.min[1];
    wall.push({ op: "box", min: [xf - 3, -cw / 2 - 3, ZT], max: [xf, cw / 2 + 3, z0 + chh + 6], r: 0 }, { op: "box", min: [xf - 14, -cw / 2 - 3, ZT], max: [xf - 3, -cw / 2, z0 + chh * 0.5], r: 0 }, { op: "box", min: [xf - 14, cw / 2, ZT], max: [xf - 3, cw / 2 + 3, z0 + chh * 0.5], r: 0 });
    wall.push({ op: "hole", a: [xf - 5, 0, z0 + 3 + chh / 2], b: [xf + 1, 0, z0 + 3 + chh / 2], d: 10 });
    for (const h of part(camera).holes) wall.push({ op: "hole", a: [xf - 4, -cw / 2 + h.pos[0], z0 + 3 + h.pos[1]], b: [xf + 1, -cw / 2 + h.pos[0], z0 + 3 + h.pos[1]], d: 1.8 });
    wallTop = z0 + chh + 6;
  }
  const scanBase = scan ? scanCradle(scan, xf - 16, 0, ZT) : null;
  if (scanBase) wall.push(...scanBase.ops);
  if (req.irObstacle) for (const s of [1, -1]) {
    wall.push({ op: "box", min: [xf - 3, s > 0 ? 26 : -40, ZT], max: [xf, s > 0 ? 40 : -26, ZT + 20], r: 0 });
    wall.push({ op: "hole", a: [xf - 5, s * 33, ZT + 13], b: [xf + 1, s * 33, ZT + 13], d: 7 });
  }
  const needBracket = range || camera || req.irObstacle || scan;
  if (needBracket) {
    A.cadLink("sensor_bracket", { name: "sensor_bracket", edge: 0.6, ops: wall }, { material: "printed_accent" });
    A.fixed("sensor_bracket_mount", "chassis", "sensor_bracket", translation([0, 0, 0]));
    A.fastener("M3x10 + nut (sensor bracket)", 2);
  }
  if (range && !scan) {
    if (range === "hc_sr04") {
      A.mount("sensor_bracket", range, [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, xf - 4.6, -22.5, zb, 1], "ultrasonic", "HC-SR04 distance sensor");
      exposed(A, "ultrasonic", "transducers look out through two 16.5 mm windows in the printed bracket", [45, 20]);
      A.fastener("M2x6 self-tapping (sensor)", 4);
    } else {
      const d = dims(range);
      A.mount("sensor_bracket", range, [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, xf - 3 - 1.6 - 0.1, -d.x / 2, zb + 10 - d.y / 2, 1], "ultrasonic", `${part(range).name.split(" (")[0]} distance sensor`);
      exposed(A, "ultrasonic", "the sensor looks out through an 8 mm window in the printed bracket", [8, 8]);
    }
    A.spec.sensors.push({ name: "front_range", type: "range", parent: "ultrasonic", origin: { xyz: [0.0225, 0.01, 0.0136], rpy: [0, 0, 0] }, params: { range_m: range === "hc_sr04" ? 4 : 1.2, min_range_m: 0.02, beam_deg: range === "hc_sr04" ? 15 : 25 } });
  }
  if (scan && scanBase) {
    A.mount("sensor_bracket", scan, scanBase.T, "scan_servo", "scan servo (turns the distance sensor)");
    A.fastener("M2 self-tapping (servo tabs, from the servo kit)", 2);
    scanHead(A, "sensor_bracket", scan, scanBase.T, range!);
  }
  if (camera) {
    const cb = bbox(camera), cw = cb.max[0] - cb.min[0];
    const Tc: Mat4 = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, xf - 4.6 - (cb.max[2] - 1.6 > 3 ? 0 : 0), -cw / 2, (range && !scan ? zb + 23 : ZT + 4) + 3, 1];
    A.mount("sensor_bracket", camera, Tc, "camera", part(camera).name.split(" (")[0]);
    exposed(A, "camera", "the lens looks out through a 10 mm window in the camera mast", [10, 10]);
    A.spec.sensors.push({ name: "front_camera", type: "camera", parent: "camera", origin: { xyz: [cw / 2000, 0.012, 0.01], rpy: [0, 0, 0] }, params: { model: part(camera).name, fov_deg: 66 } });
    A.fastener("M2x6 self-tapping (camera)", 4);
  }
  if (req.irObstacle) for (const [s, n] of [[1, "ir_left"], [-1, "ir_right"]] as const) {
    const d = dims("ir_obstacle_fc51");
    A.mount("sensor_bracket", "ir_obstacle_fc51", [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, xf - 3 - 1.7, s * 33 - d.x / 2, ZT + 13 - d.y / 2, 1], n, "IR obstacle sensor");
    exposed(A, n, "emitter and receiver look out through a 7 mm window", [7, 7]);
  }
  const lineNames: string[] = [];
  if (line) {
    const n = line === "line_sensor_3ch" ? 1 : 2, d = dims(line);
    const zs = 10, lb: Op[] = [{ op: "box", min: [lineX - 9, -Math.max(30, d.y * n / 2 + 6), zs + d.z], max: [lineX + 4, Math.max(30, d.y * n / 2 + 6), ZP], r: 3 }];
    A.cadLink("line_bracket", { name: "line_bracket", edge: 0.6, ops: lb }, { material: "printed_accent" });
    A.fixed("line_bracket_mount", "chassis", "line_bracket", translation([0, 0, 0]));
    A.fastener("M3x10 self-tapping (line sensor bracket, from above)", 2);
    for (let i = 0; i < n; i++) {
      const name = n === 1 ? "line_sensor" : i === 0 ? "line_left" : "line_right";
      const y0 = n === 1 ? -d.y / 2 : i === 0 ? 4 : -4 - d.y;
      // board flipped: emitters face the floor, board x along the car
      const Tl: Mat4 = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, lineX - 8 - bbox(line).min[0], y0 + d.y + bbox(line).min[1], zs + d.z + bbox(line).min[2] * 0, 1];
      A.mount("line_bracket", line, Tl, name, "IR line sensor (looks at the floor)");
      exposed(A, name, "under the nose, emitters 10 mm above the floor", [d.x, d.y]);
      lineNames.push(name);
    }
    A.spec.sensors.push({ name: "line", type: "range", parent: lineNames[0], origin: { xyz: [0, 0, 0], rpy: [0, Math.PI / 2, 0] }, params: { range_m: 0.02, beam_deg: 20, model: part(line).name } });
  }

  // ---------------- harness and pins
  const pins = new PinPlan(bp, !!scan);
  const drive: NonNullable<FirmwareRecord["drive"]> = { driver: dp.key, motors: nMotors, drivers, pins: {} };
  const fw: FirmwareRecord = { board, fqbn: bp.fqbn, language: bp.language, mission, drive, sensors: {}, servos: {}, notes: [] };
  H.mainPower("VBAT", { source: "battery", pos: "@power", neg: "@ground", sw: "main_switch", simultaneous: 2, simNote: "two motors stalling at once, the rest running" });
  let logic: string;
  if (needs5v) {
    H.regulator("regulator_5v", "VBAT", "5V", { ...reg5.pins, volts: 5 });
    H.spare(...reg5.spare.map((x) => `regulator_5v.${x}`));
    H.feed("5V", "controller", { v: bp.vin5, g: bp.gnd });
    logic = bp.logicRail(H, "5V");
  } else logic = bp.powerFrom(H, "VBAT");
  // the 5 V parts (HC-SR04, HC-05) run from the regulated 5 V, the AVR's own 5 V, or a 5 V pack itself
  const fiveV = needs5v ? "5V" : bp.io === 5 ? logic : "VBAT";
  let firstPins: string[] = [];
  for (let i = 0; i < drivers; i++) {
    const d = `motor_driver_${i + 1}`;
    // a second driver takes the same control pins as the first: its channel A drives the other left wheel, B the other right
    const from = pins.log.length;
    if (i > 0) pins.replay = [...firstPins];
    drive.pins[d] = dp.wire(H, d, logic, pins, motorNames.slice(i * dp.channels, i * dp.channels + dp.channels));
    if (i === 0) firstPins = pins.log.slice(from);
  }
  if (range) {
    const sensorName = "ultrasonic";
    if (range === "hc_sr04") {
      H.feed(fiveV, sensorName, { v: "VCC", g: "GND" });
      const trig = pins.digital(), echo = pins.input();
      H.signals("controller", sensorName, [[trig, "TRIG"], [echo, "ECHO"]]);
      fw.sensors.ultrasonic = { kind: "hc_sr04", trig, echo };
      if (bp.io < 5) { fw.notes.push(`ECHO is a 5 V output: put a 1 k / 2 k divider between it and ${echo} (3.3 V input)`); A.design.assumptions.push(`a 1 kOhm + 2 kOhm divider on the HC-SR04 ECHO line keeps ${echo} at 3.3 V`); }
    } else {
      H.feed(logic, sensorName, { v: "VIN", g: "GND" });
      const [sda, scl] = pins.i2c();
      H.signals("controller", sensorName, [[sda, "SDA", "I2C_SDA"], [scl, "SCL", "I2C_SCL"]]);
      H.spare(`${sensorName}.header.XSHUT`, `${sensorName}.header.GPIO1`);
      fw.sensors.tof = { kind: "vl53l0x", sda, scl };
    }
  }
  if (scan) {
    const servoRail = servoBuck ? "5V_SERVO" : "VBAT";
    if (servoBuck) H.regulator("servo_regulator", "VBAT", "5V_SERVO", { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-", volts: 5 });
    H.feed(servoRail, "scan_servo", { v: "@power", g: "@ground" });
    const sp = pins.servo();
    H.signals("controller", "scan_servo", [[sp, "@pwm"]]);
    fw.servos.scan = { pin: sp, key: scan, centre_deg: 90, range_deg: [20, 160] };
  }
  if (camera && /^rpi_camera/.test(camera)) {
    H.bought(`camera.${bp.cameraPort ?? "csi_15"}.SCL`, `controller.${bp.csiPort ?? "csi"}.SCL`, "camera ribbon cable (in the camera box)", 0.25, 0.25, "CAMERA_CSI");
    // the camera board's own 15-pin socket takes the ribbon's other end; with a 22-pin board cable it is that cable's end
    if (bp.cameraPort) H.spare("camera.csi_15");
    fw.sensors.camera = { kind: "csi", port: bp.csiPort ?? "csi" };
  }
  if (board === "esp32_cam") fw.sensors.camera = { kind: "ov2640_onboard" };
  if (req.irObstacle) for (const n of ["ir_left", "ir_right"]) { H.feed(logic, n, { v: "VCC", g: "GND" }); const p = pins.input(); H.signals("controller", n, [[p, "OUT"]]); fw.sensors[n] = { kind: "digital", pin: p, active: "low" }; }
  if (line) {
    if (line === "line_sensor_3ch") {
      H.feed(logic, "line_sensor", { v: "VCC", g: "GND" });
      const l = pins.input(), c = pins.input(), r = pins.input();
      H.signals("controller", "line_sensor", [[l, "L"], [c, "C"], [r, "R"]]);
      fw.sensors.line = { kind: "line3", left: l, centre: c, right: r };
    } else {
      const got: string[] = [];
      for (const n of lineNames) { H.feed(logic, n, { v: "VCC", g: "GND" }); const p = pins.input(); H.signals("controller", n, [[p, "DO"]]); H.spare(`${n}.header.AO`); got.push(p); }
      fw.sensors.line = { kind: "line2", left: got[0], right: got[1] };
    }
  }
  for (const k of extras) {
    const n = k.startsWith("hc05") ? "bluetooth" : k.startsWith("mpu") ? "imu" : "buzzer";
    if (n === "bluetooth") {
      H.feed(fiveV, n, { v: "VCC", g: "GND" });
      const [rx, tx] = pins.uart();
      H.signals("controller", n, [[tx, "RXD"], [rx, "TXD"]]);
      H.spare(`${n}.header.STATE`, `${n}.header.EN`);
      fw.sensors.bluetooth = { kind: "hc05", board_rx: rx, board_tx: tx };
      if (bp.io === 5) { fw.notes.push(`HC-05 RXD takes 3.3 V: a 1 k / 2 k divider from ${tx}`); A.design.assumptions.push(`a 1 kOhm + 2 kOhm divider from ${tx} to the HC-05 RXD (3.3 V input)`); }
    } else if (n === "imu") {
      H.feed(logic, n, { v: "VCC", g: "GND" });
      const [sda, scl] = pins.i2c();
      H.signals("controller", n, [[sda, "SDA", "I2C_SDA"], [scl, "SCL", "I2C_SCL"]]);
      H.spare(`${n}.header.XDA`, `${n}.header.XCL`, `${n}.header.AD0`, `${n}.header.INT`);
      fw.sensors.imu = { kind: "mpu6050", sda, scl };
    } else {
      H.feed(logic, n, { v: "VCC", g: "GND" });
      const p = pins.digital(); H.signals("controller", n, [[p, "I/O"]]);
      fw.sensors.buzzer = { kind: "active_buzzer", pin: p };
    }
  }
  H.notes.push("Board to board wires are jumper wires; on the breadboard they run in the rows of the two pins. The cut list length is the most a jumper needs.");
  finishWiring(H);
  enclosureChecks(A);

  // ---------------- clearance at home
  const skip = new Set<string>();
  for (const j of A.spec.joints) if (j.type === "fixed" && carried.has(j.child)) skip.add(`${j.parent}|${j.child}`);
  const hits = withSolids(A.spec, (mdl) => interferences(mdl, {}, undefined, 2, skip));
  A.check("clearance:home", hits.length === 0, hits.length ? `intersecting: ${hits.map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`).join(", ")}` : "no printed part or component intersects another");

  // ---------------- engineering checks with these parts' own figures
  const m = totalMass(A.spec) + (req.payloadKg ?? 0), g = 9.81, r = R / 1000, rt = rating(MOTOR), mp = part(MOTOR).specs;
  const be = electrical(battery)!, bs = part(battery).specs;
  const rInt = Number(bs.internal_resistance_ohm ?? (bs.internal_resistance_ohm_per_cell ? Number(bs.internal_resistance_ohm_per_cell) * Number(bs.cells ?? 1) : 0.05));
  const run = nMotors * Number(mp.no_load_current_a ?? 0.15) * 2.2 + 0.15, stallA = 2 * Number(mp.stall_current_a);
  const vRun = be.voltage_v.v.nom - run * rInt, vStall = be.voltage_v.v.nom - stallA * rInt;
  const drop = dp.drop(run / nMotors);
  const vm = Math.min(Number(mp.voltage_v), vRun - drop), ratio = vm / Number(mp.voltage_v);
  A.check("power:motor_voltage", vm >= 3.0, `${part(battery).name.split(" (")[0]} gives ${vRun.toFixed(2)} V driving (${be.voltage_v.v.nom} V less ${(run * rInt).toFixed(2)} V sag at ${run.toFixed(2)} A), the ${dp.label} drops ${drop.toFixed(2)} V: ${vm.toFixed(2)} V reaches the motors (TT motors are rated 3-6 V)${vm < 4.5 ? "; under 4.5 V the car is slow and stalls on carpet" : ""}`);
  const vmax = rt.speed_rad_s * ratio * r * DRIVE.speedFactor;
  // the steepest ramp it climbs while still accelerating: rated for floors (2 deg) at least, 5 / 10 deg when it can
  const loss0 = (A.spec.joints.find((j) => j.name === wheelJoints[0])?.dynamics?.damping ?? 0) * (vmax / r), avail0 = rt.rated_nm * ratio;
  const climb = (deg: number) => (m * (g * Math.sin(deg * Math.PI / 180) + DRIVE.accel + DRIVE.crr * g) * r) / nMotors + loss0 <= avail0;
  let maxSlope = 0; for (let a = 1; a <= 20 && climb(a); a++) maxSlope = a;
  const slope = Math.max(2, Math.min(four ? 10 : 5, maxSlope));
  const F = m * (g * Math.sin(slope * Math.PI / 180) + DRIVE.accel + DRIVE.crr * g);
  const loss = (A.spec.joints.find((j) => j.name === wheelJoints[0])?.dynamics?.damping ?? 0) * (vmax / r);
  const perWheel = (F * r) / nMotors + loss, avail = rt.rated_nm * ratio;
  A.check("drive:torque", perWheel <= avail, `${m.toFixed(2)} kg on a ${slope} deg slope accelerating ${DRIVE.accel} m/s^2: ${perWheel.toFixed(4)} N·m per wheel vs ${avail.toFixed(4)} N·m continuous at ${vm.toFixed(1)} V (TT 1:48)`);
  A.check("drive:top_speed", vmax >= 0.25, `${vmax.toFixed(2)} m/s at ${vm.toFixed(1)} V on the motors (no-load ${rt.speed_rad_s} rad/s at 6 V x ${ratio.toFixed(2)} x r ${R} mm x ${DRIVE.speedFactor})`);
  const chMax = dp.peakA;
  A.check("power:driver_current", Number(mp.stall_current_a) <= chMax * 1.05, `one TT motor per ${dp.label} channel: stall ${mp.stall_current_a} A vs ${chMax} A channel peak (${dp.contA} A continuous)`);
  const ctrlMin = bp.minIn;
  if (needs5v || servoBuck) A.check("power:regulator_headroom", vRun >= 6.5, `the 5 V step-down needs about 1.5 V above its 5.0 V output: ${vRun.toFixed(2)} V from the ${part(battery).name.split(" (")[0]} while driving${vRun < 6.5 ? " (the 5 V rail sags and the board resets)" : ""}`);
  if (!needs5v && bp.supply === "vin") A.check("power:controller_brownout", vStall >= ctrlMin, `both motors starting at once pull ${stallA.toFixed(1)} A: the ${part(battery).name.split(" (")[0]} sags to ${vStall.toFixed(2)} V, the ${part(board).name.split(" (")[0]} needs ${ctrlMin} V on VIN${vStall < ctrlMin ? " (it resets every time the motors start)" : ""}`);
  const peakBatt = be.current_a.v.peak;
  A.check("power:battery_current", stallA <= peakBatt, `${stallA.toFixed(1)} A with both motors stalled vs ${peakBatt} A the ${part(battery).name.split(" (")[0]} can give`);
  const motorW = nMotors * vm * 0.35, logicW = bp.watts + (range ? 0.1 : 0) + (camera ? 1.2 : 0) + (scan ? 0.6 : 0);
  const energy = Number(bs.energy_wh ?? 10);
  const runtimeMin = (energy * DRIVE.usableEnergy) / (motorW + logicW + drop * run) * 60;
  A.check("power:runtime", runtimeMin >= 20, `${runtimeMin.toFixed(0)} min driving (${(motorW + logicW + drop * run).toFixed(1)} W average incl. ${(drop * run).toFixed(1)} W lost in the driver, from ${energy} Wh, ${DRIVE.usableEnergy * 100} % usable)`);
  if (vm > 0 && vRun - drop > Number(mp.voltage_v)) {
    drive.pwm_cap = Math.round((Number(mp.voltage_v) / (vRun - drop)) * 255);
    A.check("power:motor_overvoltage", true, `${(vRun - drop).toFixed(1)} V at the driver output: the sketch caps PWM at ${drive.pwm_cap}/255 so the 6 V motors see 6 V on average`);
  }
  const bom = A.bom();
  bom.cost_usd = +(bom.cost_usd + (A.design.wiring?.cost_usd ?? 0)).toFixed(2);
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `$${bom.cost_usd.toFixed(2)} of parts vs $${req.budget} budget`);
  const label = mission === "line" ? "line follower" : mission === "camera" ? "camera car" : scan ? "obstacle-avoiding car with a scanning sensor" : "obstacle-avoiding car";
  A.design.performance = { mission: label, wheels: nMotors, max_slope_deg: maxSlope, mass_kg: +m.toFixed(3), top_speed_m_s: +vmax.toFixed(2), runtime_min: +runtimeMin.toFixed(0), motor_voltage_v: +vm.toFixed(2),
    cost_usd: bom.cost_usd, controller: part(board).name, driver: part(driver).name, battery: part(battery).name, length_mm: x1 - x0, width_mm: 2 * (YF + 27) };
  A.design.assumptions.push("TT motor continuous torque taken as 30 % of the 0.8 kg.cm stall (Adafruit #3777 data); torque and speed scale with the voltage that reaches the motor",
    `battery sag from ${rInt.toFixed(2)} ohm internal resistance (${bs.internal_resistance_ohm || bs.internal_resistance_ohm_per_cell ? "the cell data" : "an estimate"})`,
    "prices are typical single-unit marketplace prices for generic modules and vary by seller");
  (A.design as { firmware?: FirmwareRecord }).firmware = fw;
  A.design.request = { ...req } as Record<string, unknown>;
  if (scan) A.design.home = { scan: 0 };
  return A.finish(`${label[0].toUpperCase()}${label.slice(1)} on ${part(board).name.split(" (")[0]} + ${dp.label}: ${nMotors}WD TT motors at ${vm.toFixed(1)} V, ${m.toFixed(2)} kg, ${vmax.toFixed(2)} m/s, ${runtimeMin.toFixed(0)} min, $${bom.cost_usd.toFixed(0)} of parts`);
}

/** Pose of an item in the bay: its body's corner at (x, y) of the bay frame, standing `lift` mm up. */
export function placeT(it: Item, x: number, y: number, lift: number): Mat4 {
  const b = bbox(it.key), z = lift - (it.kind === "board" ? 0 : b.min[2]);
  if (!it.rot) return translation([x - b.min[0], y - b.min[1], z]);
  // turned 90 deg: board x across the car (+y), board y along -x
  return rotZ90(x + b.max[1], y - b.min[0], z);
}
const applyT = (T: Mat4, p: Vec3): Vec3 => [T[0] * p[0] + T[4] * p[1] + T[8] * p[2] + T[12], T[1] * p[0] + T[5] * p[1] + T[9] * p[2] + T[13], T[2] * p[0] + T[6] * p[1] + T[10] * p[2] + T[14]];

/** The Arduino car's motor bracket: hangs under the plate against the motor's inner face. */
function bracketOps(xa: number, side: 1 | -1, canDir: 1 | -1): Op[] {
  const y0 = side * (YF - 22.0), y1 = side * (YF - 19.0), xs = [xa - canDir * 8, xa + canDir * 40];
  const ops: Op[] = [{ op: "box", min: [Math.min(...xs), Math.min(y0, y1), ZC - 11.25], max: [Math.max(...xs), Math.max(y0, y1), ZP + 0.5], r: 0 }];
  for (const hx of part(MOTOR).holes.map((h) => h.pos[0])) ops.push({ op: "hole", a: [xa + canDir * hx, side * (YF - 24), ZC], b: [xa + canDir * hx, side * (YF - 16), ZC], d: 3.2 });
  ops.push({ op: "hole", a: [xa, side * (YF - 24), ZC], b: [xa, side * (YF - 16), ZC], d: 8 });
  return ops;
}

/** A servo standing upright (output up) in a printed cradle whose foot sits at z0: ops for the base and the servo pose. */
export function scanCradle(servo: string, x: number, y: number, z0: number, wall = 2.5): { ops: Op[]; T: Mat4 } {
  // the servo turned 90 deg so its long body lies across the car and its output sits on the centre line
  const b = bbox(servo), zo = z0 + 2 - b.min[2] + wall, yo = y - (b.min[0] + b.max[0]) / 2;
  const T = rotZ90(x, yo, zo);
  const lo: Vec3 = [x - b.max[1] - wall, yo + b.min[0] - wall, z0], hi: Vec3 = [x - b.min[1] + wall, yo + b.max[0] + wall, zo + b.min[2] - wall + 0.2];
  const ops: Op[] = [{ op: "box", min: lo, max: hi, r: 3 }, { op: "cradle", key: servo, T, wall }];
  return { ops, T };
}
/** The distance sensor on the servo horn: a horn plate with a wall in front holding the board, turning +-70 deg. */
export function scanHead(A: Assembly, parent: string, servo: string, Ts: Mat4, range: string) {
  const hr = Number(part(servo).specs.horn_radius_mm ?? 8), xw = hr + 6;
  // the servo lies across the car (scanCradle): the head is drawn facing +x of the car, turned into the servo's output frame
  const Rf: Mat4 = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const ops: Op[] = [{ op: "box", min: [-4, -10, 0], max: [xw, 10, 4], r: 0 }, { op: "box", min: [xw, -26, 0], max: [xw + 3, 26, 30], r: 0 }];
  if (range === "hc_sr04") {
    for (const x of [9.5, 35.5]) ops.push({ op: "hole", a: [xw - 1, -22.5 + x, 16], b: [xw + 5, -22.5 + x, 16], d: 16.5 });
    for (const h of part(range).holes) ops.push({ op: "hole", a: [xw - 1, -22.5 + h.pos[0], 6 + h.pos[1]], b: [xw + 5, -22.5 + h.pos[0], 6 + h.pos[1]], d: 1.6 });
  } else ops.push({ op: "hole", a: [xw - 1, 0, 16], b: [xw + 5, 0, 16], d: 8 });
  A.cadLink("scan_head", { name: "scan_head", edge: 0.6, ops: [{ op: "horn", key: servo, t: 4, extra: 4 }, { op: "at", T: Rf, of: ops } as Op] }, { material: "printed_accent" });
  A.revolute("scan", parent, "scan_head", Ts, servo, -1.2, 1.2);
  // board behind the wall (board x across, y up, transducers +x through the windows), header pins back over the horn plate
  const d = dims(range);
  const Tf: Mat4 = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, xw - 1.6, range === "hc_sr04" ? -22.5 : -d.x / 2, range === "hc_sr04" ? 6 : 16 - d.y / 2, 1];
  A.mount("scan_head", range, mul(Rf, Tf), "ultrasonic", `${part(range).name.split(" (")[0]} on the scan servo`);
  exposed(A, "ultrasonic", "looks out through the scan head's windows and turns with it", [45, 20]);
  A.spec.sensors.push({ name: "front_range", type: "range", parent: "ultrasonic", origin: { xyz: [0.0225, 0.01, 0.0136], rpy: [0, 0, 0] }, params: { range_m: 4, min_range_m: 0.02, beam_deg: 15 } });
  A.fastener("M2x6 self-tapping (sensor)", 4);
}
