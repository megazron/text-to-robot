// Arduino firmware for a designed robot: one commented sketch whose every pin comes from the robot's wiring record.
//   arduinoFirmware(spec) -> { files, sketch, board, pins, libraries, notes, ... } | null
// (Robots built from a parts list carry their own pin plan and get their program from ../firmware.ts instead.)
// null when the record has no Arduino-class AVR board, and for the wearable Mark 43: its doors close on a person in a
// fixed order with pawls to lift first, and I have not written that sequence, so I ship no sketch that could move them.
import type { RobotSpecification } from "@ttr/robot-schema";
import { safeName } from "@ttr/robot-schema";
import type { DesignRecord } from "../assembly.ts";
import type { WiringRecord } from "../wiring.ts";
import { fk, rpyToR } from "../kin.ts";
import { part } from "@ttr/parts";
import { plan, type FirmwareBoard, type FirmwarePin, type MotorPlan, type ServoPlan, type PcaPlan, type RangePlan } from "./plan.ts";
import { sketch, poses, libraries, behaviourOf, SERIAL_BAUD, type Pose } from "./sketch.ts";

export { firmwareBoard, POSE_REACH, POSE_MIN_DEG, FLOOR_CLEAR_MM, type FirmwareBoard, type FirmwarePin, type MotorPlan, type ServoPlan, type PcaPlan, type RangePlan } from "./plan.ts";
export { pulseFor as firmwarePulse, SERVO_DPS, SERIAL_BAUD, type Pose } from "./sketch.ts";

export interface ArduinoFirmware {
  /** paths relative to the package's firmware folder: `<name>/<name>.ino` and `README.md` (flashing steps) */
  files: Record<string, string>;
  /** the sketch's path in `files` */
  sketch: string;
  board: FirmwareBoard;
  /** every board pin the sketch touches, each backed by the wires of the record that end on it */
  pins: FirmwarePin[];
  /** Library Manager names of what the sketch includes */
  libraries: string[];
  /** what is wired but not driven, and what to check on the bench */
  notes: string[];
  behaviour: string;
  serial_baud: number;
  motors: MotorPlan[]; servos: ServoPlan[]; servo_drivers: PcaPlan[];
  /** with where its beam starts in its link's frame (m) and which way it looks: the middle of the transducer face, out of the board's top (+z), and its beam angle */
  range_sensor: (RangePlan & { face_m: [number, number, number]; axis: [number, number, number]; beam_deg: number }) | null;
  /** highest motor PWM duty the sketch writes, 0..255 */
  pwm_max: number;
  /** the pose sequence: joint angles in degrees, in the order of `servos` */
  poses: Pose[];
  /**
   * How the robot moves on its wheels, for a simulator driving the 3D model from the motor pins (null: no drive motors).
   * The design's own figures: its top speed (at the motors' rated voltage) and the slip factor its turning check uses;
   * per motor the wheel joint it turns; the supply its driver switches; the motors' rated voltage.
   */
  drive: { supply_v: number; rated_v: number; top_speed_m_s: number; turn_slip_factor: number; track_m: number; wheel_radius_m: number;
    /** per motor the wheel joint it turns and the sign that joint turns with when the wheel rolls the robot forwards (+x) */
    wheels: Record<string, { joint: string; sign: 1 | -1 } | null> } | null;
}

/** Families whose motion I do not script: see the note at the top. */
const WITHHELD = new Set(["mark43_wearable"]);

/** The robot's Arduino sketch and what it drives; null without an Arduino-class board (or for a withheld family). */
export function arduinoFirmware(spec: RobotSpecification, wiring?: WiringRecord): ArduinoFirmware | null {
  const design = (spec.metadata as { design?: DesignRecord }).design, w = wiring ?? design?.wiring;
  if (!w || (design && WITHHELD.has(design.family))) return null;
  const p = plan(spec, w);
  if (!p) return null;
  const name = (safeName(spec.robot_name) || "robot").slice(0, 63), path = `${name}/${name}.ino`, libs = libraries(p), behaviour = behaviourOf(p);
  const notes = [...p.notes, "Generated from the wiring record and compiled for the example robots only: it has not run on a real robot. Lift the wheels and keep clear of the joints on the first run."];
  return {
    files: { [path]: sketch(spec.robot_name, `${name}.ino`, p), "README.md": readme(spec.robot_name, name, p, libs, behaviour) },
    sketch: path, board: p.board, pins: p.pins, libraries: libs, notes, behaviour, serial_baud: SERIAL_BAUD,
    motors: p.motors, servos: p.servos, servo_drivers: p.pca, range_sensor: p.range && { ...p.range, ...beamOf(p.range.key) }, pwm_max: p.pwm_max, poses: poses(p.servos),
    drive: driveOf(spec, w, p.motors, design),
  };
}

