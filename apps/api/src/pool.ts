// One engine worker (worker.ts), replaced when its CAD kernel memory passes TTR_RECYCLE_MB (default 1800) while nothing is
// waiting, and at once when its kernel aborts or the thread dies; the requests it held are sent once more to the new one.
import { Worker } from "node:worker_threads";

const RECYCLE_MB = Number(process.env.TTR_RECYCLE_MB ?? 1800);
const KERNEL_DIED = /Aborted\(|out of bounds|RuntimeError|unreachable|memory access/i;
export class EngineError extends Error {
  status: number; extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) { super(message); this.status = status; this.extra = extra; }
}
interface Pending { op: string; args: unknown; ok: (v: any) => void; fail: (e: Error) => void; retried: boolean }

export class EnginePool {
  private worker!: Worker; private ready!: Promise<void>; private waiting = new Map<number, Pending>(); private next = 1;
  recycles = 0; wasmMb = 0;
  constructor() { this.start(); }
  private start() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url));
    this.ready = new Promise((ok) => this.worker.once("message", () => ok()));
    this.worker.on("message", (m) => this.answer(m));
    const w = this.worker;
    this.worker.on("error", () => { if (w === this.worker) this.restart(); });
    this.worker.on("exit", () => { if (w === this.worker && this.waiting.size) this.restart(); });
  }
  private answer(m: { id?: number; ok?: boolean; value?: unknown; error?: string; status?: number; extra?: Record<string, unknown>; wasm_mb?: number }) {
    if (m.id === undefined) return;
    const p = this.waiting.get(m.id); if (!p) return;
    this.wasmMb = m.wasm_mb ?? 0;
    if (!m.ok && !p.retried && KERNEL_DIED.test(m.error ?? "")) { this.restart(); return; }
    this.waiting.delete(m.id);
    if (m.ok) p.ok(m.value); else p.fail(new EngineError(m.status ?? 400, m.error ?? "engine error", m.extra));
    if (this.wasmMb > RECYCLE_MB && this.waiting.size === 0) { this.recycles++; const old = this.worker; this.start(); void old.terminate(); }
  }
  private restart() {
    this.recycles++; const old = this.worker; this.start(); void old.terminate();
    for (const [id, p] of [...this.waiting]) {
      if (p.retried) { this.waiting.delete(id); p.fail(new EngineError(500, "The design engine ran out of memory twice on this request.")); continue; }
      p.retried = true; void this.send(id, p);
    }
  }
  private async send(id: number, p: Pending) { await this.ready; this.worker.postMessage({ id, op: p.op, args: p.args }); }
  call<T>(op: string, args: unknown): Promise<T> {
    return new Promise<T>((ok, fail) => { const id = this.next++, p = { op, args, ok, fail, retried: false }; this.waiting.set(id, p); void this.send(id, p); });
  }
  close() { return this.worker.terminate(); }
}
