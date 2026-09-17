import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec, emptySpec, type RobotSpecification } from "@ttr/robot-schema";
import { finalizeSpec } from "@ttr/robot-generator";
import { nDofArm } from "@ttr/robot-templates";

test("empty robot has no root and is invalid", () => {
  const s = emptySpec("empty");
  const v = validateSpec(s);
  assert.equal(v.valid, false);
});
test("duplicate link names are rejected", () => {
  const s = finalizeSpec(nDofArm(2));
  s.links.push({ ...s.links[0] });
  const v = validateSpec(s);
  assert.ok(v.issues.some((i) => i.code === "dup_link"));
});
test("cycle / multiple parents are rejected", () => {
  const s = finalizeSpec(nDofArm(2));
  // make base_link a child of a leaf -> creates a cycle / no root
  s.joints.push({ name: "bad", type: "fixed", parent: s.links[s.links.length - 1].name, child: "base_link", origin: { xyz: [0, 0, 0], rpy: [0, 0, 0] }, axis: [0, 0, 1] });
  const v = validateSpec(s);
  assert.equal(v.valid, false);
});
test("missing parent link is an error", () => {
  const s = finalizeSpec(nDofArm(2)) as RobotSpecification;
  s.joints[0].parent = "does_not_exist";
  const v = validateSpec(s);
  assert.ok(v.issues.some((i) => i.code === "missing_parent"));
});
test("negative mass is rejected", () => {
  const s = finalizeSpec(nDofArm(2));
  s.links[1].mass = -1;
  assert.ok(validateSpec(s).issues.some((i) => i.code === "bad_mass"));
});
