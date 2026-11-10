// The robot types added for open-ended prompts are designed from real parts: each one is valid, passes every engineering
// check it records, and says what it is. One prompt per family (the design engine keeps CSG memory per robot).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot } from "@ttr/robot-generator";

const CASES: [string, string][] = [
  ["a quadcopter drone with a camera", "drone_quad"],
  ["a small underwater rov to explore a lake", "rov_underwater"],
  ["a snake robot", "snake"],
  ["a pen plotter that draws portraits", "gantry_xyz"],
  ["a delta robot that sorts candy", "delta_parallel"],
  ["a five finger robot hand", "hand_dexterous"],
  ["a robot dog with an arm", "quadruped"],
];
const only = process.env.TTR_FAMILY;

for (const [prompt, family] of CASES) {
  if (only && only !== family) continue;
  test(`${prompt}: designed as ${family}, valid, every check passes`, async () => {
    const r = await generateRobot(prompt);
    assert.ok(r.validation.valid, JSON.stringify(r.validation).slice(0, 400));
    assert.ok(r.urdfValidation.valid, JSON.stringify(r.urdfValidation).slice(0, 400));
    const d = (r.robot.metadata as { design?: { family: string; checks: { name: string; pass: boolean; detail: string }[]; summary: string } }).design;
    assert.ok(d, "designed, not a template");
    assert.equal(d.family, family);
    const failing = d.checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`);
    assert.deepEqual(failing, []);
    assert.ok(r.bom.total > 0);
  });
}
