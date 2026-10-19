// Stage a robot.json as a ROS 2 package directory (meshes beside robot.urdf) for MuJoCo checks:
//   node scripts/stage_ros2.ts <robot.json> <out-dir>   -> prints the robot.urdf path
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { exportRos2Package } from "@ttr/ros2-export";
const [specPath, out] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, "utf8"));
rmSync(out, { recursive: true, force: true });
for (const [f, c] of Object.entries(exportRos2Package(spec))) { const t = join(out, f); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c as any); }
const pkg = join(out, spec.robot_name); writeFileSync(join(pkg, "robot.urdf"), readFileSync(join(pkg, "urdf", `${spec.robot_name}.urdf`)));
console.log(join(pkg, "robot.urdf"));
