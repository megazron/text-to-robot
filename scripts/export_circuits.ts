// Write the wiring deliverables of every example from its shipped robot.json, without re-running the design engine:
// WIRING.md, wiring.svg, schematic.svg, schematic.pdf and breadboard.svg in the example folder, the same files inside
// robot.cad.zip (cad/...), the build package README's wiring line and the example README's file table.
//   node scripts/export_circuits.ts            (all)      TTR_EXAMPLE=18_arduino_car node scripts/export_circuits.ts
// build_examples.ts writes the same files when it regenerates an example; this is the quick path after a change to the
// drawings or the electrical calculations only.
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { circuitFiles, layoutProblems, schematic, breadboard, wiring3d, electronicsGlb } from "@ttr/design";

const WIRE_LINE = "   **Wire** from `WIRING.md` (pin-to-pin table, cut list, power budget, battery runtime, regulator heat, logic levels), `schematic.svg` / `schematic.pdf` the picture view `breadboard.svg` and the harness in 3D `electronics.glb`.";
const ROWS = ["| `WIRING.md`, `wiring.svg` | power budget per rail, battery runtime, regulator heat, logic levels, pin-to-pin table, cut list, slack at each joint, cable diagram |",
  "| `schematic.svg`, `schematic.pdf`, `breadboard.svg` | schematic with reference designators, power symbols and net labels; picture view with every wire in its colour |"];
// replace or add entries of a deterministic zip (sorted entries, fixed timestamps), keeping every other entry's bytes
const PATCH = `import sys,zipfile,io
from pathlib import Path, PurePosixPath
zp, stage = sys.argv[1], Path(sys.argv[2])
new = {p.relative_to(stage).as_posix(): p.read_bytes() for p in stage.rglob('*') if p.is_file()}
with zipfile.ZipFile(zp) as z: old = {n: z.read(n) for n in z.namelist()}
old.update(new)
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
  for n in sorted(old, key=lambda s: PurePosixPath(s).parts):
    i = zipfile.ZipInfo(n, (2020,1,1,0,0,0)); i.compress_type = zipfile.ZIP_DEFLATED; z.writestr(i, old[n])
Path(zp).write_bytes(buf.getvalue())`;

const only = process.env.TTR_EXAMPLE;
for (const name of readdirSync("examples").filter((n) => /^\d\d_/.test(n)).sort()) {
  if (only && name !== only) continue;
  const dir = join("examples", name), spec = JSON.parse(readFileSync(join(dir, "robot.json"), "utf8")), w = spec.metadata?.design?.wiring;
  if (!w) continue;
  const t = Date.now(), files = circuitFiles(w, spec.robot_name);
  for (const [f, c] of Object.entries(files)) writeFileSync(join(dir, f), c);
  // the build package carries the same files and a README line naming them
  const zip = join(dir, "robot.cad.zip");
  if (existsSync(zip)) {
    const stage = mkdtempSync(join(tmpdir(), "ttr-cad-"));
    try {
      for (const [f, c] of Object.entries(files)) { mkdirSync(join(stage, "cad"), { recursive: true }); writeFileSync(join(stage, "cad", f), c); }
      writeFileSync(join(stage, "cad", "electronics.glb"), electronicsGlb(spec, wiring3d(spec, w)));   // in the package only, not the folder
      const readme = execFileSync("python3", ["-c", "import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read('cad/README.md').decode(),end='')", zip], { encoding: "utf8" });
      writeFileSync(join(stage, "cad/README.md"), readme.replace(/^ {3}\*\*Wire\*\* from .*$/m, WIRE_LINE));
      execFileSync("python3", ["-c", PATCH, zip, stage]);
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
  const rp = join(dir, "README.md");
  if (existsSync(rp)) {
    let md = readFileSync(rp, "utf8");
    md = md.replace(/^\| `WIRING\.md`, `wiring\.svg` \|.*\n(\| `schematic\.svg`.*\n)?/m, `${ROWS.join("\n")}\n`);
    writeFileSync(rp, md);
  }
  const sch = schematic(w, spec.robot_name), bb = breadboard(w, spec.robot_name);
  const bad = [...layoutProblems(sch.doc), ...layoutProblems(bb.doc)];
  console.log(name.padEnd(22), `${Date.now() - t} ms`, sch.size, bad.length ? `LAYOUT: ${bad.slice(0, 3).join("; ")}` : "clean");
}
