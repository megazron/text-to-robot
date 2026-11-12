// The program for a parts-built robot, with the pins its harness assigned: an Arduino sketch (.ino) for AVR and ESP32
// boards, a Python script (gpiozero) for a Raspberry Pi. Every pin comes from the design's firmware record, which the
// wiring wrote, so the sketch, the schematic and the breadboard view always agree.
import type { RobotSpecification } from "@ttr/robot-schema";
import { part } from "@ttr/parts";
import type { FirmwareRecord } from "./families/parts-pins.ts";

export interface FirmwareFile { name: string; language: "arduino" | "python"; code: string; fqbn: string; libraries: string[]; }

const recOf = (spec: RobotSpecification) => (spec.metadata as { design?: { firmware?: FirmwareRecord; summary?: string } }).design;
/** Arduino pin expression for a board pin name: "D5" -> 5, "A0" -> A0, "GPIO25" -> 25, "4" -> 4 */
export function pinExpr(name: string): string {
  const n = name.split("/")[0].trim();
  if (/^D\d+$/.test(n)) return n.slice(1);
  if (/^A\d+$/.test(n)) return n;
  if (/^GPIO\d+$/.test(n)) return n.slice(4);
  if (/^\d+$/.test(n)) return n;
  return n;
}
const bcm = (name: string) => name.replace(/^GPIO/, "");
const ident = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

/** The sketch or script for a design that carries a firmware record; undefined for robots without one. */
export function firmwareFor(spec: RobotSpecification): FirmwareFile | undefined {
  const d = recOf(spec), fw = d?.firmware;
  if (!fw) return undefined;
  if (fw.language === "python") return piScript(spec, fw);
  return arduinoSketch(spec, fw);
}

function header(spec: RobotSpecification, fw: FirmwareRecord, comment: string, libs: string[]): string {
  const d = recOf(spec)!, lines = [
    `${spec.robot_name}: ${d.summary ?? ""}`,
    `Board: ${part(fw.board).name} (${fw.fqbn})`,
    "",
    "Pins (the same as the wiring and breadboard views):",
    ...pinTable(fw).map(([role, pin]) => `  ${role.padEnd(26)} ${pin}`),
    ...(fw.notes.length ? ["", ...fw.notes.map((n) => `Note: ${n}`)] : []),
    ...(libs.length ? ["", `Libraries: ${libs.join(", ")}`] : []),
    "",
    fw.language === "arduino" ? `Upload: arduino-cli compile --fqbn ${fw.fqbn} . && arduino-cli upload -p <port> --fqbn ${fw.fqbn} .` : "Run: python3 robot.py (on the Pi, after: sudo apt install python3-gpiozero python3-picamera2)",
    "Lift the wheels off the table for the first run.",
  ];
  return lines.map((l) => `${comment} ${l}`.trimEnd()).join("\n");
}
export function pinTable(fw: FirmwareRecord): [string, string][] {
  const out: [string, string][] = [];
  for (const [drv, pins] of Object.entries(fw.drive?.pins ?? {})) for (const [role, pin] of Object.entries(pins)) out.push([`${drv}.${role}`, pin]);
  for (const [name, s] of Object.entries(fw.sensors)) for (const [role, pin] of Object.entries(s)) if (!["kind", "active", "port"].includes(role) && typeof pin === "string") out.push([`${name}.${role}`, pin]);
  for (const [name, s] of Object.entries(fw.servos)) out.push([`${name} servo`, s.pin]);
  if (fw.servo_driver) out.push(["servo driver SDA", fw.servo_driver.sda], ["servo driver SCL", fw.servo_driver.scl]);
  return out;
}

