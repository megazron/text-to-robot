// The site's downloads: a deflated zip that standard tools open, byte for byte the files given.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error: plain JavaScript module without types
import { makeZip, makeZipDeflated } from "../apps/web/public/robotkit.js";

test("makeZipDeflated writes an archive Python's zipfile reads back exactly, smaller than the stored one", async () => {
  const stl = new Uint8Array(200_000); for (let i = 0; i < stl.length; i++) stl[i] = (i * 7) % 13;
  const files = { "pkg/urdf/robot.urdf": "<robot name=\"r\">" + "<link name=\"a\"/>".repeat(500) + "</robot>", "pkg/meshes/a.stl": stl, "pkg/empty.txt": "", "pkg/b64.bin": { b64: Buffer.from([1, 2, 3, 250]).toString("base64") } };
  const deflated = new Uint8Array(await (await makeZipDeflated(files)).arrayBuffer()), stored = new Uint8Array(await makeZip(files).arrayBuffer());
  assert.ok(deflated.length < stored.length / 3, `${deflated.length} vs ${stored.length}`);
  const dir = mkdtempSync(join(tmpdir(), "ttr-zip-")), path = join(dir, "a.zip");
  try {
    writeFileSync(path, deflated);
    const out = execFileSync("python3", ["-c", "import sys,zipfile,hashlib,json\nz=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None\nprint(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))", path], { encoding: "utf8" });
    const got = JSON.parse(out), sha = (b: Uint8Array | string) => execFileSync("sha256sum", { input: b }).toString().split(" ")[0];
    assert.deepEqual(Object.keys(got).sort(), Object.keys(files).sort());
    assert.equal(got["pkg/meshes/a.stl"], sha(stl));
    assert.equal(got["pkg/urdf/robot.urdf"], sha(files["pkg/urdf/robot.urdf"]));
    assert.equal(got["pkg/b64.bin"], sha(new Uint8Array([1, 2, 3, 250])));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the site links to its source, docs, licence, terms, privacy and fan-work notice, and every linked file exists", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const html = readFileSync("apps/web/public/index.html", "utf8");
  for (const f of ["LICENSE", "TERMS.md", "PRIVACY.md", "NOTICE.md"]) {
    assert.ok(html.includes(`https://github.com/megazron/text-to-robot/blob/main/${f}`), f);
    assert.ok(existsSync(f), `${f} is in the repo`);
  }
  assert.ok(html.includes('href="https://github.com/megazron/text-to-robot"'));
});
