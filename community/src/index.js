// The community board's API: a Cloudflare Worker on D1 (posts) and KV (rate limits, bans, the daily salt).
// docs/COMMUNITY.md describes the routes, what is stored and how the owner moderates.
import { ADMIN_PAGE, adminCsp } from "./admin-page.js";
import { readJson } from "./http.js";
import { ban, isAdmin, isBanned, randomToken, rateLimit, sha256, verifyTurnstile, visitorHash } from "./security.js";
import { contentKey, normaliseTag, PRODUCTS, validatePost } from "./validate.js";

const POSTS_PER_HOUR = 5;
const POSTS_PER_DAY = 200; // across everyone: keeps a flood from filling the free D1 (500 MB) with pictures
const REPORTS_PER_HOUR = 20;
const DUPLICATE_WINDOW_MS = 7 * 24 * 3600 * 1000;

// ---------------------------------------------------------------- responses and CORS
function allowedOrigin(origin, env) {
  if (!origin) return null;
  const list = String(env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)) return origin;
  return null;
}
function withCors(res, request, env) {
  const origin = allowedOrigin(request.headers.get("Origin"), env);
  const h = new Headers(res.headers);
  if (origin) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Delete-Token");
    h.set("Access-Control-Max-Age", "86400");
  }
  h.append("Vary", "Origin");
  h.set("X-Content-Type-Options", "nosniff");
  if (!h.has("Content-Security-Policy")) h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  h.set("Referrer-Policy", "no-referrer");
  return new Response(res.body, { status: res.status, headers: h });
}
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
const error = (status, message) => json({ error: message }, status);

const turnstile = (request, env, token, action) => verifyTurnstile(token, env.TURNSTILE_SECRET, {
  action,
  hostnames: String(env.TURNSTILE_HOSTNAMES ?? "").split(",").map((x) => x.trim()).filter(Boolean),
  remoteip: request.headers.get("CF-Connecting-IP") ?? undefined,
});

// ---------------------------------------------------------------- caching the public reads
// Public GETs are cached at the edge under a version that every change bumps, so the feed is never stale for long
// and D1 is read once per version and data centre, not once per visitor.
async function feedVersion(env) { return (await env.RATE.get("feed:version")) ?? "0"; }
async function bumpFeed(env) { await env.RATE.put("feed:version", String(Date.now())); }
async function cached(request, env, ttl, make) {
  const cache = globalThis.caches?.default;
  if (!cache) return make();
  const u = new URL(request.url);
  u.searchParams.set("__v", await feedVersion(env));
  const key = new Request(u.toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await make();
  if (res.status === 200) {
    const store = new Response(res.clone().body, res);
    store.headers.set("Cache-Control", `public, max-age=${ttl}`);
    await cache.put(key, store);
  }
  return res;
}

// ---------------------------------------------------------------- settings
async function settings(env) {
  const rows = (await env.DB.prepare("SELECT key, value FROM settings").all()).results;
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { moderation: s.moderation === "review" ? "review" : "instant", report_threshold: Math.max(1, Number(s.report_threshold) || 3) };
}

// ---------------------------------------------------------------- posts as the public sees them
const POST_COLUMNS = "id, title, description, name, product, recipe, tags, thumb_type, status, hidden_reason, reviewed, created_at";
function publicPost(row, base) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    name: row.name || null,
    product: row.product,
    recipe: row.recipe,
    tags: row.tags ? row.tags.split(",") : [],
    thumbnail: `${base}/posts/${row.id}/thumb`,
    created_at: new Date(row.created_at).toISOString(),
  };
}
function adminPost(row, base) {
  return { ...publicPost(row, base), status: row.status, hidden_reason: row.hidden_reason, reviewed: !!row.reviewed, reports: row.reports ?? 0, poster_hash: row.poster_hash };
}

async function listPosts(env, url, base, where, params) {
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const conds = [...where], args = [...params];
  const tag = normaliseTag(url.searchParams.get("tag") ?? "");
  if (tag) { conds.push("id IN (SELECT post_id FROM post_tags WHERE tag = ?)"); args.push(tag); }
  const product = url.searchParams.get("product");
  if (product) { if (!PRODUCTS.includes(product)) return { error: "unknown product" }; conds.push("product = ?"); args.push(product); }
  const cursor = /^(\d{1,15})_([A-Za-z0-9_-]{1,32})$/.exec(url.searchParams.get("cursor") ?? "");
  if (cursor) { conds.push("(created_at < ? OR (created_at = ? AND id < ?))"); args.push(Number(cursor[1]), Number(cursor[1]), cursor[2]); }
  const sql = `SELECT ${POST_COLUMNS}, poster_hash, (SELECT COUNT(*) FROM reports r WHERE r.post_id = posts.id AND r.resolved = 0) AS reports
    FROM posts ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT ?`;
  const rows = (await env.DB.prepare(sql).bind(...args, limit + 1).all()).results;
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { rows: page, next: more && last ? `${last.created_at}_${last.id}` : null };
}

