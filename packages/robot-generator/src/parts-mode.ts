// Build from my parts: which robots a parts list can build, ranked by how much of the list each one uses and how little
// it needs on top, each checked with the real figures of the user's parts (AA cells sag, an L298N drops 2 V, a USB port
// gives 0.5 A). The chosen option is designed with exactly those parts: the bill of materials marks every line as
// "you have it" or "to buy", the wiring and sketch use the user's board, driver and battery.
import type { RobotSpecification } from "@ttr/robot-schema";
import { CATALOG, part, electrical } from "@ttr/parts";
import { partsCarLength, regulatorFor, designPartsCar, designArduinoArm, designArduinoWallE, designRadar, designServoWalker, type PartsCarRequest, type ArduinoArmRequest, type RadarRequest, type WalkerRequest } from "@ttr/design";
import { buildBom, type BillOfMaterials } from "@ttr/components";
import { toInventory, counts, type Inventory, type InventoryInput } from "./inventory.ts";

export type OptionKind = "obstacle_car" | "obstacle_car_4wd" | "scan_car" | "line_follower" | "camera_car" | "servo_arm" | "radar" | "walker" | "wall_e";
export interface PartsOption {
  id: string; kind: OptionKind; label: string; blurb: string;
  /** catalog key -> how many of the user's parts it uses / how many it needs to buy (named parts, not filament or wire) */
  uses: Record<string, number>; buys: Record<string, number>;
  used_count: number; inventory_count: number;
  /** price of the named parts to buy */
  extra_usd: number;
  /** "uses 9/10 of your parts, needs +$4 (1x 2S 18650 pack)" */
  headline: string;
  /** what the user's own parts cannot do safely, with numbers, and the fix this option takes */
  honesty: string[];
  score: number;
  /** the designer and its request */
  designer: "parts_car" | "arduino_arm" | "radar" | "servo_walker" | "arduino_walle";
  request: Record<string, unknown>;
  thumbnail: string;
}
export interface PartsDesign { option: PartsOption; robot: RobotSpecification; bom: BillOfMaterials; failing: string[]; shopping: ShoppingLine[]; to_buy_usd: number; summary: string; }
export interface ShoppingLine { key: string | null; name: string; qty: number; unit_usd: number; subtotal_usd: number; url: string | null; why: string; }
export interface FromPartsResult {
  inventory: Inventory;
  options: PartsOption[];
  /** designs of the options asked for (opts.design), keyed by option id */
  designs: Record<string, PartsDesign>;
  /** nothing safe can be built: why, and the cheapest set of parts that would make a robot */
  cannot?: { reason: string; add: { key: string; qty: number; usd: number }[]; then: string };
  notes: string[];
}
export interface FromPartsOptions {
  /** which options to design: "top" (default), "all", "none", or an option id */
  design?: "top" | "all" | "none" | string;
  /** how many ranked options to return (default 3) */
  limit?: number;
  budget?: number;
  prompt?: string;
}

// ------------------------------------------------------------------------------------------------ the parts each kind accepts
const SERVOS = ["hobby_sg90", "hobby_mg90s", "hobby_mg996r", "hobby_mg995", "hobby_ds3218"];
const AVR = ["arduino_uno_clone", "arduino_uno_r3", "arduino_nano_clone", "arduino_nano_v3", "arduino_mega_clone"];
const CAR_BOARDS = [...AVR, "esp32_devkit_v1", "esp32_s3_devkitc1", "esp32_cam", "rpi4_4gb", "rpi5", "rpi_zero_2w"];
const ARM_BOARDS = ["arduino_uno_clone", "arduino_uno_r3", "arduino_nano_clone", "arduino_nano_v3", "esp32_devkit_v1"];
const DRIVERS = ["tb6612fng_module", "l298n_module", "drv8833_module", "l9110s_module"];
const CAR_BATTERIES = ["pack_2s_18650", "battery_holder_6aa", "battery_holder_4aa", "lipo_3s_2200", "battery_9v_pp3", "powerbank_5v_2a"];
const RANGE = ["hc_sr04", "vl53l0x_breakout"];
const has = (k: string) => !!CATALOG[k];
const price = (k: string) => CATALOG[k]?.price_usd ?? 0;
const SHORT: Record<string, string> = { wheel_65mm_tt: "TT wheel", steel_ball_12_7mm: "caster ball", switch_kcd1: "power switch", buck_lm2596: "LM2596 buck", pack_2s_18650: "2S 18650 pack", breadboard_400: "breadboard",
  tb6612fng_module: "TB6612FNG", l298n_module: "L298N", battery_holder_4aa: "4 x AA holder", battery_holder_6aa: "6 x AA holder", psu_5v4a_adapter: "5 V 4 A adapter", psu_5v_lrs50: "5 V 10 A supply",
  iec_c14_fused_switched: "mains inlet", hc_sr04: "HC-SR04", arduino_nano_clone: "Arduino Nano", pca9685_clone: "PCA9685", tt_gearmotor_1to48: "TT motor", rpi_camera_module_3: "Pi camera", hobby_sg90: "SG90", hobby_mg90s: "MG90S" };
