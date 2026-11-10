// Writes the website's Content-Security-Policy into its <meta http-equiv> tag. GitHub Pages cannot send HTTP headers, so
// the policy travels in the page itself; it lists the sha256 of every inline <script> (the import map is the only one)
// and the community board's origins from apps/web/public/community.json, so nobody edits the hashes by hand.
//   node scripts/csp.ts --write <index.html>   rewrite the meta tag in place (deploy/build-pages.sh runs it on the build)
//   node scripts/csp.ts --check <index.html>   exit 1 when the meta tag is stale (tests/security.test.ts runs it)
//   add --community <community.json> to take the board's api origin and Turnstile setting from another file
// docs/SECURITY_AUDIT.md explains each directive.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const TURNSTILE = "https://challenges.cloudflare.com";

/** The community board's API origin and whether Turnstile is used, from community.json beside the page (both optional). */
export function communityConfig(htmlPath: string, configPath?: string): { api: string | null; turnstile: boolean } {
  const file = configPath ?? join(dirname(htmlPath), "community.json");
  if (!existsSync(file)) return { api: null, turnstile: false };
  const c = JSON.parse(readFileSync(file, "utf8")) as { api?: string; turnstileSiteKey?: string };
  let api: string | null = null;
  if (c.api) {
    const u = new URL(c.api);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") throw new Error(`community.json api must be https: ${c.api}`);
    api = u.origin;
  }
  return { api, turnstile: !!c.turnstileSiteKey };
}

export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) out.push(`'sha256-${createHash("sha256").update(m[1], "utf8").digest("base64")}'`);
  return out;
}

export function policy(html: string, community: { api: string | null; turnstile: boolean }): string {
  const api = community.api ? [community.api] : [], ts = community.turnstile ? [TURNSTILE] : [];
  const d: [string, string[]][] = [
    ["default-src", ["'none'"]],
    ["script-src", ["'self'", ...inlineScriptHashes(html), ...ts]],
    ["style-src", ["'self'"]],
    ["img-src", ["'self'", "data:", "blob:", ...api]],
    ["font-src", ["'self'"]],
    // the page's own /api/* calls are answered in the tab; the gallery list comes from GitHub's API
    ["connect-src", ["'self'", "https://api.github.com", ...api, ...ts]],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["frame-src", ts.length ? ts : ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'none'"]],
    ["require-trusted-types-for", ["'script'"]],
    ["trusted-types", ["ttr", "'allow-duplicates'"]],
    ["upgrade-insecure-requests", []],
  ];
  return d.map(([k, v]) => [k, ...v].join(" ")).join("; ");
}

const META = /<meta http-equiv="Content-Security-Policy" content="[^"]*" \/>/;
export function withPolicy(html: string, community: { api: string | null; turnstile: boolean }): string {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy(html, community)}" />`;
  if (META.test(html)) return html.replace(META, tag);
  // first in <head> after the charset, so the policy covers everything the page loads
  return html.replace(/(<meta charset="utf-8" \/>\n)/, `$1${tag}\n<meta name="referrer" content="strict-origin-when-cross-origin" />\n`);
}

if (import.meta.main ?? process.argv[1]?.endsWith("csp.ts")) {
  // --community <file> reads the board's settings from another file (a local Worker for an e2e run) instead of the page's community.json
  const argv = process.argv.slice(2), at = argv.indexOf("--community"), config = at >= 0 ? argv.splice(at, 2)[1] : undefined;
  const [mode, file] = argv;
  if (!file || (mode !== "--write" && mode !== "--check")) { console.error("usage: node scripts/csp.ts --write|--check <index.html>"); process.exit(2); }
  const html = readFileSync(file, "utf8"), next = withPolicy(html, communityConfig(file, config));
  if (mode === "--write") { if (next !== html) writeFileSync(file, next); console.log(`CSP written to ${file}`); }
  else if (next !== html) { console.error(`${file}: Content-Security-Policy meta is stale; run node scripts/csp.ts --write ${file}`); process.exit(1); }
}
