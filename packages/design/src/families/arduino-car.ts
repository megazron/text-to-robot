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
import { bay, enclosureChecks, exposed, type ExitSpec } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";

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
// half the compartment's inside width: a breadboard (54.5 mm) lies lengthwise beside the pack (41 mm), 2 mm from the walls
const CY = 52;
const YF = CY + 9;                     // motor output face |y| (plate edge)
const BB = part("breadboard_400").bbox_mm!.max;   // 82.5 x 54.5 x 8.5
// tie-point columns are 2.54 mm apart from 4 mm in; the two halves of a column meet at the centre channel, rows 3.81 mm
// and on from it. A board straddles the channel with each header row in its own half-column.
const COL = (c: number) => 4 + 2.54 * (c - 1);
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

/** TB6612FNG boards: motor supply from VBAT, logic from 5V_LOGIC, six control pins each, one motor per channel. Motor current counts on the driver's feed. */
export function wireDrivers(H: Harness, drivers: number, motors: string[]) {
  const PINS = [["D5", "D7", "D8", "D6", "D4", "A0"], ["D9", "A1", "A2", "D10", "A3", "D2"]];
  for (let i = 0; i < drivers; i++) {
    const d = `motor_driver_${i + 1}`;
    H.feed("VBAT", d, { v: "VM", g: "GND", typ: 0.01, peak: 0.01 });
    H.feed("5V_LOGIC", d, { v: "VCC", g: "", typ: 0.002, peak: 0.002 });
    const [pa, a1, a2, pb, b1, b2] = PINS[i];
    H.signals("controller", d, [[pa, "PWMA"], [a1, "AIN1"], [a2, "AIN2"], [pb, "PWMB"], [b1, "BIN1"], [b2, "BIN2"]]);
    H.net(`${d}_STBY`.toUpperCase(), "signal"); H.wire(`${d}_STBY`.toUpperCase(), "controller.5V", `${d}.STBY`);
    for (const [k, ch] of [[0, "A"], [1, "B"]] as const) {
      const m = motors[i * 2 + k]; if (!m) { H.spare(`${d}.motor_${ch.toLowerCase()}`); continue; }
      const n = `${m}_PHASE`.toUpperCase(), r = H.rec(m).current_a.v, feed = H.rails.get("VBAT")!.feeds.find((x) => x.inst === d)!;
      H.net(`${n}_1`, "signal"); H.net(`${n}_2`, "signal");
      H.wire(`${n}_1`, `${d}.${ch}O1`, `${m}.M+`, { typ: r.typical, peak: r.peak }); H.wire(`${n}_2`, `${d}.${ch}O2`, `${m}.M-`, { typ: r.typical, peak: r.peak });
      feed.typ += r.typical; feed.peak += r.peak;
    }
  }
}
/** The netlist: pack through fuse and switch to the motor rail and the Nano; driver logic and sensor on the Nano's 5 V. */
function wire(H: Harness, drivers: number, ultrasonic: boolean, motors: string[]) {
  H.mainPower("VBAT", { source: "battery", pos: "@power", neg: "@ground", sw: "main_switch", simultaneous: 2, simNote: "two motors stalling at once, the rest running" });
  H.regulator("controller", "VBAT", "5V_LOGIC", { vin: "VIN", gin: "GND", vout: "5V", gout: "GND", volts: 5, cont: 0.2, peakLimit: 0.4 });
  wireDrivers(H, drivers, motors);
  H.notes.push("Board to board wires on the breadboard are jumper wires in the rows of the two pins; the cut list length is the most a jumper needs.");
  if (ultrasonic) {
    H.feed("5V_LOGIC", "ultrasonic", { v: "VCC", g: "GND" });
    H.signals("controller", "ultrasonic", [["D11", "TRIG"], ["D12", "ECHO"]]);
  }
}

