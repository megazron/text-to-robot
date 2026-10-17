// Regression cases from the fresh-clone prompt audit: reach vs per-link length, link
// counts, multilingual keywords, contradictions and requested overall sizes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, interpretPrompt } from "@ttr/robot-generator";
import { extractLengths, extractDofMentions } from "../packages/robot-generator/src/text.ts";
import { translateKeywords } from "../packages/robot-generator/src/lexicon.ts";
import { reachModel } from "../packages/robot-generator/src/sizing.ts";

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const reachOf = (prompt: string) => reachModel(interpretPrompt(prompt).spec)!.reach;
const near = (a: number, b: number, tol = 0.011) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test("an explicitly stated reach wins over a per-link length", () => {
  const p = "robotic arm with 3 links, each 25 cm long, reach 750 mm";
  const ctx = extractLengths(p).map((l) => [l.raw, l.context]);
  assert.deepEqual(ctx, [["25 cm", "length"], ["750 mm", "reach"]]);
  const i = read(p);
  assert.equal(i.family, "serial_arm");
  assert.equal(i.label, "3-DOF serial arm");
  near(reachOf(p), 0.75);
  assert.ok(i.dimensions.some((d) => /reach 0\.75 m/.test(d)), i.dimensions.join());
  assert.match(i.ignored.join(), /each link 25 cm: the stated reach 750 mm takes precedence/);
  assert.doesNotMatch(i.ignored.join(), /state a reach instead/);
  assert.ok(!i.ignored.some((x) => /750 mm/.test(x) && !/takes precedence/.test(x)), "the reach itself must be applied");
});

test("a per-link length without a reach sets the arm segment lengths", () => {
  const { spec, interpretation: i } = interpretPrompt("robotic arm with 3 links, each 25 cm long");
  assert.match(i.dimensions.join(), /upper_arm, forearm 0\.25 m each/);
  for (const name of ["upper_arm", "forearm"]) {
    const g = spec.links.find((l) => l.name === name)!.geometry;
    assert.equal(g.type, "mesh");
    if (g.type === "mesh") near(g.bbox.max[2] - g.bbox.min[2], 0.25, 0.002);
  }
  assert.match(i.approximations.join(), /shoulder keeps the template length/);
  // impossible per-link lengths are reported, not silently dropped
  assert.match(read("arm with 3 links, each 4 m long").ignored.join(), /each link 4 m: .*outside the supported/);
});

test("N links / N-link arms map to N DOF", () => {
  for (const [p, n] of [["a simple 2-link planar arm", 2], ["arm with 2 links", 2], ["a 4 link robot arm", 4], ["arm with 5 joints", 5]] as const) {
    const r = interpretPrompt(p);
    assert.equal(r.interpretation.family, "serial_arm", p);
    assert.equal(r.spec.robot_name, `arm_${n}dof`, p);
    assert.equal(r.spec.joints.filter((j) => /^joint_\d+$/.test(j.name)).length, n, p);
  }
  assert.match(read("arm with 2 links").approximations.join(), /"2 links" read as 2 DOF/);
  assert.ok(!read("a simple 2-link planar arm").ignored.length, "the 2-DOF arm is planar");
  assert.match(read("a 3-link planar arm").ignored.join(), /planar: .*only the 2-DOF arm is planar/);
  assert.match(read("a 20 link arm").approximations.join(), /20 DOF clamped to 12/);
  assert.deepEqual(extractDofMentions("2 dof arm with 7 joints").map((m) => [m.value, m.unit]), [[2, "dof"], [7, "joint"]]);
});

test("German, French and Spanish keywords are understood", async () => {
  const de = await generateRobot("ein Roboterarm mit sechs Achsen und Greifer");
  assert.equal(de.robot.robot_name, "arm_6dof");
  assert.equal(de.robot.end_effectors.length, 1);
  assert.ok(de.warnings.some((w) => /^approximated: read non-English keywords/.test(w)), de.warnings.join());
  assert.equal(interpretPrompt("Roboterarm mit vier Freiheitsgraden ohne Greifer").spec.end_effectors.length, 0);
  assert.equal(interpretPrompt("Roboterarm mit vier Freiheitsgraden ohne Greifer").spec.robot_name, "arm_4dof");
  assert.equal(read("ein sechsachsiger Roboterarm").label, "6-DOF serial arm");
  assert.equal(read("un bras robotique à cinq axes avec pince").label, "5-DOF serial arm");
  assert.equal(read("un brazo robótico de cuatro ejes con pinza").label, "4-DOF serial arm");
  assert.equal(read("ein Roboter mit vier Beinen").family, "quadruped");
  assert.equal(read("un robot à quatre roues").family, "four_wheel");
  assert.equal(read("un robot con ruedas y cámara").family, "diff_drive");
  assert.deepEqual(read("un robot con ruedas y cámara").sensors.map((s) => s.type), ["camera"]);
  // English prompts are never rewritten, even with words that are function words elsewhere
  for (const p of ["a 6 dof arm with a y axis camera", "robot dog with a camera", "a mobile robot"]) assert.equal(translateKeywords(p).text, p);
});

test("contradictions produce one explicit warning per conflict", async () => {
  const r = await generateRobot("a 2 DOF arm with 7 joints that is also a wheeled rover");
  const conflicts = r.warnings.filter((w) => w.startsWith("conflict: "));
  assert.equal(conflicts.length, 2, r.warnings.join("\n"));
  assert.match(conflicts.join(), /"7 joints" contradicts "2 dof"; built 2 DOF/);
  assert.match(conflicts.join(), /"arm" and "wheeled rover" describe two different robots/);
  assert.equal(r.interpretation!.family, "rover_arm");
  assert.match(read("a humanoid on wheels").conflicts.join(), /"wheels" asks for a wheeled base/);
  assert.match(read("a small large arm").conflicts.join(), /"small" and "large" contradict/);
  assert.match(read("6 dof arm with 50 cm reach and 1 m reach").conflicts.join(), /reach 1 m contradicts the earlier reach 50 cm/);
  // consistent or complementary requests are not conflicts
  for (const p of ["a 6 dof arm with 6 joints", "a mobile manipulator with a 6 dof arm", "a mars rover with an arm", "humanoid with two 7 DOF arms", "a six-legged robot"])
    assert.deepEqual(read(p).conflicts, [], p);
});

test("requested overall sizes are applied when the template supports them, else reported", () => {
  const humanoid = read("humanoid 1.5 m tall");
  assert.match(humanoid.ignored.join(), /height 1\.5 m: the humanoid template has a fixed size \(built about \d\.\d\d m tall\); scaling to a stated size is not supported/);
  const tiny = read("tiny 5 cm arm");
  assert.match(tiny.approximations.join(), /5 cm: reach 0\.\d\d m, the shortest this arm template allows/);
  assert.ok(tiny.dimensions.some((d) => /^reach 0\.\d\d m$/.test(d)), tiny.dimensions.join());
  assert.ok(reachOf("tiny 5 cm arm") < reachOf("6 dof arm"), "the shortest feasible arm is built");
  assert.ok(reachOf("tiny arm") < reachOf("6 dof arm") && reachOf("large arm") > reachOf("6 dof arm"));
  assert.match(read("a 2 m wide quadruped").ignored.join(), /width 2 m: the quadruped template has a fixed size/);
});
