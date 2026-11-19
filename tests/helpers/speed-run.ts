// One run of the speed-identical test (tests/speed-identical.test.ts) in a process of its own, as each website worker is:
// designs a prompt both ways (wires as straight runs, then the 3D harness), makes every export of the routed robot, and
// prints the SHA-256 of every output file.
//   node tests/helpers/speed-run.ts <config> <store dir or -> <prompt>...
//   config: "off" (no helper pool) or "pool" (the parts pool builds every part of the routed robot on worker threads,
//   with nothing kept in memory, and every export is made from those)
import { createHash } from "node:crypto";

const [config, storeDir, ...prompts] = process.argv.slice(2);
const { useFileStore } = await import("../../scripts/lib/file-store.ts");
const store = storeDir && storeDir !== "-" ? useFileStore(storeDir, "speed-identical") : undefined;
const { clearRemembered, setResultStore } = await import("@ttr/parts/memo");
const { generateRobot, collectMeshFiles, forgeForRobot } = await import("@ttr/robot-generator");
const { setDefaultRouter, circuitFiles } = await import("@ttr/design");
const { generateUrdf, generateXacro } = await import("@ttr/urdf-generator");
const { generateCadFiles } = await import("@ttr/cad");
const { exportRos2Package } = await import("@ttr/ros2-export");
const { exportTraining } = await import("@ttr/training-export");
const { prefetchParts, setMinParts } = await import("@ttr/mesh/parts-pool");
setMinParts(2);   // the pool builds every part it can here, however few
const pool = config === "pool" ? (await import("@ttr/mesh/parts-pool/node")).nodePartsPool(3) : undefined;

/** what may differ between two runs of the same engine: the clock in a robot's record and a STEP file's header (its time,
 *  and the translator's count of the models written in that process). The same allowances as scripts/check_site.py. */
const canon = (name: string, b: Uint8Array | string) => {
  let t = typeof b === "string" ? b : name.endsWith(".step") || name.endsWith(".json") ? Buffer.from(b).toString("utf8") : null;
  if (t === null) return b;
  t = t.replace(/"created": ?"[^"]*"/g, '"created":""');
  if (name.endsWith(".step")) t = t.replace(/FILE_NAME\('([^']*)','[0-9T:-]+'/, "FILE_NAME('$1',''").replace(/(Open CASCADE STEP translator [0-9.]+) [0-9]+'/, "$1'");
  return t;
};
export const sha = (name: string, b: Uint8Array | string) => createHash("sha256").update(canon(name, b)).digest("hex").slice(0, 20);
const out: Record<string, Record<string, string>> = {};
for (const prompt of prompts) {
  const files: Record<string, string> = {};
  const add = (prefix: string, fs: Record<string, string | Uint8Array>) => { for (const [k, v] of Object.entries(fs)) files[`${prefix}${k}`] = sha(k, v); };
  for (const pass of ["quick", "route"] as const) {
    setDefaultRouter(pass === "quick" ? "legacy" : "3d");
    const r = await generateRobot(prompt);
    const spec = r.robot;
    // (robot.json, robot.urdf, bom.json and meshes/ in the form an example folder holds them: scripts/build_examples.ts)
    add(`${pass}/`, { "robot.json": JSON.stringify(spec, null, 2) + "\n", "robot.urdf": generateUrdf(spec), "robot.xacro": generateXacro(spec), "bom.json": JSON.stringify(r.bom, null, 2) + "\n",
      "checks.json": JSON.stringify((spec.metadata as { design?: { checks?: unknown } }).design?.checks ?? null),
      "wiring.json": JSON.stringify((spec.metadata as { design?: { wiring?: unknown } }).design?.wiring ?? null),
      "result.json": JSON.stringify({ ...r, robot: undefined, urdf: undefined, xacro: undefined }) });
    if (pass === "quick") { add("quick/meshes/", collectMeshFiles(spec)); continue; }
    // the routed robot's exports, as the engine worker makes them after adopting it
    // (pool: nothing kept anywhere, so the helpers build every part and the exports are made from what they built)
    if (pool) { setResultStore(undefined); clearRemembered(); const p = await prefetchParts(spec, pool); setResultStore(store); if (!p.built) throw new Error("the pool built nothing"); }
    await forgeForRobot(spec);
    add("route/meshes/", collectMeshFiles(spec));
    add("route/cad/", generateCadFiles(spec));
    add("route/ros2/", exportRos2Package(spec, { ros2_control: true }));
    add("route/training/", exportTraining(spec));
    const w = (spec.metadata as { design?: { wiring?: Parameters<typeof circuitFiles>[0] } }).design?.wiring;
    if (w) add("route/circuit/", circuitFiles(w, spec.robot_name));
  }
  out[prompt] = files;
}
pool?.close();
console.log(JSON.stringify({ config, store: store ? store.stats : null, out }));
process.exit(0);
