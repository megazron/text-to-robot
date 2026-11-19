// Where the engine's time goes, by stage (docs/PERFORMANCE.md). Off unless switched on: then each stage's own time is added
// up (time spent in a stage nested inside it is counted to the inner one), so the stages of a request sum to its total.
const now = () => (globalThis.performance ?? Date).now();
let on = false;
const self = new Map<string, number>(), calls = new Map<string, number>();
const stack: { name: string; t0: number; inner: number }[] = [];
export function profiling(enable: boolean) { on = enable; self.clear(); calls.clear(); stack.length = 0; }
/** Run `fn` as the stage `name`. */
export function stage<T>(name: string, fn: () => T): T {
  if (!on) return fn();
  const f = { name, t0: now(), inner: 0 }; stack.push(f);
  try { return fn(); }
  finally {
    stack.pop(); const dt = now() - f.t0;
    self.set(name, (self.get(name) ?? 0) + dt - f.inner); calls.set(name, (calls.get(name) ?? 0) + 1);
    if (stack.length) stack[stack.length - 1].inner += dt;
  }
}
/** Seconds of own time per stage, and how many times each ran, since profiling was switched on. */
export function profile(): Record<string, { s: number; n: number }> {
  return Object.fromEntries([...self].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { s: +(v / 1000).toFixed(3), n: calls.get(k) ?? 0 }]));
}
