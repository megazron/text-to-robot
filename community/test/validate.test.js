import assert from "node:assert/strict";
import { test } from "node:test";
import { blockedWord, countLinks, imageType, LIMITS, normalise, recipeError, renderDescription, validatePost } from "../src/validate.js";
import { readJson } from "../src/http.js";
import { PNG, post, recipe, WEBP } from "./helpers.js";

test("a good post passes and comes back cleaned", () => {
  const { post: p, error } = validatePost(post({ title: "  Desk​   arm ", tags: "Arm, #Desk-Robot  arm", name: " Gaus " }));
  assert.equal(error, undefined);
  assert.equal(p.title, "Desk arm");
  assert.equal(p.name, "Gaus");
  assert.deepEqual(p.tags, ["arm", "desk-robot"]);
  assert.equal(p.thumbType, "png");
});

test("the post has no fields for anything personal beyond a display name", () => {
  const { post: p } = validatePost(post({ email: "a@b.c", x: "@someone", ip: "1.2.3.4" }));
  assert.deepEqual(Object.keys(p).sort(), ["description", "name", "product", "recipe", "tags", "thumb", "thumbType", "title"]);
});

test("length limits", () => {
  assert.match(validatePost(post({ title: "" })).error, /title is needed/);
  assert.match(validatePost(post({ title: "x".repeat(LIMITS.title + 1) })).error, /title/);
  assert.match(validatePost(post({ description: "x".repeat(LIMITS.description + 1) })).error, /description/);
  assert.match(validatePost(post({ name: "x".repeat(LIMITS.name + 1) })).error, /name/);
  assert.match(validatePost(post({ tags: ["a", "b", "c", "d", "e", "f"] })).error, /tags/);
  assert.match(validatePost(post({ tags: ["x".repeat(LIMITS.tag + 1)] })).error, /tag/);
});

test("product must be one of the two", () => {
  assert.equal(validatePost(post({ product: "robot-studio" })).error, undefined);
  assert.match(validatePost(post({ product: "other" })).error, /product/);
});

test("links: at most three, only in the description, rendered escaped with rel nofollow ugc", () => {
  assert.equal(countLinks("see https://a.example/x and [docs](https://b.example) and http://c.example"), 3);
  assert.match(validatePost(post({ description: "https://a.io https://b.io https://c.io https://d.io" })).error, /3 links/);
  assert.match(validatePost(post({ title: "visit https://spam.example" })).error, /links go in the description/);
  assert.match(validatePost(post({ name: "www.spam.example" })).error, /links go in the description/);
  const html = renderDescription('<script>alert(1)</script> "x" [my build](https://e.example/a?b=1&c=2)\nline 2 javascript:alert(1)');
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('<a href="https://e.example/a?b=1&amp;c=2" rel="nofollow ugc noopener" target="_blank">my build</a>'));
  assert.ok(html.includes("<br>line 2"));
  assert.ok(!/href="javascript/.test(html));
  assert.equal(renderDescription("[x](javascript:alert(1))").includes("<a"), false);
});

test("the word filter: whole words, look-alike digits and spaced-out letters, and no Scunthorpe problem", () => {
  assert.equal(blockedWord("A tidy assembly with a butt joint, a suction cup that sucks, in Scunthorpe"), null);
  assert.equal(blockedWord("Cocked spring, grease nipple, a strap on the harness, hard core PLA"), null);
  assert.ok(blockedWord("what a fucking arm"));
  assert.ok(blockedWord("sh1t"));
  assert.ok(blockedWord("f u c k"));
  assert.ok(blockedWord("F.U.C.K"));
  assert.ok(blockedWord("BLOWJOB bot"));
  assert.match(validatePost(post({ title: "shit arm" })).error, /not allowed/);
  assert.match(validatePost(post({ name: "fuckface" })).error, /not allowed/);
  assert.match(validatePost(post({ tags: ["shit"] })).error, /not allowed/);
  assert.equal(normalise("Ünïcödé  6-DOF"), "unicode 6 dof");
});

test("pictures: PNG or WebP by magic bytes, at most 300 KB", () => {
  assert.equal(imageType(PNG), "png");
  assert.equal(imageType(WEBP), "webp");
  assert.equal(imageType(Buffer.from("GIF89a....")), null);
  assert.equal(validatePost(post({ thumbnail: WEBP.toString("base64") })).post.thumbType, "webp");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
  assert.match(validatePost(post({ thumbnail: jpeg.toString("base64") })).error, /PNG or WebP/);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.match(validatePost(post({ thumbnail: svg.toString("base64") })).error, /PNG or WebP/);
  const big = Buffer.concat([PNG, Buffer.alloc(LIMITS.thumbBytes)]);
  assert.match(validatePost(post({ thumbnail: big.toString("base64") })).error, /300 KB/);
  assert.match(validatePost(post({ thumbnail: "not base64!" })).error, /picture is missing/);
  assert.match(validatePost(post({ thumbnail: undefined })).error, /picture is missing/);
});

test("the design recipe: a make= or robot= share hash, checked", () => {
  assert.equal(recipeError(recipe("Create an arm", { a: 1, t: 2, m: ["make it longer"] })), null);
  assert.equal(recipeError("robot=AbC-_123"), null);
  assert.match(recipeError(""), /missing/);
  assert.match(recipeError("https://evil.example"), /not a share link/);
  assert.match(recipeError("make=!!!"), /not a share link/);
  assert.match(recipeError(`make=${Buffer.from("{nope").toString("base64url")}`), /damaged/);
  assert.match(recipeError(recipe("")), /no prompt/);
  assert.match(recipeError(recipe("x", { t: -1 })), /damaged/);
  assert.match(recipeError(recipe("x", { m: [1] })), /damaged/);
  assert.match(recipeError(recipe("x", { evil: true })), /damaged/);
  assert.match(recipeError(`robot=${"a".repeat(LIMITS.recipe)}`), /too large/);
});

test("a body over the cap is refused while it is read, even without a Content-Length", async () => {
  let pulled = 0;
  const big = new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(64 * 1024).fill(32)); } });
  const r = await readJson(new Request("https://x.test/", { method: "POST", body: big, duplex: "half" }));
  assert.equal(r.tooLarge, true);
  assert.ok(pulled < 20, "stopped reading near the cap");
  assert.deepEqual(await readJson(new Request("https://x.test/", { method: "POST", body: '{"a":1}' })), { body: { a: 1 } });
  assert.deepEqual(await readJson(new Request("https://x.test/", { method: "POST", body: "{no" })), { body: null });
  assert.equal((await readJson(new Request("https://x.test/", { method: "POST", body: "x", headers: { "Content-Length": String(LIMITS.body + 1) } }))).tooLarge, true);
});
