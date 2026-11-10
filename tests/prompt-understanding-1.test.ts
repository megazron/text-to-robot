// The local parser must apply, approximate or explicitly report every request (part 1 of 3: the
// design engine's CSG library keeps a little WASM memory per robot, so the suite is split across processes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretPrompt, parsePrompt, understandPrompt } from "@ttr/robot-generator";
import { isNegated } from "../packages/robot-generator/src/text.ts";

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const family = (prompt: string) => read(prompt).family;

test("negated sensors and grippers are not added", () => {
  assert.equal(parsePrompt("a robot arm without a camera").sensors.length, 0);
  assert.equal(parsePrompt("6 dof arm with no lidar").sensors.length, 0);
  assert.deepEqual(parsePrompt("6 dof arm with no lidar, but a camera").sensors.map((s) => s.type), ["camera"]);
  assert.equal(parsePrompt("a 6 dof arm without a gripper").end_effectors.length, 0);
  assert.equal(read("6 dof arm without lidar or camera").sensors.length, 0);
  assert.ok(isNegated("no lidar", 3));
  assert.ok(!isNegated("no lidar and a camera", 16));
});


test("words inside other words do not select robots", () => {
  // "farming" is not "arm", "alarm" is not "arm", "hotdog" is not "dog": each is read as the task or object it is
  const farming = interpretPrompt("a farming robot").interpretation;
  assert.equal(farming.path, "knowledge table"); assert.match(farming.approximations.join(), /"farming" is a task/);
  assert.match(interpretPrompt("a robot alarm").interpretation.approximations.join(), /alarm/);
  assert.notEqual(interpretPrompt("a hotdog stand").interpretation.family, "quadruped");
  assert.equal(parsePrompt("6 dof arm with maximum reach").sensors.length, 0, "'maximum' is not an IMU");
});


test("families: synonyms and approximations are explicit", () => {
  assert.equal(family("a two legged walking robot"), "humanoid");
  assert.equal(family("a bipedal robot"), "humanoid");
  assert.equal(family("a mobile manipulator"), "rover_arm");
  assert.equal(family("wheeled robot with an arm"), "rover_arm");
  assert.equal(family("robot with 4 wheels and an arm"), "rover_arm");
  assert.match(read("tracked robot with an arm").approximations.join(), /tracks/);
  assert.equal(family("a robot dog"), "quadruped");
  assert.equal(family("robot vacuum cleaner"), "diff_drive");
  assert.equal(family("skid steer 4wd rover"), "four_wheel");
  assert.equal(family("a cobot"), "serial_arm");
  assert.equal(family("a six-axis industrial robot"), "serial_arm");
  assert.equal(family("soft robot arm"), "serial_arm");
  const omni = read("omnidirectional robot with omni wheels");
  assert.equal(omni.family, "mecanum"); assert.match(omni.approximations.join(), /mecanum/);
  const tracked = read("tracked tank robot");
  assert.equal(tracked.family, "four_wheel"); assert.match(tracked.approximations.join(), /tracks/);
  assert.match(read("a dual-arm robot").approximations.join(), /humanoid/);
});


test("drones, ROVs, snakes, gantries, deltas and hands are robot types of their own; nonsense still explains itself", () => {
  for (const [p, f] of [["quadcopter drone", "drone"], ["a delta robot", "delta"], ["gantry robot", "gantry"], ["robotic hand", "hand"], ["an underwater rov", "rov"], ["a snake robot with 10 segments", "snake"],
    ["a pen plotter", "gantry"], ["a robot dog with an arm", "quadruped_arm"], ["spot with a 5 dof arm", "quadruped_arm"]] as const)
    assert.equal(understandPrompt(p).family, f, p);
  assert.match(understandPrompt("a stewart platform").approx ?? "", /Stewart platform .* delta/);
  assert.throws(() => parsePrompt("asdf qwerty"), /not recognised.*Try an arm/);
});


test("DOF: clamped with a note; fixed templates accept per-limb counts", () => {
  const i = read("a 20 dof arm");
  assert.equal(i.dof, 8); // 7 arm joints + the gripper jaw
  assert.match(i.approximations.join(), /20 DOF clamped to 7/);
  assert.ok(!read("Create a humanoid battle mech with two 7 DOF arms").ignored.length);
  assert.match(read("a quadruped with 5 dof legs").ignored.join(), /fixed kinematics/);
  assert.equal(family("a manipulator with 7 joints"), "serial_arm");
});
