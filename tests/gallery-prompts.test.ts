// The gallery's prompts are kept as their robots were designed (the house look); every other prompt gets a designed look.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { GALLERY_PROMPTS, isGalleryPrompt } from "../packages/robot-generator/src/gallery.ts";
import { understandPrompt } from "@ttr/robot-generator";

test("the generator's gallery list is the examples' prompts, every one", () => {
  const prompts = readdirSync("examples").filter((d) => /^\d\d_/.test(d)).map((d) => readFileSync(`examples/${d}/prompt.txt`, "utf8").trim());
  assert.deepEqual([...GALLERY_PROMPTS].sort(), prompts.sort());
});

test("a gallery prompt is matched as typed (case and spacing aside), nothing else is", () => {
  assert.ok(isGalleryPrompt("Create a four-wheel robot") && isGalleryPrompt("  create a   FOUR-WHEEL robot "));
  for (const p of ["Create a four-wheel robot with a camera", "a four wheel robot", "Create a four-wheel robot, red"]) assert.ok(!isGalleryPrompt(p), p);
  assert.equal(understandPrompt("Create a four-wheel robot").family, understandPrompt("a four wheel robot").family);
});
