// The parts pool in Node: worker_threads, each running worker.ts with its own kernels (tests, scripts).
import { Worker } from "node:worker_threads";
import { workerPool, type Pool } from "../forge/pool.ts";

export function nodePartsPool(size: number): Pool {
  return workerPool(size, () => {
    const w = new Worker(new URL("./worker.ts", import.meta.url));
    return { post: (m) => w.postMessage(m), on: (fn) => { w.on("message", fn); }, end: () => { void w.terminate(); } };
  });
}
