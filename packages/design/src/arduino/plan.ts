// What an Arduino sketch for a robot has to drive, read from the robot's wiring record alone: the board, every wire that
// ends on it, the driver or sensor on the other end, the motor or servo behind that driver, and the joint a servo turns.
// Nothing here knows a robot family: a pin is used only because the record wires it.
import type { RobotSpecification, Joint } from "@ttr/robot-schema";
import { CATALOG, electrical } from "@ttr/parts";
import type { DesignRecord } from "../assembly.ts";
import type { WiringRecord, WireRec } from "../wiring.ts";
import { fk, descendants, rpyToR } from "../kin.ts";

export interface FirmwarePin {
  /** the pin as printed on the board: "D5", "A0" */
  pin: string;
  /** its Arduino pin number (A0 is 14 on an ATmega328P board) */
  number: number;
  /** pwm: analogWrite; output / input: digital; i2c: the Wire bus; servo: Servo library pulses; unused: wired, but nothing in the sketch drives it */
  mode: "pwm" | "output" | "input" | "i2c" | "servo" | "unused";
  /** what the pin does, in words */
  drives: string;
  /** the wires of the record that end on this pin (one, or one per board on an I2C bus) */
  wires: { id: string; net: string; from: string; to: string }[];
}
export interface FirmwareBoard { instance: string; key: string; name: string; fqbn: string; mcu: string; pwm_pins: number[]; }
export interface MotorPlan {
  name: string; key: string; driver: string; driver_key: string; channel: string;
  /** board pins: speed (PWM enable) and the two direction inputs */
  pwm: number; pwm_is_pwm: boolean; in1: number; in2: number;
  side: "left" | "right" | null;
  /** +1 when IN1 high drives the robot forwards with the leads as wired, -1 when IN2 does (mirrored motor, or leads swapped in the record) */
  forward: 1 | -1;
}
export interface ServoPlan {
  name: string; key: string;
  /** through a PCA9685 (board index, channel) or straight from a board pin */
  via: { board: number; channel: number } | { pin: number };
  /** pulse widths at the two ends of the servo's travel and that travel, from the catalog */
  pulse_us: [number, number]; range_deg: number;
  /** the joint the servo turns (null: none found, the servo is held at its centre) */
  joint: string | null;
  /** joint angles in degrees: the robot's limits cut to what the servo can reach about its centre, and the home angle */
  lower_deg: number; upper_deg: number; home_deg: number;
  /** the joint's speed limit in deg/s (the speed the servo reaches carrying its load, where the design worked it out) */
  max_dps: number | null;
  /**
   * The two angles the pose sequence visits, towards the upper and the lower limit (null: that side is not visited,
   * because it is shorter than POSE_MIN_DEG or because the links would go under the surface the robot stands on).
   */
  visit_deg: [number | null, number | null];
  /** the joint's own limits when the servo cannot reach them */
  cut_from?: [number, number];
}
export interface PcaPlan { name: string; key: string; address: number; }
export interface RangePlan { name: string; key: string; trig: number; echo: number; range_cm: [number, number]; }
export interface Plan {
  board: FirmwareBoard; pins: FirmwarePin[]; motors: MotorPlan[]; servos: ServoPlan[]; pca: PcaPlan[]; range: RangePlan | null;
  /** board pins wired to a driver's standby input: held high */
  standby: { pin: number; driver: string }[];
  /** highest PWM duty (0..255) the motors may see: their rated voltage over the full pack's */
  pwm_max: number; pwm_max_why: string;
  /** seconds for a quarter turn on the spot at the design's turn rate, when the design states one */
  quarter_turn_s: number | null;
  notes: string[];
}

interface End { inst: string; port: string; pin: string; }
const endOf = (t: string): End => { const a = t.indexOf("."), b = t.indexOf(".", a + 1); return { inst: t.slice(0, a), port: t.slice(a + 1, b), pin: t.slice(b + 1) }; };
const short = (n: string) => n.split(" (")[0].trim();
const deg = (rad: number) => (rad * 180) / Math.PI;
/** how far a joint leaves home in the pose sequence, as a share of the way to its limit */
export const POSE_REACH = 0.6;
/** a side of a joint's range shorter than this is not visited */
export const POSE_MIN_DEG = 3;
/** room the pose sequence keeps above the surface the robot stands on (mm) */
export const FLOOR_CLEAR_MM = 5;

