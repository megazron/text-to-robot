// Anything a visitor can type gets a robot, an honest explanation or a clear refusal, quickly, and never a crash:
// a large corpus of open-ended, odd, multilingual, adversarial and generated prompts through the parser's reading
// (understandPrompt: the robot type, the path that chose it and the tools, without designing it). Designing each
// prompt's robot from real parts is checked in prompt-suite.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { understandPrompt, interpretPrompt, PromptRefusal } from "@ttr/robot-generator";
import { corpus } from "./open-prompts-corpus.ts";

/** Families the parser can hand to a designer (rules or knowledge table). */
const FAMILIES = new Set(["serial_arm", "rover_arm", "scara", "gripper", "diff_drive", "four_wheel", "mecanum", "quadruped", "hexapod", "humanoid", "battle_mech",
  "arduino_car", "arduino_arm", "wall_e", "eva", "baymax", "iron_man_mark_43", "exosuit", "drone", "rov", "gantry", "delta", "snake", "hand", "quadruped_arm"]);
const LIMIT_MS = 1500;
/** Robot types still answered with "not supported yet" while their family is being built: removed one by one as each lands. */
const PENDING: RegExp[] = [];


const kindOf = (e: unknown) => (e instanceof PromptRefusal ? e.kind : "crash");

test(`the open-ended corpus (${corpus.length} prompts): every prompt is read, refused or explained, fast, and never crashes`, () => {
  const tally: Record<string, number> = {}, problems: string[] = [];
  for (const [p, want] of corpus) {
    const t0 = performance.now();
    let got: string, detail: string;
    try {
      const u = understandPrompt(p);
      got = FAMILIES.has(u.family) ? "robot" : "unknown-family"; detail = `${u.family} via ${u.path}`;
      assert.ok(u.path, "the path is said");
    } catch (e) {
      got = kindOf(e); detail = (e as Error).message;
      if (got !== "crash") assert.ok(detail.length > 30 && !/undefined|NaN|\[object/.test(detail), `${JSON.stringify(p)}: explanation too thin: ${detail}`);
    }
    const ms = performance.now() - t0;
    tally[got] = (tally[got] ?? 0) + 1;
    if (ms > LIMIT_MS) problems.push(`${JSON.stringify(p.slice(0, 60))}: ${ms.toFixed(0)} ms`);
    if (got === "crash" || got === "unknown-family") problems.push(`${JSON.stringify(p.slice(0, 60))}: ${got}: ${detail}`);
    const pending = got === "not_supported" && PENDING.some((rx) => rx.test(detail));
    const ok = want === "either" || (want === "robot" ? got === "robot" || pending : want === "refused" ? ["empty", "not_understood", "not_supported", "impossible"].includes(got) : want === got);
    if (!ok) problems.push(`${JSON.stringify(p.slice(0, 60))}: expected ${want}, got ${got} (${detail.slice(0, 120)})`);
  }
  console.log(`open-prompt corpus: ${corpus.length} prompts -> ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  assert.deepEqual(problems, []);
});

test("markup and scripts never reach the result: names, notes and summaries carry no tags", () => {
  for (const p of ["<script>alert(1)</script> a 6 dof arm", "a hexapod <img src=x onerror=alert(1)> named <b>Bob</b>", "a quadruped called \"<svg onload=alert(1)>\""]) {
    const { spec, interpretation } = interpretPrompt(p);
    const text = JSON.stringify({ name: spec.robot_name, i: interpretation, src: spec.metadata.source_prompt });
    assert.doesNotMatch(text, /<\s*(?:script|img|svg|b)\b|onerror=|onload=/i, p);
    assert.match(interpretation.approximations.join(), /markup/, p);
  }
});

test("conflicting specs are resolved and said; impossible sizes are built at a real size and said", () => {
  const tiny = interpretPrompt("a tiny robot arm that lifts 100 kg").interpretation;
  assert.match(tiny.conflicts.join(), /"tiny" and a 100 kg payload cannot both hold/);
  const giant = interpretPrompt("a humanoid robot the size of a building").interpretation;
  assert.equal(giant.family, "humanoid");
  assert.match(giant.conflicts.join(), /cannot hold itself up/);
});

test("every result says which path designed it", () => {
  assert.equal(understandPrompt("a 6 dof arm").path, "rules");
  assert.equal(understandPrompt("a robot that waters my plants").path, "knowledge table");
  assert.match(understandPrompt("something to hydrate my succulents").path, /^similarity/);
  assert.match(understandPrompt("R2-D2").notes.join(), /read as its body plan/);
});
