// Design one robot and write every export of it, as an example folder holds them (scripts/check_exports.py --designs).
//   node scripts/export_one.ts '{"prompt": "a 3 wheel robot", "modify": ["make it red"], "out": "out/x"}'
// A prompt starting "Build a robot from my parts:" is built from those parts (the website's My parts), the rest by the
// prompt; each change in "modify" is applied in turn, as the Modify box does.
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { generateRobot, modifyRobot, collectMeshFiles, fromParts } from "@ttr/robot-generator";
import { generateUrdf } from "@ttr/urdf-generator";
import { exportRos2Package } from "@ttr/ros2-export";
import { generateCadFiles } from "@ttr/cad";
import { bomToMarkdown, buildBom } from "@ttr/components";
import { circuitFiles, arduinoFirmware } from "@ttr/design";
import type { RobotSpecification } from "@ttr/robot-schema";

const job = JSON.parse(process.argv[2]) as { prompt: string; modify?: string[]; out: string };
let spec: RobotSpecification, bom: ReturnType<typeof buildBom> | undefined;
const parts = job.prompt.match(/^build a robot from my parts:\s*(.*)$/i);
if (parts) {
  const r = fromParts(parts[1]), d = Object.values(r.designs)[0];
  if (!d) throw new Error(`nothing designed from those parts: ${r.notes.join("; ")}`);
  spec = d.robot; bom = d.bom;
} else {
  let r = await generateRobot(job.prompt);
  for (const m of job.modify ?? []) r = await modifyRobot(r.robot, m);
  spec = r.robot; bom = r.bom;
}
bom ??= buildBom(spec);
const dir = job.out;
mkdirSync(join(dir, "meshes"), { recursive: true });
writeFileSync(join(dir, "robot.json"), JSON.stringify(spec, null, 2) + "\n");
writeFileSync(join(dir, "robot.urdf"), generateUrdf(spec));
for (const [file, bytes] of Object.entries(collectMeshFiles(spec))) writeFileSync(join(dir, "meshes", file), bytes);
writeFileSync(join(dir, "BOM.md"), bomToMarkdown(bom));
writeFileSync(join(dir, "bom.json"), JSON.stringify(bom, null, 2) + "\n");
const wiring = (spec.metadata as { design?: { wiring?: unknown } }).design?.wiring;
if (wiring) for (const [f, c] of Object.entries(circuitFiles(wiring as never, spec.robot_name))) writeFileSync(join(dir, f), c);
for (const [f, c] of Object.entries(arduinoFirmware(spec)?.files ?? {})) { mkdirSync(dirname(join(dir, "firmware", f)), { recursive: true }); writeFileSync(join(dir, "firmware", f), c); }
const zip = (files: Record<string, string | Uint8Array>, out: string) => {
  const stage = mkdtempSync(join(tmpdir(), "ttr-zip-"));
  try {
    for (const [f, c] of Object.entries(files)) { const t = join(stage, f); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c); }
    execFileSync("python3", ["-c", "import sys,zipfile\nfrom pathlib import Path\nb=Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted(b.rglob('*')):\n  if p.is_file(): z.write(p,p.relative_to(b).as_posix())", stage, out]);
  } finally { rmSync(stage, { recursive: true, force: true }); }
};
zip(exportRos2Package(spec, { ros2_control: true }), join(dir, "robot.ros2.zip"));
zip(generateCadFiles(spec), join(dir, "robot.cad.zip"));
console.log(`${spec.robot_name}: written to ${dir}`);
