// Every WebAssembly memory the engine's kernels export, so the page can see how full this worker is. Imported first by
// browser-engine.ts, before the kernels load. manifold-3d 3.5.4 keeps about 90 kB of WASM memory per boolean even when every
// solid is deleted, WASM memory never shrinks, and one memory stops at 4 GB: after some tens of designs in one tab the
// kernel aborts. browser-api.ts starts a fresh worker before that (and after an abort) using this number.
const memories: WebAssembly.Memory[] = [];
const keep = (instance: WebAssembly.Instance) => { for (const v of Object.values(instance.exports)) if (v instanceof WebAssembly.Memory) memories.push(v); };
const W = WebAssembly as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
for (const name of ["instantiate", "instantiateStreaming"]) {
  const real = W[name]; if (!real) continue;
  W[name] = async function (this: unknown, ...a: unknown[]) {
    const r = await real.apply(this, a) as { instance?: WebAssembly.Instance } | WebAssembly.Instance;
    keep((r as { instance?: WebAssembly.Instance }).instance ?? (r as WebAssembly.Instance)); return r;
  };
}
/** The fullest kernel memory in this worker, in MB. */
export const wasmPeakMb = () => Math.round(Math.max(0, ...memories.map((m) => m.buffer.byteLength)) / 1048576);
