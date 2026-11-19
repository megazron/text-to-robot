// A change edits the robot that is there: "only 4 wheels" on a six-wheel rover gives a four-wheel robot (drive, wiring,
// power and BOM made for four), "make it red" paints it and adds nothing, a look is put on or taken off, arms come and
// go, and every change is said. Chains of changes, each step held to the robot it should be.
// Sharded by TTR_SHARD="i/n", like the rest of tests/fidelity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, modifyRobot } from "@ttr/robot-generator";
import { setDefaultRouter } from "@ttr/design";
import type { RobotSpecification } from "@ttr/robot-schema";

setDefaultRouter("legacy");
const [shard, shards] = (process.env.TTR_SHARD ?? "1/1").split("/").map(Number);
const mine = <T,>(xs: T[]) => xs.filter((_, i) => i % shards === shard - 1);

type D = { family: string; checks: { name: string; pass: boolean; detail: string }[]; performance: Record<string, unknown>; printed: { name: string }[] };
const design = (s: RobotSpecification) => (s.metadata as unknown as { design: D }).design;
const wheels = (s: RobotSpecification) => s.joints.filter((j) => /wheel/.test(j.name) && !/steer/.test(j.name) && j.type !== "fixed").length + new Set(s.joints.filter((j) => /caster/.test(j.name) && j.type !== "fixed").map((j) => j.name.replace(/_(?:roll|spin|swivel|wheel|pivot|ball)$/, ""))).size;
const arms = (s: RobotSpecification) => new Set(s.joints.filter((j) => j.type === "revolute" && /(?:^|_)(?:shoulder\w*|base_yaw)$/.test(j.name)).map((j) => j.name.replace(/_?(?:shoulder\w*|base_yaw)$/, ""))).size;
const colour = (s: RobotSpecification, name: string) => s.materials.find((m) => m.name === name)?.color.slice(0, 3).map((c) => +c.toFixed(2)).join(",");
const RED = "0.78,0.12,0.12", BLUE = "0.15,0.35,0.8";
const shell = (s: RobotSpecification) => String(design(s).performance.shell ?? "");
const geometry = (s: RobotSpecification) => JSON.stringify(s.links.map((l) => [l.name, l.geometry])) + JSON.stringify(s.joints.map((j) => [j.name, j.origin, j.limit]));