// ---------------------------------------------------------------- the routes
async function createPost(request, env, base) {
  const { body, tooLarge } = await readJson(request);
  if (tooLarge) return error(413, "the post is too large");
  if (!body) return error(400, "the post is not JSON");
  const hash = await visitorHash(request, env.RATE);
  if (await isBanned(env.RATE, hash)) return error(403, "posting is blocked from this connection for now");
  const human = await turnstile(request, env, body.turnstile, "post");
  if (!human.ok) return error(403, human.reason);
  const { post, error: why } = validatePost(body);
  if (why) return error(400, why);
  const key = await sha256(contentKey(post));
  const dup = await env.DB.prepare("SELECT id FROM posts WHERE content_key = ? AND created_at > ? LIMIT 1").bind(key, Date.now() - DUPLICATE_WINDOW_MS).first();
  if (dup) return error(409, "this design is already on the board");
  if (!(await rateLimit(env.RATE, hash, "post", POSTS_PER_HOUR, 3600))) return error(429, `at most ${POSTS_PER_HOUR} posts an hour; try again later`);
  if (!(await rateLimit(env.RATE, "everyone", "post", Number(env.POSTS_PER_DAY) || POSTS_PER_DAY, 86400))) return error(429, "the board is full for today; try again tomorrow");
  const { moderation } = await settings(env);
  const id = randomToken(9);
  const deleteToken = randomToken(24);
  const status = moderation === "review" ? "pending" : "live";
  const now = Date.now();
  const stmts = [
    env.DB.prepare(`INSERT INTO posts (id, title, description, name, product, recipe, tags, thumb, thumb_type, status, delete_hash, poster_hash, content_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, post.title, post.description, post.name, post.product, post.recipe, post.tags.join(","),
      post.thumb, post.thumbType, status, await sha256(deleteToken), hash, key, now),
    ...post.tags.map((t) => env.DB.prepare("INSERT INTO post_tags (post_id, tag) VALUES (?, ?)").bind(id, t)),
  ];
  await env.DB.batch(stmts);
  if (status === "live") await bumpFeed(env);
  // the delete token is shown to the poster once and only its hash is kept
  return json({ id, status, delete_token: deleteToken, post: publicPost({ id, ...post, tags: post.tags.join(","), created_at: now }, base) }, 201);
}

async function reportPost(request, env, id) {
  const { body, tooLarge } = await readJson(request);
  if (tooLarge || !body) return error(400, "the report is not JSON");
  const human = await turnstile(request, env, body.turnstile, "report");
  if (!human.ok) return error(403, human.reason);
  const post = await env.DB.prepare("SELECT id, status, reviewed FROM posts WHERE id = ?").bind(id).first();
  if (!post || post.status !== "live") return error(404, "no such post");
  const hash = await visitorHash(request, env.RATE);
  if (!(await rateLimit(env.RATE, hash, "report", REPORTS_PER_HOUR, 3600))) return error(429, "too many reports from here; try again later");
  const reason = String(body.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  await env.DB.prepare("INSERT OR IGNORE INTO reports (post_id, reason, reporter_hash, created_at) VALUES (?, ?, ?, ?)").bind(id, reason, hash, Date.now()).run();
  const { report_threshold } = await settings(env);
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE post_id = ? AND resolved = 0").bind(id).first();
  // a post the owner has already restored or approved is not hidden by reports again: they wait for the owner
  let hidden = false;
  if (n >= report_threshold && !post.reviewed) {
    await env.DB.prepare("UPDATE posts SET status = 'hidden', hidden_reason = 'reports' WHERE id = ? AND status = 'live'").bind(id).run();
    await bumpFeed(env);
    hidden = true;
  }
  return json({ ok: true, hidden });
}

async function deletePost(request, env, id) {
  const row = await env.DB.prepare("SELECT id, delete_hash FROM posts WHERE id = ?").bind(id).first();
  const owner = isAdmin(request, env);
  if (!owner) {
    // the header only: a token in the address would end up in logs and history
    const token = request.headers.get("X-Delete-Token") ?? "";
    // the same answer whether the post exists or not, so a wrong token says nothing
    if (!row || !token || (await sha256(token)) !== row.delete_hash) return error(403, "that delete link is not valid (the post may already be gone)");
  } else if (!row) return error(404, "no such post");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reports WHERE post_id = ?").bind(id),
    env.DB.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(id),
    env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id),
  ]);
  await bumpFeed(env);
  return json({ ok: true, deleted: id });
}

async function thumb(env, id, owner) {
  const row = await env.DB.prepare("SELECT thumb, thumb_type, status FROM posts WHERE id = ?").bind(id).first();
  if (!row || (row.status !== "live" && !owner)) return error(404, "no such picture");
  return new Response(new Uint8Array(row.thumb), {
    headers: { "Content-Type": `image/${row.thumb_type}`, "Cache-Control": row.status === "live" ? "public, max-age=3600" : "no-store", "Content-Security-Policy": "default-src 'none'" },
  });
}

async function admin(request, env, url, base, parts) {
  if (!isAdmin(request, env)) return error(401, "the owner's token is needed");
  const [, what, id, action] = parts; // admin / posts / :id / :action
  if (what === "settings") {
    if (request.method === "GET") return json(await settings(env));
    if (request.method !== "POST") return error(405, "GET or POST");
    const { body } = await readJson(request);
    const stmts = [];
    if (body?.moderation !== undefined) {
      if (!["instant", "review"].includes(body.moderation)) return error(400, "moderation is instant or review");
      stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('moderation', ?)").bind(body.moderation));
    }
    if (body?.report_threshold !== undefined) {
      const n = Number(body.report_threshold);
      if (!Number.isInteger(n) || n < 1 || n > 100) return error(400, "report_threshold is a whole number from 1 to 100");
      stmts.push(env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('report_threshold', ?)").bind(String(n)));
    }
    if (stmts.length) await env.DB.batch(stmts);
    return json(await settings(env));
  }
  if (what === "reports" && request.method === "GET") {
    const rows = (await env.DB.prepare(`SELECT r.id, r.post_id, r.reason, r.resolved, r.created_at, p.title FROM reports r JOIN posts p ON p.id = r.post_id
      ORDER BY r.resolved, r.created_at DESC LIMIT 200`).all()).results;
    return json({ reports: rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })) });
  }
  if (what === "posts" && !id && request.method === "GET") {
    const status = url.searchParams.get("status");
    if (status && !["live", "pending", "hidden"].includes(status)) return error(400, "status is live, pending or hidden");
    const out = await listPosts(env, url, base, status ? ["status = ?"] : [], status ? [status] : []);
    if (out.error) return error(400, out.error);
    return json({ posts: out.rows.map((r) => adminPost(r, base)), next: out.next });
  }
  if (what === "posts" && id && request.method === "POST") {
    const row = await env.DB.prepare("SELECT id, poster_hash FROM posts WHERE id = ?").bind(id).first();
    if (!row) return error(404, "no such post");
    if (action === "hide") await env.DB.prepare("UPDATE posts SET status = 'hidden', hidden_reason = 'owner' WHERE id = ?").bind(id).run();
    else if (action === "approve" || action === "restore") {
      await env.DB.batch([
        env.DB.prepare("UPDATE posts SET status = 'live', hidden_reason = NULL, reviewed = 1 WHERE id = ?").bind(id),
        env.DB.prepare("UPDATE reports SET resolved = 1 WHERE post_id = ?").bind(id),
      ]);
    } else if (action === "ban") {
      await ban(env.RATE, row.poster_hash);
      await env.DB.prepare("UPDATE posts SET status = 'hidden', hidden_reason = 'owner' WHERE poster_hash = ?").bind(row.poster_hash).run();
    } else return error(404, "the actions are hide, approve, restore and ban");
    await bumpFeed(env);
    return json({ ok: true, id, action });
  }
  if (what === "posts" && id && request.method === "DELETE") return deletePost(request, env, id);
  return error(404, "no such admin route");
}

async function route(request, env) {
  const url = new URL(request.url);
  const base = url.origin;
  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const m = request.method;
  if (m === "OPTIONS") return new Response(null, { status: 204 });
  if (parts.length === 0) return json({ service: "text-to-robot community", ok: true });
  if (parts[0] === "admin" && parts.length === 1 && m === "GET") {
    return new Response(ADMIN_PAGE, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": await adminCsp(),
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
      },
    });
  }
  if (parts[0] === "admin") return admin(request, env, url, base, parts);
  if (parts[0] !== "posts") return error(404, "not found");
  const id = parts[1];
  if (id && !/^[A-Za-z0-9_-]{1,32}$/.test(id)) return error(404, "no such post");
  if (!id && m === "POST") return createPost(request, env, base);
  if (!id && m === "GET") {
    return cached(request, env, 60, async () => {
      const out = await listPosts(env, url, base, ["status = 'live'"], []);
      if (out.error) return error(400, out.error);
      return json({ posts: out.rows.map((r) => publicPost(r, base)), next: out.next });
    });
  }
  if (id && parts[2] === "thumb" && m === "GET") return isAdmin(request, env) ? thumb(env, id, true) : cached(request, env, 600, () => thumb(env, id, false));
  if (id && parts[2] === "report" && m === "POST") return reportPost(request, env, id);
  if (id && !parts[2] && m === "GET") {
    return cached(request, env, 60, async () => {
      const row = await env.DB.prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE id = ? AND status = 'live'`).bind(id).first();
      return row ? json(publicPost(row, base)) : error(404, "no such post");
    });
  }
  if (id && !parts[2] && m === "DELETE") return deletePost(request, env, id);
  return error(405, "method not allowed");
}

export default {
  async fetch(request, env) {
    let res;
    try { res = await route(request, env); }
    catch (e) { console.error(e); res = error(500, "the community server had a problem"); }
    return withCors(res, request, env);
  },
};