// ---------------------------------------------------------------------------------------------------- Arduino
function arduinoSketch(spec: RobotSpecification, fw: FirmwareRecord): FirmwareFile {
  const esp = fw.fqbn.startsWith("esp32"), libs: string[] = [];
  const servos = Object.entries(fw.servos), directServos = servos.filter(([, s]) => s.channel === undefined);
  const inc: string[] = [], defs: string[] = [], setup: string[] = [], fns: string[] = [];
  if (directServos.length) { inc.push(esp ? "#include <ESP32Servo.h>" : "#include <Servo.h>"); libs.push(esp ? "ESP32Servo" : "Servo"); }
  if (fw.servo_driver) { inc.push("#include <Wire.h>", "#include <Adafruit_PWMServoDriver.h>"); libs.push("Adafruit PWM Servo Driver Library"); defs.push(`Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(${fw.servo_driver.address});`); setup.push("pca.begin();", "pca.setPWMFreq(50);"); }
  const s = fw.sensors;
  if (s.tof) { inc.push("#include <Wire.h>", "#include <VL53L0X.h>"); libs.push("VL53L0X (Pololu)"); defs.push("VL53L0X tof;"); setup.push("Wire.begin();", "tof.setTimeout(100);", "if (!tof.init()) Serial.println(\"VL53L0X not found: check SDA/SCL\");", "tof.startContinuous();"); }
  if (s.imu) { inc.push("#include <Wire.h>"); setup.push("Wire.begin();", "Wire.beginTransmission(0x68); Wire.write(0x6B); Wire.write(0); Wire.endTransmission();   // wake the MPU-6050"); }
  if (s.bluetooth && !esp) { inc.push("#include <SoftwareSerial.h>"); defs.push(`SoftwareSerial bt(${pinExpr(String(s.bluetooth.board_rx))}, ${pinExpr(String(s.bluetooth.board_tx))});   // RX, TX`); setup.push("bt.begin(9600);   // HC-05 default"); }
  if (s.bluetooth && esp) { setup.push(`Serial2.begin(9600, SERIAL_8N1, ${pinExpr(String(s.bluetooth.board_rx))}, ${pinExpr(String(s.bluetooth.board_tx))});   // HC-05`); }

  // drive
  if (fw.drive) {
    const cap = fw.drive.pwm_cap ?? 255;
    defs.push(`const int PWM_MAX = ${cap};   // ${cap < 255 ? "keeps the 6 V motors at 6 V on average" : "full speed"}`);
    const sides = fw.drive.motors === 4 ? [["LEFT", "motor_driver_1", "A"], ["RIGHT", "motor_driver_1", "B"], ["LEFT", "motor_driver_2", "A"], ["RIGHT", "motor_driver_2", "B"]] : [["LEFT", "motor_driver_1", "A"], ["RIGHT", "motor_driver_1", "B"]];
    for (const [drv, pins] of Object.entries(fw.drive.pins)) for (const [role, pin] of Object.entries(pins)) { const n = `${ident(drv.replace("motor_driver_", "D"))}_${ident(role)}`; defs.push(`const uint8_t ${n} = ${pinExpr(pin)};`); setup.push(`pinMode(${n}, OUTPUT);`); }
    const key = fw.drive.driver, ch = (drv: string, c: string) => ident(drv.replace("motor_driver_", "D"));
    const body: string[] = [];
    for (const [side, drv, c] of sides) {
      const D = ch(drv, c), p = fw.drive.pins[drv]; if (!p) continue;
      const cond = `if (side == ${side === "LEFT" ? 0 : 1})`;
      if (key === "l298n_module") {
        const [i1, i2, en] = c === "A" ? ["IN1", "IN2", "ENA"] : ["IN3", "IN4", "ENB"];
        body.push(p[en] ? `  ${cond} { digitalWrite(${D}_${i1}, speed > 0); digitalWrite(${D}_${i2}, speed < 0); analogWrite(${D}_${en}, abs(speed)); }`
          : `  ${cond} { analogWrite(${D}_${i1}, speed > 0 ? speed : 0); analogWrite(${D}_${i2}, speed < 0 ? -speed : 0); }`);
      } else if (key === "tb6612fng_module") {
        body.push(`  ${cond} { digitalWrite(${D}_${c}IN1, speed > 0); digitalWrite(${D}_${c}IN2, speed < 0); analogWrite(${D}_PWM${c}, abs(speed)); }`);
      } else if (key === "drv8833_module") {
        body.push(`  ${cond} { analogWrite(${D}_${c}IN1, speed > 0 ? speed : 0); analogWrite(${D}_${c}IN2, speed < 0 ? -speed : 0); }`);
      } else if (key === "l9110s_module") {
        body.push(`  ${cond} { if (speed >= 0) { digitalWrite(${D}_${c}1B, LOW); analogWrite(${D}_${c}1A, speed); } else { digitalWrite(${D}_${c}1B, HIGH); analogWrite(${D}_${c}1A, 255 + speed); } }`);
      }
    }
    fns.push(`// side 0 = left, 1 = right; speed -PWM_MAX..PWM_MAX
void motor(int side, int speed) {
  speed = constrain(speed, -PWM_MAX, PWM_MAX);
${body.join("\n")}
}
void drive(int left, int right) { motor(0, left); motor(1, right); }
void stopAll() { drive(0, 0); }`);
  }
  if (s.ultrasonic) {
    defs.push(`const uint8_t TRIG = ${pinExpr(String(s.ultrasonic.trig))}, ECHO = ${pinExpr(String(s.ultrasonic.echo))};`);
    setup.push("pinMode(TRIG, OUTPUT);", "pinMode(ECHO, INPUT);");
    fns.push(`// HC-SR04: distance in cm, 999 when nothing answers within 25 ms (about 4 m)
int distanceCm() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 25000UL);
  return us == 0 ? 999 : (int)(us / 58UL);
}`);
  } else if (s.tof) fns.push("int distanceCm() { int mm = tof.readRangeContinuousMillimeters(); return (tof.timeoutOccurred() || mm > 2000) ? 999 : mm / 10; }");
  for (const [name, sv] of directServos) { const n = ident(name); defs.push(`Servo ${name}Servo;`, `const uint8_t ${n}_PIN = ${pinExpr(sv.pin)};`); setup.push(`${name}Servo.attach(${n}_PIN);`, `${name}Servo.write(${sv.centre_deg});`); }
  if (fw.servo_driver) fns.push(`// PCA9685 channel to an angle: 500-2500 us pulses at 50 Hz
void servoDeg(uint8_t ch, int deg) { pca.writeMicroseconds(ch, map(constrain(deg, 0, 180), 0, 180, 500, 2500)); }`);
  for (const k of ["ir_left", "ir_right"]) if (s[k]) { defs.push(`const uint8_t ${ident(k)} = ${pinExpr(String(s[k].pin))};   // LOW = obstacle`); setup.push(`pinMode(${ident(k)}, INPUT);`); }
  if (s.line) {
    const l = s.line;
    if (l.kind === "line3") defs.push(`const uint8_t LINE_L = ${pinExpr(String(l.left))}, LINE_C = ${pinExpr(String(l.centre))}, LINE_R = ${pinExpr(String(l.right))};   // HIGH = black line under the sensor`);
    else defs.push(`const uint8_t LINE_L = ${pinExpr(String(l.left))}, LINE_R = ${pinExpr(String(l.right))};   // HIGH = black line under the sensor`);
    for (const p of l.kind === "line3" ? ["LINE_L", "LINE_C", "LINE_R"] : ["LINE_L", "LINE_R"]) setup.push(`pinMode(${p}, INPUT);`);
  }
  if (s.buzzer) { defs.push(`const uint8_t BUZZER = ${pinExpr(String(s.buzzer.pin))};`); setup.push("pinMode(BUZZER, OUTPUT);"); fns.push("void beep(int ms) { digitalWrite(BUZZER, HIGH); delay(ms); digitalWrite(BUZZER, LOW); }"); }

  const loop = behaviour(fw, fns);
  const code = [header(spec, fw, "//", libs), "", ...[...new Set(inc)], "", ...defs, "", ...fns, "", "void setup() {", "  Serial.begin(115200);", ...[...new Set(setup)].map((x) => `  ${x}`), ...(fw.drive ? ["  stopAll();"] : []), ...(s.buzzer ? ["  beep(80);"] : []), "}", "", loop, ""].join("\n");
  return { name: `${spec.robot_name}.ino`, language: "arduino", code, fqbn: fw.fqbn, libraries: libs };
}

