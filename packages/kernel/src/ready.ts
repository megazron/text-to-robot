// Import this instead of "@ttr/kernel" where the kernel must be usable synchronously: it finishes
// loading OpenCascade and manifold-3d (top-level await) before the importing module runs.
import { initKernel } from "./index.ts";
export * from "./index.ts";
await initKernel();
