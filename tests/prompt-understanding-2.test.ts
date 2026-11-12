// The local parser must apply, approximate or explicitly report every request (part 2 of 3: the
// design engine's CSG library keeps a little WASM memory per robot, so the suite is split across processes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, interpretPrompt, applyModification, finalizeSpec, parsePrompt, splitClauses } from "@ttr/robot-generator";
import { setDefaultRouter } from "@ttr/design";

// These tests check how prompts are read, not the harness the 3D router lays (tests/wiring3d and the example tests check
// that), so their designs lay wires as straight runs, as the website's first pass does.
setDefaultRouter("legacy");

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const arm = () => finalizeSpec(parsePrompt("6 dof arm"));
const seg = (spec: ReturnType<typeof arm>, name: string): number => (spec.metadata as any).design.performance[`${name}_m`];


test("wearable suits fit a stated stature and say what is unaudited", () => {
  const i = read("Iron Man suit for a 6 ft 2 wearer");
  assert.equal(i.family, "iron_man_mark_43");
  assert.ok(Math.abs(i.wearer_height_m! - 1.88) < 0.01);
  // the Mark 43 is scaled as a whole: it says so, and that its limits were measured at the 1.75 m design
  assert.match(i.approximations.join(), /scaled as a whole .* measured at 1\.75 m/);
  assert.match(read("exoskeleton for a 2.4 m person").ignored.join(), /outside the supported/);
});


test("every generate result carries a readable summary and surfaced warnings", async () => {
  const r = await generateRobot("a tracked robot with a lidar, budget $800");
  assert.match(r.summary!, /four-wheel skid-steer base · lidar \(base_link\) · budget \$800/);
  assert.ok(r.warnings.some((w) => w.startsWith("approximated: tracks")));
});

// ---------------- modifications ----------------


test("clauses split on 'and' and inherit the verb", () => {
  assert.deepEqual(splitClauses("add a lidar and a camera"), ["add a lidar", "add a camera"]);
  assert.deepEqual(splitClauses("make the upper arm 50% longer and the forearm 10% shorter, then paint it red"),
    ["make the upper arm 50% longer", "make the forearm 10% shorter", "paint it red"]);
});


test("modify: each clause targets its own link", () => {
  const a = arm(), { spec } = applyModification(a, "make the upper arm 50% longer and the forearm 10% shorter");
  assert.ok(Math.abs(seg(spec, "upper_arm") - seg(a, "upper_arm") * 1.5) < 0.002);
  // a requested length the (possibly bigger) actuators cannot reach is built as close as they allow and reported
  const reported = (spec.metadata as any).design.assumptions.some((x: string) => /requested forearm .* the shortest these actuators allow/.test(x));
  assert.ok(Math.abs(seg(spec, "forearm") - seg(a, "forearm") * 0.9) < 0.002 || reported, `${seg(spec, "forearm")}`);
});
