// Second half of the file named after this one: the CSG heap never shrinks, so each process designs only so many robots.
// The local parser must apply, approximate or explicitly report every request (part 1 of 3: the
// design engine's CSG library keeps a little WASM memory per robot, so the suite is split across processes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, interpretPrompt, parsePrompt, extractBudget, } from "@ttr/robot-generator";
import { extractLengths, extractMasses, parseBudget, extractName, extractColour, } from "../packages/robot-generator/src/text.ts";

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const _family = (prompt: string) => read(prompt).family;

test("names stop at the next phrase", () => {
  assert.equal(parsePrompt("an arm called atlas with a camera").robot_name, "atlas");
  assert.equal(parsePrompt('a quadruped named "Rover Prime" for patrols').robot_name, "rover_prime");
  assert.equal(extractName("a robot named zed, with wheels"), "zed");
});


test("lengths are unit-aware and set the arm's stretched reach", () => {
  const cm = extractLengths("with 60 cm reach")[0];
  assert.equal(cm.context, "reach"); assert.ok(Math.abs(cm.metres - 0.6) < 1e-9);
  assert.ok(Math.abs(extractLengths("600mm reach")[0].metres - 0.6) < 1e-9);
  assert.ok(Math.abs(extractLengths("a 6 ft 2 wearer")[0].metres - 1.8796) < 1e-4);
  assert.equal(extractLengths("moves at 2 m/s").length, 0);
  assert.equal(extractLengths("under 2 m reach")[0].bound, "max");
  for (const [prompt, reach] of [["6 dof arm with 60 cm reach", "0.60"], ["6 dof arm with 1 m reach", "1.00"], ["a scara with 600 mm reach", "0.60"]] as const)
    assert.match(read(prompt).dimensions.join(), new RegExp(`reach ${reach} m`), prompt);
  assert.match(read("6 dof arm under 2 m reach").dimensions.join(), /within the 2 m limit/);
  // a designed humanoid is built to a stated height within 3 % (QDD legs above servo size)
  assert.ok(read("1.2 m tall humanoid").dimensions.some((d) => /^height 1\.(1[7-9]|2[0-3]) m$/.test(d)), "a humanoid is built to a stated height");
  assert.match(read("humanoid 5 m tall").approximations.join(), /5 m: humanoids are designed .* built 1\.\d\d m tall/);
  assert.match(read("a quadruped that moves at 2 m/s").ignored.join(), /speed 2 m\/s/);
});


test("size adjectives apply to arms and ignore sensor adjectives", () => {
  assert.match(read("a small 4 dof arm").dimensions.join(), /small: reach/);
  assert.equal(read("small camera on a 6 dof arm").dimensions.length, 0);
});


test("budget: dollars only; lengths and masses are not money", () => {
  assert.equal(extractBudget("budget $1500"), 1500);
  assert.equal(extractBudget("under 2000 dollars"), 2000);
  assert.equal(extractBudget("budget of 1.5k"), 1500);
  assert.equal(extractBudget("6 dof arm under 2 m reach"), undefined);
  assert.equal(extractBudget("6 dof arm, max 5 kg payload"), undefined);
  assert.equal(parseBudget("budget 500 euros").unsupported, "500 euros");
  assert.equal(parseBudget("₹40000").usd, undefined);
  assert.match(read("6 dof arm, budget 500 euros").ignored.join(), /only US-dollar/);
});


test("payload is sized into the BOM actuators", async () => {
  assert.deepEqual(extractMasses("lifts 2 kg").map((m) => [m.kg, m.context]), [[2, "payload"]]);
  assert.ok(Math.abs(extractMasses("a 10 lb payload")[0].kg - 4.5359237) < 1e-6);
  const plain = await generateRobot("6 dof arm");
  const loaded = await generateRobot("6 dof arm with a 2 kg payload");
  assert.equal(loaded.interpretation?.payload_kg, 2);
  const effort = (r: typeof plain, j: string) => r.bom.actuator_sizing.find((s) => s.joint === j)!.required_effort;
  // exact worst-case loads of the built arm: every pitch joint carries the payload's moment
  for (const j of ["shoulder_pitch", "elbow_pitch", "wrist_pitch"]) assert.ok(effort(loaded, j) > effort(plain, j), j);
  assert.ok(effort(loaded, "wrist_pitch") - effort(plain, "wrist_pitch") > 0.4, "wrist carries the payload's tool moment");
  assert.ok(loaded.bom.total > plain.bom.total, "a 2 kg payload needs bigger (dearer) actuators");
  assert.match(loaded.bom.notes.join(), /2 kg payload/);
  // a designed quadruped carries the load on its back: it is a design input, not ignored
  const dog = interpretPrompt("a quadruped carrying 3 kg");
  assert.equal(dog.interpretation.payload_kg, 3);
  assert.equal((dog.spec.metadata as any).design.request.payloadKg, 3);
});


test("colour applies to the robot body, not to objects it handles", () => {
  assert.equal(extractColour("a red 6 dof arm that sorts blue blocks"), "red");
  assert.equal(extractColour("an arm that sorts red blocks"), undefined);
  // designed robots take the colour on their accent parts
  assert.deepEqual(parsePrompt("a blue quadruped").materials.find((m) => m.name === "printed_accent")!.color, [0.15, 0.35, 0.8, 1]);
  assert.match(read("a red Baymax robot").ignored.join(), /livery/);
});
