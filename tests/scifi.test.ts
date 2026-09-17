import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { generateRobot, DemoProvider, finalizeSpec } from "@ttr/robot-generator";
import { ironManSuit, wallE, eva, baymax } from "@ttr/robot-templates";
import { validateSpec } from "@ttr/robot-schema";
import { generateUrdf as urdf } from "@ttr/urdf-generator";
import { validateUrdf as vurdf } from "@ttr/urdf-validator";

const CASES: [string, string, RegExp][] = [
  ["Build me an Iron Man style powered exosuit with repulsor thrusters", "iron_man_suit", /repulsor|thruster/],
  ["Build WALL-E, a tracked trash-compactor robot", "wall_e", /eye|track/],
  ["Build EVA, a sleek hovering egg-shaped droid", "eva", /hover|visor/],
  ["Build Baymax, an inflatable healthcare companion", "baymax", /foot|thigh/],
];
for (const [prompt, name, marker] of CASES) {
  test(`sci-fi prompt routes to ${name} and yields a valid, sensed robot`, async () => {
    const r = await generateRobot(prompt, { provider: new DemoProvider() });
    assert.equal(r.robot.robot_name, name);
    assert.ok(r.validation.valid && r.urdfValidation.valid);
    assert.ok(r.robot.sensors.length >= 1, "characters carry at least one sensor");
    assert.ok(r.robot.links.some((l) => marker.test(l.name)), `expected a link matching ${marker}`);
  });
}
test("all four characters pass spec + URDF validation from their templates", () => {
  for (const b of [ironManSuit, wallE, eva, baymax]) {
    const s = finalizeSpec(b());
    assert.ok(validateSpec(s).valid, `${s.robot_name} spec`);
    assert.ok(vurdf(urdf(s)).valid, `${s.robot_name} urdf`);
  }
});
test("shipped MuJoCo reports show every character passing its simulation battery", () => {
  for (const ex of ["14_iron_man_suit", "15_wall_e", "16_eva", "17_baymax", "08_humanoid", "11_spider_scout"]) {
    const p = `examples/${ex}/mujoco_report.json`;
    assert.ok(existsSync(p), `missing ${p}`);
    const rep = JSON.parse(readFileSync(p, "utf8"));
    assert.equal(rep.passed, rep.total, `${ex}: ${rep.passed}/${rep.total}`);
    assert.ok(rep.floating, `${ex} should simulate with a floating base`);
  }
});
