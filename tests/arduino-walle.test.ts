// Arduino WALL-E: every check passes, printed parts are single closed solids, joints sweep without collisions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "@ttr/robot-schema";
import { designArduinoWallE } from "@ttr/design";
import { arduinoOptions } from "@ttr/robot-generator";

test("Arduino WALL-E passes every check", () => {
  const s = designArduinoWallE({ prompt: "wall-e" }), d = (s.metadata as any).design;
  const v = validateSpec(s);
  assert.ok(v.valid, v.issues.map((i: any) => i.message).join("; "));
  for (const c of d.checks) assert.ok(c.pass, `${c.name}: ${c.detail}`);
  for (const n of ["clearance:home", "drive:skid_turn", "power:servo_supply"]) assert.ok(d.checks.some((c: any) => c.name === n), n);
  assert.equal(s.joints.filter((j: any) => j.type === "continuous" && !j.passive).length, 4);
  for (const p of d.purchased) assert.match(p.key, /^(arduino_|tt_gearmotor|wheel_65mm_tt|tb6612|breadboard|pack_2s_18650|hobby_sg90|pca9685_clone|buck_lm2596|hc_sr04)/, p.key);
});

test("Arduino mode routes WALL-E prompts to it", () => {
  const r = arduinoOptions("make me a wall-e robot");
  assert.equal(r.family, "wall_e");
  assert.equal(r.options.length, 1);
  assert.deepEqual(r.options[0].failing, []);
});
