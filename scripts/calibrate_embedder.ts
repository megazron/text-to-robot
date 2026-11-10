// Calibrates the website's sentence-model threshold (apps/web/src/embedder.ts) on prompts the word table misses.
//   node scripts/calibrate_embedder.ts <models dir holding Xenova/all-MiniLM-L6-v2>
import { pipeline, env } from "@huggingface/transformers";
import { KNOWLEDGE } from "../packages/robot-generator/src/knowledge.ts";
env.localModelPath = process.argv[2] ?? "models/"; env.allowRemoteModels = !process.argv[2];
const fe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
const emb = async (t: string[]) => (await fe(t, { pooling: "mean", normalize: true })).tolist() as number[][];
const KN = KNOWLEDGE.filter((k) => k.kind !== "named" && k.about); const docs = KN.map((k) => k.about);
const D = await emb(docs);
const tests = ["hydrate my succulents", "something to keep the koi happy", "help me with the dishes", "a contraption that sketches my face", "a robot that hunts for truffles", "tidy up my kids' toys",
  "make my morning espresso", "a buddy for my lonely hamster", "look after my grandma at night", "a xylophone", "the meaning of life", "a purple elephant sandwich", "qwerty uiop", "an umbrella holder", "a robot that does my taxes"];
for (const t of tests) {
  const [q] = await emb([t.replace(/\b(?:a|an|the|robot|bot|machine|contraption|something|that|to|my)\b/gi, " ").trim()]);
  const s = D.map((d, i) => [d.reduce((a, x, j) => a + x * q[j], 0), i] as const).sort((a, b) => b[0] - a[0]);
  console.log(t.padEnd(44), s.slice(0, 2).map(([v, i]) => `${KN[i].id} ${v.toFixed(3)}`).join("  |  "));
}
