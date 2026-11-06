// The rest of the overall-size audit: a mech design takes about 1 GB of the CSG heap, which never shrinks, so each process designs only a few.
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretPrompt } from "@ttr/robot-generator";
import { reachModel } from "../packages/robot-generator/src/sizing.ts";

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const reachOf = (prompt: string) => reachModel(interpretPrompt(prompt).spec)!.reach;

test("requested overall sizes: a mech, a tiny arm, a wide quadruped", () => {
  assert.ok(!read("battle mech 1.2 m tall").ignored.some((x) => /wearer/.test(x)), "a standalone mech is not a suit");
  const tiny = read("tiny 5 cm arm");
  assert.match(tiny.approximations.join(), /5 cm: reach 0\.\d\d m, the shortest this arm design allows/)
  assert.ok(tiny.dimensions.some((d) => /^reach 0\.\d\d m$/.test(d)), tiny.dimensions.join());
  assert.ok(reachOf("tiny 5 cm arm") <= reachOf("6 dof arm"), "the shortest feasible arm is built");
  // the default arm may already be the shortest its clevises allow: "tiny" is never longer, "large" is longer
  assert.ok(reachOf("tiny arm") <= reachOf("6 dof arm") && reachOf("large arm") > reachOf("6 dof arm"));
  assert.match(read("a 2 m wide quadruped").ignored.join(), /width 2 m: the quadruped is sized from its parts and load/);
});
