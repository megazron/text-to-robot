// Where the engine's time goes, stage by stage, for the website's eight timing prompts (docs/PERFORMANCE.md).
// Each pass runs in a fresh process, as each runs in a fresh worker on the website:
//   quick   the robot designed with its wires as straight runs, then every mesh the viewer asks for (the engine worker)
//   route   the same prompt designed again with the 3D harness (the wiring worker)
//   export  the routed robot's downloads: CAD, ROS 2 and training packages and its meshes (the engine worker, which adopts it)
//
//   node --max-old-space-size=8192 scripts/profile_engine.ts                      (all eight; out/profile/engine.json)
//   node scripts/profile_engine.ts --only 02_arm_6dof,20_quadcopter --cache out/profile/cache   (twice: cold, then warm)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CASES = ["02_arm_6dof", "12_mars_rover", "10_quadruped", "08_humanoid", "13_battle_mech", "18_arduino_car", "20_quadcopter", "14_iron_man_mark_43"];
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const pass = arg("--pass");

if (!pass) {
  const only = arg("--only")?.split(",") ?? CASES, cache = arg("--cache"), out = arg("--out") ?? "out/profile/engine.json", tmp = mkdtempSync(join(tmpdir(), "ttr-prof-"));
  const rows: unknown[] = [];
  for (const ex of only) {
    const row: Record<string, unknown> = { case: ex };
    for (const p of ["quick", "route", "export"]) {
      const r = execFileSync(process.execPath, ["--max-old-space-size=8192", "scripts/profile_engine.ts", "--pass", p, "--ex", ex, "--tmp", tmp, ...(cache ? ["--cache", cache] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 26 });
      row[p] = JSON.parse(r.trim().split("\n").at(-1)!);
    }
    rows.push(row); console.log(JSON.stringify(row));
  }
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify({ cache: cache ?? null, rows }, null, 1));
} else {
  const ex = arg("--ex")!, tmp = arg("--tmp")!, cache = arg("--cache");
  const t0 = performance.now();
  const { profiling, profile, stage } = await import("@ttr/parts/profile");
  const { memoStats } = await import("@ttr/parts/memo");
  if (cache) { const { useFileStore } = await import("./lib/file-store.ts"); useFileStore(cache, "profile"); }
  const { generateRobot, collectMeshFiles } = await import("@ttr/robot-generator");
  const { setDefaultRouter } = await import("@ttr/design");
  const loaded = performance.now();
  profiling(true);
  const prompt = readFileSync(`examples/${ex}/prompt.txt`, "utf8").trim();
  let robot: import("@ttr/robot-schema").RobotSpecification;
  if (pass === "quick" || pass === "route") {
    setDefaultRouter(pass === "quick" ? "legacy" : "3d");
    robot = (await generateRobot(prompt)).robot;
    if (pass === "route") writeFileSync(join(tmp, `${ex}.json`), JSON.stringify(robot));
  } else {
    robot = JSON.parse(readFileSync(join(tmp, `${ex}.json`), "utf8"));
    const { forgeForRobot } = await import("@ttr/robot-generator");
    await forgeForRobot(robot);
    const { generateCadFiles } = await import("@ttr/cad"), { exportRos2Package } = await import("@ttr/ros2-export"), { exportTraining } = await import("@ttr/training-export");
    stage("export: CAD package", () => generateCadFiles(robot));
    stage("export: ROS 2 package", () => exportRos2Package(robot, { ros2_control: true }));
    stage("export: training package", () => exportTraining(robot));
  }
  if (pass !== "route") stage("mesh files", () => collectMeshFiles(robot));
  const total = (performance.now() - loaded) / 1000;
  console.log(JSON.stringify({ load_s: +((loaded - t0) / 1000).toFixed(2), total_s: +total.toFixed(2), stages: profile(), memo: memoStats }));
}
