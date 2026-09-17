import { test } from "node:test";
import assert from "node:assert/strict";
import { generateUrdf, generateXacro } from "@ttr/urdf-generator";
import { validateUrdf, parseUrdf } from "@ttr/urdf-validator";
import { finalizeSpec } from "@ttr/robot-generator";
import { nDofArm } from "@ttr/robot-templates";

test("generated URDF is well-formed and valid", () => {
  const urdf = generateUrdf(finalizeSpec(nDofArm(6)));
  assert.ok(urdf.startsWith("<?xml"));
  assert.ok(validateUrdf(urdf).valid);
});
test("URDF round-trips through the parser", () => {
  const s = finalizeSpec(nDofArm(7));
  const re = parseUrdf(generateUrdf(s));
  assert.equal(re.links.length, s.links.length);
  assert.equal(re.joints.length, s.joints.length);
});
test("malformed XML fails validation gracefully", () => {
  const v = validateUrdf("<robot><link name='a'></robot>");
  assert.equal(v.valid, false);
  assert.ok(v.issues.length > 0);
});
test("xacro output declares the xacro namespace and macros", () => {
  const x = generateXacro(finalizeSpec(nDofArm(6)));
  assert.ok(x.includes('xmlns:xacro'));
  assert.ok(x.includes("xacro:cyl_inertial"));
});
