// Boards and motor drivers as the parts-built designs wire them: which pins each board offers for PWM, plain I/O, inputs,
// servos, I2C and a serial port (in the order a careful builder would take them), how each board is powered, and how each
// driver's control and motor pins are wired. The sketch generator reads the pins back from the firmware record.
import { part, electrical } from "@ttr/parts";
import type { Harness } from "../wiring.ts";

/** What the sketch needs to know: every pin by its role, on the board's own pin names. */
export interface FirmwareRecord {
  board: string; fqbn: string; language: "arduino" | "python";
  mission: string;
  drive?: { driver: string; motors: number; drivers: number; pins: Record<string, Record<string, string>>; pwm_cap?: number };
  sensors: Record<string, Record<string, string | number>>;
  servos: Record<string, { pin: string; key: string; centre_deg: number; range_deg: [number, number]; channel?: number }>;
  servo_driver?: { key: string; sda: string; scl: string; address: string };
  notes: string[];
}

export interface BoardProfile {
  key: string; fqbn: string; language: "arduino" | "python";
  /** logic level of the I/O pins */
  io: 5 | 3.3;
  /** "vin": takes the battery on VIN through its own regulator; "5v": needs a regulated 5 V */
  supply: "vin" | "5v";
  minIn: number; watts: number;
  vin5: string; gnd: string; logicPin: string;
  pwm: string[]; digital: string[]; input: string[]; servo: string[]; i2c: [string, string]; uart: [string, string];
  csiPort?: string; cameraPort?: string;
  /** wire the board's supply from `rail`; returns the logic rail sensors run from */
  powerFrom(H: Harness, rail: string): string;
  /** board fed from a 5 V rail: returns the logic rail */
  logicRail(H: Harness, rail: string): string;
  fiveOut?(H: Harness): string;
}

const AVR_UNO = { pwm: ["D5", "D6", "D3", "D11", "D9", "D10"], digital: ["D7", "D8", "D4", "D2", "D12", "D13", "A0", "A1", "A2", "A3"], input: ["A0", "A1", "A2", "A3", "D12", "D13", "D2", "D4"], servo: ["D9", "D10", "D12", "D13", "A0", "A1", "A2", "A3", "D2", "D4", "D7", "D8"], i2c: ["A4", "A5"] as [string, string], uart: ["D2", "D4"] as [string, string] };
const avr = (key: string, fqbn: string, five = "5V"): BoardProfile => ({
  key, fqbn, language: "arduino", io: 5, supply: "vin", minIn: electrical(key)?.voltage_v.v.min ?? 7, watts: 0.4, vin5: five, gnd: "GND", logicPin: "5V", ...AVR_UNO,
  powerFrom(H, rail) { H.regulator("controller", rail, "5V_LOGIC", { vin: "VIN", gin: "GND", vout: "5V", gout: "GND", volts: 5, cont: 0.2, peakLimit: 0.4 }); return "5V_LOGIC"; },
  logicRail(H, rail) { H.feed(rail, "controller", { v: five, g: "GND" }); H.net("5V_LOGIC", "power", 5); return rail; },
});
const MEGA = { pwm: ["D5", "D6", "D3", "D2", "D7", "D8", "D4", "D13"], digital: ["D22", "D23", "D24", "D25", "D26", "D27", "D28", "D29", "D30", "D31", "D32", "D33"], input: ["D34", "D35", "D36", "D37", "D38", "D39", "A0", "A1", "A2", "A3"], servo: ["D9", "D10", "D11", "D12", "D40", "D41", "D42", "D43", "D47", "D48", "D49", "D50"], i2c: ["D20", "D21"] as [string, string], uart: ["D19", "D18"] as [string, string] };
const ESP_V1 = { pwm: ["GPIO25", "GPIO26", "GPIO27", "GPIO14", "GPIO32", "GPIO33", "GPIO13", "GPIO23"], digital: ["GPIO19", "GPIO18", "GPIO5", "GPIO17", "GPIO16", "GPIO4", "GPIO23", "GPIO13"], input: ["GPIO34", "GPIO35", "GPIO39", "GPIO36", "GPIO4", "GPIO16"], servo: ["GPIO13", "GPIO12", "GPIO15", "GPIO2", "GPIO4", "GPIO16", "GPIO17", "GPIO5", "GPIO18", "GPIO19", "GPIO23", "GPIO32"], i2c: ["GPIO21", "GPIO22"] as [string, string], uart: ["GPIO16", "GPIO17"] as [string, string] };
const ESP_S3 = { pwm: ["4", "5", "6", "7", "15", "16", "17", "18"], digital: ["1", "2", "42", "41", "40", "39", "38", "37"], input: ["1", "2", "42", "41", "40", "39"], servo: ["10", "11", "12", "13", "14", "21", "47", "48", "35", "36", "45", "0"], i2c: ["8", "9"] as [string, string], uart: ["3", "46"] as [string, string] };
const PI = { pwm: ["GPIO12", "GPIO13", "GPIO18", "GPIO19", "GPIO20", "GPIO21"], digital: ["GPIO5", "GPIO6", "GPIO16", "GPIO26", "GPIO22", "GPIO27", "GPIO17", "GPIO23"], input: ["GPIO24", "GPIO25", "GPIO8", "GPIO7", "GPIO9", "GPIO10", "GPIO11"], servo: ["GPIO18", "GPIO19", "GPIO12", "GPIO13", "GPIO4", "GPIO17", "GPIO27", "GPIO22"], i2c: ["GPIO2", "GPIO3"] as [string, string], uart: ["GPIO15", "GPIO14"] as [string, string] };
const ESPCAM = { pwm: ["GPIO12", "GPIO13", "GPIO14", "GPIO15"], digital: ["GPIO2", "GPIO4"], input: ["GPIO2", "GPIO4"], servo: ["GPIO2", "GPIO4"], i2c: ["GPIO14", "GPIO15"] as [string, string], uart: ["U0R", "U0T"] as [string, string] };

