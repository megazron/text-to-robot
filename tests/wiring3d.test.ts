// The electronics and harness in 3D: every wire of every example is drawn pin to pin on the links it rides and follows
// the joints; the boards with a datasheet pin map put their pins on the 2.54 mm grid where the datasheet does; the GLB
// export is a valid glTF; and the harness checks are not blind (a wire through a solid, a kink and a short cut length
// are each caught).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { wiring3d, withBranchFuses, partModel, electronicsGlb, checkHarness, fk, type WiringRecord } from "@ttr/design";

const examples = readdirSync("examples").filter((d) => /^\d\d_/.test(d)).sort();
const load = (ex: string) => { const s = JSON.parse(readFileSync(`examples/${ex}/robot.json`, "utf8")); return { s, w: s.metadata.design.wiring as WiringRecord }; };
type V3 = [number, number, number];
const world = (f: ReturnType<typeof fk>, link: string, p: V3): V3 => { const T = f.link[link]; return [0, 1, 2].map((i) => T.R[i][0] * p[0] + T.R[i][1] * p[1] + T.R[i][2] * p[2] + T.p[i] * 1000) as V3; };
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

for (const ex of examples) {
  test(`${ex}: every wire is drawn pin to pin on the links it rides`, () => {
    const { s, w } = load(ex), h = wiring3d(s);
    const want = withBranchFuses(w).cables.flatMap((c) => c.wires.map((x) => x.id)).sort();
    assert.deepEqual(h.wires.map((x) => x.id).sort(), want, `${ex}: wires drawn`);
    assert.deepEqual(h.notes, [], `${ex}: notes`);
    const links = new Set(s.links.map((l: { name: string }) => l.name));
    const f = fk(s), part = new Map(h.parts.map((p) => [p.inst, p]));
    for (const x of h.wires) {
      assert.ok(x.pts.length >= 2 && x.pts.every((q) => links.has(q.link) && q.p.every(Number.isFinite)), `${ex}: ${x.id} points`);
      assert.ok(x.od_mm > 0.5 && x.od_mm < 12, `${ex}: ${x.id} diameter ${x.od_mm}`);
      // the first and last points are on the pins (or the breadboard tie point beside a downward header)
      for (const [t, q] of [[x.from, x.pts[0]], [x.to, x.pts[x.pts.length - 1]]] as const) {
        const p = part.get(t.split(".")[0])!; assert.ok(p, `${ex}: ${t} has no part`);
        const pin = p.model.pins.get(t.split(".").slice(1).join("."));
        assert.ok(pin, `${ex}: ${t} has no pin on ${p.key}`);
        const T = p.T, at = pin!.at, inLink: V3 = [T[0] * at[0] + T[1] * at[1] + T[2] * at[2] + T[3], T[4] * at[0] + T[5] * at[1] + T[6] * at[2] + T[7], T[8] * at[0] + T[9] * at[1] + T[10] * at[2] + T[11]];
        const d = dist(world(f, p.link, inLink), world(f, q.link, q.p));
        assert.ok(d < (pin!.kind === "header" ? 20 : 0.6), `${ex}: ${x.id} ends ${d.toFixed(1)} mm from ${t}`);
      }
    }
  });
}

test("a wire across a joint follows it: its points ride their links, the ends stay on their pins", () => {
  const { s } = load("08_humanoid"), h = wiring3d(s);
  const x = h.wires.find((w) => new Set(w.pts.map((q) => h.groups[q.link])).size > 2)!;
  assert.ok(x, "a wire crossing joints");
  const moved = s.joints.filter((j: { type: string; name: string }) => j.type === "revolute").map((j: { name: string }) => j.name);
  const q = Object.fromEntries(moved.map((n: string) => [n, 0.6]));
  const f0 = fk(s), f1 = fk(s, q);
  const a0 = world(f0, x.pts[0].link, x.pts[0].p), a1 = world(f1, x.pts[0].link, x.pts[0].p);
  const z0 = world(f0, x.pts.at(-1)!.link, x.pts.at(-1)!.p), z1 = world(f1, x.pts.at(-1)!.link, x.pts.at(-1)!.p);
  // both ends ride their own links: moving the joints moves at least one of them, and the stretch between stays bounded
  assert.ok(dist(a0, a1) + dist(z0, z1) > 1, "the ends moved with the joints");
  const seg = (f: ReturnType<typeof fk>) => Math.max(...x.pts.slice(1).map((p, i) => dist(world(f, x.pts[i].link, x.pts[i].p), world(f, p.link, p.p))));
  assert.ok(seg(f1) < 400, `no segment stretches past the robot: ${seg(f1).toFixed(0)} mm`);
});

