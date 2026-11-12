import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { generateUrdf, generateXacro } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import { validateSpec, type RobotSpecification } from "@ttr/robot-schema";
import { listTemplates } from "@ttr/robot-templates";
import { buildBom } from "@ttr/components";
import { providerStatus } from "@ttr/llm-providers";
import { EnginePool, EngineError } from "./pool.ts";
import { motionApi } from "../../web/src/engine/motion.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "..", "..", "web", "public");
const PORT = Number(process.env.PORT ?? 8787);
// Loopback only unless asked (HOST=0.0.0.0 in the Docker image): the API runs whatever a request asks of the generator.
const HOST = process.env.HOST ?? "127.0.0.1";
// Browsers on other sites may call this API only from origins listed in TTR_CORS_ORIGINS (comma separated); the web UI is same-origin.
const CORS = new Set((process.env.TTR_CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const SECURITY_HEADERS = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY", "Cross-Origin-Opener-Policy": "same-origin" };
const originOf = new WeakMap<ServerResponse, string | undefined>();
const DATA_DIR = process.env.TTR_DATA_DIR ?? join(__dirname, "..", "..", "..", "data");
const STORE_FILE = join(DATA_DIR, "robots.json");
const store = new Map<string, RobotSpecification>();
// designing, exporting and meshing run in a worker thread that is replaced before its CAD kernel runs out of memory
const engine = new EnginePool();

try { if (existsSync(STORE_FILE)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(STORE_FILE, "utf8")))) store.set(k, v as RobotSpecification); } catch { /* start empty */ }
let persistTimer: NodeJS.Timeout | null = null;
function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    try { await mkdir(DATA_DIR, { recursive: true }); await writeFile(STORE_FILE, JSON.stringify(Object.fromEntries(store))); } catch { /* best effort */ }
  }, 300);
}
const MAX_STORE = Number(process.env.TTR_MAX_ROBOTS ?? 5000);
function remember(id: string, robot: RobotSpecification) {
  store.set(id, robot);
  if (store.size > MAX_STORE) { const first = store.keys().next().value; if (first) store.delete(first); }
  persist();
}

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".png": "image/png", ".webmanifest": "application/manifest+json" };

/** files maps may hold binary (meshes); encode those as {b64} for JSON transport */
function encodeFiles(files: Record<string, string | Uint8Array>): Record<string, string | { b64: string }> {
  const out: Record<string, string | { b64: string }> = {};
  for (const [k, v] of Object.entries(files)) out[k] = typeof v === "string" ? v : { b64: Buffer.from(v).toString("base64") };
  return out;
}
function json(res: ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body);
  const o = originOf.get(res), cors = o && CORS.has(o) ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", Vary: "Origin" } : {};
  res.writeHead(code, { "Content-Type": "application/json", ...SECURITY_HEADERS, ...cors });
  res.end(s);
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = ""; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > 9_000_000) { reject(new Error("payload too large")); req.destroy(); } data += c; });
    req.on("end", () => { try { resolve(data ? JSON.parse(data, (k, v) => (k === "__proto__" || k === "constructor" || k === "prototype" ? undefined : v)) : {}); } catch { reject(new Error("invalid JSON body")); } });
    req.on("error", reject);
  });
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  let path = (req.url ?? "/").split("?")[0];
  if (path === "/") path = "/index.html";
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, "");
  const file = join(WEB_ROOT, safe);
  if (!file.startsWith(WEB_ROOT)) { json(res, 403, { error: "forbidden" }); return true; }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", ...SECURITY_HEADERS });
    res.end(buf);
    return true;
  } catch { return false; }
}

