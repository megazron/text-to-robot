import { test } from "node:test";
import assert from "node:assert/strict";
import { forwardKinematics, linkPositions } from "@ttr/kinematics";
import { finalizeSpec } from "@ttr/robot-generator";
import { nDofArm } from "@ttr/robot-templates";

test("FK returns a transform for every link", () => {
  const s = finalizeSpec(nDofArm(6));
  const w = forwardKinematics(s, {});
  for (const l of s.links) assert.ok(w.has(l.name), `no transform for ${l.name}`);
});
test("rotating joint_1 moves downstream links", () => {
  const s = finalizeSpec(nDofArm(6));
  const p0 = linkPositions(s, {});
  const p1 = linkPositions(s, { joint_2: 1.0 });
  const tip = s.links[s.links.length - 1].name;
  const d = Math.hypot(...p0[tip].map((v, i) => v - p1[tip][i]));
  assert.ok(d > 0.01, "tip should move when a joint rotates");
});
