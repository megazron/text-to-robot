// Results of the engine's expensive, pure steps, kept by their exact input: a printed part's solid (its mesh and print
// check, @ttr/solid), a CAD part's files (@ttr/kernel). Each step looks here first and adds what it made.
//
// The same input always gives the same bytes (the engine is deterministic), so a result found here is the result the step
// would compute. Two layers:
//   - in memory, always: identical parts in one design (four legs, two arms, a part rebuilt by a sizing loop) are built once;
//   - a persistent store when one is set (the website keeps one in IndexedDB, apps/web/src/result-cache.ts): it is loaded
//     before a request runs, so the lookups here stay synchronous, and it is versioned by the engine's build hash.
// Values are kept as compact, structured-cloneable records (typed arrays, numbers, strings) and decoded into fresh objects
// on every hit: no caller ever shares a mutable result with another.

export interface ResultStore {
  /** a result loaded for this request, or undefined */
  get(kind: string, input: string): unknown | undefined;
  /** a result just computed */
  put(kind: string, input: string, value: unknown, bytes: number): void;
}
let store: ResultStore | undefined;
/** Set (or clear) the persistent layer. */
export const setResultStore = (s: ResultStore | undefined) => { store = s; };
export const resultStore = () => store;

// in memory: least recently used first out, bounded by size
const MEM_BYTES = 192 * 1024 * 1024;
const mem = new Map<string, { value: unknown; bytes: number }>();
let memBytes = 0;
/** Counters for the profile (docs/PERFORMANCE.md). */
export const memoStats = { hits: 0, storeHits: 0, misses: 0 };

/**
 * `make` computes the result, `encode` turns it into a stored record (and its size in bytes), `decode` makes a fresh result
 * from a record. The input string is the whole key: equal inputs, equal results.
 */
export function remembered<T, R>(kind: string, input: string, make: () => T, encode: (x: T) => { rec: R; bytes: number }, decode: (r: R) => T): T {
  const k = `${kind}\u0000${input}`, hit = mem.get(k);
  if (hit) { mem.delete(k); mem.set(k, hit); memoStats.hits++; return decode(hit.value as R); }
  const kept = store?.get(kind, input) as R | undefined;
  if (kept !== undefined) { memoStats.storeHits++; keep(k, kept, 0); return decode(kept); }
  memoStats.misses++;
  const x = make(), { rec, bytes } = encode(x);
  keep(k, rec, bytes);
  store?.put(kind, input, rec, bytes);
  return decode(rec);
}
function keep(k: string, value: unknown, bytes: number) {
  const b = bytes || estimate(value);
  mem.set(k, { value, bytes: b }); memBytes += b;
  while (memBytes > MEM_BYTES && mem.size > 1) { const [old, e] = mem.entries().next().value as [string, { bytes: number }]; mem.delete(old); memBytes -= e.bytes; }
}
function estimate(v: unknown): number {
  if (v == null) return 8;
  if (ArrayBuffer.isView(v)) return v.byteLength;
  if (typeof v === "string") return v.length * 2;
  if (typeof v !== "object") return 8;
  let n = 16; for (const x of Object.values(v as object)) n += estimate(x);
  return n;
}
/** Forget everything kept in memory (tests, and a worker handing its memory back). */
export function clearRemembered() { mem.clear(); memBytes = 0; }

/** Triangle meshes as flat typed arrays (exact: Float64 keeps every coordinate bit). */
export type V3 = [number, number, number];
export function packMesh(m: { v: V3[]; f: V3[] }): { v: Float64Array; f: Uint32Array } {
  const v = new Float64Array(m.v.length * 3), f = new Uint32Array(m.f.length * 3);
  for (let i = 0; i < m.v.length; i++) { const p = m.v[i]; v[i * 3] = p[0]; v[i * 3 + 1] = p[1]; v[i * 3 + 2] = p[2]; }
  for (let i = 0; i < m.f.length; i++) { const t = m.f[i]; f[i * 3] = t[0]; f[i * 3 + 1] = t[1]; f[i * 3 + 2] = t[2]; }
  return { v, f };
}
export function unpackMesh(p: { v: Float64Array; f: Uint32Array }): { v: V3[]; f: V3[] } {
  const v: V3[] = new Array(p.v.length / 3), f: V3[] = new Array(p.f.length / 3);
  for (let i = 0; i < v.length; i++) v[i] = [p.v[i * 3], p.v[i * 3 + 1], p.v[i * 3 + 2]];
  for (let i = 0; i < f.length; i++) f[i] = [p.f[i * 3], p.f[i * 3 + 1], p.f[i * 3 + 2]];
  return { v, f };
}

/** Is a result kept (in memory or in the store loaded for this request)? */
export function isRemembered(kind: string, input: string): boolean {
  return mem.has(`${kind}\u0000${input}`) || store?.get(kind, input) !== undefined;
}
/** A result made elsewhere (a helper worker ran the same step on the same input): kept as if made here. */
export function primeRemembered(kind: string, input: string, rec: unknown, bytes: number) {
  const k = `${kind}\u0000${input}`;
  if (mem.has(k)) return;
  keep(k, rec, bytes);
  store?.put(kind, input, rec, bytes);
}
/** Steps whose results helpers can make (kind -> make the stored record from the input). Registered by @ttr/solid and @ttr/kernel. */
export const makers = new Map<string, (input: string) => { rec: unknown; bytes: number }>();
