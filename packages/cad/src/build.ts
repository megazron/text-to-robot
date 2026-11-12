// Build package for robots from the design engine: what to print, what to buy, how to put it
// together. Printed parts are the exact solids the design was checked with, in millimetres.
import type { RobotSpecification, Link } from "@ttr/robot-schema";
import { safeName } from "@ttr/robot-schema";
import { buildPart, toStlBinary } from "@ttr/mesh";
import { part } from "@ttr/parts";
import { buildBom, bomToMarkdown, designRecord } from "@ttr/components";
import { assemblyStl } from "./stl.ts";
import { partFiles } from "@ttr/kernel/ready";
import { circuitFiles, wiring3d, electronicsGlb, arduinoFirmware, firmwareFor, type WiringRecord } from "@ttr/design";

const PRINT_CM3_PER_HOUR = 12;
const isPrinted = (l: Link) => l.geometry.type === "mesh" && (l.geometry.part === "printed" || l.geometry.part === "cad" || l.geometry.part === "armour");
/** CAD-kernel parts carry exact solids: their STL comes welded from the kernel and they also get a STEP file */
const cadProgram = (l: Link) => (l.geometry.type === "mesh" && l.geometry.part === "cad" ? String(l.geometry.params?.program) : undefined);
const componentKey = (l: Link) => (l.geometry.type === "mesh" && l.geometry.part === "component" ? String(l.geometry.params?.key) : undefined);

export function generateBuildPackage(spec: RobotSpecification): Record<string, string | Uint8Array> {
  const d = designRecord(spec)!;
  const name = safeName(spec.robot_name), files: Record<string, string | Uint8Array> = {};
  // ---- print ----
  // printed parts are the ones in the design's print record; other solid-modelled links are fabricated (laser-cut
  // aluminium plates, tube, sewn covers) and go to fabricate/ with their own list
  const printedNames = new Set(d.printed.map((p) => p.name));
  const printed = spec.links.filter((l) => isPrinted(l) && printedNames.has(l.name));
  // (a modelled wearer inside worn armour is neither printed nor made)
  const fabricated = spec.links.filter((l) => isPrinted(l) && !printedNames.has(l.name) && l.role !== "wearer");
  for (const l of printed) {
    const prog = cadProgram(l);
    if (prog) { const f = partFiles(prog); files[`cad/print/${safeName(l.name)}.stl`] = f.stl; files[`cad/step/${safeName(l.name)}.step`] = f.step; }
    else files[`cad/print/${safeName(l.name)}.stl`] = toStlBinary(buildPart(l.geometry as never), 1000);
  }
  for (const l of fabricated) files[`cad/fabricate/${safeName(l.name)}.stl`] = toStlBinary(buildPart(l.geometry as never), 1000);
  if (fabricated.length) files["cad/fabricate/FABRICATE.md"] = `# Fabricated parts: ${spec.robot_name}\n\nNot printed: made from sheet, tube or fabric (see BOM.md for the exact item and cost). Each STL is the finished shape; plates are 2D-cut from it (export the top face as DXF for laser or waterjet cutting).\n\n| Part | Material | Mass (g) |\n|---|---|--:|\n` +
    fabricated.map((l) => `| ${l.name} | ${l.material ?? "?"} | ${(l.mass * 1000).toFixed(0)} |`).join("\n") + "\n";
  const rows = d.printed.map((p) => `| ${p.name} | ${p.check.bbox_mm.join(" × ")} | ${(p.mass_kg * 1000).toFixed(0)} | ${(p.check.volume_cm3 / PRINT_CM3_PER_HOUR).toFixed(1)} | ${p.check.fits_bed ? "yes" : "**no**"} |`);
  const grams = d.printed.reduce((s, p) => s + p.mass_kg * 1000, 0), hours = d.printed.reduce((s, p) => s + p.check.volume_cm3, 0) / PRINT_CM3_PER_HOUR;
  files["cad/print/PRINT_LIST.md"] = `# Print list: ${spec.robot_name}\n\n${d.printed.length} parts, about ${grams.toFixed(0)} g of PETG and ${hours.toFixed(1)} h of printing.\n\n` +
    (printed.some(cadProgram) ? "Exact solids of these parts are in `cad/step/` (STEP AP214, millimetres): open them in Fusion, FreeCAD or Onshape to edit.\n\n" : "") +
    "Settings the masses assume: PETG, 0.4 mm nozzle, 0.2 mm layers, 4 perimeters, 30 % gyroid infill. Print each part flat on its largest face; holes are sized for M2/M2.5/M3 screws (clearance +0.4 mm).\n\n" +
    "| Part | Size (mm) | Mass (g) | Time (h) | Fits a 250 × 210 × 220 bed |\n|---|---|--:|--:|:-:|\n" + rows.join("\n") + "\n";
  // ---- bought parts: reference models for your own CAD ----
  for (const key of new Set(spec.links.map(componentKey).filter((k): k is string => !!k))) {
    const l = spec.links.find((x) => componentKey(x) === key)!;
    files[`cad/reference/${key}.stl`] = toStlBinary(buildPart(l.geometry as never), 1000);
  }
  files["cad/BOM.md"] = bomToMarkdown(buildBom(spec));
  const wiring = (d as { wiring?: WiringRecord }).wiring;
  if (wiring) for (const [f, c] of Object.entries(circuitFiles(wiring, spec.robot_name))) files[`cad/${f}`] = c;
  // the electronics and every wire in 3D at the home pose, a body per part and per wire (glTF binary)
  if (wiring) files["cad/electronics.glb"] = electronicsGlb(spec, wiring3d(spec, wiring));
  // an Arduino robot gets its sketch (in a folder of the sketch's name, as the IDE wants) and the flashing steps
  const fw = arduinoFirmware(spec, wiring);
  if (fw) for (const [f, c] of Object.entries(fw.files)) files[`cad/firmware/${f}`] = c;
  // a robot built from a parts list carries its own pin plan: its sketch or Pi script
  const own = fw ? undefined : firmwareFor(spec);
  if (own) files[`cad/firmware/${own.name}`] = own.code;
  files[`cad/${name}_assembly.stl`] = assemblyStl(spec);
  files["cad/ASSEMBLY.md"] = assemblyGuide(spec);
  files["cad/design.json"] = JSON.stringify(d, null, 2);
  files["cad/robot.json"] = JSON.stringify(spec, null, 2);
  files["cad/README.md"] = `# Build package: ${spec.robot_name}\n\n${d.summary}\n\n` +
    "1. **Buy** everything in `BOM.md` (supplier links included).\n" +
    "2. **Print** every STL in `print/` (see `print/PRINT_LIST.md`).\n" +
    "3. **Assemble** in the order of `ASSEMBLY.md`.\n" +
    (wiring ? "   **Wire** from `WIRING.md` (pin-to-pin table, cut list, power budget, battery runtime, regulator heat, logic levels), `schematic.svg` / `schematic.pdf` the picture view `breadboard.svg` and the harness in 3D `electronics.glb`.\n" : "") +
    (fw ? firmwareLine(fw.sketch) : "") +
    "4. **Check** against `design.json`: each actuator's required vs rated torque, the speed it reaches loaded, battery runtime, stability and every other check the design passed.\n\n" +
    "`reference/` holds the bought parts' models (from their datasheet drawings) for your own CAD; `" + name + "_assembly.stl` is the whole robot in its build pose.\n\n" +
    "## Assumptions\n\n" + d.assumptions.map((a) => `- ${a}`).join("\n") + "\n";
  return files;
}

