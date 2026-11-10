// The real Worker on Miniflare with a local D1 and KV; Turnstile answered as Cloudflare answers its test secrets.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { ADMIN, FAIL_SECRET, PNG, post, recipe, startWorker } from "./helpers.js";

const owner = { Authorization: `Bearer ${ADMIN}` };

describe("community API", () => {
  let w;
  before(async () => { w = await startWorker(); });
  after(() => w.close());

  test("post, see it in the feed and by id, picture served as PNG; the delete token is returned once", async () => {
    const r = await w.api("/posts", { method: "POST", body: post({ name: "Gaus", tags: ["arm", "desk"] }) });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.status, "live");
    assert.match(r.data.delete_token, /^[A-Za-z0-9_-]{32}$/);
    const feed = await w.api("/posts");
    assert.equal(feed.data.posts[0].id, r.data.id);
    assert.equal(feed.data.posts[0].name, "Gaus");
    assert.deepEqual(feed.data.posts[0].tags, ["arm", "desk"]);
    assert.equal(feed.data.posts[0].delete_token, undefined);
    assert.deepEqual(Object.keys(feed.data.posts[0]).sort(), ["created_at", "description", "id", "name", "product", "recipe", "tags", "thumbnail", "title"]);
    const one = await w.api(`/posts/${r.data.id}`);
    assert.equal(one.data.title, "Desk arm");
    const pic = await w.api(`/posts/${r.data.id}/thumb`);
    assert.equal(pic.headers.get("Content-Type"), "image/png");
    assert.deepEqual(Buffer.from(pic.data), PNG);
  });

  test("anonymous: a blank name is stored as nothing and shown as null", async () => {
    w.newVisitor();
    const r = await w.api("/posts", { method: "POST", body: post({ title: "Rover", name: "   ", recipe: recipe("Create a rover") }) });
    assert.equal(r.status, 201);
    assert.equal((await w.api(`/posts/${r.data.id}`)).data.name, null);
  });

  test("no IP address is stored anywhere in the database", async () => {
    const rows = await w.db.prepare("SELECT * FROM posts").all();
    const text = JSON.stringify(rows.results);
    assert.ok(!/203\.0\.113/.test(text));
    const cols = (await w.db.prepare("PRAGMA table_info(posts)").all()).results.map((c) => c.name);
    assert.ok(!cols.some((c) => /^ip$|_ip$|email|addr/.test(c)), cols.join());
  });

  test("feed: newest first, paged by cursor, filtered by tag and product", async () => {
    w.newVisitor();
    for (let i = 0; i < 3; i++) await w.api("/posts", { method: "POST", body: post({ title: `Studio ${i}`, product: "robot-studio", tags: ["studio"], recipe: recipe(`studio ${i}`) }) });
    const p1 = await w.api("/posts?limit=2");
    assert.equal(p1.data.posts.length, 2);
    assert.equal(p1.data.posts[0].title, "Studio 2");
    const p2 = await w.api(`/posts?limit=2&cursor=${p1.data.next}`);
    assert.equal(p2.data.posts[0].title, "Studio 0");
    assert.deepEqual((await w.api("/posts?tag=STUDIO")).data.posts.map((p) => p.title), ["Studio 2", "Studio 1", "Studio 0"]);
    assert.ok((await w.api("/posts?product=text-to-robot")).data.posts.every((p) => p.product === "text-to-robot"));
    assert.equal((await w.api("/posts?product=nope")).status, 400);
  });

  test("validation errors are 400 with a reason; bad pictures and recipes refused", async () => {
    w.newVisitor();
    const r = await w.api("/posts", { method: "POST", body: post({ thumbnail: Buffer.from("GIF89a").toString("base64"), recipe: recipe("x1") }) });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /PNG or WebP/);
    assert.equal((await w.api("/posts", { method: "POST", body: "{not json" })).status, 400);
    assert.equal((await w.api("/posts", { method: "POST", body: post({ title: "shit bot", recipe: recipe("x2") }) })).status, 400);
    assert.equal((await w.api("/posts", { method: "POST", body: { ...post(), thumbnail: "A".repeat(700 * 1024) } })).status, 413);
  });

  test("duplicates are refused", async () => {
    w.newVisitor();
    const body = post({ title: "Twin", recipe: recipe("twin") });
    assert.equal((await w.api("/posts", { method: "POST", body })).status, 201);
    w.newVisitor();
    const again = await w.api("/posts", { method: "POST", body: { ...body, title: "  TWIN " } });
    assert.equal(again.status, 409);
  });

  test("Turnstile: a post without a token is refused", async () => {
    w.newVisitor();
    const r = await w.api("/posts", { method: "POST", body: post({ turnstile: "", recipe: recipe("no token") }) });
    assert.equal(r.status, 403);
  });

  test("rate limit: the sixth post in an hour from one connection is refused", async () => {
    const from = "198.51.100.200";
    for (let i = 0; i < 5; i++) assert.equal((await w.api("/posts", { method: "POST", from, body: post({ title: `rl ${i}`, recipe: recipe(`rl ${i}`) }) })).status, 201);
    const r = await w.api("/posts", { method: "POST", from, body: post({ title: "rl 6", recipe: recipe("rl 6") }) });
    assert.equal(r.status, 429);
    assert.equal((await w.api("/posts", { method: "POST", from: "198.51.100.201", body: post({ title: "rl other", recipe: recipe("rl other") }) })).status, 201);
  });

  test("reports: one per visitor, the post hides after the threshold, the owner sees and restores it", async () => {
    w.newVisitor();
    const { data } = await w.api("/posts", { method: "POST", body: post({ title: "Reported", recipe: recipe("reported") }) });
    for (let i = 0; i < 2; i++) {
      const r = await w.api(`/posts/${data.id}/report`, { method: "POST", from: "192.0.2.1", body: { reason: "spam", turnstile: "tok" } });
      assert.equal(r.data.hidden, false);
    }
    assert.equal((await w.api(`/posts/${data.id}/report`, { method: "POST", from: "192.0.2.2", body: { reason: "spam", turnstile: "tok" } })).data.hidden, false);
    assert.equal((await w.api(`/posts/${data.id}/report`, { method: "POST", from: "192.0.2.3", body: { turnstile: "" } })).status, 403, "reports need Turnstile too");
    const third = await w.api(`/posts/${data.id}/report`, { method: "POST", from: "192.0.2.3", body: { reason: "rude", turnstile: "tok" } });
    assert.equal(third.data.hidden, true);
    assert.equal((await w.api(`/posts/${data.id}`)).status, 404);
    assert.ok(!(await w.api("/posts?limit=50")).data.posts.some((p) => p.id === data.id));
    assert.equal((await w.api(`/posts/${data.id}/thumb`)).status, 404, "the picture hides too");
    const hidden = await w.api("/admin/posts?status=hidden", { headers: owner });
    const h = hidden.data.posts.find((p) => p.id === data.id);
    assert.equal(h.hidden_reason, "reports");
    assert.equal(h.reports, 3);
    const reps = await w.api("/admin/reports", { headers: owner });
    assert.equal(reps.data.reports.filter((x) => x.post_id === data.id).length, 3);
    assert.equal((await w.api(`/admin/posts/${data.id}/restore`, { method: "POST", headers: owner })).status, 200);
    assert.equal((await w.api(`/posts/${data.id}`)).status, 200);
    // restored reports are resolved, so one new report does not hide it again
    assert.equal((await w.api(`/posts/${data.id}/report`, { method: "POST", from: "192.0.2.9", body: { turnstile: "tok" } })).data.hidden, false);
  });

  test("admin routes need the owner's token", async () => {
    for (const [path, method] of [["/admin/posts", "GET"], ["/admin/settings", "GET"], ["/admin/reports", "GET"], ["/admin/posts/x/hide", "POST"]]) {
      assert.equal((await w.api(path, { method })).status, 401);
      assert.equal((await w.api(path, { method, headers: { Authorization: "Bearer wrong-token-wrong-token-wrong-token" } })).status, 401);
    }
    const page = await w.api("/admin");
    assert.equal(page.status, 200);
    assert.ok(!Buffer.from(page.data).toString().includes(ADMIN), "the admin page holds no secret");
  });

  test("the owner hides, approves in review mode, bans and deletes any post", async () => {
    assert.equal((await w.api("/admin/settings", { method: "POST", headers: owner, body: { moderation: "review" } })).data.moderation, "review");
    w.newVisitor();
    const held = await w.api("/posts", { method: "POST", from: "192.0.2.50", body: post({ title: "Held", recipe: recipe("held") }) });
    assert.equal(held.data.status, "pending");
    assert.equal((await w.api(`/posts/${held.data.id}`)).status, 404, "held posts are not public");
    const pending = await w.api("/admin/posts?status=pending", { headers: owner });
    assert.ok(pending.data.posts.some((p) => p.id === held.data.id));
    assert.equal((await w.api(`/posts/${held.data.id}/thumb`, { headers: owner })).status, 200, "the owner sees held pictures");
    await w.api(`/admin/posts/${held.data.id}/approve`, { method: "POST", headers: owner });
    assert.equal((await w.api(`/posts/${held.data.id}`)).status, 200);
    await w.api("/admin/settings", { method: "POST", headers: owner, body: { moderation: "instant", report_threshold: 3 } });
    assert.equal((await w.api("/admin/settings", { method: "POST", headers: owner, body: { moderation: "lax" } })).status, 400);

    await w.api(`/admin/posts/${held.data.id}/hide`, { method: "POST", headers: owner });
    assert.equal((await w.api(`/posts/${held.data.id}`)).status, 404);

    // ban: that connection's posts hide and it cannot post again
    const spam = await w.api("/posts", { method: "POST", from: "192.0.2.66", body: post({ title: "Spam", recipe: recipe("spam") }) });
    await w.api(`/admin/posts/${spam.data.id}/ban`, { method: "POST", headers: owner });
    assert.equal((await w.api(`/posts/${spam.data.id}`)).status, 404);
    assert.equal((await w.api("/posts", { method: "POST", from: "192.0.2.66", body: post({ title: "Spam 2", recipe: recipe("spam 2") }) })).status, 403);

    const del = await w.api(`/posts/${held.data.id}`, { method: "DELETE", headers: owner });
    assert.equal(del.status, 200);
    assert.equal((await w.db.prepare("SELECT COUNT(*) AS n FROM posts WHERE id = ?").bind(held.data.id).first()).n, 0, "deleted for good");
    assert.equal((await w.api(`/admin/posts/${spam.data.id}`, { method: "DELETE", headers: owner })).status, 200);
  });

  test("the poster's private delete link removes the post; a wrong token does not", async () => {
    w.newVisitor();
    const { data } = await w.api("/posts", { method: "POST", body: post({ title: "Mine", recipe: recipe("mine") }) });
    const stored = await w.db.prepare("SELECT delete_hash FROM posts WHERE id = ?").bind(data.id).first();
    assert.notEqual(stored.delete_hash, data.delete_token, "only the hash is stored");
    assert.equal((await w.api(`/posts/${data.id}`, { method: "DELETE" })).status, 403);
    assert.equal((await w.api(`/posts/${data.id}`, { method: "DELETE", headers: { "X-Delete-Token": "x".repeat(32) } })).status, 403);
    assert.equal((await w.api(`/posts/${data.id}?token=${data.delete_token}`, { method: "DELETE" })).status, 403, "never from the address");
    assert.equal((await w.api(`/posts/${data.id}`, { method: "DELETE", headers: { "X-Delete-Token": data.delete_token } })).status, 200);
    assert.equal((await w.api(`/posts/${data.id}`)).status, 404);
    assert.equal((await w.api(`/posts/${data.id}`, { method: "DELETE", headers: { "X-Delete-Token": data.delete_token } })).status, 403, "gone");
  });

  test("IPv6: one /64 is one visitor, so rotating addresses inside it does not get round the limits", async () => {
    for (let i = 0; i < 5; i++) await w.api("/posts", { method: "POST", from: `2001:db8:77:1::${i + 1}`, body: post({ title: `v6 ${i}`, recipe: recipe(`v6 ${i}`) }) });
    assert.equal((await w.api("/posts", { method: "POST", from: "2001:db8:77:1:ffff:1:2:3", body: post({ title: "v6 x", recipe: recipe("v6 x") }) })).status, 429);
    assert.equal((await w.api("/posts", { method: "POST", from: "2001:db8:77:2::1", body: post({ title: "v6 y", recipe: recipe("v6 y") }) })).status, 201);
  });

  test("a Turnstile token made for a report cannot be used to post", async () => {
    w.newVisitor();
    assert.equal((await w.api("/posts", { method: "POST", body: post({ turnstile: "act:report@localhost", recipe: recipe("tt1") }) })).status, 403);
    assert.equal((await w.api("/posts", { method: "POST", body: post({ turnstile: "act:post@localhost", recipe: recipe("tt2") }) })).status, 201);
  });

  test("every response has a locked-down CSP; the admin page allows only its own script and style by hash", async () => {
    assert.equal((await w.api("/posts")).headers.get("Content-Security-Policy"), "default-src 'none'; frame-ancestors 'none'");
    assert.equal((await w.api("/posts")).headers.get("Referrer-Policy"), "no-referrer");
    const csp = (await w.api("/admin")).headers.get("Content-Security-Policy");
    assert.match(csp, /script-src 'sha256-[A-Za-z0-9+/=]{44}';/);
    assert.match(csp, /style-src 'sha256-[A-Za-z0-9+/=]{44}';/);
    assert.ok(!csp.includes("unsafe-inline"));
    assert.match(csp, /require-trusted-types-for 'script'/);
  });

  test("CORS: the Pages origin and localhost only", async () => {
    const pages = await w.api("/posts", { headers: { Origin: "https://megazron.github.io" } });
    assert.equal(pages.headers.get("Access-Control-Allow-Origin"), "https://megazron.github.io");
    const local = await w.api("/posts", { method: "OPTIONS", headers: { Origin: "http://localhost:5174", "Access-Control-Request-Method": "POST" } });
    assert.equal(local.status, 204);
    assert.equal(local.headers.get("Access-Control-Allow-Origin"), "http://localhost:5174");
    assert.equal((await w.api("/posts", { headers: { Origin: "http://127.0.0.1:8000" } })).headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:8000");
    for (const o of ["https://evil.example", "https://megazron.github.io.evil.example", "http://localhost.evil.example"]) {
      assert.equal((await w.api("/posts", { headers: { Origin: o } })).headers.get("Access-Control-Allow-Origin"), null, o);
    }
  });
});

