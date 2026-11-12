// Ultrasonic radar scanner: the classic one-servo project. A servo stands in a printed cradle at the front of a base
// plate and sweeps an HC-SR04 from 20 to 160 deg; the board in a compartment behind it sends angle and distance over USB
// to the PC, which draws the radar screen. The board runs from USB; the servo from a battery on the list when there is
// one (USB gives 0.5 A, a stalled micro servo takes more).
import type { RobotSpecification } from "@ttr/robot-schema";
import { part, rating, electrical } from "@ttr/parts";
import { translation } from "@ttr/solid";
import type { Op } from "@ttr/kernel";
import { Assembly } from "../assembly.ts";
import { totalMass, gravityTorques } from "../kin.ts";
import { withSolids, interferences } from "../clearance.ts";
import { bay, enclosureChecks, type BayPart, type ExitSpec } from "../enclosure.ts";
import { Harness, finishWiring } from "../wiring.ts";
import { item, packBest, placeT, roomForSwitch, switchColumn, scanCradle, scanHead, CY_BAY, type Item } from "./parts-car.ts";
import { boardProfile, PinPlan, type FirmwareRecord } from "./parts-pins.ts";

export interface RadarRequest { name?: string; prompt?: string; budget?: number; board?: string; servo?: string; range?: string; battery?: string | null; }

const END = 11, BB = "breadboard_400", CY = CY_BAY, PLATE = 4;
const bbox = (k: string) => part(k).bbox_mm!;
const plugIn = (k: string) => bbox(k).min[2] < -3 && !part(k).holes.some((h) => h.axis[2] < -0.5);
const hasHoles = (k: string) => part(k).holes.some((h) => h.axis[2] < -0.5);

