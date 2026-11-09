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
  const x = generateXacro(nDofArm(6));
  assert.ok(x.includes('xmlns:xacro'));
  assert.ok(x.includes("xacro:cyl_inertial"));
});

test("a flat part's inertia keeps A + B >= C in the URDF (six decimals broke it for EVA's base and MuJoCo refused the file)", async () => {
  const { readFileSync } = await import("node:fs");
  const eva = JSON.parse(readFileSync("examples/16_eva/robot.json", "utf8"));
  const xml = generateUrdf(eva);
  for (const m of xml.matchAll(/<inertia ixx="([^"]+)" ixy="[^"]+" ixz="[^"]+" iyy="([^"]+)" iyz="[^"]+" izz="([^"]+)"\/>/g)) {
    const [a, b, c] = [m[1], m[2], m[3]].map(Number);
    assert.ok(a + b >= c && a + c >= b && b + c >= a, `inertia ${m[0]}`);
  }
});

test("the URDF validator refuses an unphysical inertia or mass", () => {
  const link = (inertial: string) => `<?xml version="1.0"?><robot name="r"><link name="base_link"><inertial>${inertial}</inertial></link></robot>`;
  assert.ok(validateUrdf(link(`<mass value="1"/><inertia ixx="0.01" ixy="0" ixz="0" iyy="0.01" iyz="0" izz="0.01"/>`)).valid);
  const triangle = validateUrdf(link(`<mass value="1"/><inertia ixx="0.001" ixy="0" ixz="0" iyy="0.001" iyz="0" izz="0.003"/>`));
  assert.ok(!triangle.valid && triangle.issues.some((i) => i.code === "inertia_triangle"));
  assert.ok(!validateUrdf(link(`<mass value="0"/><inertia ixx="0.01" ixy="0" ixz="0" iyy="0.01" iyz="0" izz="0.01"/>`)).valid);
  assert.ok(!validateUrdf(link(`<mass value="1"/><inertia ixx="0" ixy="0" ixz="0" iyy="0.01" iyz="0" izz="0.01"/>`)).valid);
});