/** a 3.3 V board on a regulated 5 V rail: its own regulator makes the 3.3 V logic rail */
const three = (key: string, fqbn: string, pins: typeof ESP_V1, o: { vin5: string; gnd: string; out: string; cont: number; peak: number; watts: number; language?: "arduino" | "python"; csi?: string; camera?: string }): BoardProfile => ({
  key, fqbn, language: o.language ?? "arduino", io: 3.3, supply: "5v", minIn: 4.75, watts: o.watts, vin5: o.vin5, gnd: o.gnd, logicPin: o.out, ...pins, ...(o.csi ? { csiPort: o.csi } : {}), ...(o.camera ? { cameraPort: o.camera } : {}),
  powerFrom(H, rail) { H.regulator("controller", rail, "3V3_LOGIC", { vin: o.vin5, gin: o.gnd, vout: o.out, gout: o.gnd, volts: 3.3, cont: o.cont, peakLimit: o.peak }); return "3V3_LOGIC"; },
  logicRail(H, rail) { void rail; H.rail("3V3_LOGIC", { source: "controller", out: o.out, gnd: o.gnd, volts: 3.3, cont: o.cont, peakLimit: o.peak }); return "3V3_LOGIC"; },
});

export function boardProfile(key: string): BoardProfile {
  switch (key) {
    case "arduino_uno_clone": return avr(key, "arduino:avr:uno");
    case "arduino_uno_r3": return avr(key, "arduino:avr:uno");
    case "arduino_nano_clone": return avr(key, "arduino:avr:nano:cpu=atmega328");
    case "arduino_nano_v3": return avr(key, "arduino:avr:nano");
    case "arduino_mega_clone": return { ...avr(key, "arduino:avr:mega"), ...MEGA, watts: 0.6 };
    case "esp32_devkit_v1": return three(key, "esp32:esp32:esp32doit-devkit-v1", ESP_V1, { vin5: "VIN", gnd: "GND", out: "3V3", cont: 0.3, peak: 0.5, watts: 0.6 });
    case "esp32_s3_devkitc1": return three(key, "esp32:esp32:esp32s3", ESP_S3, { vin5: "5V", gnd: "G", out: "3V3", cont: 0.3, peak: 0.5, watts: 0.6 });
    case "esp32_cam": return three(key, "esp32:esp32:esp32cam", ESPCAM, { vin5: "5V", gnd: "GND", out: "3V3", cont: 0.15, peak: 0.3, watts: 1.2 });
    case "rpi4_4gb": return three(key, "raspberry-pi-4", PI, { vin5: "@power", gnd: "GND", out: "3V3", cont: 0.3, peak: 0.5, watts: 4.0, language: "python", csi: "csi" });
    case "rpi5": return three(key, "raspberry-pi-5", PI, { vin5: "VBUS", gnd: "GND", out: "3V3", cont: 0.3, peak: 0.5, watts: 5.0, language: "python", csi: "cam_dsi_0", camera: "host_end_pi5" });
    case "rpi_zero_2w": return three(key, "raspberry-pi-zero-2w", PI, { vin5: "@power", gnd: "GND", out: "3V3", cont: 0.3, peak: 0.5, watts: 2.0, language: "python", csi: "csi", camera: "host_end_pi5" });
    default: throw new Error(`no pin plan for board ${key}`);
  }
}
export const BOARDS = ["arduino_uno_clone", "arduino_uno_r3", "arduino_nano_clone", "arduino_nano_v3", "arduino_mega_clone", "esp32_devkit_v1", "esp32_s3_devkitc1", "esp32_cam", "rpi4_4gb", "rpi5", "rpi_zero_2w"];

