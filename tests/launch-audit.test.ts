// Prompts from the launch audit (docs/LAUNCH_AUDIT.md) that built the wrong robot or reported something untrue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretPrompt, describeInterpretation, arduinoOptions } from "@ttr/robot-generator";
import { buildBom } from "@ttr/components";

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const notes = (prompt: string) => { const i = read(prompt); return [...i.ignored, ...i.approximations, ...i.conflicts].join(" | "); };

test("a hand asked for as the robot is refused; a hand on a robot is approximated by a gripper and said", () => {
  for (const p of ["a humanoid hand", "a dexterous five finger robot hand", "a robotic hand", "bionic hands"])
    assert.throws(() => interpretPrompt(p), /Dexterous robot hands are not supported/, p);
  const humanoid = read("a humanoid robot with robotic hands");
  assert.equal(humanoid.family, "humanoid");
  assert.match(humanoid.approximations.join(), /"robotic hands" approximated by a two-finger parallel gripper/);
  const arm = read("a 6 dof arm with a robot hand");
  assert.equal(arm.family, "serial_arm");
  assert.match(arm.approximations.join(), /"robot hand" approximated/);
});

test("the Arduino examples report what they built: the claw, the ultrasonic ranger, no false conflicts", () => {
  const arm = read("A cheap Arduino robot arm with a claw");
  assert.equal(arm.gripper, "claw");
  assert.doesNotMatch(describeInterpretation(arm), /no gripper/);
  assert.deepEqual(arm.conflicts, [], "the arm asked for is the arm built");
  const car = read("An Arduino 4WD obstacle avoiding car with an ultrasonic sensor");
  assert.deepEqual(car.conflicts, [], "4WD is the car built");
  assert.ok(!car.ignored.some((x) => /ultrasonic/.test(x)), "the car carries its ultrasonic ranger");
  assert.ok(car.sensors.some((s) => s.type === "range"));
  // a design without a ranger still says so
  assert.match(read("a differential drive robot with an ultrasonic sensor").ignored.join(), /ultrasonic sensor: only cameras/);
});

test("a gripper for an arm is a gripper; EVA from WALL-E is EVA; the SCARA's full name is a SCARA", () => {
  const g = read("a two finger robot gripper for my arm");
  assert.equal(g.family, "gripper");
  assert.deepEqual(g.conflicts, []);
  assert.doesNotMatch(describeInterpretation(read("Create a two-finger parallel gripper")), /gripper · parallel gripper/, "said once");
  assert.equal(read("EVA from Wall-E").family, "eva");
  assert.equal(read("WALL-E").family, "wall_e");
  const scara = read("selective compliance assembly robot arm");
  assert.equal(scara.family, "scara");
  assert.equal(scara.gripper, "parallel", "the name is not a pick-and-place task");
});

test("numbers that cannot be applied are said: wheels, a $0 budget, a negative payload, leg DOF the design already has", () => {
  assert.match(notes("a rover with 6 wheels"), /6 wheels: the differential-drive base has 2/);
  assert.doesNotMatch(notes("a 4 wheel robot car"), /wheels:/);
  const zero = read("a 6 DOF arm with a budget of $0");
  assert.equal(zero.budget_usd, undefined);
  assert.match(zero.ignored.join(), /a budget must be more than \$0/);
  assert.match(notes("a 6 DOF arm with -5 kg payload"), /a payload cannot be negative/);
  assert.doesNotMatch(notes("a hexapod with 3 DOF legs"), /fixed kinematics/, "its legs are 3 DOF");
  assert.match(notes("a quadruped with 4 DOF legs"), /4 DOF: the quadruped template has fixed kinematics/);
});

test("the default mobile manipulator passes its design checks (body bay vents sized from the heat inside)", () => {
  const { spec } = interpretPrompt("a mobile manipulator");
  const failed = ((spec.metadata as { design?: { checks?: { name: string; pass: boolean }[] } }).design?.checks ?? []).filter((c) => !c.pass).map((c) => c.name);
  assert.deepEqual(failed, []);
});

test("misspelt robot words and a few emoji are read, and said; other scripts are told what the parser reads", () => {
  assert.equal(read("quadrupad robot").family, "quadruped");
  assert.match(notes("quadrupad robot"), /quadrupad -> quadruped/);
  assert.equal(read("hexapd").family, "hexapod");
  assert.equal(read("humanoyd robot").family, "humanoid");
  assert.equal(read("a mechanum robot").family, "mecanum");
  assert.equal(read("🐕 robot").family, "quadruped");
  assert.equal(read("un perro robot").family, "quadruped");
  assert.doesNotMatch(notes("a 6 dof arm with a gripper"), /misspelt/, "English prompts are left alone");
  for (const p of ["एक रोबोटिक हाथ जिसमें ग्रिपर हो", "ایک روبوٹک بازو گرپر کے ساتھ", "ロボットアーム"])
    assert.throws(() => interpretPrompt(p), /a language the parser does not read yet/, p);
});

test("weapons and robots meant to hurt are refused, whatever body they have; tools are not weapons", () => {
  for (const p of ["a robot with a gun", "a weaponised drone that shoots people", "a battle robot with a flamethrower", "a robot that can kill", "a 6 DOF arm with a knife to stab", "WALL-E with a gun"])
    assert.throws(() => interpretPrompt(p), /does not design weapons/, p);
  assert.equal(read("a 6 dof arm holding a hot glue gun").family, "serial_arm");
  assert.equal(read("a robot arm that cuts vegetables with a knife").family, "serial_arm");
});

test("a differential drive robot with a depth camera gets a deck its electronics fit on; a Mars rover with no arm says what it is", () => {
  const r = read("a diff drive robot with an RGB-D camera and an IMU");
  assert.equal(r.family, "diff_drive");
  assert.ok(r.sensors.some((s) => s.type === "depth"));
  assert.match(notes("a mars rover with no lidar"), /a rover without an arm is built as a differential-drive base/);
});

test("a named board on a hobby-servo arm: the Uno it carries is recognised, a Nano is answered with why not", () => {
  assert.match(notes("a 6 DOF arm with MG996R servos and an Arduino Nano"), /Arduino Nano named: the Uno is kept/);
  assert.ok(read("a 6 DOF arm with MG996R servos and an Arduino Uno").dimensions.includes("Arduino Uno as asked"));
});

test("a template robot says it is one where the result is shown", () => {
  assert.match(notes("a scara arm for pick and place"), /the SCARA is a template robot: not designed from real parts/);
  assert.doesNotMatch(notes("Create a SCARA robot"), /template robot/);
});

test("an Arduino tier card shows what its design costs to build: the parts list total", () => {
  for (const o of arduinoOptions("an arduino car with four wheels").options) assert.equal(o.cost_usd, buildBom(o.robot).total, o.tier);
});

test("a colour asked for after a verb is applied: 'make it blue', 'it should be green'", () => {
  assert.equal(read("a 6 dof arm, please make it blue").colour, "blue");
  assert.equal(read("a quadruped, it should be green").colour, "green");
});
