// How much of this device the engine uses at once: its workers, from what the browser says about the device.
//   workers = cores - 1, at least 1 and at most 6 (one core stays with the page);
//   at most 2 with 4 GB of memory or less, 1 with 2 GB or less (each worker holds its own WebAssembly kernels, 300 MB to 1 GB
//   while it designs a big robot);
//   light: a phone or small tablet (a coarse pointer and 4 GB or less): no work while the page is hidden, nothing started
//   ahead of time.
// After a worker dies (out of memory) the tab runs one worker fewer from then on, never fewer than one, so it cannot fall
// into a crash loop. The browser's memory figures for the page (performance.memory, Chrome only) count as pressure too.
export interface DevicePlan { cores: number; memory_gb: number | null; coarse: boolean; workers: number; light: boolean; reason: string[]; }

export function devicePlan(nav: { hardwareConcurrency?: number; deviceMemory?: number }, matchMedia?: (q: string) => { matches: boolean }, asked?: string | null): DevicePlan {
  const cores = Math.max(1, Math.floor(nav.hardwareConcurrency || 2)), mem = typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 ? nav.deviceMemory : null;
  let coarse = false; try { coarse = !!matchMedia?.("(pointer: coarse)").matches; } catch { /* no media queries: a desktop */ }
  const reason: string[] = [`${cores} cores`];
  let workers = Math.min(6, Math.max(1, cores - 1));
  if (mem !== null) {
    reason.push(`${mem} GB`);
    if (mem <= 2) workers = 1; else if (mem <= 4) workers = Math.min(workers, 2);
  }
  const light = coarse && (mem === null || mem <= 4);
  if (light) reason.push("phone or small tablet: light schedule");
  const n = asked ? Number(asked) : NaN;
  if (Number.isInteger(n) && n >= 1) { workers = Math.min(6, n); reason.push(`?workers=${workers}`); }
  return { cores, memory_gb: mem, coarse, workers, light, reason };
}

/** One worker fewer after a crash or under memory pressure (never fewer than one). */
export function backedOff(p: DevicePlan, why: string): DevicePlan {
  return p.workers <= 1 ? { ...p, reason: [...p.reason, why] } : { ...p, workers: p.workers - 1, reason: [...p.reason, `${why}: ${p.workers - 1} workers`] };
}

/** Is the page short of memory now? Chrome's JS heap figure for the page, where there is one. */
export function underPressure(): boolean {
  const m = (globalThis.performance as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } } | undefined)?.memory;
  return !!m && m.jsHeapSizeLimit > 0 && m.usedJSHeapSize / m.jsHeapSizeLimit > 0.75;
}
/** The whole tab's memory where the browser can say (a cross-origin isolated page, performance.measureUserAgentSpecificMemory),
 *  against the device's: over half of it is pressure. Undefined when it cannot be measured (GitHub Pages is not isolated). */
export async function tabMemoryPressure(memoryGb: number | null): Promise<boolean | undefined> {
  const perf = globalThis.performance as { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> } | undefined;
  if (!memoryGb || !(globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated || !perf?.measureUserAgentSpecificMemory) return undefined;
  try { return (await perf.measureUserAgentSpecificMemory()).bytes > 0.5 * memoryGb * 2 ** 30; } catch { return undefined; }
}

/** A phone or laptop on battery and low (Chrome's Battery Status API): the light schedule for the rest of the visit. */
export async function onLowBattery(): Promise<boolean> {
  try {
    const b = await (navigator as { getBattery?: () => Promise<{ charging: boolean; level: number }> }).getBattery?.();
    return !!b && !b.charging && b.level < 0.2;
  } catch { return false; }
}

/** Does this browser run WebAssembly SIMD? (the smallest module with a v128 instruction, as wasm-feature-detect tests it).
 *  The CAD kernel (OpenCascade, replicad-opencascadejs) ships only as a SIMD build; manifold-3d ships only without SIMD. */
export function wasmSimd(): boolean {
  try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); }
  catch { return false; }
}