type Step = [string, (s: RobotSpecification, before: RobotSpecification, changes: string[]) => void];
const CHAINS: [string, Step[]][] = [
  ["a 6 wheel rover", [
    // the owner's change: red, and four wheels, not a part stacked on six
    ["change to red colour and only 4 wheels", (s, b, c) => { assert.equal(wheels(s), 4); assert.equal(colour(s, "printed"), RED); assert.ok(s.links.length < b.links.length, "nothing stacked on it"); assert.ok(c.some((x) => /6 wheels -> 4 wheels/.test(x)) && c.some((x) => /colour -> red/.test(x)), c.join(" | ")); assert.doesNotMatch(s.robot_name, /six/, "the name says four wheels"); }],
    ["make it blue", (s, b, c) => { assert.equal(colour(s, "printed"), BLUE); assert.equal(geometry(s), geometry(b), "a colour adds no geometry"); assert.ok(c.some((x) => /colour -> blue/.test(x))); }],
    ["only 3 wheels", (s, _b, c) => { assert.equal(wheels(s), 3); assert.equal(design(s).family, "mobile_diff_drive"); assert.equal(colour(s, "printed"), BLUE, "the colour stays"); assert.ok(c.some((x) => /4 wheels -> 3 wheels/.test(x)), c.join(" | ")); }],
    ["make it look like a shoe", (s, _b, c) => { assert.match(shell(s), /^shoe/); assert.equal(wheels(s), 3); assert.ok(c.some((x) => /\+ shoe shell/.test(x))); }],
    ["make it bigger", (s, b, c) => { assert.equal(geometry(s), geometry(b)); assert.ok(c.some((x) => /^!/.test(x)), "said, not ignored"); }],
    ["no shell", (s, _b, c) => { assert.equal(shell(s), ""); assert.ok(!s.links.some((l) => /^shell/.test(l.name))); assert.ok(c.some((x) => /- shoe shell/.test(x))); }],
    ["add an arm", (s, _b, c) => { assert.equal(arms(s), 1); assert.ok(s.end_effectors.length >= 1, "a new arm comes with its gripper"); assert.ok(c.some((x) => /0 arms -> 1 arm/.test(x)), c.join(" | ")); }],
    ["change the arm to 4 dof", (s) => { assert.equal(s.joints.filter((j) => j.type === "revolute" && /^arm_/.test(j.name) && !/gripper/.test(j.name)).length, 4); }],
    ["remove one arm", (s, _b, c) => { assert.equal(arms(s), 0); assert.ok(c.some((x) => /1 arm -> 0 arms/.test(x))); }],
    ["6 wheels", (s) => { assert.equal(wheels(s), 6); assert.equal(design(s).family, "mobile_rocker_bogie"); }],
  ]],
  ["three 6 dof robot arms on a table", [
    ["remove one arm", (s, _b, c) => { assert.equal(arms(s), 2); assert.ok(c.some((x) => /3 arms -> 2 arms/.test(x))); }],
    ["make them red", (s, b) => { assert.equal(colour(s, "printed"), RED); assert.equal(geometry(s), geometry(b)); }],
    ["add a camera", (s, b) => { assert.ok(s.sensors.some((x) => x.type === "camera")); assert.ok(!s.links.some((l) => /^camera_\d+_link$/.test(l.name)), "a real camera part, not a generic block"); assert.equal(arms(s), arms(b)); }],
    ["add another arm", (s) => { assert.equal(arms(s), 3); }],
  ]],
  ["a 6 dof robot arm", [
    ["make it look like a teapot", (s) => { assert.match(shell(s), /^teapot/); }],
    ["paint it green", (s, b) => { assert.equal(colour(s, "shell"), "0.15,0.6,0.25"); assert.equal(geometry(s), geometry(b)); }],
    ["remove the gripper", (s) => { assert.equal(s.end_effectors.length, 0); }],
    ["remove the shell", (s) => { assert.equal(shell(s), ""); }],
  ]],
  ["a quadruped", [
    ["make it look like a heart", (s) => { assert.match(shell(s), /^heart/); }],
    ["make it bigger", (s, b, c) => { assert.equal(geometry(s), geometry(b)); assert.ok(c.some((x) => /^!/.test(x)), `said, not ignored: ${c.join(" | ")}`); }],
    ["make it yellow", (s) => { assert.equal(colour(s, "shell"), "0.95,0.8,0.1"); }],
  ]],
];

for (const [prompt, steps] of mine(CHAINS)) {
  test(`changes in a row on ${JSON.stringify(prompt)}`, async () => {
    let r: { robot: RobotSpecification; changes?: string[]; validation: { valid: boolean }; urdfValidation: { valid: boolean } } = await generateRobot(prompt);
    const history = [r.robot];
    for (const [mod, check] of steps) {
      const before = r.robot;
      const m = await modifyRobot(before, mod); r = m;
      assert.ok(m.validation.valid && m.urdfValidation.valid, `${mod}: invalid`);
      assert.ok(m.changes.length > 0 && !m.changes.some((x) => /^\? Not understood/.test(x)), `${mod}: ${m.changes.join(" | ")}`);
      assert.deepEqual(design(r.robot)?.checks.filter((c) => !c.pass).map((c) => c.name) ?? [], [], `${mod}: failing checks`);
      check(m.robot, before, m.changes);
      history.push(r.robot);
    }
    // nothing changes the robots that came before (the website's history and Undo go back to them as they were)
    assert.equal(wheels(history[0]), wheels((await generateRobot(prompt)).robot));
  });
}

test("a colour change adds nothing and changes only materials", async () => {
  const r = await generateRobot("a four wheel robot");
  for (const c of ["make it red", "paint it blue", "change the colour to green"]) {
    const m = await modifyRobot(r.robot, c);
    assert.equal(geometry(m.robot), geometry(r.robot), c);
    assert.equal(m.robot.links.length, r.robot.links.length, c);
    assert.ok(m.bom.lines.some((l) => /filament \(\w+ for the body\)/.test(l.name)), `${c}: the BOM names the filament colour`);
  }
});
