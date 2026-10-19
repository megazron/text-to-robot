// texttorobot.org launcher: uploaded to the host once, never again.
//
// It downloads the prebuilt website from the repo's `site` branch (built by
// .github/workflows/site.yml on every push to main and every release), runs it,
// and swaps to each new build without downtime. Updates arrive two ways:
//   - instantly: the workflow POSTs /__deploy with the deploy token
//   - fallback:  every pollMinutes it asks GitHub which commit the branch is on
// No dependencies; plain Node 18+.
"use strict";
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const ROOT = __dirname;
const CONFIG = { repo: "megazron/text-to-robot", branch: "site", pollMinutes: 10, deployToken: "", ...readJson(path.join(ROOT, "deploy.json")) };
if (process.env.TTR_DEPLOY_TOKEN) CONFIG.deployToken = process.env.TTR_DEPLOY_TOKEN;
const RELEASES = path.join(ROOT, "releases");
const DATA_DIR = path.join(ROOT, "data");
const STATE_FILE = path.join(ROOT, "current.json");
const LOG_FILE = path.join(ROOT, "launcher.log");
const PORT = Number(process.env.PORT || 3000);

const state = { version: null, siteCommit: null, dir: null, child: null, childPort: null, lastCheck: null, lastError: null, updating: null };

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } }
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 1_000_000) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    fs.appendFileSync(LOG_FILE, `${line}\n`);
  } catch { /* logging is best effort */ }
}

// ---------- download + unpack ----------
async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": "texttorobot-launcher", "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Minimal ustar/pax reader: regular files and directories only. Strips the archive's top folder. */
function extractTar(buf, dest) {
  let off = 0, longName = null, paxPath = null;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const str = (a, b) => h.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") { const m = /\d+ path=([^\n]*)\n/.exec(body.toString("utf8")); paxPath = m ? m[1] : null; continue; }
    if (type === "L") { longName = body.toString("utf8").replace(/\0.*$/s, ""); continue; }
    if (type === "g") continue;
    const prefix = str(345, 500);
    let name = paxPath || longName || (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
    paxPath = longName = null;
    name = name.split("/").slice(1).join("/"); // drop "text-to-robot-<sha>/"
    if (!name) continue;
    const target = path.resolve(dest, name);
    if (!target.startsWith(path.resolve(dest) + path.sep)) throw new Error(`unsafe path in archive: ${name}`);
    if (type === "5") fs.mkdirSync(target, { recursive: true });
    else if (type === "0" || type === "\0" || type === "7") { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, body); }
  }
}

/** Branch head straight from git's ref advertisement: uncached and not API rate limited. */
async function latestSiteCommit() {
  const refs = (await fetchBuffer(`https://github.com/${CONFIG.repo}.git/info/refs?service=git-upload-pack`)).toString("utf8");
  const m = new RegExp(`([0-9a-f]{40}) refs/heads/${CONFIG.branch}\\n`).exec(refs);
  if (!m) throw new Error(`branch ${CONFIG.branch} not found in ${CONFIG.repo}`);
  return m[1];
}

