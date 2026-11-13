// The mobile designers with every sensor asked for: in a file of its own, as each design lays its 3D harness (minutes on
// WALL-E), so this file and tests/design-mobile.test.ts each stay well inside the per-file time limit on CI's slower machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { designFourWheel, designWallE, designEva, designBaymax } from "@ttr/design";

const design = (s: { metadata?: unknown }) => (s.metadata as any).design;

test("mobile designer: requested sensors are mounted as catalog parts", () => {
  for (const make of [designWallE, designEva, designBaymax, designFourWheel]) {
    const spec = make({ sensors: ["camera", "depth", "lidar", "imu"] });
    const keys = design(spec).purchased.map((p: { key: string }) => p.key);
    for (const k of ["rplidar_c1", "realsense_d435i", "bno085_breakout"]) assert.ok(keys.includes(k), `${spec.robot_name} lacks ${k}`);
    for (const t of ["lidar", "depth", "imu", "camera"]) assert.ok(spec.sensors.some((s) => s.type === t), `${spec.robot_name} lacks a ${t} sensor`);
    assert.deepEqual(design(spec).checks.filter((c: { pass: boolean }) => !c.pass), []);
  }
});
