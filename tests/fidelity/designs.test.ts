// Prompt fidelity, designed in full: each prompt in DESIGNED (tests/fidelity/corpus.ts) is designed from real parts and
// the robot is counted joint by joint. The arms, joints per arm, wheels and legs asked for are built, or a note says what
// was built instead; several arms are each in the URDF, the parts list, the harness, the MoveIt groups and the print list;
// the torque, tipping and supply checks pass; and a robot asked for with counts the gallery does not have is not a
// gallery robot. Sharded by TTR_SHARD="i/n". Wires are laid as straight runs, as on the website's first pass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { generateRobot, builtShape, PromptRefusal } from "@ttr/robot-generator";
import { setDefaultRouter } from "@ttr/design";
import { planningGroups } from "@ttr/ros2-export";
import { DESIGNED } from "./corpus.ts";

setDefaultRouter("legacy");
const [shard, shards] = (process.env.TTR_SHARD ?? "1/1").split("/").map(Number);
const cases = DESIGNED.filter((_, i) => i % shards === shard - 1);
const root = new URL("../../examples/", import.meta.url);
/** a robot's moving joints, as the gallery robot it might be */
const signature = (r: { joints: { name: string; type: string }[] }) => r.joints.filter((j) => j.type !== "fixed").map((j) => j.name).sort().join(",");
const gallery = new Map(readdirSync(root).filter((d) => /^\d\d_/.test(d)).map((d) => { try { return [signature(JSON.parse(readFileSync(new URL(`${d}/robot.json`, root), "utf8"))), d] as const; } catch { return ["", d] as const; } }));
const times: number[] = [];

for (const [prompt, want] of cases) {
  test(`fidelity: ${JSON.stringify(prompt)}`, async () => {
    const t0 = performance.now();
    let r: Awaited<ReturnType<typeof generateRobot>>;
    try { r = await generateRobot(prompt); }
    catch (e) { assert.fail(`${prompt}: ${e instanceof PromptRefusal ? `refused (${e.kind})` : "crashed"}: ${(e as Error).message}`); }
    times.push(performance.now() - t0);
    const i = r.interpretation!, notes = [...i.approximations, ...i.ignored, ...i.conflicts].join(" | ");
    const b = builtShape(r.robot);
    if (want.family) assert.ok(typeof want.family === "string" ? i.family === want.family : want.family.test(i.family), `${prompt}: family ${i.family}, wanted ${want.family}`);
    if (want.arms !== undefined) assert.equal(b.arms.length, want.arms, `${prompt}: ${b.arms.length} arms built (${b.arms.map((a) => `${a.prefix}:${a.dof}`).join(", ")})`);
    if (want.dof !== undefined) for (const a of b.arms) assert.equal(a.dof, want.dof, `${prompt}: arm ${a.prefix} has ${a.dof} joints`);
    if (want.wheels !== undefined) assert.ok(b.wheels === want.wheels || b.driven === want.wheels, `${prompt}: ${b.driven} wheels and ${b.wheels - b.driven} casters built, wanted ${want.wheels}`);
    if (want.legs !== undefined) assert.equal(b.legs, want.legs, `${prompt}: ${b.legs} legs`);
    if (want.note) assert.match(notes, want.note, `${prompt}: notes ${notes}`);
    // every count asked for is built or said
    const asked = i.understood!.asked;
    if (asked.arms && asked.arms.count !== b.arms.length) assert.match(notes, /arms?/, `${prompt}: ${asked.arms.count} arms asked, ${b.arms.length} built, nothing said`);
    // a valid robot, valid URDF
    assert.ok(r.validation.valid, `${prompt}: spec invalid: ${JSON.stringify(r.validation).slice(0, 300)}`);
    assert.ok(r.urdfValidation.valid, `${prompt}: URDF invalid`);
    // several arms: every arm is in the URDF, the parts list, the harness, the MoveIt groups, the print list; the checks pass
    if (b.arms.length >= 2 && /^(?:arm_workcell|rover_arm)$/.test(i.family)) {
      const d = (r.robot.metadata as { design?: { checks: { name: string; pass: boolean; detail: string }[]; printed: { name: string }[]; wiring?: unknown } }).design!;
      for (const a of b.arms) {
        assert.ok(r.urdf.includes(`name="${a.prefix}_shoulder_pitch"`) || r.urdf.includes(`name="${a.prefix}_base_yaw"`), `${prompt}: ${a.prefix} not in the URDF`);
        assert.ok(d.printed.some((p) => p.name.startsWith(`${a.prefix}_`)), `${prompt}: ${a.prefix} has no printed parts`);
        assert.ok(JSON.stringify(d.wiring ?? {}).includes(`${a.prefix}_`), `${prompt}: ${a.prefix} is not wired`);
      }
      const actuators = r.bom.lines.filter((x) => x.category === "Actuator").reduce((s, x) => s + x.qty, 0);
      assert.ok(actuators >= b.arms.reduce((s, a) => s + a.dof, 0), `${prompt}: ${actuators} actuators in the parts list for ${b.arms.map((a) => a.dof).join("+")} arm joints`);
      const groups = planningGroups(r.robot).map((g) => g.name);
      for (const a of b.arms) assert.ok(groups.includes(a.prefix), `${prompt}: no MoveIt group for ${a.prefix} (${groups.join(", ")})`);
      const failing = d.checks.filter((c) => !c.pass && /torque|stab|tip|power:supply|wiring:rail|speed|clearance|limit/.test(c.name));
      assert.deepEqual(failing.map((c) => `${c.name}: ${c.detail}`), [], `${prompt}: failing checks`);
      assert.ok(!gallery.has(signature(r.robot)), `${prompt}: built the gallery robot ${gallery.get(signature(r.robot))}`);
    }
    if (want.wheels === 3) assert.ok(!gallery.has(signature(r.robot)), `${prompt}: built the gallery robot ${gallery.get(signature(r.robot))}`);
  });
}

test.after(() => {
  const s = [...times].sort((a, b) => a - b), q = (p: number) => ((s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0) / 1000).toFixed(1);
  console.log(`fidelity designs (shard ${shard}/${shards}): ${s.length} robots, p50 ${q(0.5)} s, p95 ${q(0.95)} s`);
});