export function designRadar(req: RadarRequest = {}): RobotSpecification {
  const board = req.board ?? "arduino_nano_clone", servo = req.servo ?? "hobby_sg90", range = req.range ?? "hc_sr04";
  const battery = req.battery === undefined ? null : req.battery;
  const bp = boardProfile(board);
  const A = new Assembly(req.name ?? "radar_scanner", "radar_scanner", req.prompt);
  const items: Item[] = [];
  if (battery) items.push(item("battery", battery, part(battery).name.split(":")[0], "battery"));
  const servoBuck = !!battery && electrical(battery)!.voltage_v.v.max > electrical(servo)!.voltage_v.v.max * 1.05;
  if (servoBuck) items.push(item("servo_regulator", "buck_lm2596", "LM2596 set to 5.0 V for the servo", "board", 4));
  if (plugIn(board)) { const it = item("breadboard", BB, "plug-in wiring for the board", "plain"); it.carried = [{ name: "controller", key: board, use: "controller (runs the generated sketch)", at: [4, 27] }]; items.push(it); }
  else items.push(item("controller", board, "controller (runs the generated sketch)", hasHoles(board) ? "board" : "plain", hasHoles(board) ? 5 : 0));
  const P = packBest(items); roomForSwitch(P);
  const FLOOR = 2.4, bx = -P.length - 20, CL = P.length + 2 * END, CH = Math.max(26, Math.ceil(Math.max(...items.map((i) => i.H + (i.carried ? 8.5 + bbox(board).max[2] : 0))) + 8));
  const x1 = 52, x0 = bx - 8;
  // ---------------- base plate with four rubber-foot holes; the servo cradle stands on its front
  const sc = scanCradle(servo, 30, 0, PLATE);
  const ops: Op[] = [{ op: "box", min: [x0, -CY - 6, 0], max: [x1, CY + 6, PLATE], r: 8 }, ...sc.ops];
  for (const x of [x0 + 8, x1 - 8]) for (const y of [-CY, CY]) ops.push({ op: "hole", a: [x, y, -1], b: [x, y, PLATE + 1], d: 3.4 });
  ops.push({ op: "hole", a: [8, 0, -1], b: [8, 0, PLATE + 1], d: 6 });
  A.cadLink("base_link", { name: "base_link", edge: 0.8, ops }, { role: "base", material: "printed_dark" });
  A.fastener("M3 rubber feet (or 4 stick-on bumpers)", 4);
  A.mount("base_link", servo, sc.T, "scan_servo", "sweep servo");
  A.fastener("M2 self-tapping (servo tabs, from the servo kit)", 2);
  scanHead(A, "base_link", servo, sc.T, range);

  // ---------------- compartment behind the servo
  const H = new Harness(A);
  const posOf = (n: string) => { const c = P.cols.find((c) => c.items.some((e) => e.it.name === n))!, e = c.items.find((x) => x.it.name === n)!; return { x: END + c.x0 + (c.L - e.it.L) / 2, y: e.y0 + CY }; };
  const parts: BayPart[] = items.map((it) => { const p = posOf(it.name); return { name: it.name, key: it.key, T: placeT(it, p.x, p.y, it.standoff), use: it.use, kind: it.kind, ...(it.kind === "board" ? {} : { standoff: false }) }; });
  const ci = items.find((i) => i.name === (plugIn(board) ? "breadboard" : "controller"))!, cp = posOf(ci.name);
  const exits: ExitSpec[] = [{ id: "usb", face: "y-", u: cp.x + ci.L / 2, v: 10, kind: "usb", w: 14, h: 10 }, { id: "servo_lead", face: "x+", u: CY, v: CH / 2, kind: "grommet", d: 6.5, noAnchor: true }];
  if (battery) exits.push({ id: "switch", face: "y+", u: END + switchColumn(P).x0 + Math.max(switchColumn(P).L, 18) / 2, v: CH / 2, kind: "switch", w: 19.2, h: 13, part: { name: "main_switch", key: "switch_kcd1", use: "servo power switch" } });
  bay(A, { name: "electronics_bay", parent: "base_link", T: translation([bx, -CY, PLATE + FLOOR]), size: [CL, 2 * CY, CH], cad: true, corner: 5, floor: FLOOR, wall: 2, lidT: 2.2, material: "printed_dark", lidMaterial: "printed_accent", parts, exits,
    vents: [{ face: "lid", a0: 8, a1: CL - 8, b0: 14, b1: 2 * CY - 14 }] }, H);
  const it = items.find((i) => i.carried);
  for (const c of it?.carried ?? []) { A.mount("breadboard", c.key, translation([c.at[0], c.at[1], 8.5]), c.name, c.use); H.bayOf.set(c.name, "electronics_bay"); }

  // ---------------- wiring: the board on USB, the servo on the battery (or on USB when there is none)
  const pins = new PinPlan(bp, true), fw: FirmwareRecord = { board, fqbn: bp.fqbn, language: bp.language, mission: "radar", sensors: {}, servos: {}, notes: [] };
  H.rail("USB_5V", { source: "controller", out: bp.io === 5 ? "5V" : bp.vin5, gnd: bp.gnd, volts: 5, cont: 0.45, peakLimit: 0.5, simNote: "the servo stalled while the sensor pings (USB 2.0 gives 0.5 A)" });
  H.spare("controller.janalog.VIN", "controller.power_jack", "controller.j2_analog_side.VIN", "controller.header_left.VIN", "controller.jpower.VIN");
  let servoRail = "USB_5V";
  if (battery) {
    H.mainPower("VBAT", { source: "battery", pos: "@power", neg: "@ground", sw: "main_switch", fuse: electrical(battery)!.current_a.v.peak > 5, simNote: "the servo stalled" });
    servoRail = "VBAT";
    if (servoBuck) { H.regulator("servo_regulator", "VBAT", "5V_SERVO", { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-", volts: 5 }); servoRail = "5V_SERVO"; }
  }
  H.feed(servoRail, "scan_servo", { v: "@power", g: "@ground" });
  const sp = pins.servo(); H.signals("controller", "scan_servo", [[sp, "@pwm"]]);
  fw.servos.scan = { pin: sp, key: servo, centre_deg: 90, range_deg: [20, 160] };
  if (range === "hc_sr04") {
    H.feed("USB_5V", "ultrasonic", { v: "VCC", g: "GND" });
    const trig = pins.digital(), echo = pins.input();
    H.signals("controller", "ultrasonic", [[trig, "TRIG"], [echo, "ECHO"]]);
    fw.sensors.ultrasonic = { kind: "hc_sr04", trig, echo };
    if (bp.io < 5) fw.notes.push(`ECHO is a 5 V output: a 1 k / 2 k divider into ${echo}`);
  } else {
    H.feed("USB_5V", "ultrasonic", { v: "VIN", g: "GND" });
    const [sda, scl] = pins.i2c(); H.signals("controller", "ultrasonic", [[sda, "SDA", "I2C_SDA"], [scl, "SCL", "I2C_SCL"]]);
    H.spare("ultrasonic.header.XSHUT", "ultrasonic.header.GPIO1");
    fw.sensors.tof = { kind: "vl53l0x", sda, scl };
  }
  if (battery) H.wire("GND", `controller.${bp.gnd}`, "scan_servo.@ground", { typ: 0.01 });
  H.notes.push("The board takes power and talks to the PC over its USB cable: the PC draws the radar screen from the angle,distance lines it prints.");
  finishWiring(H);
  enclosureChecks(A);

  const carried = new Set(["battery", "main_switch", "breadboard", "controller", "servo_regulator", "ultrasonic", "scan_servo"]);
  const skip = new Set<string>();
  for (const j of A.spec.joints) if (j.type === "fixed" && carried.has(j.child)) skip.add(`${j.parent}|${j.child}`);
  const hits = withSolids(A.spec, (mdl) => interferences(mdl, {}, undefined, 2, skip));
  A.check("clearance:home", hits.length === 0, hits.length ? `intersecting: ${hits.map((h) => `${h.a}/${h.b} ${h.volume_mm3} mm^3`).join(", ")}` : "no printed part or component intersects another");
  // the head is light: the servo turns it with a wide margin; the sweep time follows from the servo speed
  const r = rating(servo), tq = Math.max(...[0, 0.6, -0.6].map((a) => Math.abs(gravityTorques(A.spec, { scan: a }, [])["scan"] ?? 0)));
  A.check("torque:scan", tq <= r.rated_nm, `the head needs ${tq.toFixed(4)} N·m to hold (vertical axis: friction only) vs ${r.rated_nm} N·m rated`);
  const sweepS = (140 * Math.PI / 180) / r.speed_rad_s + 141 * 0.03;
  A.check("speed:sweep", sweepS <= 10, `one 140 deg sweep in about ${sweepS.toFixed(1)} s (1 deg steps, a 30 ms ping each)`);
  const bom = A.bom(); bom.cost_usd = +(bom.cost_usd + (A.design.wiring?.cost_usd ?? 0)).toFixed(2);
  if (req.budget !== undefined) A.check("budget", bom.cost_usd <= req.budget, `$${bom.cost_usd.toFixed(2)} of parts vs $${req.budget} budget`);
  A.design.performance = { mission: "radar scanner", sweep_deg: 140, sweep_s: +sweepS.toFixed(1), range_m: range === "hc_sr04" ? 4 : 1.2, mass_kg: +totalMass(A.spec).toFixed(3), cost_usd: bom.cost_usd, controller: part(board).name, servo: part(servo).name };
  A.design.assumptions.push("the PC side is a small Processing or Python sketch that reads 'angle,distance.' lines from the serial port (115200 baud)", "prices are typical single-unit marketplace prices and vary by seller");
  (A.design as { firmware?: FirmwareRecord }).firmware = fw;
  A.design.request = { ...req } as Record<string, unknown>;
  A.design.home = { scan: 0 };
  return A.finish(`Ultrasonic radar: ${part(servo).name.split(" (")[0]} sweeps an ${part(range).name.split(" (")[0]} over 140 deg every ${sweepS.toFixed(1)} s; ${part(board).name.split(" (")[0]} sends angle and distance to the PC; $${bom.cost_usd.toFixed(0)} of parts`);
}
