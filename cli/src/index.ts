#!/usr/bin/env node
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { generateRobot, modifyRobot, collectMeshFiles, hasMeshes } from "@ttr/robot-generator";
import { generateUrdf } from "@ttr/urdf-generator";
import { validateUrdf, parseUrdf } from "@ttr/urdf-validator";
import { exportRos2Package } from "@ttr/ros2-export";
import { providerStatus } from "@ttr/llm-providers";
import { buildBom, bomToMarkdown } from "@ttr/components";
import { generateCadFiles } from "@ttr/cad";
import { exportTraining } from "@ttr/training-export";
import { extractBudget, extractPayload } from "@ttr/robot-generator";
import { safeName, type RobotSpecification, type ValidationResult } from "@ttr/robot-schema";

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m", c: "\x1b[36m" };
const ok = (s: string) => console.log(`${C.g}✓${C.x} ${s}`);
const bad = (s: string) => console.log(`${C.r}✗${C.x} ${s}`);
const info = (s: string) => console.log(`${C.d}${s}${C.x}`);
const warn = (s: string) => console.log(`${C.y}${s}${C.x}`);

function writeFiles(base: string, files: Record<string, string | Uint8Array>) {
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
  ok(res.summary ? `Interpreted as: ${res.summary}` : "Natural language interpreted");
  ok("Robot specification generated");
  res.validation.valid ? ok("Specification validated") : bad("Specification invalid");
  ok("Inertia calculated");
  ok("URDF generated");
  res.urdfValidation.valid ? ok("URDF validated") : bad("URDF validation failed");
  for (const w of res.warnings) (/^(?:approximated|not applied):/.test(w) ? warn : info)("  ! " + w);
  for (const r of res.repairs) info("  repair " + r);

  const name = safeName(res.robot.robot_name);
  const base = outDir ?? `./out/${name}`;
  const files = exportRos2Package(res.robot, { ros2_control: true });
  writeFiles(base, files);
  writeFileSync(join(base, `${name}.json`), JSON.stringify(res.robot, null, 2));
  if (hasMeshes(res.robot)) {   // simulator-friendly URDF (relative mesh paths) + the mesh files themselves
    writeFileSync(join(base, `${name}.sim.urdf`), generateUrdf(res.robot, { meshPrefix: "meshes/" }));
    writeFiles(base, Object.fromEntries(Object.entries(collectMeshFiles(res.robot)).map(([f, b]) => [`meshes/${f}`, b])));
    ok("Polygon mesh parts written (meshes/*.stl)");
  }
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
  const bom = buildBom(spec, budget, { payloadKg: spec.end_effectors.length ? extractPayload(spec.metadata.source_prompt ?? "") : undefined });
  console.log(bomToMarkdown(bom));
  if (budget !== undefined && !bom.feasible) process.exitCode = 1;
}

function usage() {
  console.log(`text-to-robot -- describe a robot, get a ROS 2 robot

Usage:
  text-to-robot "<prompt>" [-o dir]        generate from a prompt (default ./out/<name>)
  text-to-robot generate "<prompt>" [-o dir]
  text-to-robot modify robot.json "<instruction>" [-o dir]
  text-to-robot bom robot.json [budget_usd]
  text-to-robot validate robot.urdf
  text-to-robot inspect robot.urdf

The prompt (and a modify instruction) must be ONE quoted argument; the output
directory is given only with -o/--out. Extra positional arguments are rejected
rather than guessed at, so 'text-to-robot "6 dof arm" out/arm' is an error.

Prompts are read by a local, deterministic rule-based parser that maps them onto
parameterised design templates (it is not a language model). No account, API key
or network access is used; anything the parser cannot apply is reported as a
"not applied:" or "approximated:" warning.`);
}

/** Positional arguments each command accepts (after the command word): [required, optional]. */
const ARITY: Record<string, { args: [number, number]; usage: string; out: boolean }> = {
  generate: { args: [1, 0], usage: 'generate "<prompt>" [-o dir]', out: true },
  modify: { args: [2, 0], usage: 'modify robot.json "<instruction>" [-o dir]', out: true },
  bom: { args: [1, 1], usage: "bom robot.json [budget_usd]", out: false },
  validate: { args: [1, 0], usage: "validate robot.urdf", out: false },
  inspect: { args: [1, 0], usage: "inspect robot.urdf", out: false },
};

class UsageError extends Error {}

/** Split argv into command, positionals and -o/--out; reject anything ambiguous. */
function parseArgs(argv: string[]): { cmd: string; pos: string[]; outDir?: string } {
  let outDir: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("-")) throw new UsageError(`${a} needs a directory, e.g. ${a} ./out/my_robot`);
      if (outDir !== undefined) throw new UsageError(`${a} given more than once`);
      outDir = v; i++;
    } else if (a.startsWith("--out=")) outDir = a.slice(6);
    else rest.push(a);
  }
  const named = rest[0] in ARITY;
  const cmd = named ? rest[0] : "generate";
  const pos = named ? rest.slice(1) : rest;
  const { args: [req, opt], usage: u, out } = ARITY[cmd];
  if (outDir !== undefined && !out) throw new UsageError(`'${cmd}' does not take -o/--out\n  usage: text-to-robot ${u}`);
  if (pos.length < req) throw new UsageError(`'${cmd}' is missing an argument\n  usage: text-to-robot ${u}`);
  if (pos.length > req + opt) {
    const extra = pos.slice(req + opt).map((x) => JSON.stringify(x)).join(" ");
    const hint = out
      ? `Quote the whole ${cmd === "modify" ? "instruction" : "prompt"} as one argument and pass the output directory with -o, e.g.\n  text-to-robot ${cmd === "modify" ? "modify robot.json " : ""}"${cmd === "modify" ? "make it red" : "a 6 dof arm with a gripper"}" -o ./out/my_robot`
      : `usage: text-to-robot ${u}`;
    throw new UsageError(`unexpected extra argument${pos.length - req - opt > 1 ? "s" : ""} ${extra}\n  ${hint}`);
  }
  return { cmd, pos, outDir };
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "-h" || argv[0] === "--help") { usage(); return; }
  let parsed: ReturnType<typeof parseArgs>;
  try { parsed = parseArgs(argv); }
  catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`${C.r}error:${C.x} ${e.message}\n  (run text-to-robot --help for all commands)`);
    process.exitCode = 2; return;
  }
  const { cmd, pos, outDir } = parsed;
  try {
    if (cmd === "bom") return cmdBom(pos[0], pos[1]);
    if (cmd === "validate") return cmdValidate(pos[0]);
    if (cmd === "inspect") return cmdInspect(pos[0]);
    if (cmd === "modify") return await cmdModify(pos[0], pos[1], outDir);
    return await cmdGenerate(pos[0], outDir);
  } catch (e) {
    bad((e as Error).message);
    process.exitCode = 1;
  }
}
main();
