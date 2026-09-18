import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { generateRobot, DemoProvider, finalizeSpec } from "@ttr/robot-generator";
import { ironManSuit, wearableExosuit, ironManMarkSuit, wallE, eva, baymax } from "@ttr/robot-templates";
import { validateSpec } from "@ttr/robot-schema";
import { generateUrdf as urdf } from "@ttr/urdf-generator";
import { validateUrdf as vurdf } from "@ttr/urdf-validator";

const CASES: [string, string, RegExp][] = [
  ["Build me a movie-accurate wearable Iron Man Mark 43 suit from Age of Ultron with armour plates that open and close", "iron_man_mark_43", /faceplate|chest_shell|helmet_cranium/],
  ["Build a bare powered exoskeleton I can wear", "exosuit", /thigh_cuff|shank_cuff|strut/],
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
  for (const b of [ironManSuit, wallE, eva, baymax, () => wearableExosuit(), () => ironManMarkSuit()]) {
    const s = finalizeSpec(b());
    assert.ok(validateSpec(s).valid, `${s.robot_name} spec`);
    assert.ok(vurdf(urdf(s)).valid, `${s.robot_name} urdf`);
  }
});
test("shipped MuJoCo reports show every character passing its simulation battery", () => {
  for (const ex of ["14_iron_man_mark_43", "15_wall_e", "16_eva", "17_baymax", "08_humanoid", "11_spider_scout"]) {
    const p = `examples/${ex}/mujoco_report.json`;
    assert.ok(existsSync(p), `missing ${p}`);
    const rep = JSON.parse(readFileSync(p, "utf8"));
    assert.equal(rep.passed, rep.total, `${ex}: ${rep.passed}/${rep.total}`);
    assert.ok(rep.floating, `${ex} should simulate with a floating base`);
  }
});

test("the wearable exosuit is anthropometric: joints at human heights, feet on the ground, cuffs on both limbs", async () => {
  const { finalizeSpec } = await import("@ttr/robot-generator");
  const { linkPositions } = await import("@ttr/kinematics");
  const spec = finalizeSpec(wearableExosuit({ height_m: 1.75 }));
  const p = linkPositions(spec, {});
  assert.ok(Math.abs(p["left_hip_module"][2] - 0.96) < 0.05, "hip height");
  assert.ok(Math.abs(p["left_knee_module"][2] - 0.53) < 0.05, "knee height");
  assert.ok(Math.abs(p["left_shoulder_module"][2] - 1.47) < 0.06, "shoulder height");
  assert.ok(Math.min(...Object.values(p).map((v) => v[2])) >= -1e-9, "nothing below ground");
  for (const n of ["left_thigh_cuff", "right_thigh_cuff", "left_shank_cuff", "right_shank_cuff", "left_upper_arm_cuff", "right_forearm_cuff", "left_boot", "right_hand"])
    assert.ok(spec.links.some((l) => l.name === n), `missing ${n}`);
  assert.equal(spec.joints.filter((j) => j.type !== "fixed").length, 17);
  assert.ok(spec.sensors.some((s) => s.type === "force"), "insole force sensors");
});

test("the Mark suit is articulated: dozens of hinged armour plates over the 17-joint frame, all closed at zero", async () => {
  const { finalizeSpec } = await import("@ttr/robot-generator");
  const spec = finalizeSpec(ironManMarkSuit());
  const hinges = spec.joints.filter((j) => j.name.endsWith("_hinge"));
  assert.ok(hinges.length >= 40, `expected >= 40 armour hinges, got ${hinges.length}`);
  for (const h of hinges) assert.ok(h.limit && h.limit.lower !== undefined && h.limit.upper !== undefined && h.limit.lower <= 0 && h.limit.upper >= 0, `${h.name} must close at 0`);
  for (const n of ["faceplate", "left_chest_plate", "right_back_door", "left_gauntlet_inner", "right_thigh_inner", "left_thruster_cover", "left_finger_1"])
    assert.ok(spec.links.some((l) => l.name === n), `missing ${n}`);
  assert.equal(spec.joints.filter((j) => j.type !== "fixed" && !j.name.endsWith("_hinge")).length, 17, "frame joints intact");
});
