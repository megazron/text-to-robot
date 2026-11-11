// Several manifold-3d instances working at once. manifold-3d's WASM build runs on one thread, so the heavy, independent solid work of the
// pack (the copies of a sweep, the angles a door is tried at, the limb limits) is shared out to workers: Web Workers on the website,
// worker_threads in Node. Without a pool everything runs here, one job after another, with the same results.
import type { TriMesh } from "./mc.ts";
import type { P3 } from "./geo.ts";

export interface Job { op: string; args: Record<string, unknown>; }
export interface Pool { size: number; run<T>(job: Job): Promise<T>; close(): void;
  /** stops every job at once (a cancelled forge): the workers are ended, their jobs fail, and fresh workers take their place */
  abort?(): void;
  /** starts fresh workers once the queue is empty: a WebAssembly heap never shrinks, so this is how a stage's peak memory is given back */
  recycle?(): Promise<void>; }

let pool: Pool | undefined;
export const setPool = (p: Pool | undefined) => { pool = p; };
export const getPool = () => pool;

/** Runs jobs on whatever pool is set, else here, one after another (`local` runs one job in this thread). */
export async function runAll<T>(jobs: Job[], local: (job: Job) => T | Promise<T>): Promise<T[]> {
  if (!pool || jobs.length < 2) { const out: T[] = []; for (const j of jobs) out.push(await local(j)); return out; }
  return Promise.all(jobs.map((j) => pool!.run<T>(j)));
}

/** A pool over workers that each answer {id, job} with {id, result} or {id, error}. `make` starts one worker. */
export function workerPool(size: number, make: () => { post(m: unknown, transfer?: ArrayBuffer[]): void; on(fn: (m: { id: number; result?: unknown; error?: string }) => void): void; end(): void }): Pool {
  let ws = Array.from({ length: size }, make), idle = [...ws];
  const queue: [Job, (x: unknown) => void, (e: Error) => void][] = [], waiting = new Map<number, [(x: unknown) => void, (e: Error) => void, (typeof ws)[number]]>();
  let next = 1;
  const pump = () => {
    while (idle.length && queue.length) {
      const w = idle.pop()!, [job, ok, fail] = queue.shift()!, id = next++;
      waiting.set(id, [ok, fail, w]);
      w.post({ id, job });
    }
  };
  const listen = (w: (typeof ws)[number]) => w.on((m) => {
    const h = waiting.get(m.id); if (!h) return;
    waiting.delete(m.id); idle.push(h[2]);
    if (m.error) h[1](new Error(m.error)); else h[0](m.result);
    pump();
  });
  for (const w of ws) listen(w);
  return {
    size,
    run: <T>(job: Job) => new Promise<T>((ok, fail) => { queue.push([job, ok as (x: unknown) => void, fail]); pump(); }),
    close: () => { for (const w of ws) w.end(); },
    abort: () => {
      for (const w of ws) w.end();
      const failed = new Error("the forge was cancelled");
      for (const [, h] of waiting) h[1](failed);
      for (const q of queue) q[2](failed);
      waiting.clear(); queue.length = 0;
      ws = Array.from({ length: size }, make); idle.splice(0, idle.length, ...ws); for (const w of ws) listen(w);
    },
    recycle: async () => {
      while (waiting.size || queue.length) await new Promise((r) => setTimeout(r, 50));
      for (const w of ws) w.end();
      ws = Array.from({ length: size }, make); idle.splice(0, idle.length, ...ws); for (const w of ws) listen(w);
    },
  };
}

export type MeshMsg = { v: Float64Array; f: Uint32Array };
export const msg = (m: TriMesh): MeshMsg => ({ v: m.v, f: m.f });
export type Box = [P3, P3];