/** An ultrasonic module's transducers stand on its board's top face and look out along +z (catalog body box, beam angle from its specs). */
function beamOf(key: string) {
  const c = part(key), b = c.bbox_mm!;
  return { face_m: [(b.min[0] + b.max[0]) / 2000, (b.min[1] + b.max[1]) / 2000, b.max[2] / 1000] as [number, number, number], axis: [0, 0, 1] as [number, number, number], beam_deg: Number(c.specs.beam_deg ?? 15) };
}
/** The drive figures for a simulator: from the design record, the wiring record and the catalog, nothing invented. */
function driveOf(spec: RobotSpecification, w: WiringRecord, motors: MotorPlan[], design?: DesignRecord): ArduinoFirmware["drive"] {
  const perf = design?.performance as { top_speed_m_s?: number; turn_slip_factor?: number } | undefined;
  if (!motors.length || !perf?.top_speed_m_s) return null;
  const f = fk(spec), at = (l: string) => f.link[l]?.p as [number, number, number] | undefined;
  // each motor turns the wheel on the continuous joint nearest to it
  const wheelJoints = spec.joints.filter((j) => j.type === "continuous" && spec.links.find((l) => l.name === j.child)?.role === "wheel");
  const wheels: Record<string, { joint: string; sign: 1 | -1 } | null> = {};
  for (const m of motors) {
    const p = at(m.name); let best: string | null = null, bd = Infinity;
    if (p) for (const j of wheelJoints) { const q = at(j.child); if (!q) continue; const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < bd) { bd = d; best = j.name; } }
    // rolling forwards along +x is a positive turn about +y: the sign is the joint axis (in its parent's frame) along y
    const J = best ? spec.joints.find((j) => j.name === best)! : null, ay = J ? rpyToR(J.origin.rpy as [number, number, number]).reduce((a, row, i) => (i === 1 ? row[0] * J.axis[0] + row[1] * J.axis[1] + row[2] * J.axis[2] : a), 0) : 0;
    wheels[m.name] = J ? { joint: J.name, sign: ay < 0 ? -1 : 1 } : null;
  }
  const ys = (side: string) => motors.filter((m) => m.side === side && wheels[m.name]).map((m) => at(spec.joints.find((j) => j.name === wheels[m.name]!.joint)!.child)![1]);
  const yl = ys("left"), yr = ys("right"), mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const wheel = spec.links.find((l) => l.name === spec.joints.find((j) => j.name === Object.values(wheels).find(Boolean)?.joint)?.child);
  const bb = (wheel?.geometry as { bbox?: { min: number[]; max: number[] } } | undefined)?.bbox;
  const rail = w.rails.find((r) => r.loads.some((l) => motors.some((m) => m.driver === l.inst)));
  const rated = Number(part(motors[0].key).specs.voltage_v ?? 0);
  if (!rail || !rated || !yl.length || !yr.length || !bb) return null;
  return { supply_v: rail.voltage_v, rated_v: rated, top_speed_m_s: perf.top_speed_m_s, turn_slip_factor: perf.turn_slip_factor ?? 1, track_m: +(mean(yl) - mean(yr)).toFixed(4), wheel_radius_m: +((bb.max[0] - bb.min[0]) / 2).toFixed(4), wheels };
}

