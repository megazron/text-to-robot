// Robots of any shape: a heart, a shoe, a teapot, a dragon, a cartoon head. The shape is a printed shell over a working
// wheeled robot. 100+ shape prompts are read for the shape and style asked for; a set of them is designed in full and the
// shell must be there, clear every part on the deck, fit the print bed piece by piece, and leave every check passing.
// Sharded by TTR_SHARD="i/n", like the rest of tests/fidelity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { understandPrompt, generateRobot } from "@ttr/robot-generator";
import { setDefaultRouter } from "@ttr/design";

setDefaultRouter("legacy");
const [shard, shards] = (process.env.TTR_SHARD ?? "1/1").split("/").map(Number);
const mine = <T,>(xs: T[]) => xs.filter((_, i) => i % shards === shard - 1);

const SHAPE_PROMPTS: [string, string][] = [];
const add = (shape: string, ...ps: string[]) => { for (const p of ps) SHAPE_PROMPTS.push([p, shape]); };
add("heart", "a heart on wheels", "💕 robot", "heart emoji robot", "❤️ robot", "a heart shaped robot", "a robot shaped like a heart", "💖 on wheels", "a heart robot for valentine's day", "a red heart-shaped robot", "a robot that looks like a heart");
add("star", "a star shaped robot", "⭐ robot", "a robot shaped like a star", "a star robot");
add("egg", "an egg shaped robot", "🥚 robot", "a robot that looks like an egg");
add("sphere", "a ball shaped robot", "a spherical robot", "⚽ robot", "a robot that looks like a ball", "an orb robot");
add("cube", "a cube shaped robot", "a cube robot", "a boxy robot", "a blocky robot");
add("capsule", "a pill shaped robot", "a capsule robot", "a cartoon robot", "a cute robot", "a chibi robot", "a kawaii robot", "an adorable robot");
add("shoe", "shoe shaped robot", "sneaker on wheels", "a sneaker robot", "👟 robot", "a robot that looks like a shoe", "a boot shaped robot", "a trainer on wheels");
add("teapot", "a robot that looks like a teapot", "a teapot robot", "🫖 robot", "a teapot shaped robot", "a kettle robot");
add("dragon", "dragon robot", "a dragon shaped robot", "🐉 robot", "a robot that looks like a dragon", "a cute dragon robot", "a dinosaur shaped robot");
add("lamp", "a lamp shaped robot", "a robot that looks like a lamp", "💡 robot");
add("toaster", "a toaster robot", "a toaster shaped robot", "a robot that looks like a toaster");
add("can", "a soda can robot", "a can shaped robot", "🥫 robot");
add("burger", "a burger robot", "🍔 robot", "a hamburger shaped robot", "a robot that looks like a burger");
add("pizza", "a pizza slice robot", "🍕 robot", "a pizza shaped robot");
add("donut", "a donut robot", "🍩 robot", "a doughnut shaped robot", "a robot that looks like a donut");
add("car", "a car shaped robot", "a robot that looks like a car", "🚗 shaped robot");
add("dog", "a dog shaped robot on wheels", "a robot that looks like a dog", "a puppy shaped robot");
add("cat", "a cat shaped robot", "a robot that looks like a cat", "a kitty shaped robot");
add("fish", "a fish shaped robot", "a fish shaped robot on wheels", "a robot shaped like a fish");
add("bird", "a bird shaped robot", "a robot that looks like a penguin", "a penguin shaped robot", "a duck shaped robot");
add("spider", "a spider shaped robot on wheels", "a robot that looks like a spider");
add("blob", "a robot that looks like a marshmallow", "a robot shaped like a banana", "a robot that looks like a cloud", "a jelly robot", "a slime robot", "a robot shaped like a potato");
add("capsule", "a retro robot", "a vintage tin toy robot", "a steampunk robot", "a sleek robot", "a futuristic robot", "a star wars style droid", "a pixar style robot");
const STYLE_OF: Record<string, RegExp> = { "a retro robot": /retro/, "a vintage tin toy robot": /retro/, "a steampunk robot": /steampunk/, "a sleek robot": /sleek/, "a futuristic robot": /sleek/, "a cartoon robot": /cartoon/, "a cute robot": /cute/ };
// style words with no shape pick the shape that suits them
const SHAPE_OF_STYLE: Record<string, string> = { "a retro robot": "cube", "a vintage tin toy robot": "cube", "a steampunk robot": "cube", "a sleek robot": "egg", "a futuristic robot": "egg", "a boxy robot": "cube", "a blocky robot": "cube" };

