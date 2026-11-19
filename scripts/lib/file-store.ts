// The persistent result store on disk, for Node (scripts/profile_engine.ts, tests/speed-identical.test.ts): the same
// contract as the website's IndexedDB cache (apps/web/src/result-cache.ts). One file per entry, named by the SHA-256 of
// (version, kind, input); the file holds the input too, and a hit is only taken when it equals the asked input.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { serialize, deserialize } from "node:v8";
import { setResultStore, type ResultStore } from "@ttr/parts/memo";

export class FileStore implements ResultStore {
  readonly stats = { hits: 0, puts: 0 };
  readonly dir: string; readonly version: string;
  constructor(dir: string, version: string) { this.dir = dir; this.version = version; mkdirSync(dir, { recursive: true }); }
  private path(kind: string, input: string) { return join(this.dir, createHash("sha256").update(`${this.version}\u0000${kind}\u0000${input}`).digest("hex")); }
  get(kind: string, input: string) {
    const p = this.path(kind, input);
    if (!existsSync(p)) return undefined;
    const e = deserialize(readFileSync(p)) as { input: string; rec: unknown };
    if (e.input !== input) return undefined;
    this.stats.hits++;
    return e.rec;
  }
  put(kind: string, input: string, rec: unknown) {
    const p = this.path(kind, input), tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, serialize({ input, rec })); renameSync(tmp, p);
    this.stats.puts++;
  }
}
/** Use a store in `dir` for this process. */
export function useFileStore(dir: string, version = "test"): FileStore { const s = new FileStore(dir, version); setResultStore(s); return s; }
