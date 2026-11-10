// The engine of the static GitHub Pages build, run in a Web Worker so designing a robot never freezes the page.
// It answers the web app's /api/* requests with the same generator packages as apps/api/src/server.ts.
// Workers have no localStorage: browser-api.ts hands the saved robots in and writes changes back.
import { wasmPeakMb } from "./wasm-memory.ts";   // first: it watches the kernels' memories from the moment they load
import { generateRobot, modifyRobot, finalizeSpec, arduinoOptions, forgeForPrompt, forgeForRobot } from "@ttr/robot-generator";
import { generateUrdf, generateXacro } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import { validateSpec, type RobotSpecification } from "@ttr/robot-schema";
import { exportRos2Package } from "@ttr/ros2-export";
import { listTemplates } from "@ttr/robot-templates";
import { buildBom } from "@ttr/components";
import { generateCadFiles } from "@ttr/cad";
import { exportTraining } from "@ttr/training-export";
import { buildPart, toStlBinary, meshTopology, setArmourSource, setArmourCache, setForgeListener, type ArmourManifest } from "@ttr/mesh";
import { providerStatus } from "@ttr/llm-providers";
import { engineApi } from "./engine/api.ts";
import { setPool, workerPool } from "@ttr/mesh/forge/pool";
// @ts-expect-error: plain JavaScript module without types
import { safeJsonParse, MAX_PROMPT_CHARS } from "../public/safe.js";

const MAX_STORE = 50;
const store = new Map<string, RobotSpecification>();
function remember(id: string, robot: RobotSpecification) {
  store.set(id, robot);
  while (store.size > MAX_STORE) store.delete(store.keys().next().value as string);
  post({ save: JSON.stringify([...store]) });
}
const post = (m: unknown, t: Transferable[] = []) => (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(m, t);

function encodeFiles(files: Record<string, string | Uint8Array>): Record<string, string | { b64: string }> {
  const out: Record<string, string | { b64: string }> = {};
  for (const [k, v] of Object.entries(files)) {
    if (typeof v === "string") { out[k] = v; continue; }
    let s = ""; for (let i = 0; i < v.length; i += 0x8000) s += String.fromCharCode(...v.subarray(i, i + 0x8000));
    out[k] = { b64: btoa(s) };
  }
  return out;
}
const json = (code: number, body: unknown) => new Response(JSON.stringify(body), { status: code, headers: { "Content-Type": "application/json" } });

async function handle(method: string, p: string, body: any): Promise<Response> {
  if (p.startsWith("/api/engine/")) return engineApi(method, p, body);   // the engine API for other pages (docs/ENGINE_API.md)
  if (method === "POST" && p === "/api/robots/import") {
    const { robot } = body;
    if (!robot || !Array.isArray(robot.links) || !Array.isArray(robot.joints)) return json(400, { error: "provide a RobotSpecification JSON" });
    // a file that is not a robot from here (no metadata, links without geometry) is refused with a reason, not a TypeError
    let spec: RobotSpecification;
    try { spec = finalizeSpec(structuredClone({ ...robot, metadata: robot.metadata ?? { notes: [], inferred_fields: [] } }) as RobotSpecification); }
    catch (e) { return json(400, { error: `This is not a robot file this site can open: ${(e as Error).message}` }); }
    const validation = validateSpec(spec);
    if (!validation.valid) return json(400, { error: "Invalid robot specification", validation });
    for (const link of spec.links) if (link.geometry.type === "mesh") {
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.stl$/i.test(link.geometry.file)) throw new Error("Mesh filenames must be simple STL names");
      // a catalog part comes from our own data by key, not from the imported file (the tier a design just made includes them)
      if (link.geometry.part !== "component" && !meshTopology(buildPart(link.geometry)).closed) throw new Error(`${link.name}: mesh is not a closed volume`);
    }
    const urdf = generateUrdf(spec), urdfValidation = validateUrdf(urdf);
    if (!urdfValidation.valid) return json(400, { error: "Invalid exported URDF", urdfValidation });
    const id = crypto.randomUUID(); remember(id, spec);
    return json(200, { id, robot: spec, urdf, xacro: generateXacro(spec), validation, urdfValidation, bom: buildBom(spec),
      warnings: ["Imported geometry and structure checked; hardware fit and dynamic performance remain unverified."] });
  }
  if (method === "POST" && p === "/api/robots/generate") {
    const result = await generateRobot(String(body.prompt ?? ""));
    const id = crypto.randomUUID(); remember(id, result.robot);
    return json(200, { id, ...result });
  }
  if (method === "POST" && p === "/api/arduino") return json(200, arduinoOptions(String(body.prompt ?? "")));
  if (method === "POST" && p === "/api/robots/modify") {
    const result = await modifyRobot(body.robot as RobotSpecification, String(body.instruction ?? ""));
    const id = crypto.randomUUID(); remember(id, result.robot);
    return json(200, { id, ...result });
  }
  if (method === "POST" && p === "/api/robots/validate") {
    if (body.urdf) return json(200, { urdf: validateUrdf(String(body.urdf)) });
    if (body.robot) return json(200, { spec: validateSpec(body.robot as RobotSpecification) });
    return json(400, { error: "provide 'urdf' or 'robot'" });
  }
  if (method === "POST" && p === "/api/robots/bom") return json(200, { bom: buildBom(body.robot, body.budget !== undefined ? Number(body.budget) : undefined) });
  if (method === "POST" && p === "/api/robots/cad") return json(200, { files: encodeFiles(generateCadFiles(body.robot)) });
  if (method === "POST" && p === "/api/robots/training") return json(200, { files: encodeFiles(exportTraining(body.robot)) });
  if (method === "POST" && p === "/api/robots/export") return json(200, { files: encodeFiles(exportRos2Package(body.robot, { ros2_control: !!body.ros2_control })) });
  if (method === "GET" && p === "/api/templates") return json(200, { templates: listTemplates().map((t) => ({ id: t.id, title: t.title, description: t.description })) });
  if (method === "GET" && p === "/api/status") return json(200, providerStatus());
  const meshMatch = /^\/api\/robots\/([^/]+)\/mesh\/([^/]+)$/.exec(p);
  if (method === "GET" && meshMatch) {
    const robot = store.get(meshMatch[1]); if (!robot) return json(404, { error: "not found" });
    const link = robot.links.find((l) => l.geometry.type === "mesh" && l.geometry.file === decodeURIComponent(meshMatch[2]));
    if (!link || link.geometry.type !== "mesh") return json(404, { error: "no such mesh" });
    return new Response(toStlBinary(buildPart(link.geometry), 1), { headers: { "Content-Type": "model/stl" } });
  }
  if (method === "GET" && p.startsWith("/api/robots/")) {
    const id = p.slice("/api/robots/".length), robot = store.get(id);
    return robot ? json(200, { id, robot, urdf: generateUrdf(robot), xacro: generateXacro(robot) }) : json(404, { error: "not found" });
  }
  return json(404, { error: "unknown endpoint" });
}

