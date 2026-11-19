// The website's persistent result cache, in IndexedDB: the engine's expensive pure results (printed solids, CAD part files)
// and whole answers to deterministic requests, kept across visits so a robot made before opens at once.
//
// Correctness: every entry is keyed by a SHA-256 of (engine build hash, kind, exact input) and stores its input, and a hit
// is only taken when the stored input equals the asked one. The engine build hash (TTR_ENGINE_HASH, written by
// deploy/build-pages.sh from the engine's sources and locked dependencies) is part of every key, so a changed engine never
// reads an older engine's results. The engine is deterministic: a result found here is byte for byte the one it would make.
//
// Lookups inside the engine are synchronous (@ttr/parts/memo), so a request's results are loaded before it runs: each request
// names a group (its prompt, or the robot it acts on), the group lists the entries it used last time, and those are read first.
//
// Size: capped at the smaller of 200 MB and a tenth of what navigator.storage.estimate() allows this site; the least recently
// used entries go first. Private mode or a full disk: every write fails quietly and the engine runs as if there were no cache.
import { setResultStore, type ResultStore } from "@ttr/parts/memo";

const DB = "ttr-results", VERSION = 1, ENTRIES = "entries", META = "meta", GROUPS = "groups";
const HARD_CAP = 200 * 1024 * 1024;
interface Entry { key: string; kind: string; input: string; rec: unknown; bytes: number; }
/** the small record per entry the size cap walks (oldest used first), so trimming never reads the results themselves */
interface Meta { key: string; bytes: number; used: number; }
interface Group { key: string; keys: string[]; used: number; }
interface Snapshot { group: string; fresh: { kind: string; input: string; rec: unknown; bytes: number }[]; touched: string[]; }

