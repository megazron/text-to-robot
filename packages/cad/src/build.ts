// Build package for robots from the design engine: what to print, what to buy, how to put it
// together. Printed parts are the exact solids the design was checked with, in millimetres.
import type { RobotSpecification, Link } from "@ttr/robot-schema";
import { safeName } from "@ttr/robot-schema";
import { buildPart, toStlBinary } from "@ttr/mesh";
import { part } from "@ttr/parts";
import { buildBom, bomToMarkdown, designRecord } from "@ttr/components";
import { assemblyStl } from "./stl.ts";

const PRINT_CM3_PER_HOUR = 12;
const isPrinted = (l: Link) => l.geometry.type === "mesh" && l.geometry.part === "printed";
const componentKey = (l: Link) => (l.geometry.type === "mesh" && l.geometry.part === "component" ? String(l.geometry.params?.key) : undefined);

export function generateBuildPackage(spec: RobotSpecification): Record<string, string | Uint8Array> {
  const d = designRecord(spec)!;
  const name = safeName(spec.robot_name), files: Record<string, string | Uint8Array> = {};
  // ---- print ----
  const printed = spec.links.filter(isPrinted);
  for (const l of printed) files[`cad/print/${safeName(l.name)}.stl`] = toStlBinary(buildPart(l.geometry as never), 1000);
  const rows = d.printed.map((p) => `| ${p.name} | ${p.check.bbox_mm.join(" × ")} | ${(p.mass_kg * 1000).toFixed(0)} | ${(p.check.volume_cm3 / PRINT_CM3_PER_HOUR).toFixed(1)} | ${p.check.fits_bed ? "yes" : "**no**"} |`);
  const grams = d.printed.reduce((s, p) => s + p.mass_kg * 1000, 0), hours = d.printed.reduce((s, p) => s + p.check.volume_cm3, 0) / PRINT_CM3_PER_HOUR;
  files["cad/print/PRINT_LIST.md"] = `# Print list — ${spec.robot_name}\n\n${d.printed.length} parts, about ${grams.toFixed(0)} g of PETG and ${hours.toFixed(1)} h of printing.\n\n` +
    "Settings the masses assume: PETG, 0.4 mm nozzle, 0.2 mm layers, 4 perimeters, 30 % gyroid infill. Print each part flat on its largest face; holes are sized for M2/M2.5/M3 screws (clearance +0.4 mm).\n\n" +
    "| Part | Size (mm) | Mass (g) | Time (h) | Fits a 250 × 210 × 220 bed |\n|---|---|--:|--:|:-:|\n" + rows.join("\n") + "\n";
  // ---- bought parts: reference models for your own CAD ----
  for (const key of new Set(spec.links.map(componentKey).filter((k): k is string => !!k))) {
    const l = spec.links.find((x) => componentKey(x) === key)!;
    files[`cad/reference/${key}.stl`] = toStlBinary(buildPart(l.geometry as never), 1000);
  }
  files["cad/BOM.md"] = bomToMarkdown(buildBom(spec));
  files[`cad/${name}_assembly.stl`] = assemblyStl(spec);
  files["cad/ASSEMBLY.md"] = assemblyGuide(spec);
  files["cad/design.json"] = JSON.stringify(d, null, 2);
  files["cad/robot.json"] = JSON.stringify(spec, null, 2);
  files["cad/README.md"] = `# Build package — ${spec.robot_name}\n\n${d.summary}\n\n` +
    "1. **Buy** everything in `BOM.md` (supplier links included).\n" +
    "2. **Print** every STL in `print/` (see `print/PRINT_LIST.md`).\n" +
    "3. **Assemble** in the order of `ASSEMBLY.md`.\n" +
    "4. **Check** against `design.json`: each actuator's required vs rated torque, the speed it reaches loaded, battery runtime, stability and every other check the design passed.\n\n" +
    "`reference/` holds the bought parts' models (from their datasheet drawings) for your own CAD; `" + name + "_assembly.stl` is the whole robot in its build pose.\n\n" +
    "## Assumptions\n\n" + d.assumptions.map((a) => `- ${a}`).join("\n") + "\n";
  return files;
}

/** Root-first build order: every mounted part, every joint, with the screws the design counted. */
function assemblyGuide(spec: RobotSpecification): string {
  const d = designRecord(spec)!, out: string[] = [`# Assembly — ${spec.robot_name}`, ""];
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
