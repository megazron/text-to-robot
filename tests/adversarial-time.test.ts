// A prompt can never freeze the page: 10,000 characters built to make a regular expression backtrack (long runs of spaces,
// digits, "a ", "<", "{{", underscores, mixed punctuation, repeated keywords) are read in under 50 ms each, once warm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { understandPrompt } from "@ttr/robot-generator";
import { throughRun } from "../packages/design/src/wiring.ts";

const N = 10000;
const INPUTS: [string, string][] = [["spaces", " ".repeat(N)], ["digits", "1".repeat(N)], ["a x5000", "a ".repeat(5000)], ["punctuation", ".,;:!?-_/\\()[]{}<>\"'".repeat(Math.ceil(N / 22)).slice(0, N)],
  ["<", "<".repeat(N)], ["<a ", "<a ".repeat(3333)], ["underscores", "_".repeat(N)], ["arm", "arm ".repeat(2500)], ["2 x", "2 x ".repeat(2500)], ["6 wheel", "6 wheel ".repeat(1250)],
  ["the robot that", "the robot that ".repeat(600)], ["ignore", "ignore ".repeat(1400)], ["mixed", Array.from({ length: N }, (_, i) => " a1.<_-x"[i % 8]).join("")], ["record", "record ".repeat(1400)],
  ["secretly", "secretly ".repeat(1100)], ["kill the", "kill the ".repeat(1100)], ["${", "${".repeat(5000)], ["{{", "{{".repeat(5000)], ["on=", "onx = '".repeat(1400)], ["6 dof", "6 dof ".repeat(1600)],
  ["heart shaped", "heart shaped ".repeat(760)], ["emoji", "🦄".repeat(5000)], ["shoulder_", `shoulder${"_shoulder".repeat(1100)}`], ["pair of", `a pair${" ".repeat(N)}of`]];

test("10,000-character adversarial prompts are read in under 50 ms each", () => {
  for (const [, s] of INPUTS) { try { understandPrompt(s); } catch { /* refused or not understood: still read */ } }   // warm up
  const slow: string[] = [];
  for (const [name, s] of INPUTS) {
    const t0 = performance.now();
    try { understandPrompt(s); } catch { /* as above */ }
    const ms = performance.now() - t0;
    if (ms >= 50) slow.push(`${name}: ${ms.toFixed(0)} ms`);
  }
  assert.deepEqual(slow, []);
});

test("the readers below the prompt's first cut are linear too: numbers, names, part lists, markup, model output", async () => {
  const { parseBudget, extractMasses, isNegated } = await import("../packages/robot-generator/src/text.ts");
  const { quantity } = await import("../packages/robot-generator/src/inventory.ts");
  const { triage } = await import("@ttr/robot-generator");
  const { safeName } = await import("@ttr/robot-schema");
  const { extractJson } = await import("../packages/llm-providers/src/json.ts");
  const sp = " ".repeat(N), digits = "9".repeat(N);
  const runs: [string, () => unknown][] = [["budget digits", () => parseBudget(digits)], ["budget commas", () => parseBudget(`9${",".repeat(N)}`)], ["mass digits", () => extractMasses(digits)],
    ["negation spaces", () => isNegated(`arm${sp}x`, 0, 3)], ["qty spaces", () => quantity(`qty${sp}`)], ["markup <", () => { try { triage(`<${sp}`); } catch { /* refused */ } }],
    ["name underscores", () => safeName(`a${"_".repeat(N)}a`)], ["fence", () => { try { extractJson("```json ".repeat(N / 8)); } catch { /* no JSON */ } }]];
  for (const [, f] of runs) f();
  const slow = runs.map(([name, f]) => { const t0 = performance.now(); f(); return [name, performance.now() - t0] as const; }).filter(([, ms]) => ms >= 50).map(([n, ms]) => `${n}: ${ms.toFixed(0)} ms`);
  assert.deepEqual(slow, []);
  assert.equal(parseBudget("a robot arm under 300 dollars").usd, 300);
  assert.equal(parseBudget("budget 2k").usd, 2000);
  assert.equal(safeName("__My Robot__"), "my_robot");
  assert.deepEqual(extractJson('here:\n```json\n{"a": 1}\n```'), { a: 1 });
});

test("a long route note is read in one pass", () => {
  const t0 = performance.now();
  assert.equal(throughRun(": wire ".repeat(N)), null);
  assert.equal(throughRun(`a${" ".repeat(N)}`), null);
  assert.deepEqual(throughRun("a~b: wire 2 passes 14 mm through a solid (from 1.5,-2,3, deck)"), ["a~b: wire 2 passes 14 mm through a solid (from 1.5,-2,3, deck)", "a~b", "2", "14", "1.5,-2,3", "deck"]);
  assert.ok(performance.now() - t0 < 50);
});

test("a robot file naming a part __proto__ is refused before the engine reads it", async () => {
  const { badName } = await import("@ttr/robot-schema");
  assert.equal(badName({ links: [{ name: "base_link" }, { name: "__proto__" }], joints: [] }), "__proto__");
  assert.equal(badName({ links: [{ name: "base_link" }], joints: [{ name: "j", parent: "base_link", child: "constructor" }] }), "constructor");
  assert.equal(badName({ links: [{ name: "base_link" }, { name: "arm" }], joints: [{ name: "j", parent: "base_link", child: "arm" }], materials: [{ name: "printed" }] }), undefined);
});
