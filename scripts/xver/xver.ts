// Runs xver-run.ts over every prompt in batches, one process at a time, appending to out/xver/<label>.jsonl (resumable).
//   node out/xver.ts <label> [passes: quick,route,arduino]
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
const only = process.env.XVER_ONLY ? new Set(process.env.XVER_ONLY.split(",").map(Number)) : null;
const label = process.argv[2], passArg = process.argv[3] ?? "quick,route,arduino", list = JSON.parse(readFileSync("out/xver/prompts.json", "utf8")) as { prompt: string }[];
mkdirSync("out/xver", { recursive: true });
const outF = `out/xver/${label}.jsonl`, done = new Set(existsSync(outF) ? readFileSync(outF, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).prompt) : []);
const B = Number(process.env.XVER_BATCH ?? 8), timeout = Number(process.env.XVER_TIMEOUT ?? 0) * 1000 || undefined;
for (let i = 0; i < list.length; i += B) {
  if (list.slice(i, i + B).every((p, k) => done.has(p.prompt) || (only && !only.has(i + k)))) continue;
  const todo = list.slice(i, i + B).map((p, k) => [p, i + k] as const).filter(([p, k]) => !done.has(p.prompt) && (!only || only.has(k)));
  for (const [, k] of !only && todo.length === Math.min(B, list.length - i) ? [[null, -1] as const] : todo) {
    const [a, b] = k < 0 ? [i, i + B] : [k, k + 1];
    const r = spawnSync(process.execPath, ["--max-old-space-size=6144", "out/xver-run.ts", "out/xver/prompts.json", String(a), String(b), outF, passArg], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "ignore", "pipe"], timeout, killSignal: "SIGKILL" });
    console.log(`prompts ${a}-${b - 1}: exit ${r.status}${r.status ? ` ${r.signal} ${(r.stderr ?? "").trim().split("\n").slice(-2).join(" | ").slice(0, 300)}` : ""}`);
  }
}
console.log("xver done");
