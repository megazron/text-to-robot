// Every example's prompt must still regenerate the robot that ships in examples/.
// (Mark 43 is post-processed by scripts/regen_mark43_example.ts and is checked there.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { generateRobot } from "@ttr/robot-generator";

const strip = (s: { metadata: object }) => JSON.stringify({ ...s, metadata: { ...s.metadata, created: null } });

for (const dir of readdirSync("examples").filter((d) => /^\d\d_/.test(d) && d !== "14_iron_man_mark_43")) {
  test(`example prompt regenerates ${dir}`, async () => {
    const r = await generateRobot(readFileSync(`examples/${dir}/prompt.txt`, "utf8"));
    assert.equal(strip(r.robot), strip(JSON.parse(readFileSync(`examples/${dir}/robot.json`, "utf8"))));
    assert.ok(!r.warnings.some((w) => /^not applied:/.test(w)), `${dir}: ${r.warnings.join("; ")}`);
  });
}
