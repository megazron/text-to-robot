// The Mark 43 opens for real: every door is a revolute joint on a servo in the URDF, with hinge hardware and a latch, its range measured by exact intersection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { armourManifest } from "@ttr/mesh";
import { designMark43Wearable } from "@ttr/design";

const spec = JSON.parse(readFileSync("examples/14_iron_man_mark_43/robot.json", "utf8")), d = spec.metadata.design, man = armourManifest();
const urdf = readFileSync("examples/14_iron_man_mark_43/robot.urdf", "utf8");

test("twelve doors: back and helmet split on the centre line, the rear shell of every limb, each a revolute joint with a measured limit", () => {
  assert.equal(man.doors.length, 12);
  for (const door of man.doors) {
    const j = spec.joints.find((x: any) => x.name === door.joint);
    assert.equal(j.type, "revolute", door.joint);
    assert.ok(new RegExp(`<joint name="${door.joint}" type="revolute">`).test(urdf), `${door.joint} is in the URDF`);
    const range = j.limit.upper - j.limit.lower;
    assert.ok(range >= 1.22 && range <= 1.4, `${door.joint}: ${range} rad`);
    assert.deepEqual([j.limit.lower, j.limit.upper], man.limits[door.joint], "the design's limit is the measured one");
    assert.ok(Math.abs(door.measured_deg - range * 57.2958) < 0.2);
    assert.equal(door.stopped_by, null, `${door.joint} runs the whole way in the sequence`);
    const tilt = Math.acos(Math.abs(door.up[2])) * 57.3;
    assert.ok(tilt < 20, `${door.joint} hinge is ${tilt} deg off vertical`);
  }
  for (const n of ["back_door", "helmet_door"]) {
    for (const [side, sign] of [["left", 1], ["right", -1]] as const) for (const p of man.pieces.filter((x) => x.link === `${n}_${side}` && !x.hardware && !x.wiring)) assert.ok(p.centroid[1] * sign > 0, `${p.name} stays on its own side of the centre line`);
  }
});

test("each door has hinges, a servo on its hinge line, an arm, and a latch that holds with no power", () => {
  for (const door of man.doors) {
    const has = (re: RegExp) => spec.links.filter((l: any) => re.test(l.name));
    assert.ok(door.hinges.length >= 2);
    assert.equal(has(new RegExp(`^hinge_${door.name}_\\d+$`)).length, door.hinges.length, "fixed leaves");
    assert.equal(has(new RegExp(`^hinge_${door.name}_\\d+_knuckle$`)).length, door.hinges.length, "door leaves");
    assert.equal(has(new RegExp(`^pod_${door.name}$`)).length, 1); assert.equal(has(new RegExp(`^arm_${door.name}$`)).length, 1);
    assert.ok(spec.links.some((l: any) => l.name === door.servo.name && l.geometry.params?.key === door.servo.key));
    for (const k of ["torque", "clutch", "latch", "hand_release", "range"]) { const c = d.checks.find((x: any) => x.name === `door:${door.joint.replace("_hinge", "")}:${k}`); assert.ok(c?.pass, `${door.joint} ${k}: ${c?.detail}`); }
  }
  assert.ok(man.latches.length >= 11 && man.latches.every((l) => spec.joints.some((j: any) => j.name === l.joint && j.type === "revolute")));
});

test("the opening order is in the design, and only the doors it names move in it", () => {
  assert.equal(d.door_sequence.flat().length, 12);
  assert.deepEqual(new Set(d.door_sequence.flat()), new Set(man.doors.map((x) => x.joint)));
});

test("the tiers keep their own doors", () => {
  const helmet = designMark43Wearable({ tier: "helmet" });
  assert.deepEqual(helmet.joints.filter((j: any) => /_door_.*hinge$|_hinge$/.test(j.name)).map((j: any) => j.name).sort(), ["helmet_door_left_hinge", "helmet_door_right_hinge"]);
  assert.ok(!helmet.links.some((l: any) => /^(servo_driver|regulator_doors)/.test(l.name)));
});
