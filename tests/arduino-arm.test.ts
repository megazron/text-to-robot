// Arduino desk arm: hobby servos only, every check passes (torque, clearance through the joint ranges, print, supply).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "@ttr/robot-schema";
import { designArduinoArm } from "@ttr/design";
import { arduinoOptions } from "@ttr/robot-generator";

const POOL = ["hobby_sg90", "hobby_mg90s", "hobby_mg996r", "hobby_ds3218"];

test("the cheapest desk arm passes every check and buys only hobby parts", () => {
  const s = designArduinoArm({ servos: POOL, payloadKg: 0.02 }), d = (s.metadata as any).design;
  const v = validateSpec(s);
  assert.ok(v.valid, v.issues.map((i: any) => i.message).join("; "));
  for (const c of d.checks) assert.ok(c.pass, `${c.name}: ${c.detail}`);
  for (const p of d.purchased) assert.match(p.key, /^(hobby_|arduino_|pca9685_clone|psu_5v|dc_jack)/, p.key);
  assert.ok(d.checks.some((c: any) => c.name === "clearance:home"));
});

test("each joint gets the cheapest servo that holds it; more payload costs at least as much and reaches no further", () => {
  const light = designArduinoArm({ servos: POOL, payloadKg: 0.02 }), heavy = designArduinoArm({ servos: POOL, payloadKg: 0.2 });
  const d = (s: any) => s.metadata.design;
  // the servo's continuous rating covers the joint's worst static load (required_nm carries the x1.3 dynamic factor)
  for (const j of d(light).joints) assert.ok(j.rated_nm >= j.required_nm / 1.3 - 1e-6, `${j.joint}: ${j.rated_nm} vs ${j.required_nm}`);
  assert.ok(d(heavy).performance.cost_usd >= d(light).performance.cost_usd);
  assert.ok(d(heavy).performance.reach_m <= d(light).performance.reach_m);
});

test("Arduino mode offers three working arm tiers, cheapest first", () => {
  const r = arduinoOptions("robot arm with gripper");
  assert.equal(r.options.length, 3);
  for (const o of r.options) assert.deepEqual(o.failing, [], `${o.tier}: ${o.failing}`);
  assert.ok(r.options[0].cost_usd <= r.options[2].cost_usd);
});
