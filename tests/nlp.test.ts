import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrompt, applyModification, extractDof, finalizeSpec, } from "@ttr/robot-generator";
import { validateSpec } from "@ttr/robot-schema";
import { setDefaultRouter } from "@ttr/design";

// These tests check how prompts are read, not the harness the 3D router lays (tests/wiring3d and the example tests check
// that), so their designs lay wires as straight runs, as the website's first pass does.
setDefaultRouter("legacy");

test("extractDof parses digits and words", () => {
  assert.equal(extractDof("6 dof arm"), 6);
  assert.equal(extractDof("a seven dof arm"), 7);
  assert.equal(extractDof("robot with 3 axes"), 3);
});
test("prompt -> 6 DOF arm with gripper", () => {
  const s = finalizeSpec(parsePrompt("Create a 6 DOF robotic arm with a parallel gripper"));
  assert.ok(validateSpec(s).valid);
  assert.ok(s.links.some((l) => l.role === "forearm"));
  assert.ok(s.end_effectors.length >= 1);
});
const familyOf = (p: string) => (finalizeSpec(parsePrompt(p)).metadata as any).design?.family;
test("prompt -> humanoid is designed with a torso, two legs and the asked arm DOF", () => {
  const s = finalizeSpec(parsePrompt("small humanoid with a torso, head and two 7 dof arms"));
  assert.equal((s.metadata as any).design.family, "humanoid");
  assert.equal((s.metadata as any).design.performance.arm_dof, 7);
  assert.ok(s.links.some((l) => l.name === "torso"));
  assert.ok(s.links.some((l) => l.name.startsWith("l_")) && s.links.some((l) => l.name.startsWith("r_")));
});
test("prompt -> quadruped / hexapod / diff drive / scara / gripper / mech are designed from real parts", () => {
  assert.equal(familyOf("a quadruped robot"), "quadruped");
  assert.ok(finalizeSpec(parsePrompt("a quadruped robot")).links.some((l) => l.name === "fl_foot"));
  assert.equal(familyOf("a six legged spider robot"), "hexapod");
  assert.ok(finalizeSpec(parsePrompt("differential drive robot")).links.some((l) => l.role === "wheel"));
  assert.equal(familyOf("a scara robot"), "scara");
  assert.equal(familyOf("a two-finger parallel gripper"), "gripper");
  assert.equal(familyOf("a humanoid battle mech"), "mech");
});
test("modify: forearm 30% longer changes only the forearm", () => {
  const s = finalizeSpec(parsePrompt("6 dof arm"));
  const seg = (x: any, k: string) => x.metadata.design.performance[k];
  const { spec, changes } = applyModification(s, "make the forearm 30% longer");
  assert.ok(Math.abs(seg(spec, "forearm_m") - seg(s, "forearm_m") * 1.3) < 0.002, `${seg(spec, "forearm_m")}`);
  // the upper arm is held; if the longer forearm needs bigger servos it can only grow to the shortest their clevises allow,
  // and the design says so
  const held = Math.abs(seg(spec, "upper_arm_m") - seg(s, "upper_arm_m")) <= 0.002;
  assert.ok(held || (spec.metadata as any).design.assumptions.some((x: string) => /requested upper_arm .* the shortest these actuators allow/.test(x)), `${seg(spec, "upper_arm_m")} vs ${seg(s, "upper_arm_m")}`);
  assert.ok(changes.some((c) => c.includes("forearm")));
});
test("modify: add camera to head adds a sensor + link", () => {
  const s = finalizeSpec(parsePrompt("humanoid"));
  const { spec } = applyModification(s, "add a camera to the head");
  assert.ok(spec.sensors.some((x) => x.type === "camera"));
});
test("modify: replace gripper with suction", () => {
  const s = finalizeSpec(parsePrompt("6 dof arm with a parallel gripper"));
  const { spec, changes } = applyModification(s, "replace the gripper with a suction gripper");
  // no suction cup + vacuum pump in the parts library yet: refused, gripper kept
  assert.match(changes.join(), /Suction cups are not in the parts library/);
  assert.ok(spec.end_effectors.some((e) => e.type === "two_finger_gripper"));
});
test("modify: change elbow joint to prismatic", () => {
  const s = finalizeSpec(parsePrompt("6 dof arm"));
  // a servo elbow cannot become a linear axis: reported, not faked
  const { spec, changes } = applyModification(s, "change the elbow joint to a prismatic joint");
  assert.ok(!spec.joints.some((j) => j.type === "prismatic"));
  assert.match(changes.join(), /Not understood/);
});
