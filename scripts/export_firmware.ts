// Write the Arduino sketch of every example whose robot has an Arduino-class board, from its shipped robot.json, without
// re-running the design engine: firmware/<robot>/<robot>.ino and firmware/README.md in the example folder, the same
// files inside robot.cad.zip (cad/firmware/...), the build package README's flashing line and the example README's file
// table. build_examples.ts writes the same files when it regenerates an example.
//   node scripts/export_firmware.ts            (all)      TTR_EXAMPLE=18_arduino_car node scripts/export_firmware.ts
//   node scripts/export_firmware.ts --variants <dir>      rewired variants of the examples, for scripts/compile_firmware.py
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { arduinoFirmware } from "@ttr/design";
import { firmwareLine } from "@ttr/cad";
import { firmwareVariants } from "./firmware_variants.ts";

const FIRMWARE_ROW = "| `firmware/` | Arduino sketch written from the wiring record (every pin is a wire of `WIRING.md`), with the flashing steps and pin map in `firmware/README.md` |";
const put = (root: string, files: Record<string, string>) => { for (const [f, c] of Object.entries(files)) { const t = join(root, f); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c); } };
// replace or add entries of a deterministic zip (sorted entries, fixed timestamps) and drop those under a prefix first
const PATCH = `import sys,zipfile,io
from pathlib import Path, PurePosixPath
zp, stage, drop = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
new = {p.relative_to(stage).as_posix(): p.read_bytes() for p in stage.rglob('*') if p.is_file()}
with zipfile.ZipFile(zp) as z: old = {n: z.read(n) for n in z.namelist() if not n.startswith(drop)}
old.update(new)
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
  for n in sorted(old, key=lambda s: PurePosixPath(s).parts):
    i = zipfile.ZipInfo(n, (2020,1,1,0,0,0)); i.compress_type = zipfile.ZIP_DEFLATED; z.writestr(i, old[n])
Path(zp).write_bytes(buf.getvalue())`;

const at = process.argv.indexOf("--variants");
if (at > 0) {
  const out = process.argv[at + 1];
  if (!out) throw new Error("usage: node scripts/export_firmware.ts --variants <dir>");
  for (const spec of firmwareVariants()) {
    const fw = arduinoFirmware(spec);
    if (!fw) throw new Error(`${spec.robot_name}: no sketch`);
    put(join(out, spec.robot_name), fw.files);
    console.log(spec.robot_name.padEnd(22), fw.board.fqbn, fw.libraries.join(", ") || "core only");
  }
  process.exit(0);
}

const only = process.env.TTR_EXAMPLE;
for (const name of readdirSync("examples").filter((n) => /^\d\d_/.test(n)).sort()) {
  if (only && name !== only) continue;
  const dir = join("examples", name), spec = JSON.parse(readFileSync(join(dir, "robot.json"), "utf8")), fw = arduinoFirmware(spec);
  rmSync(join(dir, "firmware"), { recursive: true, force: true });
  if (!fw) continue;
  put(join(dir, "firmware"), fw.files);
  // the build package carries the same files and a README line naming the sketch
  const zip = join(dir, "robot.cad.zip");
  if (existsSync(zip)) {
    const stage = mkdtempSync(join(tmpdir(), "ttr-fw-"));
    try {
      put(join(stage, "cad/firmware"), fw.files);
      const readme = execFileSync("python3", ["-c", "import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read('cad/README.md').decode(),end='')", zip], { encoding: "utf8" });
      writeFileSync(join(stage, "cad/README.md"), readme.replace(/^ {3}\*\*Flash\*\* .*\n/m, "").replace(/^4\. \*\*Check\*\*/m, `${firmwareLine(fw.sketch)}4. **Check**`));
      execFileSync("python3", ["-c", PATCH, zip, stage, "cad/firmware/"]);
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
  const rp = join(dir, "README.md");
  if (existsSync(rp)) {
    const md = readFileSync(rp, "utf8").replace(/^\| `firmware\/` \|.*\n/m, "");
    writeFileSync(rp, md.replace(/^(\| `schematic\.svg`.*\n)/m, `$1${FIRMWARE_ROW}\n`));
  }
  console.log(name.padEnd(22), fw.sketch, fw.board.fqbn, `${fw.pins.length} pins`, fw.libraries.join(", ") || "core only");
}
