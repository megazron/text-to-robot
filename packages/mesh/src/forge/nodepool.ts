// The forge's pool in Node: worker_threads, each running poolworker.ts with its own manifold-3d.
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { workerPool, type Pool } from "./pool.ts";

export function nodePool(size = Math.max(1, Math.min(6, availableParallelism() - 2))): Pool {
  return workerPool(size, () => {
    const w = new Worker(new URL("./poolworker.ts", import.meta.url));
    return { post: (m) => w.postMessage(m), on: (fn) => { w.on("message", fn); }, end: () => { void w.terminate(); } };
  });
}
