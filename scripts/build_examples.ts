// Regenerate every example from its prompt with the design engine and write all deliverables.
//   node scripts/build_examples.ts            (all)      TTR_EXAMPLE=02_arm_6dof node scripts/build_examples.ts
// Then: .venv/bin/python -B scripts/simulate_examples.py  (task tests, GIFs, README results, gallery)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { generateRobot, collectMeshFiles } from "@ttr/robot-generator";
import { generateUrdf } from "@ttr/urdf-generator";
import { exportRos2Package } from "@ttr/ros2-export";
import { exportTraining } from "@ttr/training-export";
import { generateCadFiles } from "@ttr/cad";
import { bomToMarkdown, type BillOfMaterials } from "@ttr/components";
import type { RobotSpecification } from "@ttr/robot-schema";

/** Files an example folder holds; anything else left from older generators is removed. */
const KEEP = new Set(["prompt.txt", "robot.json", "robot.urdf", "meshes", "BOM.md", "bom.json", "robot.ros2.zip", "robot.cad.zip", "robot.training.zip",
  "README.md", "simulation_report.json", "simulation.gif", "test_report.json"]);

function zipDir(base: string, out: string) {
  // deterministic archive: sorted entries, fixed timestamps
  execFileSync("python3", ["-c", "import sys,zipfile\nfrom pathlib import Path\nbase=Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted(base.rglob('*')):\n  if p.is_file():\n   i=zipfile.ZipInfo(p.relative_to(base).as_posix(),(2020,1,1,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;z.writestr(i,p.read_bytes())", base, out]);
}
function writeZip(files: Record<string, string | Uint8Array>, out: string) {
  const stage = mkdtempSync(join(tmpdir(), "ttr-zip-"));
  try {
    for (const [f, c] of Object.entries(files)) { const t = join(stage, f); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c); }
    zipDir(stage, out);
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

const fmt = (v: unknown) => (typeof v === "number" ? String(+v.toFixed(3)) : String(v));
function readme(name: string, prompt: string, spec: RobotSpecification, bom: BillOfMaterials, summary: string | undefined, warnings: string[], previous: string): string {
  const d = (spec.metadata as { design?: any }).design;
  const manual = previous.match(/<!-- MANUAL_NOTES -->[\s\S]*?<!-- \/MANUAL_NOTES -->/)?.[0];
  const sim = previous.match(/<!-- SIM -->[\s\S]*?<!-- \/SIM -->/)?.[0] ?? "<!-- SIM -->\n_Simulation results are written by `scripts/simulate_examples.py`._\n<!-- /SIM -->";
  const out = [`# ${name.replace(/^\d\d_/, "").replace(/_/g, " ")}`, "", `> ${prompt.trim()}`, "", "![simulation](simulation.gif)", ""];
  if (summary) out.push(`Interpreted as: ${summary}`, "");
  if (d) {
    out.push(`**${d.summary}**`, "", `Parts cost **$${bom.total}**${bom.budget ? ` (budget $${bom.budget}: ${bom.feasible ? "within" : "over"})` : ""} · printed structure ${d.printed.length} parts, ${d.printed.reduce((s: number, p: any) => s + p.mass_kg * 1000, 0).toFixed(0)} g · checks passed ${d.checks.filter((c: any) => c.pass).length}/${d.checks.length}`, "");
    out.push("## What it can do", "", "| | |", "|---|--:|", ...Object.entries(d.performance).map(([k, v]) => `| ${k.replace(/_/g, " ")} | ${fmt(v)} |`), "");
    if (d.joints.length) {
      out.push("## Actuators (sized from this robot's own loads)", "", "| Joint | Actuator | Needs (peak) N·m | Rated / peak N·m | Margin | Speed loaded rad/s |", "|---|---|--:|--:|--:|--:|");
      for (const j of d.joints) out.push(`| ${j.joint} | ${j.actuator} | ${j.required_nm} | ${j.rated_nm} / ${j.peak_nm} | ${j.margin}x | ${j.speed_rad_s} |`);
      out.push("");
    }
    const failing = d.checks.filter((c: any) => !c.pass);
    out.push("## Engineering checks", "", failing.length ? failing.map((c: any) => `- ❌ **${c.name}** — ${c.detail}`).join("\n") : `All ${d.checks.length} checks pass (torque, speed, power, stability, print-bed fit${d.family === "arm" ? ", grip" : ""}). Details in \`robot.json\` → \`metadata.design.checks\`.`, "");
    out.push("## Assumptions and limits", "", ...d.assumptions.map((a: string) => `- ${a}`), "");
  }
  if (warnings.length) out.push("## Prompt notes", "", ...warnings.map((w) => `- ${w}`), "");
  out.push(sim, "", "## Files", "",
    "| File | What |", "|---|---|",
    "| `robot.urdf`, `meshes/` | URDF with real component and printed-part meshes, datasheet effort/velocity limits |",
    "| `BOM.md`, `bom.json` | every part to buy, with supplier links and prices |",
    "| `robot.cad.zip` | build package: printable STLs, print list, bought-part models, assembly order |",
    "| `robot.ros2.zip` | ROS 2 description package (ros2_control, MoveIt config, Gazebo launch) |",
    "| `robot.training.zip` | MuJoCo / RL training scaffold |",
    "| `simulation_report.json` | MuJoCo task tests under the real actuator limits |", "");
  if (manual) out.push(manual, "");
  return out.join("\n");
}

for (const name of readdirSync("examples").filter((n) => /^\d\d_/.test(n)).sort()) {
  if (process.env.TTR_EXAMPLE && name !== process.env.TTR_EXAMPLE) continue;
  const dir = join("examples", name), prompt = readFileSync(join(dir, "prompt.txt"), "utf8");
  const res = await generateRobot(prompt);
  if (!res.validation.valid || !res.urdfValidation.valid) throw new Error(`invalid robot for ${name}`);
  const spec = res.robot;
  for (const f of readdirSync(dir)) if (!KEEP.has(f)) rmSync(join(dir, f), { recursive: true, force: true });
  rmSync(join(dir, "meshes"), { recursive: true, force: true });
  writeFileSync(join(dir, "robot.json"), JSON.stringify(spec, null, 2) + "\n");
  writeFileSync(join(dir, "robot.urdf"), generateUrdf(spec));
  mkdirSync(join(dir, "meshes"), { recursive: true });
  for (const [file, bytes] of Object.entries(collectMeshFiles(spec))) writeFileSync(join(dir, "meshes", file), bytes);
  writeFileSync(join(dir, "BOM.md"), bomToMarkdown(res.bom));
  writeFileSync(join(dir, "bom.json"), JSON.stringify(res.bom, null, 2) + "\n");
  writeZip(exportRos2Package(spec, { ros2_control: true }), join(dir, "robot.ros2.zip"));
  writeZip(generateCadFiles(spec), join(dir, "robot.cad.zip"));
  writeZip(exportTraining(spec), join(dir, "robot.training.zip"));
  const previous = existsSync(join(dir, "README.md")) ? readFileSync(join(dir, "README.md"), "utf8") : "";
  writeFileSync(join(dir, "README.md"), readme(name, prompt, spec, res.bom, res.summary, res.warnings, previous));
  const d = (spec.metadata as { design?: any }).design;
  console.log(name.padEnd(22), spec.robot_name.padEnd(18), d ? `${d.family} · $${res.bom.total} · ${d.checks.filter((c: any) => !c.pass).length} failing checks` : "TEMPLATE (not designed yet)");
}
