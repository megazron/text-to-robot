// In-browser stand-in for apps/api/src/server.ts, used by the static GitHub Pages build.
// It answers the web app's /api/* requests by running the same generator packages locally,
// so the page works with no server. Robots are kept in localStorage; share links carry the
// robot itself (compressed) in the URL fragment because there is no server to look an id up.
import { generateRobot, modifyRobot, finalizeSpec } from "@ttr/robot-generator";
import { generateUrdf, generateXacro } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import { validateSpec, type RobotSpecification } from "@ttr/robot-schema";
import { exportRos2Package } from "@ttr/ros2-export";
import { listTemplates } from "@ttr/robot-templates";
import { buildBom } from "@ttr/components";
import { generateCadFiles } from "@ttr/cad";
import { exportTraining } from "@ttr/training-export";
import { buildPart, toStlBinary, meshTopology } from "@ttr/mesh";
import { providerStatus } from "@ttr/llm-providers";

const STORE_KEY = "ttr.robots";
const MAX_STORE = 50;
const store = new Map<string, RobotSpecification>();
try { for (const [k, v] of JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]")) store.set(k, v); } catch { /* start empty */ }
function remember(id: string, robot: RobotSpecification) {
  store.set(id, robot);
  while (store.size > MAX_STORE) store.delete(store.keys().next().value as string);
  try { localStorage.setItem(STORE_KEY, JSON.stringify([...store])); } catch { /* quota or private mode: memory only */ }
}

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
  if (method === "POST" && p === "/api/robots/import") {
    const { robot } = body;
    if (!robot || !Array.isArray(robot.links) || !Array.isArray(robot.joints)) return json(400, { error: "provide a RobotSpecification JSON" });
    const spec = finalizeSpec(robot as RobotSpecification), validation = validateSpec(spec);
    if (!validation.valid) return json(400, { error: "Invalid robot specification", validation });
    for (const link of spec.links) if (link.geometry.type === "mesh") {
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*\.stl$/i.test(link.geometry.file)) throw new Error("Mesh filenames must be simple STL names");
      if (!meshTopology(buildPart(link.geometry)).closed) throw new Error(`${link.name}: mesh is not a closed volume`);
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

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  try {
    const body = typeof init?.body === "string" && init.body ? JSON.parse(init.body) : {};
    return await handle(method, url.pathname, body);
  } catch (e) {
    return json(400, { error: (e as Error).message });
  }
};

// Share links: the robot travels in the fragment (deflate + base64url), never to any server.
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}
const toB64Url = (b: Uint8Array) => { let s = ""; for (const c of b) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

(globalThis as any).ttrStatic = {
  async shareUrl(robot: RobotSpecification) {
    const packed = await pipe(new TextEncoder().encode(JSON.stringify(robot)), new CompressionStream("deflate-raw"));
    return `${location.origin}${location.pathname}#robot=${toB64Url(packed)}`;
  },
  async sharedRobot(): Promise<RobotSpecification | null> {
    const m = /[#&]robot=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return null;
    return JSON.parse(new TextDecoder().decode(await pipe(fromB64Url(m[1]), new DecompressionStream("deflate-raw"))));
  },
};
