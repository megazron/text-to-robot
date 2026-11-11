// The website's Mark 43 gate (packages/mesh/src/armourpack.ts as apps/web/src/browser-engine.ts sets it up): the reference suit comes
// ready-made from the shipped pack, and any other shape is never forged without the visitor's go-ahead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ensureArmourPack, setArmourSource, setPrebuilt, setForgeGate, ForgeNeedsConsent, armourShape, DEFAULT_SHAPE, type ArmourManifest } from "@ttr/mesh";

const dir = new URL("../packages/parts/data/", import.meta.url);

test("gate: the reference suit is served ready-made, a custom shape asks first", async () => {
  setArmourSource("forge");   // as on the website: nothing is read from disk by the pack module itself
  let fetched = 0;
  setPrebuilt(async () => {
    fetched++;
    return { manifest: JSON.parse(readFileSync(new URL("mark43_pack.json", dir), "utf8")) as ArmourManifest, bytes: new Uint8Array(readFileSync(new URL("mark43_pack.bin", dir))) };
  });
  const asked: unknown[] = [];
  setForgeGate((shape) => { asked.push(shape); return false; });

  assert.equal(await ensureArmourPack(DEFAULT_SHAPE), "prebuilt");
  assert.equal(fetched, 1);
  assert.deepEqual(armourShape(), DEFAULT_SHAPE);
  assert.equal(asked.length, 0, "the reference suit never asks");
  assert.equal(await ensureArmourPack(DEFAULT_SHAPE), "loaded");

  const custom = { bulk: 1.12, shoulder: 1, panels: "film" as const };
  await assert.rejects(ensureArmourPack(custom), (e: unknown) => e instanceof ForgeNeedsConsent && e.shape.bulk === 1.12);
  assert.deepEqual(asked, [custom]);
  assert.deepEqual(armourShape(), DEFAULT_SHAPE, "a refused forge leaves the loaded suit as it was");
});
