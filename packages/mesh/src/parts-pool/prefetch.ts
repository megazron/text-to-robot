// The parts a robot is made of, built ahead on helper workers: a printed part's solid (@ttr/solid) and a CAD part's files
// (@ttr/kernel) are pure functions of their recipe, so a helper running the same step on the same recipe makes the same
// record, byte for byte, and the engine takes it as if it had made it (tests/speed-identical.test.ts holds it to that).
// Used where the parts are known before the work that needs them: a robot opened from a link, a file or the history, a
// robot whose harness the wiring worker laid, an export. Without a pool, or with every part already kept, nothing happens.
import type { RobotSpecification } from "@ttr/robot-schema";
import { isRemembered, primeRemembered } from "@ttr/parts/memo";
import type { Pool } from "../forge/pool.ts";

let pool: Pool | undefined;
/** fewer parts to build than this: no helpers (tests set it lower) */
export let MIN_PARTS = 6;
export const setMinParts = (n: number) => { MIN_PARTS = n; };
/** the longest a request waits for the helpers */
const WAIT_MS = 60000;
export const setPartsPool = (p: Pool | undefined) => { pool?.close(); pool = p; };
export const getPartsPool = () => pool;

/** The recipes of a robot's printed and CAD parts, once each, largest first (the longest jobs start first). */
export function partRecipes(spec: RobotSpecification): { kind: "printed" | "cad"; input: string }[] {
  const out = new Map<string, { kind: "printed" | "cad"; input: string }>();
  for (const l of spec.links ?? []) {
    const g = l.geometry as { type: string; part?: string; params?: { program?: unknown } };
    if (g?.type !== "mesh" || typeof g.params?.program !== "string") continue;
    try {
      if (g.part === "printed") { const ops = JSON.stringify((JSON.parse(g.params.program) as { ops: unknown }).ops); out.set(`printed\u0000${ops}`, { kind: "printed", input: ops }); }
      else if (g.part === "cad") out.set(`cad\u0000${g.params.program}`, { kind: "cad", input: g.params.program });
    } catch { /* not a recipe this engine reads: built (and refused) where it is used */ }
  }
  return [...out.values()].sort((a, b) => b.input.length - a.input.length);
}

/** Build every part of `spec` that is not kept yet on the pool's workers, in parallel; resolves when all are kept. */
export async function prefetchParts(spec: RobotSpecification, p: Pool | undefined = pool): Promise<{ built: number; kept: number }> {
  const all = partRecipes(spec), todo = all.filter((x) => !isRemembered(x.kind, x.input));
  // a few parts are built faster where they are needed than helpers can start and build them (each loads its kernels first)
  if (!p || todo.length < MIN_PARTS) return { built: 0, kept: all.length - todo.length };
  let built = 0;
  const work = Promise.all(todo.map(async (x) => {
    try {
      const r = await p.run<{ rec: unknown; bytes: number }>({ op: "part", args: x });
      primeRemembered(x.kind, x.input, r.rec, r.bytes); built++;
    } catch { /* a helper that failed leaves the part to be built where it is needed */ }
  }));
  // never waited on for long: what the helpers have not built by then is built where it is needed (the same parts either way)
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([work, new Promise<void>((ok) => { timer = setTimeout(ok, WAIT_MS); })]);
  clearTimeout(timer);
  return { built, kept: all.length - todo.length };
}