/** The build package README's line about the sketch (scripts/export_firmware.ts writes the same line into shipped packages). */
export const firmwareLine = (sketch: string) => `   **Flash** the Arduino with \`firmware/${sketch}\`: board, libraries, port and the pin map are in \`firmware/README.md\`.\n`;

/** Root-first build order: every mounted part, every joint, with the screws the design counted. */
function assemblyGuide(spec: RobotSpecification): string {
  const d = designRecord(spec)!, out: string[] = [`# Assembly: ${spec.robot_name}`, ""];
  const children = new Map<string, typeof spec.joints>();
  for (const j of spec.joints) children.set(j.parent, [...(children.get(j.parent) ?? []), j]);
  const links = new Map(spec.links.map((l) => [l.name, l]));
  const root = spec.root ?? spec.links.find((l) => !spec.joints.some((j) => j.child === l.name))!.name;
  let step = 1;
  const visit = (name: string) => {
    for (const j of children.get(name) ?? []) {
      const child = links.get(j.child)!, key = componentKey(child);
      if (j.type === "fixed" && key) out.push(`${step++}. Mount the **${part(key).name}** (${j.child}) in **${name}** with its case screws.`);
      else if (j.type === "fixed") out.push(`${step++}. Bolt **${j.child}** to **${name}**.`);
      else if (j.type === "continuous") out.push(`${step++}. Fit **${j.child}** on the output of the motor in **${name}** (${j.passive ? "free-running" : "driven"} joint \`${j.name}\`).`);
      else out.push(`${step++}. Set joint \`${j.name}\` to zero (centre the servo first), then screw **${j.child}** to the actuator output in **${name}**; it moves ${fmtLim(j.limit?.lower)} … ${fmtLim(j.limit?.upper)}.`);
      visit(j.child);
    }
  };
  out.push(`Start from **${root}**.`, "");
  visit(root);
  out.push("", "## Fasteners", "", ...Object.entries(d.fasteners).map(([k, v]) => `- ${v} × ${k}`));
  out.push("", "## Before powering up", "", "- Set every serial-bus servo to a unique ID and centre it before fitting its horn.", "- Check each joint's range by hand against the limits above; the design's limits keep links clear of each other.");
  return out.join("\n") + "\n";
}
const fmtLim = (x?: number) => (x === undefined ? "?" : `${((x * 180) / Math.PI).toFixed(0)}°`);