const enc = new TextEncoder();
async function sha(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
  let s = ""; for (const b of d) s += b.toString(16).padStart(2, "0");
  return s;
}
const req = <T>(r: IDBRequest<T>) => new Promise<T>((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
const done = (t: IDBTransaction) => new Promise<void>((ok, fail) => { t.oncomplete = () => ok(); t.onerror = () => fail(t.error); t.onabort = () => fail(t.error); });

export class ResultCache implements ResultStore {
  private db: Promise<IDBDatabase | null>;
  /** entries loaded for the request that is running: kind \0 input -> stored record */
  private hot = new Map<string, unknown>();
  /** what the running request made: written when it ends */
  private fresh = new Map<string, { kind: string; input: string; rec: unknown; bytes: number }>();
  /** every entry the running request used, found or made: the group's list for next time */
  private touched = new Set<string>();
  readonly stats = { hits: 0, puts: 0, responseHits: 0, evicted: 0 };
  readonly version: string;
  constructor(version: string) {
    this.version = version;
    this.db = new Promise((ok) => {
      try {
        const r = indexedDB.open(DB, VERSION);
        r.onupgradeneeded = () => {
          r.result.createObjectStore(ENTRIES, { keyPath: "key" });
          r.result.createObjectStore(META, { keyPath: "key" }).createIndex("used", "used");
          r.result.createObjectStore(GROUPS, { keyPath: "key" });
        };
        r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); r.onblocked = () => ok(null);
      } catch { ok(null); }
    });
  }
  /** this engine's key for a kind and an input */
  keyOf(kind: string, input: string) { return sha(`${this.version}\u0000${kind}\u0000${input}`); }

  // ---- the synchronous side the engine sees (ResultStore)
  get(kind: string, input: string) {
    const k = `${kind}\u0000${input}`, r = this.hot.get(k);
    if (r !== undefined) { this.stats.hits++; this.touched.add(k); }
    return r;
  }
  put(kind: string, input: string, rec: unknown, bytes: number) {
    const k = `${kind}\u0000${input}`;
    this.fresh.set(k, { kind, input, rec, bytes }); this.touched.add(k); this.stats.puts++;
  }

  /** What the running request has made so far (the wiring worker hands it to the engine with the robot). */
  made() { return [...this.fresh.values()]; }

  // ---- around a request
  /** Load the entries the groups used last time, so the request finds them (what was loaded before is let go). */
  async begin(groups: string[]) {
    this.hot.clear(); this.fresh.clear(); this.touched.clear();
    const db = await this.db; if (!db) return;
    try {
      const gks = await Promise.all(groups.map((g) => this.keyOf("group", g)));   // (keys first: a transaction ends when it waits on anything else)
      const gs = await Promise.all(gks.map((k) => req(db.transaction(GROUPS).objectStore(GROUPS).get(k)) as Promise<Group | undefined>));
      const keys = [...new Set(gs.flatMap((g) => g?.keys ?? []))];
      if (!keys.length) return;
      const t = db.transaction(ENTRIES), s = t.objectStore(ENTRIES);
      const got = await Promise.all(keys.map((k) => req(s.get(k)) as Promise<Entry | undefined>));
      for (const e of got) if (e) this.hot.set(`${e.kind}\u0000${e.input}`, e.rec);
    } catch { /* an unreadable cache is an empty one */ }
  }
  /** What the request made and used, taken now (the next request starts afresh); written later by `write`. */
  snapshot(group: string): Snapshot {
    // (what was loaded stays loaded: the meshes of the robot just answered are asked for next)
    const snap = { group, fresh: [...this.fresh.values()], touched: [...this.touched] };
    this.fresh.clear(); this.touched.clear();
    return snap;
  }
  /**
   * Write a snapshot: each entry in a transaction of its own, giving the worker back between them (copying a result into
   * IndexedDB holds the worker while it copies: one big write would keep the page's mesh requests waiting), then the group's
   * list, then keep the store under its size. Resolves when written.
   */
  async write(snap: Snapshot) {
    const db = await this.db; if (!db || !snap.touched.length) return;
    try {
      const now = Date.now();
      const keyed = await Promise.all(snap.fresh.map(async (e) => ({ ...e, key: await this.keyOf(e.kind, e.input) })));
      const keys = await Promise.all(snap.touched.map((k) => { const i = k.indexOf("\u0000"); return this.keyOf(k.slice(0, i), k.slice(i + 1)); }));
      const gk = await this.keyOf("group", snap.group);
      for (const e of keyed) {
        const t = db.transaction([ENTRIES, META], "readwrite");
        t.objectStore(ENTRIES).put(e satisfies Entry); t.objectStore(META).put({ key: e.key, bytes: e.bytes, used: now } satisfies Meta);
        await done(t);
        await new Promise((r) => setTimeout(r, 0));
      }
      // every entry used now is the newest (found ones too), and the group lists them all
      const made = new Set(keyed.map((e) => e.key));
      const t = db.transaction([META, GROUPS], "readwrite"), m = t.objectStore(META);
      for (const k of keys) if (!made.has(k)) { const q = m.get(k); q.onsuccess = () => { if (q.result) m.put({ ...(q.result as Meta), used: now }); }; }
      t.objectStore(GROUPS).put({ key: gk, keys, used: now } satisfies Group);
      await done(t);
      await this.trim(db);
    } catch { /* quota or private mode: the next visit computes again */ }
  }
  /** Write what the request made and the group's list at once. */
  end(group: string) { return this.write(this.snapshot(group)); }
  /** A whole answer kept for a request (the engine's response body), or undefined. */
  async response(key: string): Promise<{ status: number; type: string; body: string } | undefined> {
    const db = await this.db; if (!db) return undefined;
    try {
      const k = await this.keyOf("response", key);
      const e = await req(db.transaction(ENTRIES).objectStore(ENTRIES).get(k)) as Entry | undefined;
      if (!e || e.input !== key) return undefined;
      this.stats.responseHits++;
      // marked as used: it is the last to go
      const t = db.transaction(META, "readwrite"); t.objectStore(META).put({ key: e.key, bytes: e.bytes, used: Date.now() } satisfies Meta); void done(t).catch(() => {});
      return e.rec as { status: number; type: string; body: string };
    } catch { return undefined; }
  }
  async keepResponse(key: string, r: { status: number; type: string; body: string }) {
    const db = await this.db; if (!db) return;
    try {
      const k = await this.keyOf("response", key), bytes = r.body.length * 2;
      const t = db.transaction([ENTRIES, META], "readwrite");
      t.objectStore(ENTRIES).put({ key: k, kind: "response", input: key, rec: r, bytes } satisfies Entry);
      t.objectStore(META).put({ key: k, bytes, used: Date.now() } satisfies Meta);
      await done(t);
      await this.trim(db);
    } catch { /* not kept */ }
  }
  private budget: number | undefined;
  private async cap(): Promise<number> {
    if (this.budget !== undefined) return this.budget;
    let quota = HARD_CAP * 10;
    try { const e = await navigator.storage?.estimate?.(); if (e?.quota) quota = e.quota; } catch { /* unknown: the hard cap */ }
    return (this.budget = Math.min(HARD_CAP, Math.floor(quota / 10)));
  }
  /** Oldest used first out until the entries fit the budget. */
  private async trim(db: IDBDatabase) {
    const cap = await this.cap();
    const t = db.transaction([ENTRIES, META], "readwrite"), m = t.objectStore(META), s = t.objectStore(ENTRIES);
    const all = await req(m.index("used").getAll()) as Meta[];   // oldest first: small records only
    let total = all.reduce((n, e) => n + e.bytes, 0);
    for (const e of all) { if (total <= cap) break; s.delete(e.key); m.delete(e.key); total -= e.bytes; this.stats.evicted++; }
    await done(t).catch(() => {});
  }
  /** Everything gone (the page's "clear cache" and tests). */
  async clear() {
    const db = await this.db; if (!db) return;
    const t = db.transaction([ENTRIES, META, GROUPS], "readwrite"); for (const n of [ENTRIES, META, GROUPS]) t.objectStore(n).clear(); await done(t).catch(() => {});
  }
}

/** Start the cache for this engine build and plug it into the engine's lookups. */
export function startResultCache(version: string): ResultCache | undefined {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle) return undefined;
  const c = new ResultCache(version);
  setResultStore(c);
  return c;
}
