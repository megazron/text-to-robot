// The website's sentence model plugs into the open-vocabulary fallback through registerEmbedder: a prompt the rules and
// the word table cannot place is matched by meaning, the path is said, and a model that fails never blocks a design.
// A fake embedder stands in for MiniLM here (the real one downloads from Hugging Face).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, registerEmbedder, type Embedder } from "@ttr/robot-generator";

/** Two axes: fish-keeping words (it knows "koi" is a fish, as a sentence model does) and everything else. */
const AXES = [/\b(?:koi|fish|aquarium)\b/i, /./];
const fake: Embedder = {
  name: "test sentence model", threshold: 0.3,
  async embed(texts) { return texts.map((t) => { const v = [AXES[0].test(t) ? 1 : 0, AXES[0].test(t) ? 0 : 0.2]; const n = Math.hypot(...v) || 1; return v.map((x) => x / n); }); },
};

test("a prompt nothing else reads is matched by the registered sentence model, and the path says so", async () => {
  registerEmbedder(fake);
  try {
    const r = await generateRobot("keep my koi content");
    assert.match(r.interpretation!.path, /^similarity \(test sentence model, /);
    assert.match(r.designedBy, /closest task by meaning/);
  } finally { registerEmbedder(undefined); }
});

test("a sentence model that fails to load falls back to the word table and never blocks a design", async () => {
  registerEmbedder({ name: "broken", threshold: 0.3, embed: () => Promise.reject(new Error("offline")) });
  try {
    await assert.rejects(generateRobot("keep my koi content"), /not recognised|could not find/i);
    const r = await generateRobot("a robot that waters my plants");
    assert.equal(r.interpretation?.path, "knowledge table");
  } finally { registerEmbedder(undefined); }
});
