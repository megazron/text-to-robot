// Second half of the file named after this one: the CSG heap never shrinks, so each process designs only so many robots.
// The local parser must apply, approximate or explicitly report every request (part 3 of 3: the
// design engine's CSG library keeps a little WASM memory per robot, so the suite is split across processes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretPrompt, applyModification, finalizeSpec, parsePrompt, extractBudget, } from "@ttr/robot-generator";
import { extractColour, } from "../packages/robot-generator/src/text.ts";
import { setDefaultRouter } from "@ttr/design";

// These tests check how prompts are read, not the harness the 3D router lays (tests/wiring3d and the example tests check
// that), so their designs lay wires as straight runs, as the website's first pass does.
setDefaultRouter("legacy");

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const family = (prompt: string) => read(prompt).family;
const arm = () => finalizeSpec(parsePrompt("6 dof arm"));
const seg = (spec: ReturnType<typeof arm>, name: string): number => (spec.metadata as any).design.performance[`${name}_m`];


test("families: legs, wheels, SCARA grippers, suction on mobile manipulators, arms on legs", () => {
  assert.equal(family("a robot with 4 legs"), "quadruped");
  assert.equal(family("a robot with 6 legs"), "hexapod");
  assert.equal(family("a robot with wheels"), "diff_drive");
  assert.deepEqual(parsePrompt("a SCARA with a suction cup").end_effectors.map((e) => e.type), ["suction_gripper"]);
  // the designed SCARA carries its parallel gripper
  assert.deepEqual(parsePrompt("a SCARA robot").end_effectors.map((e) => e.type), ["parallel_gripper"]);
  assert.deepEqual(parsePrompt("a mobile manipulator with a suction cup").end_effectors.map((e) => e.type), ["suction_gripper"]);
  assert.equal(read("a quadruped with an arm").family, "quadruped_arm");
  assert.match(read("a hexapod with an arm").ignored.join(), /a quadruped carries one/);
  assert.match(read("7-DOF arm with a force torque sensor").ignored.join(), /only cameras/);
});


test("budgets, colours and sensor counts", () => {
  assert.equal(extractBudget("budget of 5 grand"), 5000);
  assert.equal(extractBudget("for 2000$"), 2000);
  assert.equal(extractColour("a robot arm, colour: red"), "red");
  assert.equal(extractColour("6 dof arm (blue)"), "blue");
  assert.equal(extractColour("a golden robot dog"), "gold");
  assert.match(read("a red baymax").ignored.join(), /livery/);
  assert.deepEqual(parsePrompt("an arm with two cameras").sensors.map((s) => s.type), ["camera"]);
  assert.match(read("an arm with two cameras").ignored.join(), /2 cameras: .* mounts 1/);
  const noWrist = finalizeSpec(parsePrompt("a 6 dof arm with a camera, but no gripper"));
  assert.equal(noWrist.end_effectors.length, 0);
  assert.equal(noWrist.joints.find((j) => j.child === "wrist_camera")!.parent, "tool_link");
});


test("modify: relative DOF, gripper-mounted sensors, shared predicates, exclusions", () => {
  const joints = (m: string) => applyModification(arm(), m).spec.joints.filter((j) => j.type === "revolute" && j.name !== "gripper").length;
  assert.equal(joints("add one joint"), 7);
  assert.equal(joints("remove one axis"), 5);
  assert.match(applyModification(arm(), "add two joints").changes.join(), /8 requested; supported range 1–7/);
  assert.equal(applyModification(arm(), "add a camera to the gripper").spec.sensors[0]?.type, "camera");
  const a = arm(), both = applyModification(a, "make the forearm and upper arm 10% longer").spec;
  assert.ok(Math.abs(seg(both, "forearm") - seg(a, "forearm") * 1.1) < 0.002 && Math.abs(seg(both, "upper_arm") - seg(a, "upper_arm") * 1.1) < 0.002);
  const partial = applyModification(a, "make the forearm longer but not the upper arm").spec;
  assert.ok(Math.abs(seg(partial, "upper_arm") - seg(a, "upper_arm")) < 0.002 && seg(partial, "forearm") > seg(a, "forearm"));
  const sensored = finalizeSpec(parsePrompt("6 dof arm with a depth camera and a camera"));
  assert.deepEqual(applyModification(sensored, "remove the depth camera but keep the camera").spec.sensors.map((s) => s.type), ["camera"]);
  assert.deepEqual(applyModification(arm(), "add a depth camera, not a camera").spec.sensors.map((s) => s.type), ["depth"]);
});


test("modify: names, politeness, sentence splits, budgets alongside edits", () => {
  assert.equal(applyModification(arm(), "rename it to rock and roll").spec.robot_name, "rock_and_roll");
  assert.equal(applyModification(arm(), 'rename it "Arm, Mk 2"').spec.robot_name, "arm_mk_2");
  assert.equal(applyModification(arm(), "change the name to atlas").spec.robot_name, "atlas");
  assert.equal(applyModification(arm(), "can you add a camera?").spec.sensors.length, 1);
  const two = applyModification(arm(), "make it 10% longer.add a camera");
  assert.ok(two.changes.some((c) => c.startsWith("~ reach")) && two.spec.sensors.length === 1);
  const b = applyModification(arm(), "add a camera with a budget of $500");
  assert.ok(b.changes.some((c) => c.includes("$500")) && b.spec.sensors.length === 1);
  assert.match(applyModification(arm(), "make the camera red").changes.join(), /Only the body colour/);
});


test("modify: humanoid grippers swap on both hands; legs and characters refuse clearly", () => {
  // the designed humanoid has servo grippers only, and says so instead of pretending
  const h = applyModification(finalizeSpec(parsePrompt("humanoid")), "replace the grippers with suction cups");
  assert.match(h.changes.join(), /Suction cups are not in the parts library/);
  assert.ok(h.spec.end_effectors.length === 2 && h.spec.end_effectors.every((e) => e.type !== "suction_gripper"));
  assert.match(applyModification(finalizeSpec(parsePrompt("humanoid")), "make the legs longer").changes.join(), /legs is not supported/);
  assert.match(applyModification(finalizeSpec(parsePrompt("baymax")), "paint it red").changes.join(), /livery/);
});


test("modify: a suit is refitted to a new wearer instead of stretching one limb", () => {
  const suit = finalizeSpec(parsePrompt("a wearable exoskeleton"));
  assert.match(applyModification(suit, "make the arms longer").changes.join(), /follow the wearer/);
  const refit = applyModification(suit, "fit it to a 1.9 m wearer");
  assert.match(refit.changes.join(), /1\.90 m wearer/);
  const z = (s: typeof suit) => s.joints.find((j) => /shoulder/.test(j.name))!.origin.xyz[2];
  assert.ok(z(refit.spec) > z(suit), "shoulders rise for a taller wearer");
});
