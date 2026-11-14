// The servo bracket of the engine API (printed shape servo_bracket): it holds a servo the way its maker meant it to be held
// and leaves most of the body in view. Hobby servos hang by their mounting tabs on two pillars, the tab screws in pilot holes;
// Feetech STS and Dynamixel XL330 stand on a plate screwed into their case from below, inside low lips; Dynamixel X sit
// between two cheeks up to their lowest row of side screws. Nothing of the bracket is inside the servo, and a servo seated
// in the bracket made for it passes the fit check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build, evaluate, box, type Program } from "@ttr/solid";
import { part, caseHoles } from "@ttr/parts";
import { printedProgram, printedMounts, servoBracket, worldMounts, partMounts } from "../apps/web/src/engine/mounts.ts";
import { applyEdits, emptyRobot } from "../apps/web/src/engine/edit.ts";
import { clearanceOf, parts } from "../apps/web/src/engine/api.ts";
import { snapPart } from "../apps/web/src/engine/snap.ts";

type V = [number, number, number];
const solid = (key: string) => evaluate(printedProgram({ shape: "servo_bracket", size_mm: [0, 0, 0], wall_mm: 3, key }, "b") as Program);

test("hobby servos hang by their tabs on two pillars, the body clear and in view", () => {
  for (const key of ["hobby_sg90", "hobby_mg90s", "hobby_mg996r", "hobby_ds3218"]) build(() => {
    const c = part(key), bb = c.bbox_mm!, cm = c.specs.case_mm as number[], { seat } = servoBracket(key, 3), b = solid(key);
    const tabs = caseHoles(key).filter((h) => h.axis[2] < -0.9);
    const cx = tabs.reduce((a, h) => a + h.pos[0], 0) / tabs.length + seat[0], tabZ = tabs[0].pos[2] + seat[2], bottom = bb.min[2] + seat[2];
    // the case (from its datasheet size) and the tabs over their whole length: no bracket material inside them
    const caseBox = box([cx - cm[0] / 2, -cm[1] / 2, bottom], [cx + cm[0] / 2, cm[1] / 2, seat[2]]);
    const tabBox = box([bb.min[0] + seat[0], -cm[1] / 2, tabZ], [bb.max[0] + seat[0], cm[1] / 2, tabZ + 2.4]);
    assert.ok(b.intersect(caseBox).volume() < 0.5, `${key}: bracket inside the case`);
    assert.ok(b.intersect(tabBox).volume() < 0.5, `${key}: bracket inside the tabs`);
    // the case hangs 2 mm over the base, and nothing of the bracket stands beside or over it: the body is in view
    assert.ok(Math.abs(bottom - 5) < 1e-6, `${key}: body bottom at ${bottom} mm`);
    const beside = box([cx - cm[0] / 2, -cm[1] / 2 - 30, 3.1], [cx + cm[0] / 2, cm[1] / 2 + 30, 200]);
    assert.ok(b.intersect(beside).volume() < 0.5, `${key}: bracket beside the case`);
    // each tab screw has pillar under it, round its pilot hole
    for (const h of tabs) {
      const x = h.pos[0] + seat[0], y = h.pos[1] + seat[1], under = box([x - 2.6, y - 2.6, tabZ - 3], [x + 2.6, y + 2.6, tabZ]);
      const v = b.intersect(under).volume(); assert.ok(v > 30, `${key}: no pillar under the tab screw at ${x}, ${y} (${v.toFixed(1)} mm^3)`);
      assert.ok(b.intersect(box([x - 0.4, y - 0.4, 3], [x + 0.4, y + 0.4, tabZ])).volume() < 0.01, `${key}: no pilot hole for the tab screw`);   // (a small hole is a polygon)
    }
  });
});

test("bus servos: a plate with lips for the Feetech STS and XL330, two cheeks for the Dynamixel X", () => {
  for (const key of ["feetech_sts3215_c001", "dxl_xl330_m288", "dxl_xl430_w250", "dxl_xh540_w270"]) build(() => {
    const bb = part(key).bbox_mm!, { seat, holds } = servoBracket(key, 3), b = solid(key);
    const body = box([bb.min[0] + seat[0], bb.min[1] + seat[1], bb.min[2] + seat[2]], [bb.max[0] + seat[0], bb.max[1] + seat[1], seat[2]]);
    assert.ok(b.intersect(body).volume() < 0.5, `${key}: bracket inside the servo`);
    const h = bb.max[2] - bb.min[2], top = b.boundingBox().max[2] - 3;
    // the bracket rises over less than half the body's height
    assert.ok(top < 0.5 * h, `${key}: the bracket covers ${top.toFixed(1)} of ${h.toFixed(1)} mm (${holds})`);
  });
});

test("a servo seated in the bracket made for it passes the fit check; the same servo pushed into it does not", () => {
  for (const key of ["hobby_mg996r", "hobby_sg90", "feetech_sts3215_c001", "dxl_xl430_w250"]) {
    let r = applyEdits(emptyRobot("held"), [{ op: "add", printed: { shape: "plate", size_mm: [140, 90, 4], holes: 4 }, world: { xyz: [0, 0, 0], rpy: [0, 0, 0] }, name: "plate" }], parts);
    const top = worldMounts(r).find((m) => m.id === "top")!;
    r = applyEdits(r, [{ op: "add", printed: { shape: "servo_bracket", size_mm: [0, 0, 0], wall_mm: 3, key }, parent: "plate", world: { xyz: top.pos, rpy: [0, 0, 0] }, name: "bracket" }], parts);
    const seat = worldMounts(r).find((m) => m.kind === "seat")!;
    assert.ok(seat.fits === key && /held by/.test(seat.label), seat.label);
    const s = snapPart(partMounts(key), [seat], { point: seat.pos, normal: [0, 0, 1], link: "bracket" });
    assert.equal(s.how, "mate");
    const seated = applyEdits(r, [{ op: "add", key, parent: "bracket", world: s.world, name: "servo" }], parts);
    assert.deepEqual(clearanceOf(seated, "servo"), [], `${key} seated`);
    // 4 mm lower is not its seat: the case goes into the base, and the fit check says so
    const low = applyEdits(r, [{ op: "add", key, parent: "bracket", world: { xyz: [s.world.xyz[0], s.world.xyz[1], s.world.xyz[2] - 0.004], rpy: s.world.rpy }, name: "servo" }], parts);
    assert.ok(clearanceOf(low, "servo").some((h) => h.b === "bracket"), `${key} pushed 4 mm into its bracket is refused`);
  }
});

test("the servo bracket's seat is the servo frame the bracket was cut round", () => {
  for (const key of ["hobby_mg996r", "feetech_sts3215_c001", "dxl_xl430_w250"]) {
    const m = printedMounts({ shape: "servo_bracket", size_mm: [0, 0, 0], wall_mm: 3, key }).find((x) => x.kind === "seat")!;
    const s = servoBracket(key, 3).seat;
    assert.deepEqual(m.pos.map((x) => +x.toFixed(6)), s.map((x) => +(x / 1000).toFixed(6)) as V);
  }
});
