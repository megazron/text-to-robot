// One helper of the parts pool (prefetch.ts): its own CAD kernels, answering {id, job: {op: "part", args: {kind, input}}} with
// the stored record of that part (the same record the engine would keep). A Web Worker on the website (parts-worker.js, sent
// {base} first: where the .wasm files are), a worker_threads worker in Node.
import { makers } from "@ttr/parts/memo";

const g = globalThis as any;
let ready: Promise<void> | undefined;
// the kernels load on the first job (@ttr/kernel/ready waits for both WebAssembly modules; @ttr/solid loads manifold-3d)
const load = () => (ready ??= (async () => { await import("@ttr/solid"); await import("@ttr/kernel/ready"); })());
async function answer(job: { op: string; args: { kind: string; input: string } }) {
  if (job.op !== "part") throw new Error(`unknown job ${job.op}`);
  await load();
  const make = makers.get(job.args.kind); if (!make) throw new Error(`no maker for ${job.args.kind}`);
  return make(job.args.input);
}
const transfers = (r: { rec: any }) => Object.values(r.rec).filter((v): v is ArrayBufferView => ArrayBuffer.isView(v)).map((v) => v.buffer as ArrayBuffer);
if (typeof g.WorkerGlobalScope !== "undefined" && g instanceof g.WorkerGlobalScope) {
  g.onmessage = async ({ data }: MessageEvent) => {
    if (data.base) { g.TTR_ENGINE_BASE = data.base; return; }
    try { const r = await answer(data.job); g.postMessage({ id: data.id, result: r }, transfers(r)); }
    catch (e) { g.postMessage({ id: data.id, error: String((e as Error)?.message ?? e) }); }
  };
  // listening now: the engine sends nothing before this (a message sent to a worker still loading its script can be lost)
  g.postMessage({ ready: true });
} else {
  const wt = await import("node:worker_threads");
  if (!wt.isMainThread && wt.parentPort) {
    const port = wt.parentPort;
    port.on("message", async (data: { id: number; job: { op: string; args: { kind: string; input: string } } }) => {
      try { const r = await answer(data.job); port.postMessage({ id: data.id, result: r }, transfers(r)); }
      catch (e) { port.postMessage({ id: data.id, error: String((e as Error)?.message ?? e) }); }
    });
  }
}
