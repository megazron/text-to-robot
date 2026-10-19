import { designArm } from "@ttr/design"; import { writeFileSync } from "node:fs";
const s = designArm({ dof: 6, gripper: true, sensors: ["camera", "depth", "imu"], segments: { forearm: 0.2 } });
const d = (s.metadata as any).design; console.log(d.summary, d.checks.filter((c: any) => !c.pass), s.sensors.map((x) => x.name));
writeFileSync(process.argv[2], JSON.stringify(s));