// The Mark 43 armour is forged here, in this worker, from the prompt (packages/mesh/src/forge): nothing is fetched. A forged pack is kept in
// IndexedDB, keyed by its shape and the forge's version, so the same suit opens at once next time.
setArmourSource("forge");
const DB = "ttr-armour", STORE = "packs";
const db = (): Promise<IDBDatabase> => new Promise((ok, fail) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
setArmourCache({
  async get(key) {
    try {
      const d = await db(); return await new Promise((ok) => { const q = d.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => ok(q.result ? { manifest: q.result.manifest as ArmourManifest, bytes: new Uint8Array(q.result.bytes) } : undefined); q.onerror = () => ok(undefined); });
    } catch { return undefined; }
  },
  async put(key, manifest, bytes) {
    try { const d = await db(); await new Promise((ok) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).put({ manifest, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, key); t.oncomplete = () => ok(undefined); t.onerror = () => ok(undefined); }); }
    catch { /* private mode or quota: the pack stays in memory only */ }
  },
});
// the forge shares its solid work out to helpers, each a worker with its own manifold-3d (one per spare core, at most four: each takes memory)
const asked = /helpers=(\d+)/.exec((self as { name?: string }).name ?? "")?.[1];
const helpers = asked !== undefined ? Math.min(8, Number(asked)) : Math.max(0, Math.min(4, (navigator.hardwareConcurrency || 2) - 2));
if (helpers) setPool(workerPool(helpers, () => {
  const base = (self as { TTR_ENGINE_BASE?: string }).TTR_ENGINE_BASE ?? location.href;   // set when another site started this worker
  // a worker must come from its page's origin: from another site the helper boots from a blob that imports the script
  const script = new URL("./forge-worker.js", base), same = script.origin === location.origin;
  const w = new Worker(same ? script : URL.createObjectURL(new Blob([`await import(${JSON.stringify(script.href)});`], { type: "text/javascript" })), { type: "module" });
  w.postMessage({ wasm: new URL("./manifold.wasm", base).href });
  return { post: (m) => w.postMessage(m), on: (fn) => { w.onmessage = ({ data }) => fn(data); }, end: () => w.terminate() };
}));
const forgeStart = { t: 0 };
setForgeListener((p) => { if (!forgeStart.t) forgeStart.t = Date.now(); post({ forge: { ...p, elapsed_s: Math.round((Date.now() - forgeStart.t) / 1000) } }); if (p.stage === "done") forgeStart.t = 0; },
  undefined, (parts) => post({ forgePreview: parts }, parts.flatMap((p) => [p.v.buffer, p.f.buffer])));

async function answer(method: string, path: string, text: string): Promise<Response> {
  try {
    // __proto__ / constructor / prototype keys are dropped: request bodies carry robots from files and share links
    const body = text ? safeJsonParse(text, 64 * 1024 * 1024) : {};
    // a robot whose names are not plain identifiers is refused before any generator writes them into a file
    // the parser's time grows faster than the text (about 7 s for 4,000 characters of repeated words); share links replay prompts
    for (const k of ["prompt", "instruction"]) if (typeof body[k] === "string" && body[k].length > MAX_PROMPT_CHARS) return json(400, { error: `the ${k} is longer than ${MAX_PROMPT_CHARS} characters` });
    if (body.robot) { const bad = validateSpec(body.robot).issues.find((i) => /^bad_(robot|joint|link|material)_name$/.test(i.code)); if (bad) return json(400, { error: bad.message }); }
    // a suit's armour must be the one its robot was designed with before anything is exported from it
    if (body.robot) await forgeForRobot(body.robot as RobotSpecification);
    if (path === "/api/arduino" && body.prompt) await forgeForPrompt(String(body.prompt));
    const meshMatch = /^\/api\/robots\/([^/]+)\/mesh\//.exec(path), stored = meshMatch && store.get(meshMatch[1]);
    if (stored) await forgeForRobot(stored);
    return await handle(method, path, body);
  } catch (e) { return json(400, { error: (e as Error).message }); }
}
self.onmessage = async ({ data }: MessageEvent) => {
  if (data.robots) { for (const [k, v] of safeJsonParse(data.robots, 256 * 1024 * 1024)) store.set(k, v); return; }
  const r = await answer(data.method, data.path, data.body), buffer = await r.arrayBuffer();
  post({ id: data.id, status: r.status, type: r.headers.get("Content-Type") ?? "application/json", buffer, wasm_mb: wasmPeakMb() }, [buffer]);
};
post({ ready: true });
