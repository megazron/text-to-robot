import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve("cli/src/index.ts");
const GOOD = resolve("examples/02_arm_6dof/robot.urdf");
const run = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });

test("cli validate: validates (does not generate) and leaves no files behind", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ttr-cli-"));
  const r = run(cwd, "validate", GOOD);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /URDF validation passed/);
  assert.deepEqual(readdirSync(cwd), [], "validate must not write anything");
});
test("cli validate: malformed URDF exits non-zero", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ttr-cli-"));
  writeFileSync(join(cwd, "bad.urdf"), '<robot name="x"><link name="a"></robot>');
  assert.notEqual(run(cwd, "validate", "bad.urdf").status, 0);
});
test("cli generate: default output goes under ./out/<name>/ with the full deliverable", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ttr-cli-"));
  const r = run(cwd, "Create a 3 DOF arm");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const base = join(cwd, "out", "arm_3dof");
  for (const f of ["arm_3dof/package.xml", "arm_3dof/urdf/arm_3dof.urdf.xacro", "arm_3dof/moveit/arm_3dof.srdf", "arm_3dof/worlds/arm_3dof.sdf", "BOM.md", "cad/stl/arm_3dof_assembly.stl", "cad/hardware/enclosure.py", "cad/hardware/example_enclosure.json", "training/train_rl.py", "arm_3dof.json"])
    assert.ok(existsSync(join(base, f)), `missing ${f}`);
  assert.deepEqual(readdirSync(cwd), ["out"], "nothing outside ./out");
});
test("cli inspect prints links and joints", () => {
  const r = run(tmpdir(), "inspect", GOOD);
  assert.equal(r.status, 0); assert.match(r.stdout, /Links/); assert.match(r.stdout, /Joints/);
});
test("cli rejects extra positional arguments and suggests -o", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ttr-cli-"));
  const r = run(cwd, "Create a 3 DOF arm", "out/arm");
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /unexpected extra argument "out\/arm"/);
  assert.match(r.stderr, /-o \.\/out\/my_robot/);
  assert.deepEqual(readdirSync(cwd), [], "nothing written on a usage error");
  const g = run(cwd, "generate", "a", "6", "dof", "arm");
  assert.equal(g.status, 2); assert.match(g.stderr, /Quote the whole prompt/);
  assert.equal(run(cwd, "validate", GOOD, "extra").status, 2);
  assert.match(run(cwd, "inspect", GOOD, "-o", "x").stderr, /does not take -o/);
  assert.match(run(cwd, "Create a 3 DOF arm", "-o").stderr, /-o needs a directory/);
  assert.deepEqual(readdirSync(cwd), []);
});
test("cli -o writes to the given directory and --help documents the argument rules", () => {
  const cwd = mkdtempSync(join(tmpdir(), "ttr-cli-"));
  const r = run(cwd, "Create a 3 DOF arm", "-o", "mine");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(cwd, "mine", "arm_3dof.json")));
  const h = run(cwd, "--help");
  assert.match(h.stdout, /ONE quoted argument/); assert.match(h.stdout, /rule-based parser/);
  assert.doesNotMatch(h.stdout, /OPENAI|ANTHROPIC|cloud mode/i);
});
