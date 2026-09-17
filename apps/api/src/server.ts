import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { generateRobot, modifyRobot } from "@ttr/robot-generator";
import { validateUrdf } from "@ttr/urdf-validator";
import { validateSpec, type RobotSpecification } from "@ttr/robot-schema";
import { exportRos2Package } from "@ttr/ros2-export";
import { listTemplates } from "@ttr/robot-templates";
import { providerStatus } from "@ttr/llm-providers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, "..", "..", "web", "public");
const PORT = Number(process.env.PORT ?? 8787);
const store = new Map<string, RobotSpecification>();

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function json(res: ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
  res.end(s);
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = ""; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > 4_000_000) { reject(new Error("payload too large")); req.destroy(); } data += c; });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error("invalid JSON body")); } });
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
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(buf);
    return true;
  } catch { return false; }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const p = url.pathname;
  if (req.method === "OPTIONS") { json(res, 204, {}); return; }

  try {
    if (req.method === "POST" && p === "/api/robots/generate") {
      const { prompt } = await readBody(req);
      const result = await generateRobot(String(prompt ?? ""));
      const id = randomUUID(); store.set(id, result.robot);
      return json(res, 200, { id, ...result });
    }
    if (req.method === "POST" && p === "/api/robots/modify") {
      const { robot, instruction } = await readBody(req);
      const result = await modifyRobot(robot as RobotSpecification, String(instruction ?? ""));
      const id = randomUUID(); store.set(id, result.robot);
      return json(res, 200, { id, ...result });
    }
    if (req.method === "POST" && p === "/api/robots/validate") {
      const body = await readBody(req);
      if (body.urdf) return json(res, 200, { urdf: validateUrdf(String(body.urdf)) });
      if (body.robot) return json(res, 200, { spec: validateSpec(body.robot as RobotSpecification) });
      return json(res, 400, { error: "provide 'urdf' or 'robot'" });
    }
    if (req.method === "POST" && p === "/api/robots/export") {
      const { robot, ros2_control } = await readBody(req);
      return json(res, 200, { files: exportRos2Package(robot as RobotSpecification, { ros2_control: !!ros2_control }) });
    }
    if (req.method === "GET" && p === "/api/templates") return json(res, 200, { templates: listTemplates().map((t) => ({ id: t.id, title: t.title, description: t.description })) });
    if (req.method === "GET" && p === "/api/status") return json(res, 200, providerStatus());
    if (req.method === "GET" && p.startsWith("/api/robots/")) {
      const id = p.slice("/api/robots/".length);
      const robot = store.get(id);
      return robot ? json(res, 200, { id, robot }) : json(res, 404, { error: "not found" });
    }
    if (p.startsWith("/api/")) return json(res, 404, { error: "unknown endpoint" });

    // static web app
    if (req.method === "GET") { if (await serveStatic(req, res)) return; }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    return json(res, 400, { error: (e as Error).message });
  }
});

server.listen(PORT, () => {
  const st = providerStatus();
  console.log(`text-to-robot API on http://localhost:${PORT}  (LLM mode: ${st.mode})`);
  console.log(`web UI:  http://localhost:${PORT}/`);
});