const short = (k: string) => SHORT[k] ?? part(k).name.split(/ \(|:|, /)[0];
const plugIn = (k: string) => (part(k).bbox_mm?.min[2] ?? 0) < -3 && !part(k).holes.some((h) => h.axis[2] < -0.5);

class Picker {
  left: Record<string, number>; uses: Record<string, number> = {}; buys: Record<string, number> = {};
  constructor(inv: Record<string, number>) { this.left = { ...inv }; }
  /** take one of these keys from the parts list (first owned in preference order), else buy `buy` */
  one(accept: string[], buy: string | null): string | null {
    const k = accept.find((x) => (this.left[x] ?? 0) > 0);
    if (k) { this.left[k]--; this.uses[k] = (this.uses[k] ?? 0) + 1; return k; }
    if (buy === null) return null;
    this.buys[buy] = (this.buys[buy] ?? 0) + 1; return buy;
  }
  owned(accept: string[]) { return accept.find((x) => (this.left[x] ?? 0) > 0) ?? null; }
  n(k: string, qty: number, buy = true): number { let got = 0; for (let i = 0; i < qty; i++) if (this.one([k], buy ? k : null)) got++; return got; }
  count(accept: string[]) { return accept.reduce((s, k) => s + (this.left[k] ?? 0), 0); }
}

// ------------------------------------------------------------------------------------------------ quick power checks
const rInt = (b: string) => { const s = part(b).specs; return Number(s.internal_resistance_ohm ?? (s.internal_resistance_ohm_per_cell ? Number(s.internal_resistance_ohm_per_cell) * Number(s.cells ?? 1) : 0.05)); };
/** The car's power, from the same figures the designer checks: what fails and by how much. */
export function carPower(board: string, driver: string, battery: string, motors = 2): { ok: boolean; problems: string[]; vm: number } {
  const e = electrical(battery)!, mp = part("tt_gearmotor_1to48").specs, R = rInt(battery);
  const run = motors * Number(mp.no_load_current_a) * 2.2 + 0.15, stall = 2 * Number(mp.stall_current_a);
  const vRun = e.voltage_v.v.nom - run * R, vStall = e.voltage_v.v.nom - stall * R;
  const drop = Number(part(driver).specs.voltage_drop_v ?? 0.5), vm = Math.min(6, vRun - drop);
  const problems: string[] = [], b = short(battery);
  if (stall > e.current_a.v.peak) problems.push(`both TT motors starting together pull ${stall.toFixed(1)} A; the ${b} gives about ${e.current_a.v.peak} A and sags to ${Math.max(0, vStall).toFixed(1)} V`);
  const avrBoard = AVR.includes(board), five = !avrBoard;
  if (avrBoard && vStall < Number(electrical(board)!.voltage_v.v.min)) problems.push(`the ${short(board)} needs ${electrical(board)!.voltage_v.v.min} V on VIN and gets ${Math.max(0, vStall).toFixed(1)} V when the motors start, so it resets`);
  if (five && e.voltage_v.v.max > 5.5 && vRun < 6.5) problems.push(`a 5 V regulator needs about 6.5 V in; the ${b} gives ${vRun.toFixed(1)} V while driving`);
  if (five && e.voltage_v.v.max <= 5.5 && /^rpi/.test(board)) problems.push(`a power bank's 5 V leaves ${(vRun - drop).toFixed(1)} V for the motors after the ${short(driver)}`);
  if (vm < 3) problems.push(`only ${vm.toFixed(1)} V reaches the motors after the ${short(driver)}'s ${drop} V drop (TT motors need 3 V)`);
  if (e.voltage_v.v.max > Number(electrical(driver)!.voltage_v.v.max)) problems.push(`the ${b} (${e.voltage_v.v.max} V full) is above the ${short(driver)}'s ${electrical(driver)!.voltage_v.v.max} V limit`);
  return { ok: !problems.length, problems, vm };
}
/** Servos on a battery: two stalled at once (the sketch moves one joint at a time). */
export function servoPower(servos: string[], battery: string): { ok: boolean; problems: string[] } {
  const e = electrical(battery)!, two = servos.map((k) => electrical(k)!.current_a.v.peak).sort((a, b) => b - a).slice(0, 2).reduce((a, x) => a + x, 0);
  const sag = e.voltage_v.v.nom - two * rInt(battery), reg = e.voltage_v.v.max > 6.3, vmin = Math.min(...servos.map((k) => electrical(k)!.voltage_v.v.min));
  const problems: string[] = [], b = short(battery);
  if (two > e.current_a.v.peak) problems.push(`two ${short(servos[0])} servos stalled pull ${two.toFixed(1)} A; the ${b} gives about ${e.current_a.v.peak} A`);
  else if (reg ? sag < 6.5 : sag < vmin * 0.95) problems.push(`the ${b} sags to ${sag.toFixed(1)} V with two servos stalled (${reg ? "the 5 V regulator needs 6.5 V" : `servos need ${vmin} V`})`);
  return { ok: !problems.length, problems };
}

// ------------------------------------------------------------------------------------------------ candidates
interface Cand { kind: OptionKind; label: string; blurb: string; p: Picker; honesty: string[]; designer: PartsOption["designer"]; request: Record<string, unknown>; }

function chooseBattery(p: Picker, ok: (b: string) => { ok: boolean; problems: string[] }, honesty: string[], fallbacks: string[], what: string): string {
  const owned = CAR_BATTERIES.filter((b) => has(b) && (p.left[b] ?? 0) > 0);
  const good = owned.find((b) => ok(b).ok);
  if (good) return p.one([good], null)!;
  const buy = fallbacks.filter(has).find((b) => ok(b).ok) ?? fallbacks.find(has)!;
  if (owned.length) honesty.push(`Your ${short(owned[0])} cannot run ${what} safely: ${ok(owned[0]).problems.join("; ")}. Cheapest fix: a ${short(buy)} (+$${price(buy).toFixed(0)}).`);
  p.buys[buy] = (p.buys[buy] ?? 0) + 1;
  return buy;
}

function carCandidate(inv: Record<string, number>, mission: "obstacle" | "line" | "camera", four: boolean, scan: boolean): Cand | null {
  const p = new Picker(inv), honesty: string[] = [];
  const motors = p.count(["tt_gearmotor_1to48"]);
  if (motors < 1) return null;
  if (four && motors < 3) return null;
  const servoOwned = p.owned(SERVOS);
  if (scan && !(servoOwned && p.count(RANGE) > 0)) return null;
  let board: string;
  if (mission === "camera") {
    const b = p.owned(["rpi4_4gb", "rpi5", "rpi_zero_2w", "esp32_cam"]); if (!b) return null;
    board = p.one([b], null)!;
  } else board = p.one(CAR_BOARDS.filter((b) => has(b) && b !== "esp32_cam"), "arduino_nano_clone")!;
  const nMot = four ? 4 : 2;
  p.n("tt_gearmotor_1to48", nMot); p.n("wheel_65mm_tt", nMot);
  // driver: the user's, else a TB6612FNG; a 4WD car on a 2-channel driver needs two
  let driver = p.one(DRIVERS.filter(has), "tb6612fng_module")!;
  if (four) { if ((p.left[driver] ?? 0) > 0) p.one([driver], null); else p.buys[driver] = (p.buys[driver] ?? 0) + 1; }
  // the L298N's bridge drop: worth a note, and a TB6612FNG if the motors end up below 3 V
  const range = mission === "camera" && board === "esp32_cam" ? null : p.one(RANGE.filter(has), mission === "obstacle" ? "hc_sr04" : null);
  const irOwned = mission === "obstacle" && !range && (p.left.ir_obstacle_fc51 ?? 0) >= 1;
  let line: string | null = null;
  if (mission === "line") {
    if ((p.left.line_sensor_3ch ?? 0) > 0) line = p.one(["line_sensor_3ch"], null);
    else if ((p.left.tcrt5000_module ?? 0) >= 2) { p.n("tcrt5000_module", 2, false); line = "tcrt5000_module"; }
    else return null;
  }
  const camera = mission === "camera" && /^rpi/.test(board) ? p.one(["rpi_camera_module_3"], "rpi_camera_module_3") : null;
  const battery = chooseBattery(p, (b) => carPower(board, driver, b, nMot), honesty, ["pack_2s_18650", "battery_holder_6aa", "lipo_3s_2200"], `the ${nMot} motors and the ${short(board)}`);
  const pw = carPower(board, driver, battery, nMot);
  if (pw.vm < 4.5 && driver === "l298n_module") honesty.push(`The L298N drops about ${part("l298n_module").specs.voltage_drop_v} V: only ${pw.vm.toFixed(1)} V reaches the motors from the ${short(battery)}, so the car is slow. A TB6612FNG (+$${price("tb6612fng_module").toFixed(0)}) drops 0.5 V instead.`);
  if (pw.vm < 3) { driver = "tb6612fng_module"; p.buys[driver] = (p.buys[driver] ?? 0) + (four ? 2 : 1); }
  const vmax = electrical(battery)!.voltage_v.v.max, needs5 = !AVR.includes(board) && vmax > 5.5;
  if (needs5) { const e = electrical(board)!.current_a.v, r = regulatorFor(e.typical + 0.3, e.peak + 0.3).key; p.one([r], r); }
  let scanServo: string | null = null;
  if (scan) { scanServo = p.one(SERVOS.filter(has), null); if (vmax > electrical(scanServo!)!.voltage_v.v.max * 1.05) p.one(["buck_lm2596"], "buck_lm2596"); }
  if (plugIn(board) || plugIn(driver)) p.one(["breadboard_400"], "breadboard_400");
  p.one(["switch_kcd1"], "switch_kcd1");
  if (!four) p.one(["steel_ball_12_7mm"], "steel_ball_12_7mm");
  const extras = ["hc05_bluetooth", "mpu6050_gy521", "buzzer_active_5v"].filter((k) => has(k) && (p.left[k] ?? 0) > 0 && board !== "esp32_cam");
  for (const k of extras) p.one([k], null);
  if (irOwned) p.n("ir_obstacle_fc51", Math.min(2, p.left.ir_obstacle_fc51 ?? 0), false);
  if (irOwned && (inv.ir_obstacle_fc51 ?? 0) < 2) p.n("ir_obstacle_fc51", 1);
  const label = mission === "line" ? `Line follower${range ? " that stops at obstacles" : ""}` : mission === "camera" ? `Camera car (${short(board)})` : `${scan ? "Obstacle-avoiding car with a scanning head" : "Obstacle-avoiding car"}${four ? ", 4WD" : ""}`;
  const blurb = mission === "line" ? "follows a black tape line on a light floor" : mission === "camera" ? "drives and streams what it sees; avoids obstacles when it has a sensor" : scan ? "drives until something is near, looks left and right with the servo, turns to the open side" : "drives until something is near, backs off and turns";
  const request: PartsCarRequest = { mission, wheels: four ? 4 : 2, board, driver, battery, range: mission === "line" ? range : range, scanServo, line, camera, extras, irObstacle: irOwned };
  // the chassis plate is one print: a deck longer than the bed is not offered (a smaller set of the same parts is)
  if (partsCarLength(request) > 250) return null;
  return { kind: mission === "line" ? "line_follower" : mission === "camera" ? "camera_car" : scan ? "scan_car" : four ? "obstacle_car_4wd" : "obstacle_car", label, blurb, p, honesty, designer: "parts_car", request: request as Record<string, unknown> };
}

function armCandidate(inv: Record<string, number>): Cand | null {
  const p = new Picker(inv), honesty: string[] = [];
  const owned = SERVOS.filter((k) => has(k) && (p.left[k] ?? 0) > 0), n = owned.reduce((s, k) => s + (p.left[k] ?? 0), 0);
  if (n < 3) return null;
  const take = Math.min(4, n), servoCounts: Record<string, number> = {};
  // the strongest servos go where the load is: hand the designer the user's servos, weakest first
  const pool = [...owned].sort((a, b) => Number(part(a).specs.rated_torque_nm) - Number(part(b).specs.rated_torque_nm));
  let got = 0;
  for (const k of [...pool].reverse()) while (got < take && (p.left[k] ?? 0) > 0) { p.one([k], null); servoCounts[k] = (servoCounts[k] ?? 0) + 1; got++; }
  const board = p.one(ARM_BOARDS.filter(has), "arduino_nano_clone")!;
  const pca = p.one(["pca9685_clone", "pca9685_16ch"].filter(has), null);
  const servos = Object.entries(servoCounts).flatMap(([k, q]) => Array(q).fill(k) as string[]);
  // supply: an adapter or a battery from the list; else the cheapest that holds two stalled servos
  let supply: string | undefined;
  const adapter = p.owned(["psu_5v4a_adapter"]), allStall = servos.reduce((s, k) => s + electrical(k)!.current_a.v.peak, 0);
  // the designer sizes a mains supply from every servo stalled at once: a 4 A adapter holds up to 4 A of them
  if (adapter && allStall <= 4) p.one([adapter], null);
  else if (adapter) {
    honesty.push(`Your 5 V 4 A adapter is too small for these servos: all ${servos.length} stalled draw ${allStall.toFixed(1)} A. This option uses a 5 V 10 A supply in its own case (+$${(price("psu_5v_lrs50") + price("iec_c14_fused_switched")).toFixed(0)}).`);
    p.buys.psu_5v_lrs50 = 1; p.buys.iec_c14_fused_switched = 1;
  } else {
    const batts = ["battery_holder_4aa", "pack_2s_18650", "battery_holder_6aa", "powerbank_5v_2a"].filter(has);
    const ownedB = batts.find((b) => (p.left[b] ?? 0) > 0 && servoPower(servos, b).ok);
    if (ownedB) { supply = p.one([ownedB], null)!; if (electrical(supply)!.voltage_v.v.max > 6.3) p.one(["buck_lm2596"], "buck_lm2596"); }
    else {
      const anyOwned = batts.find((b) => (p.left[b] ?? 0) > 0);
      const stall = servos.reduce((s, k) => s + electrical(k)!.current_a.v.peak, 0);
      if (anyOwned) honesty.push(`Your ${short(anyOwned)} cannot hold the arm's servos: ${servoPower(servos, anyOwned).problems.join("; ")}. This option uses a 5 V ${stall <= 4 ? "4 A adapter" : "10 A supply"} instead.`);
      if (stall <= 4) p.buys.psu_5v4a_adapter = 1; else p.buys.psu_5v_lrs50 = 1;
      if (stall > 4) p.buys.iec_c14_fused_switched = 1;
    }
  }
  p.one(["switch_kcd1"], "switch_kcd1");
  const sg = servos.every((k) => /sg90|mg90s/.test(k));
  const request: ArduinoArmRequest = { servos: pool, servoCounts, gripper: take >= 4, board: board as ArduinoArmRequest["board"], servoDriver: pca ? (pca as "pca9685_clone") : "direct", ...(supply ? { supply } : {}), payloadKg: servos.every((k) => k === "hobby_sg90") ? 0 : sg ? 0 : servos.some((k) => /mg996|mg995|ds3218/.test(k)) ? 0.05 : 0.02 };
  if (n > take) honesty.push(`The desk arm uses ${take} of your ${n} servos (yaw, shoulder, elbow, claw); the rest stay spare.`);
  return { kind: "servo_arm", label: `Desk arm, ${take === 4 ? "3 joints + claw" : "3 joints"}`, blurb: Number(request.payloadKg) > 0 ? `picks up light things (${Math.round(Number(request.payloadKg) * 1000)} g) on serial commands from the PC` : "moves on serial commands from the PC; micro servos hold the arm itself, not a load at full stretch", p, honesty, designer: "arduino_arm", request: request as Record<string, unknown> };
}

function radarCandidate(inv: Record<string, number>): Cand | null {
  const p = new Picker(inv);
  const servo = p.owned(SERVOS.filter(has)), range = p.owned(RANGE.filter(has));
  if (!servo || !range) return null;
  p.one([servo], null); p.one([range], null);
  const board = p.one([...AVR.filter((b) => b !== "arduino_mega_clone"), "esp32_devkit_v1"].filter(has), "arduino_nano_clone")!;
  if (plugIn(board)) p.one(["breadboard_400"], "breadboard_400");
  const batt = p.owned(["battery_holder_4aa", "pack_2s_18650", "battery_holder_6aa"].filter(has));
  const honesty: string[] = [];
  let battery: string | null = null;
  const stall = electrical(servo)!.current_a.v.peak;
  if (batt) { battery = p.one([batt], null); if (electrical(batt)!.voltage_v.v.max > electrical(servo)!.voltage_v.v.max * 1.05) p.one(["buck_lm2596"], "buck_lm2596"); p.one(["switch_kcd1"], "switch_kcd1"); }
  else if (stall > 0.45) { honesty.push(`A USB port gives 0.5 A and a stalled ${short(servo)} takes ${stall} A, so the board would reset: this option adds a 4 x AA holder for the servo (+$${price("battery_holder_4aa").toFixed(0)}).`); battery = has("battery_holder_4aa") ? "battery_holder_4aa" : null; if (battery) { p.buys[battery] = 1; p.one(["switch_kcd1"], "switch_kcd1"); } }
  const request: RadarRequest = { board, servo, range, battery };
  return { kind: "radar", label: "Ultrasonic radar scanner", blurb: "sweeps the sensor 140 deg and draws a radar screen on the PC", p, honesty, designer: "radar", request: request as Record<string, unknown> };
}

function walkerCandidate(inv: Record<string, number>): Cand | null {
  const p = new Picker(inv), small = ["hobby_sg90", "hobby_mg90s"].filter(has);
  const n = small.reduce((s, k) => s + (p.left[k] ?? 0), 0);
  if (n < 8) return null;
  const counts: Record<string, number> = {};
  // metal-gear micro servos on the knees (they carry the body)
  for (const k of ["hobby_mg90s", "hobby_sg90"]) while ((counts.hobby_mg90s ?? 0) + (counts.hobby_sg90 ?? 0) < 8 && (p.left[k] ?? 0) > 0) { p.one([k], null); counts[k] = (counts[k] ?? 0) + 1; }
  const board = p.one(["arduino_nano_clone", "arduino_nano_v3", "arduino_uno_clone", "arduino_uno_r3", "esp32_devkit_v1"].filter(has), "arduino_nano_clone")!;
  const pca = p.one(["pca9685_clone", "pca9685_16ch"].filter(has), "pca9685_clone")!;
  const honesty: string[] = [];
  const servos = Object.entries(counts).flatMap(([k, q]) => Array(q).fill(k) as string[]);
  const battery = chooseBattery(p, (b) => { const r = servoPower(servos, b); const four = servos.slice(0, 4).map((k) => electrical(k)!.current_a.v.peak).reduce((a, x) => a + x, 0), e = electrical(b)!; return four * 0.5 > e.current_a.v.peak ? { ok: false, problems: [`four standing servos under load draw about ${(four * 0.5).toFixed(1)} A; the ${short(b)} gives ${e.current_a.v.peak} A`] } : r; }, honesty, ["pack_2s_18650"], "eight servos holding the body up");
  if (electrical(battery)!.voltage_v.v.max > 6.3) { const sc = servos.map((k) => electrical(k)!.current_a.v), typ = sc.reduce((a, r) => a + r.typical, 0), r = regulatorFor(typ, typ + 2 * Math.max(...sc.map((x) => x.peak - x.typical))).key; p.one([r], r); }
  p.one(["switch_kcd1"], "switch_kcd1");
  if (plugIn(board)) p.one(["breadboard_400"], "breadboard_400");
  const request: WalkerRequest = { board, servoCounts: counts, battery, servoDriver: pca };
  return { kind: "walker", label: "Four-legged walker (8 servos)", blurb: "a small quadruped that creeps forward one leg at a time", p, honesty, designer: "servo_walker", request: request as Record<string, unknown> };
}

/** WALL-E is built from its own parts list: offered when the list already has most of it. */
function walleCandidate(inv: Record<string, number>): Cand | null {
  const need: [string, number][] = [["arduino_nano_clone", 1], ["breadboard_400", 1], ["buck_lm2596", 2], ["hc_sr04", 1], ["hobby_mg90s", 2], ["hobby_sg90", 6], ["pack_2s_18650", 1], ["pca9685_clone", 1], ["switch_kcd1", 1], ["tb6612fng_module", 2], ["tt_gearmotor_1to48", 4], ["wheel_65mm_tt", 4]];
  if ((inv.tt_gearmotor_1to48 ?? 0) < 2 || SERVOS.reduce((s, k) => s + (inv[k] ?? 0), 0) < 4) return null;
  const p = new Picker(inv);
  for (const [k, q] of need) { const alt = k === "arduino_nano_clone" ? ["arduino_nano_clone", "arduino_nano_v3"] : k === "pca9685_clone" ? ["pca9685_clone", "pca9685_16ch"] : [k]; for (let i = 0; i < q; i++) p.one(alt, k); }
  return { kind: "wall_e", label: "WALL-E (Arduino replica)", blurb: "tank tracks, pan and tilt eyes, two arms with hands; avoids obstacles", p, honesty: ["WALL-E is built from its own parts list (Nano, two TB6612FNG, a PCA9685): your other boards and drivers are not swapped in."], designer: "arduino_walle", request: {} };
}



function toOption(c: Cand, inv: Record<string, number>, total: number): PartsOption {
  const used = Object.values(c.p.uses).reduce((a, b) => a + b, 0);
  const extra = +Object.entries(c.p.buys).reduce((s, [k, q]) => s + price(k) * q, 0).toFixed(2);
  const buyText = Object.entries(c.p.buys).sort((a, b) => price(b[0]) * b[1] - price(a[0]) * a[1]).map(([k, q]) => `${q}x ${short(k)}`).join(", ");
  const headline = `uses ${used}/${total} of your parts, ${extra > 0 ? `needs +$${extra < 10 ? extra.toFixed(1).replace(/\.0$/, "") : extra.toFixed(0)} (${buyText})` : "nothing to buy"}`;
  // more of the list used is better; every dollar to buy costs a little; a safety fix costs more
  const score = +(used / Math.max(1, total) - extra / (extra + 60) - c.honesty.filter((h) => /cannot/.test(h)).length * 0.05).toFixed(4);
  void inv;
  const id = `${c.kind}`;
  return { id, kind: c.kind, label: c.label, blurb: c.blurb, uses: c.p.uses, buys: c.p.buys, used_count: used, inventory_count: total, extra_usd: extra, headline, honesty: c.honesty, score, designer: c.designer, request: c.request, thumbnail: `parts/${c.kind}.png` };
}

/** Every robot the parts list can build, best first. */
export function rankOptions(inventory: Inventory): PartsOption[] {
  const inv = counts(inventory), total = Object.values(inv).reduce((a, b) => a + b, 0);
  const cands = [
    carCandidate(inv, "obstacle", false, true), carCandidate(inv, "obstacle", false, false), carCandidate(inv, "obstacle", true, false), carCandidate(inv, "obstacle", true, true),
    carCandidate(inv, "line", false, false), carCandidate(inv, "line", true, false), carCandidate(inv, "camera", false, false),
    armCandidate(inv), radarCandidate(inv), walkerCandidate(inv), walleCandidate(inv),
  ].filter((c): c is Cand => !!c);
  const opts = cands.map((c) => toOption(c, inv, total));
  // one card per kind (the 4WD scan car counts as a scan car), best first
  const seen = new Map<string, PartsOption>();
  for (const o of opts.sort((a, b) => b.score - a.score)) {
    const k = o.kind === "obstacle_car_4wd" && o.request.scanServo ? "scan_car" : o.kind;
    if (!seen.has(k)) { o.id = k === o.kind ? o.id : `${o.kind}_scan`; seen.set(k, o); }
  }
  return [...seen.values()];
}

// ------------------------------------------------------------------------------------------------ designing an option
const DESIGN_CACHE = new Map<string, RobotSpecification>();
function design(o: PartsOption, prompt?: string): RobotSpecification {
  const key = `${o.designer}:${JSON.stringify(o.request)}`;
  const hit = DESIGN_CACHE.get(key);
  if (hit) return structuredClone(hit);
  const name = o.kind === "wall_e" ? "wall_e" : o.kind;
  const s = o.designer === "parts_car" ? designPartsCar({ name, prompt, ...(o.request as PartsCarRequest) })
    : o.designer === "arduino_arm" ? designArduinoArm({ name: "parts_arm", prompt, ...(o.request as ArduinoArmRequest) })
    : o.designer === "radar" ? designRadar({ name: "radar_scanner", prompt, ...(o.request as RadarRequest) })
    : o.designer === "servo_walker" ? designServoWalker({ name: "servo_walker", prompt, ...(o.request as WalkerRequest) })
    : designArduinoWallE({ name: "wall_e", prompt });
  DESIGN_CACHE.set(key, structuredClone(s));
  if (DESIGN_CACHE.size > 24) DESIGN_CACHE.delete(DESIGN_CACHE.keys().next().value!);
  return s;
}

/** Mark the design with the user's parts: the bill of materials then splits every line into "you have it" and "to buy". */
export function markOwned(robot: RobotSpecification, inventory: Inventory) {
  (robot.metadata as unknown as Record<string, unknown>).inventory = { owned: counts(inventory), unknown: inventory.unknown.map((u) => u.raw), extras: inventory.extras.map((e) => e.what) };
}
export function shoppingList(bom: BillOfMaterials): ShoppingLine[] {
  const out: ShoppingLine[] = [];
  for (const l of bom.lines) {
    const buy = l.buy ?? l.qty; if (!(buy > 0) || !(l.unit_cost > 0)) continue;
    const url = (l.note ?? "").match(/https?:\/\/\S+$/)?.[0] ?? null;
    out.push({ key: l.key ?? null, name: l.name, qty: buy, unit_usd: l.unit_cost, subtotal_usd: +(buy * l.unit_cost).toFixed(2), url, why: l.category });
  }
  return out;
}

export function designOption(o: PartsOption, inventory: Inventory, prompt?: string): PartsDesign {
  const robot = design(o, prompt);
  markOwned(robot, inventory);
  const bom = buildBom(robot);
  const d = (robot.metadata as { design?: { checks: { name: string; pass: boolean }[]; summary: string; assumptions: string[] } }).design!;
  for (const h of o.honesty) if (!d.assumptions.includes(h)) d.assumptions.push(h);
  const failing = d.checks.filter((c) => !c.pass && c.name !== "budget").map((c) => c.name);
  const shopping = shoppingList(bom);
  return { option: o, robot, bom, failing, shopping, to_buy_usd: +shopping.reduce((s, l) => s + l.subtotal_usd, 0).toFixed(2), summary: d.summary };
}

/** The cheapest way to a robot when the list builds nothing: what to add. */
function cannotBuild(inventory: Inventory): FromPartsResult["cannot"] {
  const inv = counts(inventory), have = (ks: string[]) => ks.some((k) => (inv[k] ?? 0) > 0);
  const servos = SERVOS.reduce((s, k) => s + (inv[k] ?? 0), 0), motors = inv.tt_gearmotor_1to48 ?? 0;
  const reason = !Object.keys(inv).length ? "the list has no parts I recognise"
    : !servos && !motors ? "nothing on the list moves: there is no motor or servo"
    : motors === 1 && !servos ? "one motor cannot steer a car" : servos && servos < 3 && !have(RANGE) ? `${servos} servo${servos > 1 ? "s are" : " is"} too few for an arm and there is no distance sensor for a radar` : "the parts do not add up to a robot that moves safely";
  // add the cheapest parts that make an obstacle car (or a radar when there is a servo)
  const add: { key: string; qty: number; usd: number }[] = [];
  const need = (k: string, q: number) => { const miss = q - (inv[k] ?? 0); if (miss > 0 && has(k)) add.push({ key: k, qty: miss, usd: +(miss * price(k)).toFixed(2) }); };
  let then: string;
  if (servos && !have(RANGE)) { need("hc_sr04", 1); if (!have(CAR_BOARDS)) need("arduino_nano_clone", 1); then = "an ultrasonic radar scanner"; }
  else { need("tt_gearmotor_1to48", 2); need("wheel_65mm_tt", 2); if (!have(DRIVERS)) need("tb6612fng_module", 1); if (!have(CAR_BOARDS)) need("arduino_nano_clone", 1); if (!have(RANGE)) need("hc_sr04", 1); if (!have(["pack_2s_18650"])) need("pack_2s_18650", 1); then = "an obstacle-avoiding car"; }
  return { reason, add, then };
}

/** Rank what the parts can build and design the options asked for (by default the best one). */
export function fromParts(input: InventoryInput, opts: FromPartsOptions = {}): FromPartsResult {
  const inventory = toInventory(input), notes = [...inventory.notes];
  for (const u of inventory.unknown) notes.push(`not recognised: "${u.raw}"${u.suggestions.length ? ` (closest: ${u.suggestions.map((s) => s.name.split(" (")[0]).join(", ")})` : ""}`);
  for (const i of inventory.items) if (i.assumed) notes.push(`"${i.raw}" read as ${i.assumed}: say the model if it is something else`);
  const all = rankOptions(inventory);
  const total = inventory.items.reduce((s, i) => s + i.qty, 0);
  // an option that buys more than it uses of the list is not "from your parts"
  const fromList = all.filter((o) => o.used_count >= Math.min(2, total));
  const options = (fromList.length ? fromList : []).slice(0, opts.limit ?? 3);
  const designs: Record<string, PartsDesign> = {};
  const want = opts.design ?? "top";
  const toDesign = want === "none" ? [] : want === "all" ? options : want === "top" ? options.slice(0, 1) : all.filter((o) => o.id === want);
  for (const o of toDesign) designs[o.id] = designOption(o, inventory, opts.prompt);
  const result: FromPartsResult = { inventory, options, designs, notes };
  if (!options.length) result.cannot = cannotBuild(inventory);
  if (opts.budget !== undefined) for (const o of options) if (o.extra_usd > opts.budget) notes.push(`${o.label} needs $${o.extra_usd.toFixed(0)} of parts, over your $${opts.budget}`);
  return result;
}