test("boards with a datasheet pin map put their pins where the datasheet does", () => {
  const nano = partModel("arduino_nano_clone");
  // two 15-pin rows 15.24 mm apart on the 2.54 mm grid; D12 and D13 are the pins at the USB end
  const d13 = nano.pins.get("j2_analog_side.D13/SCK")!.at, a0 = nano.pins.get("j2_analog_side.A0")?.at;
  assert.ok(d13 && Math.abs(d13[0] - 3.81) < 0.01, `D13 at x ${d13?.[0]}`);
  const d12 = [...nano.pins].find(([k]) => k.startsWith("j1_digital_side.D12"))![1].at;
  assert.ok(Math.abs(d12[0] - 3.81) < 0.01 && Math.abs(Math.abs(d12[1] - d13[1]) - 15.24) < 0.01, "rows 15.24 mm apart, D12 opposite D13");
  if (a0) { const k = (a0[0] - d13[0]) / 2.54; assert.ok(Math.abs(k - Math.round(k)) < 1e-6, "on the grid"); }
  const uno = partModel("arduino_uno_r3");
  assert.ok(Math.abs(uno.pins.get("jdigital.D0/RX")!.at[0] - 63.5) < 0.01, "Uno D0 at 63.5 mm");
  const pi = partModel("rpi5"), p1 = pi.pins.get("gpio40.3V3")!.at, p2 = pi.pins.get("gpio40.5V")!.at;
  assert.ok(Math.abs(p1[0] - 8.37) < 0.01 && Math.abs(p2[1] - p1[1] - 2.54) < 0.01, "Pi pin 1 at 8.37 mm, pin 2 beside it");
  const tb = partModel("tb6612fng_module");
  assert.ok(Math.abs(tb.pins.get("power.VM")!.at[0] - tb.pins.get("control.PWMA")!.at[0]) > 17.7, "TB6612 rows 17.78 mm apart");
  for (const m of [nano, uno, pi, tb]) assert.ok(m.detailed && m.meshes.reduce((a, x) => a + x.f.length / 3, 0) < 6000, "detailed and light enough for the web");
});

test("the harness GLB is a valid glTF 2.0 binary: header, chunks, accessors inside their views", () => {
  for (const ex of ["18_arduino_car", "05_diff_drive"]) {
    const { s } = load(ex), g = electronicsGlb(s, wiring3d(s)), dv = new DataView(g.buffer, g.byteOffset);
    assert.equal(dv.getUint32(0, true), 0x46546c67); assert.equal(dv.getUint32(4, true), 2); assert.equal(dv.getUint32(8, true), g.length);
    const jl = dv.getUint32(12, true), j = JSON.parse(new TextDecoder().decode(g.subarray(20, 20 + jl))), bl = dv.getUint32(20 + jl, true);
    assert.equal(bl, j.buffers[0].byteLength);
    for (const a of j.accessors) { const v = j.bufferViews[a.bufferView]; assert.ok(v.byteOffset + v.byteLength <= bl); assert.equal(a.count * (a.type === "VEC3" ? 12 : 4), v.byteLength); }
    const wires = j.nodes.filter((n: { extras?: { net?: string } }) => n.extras?.net).length;
    assert.equal(wires, wiring3d(s).wires.length, `${ex}: a node per wire`);
  }
});

test("the harness checks are not blind: a wire through a solid, a kink and a short cut are caught", () => {
  const { s, w } = load("05_diff_drive"), h = wiring3d(s), base = checkHarness(s, w, h, { only: ["base_link"] });
  const x = structuredClone(h.wires.find((q) => q.pts.length > 6)!);
  const f = fk(s), baseLink = s.links.find((l: { name: string }) => l.name === "base_link")!;
  // through: a point moved into the middle of the base plate's box, on the base link
  const g = baseLink.geometry as { bbox?: { min: V3; max: V3 } }, c: V3 = g.bbox ? [0, 1, 2].map((i) => (g.bbox!.min[i] + g.bbox!.max[i]) * 500) as V3 : [0, 0, 0];
  const mid = Math.floor(x.pts.length / 2);
  const through = { ...h, wires: [{ ...x, id: "PLANT", pts: [...x.pts.slice(0, mid), { link: "base_link", p: c }, ...x.pts.slice(mid)] }] };
  void f;
  assert.ok(checkHarness(s, w, through, { only: ["base_link"] }).through.some((t) => t.wire === "PLANT"), "a wire through the base plate is caught");
  // kink: a sharp corner on one body
  const p0 = x.pts[2], kink = { ...h, wires: [{ ...x, id: "KINK", pts: [{ link: p0.link, p: p0.p }, { link: p0.link, p: [p0.p[0] + 30, p0.p[1], p0.p[2]] as V3 }, { link: p0.link, p: [p0.p[0] + 30.5, p0.p[1] + 30, p0.p[2]] as V3 }] }] };
  assert.ok(checkHarness(s, w, kink, { only: [] }).bend.some((b) => b.wire === "KINK"), "a 90 degree kink is caught");
  // short: a cut length far under the drawn run
  const short = { ...h, wires: [{ ...x, id: "SHORT", cut_mm: 10 }] };
  assert.ok(checkHarness(s, w, short, { only: [] }).length.some((l) => l.wire === "SHORT"), "a cut length that cannot reach is caught");
  void base;
});

// what the harness checks find today is recorded in examples/harness_check.json (node scripts/harness_check.ts); a change
// may fix findings, never add them. Robots whose printed parts come from the CAD kernel (slow to build here) are checked
// in the browser by the site check instead.
const record = JSON.parse(readFileSync("examples/harness_check.json", "utf8")) as Record<string, { through: number; bend: number; length: number; through_mm: number }>;
for (const ex of examples) {
  const { s } = load(ex);
  if (s.links.some((l: { geometry: { part?: string } }) => l.geometry.part === "cad" || l.geometry.part === "armour")) continue;
  test(`${ex}: the harness checks find nothing new`, () => {
    const { w } = load(ex), c = checkHarness(s, w, wiring3d(s)), r = record[ex];
    assert.ok(r, `${ex}: not in examples/harness_check.json`);
    assert.ok(c.through.length <= r.through && c.through.reduce((a, x) => a + x.run_mm, 0) <= r.through_mm + 5, `${ex}: wires through solids ${c.through.length} (${c.through.reduce((a, x) => a + x.run_mm, 0)} mm), recorded ${r.through} (${r.through_mm} mm)`);
    assert.ok(c.bend.length <= r.bend, `${ex}: tight bends ${c.bend.length}, recorded ${r.bend}`);
    assert.ok(c.length.length <= r.length, `${ex}: cut lengths off ${c.length.length}, recorded ${r.length}`);
  });
}
