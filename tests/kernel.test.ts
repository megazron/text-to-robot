// CAD kernel: part programs built as exact B-rep solids (OpenCascade), STEP for CAD tools, welded print meshes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { initKernel, exportPart, type Program } from "@ttr/kernel";

await initKernel();
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

test("a filleted servo mount is one closed solid with a STEP file", () => {
  const p: Program = { name: "mount", edge: 0.8, ops: [
    { op: "box", min: [-30, -20, 0], max: [30, 20, 5], r: 5 },
    { op: "cradle", key: "hobby_sg90", T: [...I.slice(0, 12), 0, 0, 30, 1] as never, wall: 2.5 },
    { op: "hull", of: [{ op: "box", min: [-30, -20, 0], max: [30, 20, 5] }, { op: "rod", a: [0, -12, 12], b: [0, 12, 12], r: 5 }] },
    { op: "hole", a: [-24, -14, -1], b: [-24, -14, 10], d: 3.2 }, { op: "hole", a: [24, 14, -1], b: [24, 14, 10], d: 3.2 },
  ] };
  const r = exportPart(p);
  assert.equal(r.bodies, 1);
  assert.ok(r.watertight);
  assert.ok(r.volume_mm3 > 5000, String(r.volume_mm3));
  assert.match(r.step, /^ISO-10303-21;/);
  assert.equal(new DataView(r.stl.buffer).getUint32(80, true), r.mesh.f.length);
});

test("holes are cut 0.15 mm over size for FDM shrinkage", () => {
  const plate = (d?: number): Program => ({ name: "p", ops: [{ op: "box", min: [0, 0, 0], max: [20, 20, 5] }, ...(d ? [{ op: "hole" as const, a: [10, 10, -1] as [number, number, number], b: [10, 10, 6] as [number, number, number], d }] : [])] });
  const removed = exportPart(plate()).volume_mm3 - exportPart(plate(5)).volume_mm3;
  const area = removed / 5, d = 2 * Math.sqrt(area / Math.PI);
  assert.ok(Math.abs(d - 5.15) < 0.05, `effective hole ${d.toFixed(3)} mm`);
});

test("a revolved dome and an impossible fillet still build (fillet falls back)", () => {
  const r = exportPart({ name: "dome", edge: 50, ops: [{ op: "revolve", pts: [[0, 0], [30, 0], [30, 10], [20, 25], [0, 30]] }] });
  assert.equal(r.bodies, 1);
  assert.ok(r.watertight);
});