test(`${SHAPE_PROMPTS.length} shape prompts are read as the shape and style asked for (shard ${shard}/${shards})`, () => {
  assert.ok(SHAPE_PROMPTS.length >= 100, `${SHAPE_PROMPTS.length} shape prompts`);
  const problems: string[] = [];
  for (const [p, shape] of mine(SHAPE_PROMPTS)) {
    const u = understandPrompt(p), want = SHAPE_OF_STYLE[p] ?? shape;
    if (!["diff_drive", "four_wheel"].includes(u.family) || !u.label.startsWith(`${want}-shaped`)) problems.push(`${JSON.stringify(p)}: ${u.family} "${u.label}", wanted a ${want} shell`);
    if (STYLE_OF[p] && !STYLE_OF[p].test(u.label)) problems.push(`${JSON.stringify(p)}: style not read ("${u.label}")`);
    if (/star wars|pixar/.test(p) && !/inspired by/.test(u.approx ?? "")) problems.push(`${JSON.stringify(p)}: no "inspired by" note`);
  }
  assert.deepEqual(problems, []);
});

test("a shape word that is not the look stays what it was: cooking eggs, a robot dog, a star rating", () => {
  assert.equal(understandPrompt("a robot that cooks eggs").family, "serial_arm");
  assert.equal(understandPrompt("a robot dog").family, "quadruped");
  assert.equal(understandPrompt("🐕 robot").family, "quadruped");
  assert.equal(understandPrompt("a robot car").family, "diff_drive");
  assert.doesNotMatch(understandPrompt("a robot car").label, /shaped/);
  assert.equal(understandPrompt("EVA from wall-e").family, "eva");
});

const DESIGNED: [string, string][] = [["heart emoji robot", "heart"], ["shoe shaped robot", "shoe"], ["cartoon robot", "capsule"], ["a robot that looks like a teapot", "teapot"], ["dragon robot", "dragon"],
  ["sneaker on wheels", "shoe"], ["a star shaped robot", "star"], ["a donut robot", "donut"]];
for (const [p, shape] of mine(DESIGNED)) {
  test(`designed with a ${shape} shell: ${JSON.stringify(p)}`, async () => {
    const r = await generateRobot(p);
    const d = (r.robot.metadata as unknown as { design: { checks: { name: string; pass: boolean; detail: string }[]; printed: { name: string; check: { fits_bed: boolean; watertight: boolean } }[]; performance: Record<string, unknown> } }).design;
    const pieces = d.printed.filter((x) => /^shell/.test(x.name));
    assert.ok(pieces.length >= 1, `${p}: no shell`);
    assert.match(String(d.performance.shell), new RegExp(`^${shape}`));
    for (const x of pieces) assert.ok(x.check.fits_bed && x.check.watertight, `${p}: ${x.name} does not print (${JSON.stringify(x.check)})`);
    assert.ok(r.robot.links.some((l) => /^shell/.test(l.name) && l.material === "shell"), `${p}: shell links not in the robot`);
    assert.ok(r.robot.materials.some((m) => m.name === "shell"), `${p}: no shell colour`);
    const failing = d.checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail.slice(0, 200)}`);
    assert.deepEqual(failing, [], `${p}: failing checks`);
    assert.ok(r.validation.valid && r.urdfValidation.valid, `${p}: invalid`);
    assert.ok(r.urdf.includes("shell"), `${p}: the shell is not in the URDF`);
  });
}
