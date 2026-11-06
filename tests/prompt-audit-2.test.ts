// Second half of the file named after this one: the CSG heap never shrinks, so each process designs only so many robots.
// Regression cases from the fresh-clone prompt audit: reach vs per-link length, link
// counts, multilingual keywords, contradictions and requested overall sizes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, interpretPrompt } from "@ttr/robot-generator";
import { reachModel } from "../packages/robot-generator/src/sizing.ts";

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const reachOf = (prompt: string) => reachModel(interpretPrompt(prompt).spec)!.reach;
const _near = (a: number, b: number, tol = 0.011) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

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

test("requested overall sizes are design inputs where the designer takes them, else reported", () => {
  // a stated height sizes a designed humanoid (built within 3 %); above servo size it moves to QDD legs
  const small = read("humanoid 70 cm tall");
  assert.ok(small.dimensions.some((d) => /^height 0\.(69|7\d) m$/.test(d)), small.dimensions.join());
  const tall = read("humanoid 1.2 m tall");
  assert.ok(tall.dimensions.some((d) => /^height 1\.(1[7-9]|2\d) m$/.test(d)), tall.dimensions.join());
  assert.match(tall.approximations.join(), /quasi-direct-drive/);
  assert.match(read("humanoid 1.5 m tall").approximations.join(), /1\.5 m: humanoids are designed .* built 1\.\d\d m tall/);
  assert.ok(!read("battle mech 1.2 m tall").ignored.some((x) => /wearer/.test(x)), "a standalone mech is not a suit");
  const tiny = read("tiny 5 cm arm");
  assert.match(tiny.approximations.join(), /5 cm: reach 0\.\d\d m, the shortest this arm design allows/)
  assert.ok(tiny.dimensions.some((d) => /^reach 0\.\d\d m$/.test(d)), tiny.dimensions.join());
  assert.ok(reachOf("tiny 5 cm arm") <= reachOf("6 dof arm"), "the shortest feasible arm is built");
  // the default arm may already be the shortest its clevises allow: "tiny" is never longer, "large" is longer
  assert.ok(reachOf("tiny arm") <= reachOf("6 dof arm") && reachOf("large arm") > reachOf("6 dof arm"));
  assert.match(read("a 2 m wide quadruped").ignored.join(), /width 2 m: the quadruped is sized from its parts and load/);
});
