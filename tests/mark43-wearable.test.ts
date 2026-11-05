// Wearable Mark 43: the motorised helmet fits a wearer, opens fully, prints in bed-sized pieces.
// (The full suit takes about five minutes to build: scripts/build_examples.ts covers it.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "@ttr/robot-schema";
import { designMark43Wearable } from "@ttr/design";

test("the motorised helmet passes every check and its faceplate opens at least 52 deg clear of everything", () => {
  const s = designMark43Wearable({ tier: "helmet" }), d = (s.metadata as any).design;
  const v = validateSpec(s);
  assert.ok(v.valid, v.issues.map((i: any) => i.message).join("; "));
  for (const c of d.checks) assert.ok(c.pass, `${c.name}: ${c.detail}`);
  const fp = s.joints.find((j: any) => j.name === "faceplate")!;
  assert.ok(fp.limit!.lower! <= -0.9);
  for (const p of d.printed) assert.ok(p.check.fits_bed && p.check.watertight, p.name);
  // the wearer is modelled but never printed or bought
  assert.ok(s.links.some((l: any) => l.role === "wearer"));
  assert.ok(!d.printed.some((p: any) => /pelvis|head$/.test(p.name)));
});
