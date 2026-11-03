import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { interference } from "@ttr/design";

// Every shipped parts-designed example: no two parts intersect, checked on the exact meshes in the home pose
// (MuJoCo's convex-hull collision is too coarse for brackets that wrap servos and shells over casters).
for (const ex of readdirSync("examples").filter((d) => /^\d\d_/.test(d)).sort()) {
  const spec = JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8"));
  if (!spec.metadata?.design) continue;
  test(`example ${ex}: no two parts intersect (exact meshes)`, () => {
    const r = interference(spec);
    assert.equal(r.skipped.length, 0, r.skipped.join(", "));
    assert.deepEqual(r.overlaps, []);
  });
}
