// The Mark 43 armour forge (packages/mesh/src/forge: what the website runs in its worker) against the Python reference it was ported from
// (scripts/forge_mark43.py, kept as the test oracle): the same pieces with the same volumes and bounds. tests/fixtures/forge_oracle.json is
// the Python forge's output at 2 mm (scripts/forge_mark43.py <dir> --print, summarised). Also: the prompt's armour words reach the forge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { forgePrint } from "../packages/mesh/src/forge/mark43.ts";
import { signedVolume, bounds } from "../packages/mesh/src/forge/mc.ts";
import { armourManifest, shapeKey, DEFAULT_SHAPE } from "@ttr/mesh";
import { suitOptions } from "../packages/robot-generator/src/suit.ts";
import { interpretPrompt } from "@ttr/robot-generator";

const oracle = JSON.parse(readFileSync(new URL("./fixtures/forge_oracle.json", import.meta.url), "utf8")) as { pieces: { name: string; link: string; material: string; region: string; volume: number; lo: number[]; hi: number[] }[]; doors: { name: string; a: number[]; up: number[]; sign: number }[] };

test("forge: forearm, hand and foot shells match the Python forge piece for piece", async () => {
  const parts = ["forearm", "hand", "foot"], got = await forgePrint({ voxel: 2 }, () => {}, parts);
  const want = oracle.pieces.filter((p) => p.material !== "lens_glow" && parts.some((k) => p.region.endsWith(k)));   // the lenses are added once, after every part
  assert.equal(got.pieces.length, want.length, "piece count");
  for (const p of got.pieces) {
    const o = want.find((x) => x.name === p.name);
    assert.ok(o, `${p.name} is not in the Python output`);
    assert.equal(p.link, o.link); assert.equal(p.material, o.material);
    const v = signedVolume(p.mesh), [lo, hi] = bounds(p.mesh);
    assert.ok(Math.abs(v - o.volume) <= Math.max(0.03 * o.volume, 60), `${p.name}: volume ${v.toFixed(0)} vs ${o.volume}`);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(lo[k] - o.lo[k]) < 1.5 && Math.abs(hi[k] - o.hi[k]) < 1.5, `${p.name}: bounds ${lo}/${hi} vs ${o.lo}/${o.hi}`);
  }
});

test("forge: the shipped pack is the forge's own output (a cache of what the website makes)", () => {
  const m = armourManifest() as unknown as { source: string; params?: { voxel: number } };
  assert.match(m.source, /forge/);
  assert.equal(m.params?.voxel, 2);
  assert.equal(shapeKey({ ...DEFAULT_SHAPE, ...(m.params as object) }), shapeKey(DEFAULT_SHAPE));
});

test("forge: armour words in a prompt reach the forge and the paint", () => {
  const t = (s: string) => suitOptions(s.toLowerCase());
  assert.deepEqual(t("a movie accurate iron man mark 43 suit").shape, DEFAULT_SHAPE);
  assert.equal(t("a bulky iron man suit").shape.bulk, 1.12);
  assert.equal(t("a sleek iron man suit").shape.bulk, 0.9);
  assert.equal(t("iron man suit 10% bulkier").shape.bulk, 1.1);
  assert.match(t("iron man suit 40% bulkier").ignored.join(), /asks for 1\.40 .* built at 1\.20/);
  // a stated amount is never quietly clamped: it is honoured within the checked range, and the result says what was built
  const big = t("iron man mark 43 with 300% bigger shoulders");
  assert.equal(big.shape.shoulder, 1.2);
  assert.match(big.ignored.join(), /asks for 4\.00 times .* built at 1\.20/);
  assert.equal(t("iron man with 15% smaller shoulders").shape.shoulder, 0.85);
  assert.equal(t("iron man mark 43 with tiny shoulders").shape.shoulder, 0.85);
  assert.equal(t("iron man armour with bigger shoulders").shape.shoulder, 1.2);
  assert.equal(t("iron man armour with smooth panels").shape.panels, "smooth");
  assert.equal(t("iron man armour with heavy plates").shape.panels, "heavy");
  const paint = t("a black and gold iron man suit with silver joints").paint;
  assert.ok(paint.base && paint.steel && !paint.trim, "black base, gold trim is the film's, silver steel");
  assert.equal(Object.keys(t("a red and gold iron man suit").paint).length, 0, "the film paint changes nothing");
});

test("forge: a shape the loaded armour was not forged with is reported, never silently ignored", () => {
  // interpretPrompt is synchronous: it builds on the pack it has. generateRobot forges first; called directly with a new shape, it says so
  const { interpretation } = interpretPrompt("a bulky Iron Man Mark 43 suit");
  assert.ok(interpretation.dimensions.some((d) => /bulkier/.test(d)));
  assert.ok(interpretation.ignored.some((x) => /not applied/.test(x)), interpretation.ignored.join("; "));
});