describe("a server whose Turnstile secret says no", () => {
  let w;
  before(async () => { w = await startWorker({ secret: FAIL_SECRET }); });
  after(() => w.close());
  test("refuses every post", async () => {
    const r = await w.api("/posts", { method: "POST", body: post() });
    assert.equal(r.status, 403);
    assert.match(r.data.error, /human check/);
    assert.equal((await w.api("/posts")).data.posts.length, 0);
  });
});

describe("a server checking where Turnstile tokens were made, with a daily cap of 2 posts", () => {
  let w;
  before(async () => { w = await startWorker({ vars: { TURNSTILE_HOSTNAMES: "megazron.github.io,localhost", POSTS_PER_DAY: "2" } }); });
  after(() => w.close());
  test("refuses a token from another site", async () => {
    const r = await w.api("/posts", { method: "POST", body: post({ turnstile: "act:post@evil.example" }) });
    assert.equal(r.status, 403);
    assert.match(r.data.error, /another site/);
  });
  test("stops everyone once the day's cap is reached", async () => {
    assert.equal((await w.api("/posts", { method: "POST", from: "192.0.2.1", body: post({ recipe: recipe("c1") }) })).status, 201);
    assert.equal((await w.api("/posts", { method: "POST", from: "192.0.2.2", body: post({ recipe: recipe("c2") }) })).status, 201);
    const r = await w.api("/posts", { method: "POST", from: "192.0.2.3", body: post({ recipe: recipe("c3") }) });
    assert.equal(r.status, 429);
    assert.match(r.data.error, /full for today/);
  });
});

describe("a server with no ADMIN_TOKEN set", () => {
  let w;
  before(async () => { w = await startWorker({ admin: "" }); });
  after(() => w.close());
  test("has no owner routes at all", async () => {
    assert.equal((await w.api("/admin/posts", { headers: { Authorization: "Bearer " } })).status, 401);
  });
});
