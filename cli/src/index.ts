#!/usr/bin/env node
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { generateRobot, modifyRobot } from "@ttr/robot-generator";
import { validateUrdf, parseUrdf } from "@ttr/urdf-validator";
import { exportRos2Package } from "@ttr/ros2-export";
import { providerStatus } from "@ttr/llm-providers";
import { buildBom, bomToMarkdown } from "@ttr/components";
import { generateCadFiles } from "@ttr/cad";
import { exportTraining } from "@ttr/training-export";
import { extractBudget } from "@ttr/robot-generator";
import { safeName, type RobotSpecification, type ValidationResult } from "@ttr/robot-schema";

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m", c: "\x1b[36m" };
const ok = (s: string) => console.log(`${C.g}✓${C.x} ${s}`);
const bad = (s: string) => console.log(`${C.r}✗${C.x} ${s}`);
const info = (s: string) => console.log(`${C.d}${s}${C.x}`);

function writeFiles(base: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(base, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

function printChecks(v: ValidationResult) { for (const c of v.checks) console.log("  " + c); }

async function cmdGenerate(prompt: string, outDir?: string) {
  console.log(`\n${C.b}Generating robot...${C.x}`);
  info(`mode: ${providerStatus().mode}`);
  const res = await generateRobot(prompt);
  ok("Natural language interpreted");
  ok("Robot specification generated");
  res.validation.valid ? ok("Specification validated") : bad("Specification invalid");
  ok("Inertia calculated");
  ok("URDF generated");
  res.urdfValidation.valid ? ok("URDF validated") : bad("URDF validation failed");
  for (const w of res.warnings) info("  ! " + w);
  for (const r of res.repairs) info("  repair " + r);

  const name = safeName(res.robot.robot_name);
  const base = outDir ?? `./out/${name}`;
  const files = exportRos2Package(res.robot, { ros2_control: true });
  writeFiles(base, files);
  writeFileSync(join(base, `${name}.json`), JSON.stringify(res.robot, null, 2));
  writeFileSync(join(base, "BOM.md"), bomToMarkdown(res.bom));
  writeFiles(base, generateCadFiles(res.robot));
  writeFiles(base, exportTraining(res.robot));
  ok("Bill of materials estimated ($" + res.bom.total + ")");
  ok("CAD (OpenSCAD) parts generated");
  ok("RL training scaffold generated (PyBullet + PPO)");
  console.log(`\nRobot written to:\n\n  ${C.c}${base}/${C.x}\n`);
  console.log(`  ${C.d}ros2 launch ${name} display.launch.py${C.x}`);
  if (!res.validation.valid || !res.urdfValidation.valid) process.exitCode = 1;
}

function cmdValidate(file: string) {
  const xml = readFileSync(file, "utf8");
  const v = validateUrdf(xml);
  printChecks(v);
  for (const i of v.issues) (i.severity === "error" ? bad : info)(`${i.severity}: ${i.message}`);
  if (!v.valid) process.exitCode = 1;
}

function cmdInspect(file: string) {
  const xml = readFileSync(file, "utf8");
  const spec = parseUrdf(xml);
  console.log(`${C.b}${spec.robot_name}${C.x}  ${spec.links.length} links, ${spec.joints.length} joints`);
  console.log(`\n${C.b}Links${C.x}`);
  for (const l of spec.links) console.log(`  ${l.name.padEnd(20)} ${l.geometry.type.padEnd(9)} mass=${l.mass}`);
  console.log(`\n${C.b}Joints${C.x}`);
  for (const j of spec.joints) console.log(`  ${j.name.padEnd(20)} ${j.type.padEnd(11)} ${j.parent} -> ${j.child}`);
}

async function cmdModify(jsonFile: string, instruction: string, outDir?: string) {
  const spec = JSON.parse(readFileSync(jsonFile, "utf8")) as RobotSpecification;
  const res = await modifyRobot(spec, instruction);
  console.log(`${C.b}Analyzing modification...${C.x}`);
  for (const c of res.changes) console.log("  " + c);
  res.validation.valid ? ok("Validation passed") : bad("Validation failed");
  const name = safeName(res.robot.robot_name);
  const base = outDir ?? dirname(jsonFile);
  writeFiles(base, exportRos2Package(res.robot, { ros2_control: true }));
  writeFileSync(join(base, `${name}.json`), JSON.stringify(res.robot, null, 2));
  console.log(`\nUpdated robot written to ${C.c}${base}/${C.x}`);
}

function cmdBom(jsonFile: string, budgetArg?: string) {
  const spec = JSON.parse(readFileSync(jsonFile, "utf8")) as RobotSpecification;
  const budget = budgetArg ? Number(budgetArg) : extractBudget(spec.metadata.source_prompt ?? "");
  const bom = buildBom(spec, budget);
  console.log(bomToMarkdown(bom));
  if (budget !== undefined && !bom.feasible) process.exitCode = 1;
}

function usage() {
  console.log(`text-to-robot -- describe a robot, get a ROS 2 robot

Usage:
  text-to-robot "<prompt>"                 generate from a prompt
  text-to-robot generate "<prompt>" [-o dir]
  text-to-robot modify robot.json "<instruction>" [-o dir]
  text-to-robot validate robot.urdf
  text-to-robot inspect robot.urdf

Env: OPENAI_API_KEY / ANTHROPIC_API_KEY enable cloud mode (else deterministic demo mode).`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "-h" || argv[0] === "--help") { usage(); return; }
  // -o/--out <dir>: strip the flag and its value only when actually present
  let outIdx = argv.indexOf("-o"); if (outIdx < 0) outIdx = argv.indexOf("--out");
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : undefined;
  const clean = argv.filter((_, i) => outIdx < 0 || (i !== outIdx && i !== outIdx + 1));
  const cmd = clean[0];
  try {
    if (cmd === "bom") return cmdBom(clean[1], clean[2]);
    if (cmd === "validate") return cmdValidate(clean[1]);
    if (cmd === "inspect") return cmdInspect(clean[1]);
    if (cmd === "modify") return await cmdModify(clean[1], clean[2], outDir);
    if (cmd === "generate") return await cmdGenerate(clean.slice(1).join(" "), outDir);
    return await cmdGenerate(clean.join(" "), outDir); // bare prompt
  } catch (e) {
    bad((e as Error).message);
    process.exitCode = 1;
  }
}
main();
