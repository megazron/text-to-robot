// In-browser stand-in for apps/api/src/server.ts, used by the static GitHub Pages build. The web app's /api/* requests are
// answered by the same generator packages, running in a Web Worker (browser-engine.ts), so the page stays smooth while a
// robot is designed and opens before the CAD kernels have loaded. Robots are kept in localStorage; share links carry the
// robot itself (compressed) in the URL fragment because there is no server to look an id up.
const STORE_KEY = "ttr.robots";
const realFetch = globalThis.fetch.bind(globalThis);
const engine = new Worker(new URL("./browser-engine.js", document.baseURI), { type: "module" });
const waiting = new Map<number, (r: Response) => void>();
let nextId = 1, started = false;
const queued: unknown[] = [];
const send = (m: unknown) => { if (started) engine.postMessage(m); else queued.push(m); };

engine.onmessage = ({ data }) => {
  if (data.ready) {
    started = true;
    engine.postMessage({ robots: localStorage.getItem(STORE_KEY) ?? "[]" });
    for (const m of queued.splice(0)) engine.postMessage(m);
    return;
  }
  if (data.save) { try { localStorage.setItem(STORE_KEY, data.save); } catch { /* quota or private mode: memory only */ } return; }
  // the armour forge reports while it works: the page shows it (app.js listens)
  if (data.forgePreview) { dispatchEvent(new CustomEvent("ttr-forge-preview", { detail: data.forgePreview })); return; }
  if (data.forge) { (globalThis as any).__ttrForge = data.forge; dispatchEvent(new CustomEvent("ttr-forge", { detail: data.forge })); return; }
  const done = waiting.get(data.id); waiting.delete(data.id);
  done?.(new Response(data.buffer, { status: data.status, headers: { "Content-Type": data.type } }));
};
engine.onerror = (e) => {
  const failed = new Response(JSON.stringify({ error: `The design engine stopped: ${e.message || "out of memory?"} Reload the page to try again.` }), { status: 500, headers: { "Content-Type": "application/json" } });
  for (const done of waiting.values()) done(failed.clone());
  waiting.clear();
};

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const id = nextId++, body = typeof init?.body === "string" ? init.body : "";
  return new Promise<Response>((resolve) => { waiting.set(id, resolve); send({ id, method, path: url.pathname, body }); });
};

// Share links: the robot travels in the fragment (deflate + base64url), never to any server.
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}
const toB64Url = (b: Uint8Array) => { let s = ""; for (const c of b) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

(globalThis as any).ttrStatic = {
  async shareUrl(robot: unknown) {
    const packed = await pipe(new TextEncoder().encode(JSON.stringify(robot)), new CompressionStream("deflate-raw"));
    return `${location.origin}${location.pathname}#robot=${toB64Url(packed)}`;
  },
  async sharedRobot(): Promise<unknown | null> {
    const m = /[#&]robot=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return null;
    return JSON.parse(new TextDecoder().decode(await pipe(fromB64Url(m[1]), new DecompressionStream("deflate-raw"))));
  },
};

// Only now start the app, so its first /api calls come through here. A computed specifier keeps the bundler from inlining it.
const appUrl = new URL("./app.js", document.baseURI).href;
await import(appUrl);
