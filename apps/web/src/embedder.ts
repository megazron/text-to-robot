// "Smarter reading" on the website: a small sentence-embedding model (all-MiniLM-L6-v2, 8-bit, about 23 MB of weights
// plus the ONNX runtime's WebAssembly) compares a prompt the word table could not place with every task, object and
// animal the table knows. Built as its own file (embed.js) and imported by the engine worker only when the visitor
// switches it on; the browser caches the model, so it downloads once. If it cannot load, the word table answers.
import { pipeline, env } from "@huggingface/transformers";
import type { Embedder } from "@ttr/robot-generator";

/** What switching it on downloads, measured from the files (scripts/check_site.py keeps the site itself free of it). */
export const DOWNLOAD_MB = 30;   // 23 MB of weights (served as is) + the 27 MB runtime, 7 MB compressed
export const MODEL = "Xenova/all-MiniLM-L6-v2";

export function createEmbedder(onProgress?: (p: { file?: string; progress?: number; status: string }) => void): Embedder {
  env.allowLocalModels = false;   // nothing is looked up on this site's own server
  let fe: Promise<(t: string[], o: object) => Promise<{ tolist(): number[][] }>> | undefined;
  const load = () => (fe ??= pipeline("feature-extraction", MODEL, { dtype: "q8", progress_callback: onProgress as never }) as never);
  return {
    name: "MiniLM sentence model",
    // calibrated on prompts the word table misses (scripts/calibrate_embedder.ts): below it the nearest entry is a guess
    threshold: 0.3,
    async embed(texts: string[]) {
      const f = await load();
      // empty descriptions (named robots, found by name only) become zero vectors
      const idx = texts.map((t, i) => (t.trim() ? i : -1)).filter((i) => i >= 0);
      const out = idx.length ? (await f(idx.map((i) => texts[i]), { pooling: "mean", normalize: true })).tolist() : [];
      const dim = out[0]?.length ?? 384, res = texts.map(() => new Array(dim).fill(0) as number[]);
      idx.forEach((i, k) => { res[i] = out[k]; });
      return res;
    },
  };
}
