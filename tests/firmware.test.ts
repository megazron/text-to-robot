// The Arduino sketch of every example with an Arduino-class board: it exists, its pins are wires of the wiring record that
// really end on the board, no pin does two jobs, PWM sits on PWM pins, servo pulses and travel are the catalog's, the pose
// sequence stays inside the joint limits and clear of the robot and the table, the shipped files are the generator's, and
// the generator says what it cannot drive. scripts/compile_firmware.py compiles the same sketches with arduino-cli.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { RobotSpecification } from "@ttr/robot-schema";
import { CATALOG } from "@ttr/parts";
import { arduinoFirmware, firmwareBoard, firmwarePulse, withSolids, interferences, descendants, fk, POSE_REACH, type ArduinoFirmware, type WiringRecord } from "@ttr/design";
import { firmwareVariants } from "../scripts/firmware_variants.ts";

const examples = readdirSync("examples").filter((d) => /^\d\d_/.test(d)).sort();
const load = (ex: string): RobotSpecification => JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8"));
const wiringOf = (s: RobotSpecification) => (s.metadata as unknown as { design: { wiring: WiringRecord; family: string; checks: { name: string; detail: string }[]; home?: Record<string, number> } }).design.wiring;
const ARDUINO = examples.filter((ex) => arduinoFirmware(load(ex)));
const built = new Map<string, { spec: RobotSpecification; w: WiringRecord; f: ArduinoFirmware }>(ARDUINO.map((ex) => { const spec = load(ex); return [ex, { spec, w: wiringOf(spec), f: arduinoFirmware(spec)! }]; }));
const ino = (f: ArduinoFirmware) => f.files[f.sketch];
/** rows of a table in the sketch: the text between `const <type> <name>[] = {` and `};` */
const rows = (text: string, name: string) => (new RegExp(`${name}\\[\\](?:\\[\\d+\\])?(?: PROGMEM)? = \\{\\n([\\s\\S]*?)\\n\\};`).exec(text)?.[1] ?? "").split("\n").map((l) => l.replace(/\s*\/\/.*$/, "").trim().replace(/^\{|\},?$/g, "").split(",").map((c) => c.trim()));
const pinNumber = (c: string) => (/^A\d$/.test(c) ? 14 + Number(c[1]) : Number(c));

test("every example with an Arduino-class board yields a sketch, every other robot yields none", () => {
  assert.deepEqual(ARDUINO, ["15_wall_e", "18_arduino_car", "19_arduino_arm", "23_robot_hand"]);
  for (const ex of examples) {
    const spec = load(ex), board = firmwareBoard(wiringOf(spec)), f = arduinoFirmware(spec);
    if (ARDUINO.includes(ex)) {
      assert.ok(board && f, ex);
      assert.equal(f.sketch, `${spec.robot_name}/${spec.robot_name}.ino`, `${ex}: the sketch folder must carry the sketch's name`);
      assert.deepEqual(Object.keys(f.files).sort(), ["README.md", f.sketch].sort());
      const text = ino(f);
      for (const need of ["void setup()", "void loop()", "Serial.begin(SERIAL_BAUD)", `// FQBN:    ${f.board.fqbn}`, "const unsigned long SERIAL_BAUD = 115200;"]) assert.ok(text.includes(need), `${ex}: sketch lacks ${need}`);
      assert.equal(f.board.fqbn, CATALOG[f.board.key].specs.fqbn);
      assert.match(f.board.fqbn, /^arduino:avr:(uno|nano)/);
    } else if (ex === "14_iron_man_mark_43") {
      // the suit has a Nano, but its doors close on a person in a fixed order I have not written: no sketch is shipped
      assert.ok(board && f === null, ex);
      assert.ok(wiringOf(spec).notes.some((n) => /no sketch is supplied yet/.test(n)));
    } else assert.ok(board === null && f === null, `${ex}: ${board?.key}`);
  }
  assert.equal(arduinoFirmware({ ...load("18_arduino_car"), metadata: {} } as RobotSpecification), null, "a robot without a wiring record");
});

