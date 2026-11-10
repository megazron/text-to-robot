// Input hardening shared by the page (app.js), the in-browser API (browser-api.ts) and the engine API (client.ts).
// Everything that comes from outside the code (a share link, an imported file, a gallery post, the engine's answers)
// goes through here before it is parsed, stored or written into a download. docs/SECURITY_AUDIT.md explains each limit.

/** Largest robot JSON accepted from a file or a share link once decompressed (the Mark 43 is about 3 MB). */
export const MAX_ROBOT_BYTES = 8 * 1024 * 1024;
/** Longest share-link payload read from the address (browsers cap URLs near 2 MB). */
export const MAX_HASH_CHARS = 2 * 1024 * 1024;
/** Longest prompt or change request sent to the parser. */
export const MAX_PROMPT_CHARS = 2000;

const POISON = new Set(["__proto__", "constructor", "prototype"]);
/** JSON.parse that drops __proto__, constructor and prototype keys, so parsed data can never reach an object's prototype. */
export function safeJsonParse(text, maxBytes = MAX_ROBOT_BYTES) {
  if (typeof text !== "string") throw new TypeError("expected JSON text");
  if (text.length > maxBytes) throw new Error(`the JSON is larger than ${Math.round(maxBytes / 1048576)} MB`);
  return JSON.parse(text, (key, value) => (POISON.has(key) ? undefined : value));
}

/**
 * Decompresses bytes with a DecompressionStream, stopping as soon as the output passes `maxBytes`: a few kilobytes of
 * crafted deflate data can otherwise expand to gigabytes and take the tab down (a "zip bomb" in a share link).
 */
export async function inflateCapped(bytes, format = "deflate-raw", maxBytes = MAX_ROBOT_BYTES) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new Error(`the shared design is larger than ${Math.round(maxBytes / 1048576)} MB once unpacked`); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** A download name with no folders, no control or reserved characters and a sane length. */
export function safeFileName(name, fallback = "robot") {
  const s = String(name ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_").replace(/^[.\s]+|[.\s]+$/g, "").slice(0, 120);
  return s && !/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s) ? s : fallback;
}

/**
 * A zip entry path that stays inside the folder it is unpacked into: forward slashes only, no drive letters, no leading
 * slash, no "." or ".." segments and no empty segments. Throws on a path that cannot be made safe.
 */
export function safeZipPath(path) {
  const segs = String(path).replace(/\\/g, "/").split("/").filter((s) => s !== "" && s !== ".");
  if (!segs.length || segs.some((s) => s === ".." || /^[A-Za-z]:$/.test(s) || /[\u0000-\u001f\u007f]/.test(s))) throw new Error(`unsafe file path in an export: ${JSON.stringify(String(path).slice(0, 80))}`);
  return segs.join("/");
}

/** An http(s) URL as a string, or null for anything else (javascript:, data:, relative junk). */
export function safeHttpUrl(url) {
  try { const u = new URL(String(url)); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; } catch { return null; }
}

/**
 * Builds an element without HTML strings: h("td", { class: "n" }, "text", child). Text is always text; attributes named
 * on* are refused, and href/src only take http(s), relative or blob: URLs.
 */
export function h(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (/^on/i.test(k)) throw new Error("event handler attributes are not allowed");
    if (k === "class") e.className = String(v);
    else if (k === "href" || k === "src") {
      // parsed the way the browser will parse it (tabs and newlines inside "java\tscript:" are dropped by URL parsing)
      const u = new URL(String(v), document.baseURI);
      if (!["https:", "http:", "blob:"].includes(u.protocol)) throw new Error("unsafe URL");
      e.setAttribute(k, u.href);
    }
    else e.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}

// Trusted Types (the page CSP sets require-trusted-types-for 'script'): strings never reach script sinks. The only
// script URLs this site makes are its own files (the engine workers) and, when the community board is set up, the
// Cloudflare Turnstile widget. The policy is created lazily because both app.js and the bundled browser-api.js load
// this file; the CSP allows the name 'ttr' with 'allow-duplicates' for that reason.
const SCRIPT_ORIGINS = ["https://challenges.cloudflare.com/turnstile/"];
let policy;
function ttPolicy() {
  if (policy !== undefined) return policy;
  const tt = globalThis.trustedTypes;
  policy = tt?.createPolicy ? tt.createPolicy("ttr", { createScriptURL: checkScriptUrl }) : null;
  return policy;
}
function checkScriptUrl(url) {
  const u = new URL(String(url), globalThis.document?.baseURI ?? globalThis.location?.href);
  const own = typeof location !== "undefined" && u.origin === location.origin && u.protocol === location.protocol;
  if (own || u.protocol === "blob:" || SCRIPT_ORIGINS.some((p) => u.href.startsWith(p))) return u.href;
  throw new Error(`script URL not allowed: ${u.origin}`);
}
/** A script URL for new Worker() or script.src: checked against the allowlist, typed for Trusted Types when the browser has them. */
export function scriptUrl(url) {
  const p = ttPolicy();
  return p ? p.createScriptURL(String(url)) : checkScriptUrl(url);
}
