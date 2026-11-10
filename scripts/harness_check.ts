// Run the 3D harness checks (wires through solids, bend radius, cut length) on every example and write what they find to
// examples/harness_check.json. tests/wiring3d.test.ts fails if a change makes any example worse than this record.
//   node scripts/harness_check.ts            (all)      TTR_EXAMPLE=05_diff_drive node scripts/harness_check.ts
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { wiring3d, checkHarness } from "@ttr/design";

const path = "examples/harness_check.json", only = process.env.TTR_EXAMPLE;
const out: Record<string, unknown> = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
for (const ex of readdirSync("examples").filter((d) => /^\d\d_/.test(d)).sort()) {
  if (only && ex !== only) continue;
  const s = JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")), w = s.metadata?.design?.wiring;
  if (!w) continue;
  const t = Date.now(), h = wiring3d(s), c = checkHarness(s, w, h);
  out[ex] = {
    wires: h.wires.length, through: c.through.length, bend: c.bend.length, length: c.length.length,
    through_mm: c.through.reduce((a, x) => a + x.run_mm, 0), skipped_solids: c.checked.skipped.length,
    worst: { through: c.through.sort((a, b) => b.run_mm - a.run_mm).slice(0, 3), bend: c.bend.sort((a, b) => a.radius_mm / a.min_mm - b.radius_mm / b.min_mm).slice(0, 3), length: c.length.slice(0, 3) },
  };
  console.log(ex.padEnd(22), `${Date.now() - t} ms`, JSON.stringify({ through: c.through.length, bend: c.bend.length, length: c.length.length }));
}
writeFileSync(path, `${JSON.stringify(out, null, 1)}\n`);