test("every pin of the pin map is a wire of the record that ends on the board; no pin is used twice; every wired board pin is in the map", () => {
  for (const [ex, { w, f }] of built) {
    const wires = new Map(w.cables.flatMap((c) => c.wires).map((x) => [x.id, x]));
    assert.equal(new Set(f.pins.map((p) => p.pin)).size, f.pins.length, `${ex}: a pin appears twice`);
    assert.equal(new Set(f.pins.map((p) => p.number)).size, f.pins.length);
    const used = new Set<string>();
    for (const p of f.pins) {
      assert.ok(p.wires.length >= 1, `${ex} ${p.pin}: no wire`);
      if (p.mode !== "i2c") assert.equal(p.wires.length, 1, `${ex} ${p.pin}: one job, one wire`);
      for (const pw of p.wires) {
        const x = wires.get(pw.id);
        assert.ok(x && x.from === pw.from && x.to === pw.to && x.net === pw.net, `${ex} ${p.pin}: ${pw.id} is not a wire of the record`);
        const end = [x.from, x.to].find((e) => e.startsWith(`${f.board.instance}.`));
        assert.ok(end, `${ex} ${p.pin}: ${pw.id} does not end on the board`);
        // the printed pin name at that end is this pin (D10/SS is D10; the Uno's SDA and SCL header pins are A4 and A5)
        const printed = end.split(".").slice(2).join(".").split("/")[0];
        assert.equal(printed, p.pin, `${ex}: ${pw.id} ends on ${printed}, the map says ${p.pin}`);
        assert.ok(x.kind !== "power" && x.kind !== "ground");
        used.add(pw.id);
      }
      assert.equal(p.number, p.pin.startsWith("A") ? 14 + Number(p.pin.slice(1)) : Number(p.pin.slice(1)));
      assert.ok(p.number >= 2, `${ex} ${p.pin}: the serial pins stay free for the monitor`);
    }
    // the other way round: every signal wire on a D<n> / A<n> pin of the board is in the map (a 5 V strap is not a pin the sketch drives)
    for (const x of wires.values()) {
      if (x.kind === "power" || x.kind === "ground") continue;
      const end = [x.from, x.to].find((e) => e.startsWith(`${f.board.instance}.`));
      if (end && /^[DA]\d+/.test(end.split(".").slice(2).join("."))) assert.ok(used.has(x.id), `${ex}: ${x.id} ${x.from} -> ${x.to} is not in the pin map`);
    }
    // and the sketch names no pin outside the map
    const text = ino(f), inMap = new Set(f.pins.map((p) => p.number));
    for (const r of rows(text, "MOTORS").filter((r) => r.length > 1)) for (const c of r.slice(1, 4)) assert.ok(inMap.has(pinNumber(c)), `${ex}: MOTORS uses pin ${c}`);
    const trig = /TRIG_PIN = (\w+), ECHO_PIN = (\w+)/.exec(text);
    if (trig) assert.ok(inMap.has(pinNumber(trig[1])) && inMap.has(pinNumber(trig[2])));
    assert.ok(!/pinMode\(\d|digitalWrite\(\d|analogWrite\(\d/.test(text), `${ex}: a pin number written outside the tables`);
  }
});

test("pin maps of the examples", () => {
  const map = (ex: string) => built.get(ex)!.f.pins.map((p) => `${p.pin} ${p.mode} ${p.drives}`);
  assert.deepEqual(map("18_arduino_car"), [
    "D2 output motor_driver_2 BIN2: direction of rear_right_motor", "D4 output motor_driver_1 BIN1: direction of front_right_motor",
    "D5 pwm motor_driver_1 PWMA: speed of front_left_motor", "D6 pwm motor_driver_1 PWMB: speed of front_right_motor",
    "D7 output motor_driver_1 AIN1: direction of front_left_motor", "D8 output motor_driver_1 AIN2: direction of front_left_motor",
    "D9 pwm motor_driver_2 PWMA: speed of rear_left_motor", "D10 pwm motor_driver_2 PWMB: speed of rear_right_motor",
    "D11 output ultrasonic Trig", "D12 input ultrasonic Echo",
    "A0 output motor_driver_1 BIN2: direction of front_right_motor", "A1 output motor_driver_2 AIN1: direction of rear_left_motor",
    "A2 output motor_driver_2 AIN2: direction of rear_left_motor", "A3 output motor_driver_2 BIN1: direction of rear_right_motor"]);
  assert.deepEqual(map("19_arduino_arm"), ["A4 i2c I2C SDA to servo_driver", "A5 i2c I2C SCL to servo_driver"]);
  assert.deepEqual(map("15_wall_e"), [...map("18_arduino_car"), "A4 i2c I2C SDA to servo_driver", "A5 i2c I2C SCL to servo_driver"]);
  assert.deepEqual(built.get("19_arduino_arm")!.f.servos.map((s) => [s.name, s.joint, s.via]), [["yaw_servo", "yaw", { board: 0, channel: 0 }], ["shoulder_servo", "shoulder", { board: 0, channel: 1 }], ["elbow_servo", "elbow", { board: 0, channel: 2 }], ["claw_servo", "claw", { board: 0, channel: 3 }]]);
});

test("PWM outputs are on PWM pins of the board, and nothing takes their timer", () => {
  for (const [ex, { f }] of built) {
    const pwm = CATALOG[f.board.key].specs.pwm_pins as number[];
    assert.deepEqual(f.board.pwm_pins, pwm);
    for (const p of f.pins) if (p.mode === "pwm") assert.ok(pwm.includes(p.number), `${ex}: ${p.pin} drives ${p.drives} but has no PWM`);
    for (const m of f.motors) {
      assert.ok(m.pwm_is_pwm && pwm.includes(m.pwm), `${ex}: ${m.name} speed on a pin without PWM`);
      assert.equal(f.pins.find((p) => p.number === m.pwm)?.mode, "pwm");
      assert.ok(m.side === "left" || m.side === "right", `${ex}: ${m.name} side`);
      assert.equal(m.forward, m.side === "left" ? 1 : -1, `${ex}: the right side is the left one mirrored`);
    }
    // the Servo library would take Timer 1, and with it PWM on D9 and D10: the examples' servos are all on the PCA9685
    assert.ok(!f.libraries.includes("Servo") && !/#include <Servo.h>/.test(ino(f)), ex);
    assert.ok(!f.notes.some((n) => /no PWM|loses PWM|wired to two things|not driven|not read/.test(n)), `${ex}: ${f.notes.join(" | ")}`);
    assert.deepEqual(f.libraries, f.servos.length ? ["Wire", "Adafruit PWM Servo Driver Library"] : []);
    for (const lib of ino(f).match(/#include <[^>]+>/g) ?? []) assert.ok(["#include <Wire.h>", "#include <Adafruit_PWMServoDriver.h>", "#include <Servo.h>"].includes(lib), `${ex}: ${lib}`);
  }
});

test("motors: the table in the sketch is the record's wiring, and the duty cap is the one the design states", () => {
  for (const ex of ["18_arduino_car", "15_wall_e"]) {
    const { spec, w, f } = built.get(ex)!, text = ino(f), table = rows(text, "MOTORS").filter((r) => r.length > 1);
    assert.equal(table.length, 4);
    const wires = w.cables.flatMap((c) => c.wires), boardPin = (to: string) => wires.find((x) => x.to === to)!.from.split(".")[2].split("/")[0];
    f.motors.forEach((m, i) => {
      const a = m.channel, d = m.driver;
      assert.deepEqual(table[i], [`"${m.name}"`, boardPin(`${d}.control.PWM${a}`).slice(1), ...[`${a}IN1`, `${a}IN2`].map((p) => boardPin(`${d}.control.${p}`)).map((p) => (p.startsWith("D") ? p.slice(1) : p)), m.side === "left" ? "+1" : "-1", m.forward > 0 ? "+1" : "-1"]);
      // the motor is the one on that channel's outputs
      assert.ok(wires.some((x) => x.from === `${d}.motor_${a.toLowerCase()}.${a}O1` && x.to === `${m.name}.motor.M+`));
    });
    assert.equal(f.pwm_max, Math.round((6 / 8.4) * 255));
    assert.ok(text.includes(`const int PWM_MAX = ${f.pwm_max};`));
    if (ex === "18_arduino_car") assert.match((spec.metadata as any).design.checks.find((c: { name: string }) => c.name === "power:motor_voltage").detail, new RegExp(`caps PWM at ${f.pwm_max}/255`));
    assert.ok(f.range_sensor && f.range_sensor.trig === 11 && f.range_sensor.echo === 12);
    assert.ok(/pulseIn\(ECHO_PIN, HIGH, ECHO_TIMEOUT_US\)/.test(text) && /us \/ 58UL/.test(text) && /DRIVE_REVERSE/.test(text));
    // a quarter turn at the turn rate the design claims
    const rate = Number((spec.metadata as any).design.performance.turn_rate_rad_s);
    assert.ok(text.includes(`const unsigned long TURN_MS = ${Math.round((Math.PI / 2 / rate) * 1000)};`));
    // TB6612FNG standby is strapped to 5 V in these designs, not on a pin
    assert.ok(wires.some((x) => x.to === "motor_driver_1.control.STBY" && x.from.endsWith(".5V")) && !/STANDBY_PINS/.test(text));
  }
});

test("servos: pulse range and travel from the catalog, limits inside the robot's and the servo's, poses inside the limits", () => {
  for (const ex of ["19_arduino_arm", "15_wall_e"]) {
    const { spec, w, f } = built.get(ex)!, text = ino(f), table = rows(text, "JOINTS").filter((r) => r.length > 1);
    const hobby = w.instances.filter((i) => i.key.startsWith("hobby_"));
    assert.equal(f.servos.length, hobby.length, `${ex}: every servo of the record is driven`);
    assert.deepEqual(f.servo_drivers.map((d) => d.address), [0x40]);
    const home = (spec.metadata as any).design.home ?? {};
    f.servos.forEach((s, i) => {
      const c = CATALOG[s.key].specs, j = spec.joints.find((x) => x.name === s.joint)!;
      assert.deepEqual(s.pulse_us, c.pulse_us, `${ex} ${s.name}`);
      assert.equal(s.range_deg, c.range_deg);
      assert.ok(j && j.type === "revolute", `${ex} ${s.name}: joint ${s.joint}`);
      // the servo sits at this joint: same parent, same place
      const mount = spec.joints.find((x) => x.child === s.name)!;
      assert.ok(mount.parent === j.parent && mount.origin.xyz.every((v, k) => v === j.origin.xyz[k]));
      const lo = (j.limit!.lower! * 180) / Math.PI, hi = (j.limit!.upper! * 180) / Math.PI;
      assert.ok(s.lower_deg >= lo - 1e-9 && s.upper_deg <= hi + 1e-9 && s.lower_deg >= -s.range_deg / 2 && s.upper_deg <= s.range_deg / 2, `${ex} ${s.joint}: ${s.lower_deg}..${s.upper_deg} outside ${lo}..${hi}`);
      assert.ok(s.lower_deg <= s.home_deg && s.home_deg <= s.upper_deg && Math.abs(s.home_deg - Math.min(s.upper_deg, Math.max(s.lower_deg, ((home[s.joint!] ?? 0) * 180) / Math.PI))) <= 0.05);
      // the wire: PCA9685 channel -> this servo's signal pin
      const via = s.via as { board: number; channel: number };
      assert.ok(w.cables.flatMap((x) => x.wires).some((x) => x.from === `servo_driver.ch${via.channel}.PWM${via.channel}` && x.to.startsWith(`${s.name}.servo_lead.Signal`)), `${ex} ${s.name}: channel ${via.channel}`);
      assert.deepEqual(table[i], [`"${s.joint}"`, "0", String(via.channel), String(s.pulse_us[0]), String(s.pulse_us[1]), String(s.range_deg), "+1", ...[s.lower_deg, s.upper_deg, s.home_deg].map((d) => String(Math.round(d * 10)))]);
      // pulses: the centre of the catalog range at angle 0, never outside it, and clamped at the limits
      assert.equal(firmwarePulse({ ...s, lower_deg: -90, upper_deg: 90 }, 0), Math.trunc((s.pulse_us[0] + s.pulse_us[1]) / 2));
      for (const a of [-200, s.lower_deg, s.home_deg, s.upper_deg, 200]) { const us = firmwarePulse(s, a); assert.ok(us >= s.pulse_us[0] && us <= s.pulse_us[1] && us >= firmwarePulse(s, s.lower_deg) && us <= firmwarePulse(s, s.upper_deg), `${ex} ${s.joint} at ${a}: ${us} us`); }
      assert.equal(firmwarePulse({ ...s, lower_deg: -90, upper_deg: 90 }, 90), s.pulse_us[1]);
      assert.equal(firmwarePulse({ ...s, lower_deg: -90, upper_deg: 90 }, -90), s.pulse_us[0]);
    });
    // poses: home first, one joint away from home at a time, inside the limits, no further than POSE_REACH of the way
    assert.deepEqual(f.poses[0].angles_deg, f.servos.map((s) => s.home_deg));
    assert.ok(f.poses.length > f.servos.length);
    const poseRows = rows(text, "POSES").filter((r) => r.length > 1);
    assert.deepEqual(poseRows, f.poses.map((p) => p.angles_deg.map((a) => String(Math.round(a * 10)))));
    for (const p of f.poses) {
      const off = p.angles_deg.map((a, i) => a - f.servos[i].home_deg).filter((d) => Math.abs(d) > 1e-9);
      assert.ok(off.length <= 1, `${ex} ${p.name}: two joints off home`);
      p.angles_deg.forEach((a, i) => {
        const s = f.servos[i];
        assert.ok(a >= s.lower_deg && a <= s.upper_deg, `${ex} ${p.name}: ${s.joint} at ${a}`);
        assert.ok(a - s.home_deg <= POSE_REACH * (s.upper_deg - s.home_deg) + 0.051 && s.home_deg - a <= POSE_REACH * (s.home_deg - s.lower_deg) + 0.051, `${ex} ${p.name}: ${s.joint} at ${a}`);
      });
    }
    // every joint with room to move is visited
    for (const [i, s] of f.servos.entries()) assert.ok(f.poses.some((p) => p.angles_deg[i] !== s.home_deg), `${ex}: ${s.joint} never moves`);
    assert.ok(text.includes("PCA[JOINTS[i].board].setPWM(") && text.includes("Adafruit_PWMServoDriver(0x40)") && /PCA\[b\]\.setPWMFreq\(SERVO_HZ\)/.test(text));
  }
  // the arm's elbow is allowed further than its servo turns: the sketch says so and stays inside the servo's travel
  const arm = built.get("19_arduino_arm")!.f, elbow = arm.servos.find((s) => s.joint === "elbow")!;
  assert.deepEqual([elbow.lower_deg, elbow.upper_deg, elbow.cut_from], [-90, 90, [-120.3, 120.3]]);
  assert.ok(arm.notes.some((n) => /^elbow: the robot allows -120 to 120 deg/.test(n)) && ino(arm).includes("elbow: the robot allows -120 to 120 deg"));
});

test("the pose sequence keeps every link clear of the others and above the table (exact solids)", () => {
  for (const ex of ["19_arduino_arm", "15_wall_e"]) {
    const { spec, f } = built.get(ex)!;
    withSolids(spec, (m) => {
      const q = (a: number[]) => Object.fromEntries(f.servos.map((s, i) => [s.joint!, (a[i] * Math.PI) / 180]));
      const lowest = (a: number[], names?: Set<string>) => {
        const F = fk(spec, q(a)); let z = Infinity;
        m.names.forEach((n, i) => {
          const b = m.boxes[i], T = F.link[n];
          if (!b || !T || (names && !names.has(n))) return;
          for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const c of [b.min[2], b.max[2]]) z = Math.min(z, T.R[2][0] * x + T.R[2][1] * y + T.R[2][2] * c + T.p[2] * 1000);
        });
        return z;
      };
      const zero = f.servos.map(() => 0), home = f.poses[0].angles_deg, floor = lowest(zero);
      const atHome = new Set(interferences(m, q(home)).map((h) => `${h.a}|${h.b}`));
      // contacts that are the design (boards plugged into the breadboard, a sensor in its bracket) are there at home too
      for (const p of f.poses.slice(1)) {
        const i = p.angles_deg.findIndex((a, k) => a !== home[k]);
        if (i < 0) continue;
        const j = spec.joints.find((x) => x.name === f.servos[i].joint)!, moved = descendants(spec, j.child);
        // the end of the move and its middle (one joint turns, so the path is that joint's arc)
        for (const t of [0.5, 1]) {
          const a = home.map((h, k) => h + (p.angles_deg[k] - h) * t);
          assert.deepEqual(interferences(m, q(a), moved).filter((h) => !atHome.has(`${h.a}|${h.b}`)), [], `${ex} ${p.name} at ${t * 100} %`);
          assert.ok(lowest(a, moved) >= Math.min(floor + 4, lowest(home, moved)) - 0.01, `${ex} ${p.name} at ${t * 100} %: a link is ${(lowest(a, moved) - floor).toFixed(1)} mm from the table`);
        }
      }
    });
  }
  // the arm's shoulder would put the forearm through the table at the full reach: the sequence stops short and says so
  const arm = built.get("19_arduino_arm")!.f, sh = arm.servos.find((s) => s.joint === "shoulder")!;
  assert.ok(sh.visit_deg[0]! < sh.home_deg + POSE_REACH * (sh.upper_deg - sh.home_deg) - 1 && arm.notes.some((n) => /^shoulder: the pose sequence turns it to/.test(n)));
});

test("the generator is deterministic and does not touch its input", () => {
  for (const ex of ARDUINO) {
    const spec = load(ex), before = JSON.stringify(spec), a = arduinoFirmware(spec)!, b = arduinoFirmware(JSON.parse(before))!;
    assert.equal(JSON.stringify(spec), before, `${ex}: the spec was changed`);
    assert.deepEqual(a, b);
    assert.deepEqual(arduinoFirmware(spec, wiringOf(spec)), a, "the record passed in is the record used");
    for (const text of Object.values(a.files)) {
      assert.ok(!/\u2014|\u2013/.test(text), `${ex}: a dash that is not a hyphen`);
      assert.ok(!/\b(we|our)\b/i.test(text), `${ex}: written in the first person singular`);
      assert.ok(!/\d{4}-\d\d-\d\d|\d\d:\d\d:\d\d/.test(text), `${ex}: a date or time in the output`);
      assert.ok(text.endsWith("\n") && !/[ \t]\n/.test(text), `${ex}: trailing whitespace`);
    }
  }
});

test("the shipped sketches, flashing steps and build packages are the generator's", () => {
  for (const ex of examples) {
    const dir = `examples/${ex}`, f = built.get(ex)?.f, readme = readFileSync(`${dir}/README.md`, "utf8");
    const zip: Record<string, string> = JSON.parse(execFileSync("python3", ["-c", "import sys,zipfile,json\nz=zipfile.ZipFile(sys.argv[1])\nprint(json.dumps({n:z.read(n).decode() for n in z.namelist() if n.startswith('cad/firmware/') or n=='cad/README.md'}))", `${dir}/robot.cad.zip`], { encoding: "utf8", maxBuffer: 1 << 24 }));
    if (!f) {
      assert.ok(!existsSync(`${dir}/firmware`) && !readme.includes("| `firmware/` |") && Object.keys(zip).every((n) => n === "cad/README.md") && !/Flash/.test(zip["cad/README.md"] ?? ""), `${ex}: a sketch is shipped for a robot the generator has none for`);
      continue;
    }
    for (const [p, text] of Object.entries(f.files)) {
      assert.equal(readFileSync(`${dir}/firmware/${p}`, "utf8"), text, `${ex}: firmware/${p} is stale: node scripts/export_firmware.ts`);
      assert.equal(zip[`cad/firmware/${p}`], text, `${ex}: robot.cad.zip cad/firmware/${p} is stale: node scripts/export_firmware.ts`);
    }
    assert.deepEqual(readdirSync(`${dir}/firmware`, { recursive: true }).map(String).filter((p) => /\.\w+$/.test(p)).sort(), Object.keys(f.files).sort());
    assert.equal(Object.keys(zip).filter((n) => n.startsWith("cad/firmware/")).length, Object.keys(f.files).length);
    assert.ok(zip["cad/README.md"].includes(`   **Flash** the Arduino with \`firmware/${f.sketch}\``), `${ex}: the build package README does not name the sketch`);
    assert.match(readme, /^\| `firmware\/` \| Arduino sketch/m, `${ex}: README file table`);
    // the flashing steps name this board, its libraries and the serial speed
    const steps = f.files["README.md"];
    assert.ok(steps.includes(`arduino-cli compile --fqbn ${f.board.fqbn} ${f.sketch.split("/")[0]}`) && steps.includes("115200 baud") && steps.includes(/:nano/.test(f.board.fqbn) ? "**Arduino Nano**" : "**Arduino Uno**"));
    for (const lib of f.libraries.filter((l) => l !== "Wire")) assert.ok(steps.includes(`arduino-cli lib install "${lib}"`), `${ex}: ${lib}`);
    for (const p of f.pins) assert.ok(steps.includes(`| ${p.pin} | ${p.mode} | ${p.drives} |`) && ino(f).includes(p.drives), `${ex}: ${p.pin} missing from the pin tables`);
  }
});

test("rewired variants: what cannot be driven as wired is said, in the notes and in the sketch", () => {
  const [blind, l298, direct, mixed] = firmwareVariants().map((spec) => ({ spec, f: arduinoFirmware(spec)! }));
  // no range sensor: a square by time, and no sensor code
  assert.ok(blind.f.range_sensor === null && /drives a square/.test(blind.f.behaviour) && !/pulseIn|TRIG_PIN/.test(ino(blind.f)) && /SIDE_MS/.test(ino(blind.f)));
  assert.equal(blind.f.pins.length, 12);
  // L298N: ENA / IN1 / IN2 found by their names; a speed wire on D13 is reported and switched, not PWMed
  const fl = l298.f.motors.find((m) => m.name === "front_left_motor")!;
  assert.deepEqual([fl.driver_key, fl.pwm, fl.pwm_is_pwm, fl.in1, fl.in2], ["l298n_module", 13, false, 7, 8]);
  assert.equal(l298.f.pins.find((p) => p.pin === "D13")?.mode, "output");
  assert.ok(l298.f.notes.some((n) => /ENA is on D13, which has no PWM on this board/.test(n)) && ino(l298.f).includes("ENA is on D13, which has no PWM") && ino(l298.f).includes("else digitalWrite(m.pwm, speed != 0 ? HIGH : LOW);"));
  assert.equal(l298.f.motors.length, 4);
  // servos on board pins: the Servo library, one pin each, attached with the catalog pulse range
  assert.deepEqual(direct.f.libraries, ["Servo"]);
  assert.deepEqual(direct.f.pins.map((p) => [p.pin, p.mode]), [["D3", "servo"], ["D5", "servo"], ["D6", "servo"], ["D9", "servo"]]);
  assert.deepEqual(direct.f.servos.map((s) => s.via), [{ pin: 3 }, { pin: 5 }, { pin: 6 }, { pin: 9 }]);
  assert.ok(ino(direct.f).includes("servoOut[i].attach(JOINTS[i].channel, JOINTS[i].minUs, JOINTS[i].maxUs);") && !/Adafruit|Wire\.h/.test(ino(direct.f)));
  assert.deepEqual(direct.f.poses, built.get("19_arduino_arm")!.f.poses);
  // a servo on a pin beside motors on D9 / D10: the Servo library takes their PWM, and the generator says so
  assert.deepEqual(mixed.f.libraries, ["Servo", "Wire", "Adafruit PWM Servo Driver Library"]);
  assert.equal(mixed.f.notes.filter((n) => /loses PWM while the Servo library runs/.test(n)).length, 2);
  assert.equal(mixed.f.servos.length, 8);
  // every variant still maps each pin to a wire that ends on the board
  for (const { spec, f } of [blind, l298, direct, mixed]) {
    const ids = new Map(wiringOf(spec).cables.flatMap((c) => c.wires).map((x) => [x.id, x]));
    for (const p of f.pins) for (const x of p.wires) assert.ok(ids.get(x.id)?.from === x.from && [x.from, x.to].some((e) => e.startsWith("controller.")), `${spec.robot_name} ${p.pin}`);
    assert.equal(new Set(f.pins.map((p) => p.number)).size, f.pins.length);
  }
});

test("parts with no driver code are listed as not driven (the suit's record, run through the generator)", () => {
  // the suit is withheld by family; under another family name the generator reads its record like any other
  const suit = load("14_iron_man_mark_43");
  (suit.metadata as any).design.family = "bench_copy";
  const f = arduinoFirmware(suit)!, text = ino(f);
  for (const part of ["arc_reactor", "left_repulsor", "right_repulsor", "eye_led_left", "eye_led_right"]) {
    assert.ok(f.notes.some((n) => n.startsWith(`${part} (`) && /is not driven: I have no driver code/.test(n)), `${part} must be reported`);
    assert.equal(f.pins.find((p) => p.drives.startsWith(`${part} `))?.mode, "unused");
  }
  assert.ok(text.includes("// Not driven, or to check:") && text.includes("arc_reactor (WS2812B RGB LED ring"));
  // two PCA9685 boards on one bus at consecutive addresses, one I2C pin pair, two wires on each
  assert.deepEqual(f.servo_drivers.map((d) => [d.name, d.address]), [["servo_driver_left", 0x40], ["servo_driver_right", 0x41]]);
  assert.deepEqual(f.pins.filter((p) => p.mode === "i2c").map((p) => [p.pin, p.wires.length]), [["A4", 2], ["A5", 2]]);
  assert.ok(f.notes.some((n) => /More than one PCA9685/.test(n)));
  assert.deepEqual(f.pins.filter((p) => p.mode === "servo").map((p) => p.pin), ["D9", "D10"]);
  assert.equal(f.servos.length, wiringOf(suit).instances.filter((i) => i.key.startsWith("hobby_")).length);
});