/** H-bridge boards I have code for: per channel the speed input, the two direction inputs and the two motor outputs. */
const BRIDGES: Record<string, { label: string; standby?: string; channels: { id: string; pwm: string; in1: string; in2: string; out1: string; out2: string }[] }> = {
  tb6612fng: { label: "TB6612FNG", standby: "STBY", channels: [{ id: "A", pwm: "PWMA", in1: "AIN1", in2: "AIN2", out1: "AO1", out2: "AO2" }, { id: "B", pwm: "PWMB", in1: "BIN1", in2: "BIN2", out1: "BO1", out2: "BO2" }] },
  l298n: { label: "L298N", channels: [{ id: "A", pwm: "ENA", in1: "IN1", in2: "IN2", out1: "OUT1", out2: "OUT2" }, { id: "B", pwm: "ENB", in1: "IN3", in2: "IN4", out1: "OUT3", out2: "OUT4" }] },
};
const bridgeOf = (key: string) => Object.entries(BRIDGES).find(([k]) => key.startsWith(k))?.[1];

/** The Arduino-class AVR board of a wiring record (its catalog entry carries an arduino:avr FQBN), if there is one. */
export function firmwareBoard(w: WiringRecord): FirmwareBoard | null {
  for (const i of w.instances) {
    const c = CATALOG[i.key], fqbn = String(c?.specs.fqbn ?? "");
    if (c && fqbn.startsWith("arduino:avr:")) return { instance: i.name, key: i.key, name: c.name, fqbn, mcu: String(c.specs.mcu ?? "ATmega328P"), pwm_pins: [...((c.specs.pwm_pins as number[] | undefined) ?? [])] };
  }
  return null;
}

