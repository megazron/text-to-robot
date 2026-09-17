import { test } from "node:test";
import assert from "node:assert/strict";
import { inertiaOf, volumeOf, massFromDensity } from "@ttr/kinematics";

test("box inertia matches analytic formula", () => {
  const I = inertiaOf({ type: "box", size: [0.2, 0.2, 0.2] }, 1);
  assert.ok(Math.abs(I.ixx - (1 / 12) * (0.04 + 0.04)) < 1e-9);
  assert.equal(I.ixx, I.iyy); assert.equal(I.iyy, I.izz);
});
test("cylinder inertia Izz = 1/2 m r^2", () => {
  const I = inertiaOf({ type: "cylinder", radius: 0.05, length: 0.2 }, 2);
  assert.ok(Math.abs(I.izz - 0.5 * 2 * 0.05 * 0.05) < 1e-9);
  assert.ok(Math.abs(I.ixx - (1 / 12) * 2 * (3 * 0.0025 + 0.04)) < 1e-9);
});
test("sphere inertia = 2/5 m r^2 on all axes", () => {
  const I = inertiaOf({ type: "sphere", radius: 0.1 }, 3);
  const expected = (2 / 5) * 3 * 0.01;
  for (const v of [I.ixx, I.iyy, I.izz]) assert.ok(Math.abs(v - expected) < 1e-9);
});
test("volume + mass-from-density are positive and consistent", () => {
  const g = { type: "cylinder", radius: 0.05, length: 0.2 } as const;
  assert.ok(volumeOf(g) > 0);
  assert.ok(Math.abs(massFromDensity(g, 1000) - volumeOf(g) * 1000) < 1e-9);
});
