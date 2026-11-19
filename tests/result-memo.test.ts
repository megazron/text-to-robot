// The engine's remembered results (@ttr/parts/memo) and the helper budget (packages/mesh/src/forge/pool.ts): a result found is
// the result made, no caller shares a mutable result, a persistent store is only read for its exact input, and pools never
// hold more helpers than the budget allows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { remembered, setResultStore, clearRemembered, isRemembered, primeRemembered, packMesh, unpackMesh, type ResultStore } from "@ttr/parts/memo";
import { Budget, lazyPool } from "@ttr/mesh/forge/pool";

const enc = (x: number[]) => ({ rec: Float64Array.from(x), bytes: x.length * 8 });
const dec = (r: Float64Array) => [...r];

test("a result is made once per input, and every caller gets its own copy", () => {
  clearRemembered();
  let made = 0;
  const get = (input: string) => remembered("t1", input, () => { made++; return [1, 2, Number(input)]; }, enc, dec);
  const a = get("3"), b = get("3"), c = get("4");
  assert.deepEqual(a, [1, 2, 3]); assert.deepEqual(b, a); assert.deepEqual(c, [1, 2, 4]);
  assert.equal(made, 2);
  a[0] = 99; assert.deepEqual(get("3"), [1, 2, 3], "a caller's edit never reaches the next caller");
});

test("a persistent store is asked by kind and exact input, and filled with what is made", () => {
  clearRemembered();
  const kept = new Map<string, unknown>(), asked: string[] = [];
  const store: ResultStore = { get: (k, i) => { asked.push(`${k}:${i}`); return kept.get(`${k}:${i}`); }, put: (k, i, v) => { kept.set(`${k}:${i}`, v); } };
  setResultStore(store);
  try {
    let made = 0;
    const get = (input: string) => remembered("t2", input, () => { made++; return [input.length]; }, enc, dec);
    assert.deepEqual(get("abc"), [3]); assert.equal(made, 1); assert.ok(kept.has("t2:abc"));
    clearRemembered();   // a fresh worker: memory empty, the store warm
    assert.deepEqual(get("abc"), [3]); assert.equal(made, 1, "found in the store, not made again");
    assert.ok(isRemembered("t2", "abc")); assert.ok(!isRemembered("t2", "abd"));
    primeRemembered("t2", "xyz", Float64Array.from([7]), 8);
    assert.deepEqual(get("xyz"), [7]); assert.equal(made, 1, "a result a helper made is taken as made here");
  } finally { setResultStore(undefined); clearRemembered(); }
});

test("meshes pack into typed arrays and back without losing a bit", () => {
  const m = { v: [[0.1, -0, 1e-17], [Math.PI, -2.5, 1 / 3]] as [number, number, number][], f: [[0, 1, 1]] as [number, number, number][] };
  const back = unpackMesh(packMesh(m));
  assert.deepEqual(back, m);
  assert.ok(Object.is(back.v[0][1], -0), "negative zero survives");
});

test("pools share the helper budget and give it back when idle", async () => {
  const budget = new Budget(3), live = new Set<number>();
  let n = 0;
  const make = () => { const id = n++; live.add(id); let fn: (m: { id: number; result?: unknown }) => void = () => {};
    return { post: (m: any) => setTimeout(() => fn({ id: m.id, result: m.job.args.x * 2 }), 5), on: (f: typeof fn) => { fn = f; }, end: () => { live.delete(id); } }; };
  const a = lazyPool(3, make, budget, { idleMs: 30 }), b = lazyPool(3, make, budget, { idleMs: 30 });
  assert.equal(live.size, 0, "no worker starts before a job");
  const ra = await Promise.all([1, 2, 3, 4].map((x) => a.run<number>({ op: "x", args: { x } })));
  assert.deepEqual(ra, [2, 4, 6, 8]);
  assert.equal(live.size, 3); assert.equal(budget.free, 0);
  await assert.rejects(b.run({ op: "x", args: { x: 1 } }), /no helper worker is free/, "a pool that need not wait gets none while another holds them");
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(live.size, 0, "idle workers end"); assert.equal(budget.free, 3, "and their places are given back");
  assert.deepEqual(await b.run<number>({ op: "x", args: { x: 5 } }), 10);
  a.close(); b.close();
});