/** Hands out a board's pins by job, never the same pin twice. Servo pins come off the timer the Servo library uses. */
export class PinPlan {
  used = new Set<string>();
  /** every pin handed out, in order; `replay` hands the same ones out again (a second driver on the same signals) */
  log: string[] = []; replay: string[] = [];
  b: BoardProfile; servos: boolean;
  constructor(b: BoardProfile, servos = false) { this.b = b; this.servos = servos; }
  private take(list: string[], what: string): string {
    if (this.replay.length) return this.replay.shift()!;
    const p = list.find((x) => !this.used.has(x) && !(this.servos && this.b.io === 5 && this.b.key.includes("uno") && (x === "D9" || x === "D10") && what === "pwm"));
    if (!p) throw new Error(`${part(this.b.key).name}: no free ${what} pin left (used ${[...this.used].join(", ")})`);
    this.used.add(p); this.log.push(p); return p;
  }
  pwm() { return this.take(this.b.pwm, "pwm"); }
  digital() { return this.take([...this.b.digital, ...this.b.pwm], "digital"); }
  input() { return this.take([...this.b.input, ...this.b.digital], "input"); }
  servo() { return this.take([...this.b.servo, ...this.b.digital], "servo"); }
  i2c(): [string, string] { for (const p of this.b.i2c) this.used.add(p); return this.b.i2c; }
  uart(): [string, string] { const [rx, tx] = this.b.uart; this.used.add(rx); this.used.add(tx); return [rx, tx]; }
  free() { return this.b.pwm.length + this.b.digital.length - this.used.size; }
}

export interface DriverProfile {
  key: string; label: string; channels: number; contA: number; peakA: number;
  /** voltage lost across the bridge at a motor current */
  drop(a: number): number;
  /** wire the driver: supply, control pins (from `pins`), up to `channels` motors. Returns role -> board pin. */
  wire(H: Harness, d: string, logic: string, pins: PinPlan, motors: string[]): Record<string, string>;
}
/** motor current counted on the driver's feed from VBAT */
function motorWires(H: Harness, d: string, outs: [string, string][], motors: string[]) {
  const feed = H.rails.get("VBAT")!.feeds.find((x) => x.inst === d)!;
  outs.forEach(([o1, o2], k) => {
    const m = motors[k]; if (!m) { H.spare(`${d}.${o1}`, `${d}.${o2}`); return; }
    const n = `${m}_PHASE`.toUpperCase(), r = H.rec(m).current_a.v;
    H.net(`${n}_1`, "signal"); H.net(`${n}_2`, "signal");
    H.wire(`${n}_1`, `${d}.${o1}`, `${m}.M+`, { typ: r.typical, peak: r.peak }); H.wire(`${n}_2`, `${d}.${o2}`, `${m}.M-`, { typ: r.typical, peak: r.peak });
    feed.typ += r.typical; feed.peak += r.peak;
  });
}
const sp = (k: string) => part(k).specs;
const pinNames = (k: string) => new Set((electrical(k)?.ports ?? []).flatMap((p) => p.pins.v.map((x) => x.name)));
/** the first of these names the part's record has */
const pick = (k: string, ...names: string[]) => { const have = pinNames(k); return names.find((n) => have.has(n)) ?? names[0]; };

