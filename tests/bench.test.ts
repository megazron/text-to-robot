// The Bench view: every example's electronics on the desk, every wire of the record drawn pin to pin, ending on its pins,
// no wire through a part (each part's body box; a wire's own two parts let off over its first and last 25 mm: its pin
// and connector), no two parts overlapping, a board with a downward header standing in a breadboard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { bench, withBranchFuses, type WiringRecord } from "@ttr/design";

type V3 = [number, number, number];
const examples = readdirSync("examples").filter((d) => /^\d\d_/.test(d)).sort();
for (const ex of examples) {
  test(`${ex}: the bench has every wire, pin to pin, clear of every part`, () => {
    const s = JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")), w = s.metadata.design.wiring as WiringRecord, b = bench(s, w);
    assert.deepEqual(b.notes, []);
    assert.deepEqual(b.wires.map((x) => x.id).sort(), withBranchFuses(w).cables.flatMap((c) => c.wires.map((x) => x.id)).sort());
    const boxes = b.parts.map((p) => {
      const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
      for (const m of p.model.meshes) for (let i = 0; i < m.v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], m.v[i + k] + p.T[3 + 4 * k]); hi[k] = Math.max(hi[k], m.v[i + k] + p.T[3 + 4 * k]); }
      return { inst: p.inst, lo, hi };
    });
    // parts do not overlap (a board and the breadboard it stands in touch at the pins only)
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j], over = [0, 1, 2].map((k) => Math.min(a.hi[k], c.hi[k]) - Math.max(a.lo[k], c.lo[k]));
      const seated = a.inst === `${c.inst}_breadboard` || c.inst === `${a.inst}_breadboard`;
      assert.ok(seated || over.some((o) => o <= 0.01), `${ex}: ${a.inst} and ${c.inst} overlap`);
    }
    for (const x of b.wires) {
      const P = x.pts.map((q) => q.p as V3), own = [x.from, x.to].map((t) => t.split(".")[0]);
      let L = 0; const acc = [0]; for (let i = 1; i < P.length; i++) { L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]); acc.push(L); }
      for (let i = 1; i < P.length; i++) for (let t = 0.5; t < 6; t++) {
        const f = t / 6, p = [0, 1, 2].map((k) => P[i - 1][k] + (P[i][k] - P[i - 1][k]) * f), d = acc[i - 1] + (acc[i] - acc[i - 1]) * f;
        for (const bx of boxes) {
          const mine = (d < 25 && (bx.inst === own[0] || bx.inst === `${own[0]}_breadboard`)) || (d > L - 25 && (bx.inst === own[1] || bx.inst === `${own[1]}_breadboard`));
          if (mine) continue;
          assert.ok(![0, 1, 2].every((k) => p[k] > bx.lo[k] + 0.3 && p[k] < bx.hi[k] - 0.3), `${ex}: ${x.id} passes through ${bx.inst} at ${p.map(Math.round)}`);
        }
      }
    }
  });
}
