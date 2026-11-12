import assert from "node:assert/strict";
import { test } from "node:test";
import { dailySalt, isAdmin, rateLimit, sha256, timingSafeEqual, verifyTurnstile, visitorHash, visitorKey } from "../src/security.js";
import { ADMIN, FAIL_SECRET, fakeSiteverify, PASS_SECRET } from "./helpers.js";

/** A KV namespace in memory that honours expirationTtl against a clock the test moves. */
function memoryKv(clock) {
  const m = new Map();
  return {
    m,
    async get(k) { const v = m.get(k); if (!v) return null; if (v.until && v.until <= clock.now) { m.delete(k); return null; } return v.value; },
    async put(k, value, opt = {}) { m.set(k, { value, until: opt.expirationTtl ? clock.now + opt.expirationTtl * 1000 : 0 }); },
  };
}
const req = (ip, headers = {}) => new Request("https://x.test/", { headers: { "CF-Connecting-IP": ip, ...headers } });

test("rate limit: 5 posts an hour per hash, a new hour starts again, other hashes unaffected", async () => {
  const clock = { now: Date.UTC(2026, 10, 10, 10, 0, 0) };
  const kv = memoryKv(clock);
  for (let i = 0; i < 5; i++) assert.equal(await rateLimit(kv, "h1", "post", 5, 3600, clock.now), true);
  assert.equal(await rateLimit(kv, "h1", "post", 5, 3600, clock.now), false);
  assert.equal(await rateLimit(kv, "h2", "post", 5, 3600, clock.now), true);
  assert.equal(await rateLimit(kv, "h1", "report", 5, 3600, clock.now), true, "actions are counted apart");
  clock.now += 3600 * 1000;
  assert.equal(await rateLimit(kv, "h1", "post", 5, 3600, clock.now), true);
  // every counter has a TTL, so nothing stays in KV
  for (const v of kv.m.values()) assert.ok(v.until > 0);
});

test("the visitor hash: no address in it, the same all day, different the next day, and the salt expires", async () => {
  const clock = { now: Date.UTC(2026, 10, 10, 1, 0, 0) };
  const kv = memoryKv(clock);
  const a = await visitorHash(req("198.51.100.7"), kv, clock.now);
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.ok(!a.includes("198"));
  assert.equal(await visitorHash(req("198.51.100.7"), kv, clock.now + 3600e3 * 20), a);
  assert.notEqual(await visitorHash(req("198.51.100.8"), kv, clock.now), a);
  // without the salt the hash cannot be recomputed from the address
  assert.notEqual((await sha256("198.51.100.7")).slice(0, 32), a);
  const tomorrow = clock.now + 24 * 3600e3;
  assert.notEqual(await visitorHash(req("198.51.100.7"), kv, tomorrow), a);
  const salt = await dailySalt(kv, clock.now);
  assert.equal(salt.length >= 40, true);
  for (const [k, v] of kv.m) if (k.startsWith("salt:")) assert.equal(v.until - clock.now <= 2 * 24 * 3600e3 + 24 * 3600e3, true);
  for (const k of kv.m.keys()) assert.ok(!k.includes("198.51"), "no address in any KV key");
  for (const v of kv.m.values()) assert.ok(!String(v.value).includes("198.51"), "no address in any KV value");
});

test("IPv6 addresses count by their /64, IPv4 whole", () => {
  assert.equal(visitorKey("2001:db8:1:2:3:4:5:6"), visitorKey("2001:0db8:0001:0002::99"));
  assert.notEqual(visitorKey("2001:db8:1:2::1"), visitorKey("2001:db8:1:3::1"));
  assert.equal(visitorKey("203.0.113.5"), "203.0.113.5");
  assert.notEqual(visitorKey("203.0.113.5"), visitorKey("203.0.113.6"));
});

test("Turnstile: verified with Cloudflare's test secrets, mocked siteverify", async () => {
  const sent = [];
  const fetcher = async (url, init) => { sent.push(url); return fakeSiteverify(new Request(url, init)); };
  const sentForm = [];
  const spy = async (url, init) => { sentForm.push(init.body); return fetcher(url, init); };
  assert.deepEqual(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", PASS_SECRET, { fetcher: spy, remoteip: "198.51.100.1" }), { ok: true });
  assert.equal(sentForm[0].get("remoteip"), "198.51.100.1", "the address goes to Cloudflare's check only");
  assert.equal((await verifyTurnstile("act:report@localhost", PASS_SECRET, { fetcher, action: "post" })).ok, false, "made for another action");
  assert.equal((await verifyTurnstile("act:post@localhost", PASS_SECRET, { fetcher, action: "post" })).ok, true);
  assert.equal((await verifyTurnstile("act:post@evil.example", PASS_SECRET, { fetcher, action: "post", hostnames: ["megazron.github.io"] })).ok, false, "made on another site");
  const fail = await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", FAIL_SECRET, { fetcher });
  assert.equal(fail.ok, false);
  assert.deepEqual(fail.codes, ["invalid-input-response"]);
  assert.equal((await verifyTurnstile("", PASS_SECRET, { fetcher })).ok, false, "no token, no post");
  assert.equal((await verifyTurnstile("tok", "", { fetcher })).ok, false, "no secret configured fails closed");
  assert.equal((await verifyTurnstile("tok", PASS_SECRET, { fetcher: async () => { throw new Error("down"); } })).ok, false, "Cloudflare unreachable fails closed");
  assert.ok(sent.every((u) => u === "https://challenges.cloudflare.com/turnstile/v0/siteverify"));
});

test("owner auth: Bearer ADMIN_TOKEN only, short or missing tokens refused", () => {
  const env = { ADMIN_TOKEN: ADMIN };
  assert.equal(isAdmin(req("1.1.1.1", { Authorization: `Bearer ${ADMIN}` }), env), true);
  assert.equal(isAdmin(req("1.1.1.1", { Authorization: `Bearer ${ADMIN}x` }), env), false);
  assert.equal(isAdmin(req("1.1.1.1", { Authorization: ADMIN }), env), false);
  assert.equal(isAdmin(req("1.1.1.1"), env), false);
  assert.equal(isAdmin(req("1.1.1.1", { Authorization: "Bearer short" }), { ADMIN_TOKEN: "short" }), false, "a short secret never works");
  assert.equal(isAdmin(req("1.1.1.1", { Authorization: "Bearer " }), { ADMIN_TOKEN: undefined }), false);
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("", ""), false);
});