const server = createServer(async (req, res) => {
  const requestOrigin = req.headers.origin; originOf.set(res, requestOrigin);
  // DNS rebinding: a page on evil.example resolved to 127.0.0.1 sends Host: evil.example; only local names (or the bound host) are served
  const host = String(req.headers.host ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (HOST === "127.0.0.1" && !["localhost", "127.0.0.1", "::1"].includes(host)) { json(res, 421, { error: "this server answers on localhost only" }); return; }
  // a cross-site POST from a page that is not allowed is refused before anything runs (the browser would only hide the answer)
  if (req.method !== "GET" && requestOrigin && !CORS.has(requestOrigin) && requestOrigin !== `http://${req.headers.host}`) { json(res, 403, { error: "cross-origin requests are not allowed (set TTR_CORS_ORIGINS)" }); return; }
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const p = url.pathname;
  if (req.method === "OPTIONS") { json(res, 204, {}); return; }

  try {
    // motions, posing and their files (the same answers the site's engine worker gives)
    if (req.method === "POST" && p.startsWith("/api/engine/")) {
      const r = motionApi(p.slice("/api/engine/".length), await readBody(req));
      if (r) { res.writeHead(r.status, { "Content-Type": "application/json" }); res.end(Buffer.from(await r.arrayBuffer())); return; }
    }
    if (req.method === "POST" && p === "/api/robots/import") {
      const { robot } = await readBody(req);
      const result = await engine.call<{ robot: RobotSpecification }>("import", { robot });
      const id = randomUUID(); remember(id, result.robot);
      return json(res, 200, { id, ...result });
    }
    if (req.method === "POST" && p === "/api/robots/generate") {
      const { prompt } = await readBody(req);
      const result = await engine.call<{ robot: RobotSpecification }>("generate", { prompt });
      const id = randomUUID(); remember(id, result.robot);
      return json(res, 200, { id, ...result });
    }
    if (req.method === "POST" && p === "/api/arduino") {
      const { prompt } = await readBody(req);
      return json(res, 200, await engine.call("arduino", { prompt }));
    }
    if (req.method === "POST" && p === "/api/robots/modify") {
      const { robot, instruction } = await readBody(req);
      const result = await engine.call<{ robot: RobotSpecification }>("modify", { robot, instruction });
      const id = randomUUID(); remember(id, result.robot);
      return json(res, 200, { id, ...result });
    }
    if (req.method === "POST" && p === "/api/robots/validate") {
      const body = await readBody(req);
      if (body.urdf) return json(res, 200, { urdf: validateUrdf(String(body.urdf)) });
      if (body.robot) return json(res, 200, { spec: validateSpec(body.robot as RobotSpecification) });
      return json(res, 400, { error: "provide 'urdf' or 'robot'" });
    }
    if (req.method === "POST" && p === "/api/robots/bom") {
      const { robot, budget } = await readBody(req);
      return json(res, 200, { bom: buildBom(robot as RobotSpecification, budget !== undefined ? Number(budget) : undefined) });
    }
    if (req.method === "POST" && p === "/api/robots/cad") {
      const { robot } = await readBody(req);
      return json(res, 200, { files: encodeFiles(await engine.call("cad", { robot })) });
    }
    if (req.method === "POST" && p === "/api/robots/training") {
      const { robot } = await readBody(req);
      return json(res, 200, { files: encodeFiles(await engine.call("training", { robot })) });
    }
    if (req.method === "POST" && p === "/api/robots/export") {
      const { robot, ros2_control } = await readBody(req);
      return json(res, 200, { files: encodeFiles(await engine.call("export", { robot, ros2_control })) });
    }
    if (req.method === "GET" && p === "/api/templates") return json(res, 200, { templates: listTemplates().map((t) => ({ id: t.id, title: t.title, description: t.description })) });
    if (req.method === "GET" && p === "/api/status") return json(res, 200, { ...providerStatus(), engine: { recycles: engine.recycles, wasm_mb: engine.wasmMb } });
    // polygon mesh part of a stored robot: regenerated deterministically from its recipe
    const meshMatch = p.match(/^\/api\/robots\/([0-9a-f-]+)\/mesh\/([A-Za-z0-9_.-]+)$/i);
    if (req.method === "GET" && meshMatch) {
      const robot = store.get(meshMatch[1]); if (!robot) return json(res, 404, { error: "not found" });
      const link = robot.links.find((l) => l.geometry.type === "mesh" && l.geometry.file === meshMatch[2]);
      if (!link || link.geometry.type !== "mesh") return json(res, 404, { error: "no such mesh" });
      const stl = await engine.call<Uint8Array>("mesh", { robot, geometry: link.geometry });
      res.writeHead(200, { "Content-Type": "model/stl", "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" });
      return res.end(Buffer.from(stl));
    }
    if (req.method === "GET" && p.startsWith("/api/robots/")) {
      const id = p.slice("/api/robots/".length);
      const robot = store.get(id);
      return robot ? json(res, 200, { id, robot, urdf: generateUrdf(robot), xacro: generateXacro(robot) }) : json(res, 404, { error: "not found" });
    }
    if (p.startsWith("/api/")) return json(res, 404, { error: "unknown endpoint" });

    // shareable robot link: /r/<id> serves the app, which loads the robot by id
    if (req.method === "GET" && p.startsWith("/r/")) { req.url = "/index.html"; if (await serveStatic(req, res)) return; }
    // static web app
    if (req.method === "GET") { if (await serveStatic(req, res)) return; }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    return json(res, e instanceof EngineError ? e.status : 400, { error: (e as Error).message, ...(e instanceof EngineError ? e.extra : {}) });
  }
});

server.listen(PORT, HOST, () => {
  const st = providerStatus();
  const address=server.address();const port=address && typeof address!=="string" ? address.port : PORT;
  console.log(`text-to-robot API on http://localhost:${port}  (generation: ${st.mode}, no external inference)`);
  console.log(`web UI:  http://localhost:${port}/`);
});
