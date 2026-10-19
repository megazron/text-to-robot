// Run a design-engine designer and write the spec:
//   node scripts/design_robot.ts <designer> <out.json> ['{"request":"json"}']
// designer: arm | diffdrive | fourwheel | mecanum | rover | walle | eva | baymax
import { writeFileSync } from "node:fs";
import * as D from "@ttr/design";
const [which, out, reqJson] = process.argv.slice(2);
const req = reqJson ? JSON.parse(reqJson) : {};
const fns: Record<string, (r: any) => any> = {
  arm: (r) => D.designArm({ dof: 6, ...r }),
  diffdrive: (r) => (D as any).designDiffDrive(r), fourwheel: (r) => (D as any).designFourWheel(r), mecanum: (r) => (D as any).designMecanum(r),
  rover: (r) => (D as any).designRover(r), walle: (r) => (D as any).designWallE(r), eva: (r) => (D as any).designEva(r), baymax: (r) => (D as any).designBaymax(r),
};
const spec = fns[which](req);
writeFileSync(out, JSON.stringify(spec, null, 1));
const d = (spec.metadata as any).design;
for (const c of d.checks) if (!c.pass || process.env.VERBOSE) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`);
console.log(JSON.stringify(d.performance));
