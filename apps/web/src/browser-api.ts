// In-browser stand-in for apps/api/src/server.ts, used by the static GitHub Pages build. The web app's /api/* requests are
// answered by the same generator packages, running in a Web Worker (browser-engine.ts), so the page stays smooth while a
// robot is designed and opens before the CAD kernels have loaded. Robots are kept in localStorage; share links carry the
// robot itself (compressed) in the URL fragment because there is no server to look an id up.
// @ts-expect-error: plain JavaScript module without types (apps/web/public/safe.js, shared with app.js)
import { inflateCapped, safeJsonParse, scriptUrl, MAX_HASH_CHARS } from "../public/safe.js";
import { devicePlan, backedOff, underPressure, tabMemoryPressure, onLowBattery, wasmSimd, type DevicePlan } from "./device.ts";
const STORE_KEY = "ttr.robots";
const realFetch = globalThis.fetch.bind(globalThis);
// How many workers this device runs at once, from its cores, its memory and whether it is a phone (device.ts). The engine is
// one; the 3D harness pass a second; what is left helps the armour forge. ?helpers=N caps the forge's helpers, ?workers=N the whole.
const query = new URLSearchParams(location.search), helpersAsked = query.get("helpers");
let plan: DevicePlan = devicePlan(navigator, globalThis.matchMedia?.bind(globalThis), query.get("workers"));
// on battery and low: the light schedule too (no spare worker, nothing while the page is hidden)
void onLowBattery().then((low) => { if (low && !plan.light) plan = { ...plan, light: true, reason: [...plan.reason, "low battery: light schedule"] }; });
const helpersFor = (p: DevicePlan) => helpersAsked !== null ? Math.min(8, Number(helpersAsked)) : Math.max(0, Math.min(4, p.workers - 2));
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
  engine = new Worker(scriptUrl(new URL("./browser-engine.js", document.baseURI)), { type: "module", name: `helpers=${helpersFor(plan)}${query.has("nocache") ? " nocache" : ""}` });
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
    if (data.stored) { storedAck(data.stored); return; }
    if (data.allStored) { allStored.get(data.allStored)?.(); allStored.delete(data.allStored); return; }
    const p = waiting.get(data.id); if (!p) return;
    const r = new Response(data.buffer, { status: data.status, headers: { "Content-Type": data.type } });
    if (r.status >= 400 && !p.retried && KERNEL_DIED.test(await r.clone().text())) { restartEngine(); return; }
    waiting.delete(data.id); (globalThis as any).__ttrWasmMb = data.wasm_mb;
    if (data.took) { took.push({ path: p.msg.path, ...data.took }); if (took.length > 64) took.shift(); if (p.msg.path === "/api/robots/generate") { lastTook.generate = data.took; lastTook.mesh = undefined; } else if (/\/mesh\//.test(p.msg.path) && !lastTook.mesh) lastTook.mesh = data.took; }
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
/** The kernel aborted or the worker died: a fresh worker takes over every request still waiting (each is tried twice at most).
 *  A worker that died is taken as memory running short: from now on this tab runs one worker fewer (never fewer than one). */
function restartEngine() {
  recycles++; engine.terminate(); queued.length = 0; plan = backedOff(plan, "a worker ran out of memory"); startEngine();
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
// The sentence model is on by default where the device can take it (4+ cores, 4+ GB): it is served by this site and loaded
// only when a prompt needs it. Counts and structure never depend on it.
const capable = () => (navigator.hardwareConcurrency ?? 2) >= 4 && ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) >= 4;
function readingSettings() {
  let r: Record<string, unknown> = {};
  try { r = JSON.parse(sessionStorage.getItem(READING_KEY) ?? localStorage.getItem(READING_KEY) ?? "{}"); } catch { /* defaults */ }
  return { embeddings: capable(), ...r };
}
(globalThis as any).ttrReading = {
  get: readingSettings,
  set(r: { embeddings?: boolean; model?: unknown; remember?: boolean }) {
    const text = JSON.stringify(r);
    try { if (r.remember) { localStorage.setItem(READING_KEY, text); sessionStorage.removeItem(READING_KEY); } else { sessionStorage.setItem(READING_KEY, text); localStorage.removeItem(READING_KEY); } } catch { /* private mode: this tab only */ }
    send({ reading: r });
  },
};

// The 3D harness of a robot already on screen (generate with route: true) is laid in a worker of its own, so the next
// robot never waits behind it: one pass at a time, a newer one ends the older (terminate stops it mid-route), and the
// worker ends when it answers, its kernels' memory with it. The routed robot is handed to the engine above, which serves
// its meshes and keeps the saved robots; this worker's own store is thrown away.
// It starts once the engine has put the first pass's results in the cache (it finds every part there instead of building
// it again). A device that runs one worker lays it in the engine itself, after the robot; a phone (the light plan) waits
// while the page is hidden, so a pocketed phone does not work through the harness on its battery.
let router: Worker | null = null, routing: { id: number; done: (r: Response) => void } | null = null;
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const stored = new Map<number, () => void>(), storedIds = new Set<number>();
function storedAck(id: number) { storedIds.add(id); if (storedIds.size > 64) storedIds.delete(storedIds.values().next().value as number); stored.get(id)?.(); stored.delete(id); }
/** resolves when the engine's answer to `id` is in the cache (or after a while: the pass then builds what it misses) */
const whenStored = (id: number) => storedIds.has(id) ? Promise.resolve() : new Promise<void>((ok) => { stored.set(id, ok); setTimeout(ok, 4000); });
const visible = () => document.visibilityState === "visible" ? Promise.resolve() : new Promise<void>((ok) => { const on = () => { if (document.visibilityState === "visible") { removeEventListener("visibilitychange", on); ok(); } }; addEventListener("visibilitychange", on); });
let lastGenerate = 0;
async function routeRequest(msg: { id: number; method: string; path: string; body: string }, done: (r: Response) => void) {
  if (routing) { routing.done(jsonResponse(410, { error: "superseded" })); routing = null; }
  router?.terminate(); router = null;
  routing = { id: msg.id, done };
  const finish = (r: Response) => { if (routing?.id !== msg.id) return; routing = null; router?.terminate(); router = null; done(r); };
  // answered: the worker is let go but left to finish writing the cache (it ends itself on "stored", or in 15 s)
  const finishKeeping = (r: Response) => {
    if (routing?.id !== msg.id) return; routing = null; const w = router; router = null;
    if (w) { lingering = w; setTimeout(() => endLingering(w), 15000); }
    done(r);
  };
  await whenStored(lastGenerate);
  if (plan.light) await visible();
  if (routing?.id !== msg.id) return;   // superseded or cancelled while it waited
  // short of memory now: back off to one worker fewer for the rest of this visit
  if (plan.workers >= 2 && (underPressure() || await tabMemoryPressure(plan.memory_gb))) plan = backedOff(plan, "memory pressure");
  if (routing?.id !== msg.id) return;
  // a pass the cache already holds is answered by the engine, with no worker started for it
  if (plan.workers >= 2) {
    const probe = { ...msg, id: nextId++, cacheOnly: true };
    const r = await new Promise<Response>((ok) => { waiting.set(probe.id, { msg: probe, done: ok, retried: true }); send(probe); });
    if (routing?.id !== msg.id) return;
    if (r.status === 200) { routing = null; done(r); return; }
  }
  if (plan.workers < 2) {
    spare?.w.terminate(); spare = null;
    // one worker: the engine lays it, after everything before it; a newer robot or Cancel restarts the engine to stop it
    waiting.set(msg.id, { msg, done: finish, retried: true }); send(msg); return;
  }
  const sp = spare ?? bootRouter(); spare = null;
  const w = sp.w; router = w;
  w.onerror = (e) => { plan = backedOff(plan, "the wiring worker stopped"); finish(jsonResponse(500, { error: `The wiring worker stopped: ${e.message || "out of memory?"}` })); };
  await sp.ready;
  if (router !== w) return;   // ended while it started
  w.postMessage({ reading: readingSettings() }); w.postMessage(msg);
  w.onmessage = async ({ data }) => {
    // the worker ends once what it made is in the cache (its answer and the parts its clips cut into), or after a while
    if (data.stored === msg.id) { if (router !== w) endLingering(w); return; }
    if (data.id !== msg.id) return;   // its store, forge and reading messages are not this page's
    const r = new Response(data.buffer, { status: data.status, headers: { "Content-Type": data.type } });
    if (data.took) lastTook.route = data.took;
    if (r.ok) { try { const j = await r.clone().json(); if (j.id && j.robot) send({ adopt: { id: j.id, robot: j.robot, parts: data.parts } }); } catch { /* answered as it is */ } }
    finishKeeping(r);
  };
}
// The wiring worker is started while the first pass designs the robot (on a device with a core to spare for it), so its
// kernels have loaded by the time the robot is on screen and the pass can begin at once.
let spare: { w: Worker; ready: Promise<void> } | null = null, lingering: Worker | null = null;
/** a wiring worker that has answered and is writing the cache: ended when it is done (it still counts against the plan) */
function endLingering(w: Worker) { w.terminate(); if (lingering === w) lingering = null; }
function bootRouter() {
  const w = new Worker(scriptUrl(new URL("./browser-engine.js", document.baseURI)), { type: "module", name: `helpers=0 router${query.has("nocache") ? " nocache" : ""}` });
  const ready = new Promise<void>((ok) => { w.onmessage = ({ data }) => { if (data.ready) { w.postMessage({ robots: "[]" }); ok(); } }; });
  w.onerror = () => { if (spare?.w === w) spare = null; w.terminate(); };
  return { w, ready };
}

/** Stop everything now: every worker is ended at once (the engine, the wiring worker, the forge's helpers with the engine),
 *  every request still waiting is answered "cancelled", and a fresh engine starts for what comes next. */
function cancelAll() {
  router?.terminate(); router = null; spare?.w.terminate(); spare = null; if (lingering) endLingering(lingering);
  if (routing) { routing.done(jsonResponse(499, { error: "cancelled" })); routing = null; }
  for (const id of stored.keys()) storedAck(id);
  const open = [...waiting.values()]; waiting.clear();
  engine.terminate(); queued.length = 0; startEngine();
  for (const p of open) p.done(jsonResponse(499, { error: "cancelled" }));
}
const allStored = new Map<number, () => void>();
const took: unknown[] = [], lastTook: { generate?: unknown; route?: unknown; mesh?: unknown } = {};
const simd = wasmSimd();
(globalThis as any).ttrEnginePool = () => ({ ...plan, helpers: helpersFor(plan), took: lastTook });

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
  // the CAD kernel is a WebAssembly SIMD build: a browser without SIMD is told so plainly instead of the engine failing to start
  if (!simd) return jsonResponse(501, { error: "This browser cannot run the design engine: it lacks WebAssembly SIMD (Chrome 91, Firefox 89, Safari 16.4 and newer have it)." });
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const id = nextId++, body = typeof init?.body === "string" ? init.body : "", msg = { id, method, path: url.pathname, body };
  if (method === "POST" && url.pathname === "/api/robots/generate" && /"route":true/.test(body)) return new Promise<Response>((resolve) => { void routeRequest(msg, resolve); });
  if (method === "POST" && url.pathname === "/api/robots/generate") {
    lastGenerate = id;
    // a new robot ends the harness pass of the last one; with one worker that pass is in the engine, which starts again
    if (routing) {
      const inEngine = waiting.has(routing.id); routing.done(jsonResponse(410, { error: "superseded" })); routing = null; router?.terminate(); router = null;
      if (inEngine) { const open = [...waiting.values()]; waiting.clear(); engine.terminate(); queued.length = 0; startEngine(); for (const p of open) p.done(jsonResponse(410, { error: "superseded" })); }
    }
    // (after the old pass has ended: the engine, this spare and nothing else)
    if (!spare && plan.workers >= (lingering ? 3 : 2) && !plan.light) spare = bootRouter();
  }
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
  /** stop whatever is running, now: every worker ends and a fresh engine starts */
  cancel: cancelAll,
  /** resolves when no pass is running and everything made is in the cache (or after `ms`) */
  async idle(ms = 30000) {
    const end = performance.now() + ms;
    while ((routing || lingering) && performance.now() < end) await new Promise((r) => setTimeout(r, 100));
    const id = nextId++;
    await new Promise<void>((ok) => { allStored.set(id, ok); send({ whenStored: id }); setTimeout(ok, Math.max(0, end - performance.now())); });
  },
  /** the worker plan this tab runs (cores, memory, workers, light) */
  plan: () => ({ ...plan, helpers: helpersFor(plan) }),
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
