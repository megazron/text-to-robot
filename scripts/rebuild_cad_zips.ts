// Rewrite every example's robot.cad.zip from its shipped robot.json with the current CAD exporter, written exactly as
// scripts/build_examples.ts writes it (sorted entries, fixed time stamps), without designing the robots again.
//   node scripts/rebuild_cad_zips.ts [--ros2] [example ...]
// --ros2 rewrites robot.ros2.zip instead (2026-11: mimic-coupled bodies left out of the SRDF's collision checks).
// For a change to the CAD package alone (2026-11: the assembly STL in millimetres); a change to the robots themselves is
// scripts/build_examples.ts.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { generateCadFiles } from "@ttr/cad";
import { exportRos2Package } from "@ttr/ros2-export";
import { forgeForRobot } from "@ttr/robot-generator";
import type { RobotSpecification } from "@ttr/robot-schema";

const ros2 = process.argv.includes("--ros2"), only = process.argv.slice(2).filter((a) => a !== "--ros2");
for (const name of readdirSync("examples").filter((n) => /^\d\d_/.test(n)).sort()) {
  if (only.length && !only.includes(name)) continue;
  const spec = JSON.parse(readFileSync(join("examples", name, "robot.json"), "utf8")) as RobotSpecification;
  await forgeForRobot(spec);
  const files = ros2 ? exportRos2Package(spec, { ros2_control: true }) : generateCadFiles(spec), stage = mkdtempSync(join(tmpdir(), "ttr-zip-"));
  try {
    for (const [f, c] of Object.entries(files)) { const t = join(stage, f); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c); }
    execFileSync("python3", ["-c", "import sys,zipfile\nfrom pathlib import Path\nbase=Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted(base.rglob('*')):\n  if p.is_file():\n   i=zipfile.ZipInfo(p.relative_to(base).as_posix(),(2020,1,1,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;z.writestr(i,p.read_bytes())", stage, join("examples", name, ros2 ? "robot.ros2.zip" : "robot.cad.zip")]);
  } finally { rmSync(stage, { recursive: true, force: true }); }
  console.log(`${name}: ${ros2 ? "robot.ros2.zip" : "robot.cad.zip"} (${Object.keys(files).length} files)`);
}
