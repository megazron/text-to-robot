// Static interference check of a design-engine spec: node scripts/check_interference.ts robot.json [minMm3]
import { readFileSync } from "node:fs";
import { interference } from "@ttr/design";
const [file, min] = process.argv.slice(2);
const r = interference(JSON.parse(readFileSync(file, "utf8")), Number(min ?? 20));
for (const o of r.overlaps) console.log(`${o.volume_mm3} mm3  ${o.a} x ${o.b}  @ ${o.min.join(",")} .. ${o.max.join(",")}`);
if (r.skipped.length) console.log("not solid:", r.skipped.join(", "));
console.log(`${r.solids} solids, ${r.overlaps.length} overlaps`);
process.exit(r.overlaps.length ? 1 : 0);