function behaviour(fw: FirmwareRecord, fns: string[]): string {
  const s = fw.sensors, hasRange = !!(s.ultrasonic || s.tof), scan = fw.servos.scan;
  const remote = s.bluetooth ? `  // Bluetooth: F B L R S drive by hand, A goes back to autonomous
  static bool manual = false;
  ${fw.fqbn.startsWith("esp32") ? "Stream &link = Serial2;" : "Stream &link = bt;"}
  if (link.available()) {
    char c = link.read();
    manual = c != 'A';
    if (c == 'F') drive(PWM_MAX, PWM_MAX); else if (c == 'B') drive(-PWM_MAX, -PWM_MAX);
    else if (c == 'L') drive(-PWM_MAX / 2, PWM_MAX / 2); else if (c == 'R') drive(PWM_MAX / 2, -PWM_MAX / 2); else if (c == 'S') stopAll();
  }
  if (manual) return;
` : "";
  if (fw.mission === "radar") {
    return `// Sweep 20..160 deg and back; one "angle,distance." line per degree for the PC's radar screen
void loop() {
  for (int a = ${scan.range_deg[0]}; a <= ${scan.range_deg[1]}; a++) { scanServo.write(a); delay(30); Serial.print(a); Serial.print(","); Serial.print(distanceCm()); Serial.print("."); }
  for (int a = ${scan.range_deg[1]}; a >= ${scan.range_deg[0]}; a--) { scanServo.write(a); delay(30); Serial.print(a); Serial.print(","); Serial.print(distanceCm()); Serial.print("."); }
}`;
  }
  if (fw.mission === "arm" || fw.mission === "walker") {
    const joints = Object.entries(fw.servos);
    const set = (name: string, sv: { channel?: number }, deg: string) => sv.channel !== undefined ? `servoDeg(${sv.channel}, ${deg})` : `${name}Servo.write(${deg})`;
    fns.push(`// joints: ${joints.map(([n]) => n).join(", ")}; one joint moves at a time, 1 deg every 15 ms (a battery never sees two servos starting together)
const char *JOINT_NAMES[] = { ${joints.map(([n]) => `"${n}"`).join(", ")} };
int pos[${joints.length}] = { ${joints.map(([, s]) => s.centre_deg).join(", ")} };
void writeJoint(int j, int deg) {
  switch (j) {
${joints.map(([n, sv], i) => `    case ${i}: ${set(n, sv, "deg")}; break;`).join("\n")}
  }
}
void moveJoint(int j, int target) {
  target = constrain(target, 0, 180);
  while (pos[j] != target) { pos[j] += pos[j] < target ? 1 : -1; writeJoint(j, pos[j]); delay(15); }
}`);
    if (fw.mission === "walker") {
      const n = joints.length;
      return `// Creep gait: one leg at a time lifts (knee), swings forward (hip), lowers, then the body moves forward on the other three
void loop() {
  const int legs = ${n / 2};
  for (int leg = 0; leg < legs; leg++) {
    int hip = leg * 2, knee = leg * 2 + 1, dir = (leg % 2) ? -1 : 1;
    moveJoint(knee, 90 + 35); moveJoint(hip, 90 + dir * 25); moveJoint(knee, 90);
  }
  for (int leg = 0; leg < legs; leg++) moveJoint(leg * 2, 90);
}`;
    }
    return `// Serial commands (115200 baud): "<joint> <deg>", e.g. "shoulder 60"; "home" centres every joint; "demo" waves
void loop() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\\n'); cmd.trim();
  if (cmd == "home") { for (int j = 0; j < ${joints.length}; j++) moveJoint(j, 90); Serial.println("ok"); return; }
  if (cmd == "demo") { for (int k = 0; k < 2; k++) { moveJoint(0, 60); moveJoint(1, 70); moveJoint(2, 120); moveJoint(0, 120); } for (int j = 0; j < ${joints.length}; j++) moveJoint(j, 90); Serial.println("ok"); return; }
  int sp = cmd.indexOf(' ');
  if (sp < 0) { Serial.println("? <joint> <deg>, home or demo"); return; }
  String name = cmd.substring(0, sp); int deg = cmd.substring(sp + 1).toInt();
  for (int j = 0; j < ${joints.length}; j++) if (name == JOINT_NAMES[j]) { moveJoint(j, deg); Serial.println("ok"); return; }
  Serial.println("? unknown joint");
}`;
  }
  if (fw.mission === "line") {
    const l = s.line!, three = l.kind === "line3";
    return `// Follow a black line on a light floor${hasRange ? "; stop when something is closer than 15 cm" : ""}
void loop() {
${remote}${hasRange ? "  if (distanceCm() < 15) { stopAll(); delay(50); return; }\n" : ""}  bool L = digitalRead(LINE_L), R = digitalRead(LINE_R)${three ? ", C = digitalRead(LINE_C)" : ""};
  int fast = PWM_MAX * 0.7, slow = PWM_MAX * 0.2;
  ${three ? "if (C && !L && !R) drive(fast, fast);\n  else if (L) drive(slow, fast);\n  else if (R) drive(fast, slow);\n  else drive(-slow, slow);   // lost the line: turn to look for it" : "if (L && !R) drive(slow, fast);\n  else if (R && !L) drive(fast, slow);\n  else if (!L && !R) drive(fast, fast);\n  else stopAll();   // both on black: a crossing or the end"}
}`;
  }
  // obstacle (and the ESP32-CAM camera car, which avoids obstacles the same way when it has a sensor)
  const look = scan ? `
// look left and right with the scan servo; returns the side with more room (0 left, 1 right)
int bestSide() {
  scanServo.write(${scan.range_deg[1]}); delay(350); int left = distanceCm();
  scanServo.write(${scan.range_deg[0]}); delay(450); int right = distanceCm();
  scanServo.write(${scan.centre_deg}); delay(250);
  return left > right ? 0 : 1;
}` : "";
  if (look) fns.push(look.trim());
  const ir = s.ir_left ? "\n  if (digitalRead(IR_LEFT) == LOW) { drive(PWM_MAX / 2, -PWM_MAX / 2); delay(200); return; }\n  if (digitalRead(IR_RIGHT) == LOW) { drive(-PWM_MAX / 2, PWM_MAX / 2); delay(200); return; }" : "";
  if (!hasRange && !s.ir_left) return `// No obstacle sensor on the list: drive a square, then wait 5 s
void loop() {
${remote}  for (int i = 0; i < 4; i++) { drive(PWM_MAX, PWM_MAX); delay(1500); drive(PWM_MAX / 2, -PWM_MAX / 2); delay(450); }
  stopAll(); delay(5000);
}`;
  return `// Drive forward; closer than 20 cm: stop, back off and turn towards the open side
void loop() {
${remote}${ir}
${hasRange ? `  int d = distanceCm();
  if (d > 20) { drive(PWM_MAX, PWM_MAX); delay(40); return; }
  stopAll();${s.buzzer ? " beep(60);" : ""} delay(150);
  drive(-PWM_MAX * 0.7, -PWM_MAX * 0.7); delay(300); stopAll();
  int side = ${scan ? "bestSide()" : "random(2)"};
  if (side == 0) drive(-PWM_MAX * 0.7, PWM_MAX * 0.7); else drive(PWM_MAX * 0.7, -PWM_MAX * 0.7);
  delay(350); stopAll();` : "  drive(PWM_MAX, PWM_MAX); delay(40);"}
}`;
}

