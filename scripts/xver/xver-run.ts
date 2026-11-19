// Cross-version byte identity: one batch of prompts in one process. Prints one JSON line per prompt with the SHA-256 of
// every output (both passes, every export, the Arduino options and their exports, firmware included in cad/).
//   node out/xver-run.ts <prompts.json> <from> <to> <out.jsonl>   (appended synchronously: process.exit drops piped stdout)
import { createHash } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";
const [listFile, from, to, outF, passArg] = process.argv.slice(2);
// each pass in a process of its own, as on the website (the engine worker and the wiring worker)
const passes = (passArg ?? "quick,route,arduino").split(",");
const list: { prompt: string; arduino: boolean }[] = JSON.parse(readFileSync(listFile, "utf8")).slice(Number(from), Number(to));
// a custom Mark 43 shape is forged once (XVER_FORGE_WORKERS helpers, the same code both versions) and kept on disk for the next pass
if (process.env.XVER_FORGE_WORKERS) {
  const { setPool } = await import("../packages/mesh/src/forge/pool.ts"), { nodePool } = await import("../packages/mesh/src/forge/nodepool.ts");
  setPool(nodePool(Number(process.env.XVER_FORGE_WORKERS)));
  const { setArmourCache } = await import("../packages/mesh/src/armourpack.ts"), { mkdirSync, existsSync, writeFileSync } = await import("node:fs");
  const dir = "out/xver/armour", f = (k: string) => `${dir}/${createHash("sha256").update(k).digest("hex").slice(0, 16)}`; mkdirSync(dir, { recursive: true });
  setArmourCache({ async get(k) { return existsSync(f(k) + ".bin") ? { manifest: JSON.parse(readFileSync(f(k) + ".json", "utf8")), bytes: new Uint8Array(readFileSync(f(k) + ".bin")) } : undefined; },
    async put(k, m, b) { writeFileSync(f(k) + ".json", JSON.stringify(m)); writeFileSync(f(k) + ".bin", b); } });
}
const { generateRobot, collectMeshFiles, forgeForRobot, arduinoOptions } = await import("@ttr/robot-generator");
const { setDefaultRouter, circuitFiles } = await import("@ttr/design");
const { generateUrdf, generateXacro } = await import("@ttr/urdf-generator");
const { generateCadFiles } = await import("@ttr/cad");
const { exportRos2Package } = await import("@ttr/ros2-export");
const { exportTraining } = await import("@ttr/training-export");
const canon = (name: string, b: Uint8Array | string) => {
  let t = typeof b === "string" ? b : name.endsWith(".step") || name.endsWith(".json") ? Buffer.from(b).toString("utf8") : null;
  if (t === null) return b;
  t = t.replace(/"created": ?"[^"]*"/g, '"created":""');
  if (name.endsWith(".step")) t = t.replace(/FILE_NAME\('([^']*)','[0-9T:-]+'/, "FILE_NAME('$1',''").replace(/(Open CASCADE STEP translator [0-9.]+) [0-9]+'/, "$1'");
  return t;
};
const sha = (name: string, b: Uint8Array | string) => createHash("sha256").update(canon(name, b)).digest("hex").slice(0, 20);
const meta = (spec: { metadata?: unknown }) => (spec.metadata as { design?: { checks?: unknown; wiring?: Parameters<typeof circuitFiles>[0] } } | undefined)?.design;
for (const { prompt, arduino } of list) {
  const files: Record<string, string> = {}, t0 = Date.now();
  const add = (prefix: string, fs: Record<string, string | Uint8Array>) => { for (const [k, v] of Object.entries(fs)) files[`${prefix}${k}`] = sha(k, v); };
  const exports = async (prefix: string, spec: Parameters<typeof generateUrdf>[0]) => {
    await forgeForRobot(spec);
    add(`${prefix}meshes/`, collectMeshFiles(spec));
    add(`${prefix}cad/`, generateCadFiles(spec));
    add(`${prefix}ros2/`, exportRos2Package(spec, { ros2_control: true }));
    add(`${prefix}training/`, exportTraining(spec));
    const w = meta(spec)?.wiring; if (w) add(`${prefix}circuit/`, circuitFiles(w, spec.robot_name));
  };
  for (const pass of (["quick", "route"] as const).filter((x) => passes.includes(x))) {
    try {
      setDefaultRouter(pass === "quick" ? "legacy" : "3d");
      const r = await generateRobot(prompt), spec = r.robot;
      add(`${pass}/`, { "robot.json": JSON.stringify(spec, null, 2) + "\n", "robot.urdf": generateUrdf(spec), "robot.xacro": generateXacro(spec), "bom.json": JSON.stringify(r.bom, null, 2) + "\n",
        "checks.json": JSON.stringify(meta(spec)?.checks ?? null), "wiring.json": JSON.stringify(meta(spec)?.wiring ?? null),
        "result.json": JSON.stringify({ ...r, robot: undefined, urdf: undefined, xacro: undefined }) });
      if (pass === "quick") add("quick/meshes/", collectMeshFiles(spec));
      else await exports("route/", spec);
    } catch (e) { files[`${pass}/error`] = sha("e", String((e as Error).message)); }
  }
  if (passes.includes("arduino")) try {
    setDefaultRouter("legacy");
    const a = arduinoOptions(prompt);
    add("arduino/", { "options.json": JSON.stringify(a) });
    if (arduino) for (const [i, o] of a.options.entries()) await exports(`arduino/${i}/`, o.robot);
  } catch (e) { files["arduino/error"] = sha("e", String((e as Error).message)); }
  appendFileSync(outF, JSON.stringify({ prompt, s: (Date.now() - t0) / 1000, files }) + "\n");
}
process.exit(0);
