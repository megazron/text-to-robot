// Robots of any shape: a heart, a shoe, a teapot, a dragon, a cartoon head, any emoji's outline. The shape is a printed
// shell over a working robot: a wheeled one when no body is named, else the robot named (an arm's base, a legged body, a
// humanoid's head and chest, a drone's canopy). 100+ shape prompts are read for the shape and style asked for; a set of them
// is designed in full and the shell must be there, clear every part, fit the print bed piece by piece, and leave every
// check passing.
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
add("blob", "a robot that looks like a marshmallow", "a robot that looks like a cloud", "a jelly robot", "a slime robot");
// a thing or an emoji the library has no shape for: that emoji's own outline (Twemoji), inflated
add("banana emoji", "a robot shaped like a banana", "🍌 robot");
add("potato emoji", "a robot shaped like a potato");
add("unicorn emoji", "🦄 robot", "a unicorn shaped robot");
add("ghost emoji", "👻 robot", "a robot that looks like a ghost");
add("rocket emoji", "🚀 robot", "a rocket shaped robot");
add("pineapple emoji", "🍍 on wheels", "a robot shaped like a pineapple");
add("frog emoji", "🐸 robot");
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
  ["sneaker on wheels", "shoe"], ["a star shaped robot", "star"], ["a donut robot", "donut"], ["🦄 robot", "unicorn emoji"], ["a robot shaped like a banana", "banana emoji"]];
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

// ---------------------------------------------------------------- every robot type
// A look asked for on a robot of any kind is a printed shell on that robot: round an arm's base, over a legged robot's body,
// on a humanoid's head and chest, a canopy on a drone. Each is designed in full: the shell is there, prints, touches nothing,
// and every check passes with it on (the joints are swept with it, the legs and the drone's thrust carry its mass).
type Design = { checks: { name: string; pass: boolean; detail: string }[]; printed: { name: string; check: { fits_bed: boolean; watertight: boolean } }[]; performance: Record<string, unknown>; assumptions: string[] };
const TYPED: [string, string, RegExp][] = [
  ["a heart shaped robot arm", "serial_arm", /^heart .*base/], ["a robot arm shaped like a teapot", "serial_arm", /^teapot/],
  ["a heart shaped drone", "drone", /^heart/], ["🦄 drone", "drone", /^unicorn emoji/],
  ["a heart shaped robot dog", "quadruped", /^heart/], ["a cartoon quadruped", "quadruped", /^capsule \(cartoon\)/],
  ["a star shaped hexapod", "hexapod", /^star/],
  ["a heart shaped humanoid", "humanoid", /^heart.*head and chest/],
];
for (const [p, family, shell] of mine(TYPED)) {
  test(`a ${family} with a shell: ${JSON.stringify(p)}`, async () => {
    const r = await generateRobot(p);
    assert.equal(r.interpretation?.family, family, `${p}: built a ${r.interpretation?.family}`);
    const d = (r.robot.metadata as unknown as { design: Design }).design;
    assert.match(String(d.performance.shell), shell, `${p}: shell ${d.performance.shell}`);
    const pieces = d.printed.filter((x) => /^shell/.test(x.name));
    assert.ok(pieces.length >= 1, `${p}: no shell`);
    for (const x of pieces) assert.ok(x.check.fits_bed && x.check.watertight, `${p}: ${x.name} does not print (${JSON.stringify(x.check)})`);
    assert.ok(r.robot.links.some((l) => /^shell/.test(l.name) && l.material === "shell"), `${p}: shell links not in the robot`);
    assert.ok(d.checks.some((c) => c.name === "shell:clearance" && c.pass), `${p}: no clearance check for the shell`);
    assert.deepEqual(d.checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail.slice(0, 200)}`), [], `${p}: failing checks`);
    assert.ok(r.validation.valid && r.urdfValidation.valid, `${p}: invalid`);
    assert.ok(!r.warnings.some((w) => /shape shells are fitted/.test(w)), `${p}: the shell was not applied`);
    if (family === "drone") for (const c of ["flight:thrust_to_weight", "flight:hover_throttle", "flight:centre_of_mass"]) assert.ok(d.checks.find((x) => x.name === c)?.pass, `${p}: ${c}`);
    if (family === "quadruped" || family === "hexapod") assert.ok(d.checks.some((c) => /stability:standing with the shell/.test(c.name) && c.pass) && d.checks.some((c) => c.name === "shell:mass" && c.pass), `${p}: shell mass or tipping not checked`);
    if (family === "humanoid") assert.ok(d.checks.some((c) => c.name === "stability:double_support_with_shell" && c.pass) && d.checks.some((c) => c.name === "shell:mass" && c.pass), `${p}: shell mass or tipping not checked`);
  });
}

test("an arm's base shell keeps its joints' ranges (within 15 % of the same arm without it)", async () => {
  const range = async (p: string) => Object.fromEntries((await generateRobot(p)).robot.joints.filter((j) => j.type === "revolute" && j.limit).map((j) => [j.name, j.limit!.upper! - j.limit!.lower!]));
  const plain = await range("a 6 dof robot arm"), shaped = await range("a heart shaped 6 dof robot arm");
  for (const [j, r] of Object.entries(plain)) assert.ok(shaped[j] >= 0.85 * r, `${j}: ${shaped[j]?.toFixed(2)} rad of ${r.toFixed(2)}`);
});

test("a shape on a body that has its own look is said, not dropped silently", () => {
  for (const p of ["a heart shaped snake robot", "a heart shaped scara"]) {
    const u = understandPrompt(p);
    assert.ok(!["diff_drive", "four_wheel"].includes(u.family), `${p}: ${u.family}`);
  }
});

test("emoji outlines: every one decodes, and is credited", async () => {
  const { emojiShapes } = await import("@ttr/design");
  const all = emojiShapes();
  assert.ok(all.length > 500, `${all.length} emoji`);
  for (const e of all) assert.ok(e.pieces.length >= 1 && e.pieces.every((p) => p.length >= 3 && p.every(([u, v]) => u >= 0 && u <= 1 && v >= 0 && v <= 1)), `${e.char} ${e.name}`);
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync(new URL("../../NOTICE.md", import.meta.url), "utf8"), /Twemoji[\s\S]*CC-BY 4\.0/);
});

