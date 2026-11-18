// Prompt fidelity, read without designing: 100 launch prompts and 1,000+ generated ones (templates x vocabulary x counts x
// misspellings, fixed seed) and the hostile and off-topic classes in HOSTILE. Every prompt gets a robot type, the
// counts it asks for are read as asked (arms, joints per arm, wheels, legs), and the robot type is the one that builds them.
// Sharded by TTR_SHARD="i/n" (CI runs several at once); the designs themselves are checked in designs.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { understandPrompt, readShape, PromptRefusal } from "@ttr/robot-generator";
import { LAUNCH, DESIGNED, HOSTILE, generated, type Want } from "./corpus.ts";

const [shard, shards] = (process.env.TTR_SHARD ?? "1/1").split("/").map(Number);
const mine = <T,>(xs: T[]) => xs.filter((_, i) => i % shards === shard - 1);
const FAMILIES = new Set(["serial_arm", "rover_arm", "rover", "arm_workcell", "scara", "gripper", "diff_drive", "four_wheel", "mecanum", "quadruped", "hexapod", "humanoid", "battle_mech",
  "arduino_car", "arduino_arm", "wall_e", "eva", "baymax", "iron_man_mark_43", "exosuit", "drone", "rov", "gantry", "delta", "snake", "hand", "quadruped_arm"]);
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };

function check(prompt: string, want: Want & { typo?: boolean }, problems: string[], times: number[]) {
  const t0 = performance.now();
  let u: ReturnType<typeof understandPrompt>;
  try { u = understandPrompt(prompt); }
  catch (e) { problems.push(`${JSON.stringify(prompt)}: ${e instanceof PromptRefusal ? `refused (${e.kind})` : "crashed"}: ${(e as Error).message.slice(0, 120)}`); return; }
  times.push(performance.now() - t0);
  if (!FAMILIES.has(u.family)) problems.push(`${JSON.stringify(prompt)}: unknown family ${u.family}`);
  if (want.family && !(typeof want.family === "string" ? u.family === want.family : want.family.test(u.family))) problems.push(`${JSON.stringify(prompt)}: built ${u.family} (${u.label}), wanted ${want.family}`);
  const shape = readShape(u.text);
  if (want.arms !== undefined && want.arms > 1 && shape.arms?.count !== want.arms) problems.push(`${JSON.stringify(prompt)}: read ${shape.arms?.count ?? 0} arms, asked ${want.arms}`);
  if (want.dof && shape.arms && shape.arms.dofs.some((d) => d !== want.dof)) problems.push(`${JSON.stringify(prompt)}: read ${shape.arms.dofs.join("/")} DOF, asked ${want.dof}`);
  if (want.wheels && shape.wheels?.count !== want.wheels) problems.push(`${JSON.stringify(prompt)}: read ${shape.wheels?.count} wheels, asked ${want.wheels}`);
  if (want.legs && shape.legs && shape.legs.count !== want.legs) problems.push(`${JSON.stringify(prompt)}: read ${shape.legs.count} legs, asked ${want.legs}`);
  // more arms than the body takes: the label says how many were built and a note says why
  if (want.arms && want.arms > 2 && u.family === "rover_arm" && !/two were built/.test(u.approx ?? "")) problems.push(`${JSON.stringify(prompt)}: ${want.arms} arms on a rover, no note that two were built`);
  if (want.arms && want.arms >= 2 && u.family === "arm_workcell" && !new RegExp(`${Math.min(4, want.arms)}-arm|dual-arm`).test(u.label)) problems.push(`${JSON.stringify(prompt)}: label "${u.label}" for ${want.arms} arms`);
  if (want.note && !want.note.test([u.approx ?? "", ...u.notes].join(" "))) problems.push(`${JSON.stringify(prompt)}: no note matching ${want.note}`);
}