export function designArduinoCar(req: ArduinoCarRequest = {}): RobotSpecification {
  const tier = req.tier ?? "cheapest", cfg = { ...TIERS[tier], ...(req.wheels ? { wheels: req.wheels } : {}) };
  const sensor = req.sensor ?? "ultrasonic", payload = req.payloadKg ?? 0;
  const A = new Assembly(req.name ?? "arduino_car", "arduino_car", req.prompt);
  const four = cfg.wheels === 4;
  // axles: 2WD one axle at x = 0, the motor cans forward beside the caster; 4WD two axles with the cans towards the centre,
  // their rear ends (where the leads are soldered) 18 mm apart: room for both pairs of leads to turn
  const axles: { xa: number; can: 1 | -1 }[] = four ? [{ xa: 70, can: -1 }, { xa: -70, can: 1 }] : [{ xa: 0, can: 1 }];
  const x0 = four ? -105 : -74, x1 = four ? 117 : 110, xc = x1 - 30;

  // ---------------- chassis: plate + motor brackets + caster pillar (prints upside down, plate on the bed)
  const ops: Op[] = [{ op: "box", min: [x0, -YF, ZP], max: [x1, YF, ZT], r: 10 }];
  for (const { xa, can } of axles) for (const side of [1, -1] as const) ops.push(...bracketOps(xa, side, can));
  // ball caster (2WD): a 1/2 in steel ball snapped into a printed socket at the bottom of a pillar. The socket is
  // 0.2 mm over the ball; its mouth (5.9 mm radius, 2.35 mm below the centre) is 0.45 mm under the ball's radius
  const rb = Number(part(BALL).specs.ball_d_mm) / 2;
  if (!four) {
    ops.push({ op: "rod", a: [xc, 0, rb - 2.35], b: [xc, 0, ZP + 0.5], r: rb + 4.2 });
    ops.push({ op: "sphere", c: [xc, 0, rb], r: rb + 0.2, cut: true });
    ops.push({ op: "hole", a: [xc, 0, -1], b: [xc, 0, rb], d: 2 * (rb - 0.45) });
  }
  // electronics compartment on the deck: cavity from the rear edge to just behind the sensor bracket. The breadboards lie
  // lengthwise along the left wall, the pack along the right wall at the rear; the floor in front of the pack is free
  // for the switch, the fuse, the splices and the grommets the leads from under the deck come up through.
  const FLOOR = 0, bx = x0 + 9, xe = x1 - 19.4, CL = xe - bx, zf = ZT + FLOOR;
  // lid height: a jumper's housing (10 mm) stands in the breadboard, the wire turns above it (1.25 x its bend radius),
  // and the bundle it joins there runs a bend radius and its own width under the lid
  const CH = Math.ceil(BB[2] + 10 + 8 + 9.5);
  // battery pack: two M3 countersunk screws from under the plate, through the compartment floor (rear right)
  const xb = bx + 2, yb = -CY + 2 + 20.5, ybb = CY - 2 - BB[1];
  for (const h of part(PACK).holes) ops.push({ op: "hole", a: [xb + h.pos[0], yb + h.pos[1], ZP - 1], b: [xb + h.pos[0], yb + h.pos[1], ZT + 1], d: 3.2 });
  // the leads from under the deck come up through grommets in the free floor: the left and the right motors' (beside
  // the motors' rear ends, a turn and a straight run inboard of them) and the sensor's
  const xLead = four ? 0 : axles[0].xa + axles[0].can * 61 + 11;
  const holes: { id: string; x: number; y: number }[] = four ? [{ id: "motor_leads_l", x: xLead, y: -14 }, { id: "motor_leads_r", x: xLead, y: -28 }] : [{ id: "motor_leads_l", x: xLead, y: 28 }, { id: "motor_leads_r", x: xLead, y: -28 }];
  if (sensor === "ultrasonic") holes.push(four ? { id: "sensor", x: xe - 6, y: 38 } : { id: "sensor", x: xe - 7, y: -20 });
  const GD = 6.5;
  for (const h of holes) ops.push({ op: "hole", a: [h.x, h.y, ZP - 1], b: [h.x, h.y, ZT + 1], d: GD });
  // sensor bracket screws (front), and the slot the sensor's header and its plugs hang through
  for (const y of [-20, 20]) ops.push({ op: "hole", a: [x1 - 7, y, ZP - 1], b: [x1 - 7, y, ZT + 1], d: 3.2 });
  const slot: Op = { op: "cutbox", min: [x1 - 10, -9, ZP - 1], max: [x1 - 3.2, 9, ZT + 5] };
  if (sensor === "ultrasonic") ops.push(slot);
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

  // ---------------- compartment: battery, breadboard(s) with board + drivers, main switch, all under a screwed lid
  const H = new Harness(A);
  const Tbay = translation([bx, -CY, zf]), W = (x: number, y: number) => [x - bx, y + CY] as const;
  const drivers = four ? 2 : 1;
  // one half-size breadboard has 30 columns: the Nano takes 15 and a driver 8, so the second driver has a board of its
  // own, end to end with the first (their dovetails lock)
  const boards = [{ name: "breadboard", x: bx + 2 }, ...(four ? [{ name: "breadboard_2", x: bx + 2 + BB[0] }] : [])];
  // the Nano straddles the centre channel in rows d and h (0.6 in), its USB socket at the rear wall; pins in columns 2 to 16
  const nano = { x: COL(2) - 3.81, y: BB[1] / 2 - 6.35 - 1.27 };
  // a driver stands across the channel in rows c and h (0.7 in), its eight pins a side along the board: columns c0 to c0 + 7
  const tbT = (c0: number): Mat4 => [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, COL(c0 + 7) + 1.27, BB[1] / 2 - 10.16, BB[2], 1];
  // main power in a row, each wire leaving the way the next part takes it: pack lead -> inline fuse -> switch -> splice.
  // 4WD: the fuse lies along the right wall strip, the switch stands in the right wall beyond it, the splice across the
  // front. 2WD: the fuse lies across the free floor in front of the pack, the switch stands in the front wall beside
  // the sensor bracket. The switch is upright (its tabs one above the other), low enough for the fuse's lead.
  const xPin = xb + part(PACK).bbox_mm!.max[0], yPos = yb - 2, SV = 12, tab = 19.1 - 2;   // pack lead; switch height; its tabs' depth inside the wall
  const sw = four ? { face: "y-" as const, at: xe - 11.6 } : { face: "x+" as const, at: 39 };
  const swPanel: Mat4 = four ? frame([W(sw.at, 0)[0], -2, SV], [0, -1, 0], [1, 0, 0]) : frame([CL + 2, W(0, sw.at)[1], SV], [1, 0, 0], [0, 1, 0]);
  // the compartment is an open frame on the deck: the deck is its floor, the grommets are in the deck
  const exits: ExitSpec[] = [
    ...holes.map((h): ExitSpec => ({ id: h.id, face: "floor", u: W(h.x, 0)[0], v: W(0, h.y)[1], kind: "grommet", d: GD })),
    { id: "usb", face: "x-", u: W(0, ybb + nano.y + 8.9)[1], v: BB[2] + 3.6, kind: "usb", w: 14, h: 9 },
    { id: "switch", face: sw.face, u: four ? W(sw.at, 0)[0] : W(0, sw.at)[1], v: SV, kind: "switch", w: 13.2, h: 19.2, part: { name: "main_switch", key: "switch_kcd1", use: "main power switch", Tpanel: swPanel } },
  ];
  const rec = bay(A, { name: "electronics_bay", parent: "chassis", T: Tbay, size: [CL, 2 * CY, CH], cad: true, corner: 5, floor: FLOOR, wall: 2, lidT: 2.2, material: "printed_dark", lidMaterial: "printed_accent",
    parts: [{ name: "battery", key: PACK, T: translation([...W(xb, yb), 0]), use: "2S 18650 pack", kind: "plain" },
      ...boards.map((b, i) => ({ name: b.name, key: "breadboard_400", T: translation([...W(b.x, ybb), 0]), use: i ? "plug-in wiring for the second driver (stuck to the deck, locked to the first board)" : "plug-in wiring for the board and driver (stuck to the deck by its adhesive back)", kind: "plain" as const }))],
    exits, vents: [{ face: "lid", a0: W(boards[0].x + 6, 0)[0], a1: W(boards[0].x + BB[0] - 6, 0)[0], b0: W(0, ybb + 4)[1], b1: W(0, ybb + BB[1] - 4)[1] }] }, H);
  A.fastener("M3x8 countersunk + nut (pack, through the deck)", 2);
  A.mount("breadboard", cfg.board, translation([nano.x, nano.y, BB[2]]), "controller", "Arduino (runs the generated sketch)");
  for (let i = 0; i < drivers; i++) A.mount(boards[i].name, "tb6612fng_module", tbT(i ? 3 : 19), `motor_driver_${i + 1}`, "TB6612FNG dual motor driver");
  for (const n of ["controller", ...Array.from({ length: drivers }, (_, i) => `motor_driver_${i + 1}`)]) { H.bayOf.set(n, "electronics_bay"); rec.parts.push(n); }

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
    // the header on the board's lower edge points down: it and its four plugs pass through the foot and the deck, and
    // the wires run back under the deck to their grommet
    wall.push(slot);
    A.cadLink("sensor_bracket", { name: "sensor_bracket", edge: 0.6, ops: wall }, { material: "printed_accent" });
    A.fixed("sensor_bracket_mount", "chassis", "sensor_bracket", translation([0, 0, 0]));
    A.fastener("M3x10 + nut (sensor bracket)", 2);
    // HC-SR04: board z (transducers) forward, board x across the robot, board y up
    const Ts: Mat4 = [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, x1 - 4.6, -22.5, zb, 1];
    A.mount("sensor_bracket", "hc_sr04", Ts, "ultrasonic", "HC-SR04 distance sensor");
    exposed(A, "ultrasonic", "transducers look out through two 16.5 mm windows in the printed bracket", [45, 20]);
    A.spec.sensors.push({ name: "front_range", type: "range", parent: "ultrasonic", origin: { xyz: [0.0225, 0.01, 0.0136], rpy: [0, 0, 0] }, params: { range_m: 4, min_range_m: 0.02, beam_deg: 15 } });
    A.fastener("M2x6 self-tapping (sensor)", 4);
  }

  // ---------------- harness: netlist, then routed, sized and checked against the parts as placed
  // the fuse, the splices and the star ground lie on the free floor, each where its wires run straight on
  H.home = "main_switch";
  const lie = (h: number) => zf + h / 2 + 3;   // a body's centre when it lies on the deck (the router wants a little air under it)
  if (four) {
    const yLane = -CY + tab + 15;   // the line of the switch's first bend: the fuse lies along it
    H.seat("main_fuse", [xPin + 59.5, yLane, lie(15)]);
    H.seat("splice_vbat", [sw.at - 3.6, 14, lie(8.5)], 1);
    H.seat("star_ground", [xPin + 57, -CY + 11.5, lie(8.5)]);
    H.seat("splice_5v_logic", [xPin + 57, -CY + 11.5, lie(8.5) + 10.5]);   // tied on top of the star ground's splice
  } else {
    const xLane = xe - tab - 15;
    H.seat("main_fuse", [xPin + 16, yPos + 40.5, lie(15)], 1);
    H.seat("splice_vbat", [xLane + 7.4, 4, lie(8.5)], 3);
    H.seat("star_ground", [xPin + 43, yPos + 11.5, lie(8.5)]);
    H.seat("splice_5v_logic", [xPin + 31, -CY + 11, lie(8.5)]);
  }
  const motors = axles.flatMap(({ xa }) => ([1, -1] as const).map((sd) => `${xa > 0 ? "front" : xa < 0 ? "rear" : "drive"}_${sd > 0 ? "left" : "right"}_motor`));
  wire(H, drivers, sensor === "ultrasonic", motors);
  // each lead by its own grommet: the left motors', the right motors', the sensor's
  motors.forEach((m, i) => H.exitFor([m, `motor_driver_${Math.floor(i / 2) + 1}`].sort().join("~"), `electronics_bay.motor_leads_${/_left_/.test(m) ? "l" : "r"}`));
  for (const c of ["controller~ultrasonic", "5V_LOGIC~ultrasonic"]) H.exitFor(c, "electronics_bay.sensor");
  finishWiring(H);
  enclosureChecks(A);

  // ---------------- nothing intersects anything (bought parts as their body boxes, printed parts as solids)
  // parts that sit on a carrier by design (boards on the breadboard, sensor in its bracket, pack on the deck)
  const carried = new Set(["controller", "motor_driver_1", "motor_driver_2", "breadboard", "breadboard_2", "battery", "ultrasonic", "main_switch"]);
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
  bom.cost_usd = +(bom.cost_usd + (A.design.wiring?.cost_usd ?? 0)).toFixed(2);
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `$${bom.cost_usd.toFixed(2)} of parts vs $${req.budget} budget`);
  A.design.performance = { tier, tier_label: cfg.label, wheels: cfg.wheels, max_slope_deg: cfg.slopeDeg, mass_kg: +m.toFixed(3), top_speed_m_s: +vmax.toFixed(2), runtime_min: +runtimeMin.toFixed(0),
    cost_usd: bom.cost_usd, controller: part(cfg.board).name, length_mm: x1 - x0, width_mm: 2 * (YF + 27) };
  // four wheels skid when turning on the spot: the same slip model as the skid-steer bases and WALL-E sets the claim
  if (four) { const wb = 2 * axles[0].xa / 1000, track = 2 * (YF + 14) / 1000, chi = 1 + 2 * (wb / track) ** 2; A.design.performance.turn_rate_rad_s = +((0.5 * vmax) / (track / 2) / chi).toFixed(2); A.design.performance.turn_slip_factor = +chi.toFixed(2); }
  A.design.assumptions.push(`TT motor continuous torque taken as 30 % of the 0.8 kg.cm stall (Adafruit #3777 data)`,
    "prices are typical single-unit marketplace prices for generic modules and vary by seller");
  A.design.request = { ...req } as Record<string, unknown>;
  return A.finish(`Arduino car (${cfg.label}): ${cfg.wheels}WD on TT gear motors, ${m.toFixed(2)} kg, ${vmax.toFixed(2)} m/s, ${runtimeMin.toFixed(0)} min, $${bom.cost_usd.toFixed(0)} of parts`);
}

/** Every tier side by side (cheapest first), for the price picker. */
export const arduinoCarOptions = (req: ArduinoCarRequest = {}) => (Object.keys(TIERS) as ArduinoTier[]).map((tier) => designArduinoCar({ ...req, tier }));
