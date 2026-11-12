// Re-export each example's ROS 2 package and training scaffold from its robot.json, so they carry the robot's motions
// (motions/*.yaml and the replay script; reference_motions/*.csv). Everything else in them comes out the same as before.
//   node scripts/export_motions.ts [example ...]
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { exportRos2Package } from "@ttr/ros2-export";
import { exportTraining } from "@ttr/training-export";
import type { RobotSpecification } from "@ttr/robot-schema";

function writeZip(files: Record<string, string | Uint8Array>, out: string) {
  // the same deterministic archive as scripts/build_examples.ts: sorted entries, fixed timestamps
  const stage = mkdtempSync(join(tmpdir(), "ttr-zip-"));
  try {
    for (const [f, c] of Object.entries(files)) { const t = join(stage, f); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c); }
    execFileSync("python3", ["-c", "import sys,zipfile\nfrom pathlib import Path\nbase=Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted(base.rglob('*')):\n  if p.is_file():\n   i=zipfile.ZipInfo(p.relative_to(base).as_posix(),(2020,1,1,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;z.writestr(i,p.read_bytes())", stage, out]);
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

const only = process.argv.slice(2);
for (const ex of readdirSync("examples").filter((d) => /^\d\d_/.test(d)).sort()) {
  if (only.length && !only.some((o) => ex.startsWith(o))) continue;
  const spec = JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")) as RobotSpecification;
  writeZip(exportRos2Package(spec, { ros2_control: true }), `examples/${ex}/robot.ros2.zip`);
  writeZip(exportTraining(spec), `examples/${ex}/robot.training.zip`);
  console.log(ex);
}