/** Read the record: null when it has no Arduino-class board. */
export function plan(spec: RobotSpecification, w: WiringRecord): Plan | null {
  const board = firmwareBoard(w);
  if (!board) return null;
  const design = (spec.metadata as { design?: DesignRecord }).design;
  const notes: string[] = [], keyOf = new Map(w.instances.map((i) => [i.name, i.key]));
  const wires: (WireRec & { a: End; b: End })[] = w.cables.flatMap((c) => c.wires).map((x) => ({ ...x, a: endOf(x.from), b: endOf(x.to) }));
  /** the far end of every wire on one pin of an instance (by the pin's printed name, any port) */
  const peers = (inst: string, pin: string) => wires.flatMap((x) => (x.a.inst === inst && short(x.a.pin) === pin ? [{ wire: x, far: x.b }] : x.b.inst === inst && short(x.b.pin) === pin ? [{ wire: x, far: x.a }] : []));

  // ---- the board's own pins: D<n> and A<n> are GPIO; the Uno's extra SDA / SCL header pins are A4 / A5
  const i2c = /(A\d+) SDA, (A\d+) SCL/.exec(String(CATALOG[board.key].specs.i2c ?? "")) ?? ["", "A4", "A5"];
  const gpio = (printed: string): { pin: string; number: number } | null => {
    const n = short(printed).split("/")[0], alias = n === "SDA" ? i2c[1] : n === "SCL" ? i2c[2] : n;
    const d = /^D(\d+)$/.exec(alias), a = /^A(\d+)$/.exec(alias);
    return d ? { pin: alias, number: Number(d[1]) } : a ? { pin: alias, number: 14 + Number(a[1]) } : null;
  };
  const pins = new Map<string, FirmwarePin>(), clash = new Set<string>();
  /** claim the board pin on the far side of a wire for one job */
  const claim = (x: { wire: WireRec; far: End }, mode: FirmwarePin["mode"], drives: string): number | null => {
    const g = gpio(x.far.pin);
    if (!g) return null;
    const rec = { id: x.wire.id, net: x.wire.net, from: x.wire.from, to: x.wire.to }, had = pins.get(g.pin);
    if (had && had.mode === "i2c" && mode === "i2c") { had.wires.push(rec); if (!had.drives.includes(drives)) had.drives += `, ${drives}`; return g.number; }
    if (had) { clash.add(g.pin); notes.push(`Pin ${g.pin} is wired to two things (${had.drives}; ${drives}): the sketch drives only the first. Fix the wiring.`); return null; }
    pins.set(g.pin, { pin: g.pin, number: g.number, mode, drives, wires: [rec] });
    if (g.number <= 1) notes.push(`Pin ${g.pin} is the USB serial line: ${drives} on it disturbs uploads and the serial monitor.`);
    if (g.number >= 20 && mode !== "input") notes.push(`Pin ${g.pin} is an analog input only on this board: it cannot drive ${drives}.`);
    return g.number;
  };
  /** the one wire from a part's pin to the board, if any */
  const toBoard = (inst: string, pin: string) => peers(inst, pin).find((p) => p.far.inst === board.instance);

  // ---- H-bridge motor drivers: follow each channel's outputs to its motor, and its inputs back to the board
  const motors: MotorPlan[] = [], standby: Plan["standby"] = [], f = fk(spec);
  for (const inst of w.instances) {
    const br = bridgeOf(inst.key);
    if (!br) continue;
    if (br.standby) {
      const s = toBoard(inst.name, br.standby);
      if (!s) notes.push(`${inst.name}: ${br.standby} is not wired to the board, so the driver stays in standby unless it is tied high elsewhere.`);
      else if (gpio(s.far.pin)) { const n = claim(s, "output", `${inst.name} ${br.standby}: high to run`); if (n !== null) standby.push({ pin: n, driver: inst.name }); }
    }
    for (const ch of br.channels) {
      const out = peers(inst.name, ch.out1)[0], motor = out?.far.inst;
      if (!motor) continue;
      const wp = toBoard(inst.name, ch.pwm), w1 = toBoard(inst.name, ch.in1), w2 = toBoard(inst.name, ch.in2);
      if (!w1 || !w2 || !gpio(w1.far.pin) || !gpio(w2.far.pin)) { notes.push(`${motor} is not driven: ${inst.name} ${ch.in1} / ${ch.in2} are not both wired to board pins.`); continue; }
      const in1 = claim(w1, "output", `${inst.name} ${ch.in1}: direction of ${motor}`), in2 = claim(w2, "output", `${inst.name} ${ch.in2}: direction of ${motor}`);
      if (!wp || !gpio(wp.far.pin)) { notes.push(`${motor} is not driven: ${inst.name} ${ch.pwm} is not wired to a board pin (a jumper to 5 V runs it at full voltage, which the sketch cannot limit).`); continue; }
      const isPwm = board.pwm_pins.includes(gpio(wp.far.pin)!.number);
      const pwm = claim(wp, isPwm ? "pwm" : "output", `${inst.name} ${ch.pwm}: speed of ${motor}`);
      if (in1 === null || in2 === null || pwm === null) continue;
      if (!isPwm) notes.push(`${motor}: ${inst.name} ${ch.pwm} is on ${gpio(wp.far.pin)!.pin}, which has no PWM on this board (PWM pins: ${board.pwm_pins.map((n) => `D${n}`).join(", ")}). The sketch can only switch that motor fully on or off. Move the wire to a PWM pin.`);
      const side = /left/.test(motor) ? "left" : /right/.test(motor) ? "right" : f.link[motor] ? (f.link[motor].p[1] > 1e-4 ? "left" : f.link[motor].p[1] < -1e-4 ? "right" : null) : null;
      // a motor on the right side is the left one mirrored, so the same polarity turns its wheel the other way
      const swapped = /-|neg/i.test(short(out.far.pin));
      motors.push({ name: motor, key: keyOf.get(motor) ?? "", driver: inst.name, driver_key: inst.key, channel: ch.id, pwm, pwm_is_pwm: isPwm, in1, in2, side, forward: (side === "right" ? -1 : 1) * (swapped ? -1 : 1) as 1 | -1 });
    }
  }

  // ---- hobby servos: on a PCA9685 channel, or straight on a board pin
  const jointOf = (servo: string): Joint | undefined => {
    const mount = spec.joints.find((j) => j.type === "fixed" && j.child === servo);
    const same = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
    return (mount && spec.joints.find((j) => j.type === "revolute" && !j.mimic && j.parent === mount.parent && same(j.origin.xyz, mount.origin.xyz) && same(j.origin.rpy, mount.origin.rpy)))
      ?? spec.joints.find((j) => j.type === "revolute" && !j.mimic && j.name === servo.replace(/_servo$/, ""));
  };
  const servos: ServoPlan[] = [];
  const addServo = (name: string, via: ServoPlan["via"]) => {
    const key = keyOf.get(name) ?? "", s = CATALOG[key]?.specs, pulse = s?.pulse_us as [number, number] | undefined, range = Number(s?.range_deg);
    if (!pulse || !(range > 0)) { notes.push(`${name} is not driven: the catalog has no pulse range for ${key}.`); return false; }
    const j = jointOf(name), half = range / 2;
    const lo = j?.limit?.lower !== undefined ? deg(j.limit.lower) : -half, hi = j?.limit?.upper !== undefined ? deg(j.limit.upper) : half;
    // inwards to a tenth of a degree, so a rounded angle is never outside the robot's limit
    const lower = Math.ceil(Math.max(lo, -half) * 10 - 1e-6) / 10, upper = Math.floor(Math.min(hi, half) * 10 + 1e-6) / 10;
    const home = Math.round(Math.min(upper, Math.max(lower, deg(design?.home?.[j?.name ?? ""] ?? 0))) * 10) / 10;
    const cut = j && (lo < -half - 0.05 || hi > half + 0.05);
    if (!j) notes.push(`${name}: no joint found for this servo, so the sketch holds it at its centre and never moves it.`);
    if (cut) notes.push(`${j.name}: the robot allows ${lo.toFixed(0)} to ${hi.toFixed(0)} deg but the ${CATALOG[key].name.split(" (")[0]} turns ${range} deg (${-half} to ${half} about its centre): the sketch stays inside ${lower} to ${upper} deg.`);
    servos.push({ name, key, via, pulse_us: [pulse[0], pulse[1]], range_deg: range, joint: j?.name ?? null, lower_deg: j ? lower : 0, upper_deg: j ? upper : 0, home_deg: j ? home : 0, max_dps: j?.limit?.velocity ? +deg(j.limit.velocity).toFixed(1) : null, visit_deg: [null, null], ...(cut ? { cut_from: [+lo.toFixed(1), +hi.toFixed(1)] as [number, number] } : {}) });
    return true;
  };
  const pca: PcaPlan[] = [];
  for (const inst of w.instances.filter((i) => i.key.startsWith("pca9685"))) {
    const sda = toBoard(inst.name, "SDA"), scl = toBoard(inst.name, "SCL");
    const onBus = sda && scl && gpio(sda.far.pin)?.pin === i2c[1] && gpio(scl.far.pin)?.pin === i2c[2];
    const fed = wires.filter((x) => x.kind !== "power" && x.kind !== "ground" && (x.a.inst === inst.name || x.b.inst === inst.name) && /^ch\d+$/.test(x.a.inst === inst.name ? x.a.port : x.b.port));
    if (!onBus) { notes.push(`${inst.name} is not driven: its SDA and SCL are not wired to the board's I2C pins (${i2c[1]} and ${i2c[2]}), so ${fed.length} servo${fed.length === 1 ? "" : "s"} on it do not move.`); continue; }
    const address = Number(CATALOG[inst.key]?.specs.i2c_address ?? 0x40) + pca.length;
    claim(sda, "i2c", `I2C SDA to ${inst.name}`); claim(scl, "i2c", `I2C SCL to ${inst.name}`);
    if (pca.length === 1) notes.push("More than one PCA9685 on the bus: the sketch expects them at consecutive addresses in the order of the wiring record, the first at its default. Bridge the address pads to match (A0 on the second board).");
    pca.push({ name: inst.name, key: inst.key, address });
    for (const x of fed.sort((p, q) => Number((p.a.inst === inst.name ? p.a.port : p.b.port).slice(2)) - Number((q.a.inst === inst.name ? q.a.port : q.b.port).slice(2)))) {
      const near = x.a.inst === inst.name ? x.a : x.b, far = x.a.inst === inst.name ? x.b : x.a;
      addServo(far.inst, { board: pca.length - 1, channel: Number(near.port.slice(2)) });
    }
  }

  // ---- everything else wired to a board pin
  let range: RangePlan | null = null;
  for (const x of wires) {
    if (x.kind === "power" || x.kind === "ground") continue;
    const near = x.a.inst === board.instance ? x.a : x.b.inst === board.instance ? x.b : null;
    if (!near) continue;
    const far = near === x.a ? x.b : x.a, g = gpio(near.pin), key = keyOf.get(far.inst) ?? "";
    if (!g || [...pins.values()].some((p) => p.wires.some((q) => q.id === x.id)) || clash.has(g.pin)) continue;
    const me = { wire: x, far: near }, c = CATALOG[key];
    if (bridgeOf(key) || key.startsWith("pca9685")) {
      if (!pins.has(g.pin)) claim(me, "unused", `${far.inst} ${short(far.pin)} (not used by the sketch)`);
    } else if (c?.specs.pulse_us) {
      const before = servos.length;
      if (addServo(far.inst, { pin: g.number })) { if (claim(me, "servo", `signal of ${far.inst}${servos[before].joint ? ` (joint ${servos[before].joint})` : ""}`) === null) servos.pop(); }
      else claim(me, "unused", `${far.inst} (not driven)`);
    } else if (key.startsWith("hc_sr04")) {
      const name = short(far.pin).toLowerCase();
      claim(me, name === "echo" ? "input" : "output", `${far.inst} ${short(far.pin)}`);
    } else {
      claim(me, "unused", `${far.inst} ${short(far.pin)} (not driven)`);
      notes.push(`${far.inst} (${c?.name.split(" (")[0] ?? key}) on ${g.pin} is not driven: I have no driver code for it that stays inside the Servo, Wire and Adafruit PWM Servo Driver libraries.`);
    }
  }
  for (const inst of w.instances.filter((i) => i.key.startsWith("hc_sr04"))) {
    const t = toBoard(inst.name, "Trig"), e = toBoard(inst.name, "Echo"), tp = t && pins.get(gpio(t.far.pin)?.pin ?? ""), ep = e && pins.get(gpio(e.far.pin)?.pin ?? "");
    const mine = (p: FirmwarePin | undefined | "", id?: string) => !!p && p.wires.some((q) => q.id === id);
    if (!mine(tp, t?.wire.id) || !mine(ep, e?.wire.id)) { notes.push(`${inst.name} is not read: its Trig and Echo are not both wired to board pins.`); continue; }
    if (range) { notes.push(`${inst.name} is not read: the sketch uses one range sensor (${range.name}).`); continue; }
    const rc = (CATALOG[inst.key].specs.range_cm as [number, number] | undefined) ?? [2, 400];
    range = { name: inst.name, key: inst.key, trig: (tp as FirmwarePin).number, echo: (ep as FirmwarePin).number, range_cm: [rc[0], rc[1]] };
  }

  poseTargets(spec, servos, notes);

  // ---- limits the sketch keeps
  // motors rated below the pack: cap the duty at rated voltage over the full pack's voltage
  let pwmMax = 255, why = "the motors take the full supply voltage";
  const mKey = motors[0]?.key, mMax = mKey ? electrical(mKey)?.voltage_v.v.max : undefined;
  if (mMax) {
    const packs = w.instances.map((i) => CATALOG[i.key]).filter((c) => c?.category === "battery" && Number(c.specs.voltage_max_v) > 0);
    const vm = railVoltage(w, motors[0].driver), full = packs.length ? Math.max(...packs.map((c) => Number(c.specs.voltage_max_v))) : vm;
    if (full && full > mMax) { pwmMax = Math.round((mMax / full) * 255); why = `${mMax} V motors on a supply that reaches ${full} V: ${mMax} / ${full} x 255`; }
  }
  // Timer 1 runs the Servo library on an ATmega328P, which takes PWM away from D9 and D10
  if (servos.some((s) => "pin" in s.via)) for (const m of motors) if (m.pwm_is_pwm && (m.pwm === 9 || m.pwm === 10)) notes.push(`${m.name}: its speed pin D${m.pwm} loses PWM while the Servo library runs (both use Timer 1). Move the servos to a PCA9685 or the motor's speed wire to D3, D5, D6 or D11.`);
  if (motors.length && motors.some((m) => !m.side)) notes.push("I cannot tell which side every motor is on (no left / right in its name, and it sits on the centre line), so the sketch does not drive: it only holds the motors stopped.");
  const rate = Number(design?.performance?.turn_rate_rad_s);
  return { board, pins: [...pins.values()].sort((a, b) => a.number - b.number), motors, servos, pca, range, standby, pwm_max: pwmMax, pwm_max_why: why, quarter_turn_s: rate > 0 ? Math.PI / 2 / rate : null, notes };
}

