// Run a design-engine designer and write the spec:
//   node scripts/design_robot.ts <designer> <out.json> ['{"request":"json"}']
// designer: arm | diffdrive | fourwheel | mecanum | rover | walle | eva | baymax | quadruped | hexapod | humanoid | mech
import { writeFileSync } from "node:fs";
import * as D from "@ttr/design";
const [which, out, reqJson] = process.argv.slice(2);
const req = reqJson ? JSON.parse(reqJson) : {};
const fns: Record<string, (r: any) => any> = {
  arm: (r) => D.designArm({ dof: 6, ...r }),
  diffdrive: (r) => (D as any).designDiffDrive(r), fourwheel: (r) => (D as any).designFourWheel(r), mecanum: (r) => (D as any).designMecanum(r),
  rover: (r) => (D as any).designRover(r), walle: (r) => (D as any).designWallE(r), eva: (r) => (D as any).designEva(r), baymax: (r) => (D as any).designBaymax(r),
  quadruped: (r) => (D as any).designQuadruped(r), hexapod: (r) => (D as any).designHexapod(r),
  humanoid: (r) => (D as any).designHumanoid(r), mech: (r) => (D as any).designBattleMech(r),
};
const t0 = Date.now();
const spec = fns[which](req);
writeFileSync(out, JSON.stringify(spec, null, 1));
const d = (spec.metadata as any).design;
console.log(d.summary, `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
for (const c of d.checks) if (!c.pass || process.env.VERBOSE || process.env.ALL) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`);
for (const j of d.joints ?? []) if (process.env.JOINTS) console.log("   ", j.joint, j.actuator, j.required_nm, "/", j.peak_nm, "margin", j.margin);
console.log(JSON.stringify(d.performance));
