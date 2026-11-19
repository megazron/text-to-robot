// The website's worker plan (apps/web/src/device.ts): sized from the device, never over its cap, lighter on phones, and one
// worker fewer after each crash down to one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { devicePlan, backedOff } from "../apps/web/src/device.ts";

const mq = (coarse: boolean) => (q: string) => ({ matches: coarse && q.includes("coarse") });
test("workers are cores - 1, between 1 and 6, cut by device memory", () => {
  const w = (cores: number, mem?: number, coarse = false) => devicePlan({ hardwareConcurrency: cores, deviceMemory: mem }, mq(coarse)).workers;
  assert.equal(w(20, 8), 6); assert.equal(w(8, 8), 6); assert.equal(w(4, 8), 3); assert.equal(w(2, 8), 1); assert.equal(w(1, 8), 1);
  assert.equal(w(8, 4), 2); assert.equal(w(8, 2), 1); assert.equal(w(8, 1), 1); assert.equal(w(8), 6);   // memory not reported: by cores
  assert.equal(devicePlan({}).workers, 1);
});
test("a phone (coarse pointer, small memory) gets the light schedule; a touch laptop with memory does not", () => {
  assert.equal(devicePlan({ hardwareConcurrency: 8, deviceMemory: 4 }, mq(true)).light, true);
  assert.equal(devicePlan({ hardwareConcurrency: 8, deviceMemory: 8 }, mq(true)).light, false);
  assert.equal(devicePlan({ hardwareConcurrency: 8, deviceMemory: 4 }, mq(false)).light, false);
});
test("each crash takes one worker away, never the last one", () => {
  let p = devicePlan({ hardwareConcurrency: 4, deviceMemory: 8 });
  assert.equal(p.workers, 3);
  for (const want of [2, 1, 1, 1]) { p = backedOff(p, "a worker ran out of memory"); assert.equal(p.workers, want); }
  assert.ok(p.reason.some((r) => r.includes("ran out of memory")));
});
test("?workers=N is obeyed up to the cap of six", () => {
  assert.equal(devicePlan({ hardwareConcurrency: 20, deviceMemory: 8 }, undefined, "2").workers, 2);
  assert.equal(devicePlan({ hardwareConcurrency: 20, deviceMemory: 8 }, undefined, "40").workers, 6);
  assert.equal(devicePlan({ hardwareConcurrency: 20, deviceMemory: 8 }, undefined, "x").workers, 6);
});
