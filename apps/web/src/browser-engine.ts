// The engine of the static GitHub Pages build, run in a Web Worker so designing a robot never freezes the page.
// It answers the web app's /api/* requests with the same generator packages as apps/api/src/server.ts.
// Workers have no localStorage: browser-api.ts hands the saved robots in and writes changes back.
import { generateRobot, modifyRobot, finalizeSpec, arduinoOptions } from "@ttr/robot-generator";
import { generateUrdf, generateXacro } from "@ttr/urdf-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import { validateSpec, type RobotSpecification } from "@ttr/robot-schema";
import { exportRos2Package } from "@ttr/ros2-export";
import { listTemplates } from "@ttr/robot-templates";
import { buildBom } from "@ttr/components";
import { generateCadFiles } from "@ttr/cad";
import { exportTraining } from "@ttr/training-export";
import { buildPart, toStlBinary, meshTopology, setArmourPack, armourPackLoaded, type ArmourManifest } from "@ttr/mesh";
import { providerStatus } from "@ttr/llm-providers";

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

/** The Mark 43 shells are about 10 MB: fetched only when a design needs them. */
async function loadArmour() {
  if (armourPackLoaded()) return;
  const [m, b] = await Promise.all([fetch(new URL("mark43_pack.json", location.href)), fetch(new URL("mark43_pack.bin", location.href))]);
  if (m.ok && b.ok) setArmourPack((await m.json()) as ArmourManifest, new Uint8Array(await b.arrayBuffer()));
}
async function answer(method: string, path: string, text: string): Promise<Response> {
  try {
    const body = text ? JSON.parse(text) : {};
    if (/iron|mark\s*\d|armou?r|exo|suit|helmet/i.test(text)) await loadArmour();
    try { return await handle(method, path, body); }
    catch (e) { if (armourPackLoaded() || !/mark43_pack/.test(String(e))) throw e; await loadArmour(); return await handle(method, path, body); }
  } catch (e) { return json(400, { error: (e as Error).message }); }
}
self.onmessage = async ({ data }: MessageEvent) => {
  if (data.robots) { for (const [k, v] of JSON.parse(data.robots)) store.set(k, v); return; }
  const r = await answer(data.method, data.path, data.body), buffer = await r.arrayBuffer();
  post({ id: data.id, status: r.status, type: r.headers.get("Content-Type") ?? "application/json", buffer }, [buffer]);
};
post({ ready: true });