/** Flashing steps and the pin map, beside the sketch. */
function readme(robot: string, name: string, p: NonNullable<ReturnType<typeof plan>>, libs: string[], behaviour: string): string {
  const nano = /:nano/.test(p.board.fqbn), menu = nano ? "Arduino Nano" : /:uno/.test(p.board.fqbn) ? "Arduino Uno" : p.board.fqbn;
  const install = libs.filter((l) => l !== "Wire"), ch340 = /CH340/.test(p.board.name);
  const out = [`# Firmware: ${robot}`, "",
    `\`${name}/${name}.ino\` is an Arduino sketch for this robot's ${p.board.name}. It ${behaviour}.`, "",
    "Every pin in it comes from this robot's wiring record (`WIRING.md`): change the wiring and generate the robot again, do not edit pin numbers by hand.",
    "I compile the sketches of the example robots on every change. No sketch has run on a real robot yet, so treat the first power-up as a test.", "",
    "## Flash it", "",
    "With the Arduino IDE (2.x):", "",
    `1. Open \`${name}/${name}.ino\`. Keep the file in its \`${name}\` folder: the IDE wants the folder and the sketch to share a name.`,
    `2. Tools > Board > Arduino AVR Boards > **${menu}**.${nano ? " Tools > Processor > **ATmega328P**; if the upload fails with `not in sync`, pick **ATmega328P (Old Bootloader)**, which many Nano clones carry." : ""}`,
    install.length ? `3. Tools > Manage Libraries: install ${install.map((l) => `**${l}**`).join(" and ")}${install.includes("Adafruit PWM Servo Driver Library") ? " (say yes to its dependency, Adafruit BusIO)" : ""}.${libs.includes("Wire") ? " Wire comes with the board package." : ""}` : "3. No library to install: the sketch uses the Arduino core only.",
    `4. Plug the board in over USB and pick it under Tools > Port.${ch340 ? " This board talks through a CH340 chip: if no port appears, install the CH340 driver." : ""}`,
    "5. Upload, with the motor and servo power switched off.",
    `6. Open the Serial Monitor at **${SERIAL_BAUD} baud**. Send \`s\` to stop everything, \`s\` again to go on.`, "",
    "With arduino-cli:", "",
    "```bash",
    "arduino-cli core install arduino:avr",
    ...install.map((l) => `arduino-cli lib install "${l}"`),
    "arduino-cli board list                      # find the port, for example /dev/ttyUSB0 or COM5",
    `arduino-cli compile --fqbn ${p.board.fqbn} ${name}`,
    `arduino-cli upload -p <port> --fqbn ${p.board.fqbn} ${name}`,
    `arduino-cli monitor -p <port> -c baudrate=${SERIAL_BAUD}`,
    "```", "",
    ...(nano ? [`A Nano clone with the old bootloader takes \`--fqbn ${p.board.fqbn.replace(/:cpu=.*$/, "")}:cpu=atmega328old\` for the upload.`, ""] : []),
    "## Pin map", "", "| Board pin | Mode | Drives | Wire in WIRING.md |", "|---|---|---|---|",
    ...p.pins.map((q) => `| ${q.pin} | ${q.mode === "unused" ? "not used" : q.mode} | ${q.drives} | ${q.wires.map((x) => `${x.id} ${x.net}`).join(", ")} |`), ""];
  if (p.servos.length) out.push("## Servos", "", "Angle 0 is the servo's centre and the joint's zero pose in `ASSEMBLY.md`. Pulse ranges are the catalog's; batches differ, so trim `minUs` / `maxUs` in the sketch if a joint misses its end angles.", "",
    "| Servo | Output | Joint | Range in the sketch (deg) | Home (deg) | Pulse (us) |", "|---|---|---|---|--:|---|",
    ...p.servos.map((s) => `| ${s.name} (${s.key}) | ${"board" in s.via ? `${p.pca[s.via.board].name} 0x${p.pca[s.via.board].address.toString(16)} channel ${s.via.channel}` : `pin ${s.via.pin >= 14 ? `A${s.via.pin - 14}` : `D${s.via.pin}`}`} | ${s.joint ?? "none found"} | ${s.lower_deg} to ${s.upper_deg} | ${s.home_deg} | ${s.pulse_us[0]} to ${s.pulse_us[1]} over ${s.range_deg} deg |`), "");
  if (p.motors.length) out.push("## Motors", "", `The sketch never writes more than ${p.pwm_max}/255 to a speed pin (${p.pwm_max_why}).`, "",
    "| Motor | Driver | Speed pin | Direction pins | Side |", "|---|---|---|---|---|",
    ...p.motors.map((m) => `| ${m.name} | ${m.driver} channel ${m.channel} | ${lab(m.pwm)}${m.pwm_is_pwm ? "" : " (no PWM)"} | ${lab(m.in1)}, ${lab(m.in2)} | ${m.side ?? "unknown"} |`), "");
  out.push("## First power-up", "",
    ...(p.motors.length ? ["- Lift the wheels off the ground. During `drive: forward` every wheel must turn forwards; for one that does not, change its last number in `MOTORS` from `+1` to `-1`, or swap its two leads."] : []),
    ...(p.servos.length ? ["- Fit each servo horn with the servo at its centre and the joint at its zero pose. The servos jump to their home angles when the sketch starts: keep clear.", "- A joint that turns the wrong way: change its `dir` in `JOINTS` from `+1` to `-1`."] : []),
    ...(p.range ? ["- Hold a hand in front of the range sensor: the serial monitor shows the distance, and under 20 cm the robot stops, backs off and turns."] : []),
    "- Power the board from USB alone first and read the serial monitor before you switch the motor or servo supply on.", "");
  if (p.notes.length) out.push("## Not driven, or to check", "", ...p.notes.map((n) => `- ${n}`), "");
  return out.join("\n");
}
const lab = (n: number) => (n >= 14 ? `A${n - 14}` : `D${n}`);
