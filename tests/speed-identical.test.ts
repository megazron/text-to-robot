// The speed-ups change no output. Every prompt is designed and exported four ways, each in a fresh process as a website
// worker is: with no helper pool and no persistent cache; with the parts pool building the routed robot's parts on worker
// threads (and an empty cache, which it fills); with the cache warm (every part and printed solid found, nothing rebuilt);
// and with the pool and the warm cache. Every file must be byte-identical across the four: URDF, xacro, the robot record
// (with its check results and wiring record), BOM, every mesh STL, the CAD package (print STLs, STEP, wiring and circuit
// drawings, the electronics GLB), the ROS 2 and training packages. If anything differs, a speed-up is wrong.
// The quick set runs in `npm test`; TTR_SPEED_FULL=1 runs all 24 examples and a set of open prompts (about an hour).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const examples = readdirSync("examples").filter((d) => /^\d\d_/.test(d)).sort();
const OPEN = ["a robot that waters my plants", "a toaster", "a robot fish", "R2-D2", "a robot that peels potatoes", "a robot hand that can play rock paper scissors", "a 4 DOF arm with a gripper and a wrist camera"];
const FULL = process.env.TTR_SPEED_FULL === "1";
const prompts = FULL ? [...examples.map((e) => readFileSync(`examples/${e}/prompt.txt`, "utf8")), ...OPEN]
  : [...["01_arm_2dof", "09_gripper", "20_quadcopter"].map((e) => readFileSync(`examples/${e}/prompt.txt`, "utf8")), "a toaster"];

const run = (config: "off" | "pool", store: string, ps: string[]) => {
  const r = execFileSync(process.execPath, ["--max-old-space-size=8192", "tests/helpers/speed-run.ts", config, store, ...ps], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "inherit"] });
  return JSON.parse(r.trim().split("\n").at(-1)!) as { store: { hits: number; puts: number } | null; out: Record<string, Record<string, string>> };
};

// the canonical hash speed-run.ts gives a file (the same allowances: the clock in a robot record, a STEP header)
const canonSha = (name: string, b: Buffer) => {
  const t = name.endsWith(".json") || name.endsWith(".urdf") ? b.toString("utf8").replace(/"created": ?"[^"]*"/g, '"created":""') : null;
  return createHash("sha256").update(t ?? b).digest("hex").slice(0, 20);
};
const exampleOf = new Map(examples.map((e) => [readFileSync(`examples/${e}/prompt.txt`, "utf8"), e]));

for (const prompt of prompts) {
  test(`speed-ups change no output: ${prompt.trim().slice(0, 60)}`, { timeout: 3_600_000 }, () => {
    const store = mkdtempSync(join(tmpdir(), "ttr-speed-"));
    try {
      const plain = run("off", "-", [prompt]);
      const pooled = run("pool", store, [prompt]);          // cold cache: fills it
      const warm = run("off", store, [prompt]);             // warm cache
      const warmPooled = run("pool", store, [prompt]);
      assert.ok(pooled.store!.puts > 0, "the cold run kept its results");
      assert.ok(warm.store!.hits > 0 && warm.store!.puts === 0, `the warm run found every result it needed (hits ${warm.store!.hits}, made ${warm.store!.puts})`);
      const want = plain.out[prompt];
      assert.ok(Object.keys(want).length > 20, "every output was hashed");
      for (const [name, got] of [["pool", pooled], ["warm cache", warm], ["pool and warm cache", warmPooled]] as const) {
        const g = got.out[prompt], diff = Object.keys({ ...want, ...g }).filter((k) => want[k] !== g[k]);
        assert.deepEqual(diff, [], `${name}: these outputs differ from the plain run`);
      }
      // and an example's prompt gives the robot, URDF, BOM and meshes that ship in its folder (made before these speed-ups)
      const ex = exampleOf.get(prompt);
      if (ex) {
        const shipped: Record<string, string> = { "route/robot.json": canonSha("robot.json", readFileSync(`examples/${ex}/robot.json`)), "route/robot.urdf": canonSha("robot.urdf", readFileSync(`examples/${ex}/robot.urdf`)), "route/bom.json": canonSha("bom.json", readFileSync(`examples/${ex}/bom.json`)) };
        for (const f of readdirSync(`examples/${ex}/meshes`)) shipped[`route/meshes/${f}`] = canonSha(f, readFileSync(`examples/${ex}/meshes/${f}`));
        const diff = Object.keys(shipped).filter((k) => want[k] !== shipped[k]);
        assert.deepEqual(diff, [], `${ex}: these differ from the files in examples/${ex}`);
      }
    } finally { rmSync(store, { recursive: true, force: true }); }
  });
}