export function driverProfile(key: string): DriverProfile {
  const e = electrical(key);
  const contA = Number(sp(key).current_a ?? e?.current_a.v.typical ?? 1), peakA = Number(sp(key).peak_current_a ?? e?.current_a.v.peak ?? contA);
  const vdrop = Number(sp(key).voltage_drop_v ?? 0.5);
  const base = { key, contA, peakA, channels: Number(sp(key).channels ?? 2), drop: (a: number) => vdrop * Math.min(1, 0.6 + 0.4 * a) };
  if (key === "l298n_module") return { ...base, label: "L298N", drop: () => vdrop,
    wire(H, d, _logic, pins, motors) {
      H.feed("VBAT", d, { v: "+12V", g: "GND", typ: 0.04, peak: 0.04 });
      H.spare(`${d}.power.+5V Power`, `${d}.jumpers`);
      const few = pins.replay.length ? pins.replay.length === 4 : pins.free() < 8;
      const r: Record<string, string> = few ? {} : { ENA: pins.pwm(), ENB: pins.pwm() };
      for (const k of ["IN1", "IN2", "IN3", "IN4"]) r[k] = few ? pins.pwm() : pins.digital();
      H.signals("controller", d, Object.entries(r).map(([k, p]) => [p, k] as [string, string]));
      if (few) H.spare(`${d}.logic.ENA`, `${d}.logic.ENB`);
      motorWires(H, d, [["OUT1", "OUT2"], ["OUT3", "OUT4"]], motors);
      return r;
    } };
  if (key === "tb6612fng_module") return { ...base, label: "TB6612FNG",
    wire(H, d, logic, pins, motors) {
      H.feed("VBAT", d, { v: "VM", g: "GND", typ: 0.01, peak: 0.01 });
      H.feed(logic, d, { v: "VCC", g: "", typ: 0.002, peak: 0.002 });
      const r = { PWMA: pins.pwm(), AIN1: pins.digital(), AIN2: pins.digital(), PWMB: pins.pwm(), BIN1: pins.digital(), BIN2: pins.digital() };
      H.signals("controller", d, Object.entries(r).map(([k, p]) => [p, k] as [string, string]));
      const st = `${d}_STBY`.toUpperCase(); H.net(st, "signal"); H.wire(st, `controller.${pins.b.logicPin}`, `${d}.STBY`);
      motorWires(H, d, [["AO1", "AO2"], ["BO1", "BO2"]], motors);
      return r;
    } };
  if (key === "drv8833_module") return { ...base, label: "DRV8833",
    wire(H, d, logic, pins, motors) {
      H.feed("VBAT", d, { v: pick(key, "VM", "VMM", "VCC"), g: "GND", typ: 0.01, peak: 0.01 });
      void logic;
      const r = { AIN1: pins.pwm(), AIN2: pins.pwm(), BIN1: pins.pwm(), BIN2: pins.pwm() };
      H.signals("controller", d, Object.entries(r).map(([k, p]) => [p, k] as [string, string]));
      const sl = `${d}_SLEEP`.toUpperCase(); H.net(sl, "signal"); H.wire(sl, `controller.${pins.b.logicPin}`, `${d}.${pick(key, "EEP", "SLP", "nSLEEP", "STBY")}`);
      for (const n of ["ULT", "nFAULT", "FAULT"]) if (pinNames(key).has(n)) H.spare(`${d}.${n}`);
      motorWires(H, d, [[pick(key, "AOUT1", "OUT1"), pick(key, "AOUT2", "OUT2")], [pick(key, "BOUT1", "OUT3"), pick(key, "BOUT2", "OUT4")]], motors);
      return r;
    } };
  if (key === "l9110s_module") return { ...base, label: "L9110S",
    wire(H, d, _logic, pins, motors) {
      H.feed("VBAT", d, { v: pick(key, "VCC", "VM"), g: "GND", typ: 0.01, peak: 0.01 });
      const names = [pick(key, "A-1A", "A1A", "IA1"), pick(key, "A-1B", "A1B", "IB1"), pick(key, "B-1A", "B1A", "IA2"), pick(key, "B-1B", "B1B", "IB2")];
      const r: Record<string, string> = { A1A: pins.pwm(), A1B: pins.digital(), B1A: pins.pwm(), B1B: pins.digital() };
      H.signals("controller", d, Object.values(r).map((p, i) => [p, names[i]] as [string, string]));
      const outs = [...pinNames(key)].filter((n) => /mot|out/i.test(n));
      motorWires(H, d, [[outs[0] ?? "MOTOR_A+", outs[1] ?? "MOTOR_A-"], [outs[2] ?? "MOTOR_B+", outs[3] ?? "MOTOR_B-"]], motors);
      return r;
    } };
  throw new Error(`no wiring for motor driver ${key}`);
}
export const DRIVERS = ["tb6612fng_module", "l298n_module", "drv8833_module", "l9110s_module"];

/** A 5 V step-down for a load: the LM2596 module up to 2 A running / 3 A peak, else the Pololu D36V50F5 (5.5 A). */
export function regulatorFor(typA: number, peakA: number): { key: string; label: string; pins: { vin: string; gin: string; vout: string; gout: string }; spare: string[] } {
  if (typA <= 1.8 && peakA <= 2.8) return { key: "buck_lm2596", label: "LM2596 set to 5.0 V", pins: { vin: "IN+", gin: "IN-", vout: "OUT+", gout: "OUT-" }, spare: [] };
  return { key: "buck_5v_5a", label: "Pololu 5 V 5.5 A step-down", pins: { vin: "VIN", gin: "GND", vout: "VOUT", gout: "GND" }, spare: ["power_and_control.EN", "power_and_control.PG", "power_and_control.VRP"] };
}
