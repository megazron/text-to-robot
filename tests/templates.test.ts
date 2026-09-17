import { test } from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES } from "@ttr/robot-templates";
import { finalizeSpec } from "@ttr/robot-generator";
import { validateSpec } from "@ttr/robot-schema";
import { generateUrdf } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";

for (const tpl of TEMPLATES) {
  test(`template '${tpl.id}' passes spec + URDF validation`, () => {
    const spec = finalizeSpec(tpl.build());
    const sv = validateSpec(spec);
    assert.ok(sv.valid, `${tpl.id} spec invalid: ${sv.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`);
    const uv = validateUrdf(generateUrdf(spec));
    assert.ok(uv.valid, `${tpl.id} URDF invalid: ${uv.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ")}`);
  });
}
