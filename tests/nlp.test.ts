import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrompt, applyModification, extractDof, finalizeSpec, dofCount } from "@ttr/robot-generator";
import { validateSpec } from "@ttr/robot-schema";

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
test("prompt -> humanoid picks humanoid template", () => {
  const s = finalizeSpec(parsePrompt("small humanoid with a torso, head and two 7 dof arms"));
  assert.ok(s.links.some((l) => l.name === "torso"));
  assert.ok(s.links.some((l) => l.name === "head"));
  assert.ok(s.links.some((l) => l.name.startsWith("left_")) && s.links.some((l) => l.name.startsWith("right_")));
});
test("prompt -> quadruped / diff drive / scara", () => {
  assert.ok(finalizeSpec(parsePrompt("a quadruped robot")).links.some((l) => l.name.includes("front_left")));
  assert.ok(finalizeSpec(parsePrompt("differential drive robot")).links.some((l) => l.role === "wheel"));
  assert.ok(finalizeSpec(parsePrompt("a scara robot")).links.some((l) => l.name === "spindle"));
});
test("modify: forearm 30% longer changes only the forearm", () => {
  const s = finalizeSpec(parsePrompt("6 dof arm"));
  const before = (s.links.find((l) => l.role === "forearm")!.geometry as any).length;
  const { spec, changes } = applyModification(s, "make the forearm 30% longer");
  const after = (spec.links.find((l) => l.role === "forearm")!.geometry as any).length;
  assert.ok(Math.abs(after - before * 1.3) < 1e-6, `expected ${before * 1.3}, got ${after}`);
  assert.ok(changes.some((c) => c.includes("forearm")));
});
test("modify: add camera to head adds a sensor + link", () => {
  const s = finalizeSpec(parsePrompt("humanoid"));
  const { spec } = applyModification(s, "add a camera to the head");
  assert.ok(spec.sensors.some((x) => x.type === "camera"));
});
test("modify: replace gripper with suction", () => {
  const s = finalizeSpec(parsePrompt("6 dof arm with a parallel gripper"));
  const { spec } = applyModification(s, "replace the gripper with a suction gripper");
  assert.ok(spec.end_effectors.some((e) => e.type === "suction_gripper"));
});
test("modify: change elbow joint to prismatic", () => {
  const s = finalizeSpec(parsePrompt("6 dof arm"));
  const { spec } = applyModification(s, "change the elbow joint to a prismatic joint");
  assert.ok(spec.joints.some((j) => j.type === "prismatic"));
});