async function download(commit) {
  const tgz = await fetchBuffer(`https://codeload.github.com/${CONFIG.repo}/tar.gz/${commit}`);
  const tmp = path.join(RELEASES, `.incoming-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  extractTar(zlib.gunzipSync(tgz), tmp);
  const version = fs.readFileSync(path.join(tmp, "VERSION"), "utf8").trim();
  if (!fs.existsSync(path.join(tmp, "apps/api/src/server.mjs"))) throw new Error("bundle has no apps/api/src/server.mjs");
  const dir = path.join(RELEASES, commit);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(tmp, dir);
  return { version, dir };
}

// ---------- running the site ----------
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function startChild(dir) {
  const port = await freePort();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const child = spawn(process.execPath, [path.join(dir, "apps/api/src/server.mjs")], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), TTR_DATA_DIR: DATA_DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => log(`[site] ${String(d).trim()}`));
  child.stderr.on("data", (d) => log(`[site:err] ${String(d).trim()}`));
  for (let i = 0; i < 100; i++) { // wait up to 20 s for it to answer
    if (child.exitCode !== null) throw new Error(`site exited with code ${child.exitCode}`);
    const ok = await new Promise((r) => http.get({ host: "127.0.0.1", port, path: "/api/status", timeout: 1000 }, (res) => { res.resume(); r(res.statusCode === 200); }).on("error", () => r(false)));
    if (ok) return { child, port };
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error("site did not start within 20 s");
}

async function activate(version, siteCommit, dir) {
  const { child, port } = await startChild(dir);
  const old = state.child, oldDir = state.dir;
  Object.assign(state, { version, siteCommit, dir, child, childPort: port });
  child.on("exit", (code) => {
    if (state.child !== child) return; // replaced on purpose
    log(`site exited (code ${code}); restarting in 3 s`);
    state.child = null;
    setTimeout(() => activate(version, siteCommit, dir).catch((e) => { state.lastError = e.message; log(`restart failed: ${e.message}`); }), 3000);
  });
  if (old) setTimeout(() => old.kill(), 5000); // let in-flight requests finish
  fs.writeFileSync(STATE_FILE, JSON.stringify({ version, siteCommit, dir: path.basename(dir), activated: new Date().toISOString() }, null, 2));
  for (const name of fs.readdirSync(RELEASES)) { // keep the live build and the one it replaced
    const p = path.join(RELEASES, name);
    if (p !== dir && p !== oldDir) fs.rmSync(p, { recursive: true, force: true });
  }
  log(`live: ${version.slice(0, 7)} on internal port ${port}`);
}

function update(commit) {
  if (state.updating) return state.updating.then(() => (commit && commit !== state.siteCommit ? update(commit) : undefined));
  state.updating = (async () => {
    state.lastCheck = new Date().toISOString();
    const wanted = commit || (await latestSiteCommit());
    if (wanted === state.siteCommit && state.child) return { changed: false, version: state.version };
    log(`downloading ${CONFIG.branch}@${wanted.slice(0, 7)}`);
    const got = await download(wanted);
    await activate(got.version, wanted, got.dir);
    state.lastError = null;
    return { changed: true, version: got.version };
  })().catch((e) => { state.lastError = e.message; log(`update failed: ${e.message}`); throw e; })
    .finally(() => { state.updating = null; });
  return state.updating;
}

// ---------- front door ----------
function authorized(req) {
  const given = Buffer.from(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(CONFIG.deployToken);
  return want.length > 0 && given.length === want.length && crypto.timingSafeEqual(given, want);
}

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

const STARTING = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Text to Robot</title>
<body style="font:16px system-ui;background:#0b0f14;color:#cfd8e3;display:grid;place-items:center;height:100vh;margin:0">
<div>Text&rarr;Robot is starting up. This page refreshes on its own.</div>`;

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/__deploy") {
    if (!authorized(req)) return send(res, 401, { error: "bad deploy token" });
    if (req.method === "GET") return send(res, 200, { version: state.version, siteCommit: state.siteCommit, lastCheck: state.lastCheck, lastError: state.lastError, updating: !!state.updating });
    if (req.method !== "POST") return send(res, 405, { error: "use POST" });
    const commit = /^[0-9a-f]{40}$/.test(String(req.headers["x-site-commit"] || "")) ? String(req.headers["x-site-commit"]) : null;
    update(commit).catch(() => {});
    return send(res, 202, { accepted: true, from: state.version });
  }
  if (!state.child) return send(res, 503, STARTING, "text/html; charset=utf-8");
  const upstream = http.request({ host: "127.0.0.1", port: state.childPort, method: req.method, path: req.url, headers: req.headers }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", () => { if (!res.headersSent) send(res, 502, STARTING, "text/html; charset=utf-8"); else res.destroy(); });
  req.pipe(upstream);
});

async function boot() {
  fs.mkdirSync(RELEASES, { recursive: true });
  server.listen(PORT, () => log(`launcher listening on ${PORT} (repo ${CONFIG.repo}@${CONFIG.branch})`));
  const saved = readJson(STATE_FILE);
  const savedDir = saved.dir && path.join(RELEASES, saved.dir);
  if (savedDir && fs.existsSync(path.join(savedDir, "apps/api/src/server.mjs"))) {
    await activate(saved.version, saved.siteCommit, savedDir).catch((e) => log(`could not resume ${saved.version}: ${e.message}`));
  }
  await update().catch(() => {});
  setInterval(() => update().catch(() => {}), Math.max(1, Number(CONFIG.pollMinutes)) * 60_000);
}

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { state.child?.kill(); process.exit(0); });
boot();
