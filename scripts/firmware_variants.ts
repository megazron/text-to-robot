// Wiring variants of the shipped Arduino examples that reach the parts of the firmware generator no example uses: a car
// with no range sensor, an L298N with one speed wire on a pin without PWM, servos straight on board pins (Servo library),
// and a PCA9685 beside a servo on a pin. Each is an example's robot.json with its wiring record rewired; nothing is
// designed. tests/firmware.test.ts checks what the generator says about them and scripts/compile_firmware.py compiles them.
import { readFileSync } from "node:fs";
import type { RobotSpecification } from "@ttr/robot-schema";
import type { WiringRecord } from "@ttr/design";

const load = (ex: string): RobotSpecification => JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8"));
const wiringOf = (s: RobotSpecification) => (s.metadata as unknown as { design: { wiring: WiringRecord } }).design.wiring;
/** rewrite every wire end, dropping the wires the callback returns null for */
function rewire(s: RobotSpecification, name: string, end: (e: string) => string | null): RobotSpecification {
  const w = wiringOf(s);
  s.robot_name = name;
  for (const c of w.cables) c.wires = c.wires.flatMap((x) => { const a = end(x.from), b = end(x.to); return a === null || b === null ? [] : [{ ...x, from: a, to: b }]; });
  for (const n of w.nets) n.pins = n.pins.flatMap((p) => { const q = end(p); return q === null ? [] : [q]; });
  return s;
}

export function firmwareVariants(): RobotSpecification[] {
  // 1. the car without its range sensor: drives a square by time
  const blind = rewire(load("18_arduino_car"), "car_no_sensor", (e) => (e.startsWith("ultrasonic.") ? null : e));
  wiringOf(blind).instances = wiringOf(blind).instances.filter((i) => i.name !== "ultrasonic");

  // 2. the car on L298N boards, the first speed wire moved to D13 (no PWM there)
  const L: Record<string, string> = { "control.PWMA": "logic.ENA", "control.AIN1": "logic.IN1", "control.AIN2": "logic.IN2", "control.PWMB": "logic.ENB", "control.BIN1": "logic.IN3", "control.BIN2": "logic.IN4",
    "motor_a.AO1": "output_a.OUT1", "motor_a.AO2": "output_a.OUT2", "motor_b.BO1": "output_b.OUT3", "motor_b.BO2": "output_b.OUT4", "power.VM": "power.+12V", "power.VCC": "power.+5V", "power.GND": "power.GND" };
  const l298 = load("18_arduino_car");
  const stby = new Set(wiringOf(l298).cables.flatMap((c) => c.wires).filter((x) => x.to.endsWith(".control.STBY")).map((x) => x.id));
  for (const c of wiringOf(l298).cables) c.wires = c.wires.filter((x) => !stby.has(x.id)).map((x) => (x.from === "controller.j1_digital_side.D5" ? { ...x, from: "controller.j2_analog_side.D13/SCK" } : x));
  rewire(l298, "car_l298n", (e) => { const m = /^(motor_driver_\d)\.(.+)$/.exec(e); return m ? (m[2] === "control.STBY" ? null : `${m[1]}.${L[m[2]] ?? m[2]}`) : e; });
  for (const i of wiringOf(l298).instances) if (i.key === "tb6612fng_module") i.key = "l298n_module";

  // 3. the arm with its four servos on board pins D3, D5, D6 and D9, no PCA9685
  const PINS = ["D3", "D5", "D6", "D9"];
  const direct = rewire(load("19_arduino_arm"), "arm_servo_pins", (e) => { const m = /^servo_driver\.ch(\d+)\.PWM\d+$/.exec(e); return m ? `controller.jdigital.${PINS[Number(m[1])]}` : e.startsWith("servo_driver.control_in.S") || e.startsWith("controller.janalog.A") ? null : e; });
  wiringOf(direct).instances = wiringOf(direct).instances.filter((i) => i.name !== "servo_driver");

  // 4. WALL-E with the neck pan servo moved from the PCA9685 to pin D3: both servo outputs in one sketch, and the
  //    Servo library taking PWM from the rear motors' speed pins D9 and D10 (the generator must say so)
  const mixed = rewire(load("15_wall_e"), "walle_mixed_servos", (e) => (e === "servo_driver.ch0.PWM0" ? "controller.j1_digital_side.D3" : e));
  return [blind, l298, direct, mixed];
}
