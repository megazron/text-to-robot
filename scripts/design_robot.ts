// Run a design-engine family and write the spec:  node scripts/design_robot.ts <family> <out.json> ['{"json request"}']
//   families: arm, quadruped, hexapod, humanoid, mech
import { writeFileSync } from "node:fs";
import * as D from "@ttr/design";
const [family, out, json] = process.argv.slice(2);
const req = json ? JSON.parse(json) : {};
const fns: Record<string, (r: any) => any> = { arm: D.designArm, quadruped: D.designQuadruped, hexapod: (D as any).designHexapod, humanoid: (D as any).designHumanoid, mech: (D as any).designBattleMech };
const t0 = Date.now();
const spec = fns[family]({ dof: 6, ...req });
writeFileSync(out, JSON.stringify(spec, null, 1));
const d = (spec.metadata as any).design;
console.log(d.summary, `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
for (const c of d.checks) if (!c.pass || process.env.ALL) console.log(c.pass ? "  ok  " : "  FAIL", c.name, "-", c.detail);
for (const j of d.joints) if (process.env.JOINTS) console.log("   ", j.joint, j.actuator, j.required_nm, "/", j.peak_nm, "margin", j.margin);
console.log(JSON.stringify(d.performance));
