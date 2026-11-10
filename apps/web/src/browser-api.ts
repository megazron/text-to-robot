// In-browser stand-in for apps/api/src/server.ts, used by the static GitHub Pages build. The web app's /api/* requests are
// answered by the same generator packages, running in a Web Worker (browser-engine.ts), so the page stays smooth while a
// robot is designed and opens before the CAD kernels have loaded. Robots are kept in localStorage; share links carry the
// robot itself (compressed) in the URL fragment because there is no server to look an id up.
// @ts-expect-error: plain JavaScript module without types (apps/web/public/safe.js, shared with app.js)
import { inflateCapped, safeJsonParse, scriptUrl, MAX_HASH_CHARS } from "../public/safe.js";
const STORE_KEY = "ttr.robots";
const realFetch = globalThis.fetch.bind(globalThis);
// ?helpers=N caps the armour forge's helper workers (each one a core and its own memory); the default is one per spare core, at most four
const helpersAsked = new URLSearchParams(location.search).get("helpers");
// The CAD kernel keeps some memory after every design (manifold-3d 3.5.4, see wasm-memory.ts) and aborts when a memory reaches
// 4 GB. A worker past RECYCLE_MB is replaced by a fresh one while nothing is waiting; a worker that aborts or dies is replaced at
// once and the requests it held are sent again, once each. Saved robots and forged armour (IndexedDB) carry over.
const RECYCLE_MB = 1800;
const KERNEL_DIED = /Aborted\(|out of bounds|RuntimeError|unreachable|memory access|design engine stopped/i;
interface Pending { msg: { id: number; method: string; path: string; body: string }; done: (r: Response) => void; retried: boolean }
const waiting = new Map<number, Pending>();
let nextId = 1, started = false, engine: Worker, robots = localStorage.getItem(STORE_KEY) ?? "[]", recycles = 0, failedStarts = 0;
const queued: unknown[] = [];
const send = (m: unknown) => { if (started) engine.postMessage(m); else queued.push(m); };

function startEngine() {
  started = false;
  engine = new Worker(scriptUrl(new URL("./browser-engine.js", document.baseURI)), { type: "module", ...(helpersAsked ? { name: `helpers=${Number(helpersAsked)}` } : {}) });
  engine.onmessage = async ({ data }) => {
    if (data.ready) {
      started = true; failedStarts = 0;
      engine.postMessage({ robots });
      engine.postMessage({ reading: readingSettings() });
      for (const m of queued.splice(0)) engine.postMessage(m);
      return;
    }
    if (data.reading) { dispatchEvent(new CustomEvent("ttr-reading", { detail: data.reading })); return; }
    if (data.save) { robots = data.save; try { localStorage.setItem(STORE_KEY, data.save); } catch { /* quota or private mode: this tab keeps them */ } return; }
    // the armour forge reports while it works: the page shows it (app.js listens)
    if (data.forgePreview) { dispatchEvent(new CustomEvent("ttr-forge-preview", { detail: data.forgePreview })); return; }
    if (data.forge) { (globalThis as any).__ttrForge = data.forge; dispatchEvent(new CustomEvent("ttr-forge", { detail: data.forge })); return; }
    const p = waiting.get(data.id); if (!p) return;
    const r = new Response(data.buffer, { status: data.status, headers: { "Content-Type": data.type } });
    if (r.status >= 400 && !p.retried && KERNEL_DIED.test(await r.clone().text())) { restartEngine(); return; }
    waiting.delete(data.id); (globalThis as any).__ttrWasmMb = data.wasm_mb;
    p.done(r);
    if (data.wasm_mb > RECYCLE_MB && waiting.size === 0) { recycles++; engine.terminate(); startEngine(); }
  };
  engine.onerror = (e) => {
    // a worker that cannot even start (blocked, no WebAssembly) is not started again and again
    if (!started && ++failedStarts > 1) {
      const failed = new Response(JSON.stringify({ error: `The design engine stopped: ${e.message || "out of memory?"} Reload the page to try again.` }), { status: 500, headers: { "Content-Type": "application/json" } });
      for (const p of waiting.values()) p.done(failed.clone());
      waiting.clear(); return;
    }
    restartEngine();
  };
}
/** The kernel aborted or the worker died: a fresh worker takes over every request still waiting (each is tried twice at most). */
function restartEngine() {
  recycles++; engine.terminate(); queued.length = 0; startEngine();
  for (const [id, p] of [...waiting]) {
    if (p.retried) {
      waiting.delete(id);
      p.done(new Response(JSON.stringify({ error: "The design engine ran out of memory twice on this request. Reload the page to try again." }), { status: 500, headers: { "Content-Type": "application/json" } }));
    } else { p.retried = true; send(p.msg); }
  }
}
startEngine();
(globalThis as any).ttrEngineRecycles = () => recycles;

// Reading settings (app.js edits them): the sentence model on or off, and a bring-your-own-key model. The key is kept in
// sessionStorage, or in localStorage if the visitor asks this device to remember it; it goes to the engine worker in this
// tab and from there only to the provider chosen. It is never put in a robot, a share link or a download.
const READING_KEY = "ttr.reading";
function readingSettings() {
  try { return JSON.parse(sessionStorage.getItem(READING_KEY) ?? localStorage.getItem(READING_KEY) ?? "{}"); } catch { return {}; }
}
(globalThis as any).ttrReading = {
  get: readingSettings,
  set(r: { embeddings?: boolean; model?: unknown; remember?: boolean }) {
    const text = JSON.stringify(r);
    try { if (r.remember) { localStorage.setItem(READING_KEY, text); sessionStorage.removeItem(READING_KEY); } else { sessionStorage.setItem(READING_KEY, text); localStorage.removeItem(READING_KEY); } } catch { /* private mode: this tab only */ }
    send({ reading: r });
  },
};

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const id = nextId++, body = typeof init?.body === "string" ? init.body : "", msg = { id, method, path: url.pathname, body };
  return new Promise<Response>((resolve) => { waiting.set(id, { msg, done: resolve, retried: false }); send(msg); });
};

// Share links: the robot travels in the fragment (deflate + base64url), never to any server.
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}
const toB64Url = (b: Uint8Array) => { let s = ""; for (const c of b) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64Url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

(globalThis as any).ttrStatic = {
  /** stop a Mark 43 forge that is running */
  cancelForge() { send({ cancelForge: true }); },
  async shareUrl(robot: unknown) {
    const packed = await pipe(new TextEncoder().encode(JSON.stringify(robot)), new CompressionStream("deflate-raw"));
    return `${location.origin}${location.pathname}#robot=${toB64Url(packed)}`;
  },
  async sharedRobot(): Promise<unknown | null> {
    // the fragment is attacker-chosen (anyone can send a link): its length, its unpacked size and its keys are all capped
    if (location.hash.length > MAX_HASH_CHARS) throw new Error("the shared link is too long");
    const m = /[#&]robot=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return null;
    return safeJsonParse(new TextDecoder().decode(await inflateCapped(fromB64Url(m[1]), "deflate-raw")));
  },
};

// Only now start the app, so its first /api calls come through here. A computed specifier keeps the bundler from inlining it.
const appUrl = new URL("./app.js", document.baseURI).href;
await import(appUrl);
