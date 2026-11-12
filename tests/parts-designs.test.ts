// "Build from my parts", designed: the best option of an inventory prompt is a complete design that passes every check the
// designers run (clearance, print bed, wiring, power, torque), a valid spec and URDF, a bill of materials that splits
// "you have it" from "to buy", and a sketch whose pins are the pins the harness wired.
// One prompt per kind of robot by default (each design takes one to four minutes); TTR_PARTS_ALL=1 designs all of them.
import { test } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { fromParts } from "@ttr/robot-generator";
import { validateSpec } from "@ttr/robot-schema";
import { generateUrdf } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import { firmwareFor, pinTable } from "@ttr/design";
import { PARTS_PROMPTS } from "./parts-prompts.ts";

const SAMPLE = [
  "I have an Arduino Uno, 2 TT gear motors, an L298N, an HC-SR04, 4 AA batteries and a servo SG90",
  "Parts: Arduino Nano, TB6612FNG, 2 TT motors, 2 wheels, 3-channel line tracking module, 2S 18650 holder",
  "Raspberry Pi 4, Pi camera, 2 TT motors, L298N, power bank",
  "SG90, HC-SR04, Arduino Nano",
  "a pack of 10 SG90 servos, an Arduino Nano and a PCA9685",
  "I have 2 MG996R and 2 SG90 servos, an Arduino Uno and a 5V 4A power adapter",
  "ESP32 devkit, 2 TT motors, DRV8833, HC-SR04, MPU6050, buzzer, 2x18650 holder",
];
const prompts = process.env.TTR_PARTS_ALL ? PARTS_PROMPTS.map((p) => p.text) : SAMPLE;

for (const text of prompts) test(`designed from my parts: ${text.replace(/\n/g, " / ").slice(0, 90)}`, () => {
  const r = fromParts(text, { design: "top" });
  if (!r.options.length) { assert.ok(r.cannot && r.cannot.add.length, "no option and no advice"); return; }
  const o = r.options[0], d = r.designs[o.id];
  assert.ok(d, `the top option ${o.id} was designed`);
  assert.deepEqual(d.failing, [], `${o.id} fails: ${d.failing.join(", ")}`);
  const v = validateSpec(d.robot); assert.ok(v.valid, JSON.stringify(v));
  const u = validateUrdf(generateUrdf(d.robot)); assert.ok(u.valid, JSON.stringify(u));
  // the parts list: every line has / buys, owned lines are the user's parts, the total to buy is the shopping list
  for (const l of d.bom.lines) { assert.equal((l.have ?? 0) + (l.buy ?? 0), l.qty, l.name); }
  for (const [k, q] of Object.entries(o.uses)) {
    const line = d.bom.lines.find((l) => l.key === k);
    if (line) assert.ok((line.have ?? 0) >= Math.min(q, line.qty), `${k}: the BOM does not mark the user's part as owned`);
  }
  assert.ok(Math.abs(d.bom.to_buy_total! - d.shopping.reduce((s, l) => s + l.subtotal_usd, 0)) < 0.05, "to buy total = shopping list");
  // the program: every pin it uses is a pin the harness wired on the controller
  const f = firmwareFor(d.robot); assert.ok(f, "no sketch");
  // TTR_PARTS_OUT=<dir>: keep each design and its program (to compile the sketches with arduino-cli)
  if (process.env.TTR_PARTS_OUT) { const dir = `${process.env.TTR_PARTS_OUT}/${o.id}_${prompts.indexOf(text)}`; mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/${f!.name}`, f!.code); writeFileSync(`${dir}/robot.json`, JSON.stringify(d.robot)); }
  const w = (d.robot.metadata as { design?: { wiring?: { nets: { pins: string[] }[] }; firmware?: never } }).design!;
  const wired = new Set(w.wiring!.nets.flatMap((n) => n.pins).filter((p) => p.startsWith("controller.")).map((p) => p.split(".").pop()!.split("/")[0].trim()));
  for (const [role, pin] of pinTable(w.firmware!)) { if (/^PCA9685 ch/.test(pin)) continue; assert.ok(wired.has(pin.split("/")[0]), `${role} on ${pin} is not wired to the controller (${[...wired].join(" ")})`); assert.ok(f!.code.includes(f!.language === "python" ? pin.replace(/^GPIO/, "") : pin.replace(/^D(\d+)$/, "$1").replace(/^GPIO/, "")), `${role}: pin ${pin} missing from the sketch`); }
});
