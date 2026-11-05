// Parts named in the prompt are used, or the swap is stated with the engineering reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot } from "@ttr/robot-generator";

const keys = (r: any) => new Set<string>(r.robot.metadata.design.purchased.map((p: any) => p.key));

test("named servos and board are used on the Arduino arm", async () => {
  const r = await generateRobot("a 3 joint robot arm with MG996R servos and an Arduino Nano");
  const k = keys(r);
  assert.ok(k.has("arduino_nano_clone") && !k.has("arduino_uno_clone"));
  assert.ok(k.has("hobby_mg996r"));
  assert.ok(r.interpretation?.dimensions.includes("Arduino Nano as asked"));
  assert.ok(!r.warnings.some((w) => /only arms are designed for hobby servos/.test(w)));
});

test("an L298N or Uno that does not suit the car is swapped with the reason", async () => {
  const r = await generateRobot("a cheap 2wd car with an L298N driver and an arduino uno");
  const k = keys(r);
  assert.ok(k.has("tb6612fng_module") && k.has("arduino_nano_clone"));
  assert.ok(r.warnings.some((w) => /L298N named: a TB6612FNG is used instead/.test(w)));
  assert.ok(r.warnings.some((w) => /Arduino Uno named: an Arduino Nano is used instead/.test(w)));
});
