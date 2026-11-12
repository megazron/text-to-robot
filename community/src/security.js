// Who may do what, without accounts: Turnstile, a rate-limit hash that cannot be turned back into an address,
// the owner's token and the poster's private delete token.

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256 = async (text) => hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
export function randomToken(bytes = 24) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Equal strings, compared in time that does not depend on where they differ. */
export function timingSafeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  if (x.length !== y.length || !x.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// ---------------------------------------------------------------- the rate-limit hash
export const day = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const SALT_TTL = 2 * 24 * 3600;
/**
 * Today's salt: random, kept only in KV and expired after two days. Once it is gone nobody (me included) can tell
 * which address a stored hash came from, even by trying every IPv4 address.
 */
export async function dailySalt(kv, now = Date.now()) {
  const key = `salt:${day(now)}`;
  let salt = await kv.get(key);
  if (!salt) { salt = randomToken(32); await kv.put(key, salt, { expirationTtl: SALT_TTL }); }
  return salt;
}
/**
 * The part of an address that names one visitor: an IPv4 address whole, an IPv6 address by its /64 prefix (one home or
 * phone gets a whole /64 and could otherwise rotate through it for endless identities).
 */
export function visitorKey(ip) {
  if (!ip || !ip.includes(":")) return ip || "unknown";
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [], t = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
/** The visitor as a hash of today's salt and their address. The address itself is never stored anywhere. */
export async function visitorHash(request, kv, now = Date.now()) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  return (await sha256(`${await dailySalt(kv, now)}|${visitorKey(ip)}`)).slice(0, 32);
}

/**
 * Counts one action for a hash in a fixed window; false once the limit is reached. The counter lives in KV with a
 * TTL of the window, so it expires by itself. KV is eventually consistent: a burst across data centres can get a
 * few more through, which is fine for this.
 */
export async function rateLimit(kv, hash, action, limit, windowSec, now = Date.now()) {
  const slot = Math.floor(now / 1000 / windowSec);
  const key = `rl:${action}:${hash}:${slot}`;
  const n = Number((await kv.get(key)) ?? 0);
  if (n >= limit) return false;
  await kv.put(key, String(n + 1), { expirationTtl: Math.max(60, windowSec + 60) });
  return true;
}

export const isBanned = async (kv, hash) => (await kv.get(`ban:${hash}`)) !== null;
export const ban = (kv, hash) => kv.put(`ban:${hash}`, "1", { expirationTtl: SALT_TTL });

// ---------------------------------------------------------------- Turnstile
export const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/**
 * Asks Cloudflare whether a Turnstile token is good. A missing secret or an unreachable Cloudflare is a no. The token
 * must also have been made for this action ("post" or "report") and, when `hostnames` is given, on one of those sites.
 * `remoteip` goes to Cloudflare with the check and nowhere else.
 */
export async function verifyTurnstile(token, secret, { action, hostnames = [], remoteip, fetcher = fetch } = {}) {
  if (!secret) return { ok: false, reason: "Turnstile is not set up on the server" };
  if (typeof token !== "string" || !token || token.length > 2048) return { ok: false, reason: "the human check is missing" };
  let out;
  try {
    const body = new FormData();
    body.append("secret", secret);
    body.append("response", token);
    if (remoteip) body.append("remoteip", remoteip);
    out = await (await fetcher(SITEVERIFY, { method: "POST", body })).json();
  } catch {
    return { ok: false, reason: "the human check could not be verified" };
  }
  if (!out.success) return { ok: false, reason: "the human check failed; reload and try again", codes: out["error-codes"] ?? [] };
  if (action && out.action && out.action !== action) return { ok: false, reason: "the human check was made for something else" };
  if (hostnames.length && !hostnames.includes(out.hostname)) return { ok: false, reason: "the human check was made on another site" };
  return { ok: true };
}

// ---------------------------------------------------------------- the owner
/** True when the request carries the owner's token (Authorization: Bearer <ADMIN_TOKEN>). Short tokens are refused. */
export function isAdmin(request, env) {
  const token = env.ADMIN_TOKEN;
  if (typeof token !== "string" || token.length < 32) return false;
  const m = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "");
  return !!m && timingSafeEqual(m[1], token);
}