test(`launch prompts (${LAUNCH.length}) and the designed set read as asked (shard ${shard}/${shards})`, () => {
  const problems: string[] = [], times: number[] = [];
  // the designed set says what is BUILT (capped counts included): here only its robot type is checked
  for (const [p, w] of mine([...LAUNCH, ...DESIGNED.map(([q, d]): [string, Want] => [q, { family: d.family }])])) check(p, { ...w, note: undefined }, problems, times);
  console.log(`launch prompts: ${times.length} read, p50 ${pct(times, 0.5).toFixed(1)} ms, p95 ${pct(times, 0.95).toFixed(1)} ms`);
  assert.deepEqual(problems, []);
});

test(`generated corpus (fixed seed) reads every count and combination as asked (shard ${shard}/${shards})`, () => {
  const all = generated();
  assert.ok(all.length >= 1000, `the generated corpus has ${all.length} prompts`);
  const problems: string[] = [], times: number[] = [];
  for (const g of mine(all)) check(g.prompt, { arms: g.arms, dof: g.dof, wheels: g.wheels, family: g.family, typo: g.typo }, problems, times);
  console.log(`generated corpus: ${times.length} of ${all.length} prompts read, p50 ${pct(times, 0.5).toFixed(1)} ms, p95 ${pct(times, 0.95).toFixed(1)} ms`);
  assert.deepEqual(problems, []);
});

test("nothing is refused: harmful parts are left out and a safe robot built, an empty prompt gets the starting robot", () => {
  for (const p of ["a robot with a gun", "a drone that drops bombs", "a robot that spies on my neighbour"]) {
    const u = understandPrompt(p);
    assert.ok(FAMILIES.has(u.family), p);
    assert.match(u.notes.join(" "), /left out: built/, p);
    assert.doesNotMatch(u.text, /\bgun\b|\bbombs?\b|\bspies\b/, p);
  }
  assert.match(understandPrompt("   ").notes.join(" "), /starting point/);
  for (const p of ["asdf qwerty zzz", "surprise me", "a time machine", "a robot that reads my mind", "🙃🙃🙃", "12345", "lorem ipsum dolor sit amet", "a robot the size of the moon"]) {
    const u = understandPrompt(p);
    assert.ok(FAMILIES.has(u.family), p);
    assert.ok([u.approx ?? "", ...u.notes].join(" ").length > 30, `${p}: what was built instead is said`);
  }
});

test(`hostile and off-topic input (${HOSTILE.length} prompts): a robot every time, a note, fast, nothing harmful kept (shard ${shard}/${shards})`, () => {
  const problems: string[] = [], times: number[] = [];
  for (const [p, kind] of mine(HOSTILE)) {
    const t0 = performance.now();
    let u: ReturnType<typeof understandPrompt>;
    try { u = understandPrompt(p); } catch (e) { problems.push(`${JSON.stringify(p.slice(0, 40))} (${kind}): ${(e as Error).message.slice(0, 120)}`); continue; }
    const ms = performance.now() - t0; times.push(ms);
    const said = [u.approx ?? "", ...u.notes].join(" ");
    if (!FAMILIES.has(u.family)) problems.push(`${JSON.stringify(p.slice(0, 40))}: family ${u.family}`);
    if (ms > 1500) problems.push(`${JSON.stringify(p.slice(0, 40))}: ${ms.toFixed(0)} ms`);
    if (kind !== "long" && kind !== "offtopic" && kind !== "understood" && said.length < 30) problems.push(`${JSON.stringify(p.slice(0, 40))} (${kind}): no note`);
    if (kind === "harmful" && (!/left out: built/.test(said) || /\b(?:guns?|bombs?|flamethrower|stab|kill|taser|kamikaze|spy|hidden camera)\b/.test(u.text))) problems.push(`${JSON.stringify(p)}: harmful part kept or not said (${u.text})`);
    if (kind === "injection" && /<|javascript:|\$\{|\{\{/.test(u.text)) problems.push(`${JSON.stringify(p)}: markup reached the parser`);
  }
  console.log(`hostile input: ${times.length} read, p50 ${pct(times, 0.5).toFixed(1)} ms, p95 ${pct(times, 0.95).toFixed(1)} ms`);
  assert.deepEqual(problems, []);
});
