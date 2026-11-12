// Shared test helpers: a tiny PNG and WebP, a recipe, and a Miniflare instance running the real Worker on a local D1.
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";

export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
export const WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");
const b64url = (s) => Buffer.from(s).toString("base64url");
export const recipe = (p = "Create a 4 DOF robotic arm", extra = {}) => `make=${b64url(JSON.stringify({ p, ...extra }))}`;

// Cloudflare's documented Turnstile test secrets (developers.cloudflare.com/turnstile/troubleshooting/testing/)
export const PASS_SECRET = "1x0000000000000000000000000000000AA";
export const FAIL_SECRET = "2x0000000000000000000000000000000AA";
export const ADMIN = "a".repeat(20) + "-test-admin-token-0123456789";

export function post(over = {}) {
  return { title: "Desk arm", description: "A small arm.", product: "text-to-robot", recipe: recipe(), tags: ["arm"], thumbnail: PNG.toString("base64"), turnstile: "XXXX.DUMMY.TOKEN.XXXX", ...over };
}

/** Answers siteverify the way Cloudflare answers for its test secrets, without the network. */
export async function fakeSiteverify(request) {
  const form = await request.formData();
  const secret = form.get("secret");
  const token = String(form.get("response") ?? "");
  const ok = secret === PASS_SECRET && !!token;
  // a token "act:<action>@<host>" stands for one the widget made for that action on that site
  const m = /^act:([a-z]*)@(.*)$/.exec(token);
  return Response.json(ok ? { success: true, "error-codes": [], action: m ? m[1] : "", hostname: m ? m[2] : "localhost" } : { success: false, "error-codes": secret === FAIL_SECRET ? ["invalid-input-response"] : ["invalid-input-secret"] });
}

export async function startWorker({ secret = PASS_SECRET, admin = ADMIN, vars = {} } = {}) {
  const calls = [];
  const mf = new Miniflare({
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: new URL("../src/index.js", import.meta.url).pathname,
    modulesRoot: new URL("../src", import.meta.url).pathname,
    compatibilityDate: "2025-09-01",
    d1Databases: ["DB"],
    kvNamespaces: ["RATE"],
    bindings: { ALLOWED_ORIGINS: "https://megazron.github.io", TURNSTILE_SECRET: secret, ADMIN_TOKEN: admin, ...vars },
    outboundService: async (request) => {
      calls.push(request.url);
      if (request.url.startsWith("https://challenges.cloudflare.com/turnstile/v0/siteverify")) return fakeSiteverify(request);
      return new Response("no network in tests", { status: 599 });
    },
  });
  const db = await mf.getD1Database("DB");
  const sql = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  await db.batch(sql.split(";").map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)));
  let ip = 1;
  const api = async (path, { method = "GET", body, headers = {}, from } = {}) => {
    const r = await mf.dispatchFetch(`http://community.test${path}`, {
      method,
      headers: { "CF-Connecting-IP": from ?? `203.0.113.${ip}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const type = r.headers.get("Content-Type") ?? "";
    return { status: r.status, headers: r.headers, data: type.includes("json") ? await r.json() : await r.arrayBuffer() };
  };
  return { mf, db, api, calls, newVisitor: () => { ip++; }, close: () => mf.dispose() };
}
