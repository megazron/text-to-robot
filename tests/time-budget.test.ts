// A prompt is designed within a time budget, so nothing hangs: past it, the 3D harness lays the cables it has not reached
// as straight runs and says so, and the robot is still whole and valid. A normal prompt never meets the budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot } from "@ttr/robot-generator";
import { setDefaultRouter } from "@ttr/design";

test("past the time budget the 3D harness gives its best so far: a whole robot, the rest of its cables as straight runs, said", async () => {
  setDefaultRouter("3d");
  try {
    const r = await generateRobot("a differential drive robot with a camera", { timeBudgetMs: 1 });
    const w = (r.robot.metadata as unknown as { design: { wiring: { notes: string[]; cables: unknown[] }; checks: { name: string; pass: boolean }[] } }).design;
    assert.ok(r.validation.valid && r.urdfValidation.valid);
    assert.ok(w.wiring.cables.length > 0);
    assert.ok(w.wiring.notes.some((n) => /time budget: all \d+ cables are laid as straight runs/.test(n)), w.wiring.notes.join("\n"));
    assert.ok(r.warnings.some((x) => /^approximated: time budget: /.test(x)));
    assert.deepEqual(w.checks.filter((c) => !c.pass).map((c) => c.name), []);
    // not kept: the same prompt with time designs its harness in full
    const again = await generateRobot("a differential drive robot with a camera");
    assert.ok(!again.warnings.some((x) => /time budget/.test(x)));
    assert.ok(!(again.robot.metadata as unknown as { design: { wiring: { notes: string[] } } }).design.wiring.notes.some((n) => /time budget/.test(n)));
  } finally { setDefaultRouter("3d"); }
});