// ---------------------------------------------------------------------------------------------------- Raspberry Pi
function piScript(spec: RobotSpecification, fw: FirmwareRecord): FirmwareFile {
  const s = fw.sensors, p = fw.drive?.pins.motor_driver_1 ?? {}, key = fw.drive?.driver;
  const L: string[] = [header(spec, fw, "#", ["gpiozero", ...(s.camera ? ["picamera2"] : [])]), "", "from time import sleep", "from gpiozero import Motor, Robot" + (s.ultrasonic ? ", DistanceSensor" : "") + (s.line ? ", LineSensor" : "")];
  if (s.camera) L.push("from picamera2 import Picamera2");
  L.push("");
  const motor = (side: "A" | "B") => {
    if (key === "l298n_module") { const [i1, i2, en] = side === "A" ? ["IN1", "IN2", "ENA"] : ["IN3", "IN4", "ENB"]; return `Motor(forward=${bcm(p[i1])}, backward=${bcm(p[i2])}${p[en] ? `, enable=${bcm(p[en])}` : ""}, pwm=True)`; }
    if (key === "tb6612fng_module") return `Motor(forward=${bcm(p[`${side}IN1`])}, backward=${bcm(p[`${side}IN2`])}, enable=${bcm(p[`PWM${side}`])}, pwm=True)`;
    if (key === "drv8833_module") return `Motor(forward=${bcm(p[`${side}IN1`])}, backward=${bcm(p[`${side}IN2`])}, pwm=True)`;
    return `Motor(forward=${bcm(p[`${side}1A`])}, backward=${bcm(p[`${side}1B`])}, pwm=True)`;
  };
  if (fw.drive) L.push(`robot = Robot(left=${motor("A")}, right=${motor("B")})`, `MAX = ${((fw.drive.pwm_cap ?? 255) / 255).toFixed(2)}   # motor speed limit (keeps 6 V motors at 6 V on average)`);
  if (s.ultrasonic) L.push(`sonar = DistanceSensor(echo=${bcm(String(s.ultrasonic.echo))}, trigger=${bcm(String(s.ultrasonic.trig))}, max_distance=2)   # ECHO through a 1 k / 2 k divider`);
  if (s.line) L.push(s.line.kind === "line3" ? `left, centre, right = LineSensor(${bcm(String(s.line.left))}), LineSensor(${bcm(String(s.line.centre))}), LineSensor(${bcm(String(s.line.right))})` : `left, right = LineSensor(${bcm(String(s.line.left))}), LineSensor(${bcm(String(s.line.right))})`);
  if (s.camera) L.push("", "cam = Picamera2()", "cam.configure(cam.create_still_configuration(main={\"size\": (640, 480)}))", "cam.start()", "frame = 0");
  L.push("", "while True:");
  if (s.camera) L.push("    cam.capture_file(f\"/tmp/frame_{frame % 10}.jpg\")   # the last 10 frames; serve /tmp with any web server to watch", "    frame += 1");
  if (s.line) L.push("    if left.value and not right.value:", "        robot.left(0.4 * MAX)", "    elif right.value and not left.value:", "        robot.right(0.4 * MAX)", "    else:", "        robot.forward(0.6 * MAX)", "    sleep(0.02)");
  else if (s.ultrasonic) L.push("    if sonar.distance > 0.2:", "        robot.forward(MAX)", "    else:", "        robot.stop(); sleep(0.15)", "        robot.backward(0.7 * MAX); sleep(0.3)", "        robot.right(0.7 * MAX); sleep(0.35)", "    sleep(0.05)");
  else L.push("    robot.forward(0.6 * MAX); sleep(1.5)", "    robot.right(0.6 * MAX); sleep(0.45)");
  return { name: "robot.py", language: "python", code: L.join("\n") + "\n", fqbn: fw.fqbn, libraries: ["gpiozero", ...(s.camera ? ["picamera2"] : [])] };
}
