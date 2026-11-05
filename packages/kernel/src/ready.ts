// Import this instead of "@ttr/kernel" where the kernel must be usable synchronously: it finishes
// loading OpenCascade and manifold-3d (top-level await) before the importing module runs.
import { initKernel } from "./index.ts";
export * from "./index.ts";
// in a browser the .wasm files are served next to the page (deploy/build-pages.sh copies them)
const doc = (globalThis as { document?: { baseURI: string } }).document;
await initKernel(doc ? { occt: new URL("./replicad_single.wasm", doc.baseURI).href, manifold: new URL("./manifold.wasm", doc.baseURI).href } : {});
