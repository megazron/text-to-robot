// Import this instead of "@ttr/kernel" where the kernel must be usable synchronously: it finishes
// loading OpenCascade and manifold-3d (top-level await) before the importing module runs.
import { initKernel } from "./index.ts";
export * from "./index.ts";
// in a browser the .wasm files are served next to the page (deploy/build-pages.sh copies them)
// (a Web Worker has no document: its own script sits beside them)
// (a worker started from another site sets TTR_ENGINE_BASE: its own address is a blob: URL, see apps/web/src/engine/client.ts)
const g = globalThis as { document?: { baseURI: string }; WorkerGlobalScope?: unknown; location?: { href: string }; TTR_ENGINE_BASE?: string };
const base = g.TTR_ENGINE_BASE ?? g.document?.baseURI ?? (g.WorkerGlobalScope ? g.location?.href : undefined);
await initKernel(base ? { occt: new URL("./replicad_single.wasm", base).href, manifold: new URL("./manifold.wasm", base).href } : {});