/** Voltage of the rail that feeds an instance's motor supply, from the record's rails. */
function railVoltage(w: WiringRecord, inst: string): number | undefined {
  return w.rails.filter((r) => r.loads.some((l) => l.inst === inst)).map((r) => r.voltage_v).sort((a, b) => b - a)[0];
}

/**
 * Where the pose sequence takes each joint: POSE_REACH of the way from home to each limit, with the other joints at
 * home. The design's limits keep the links clear of each other, not of the table, so each move is checked against the
 * surface the robot stands on (the lowest point of its build pose) with the links' bounding boxes, and shortened or
 * dropped when a link would go under it.
 */
function poseTargets(spec: RobotSpecification, servos: ServoPlan[], notes: string[]) {
  const rad = (d: number) => (d * Math.PI) / 180, links = new Map(spec.links.map((l) => [l.name, l]));
  const lowest = (q: Record<string, number>, names: Iterable<string>): number => {
    const f = fk(spec, q); let z = Infinity;
    for (const n of names) {
      const l = links.get(n), T = f.link[n];
      if (!l || !T) continue;
      const bb = (l.geometry as { bbox?: { min: number[]; max: number[] } }).bbox, R = rpyToR(l.origin.rpy as [number, number, number]), o = l.origin.xyz;
      for (const x of bb ? [bb.min[0], bb.max[0]] : [0]) for (const y of bb ? [bb.min[1], bb.max[1]] : [0]) for (const c of bb ? [bb.min[2], bb.max[2]] : [0]) {
        const v = [R[0][0] * x + R[0][1] * y + R[0][2] * c + o[0], R[1][0] * x + R[1][1] * y + R[1][2] * c + o[1], R[2][0] * x + R[2][1] * y + R[2][2] * c + o[2]];
        z = Math.min(z, T.R[2][0] * v[0] + T.R[2][1] * v[1] + T.R[2][2] * v[2] + T.p[2]);
      }
    }
    return z;
  };
  const floor = lowest({}, links.keys());
  const home: Record<string, number> = Object.fromEntries(servos.filter((s) => s.joint).map((s) => [s.joint!, rad(s.home_deg)]));
  for (const s of servos) {
    const j = spec.joints.find((x) => x.name === s.joint);
    if (!j) continue;
    const moved = descendants(spec, j.child), need = Math.min(floor + FLOOR_CLEAR_MM / 1000, lowest(home, moved)) - 1e-6;
    s.visit_deg = [1, -1].map((dir) => {
      const span = dir > 0 ? s.upper_deg - s.home_deg : s.home_deg - s.lower_deg;
      if (span < POSE_MIN_DEG) return null;
      for (let k = 6; k >= 1; k--) {
        const go = (POSE_REACH * k * span) / 6, target = Math.round((s.home_deg + dir * go) * 10) / 10, n = Math.max(1, Math.ceil(go / 3));
        if (go < POSE_MIN_DEG) break;
        let clear = true;
        for (let i = 1; i <= n && clear; i++) clear = lowest({ ...home, [j.name]: rad(s.home_deg + ((target - s.home_deg) * i) / n) }, moved) >= need;
        if (!clear) continue;
        if (k < 6) notes.push(`${j.name}: the pose sequence turns it to ${target} deg, not ${Math.round((s.home_deg + dir * POSE_REACH * span) * 10) / 10}: further and a link would go under the surface the robot stands on.`);
        return target;
      }
      notes.push(`${j.name}: the pose sequence does not turn it towards ${dir > 0 ? s.upper_deg : s.lower_deg} deg: from home a link would go under the surface the robot stands on.`);
      return null;
    }) as [number | null, number | null];
  }
}
