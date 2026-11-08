// One worker of the forge's pool (pool.ts): its own manifold-3d, answering solid jobs (jobs.ts). Runs as a Web Worker on the website
// (bundled as forge-worker.js) and as a worker_threads worker in Node.
import Manifold from "manifold-3d";
import { useManifold } from "./geo.ts";
import { answerJob } from "./jobs.ts";
import type { Job } from "./pool.ts";

let ready: Promise<void> | undefined;
const init = (wasm?: string) => (ready ??= (async () => { const m = await (Manifold as unknown as (o?: object) => Promise<any>)(wasm ? { locateFile: () => wasm } : undefined); m.setup(); useManifold(m); })());

const g = globalThis as any;
if (typeof g.WorkerGlobalScope !== "undefined" && g instanceof g.WorkerGlobalScope) {
  // a Web Worker: the page's engine sends {wasm} first, then jobs
  g.onmessage = async ({ data }: MessageEvent) => {
    if (data.wasm) { await init(data.wasm); return; }
    try { await init(); g.postMessage({ id: data.id, result: await answerJob(data.job) }); }
    catch (e) { g.postMessage({ id: data.id, error: String((e as Error)?.message ?? e) }); }
  };
} else {
  const wt = await import("node:worker_threads");
  if (!wt.isMainThread && wt.parentPort) {
    const port = wt.parentPort;
    port.on("message", async (data: { id: number; job: Job }) => {
      try { await init(); port.postMessage({ id: data.id, result: await answerJob(data.job) }); }
      catch (e) { port.postMessage({ id: data.id, error: String((e as Error)?.message ?? e) }); }
    });
  }
}
