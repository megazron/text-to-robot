// Wearable Mark 43: the motorised helmet fits a wearer, opens fully, prints in bed-sized pieces.
// (The full suit is covered by examples-wiring.test.ts and examples-interference.test.ts on the example built from it.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "@ttr/robot-schema";
import { designMark43Wearable } from "@ttr/design";

test("the motorised helmet passes every check and its faceplate opens at least 52 deg clear of everything", () => {
  const s = designMark43Wearable({ tier: "helmet" }), d = (s.metadata as any).design;
  const v = validateSpec(s);
  assert.ok(v.valid, v.issues.map((i: any) => i.message).join("; "));
  for (const c of d.checks) assert.ok(c.pass, `${c.name}: ${c.detail}`);
  const fp = s.joints.find((j: any) => j.name === "faceplate")!;
  assert.ok(fp.limit!.lower! <= -0.9);
  for (const p of d.printed) assert.ok(p.check.fits_bed && p.check.watertight, p.name);
  // the suit is designed on its own: no body model inside it
  assert.ok(!s.links.some((l: any) => l.role === "wearer"));
  assert.ok(!d.printed.some((p: any) => /pelvis|head$/.test(p.name)));
});

test("the helmet alone still has its harness: a belt case, fused and switched, its leads up through the neck", () => {
  const s = designMark43Wearable({ tier: "helmet" }), d = (s.metadata as any).design, w = d.wiring;
  assert.deepEqual(w.rails.map((r: any) => r.name).sort(), ["5V_SERVO", "VBAT"]);
  assert.ok(w.fuses.length === 1 && w.main_switch === "main_switch");
  assert.ok(!s.links.some((l: any) => l.name === "regulator_lights" || l.name === "bay_saddle" || /^chan_(spine|chest)/.test(l.name)));
  assert.ok(s.links.some((l: any) => /^chan_left_helmet/.test(l.name)), "the helmet keeps its own channels");
  const servo = w.cables.find((c: any) => c.to === "faceplate_servo_left");
  assert.ok(servo.joints.some((j: any) => j.joint === "neck"));
  const eye = w.cables.find((c: any) => c.to === "eye_led_left");
  assert.deepEqual(eye.joints.map((j: any) => j.joint), ["neck", "faceplate"]);
});

test("a taller suit keeps the ports under the compartment's grommets", () => {
  const s = designMark43Wearable({ tier: "lights", heightM: 1.95 }), d = (s.metadata as any).design;
  for (const c of d.checks) if (/^(wiring|enclosure):/.test(c.name)) assert.ok(c.pass, `${c.name}: ${c.detail}`);
});
