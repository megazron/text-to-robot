// The modify box's basic verbs on every designed family where they make physical sense, and a reason (never a bare
// "not understood") where they do not: grippers, sensors, wheels, legs, DOF, arm length, battery and colour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyModification } from "@ttr/robot-generator";
import { chooseFamily } from "../packages/robot-generator/src/families.ts";
import type { RobotSpecification } from "@ttr/robot-schema";

const example = (dir: string) => JSON.parse(readFileSync(`examples/${dir}/robot.json`, "utf8")) as RobotSpecification;
/** Each clause's answer, checked against a pattern; none may be a bare "not understood". */
function says(dir: string, instruction: string, ...want: RegExp[]) {
  const { spec, changes } = applyModification(example(dir), instruction);
  for (const c of changes) assert.doesNotMatch(c, /^\? Not understood: "[^"]*"$/, `${dir}: "${instruction}" -> ${c}`);
  for (const w of want) assert.ok(changes.some((c) => w.test(c)), `${dir}: "${instruction}" should say ${w}, said:\n${changes.join("\n")}`);
  return spec;
}
const refusals = (dir: string, extra: [string, RegExp][] = []) => {
  for (const [i, w] of [["add an ultrasonic sensor", /Ultrasonic sensors are not in the parts library yet/], ["fit a bigger battery", /battery is chosen by the designer/], ...extra] as [string, RegExp][]) says(dir, i, w);
};

test("the chai-fetching mobile manipulator is the rover with an arm", () => {
  assert.equal(chooseFamily("a mobile manipulator that brings me chai", "", undefined, "parallel").family, "rover_arm");
});

test("modify verbs on the arm", () => {
  says("02_arm_6dof", "add a gripper", /already has a two-finger gripper/);
  says("02_arm_6dof", "add a suction cup", /Suction cups are not in the parts library yet/);
  refusals("02_arm_6dof", [["add wheels", /no wheels to change.*mobile manipulator/], ["add legs", /has no legs/]]);
  const s = says("02_arm_6dof", "remove the gripper, add a camera, make it 5 dof, make the arm longer, paint it blue",
    /^- Removed gripper/, /^\+ Added camera/, /Redesigned with a 5-DOF arm \(was 6-DOF\)/, /reach .* m -> .* m requested/, /body colour -> blue/);
  assert.equal(s.end_effectors.length, 0);
  assert.ok(s.sensors.some((x) => x.type === "camera"));
});

test("modify verbs on the rover with an arm (the mobile manipulator)", () => {
  says("12_mars_rover", "add a gripper", /already has a two-finger gripper/);
  refusals("12_mars_rover", [["add legs", /has no legs/]]);
  const s = says("12_mars_rover", "remove the gripper, add a lidar, give it more dof, make the arm longer, 6 wheels, paint it red",
    /^- Removed gripper/, /^\+ Added lidar/, /Redesigned with a 7-DOF arm \(was 6-DOF\)/, /arm reach 0\.350 m -> 0\.420 m/, /6 wheels \(was 4\)/, /body colour -> red/);
  assert.equal(s.end_effectors.length, 0);
  assert.equal(s.links.filter((l) => l.role === "wheel").length, 6);
  says("12_mars_rover", "add a gripper", /already has/);   // the original still has it: the edit made a new spec
});

test("modify verbs on a wheeled base", () => {
  says("05_diff_drive", "add a gripper", /no arm to hold a gripper; .*mobile manipulator/);
  says("05_diff_drive", "make it 5 dof", /fixed joint layout.*mobile manipulator/);
  refusals("05_diff_drive", [["add two wheels", /2 wheels by design/], ["add legs", /has no legs/]]);
  const s = says("05_diff_drive", "add a lidar, paint it green", /^\+ Added lidar/, /body colour -> green/);
  assert.ok(s.sensors.some((x) => x.type === "lidar"));
});

test("modify verbs on a quadruped", () => {
  says("10_quadruped", "add a gripper", /no arm to hold a gripper/);
  says("10_quadruped", "add two more legs", /4 legs by design; .*hexapod/);
  says("10_quadruped", "make it 5 dof", /fixed joint layout/);
  refusals("10_quadruped", [["add wheels", /no wheels to change/]]);
  const s = says("10_quadruped", "add a camera, paint it orange", /^\+ Added camera/, /body colour -> orange/);
  assert.ok(s.sensors.some((x) => x.type === "camera"));
});

test("modify verbs on a humanoid", () => {
  says("08_humanoid", "add a gripper", /already has a two-finger gripper/);
  refusals("08_humanoid", [["add wheels", /no wheels to change/], ["add legs", /2 legs by design/]]);
  const s = says("08_humanoid", "remove the grippers, make the arms 5 dof, add a camera", /^- Removed gripper/, /Redesigned with a 5-DOF arm \(each arm\)/, /^\+ Added camera|camera: this humanoid design has no mount/);
  assert.equal(s.end_effectors.length, 0);
});
