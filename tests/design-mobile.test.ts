import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec, type RobotSpecification } from "@ttr/robot-schema";
import { part } from "@ttr/parts";
import { designDiffDrive, designFourWheel, designMecanum, designRover, designWallE, designEva, designBaymax, interference, totalMass } from "@ttr/design";

const design = (s: RobotSpecification) => (s.metadata as any).design;

// [designer, request, mass range kg, cost range USD]
const CASES: [string, () => RobotSpecification, [number, number], [number, number]][] = [
  ["diff drive", () => designDiffDrive({ prompt: "Create a differential drive mobile robot" }), [0.8, 4], [250, 1200]],
  ["four wheel", () => designFourWheel({ prompt: "Create a four-wheel robot" }), [1, 6], [300, 1500]],
  ["mecanum", () => designMecanum({ prompt: "Create a mecanum-wheel robot" }), [1, 6], [400, 1800]],
  ["rover", () => designRover({ prompt: "Design a Mars rover with four wheels and a 6 DOF sampling arm, RGB-D camera, budget $4000", wheels: 4, arm: { dof: 6 }, sensors: ["depth"], budget: 4000 }), [2, 10], [800, 4000]],
  ["wall-e", () => designWallE({}), [1.5, 8], [400, 2500]],
  ["eva", () => designEva({}), [1.5, 8], [300, 2500]],
  ["baymax", () => designBaymax({}), [2.5, 15], [500, 3500]],
];

for (const [name, make, [m0, m1], [c0, c1]] of CASES) {
  test(`mobile designer: ${name} is a valid, buildable robot`, () => {
    const spec = make();
    const v = validateSpec(spec);
    assert.ok(v.valid, JSON.stringify(v.issues.filter((i) => i.severity === "error")));
    const d = design(spec);
    // every claim is checked and passes for the default request
    const failing = d.checks.filter((c: { pass: boolean }) => !c.pass);
    assert.deepEqual(failing, [], `failing checks: ${failing.map((c: { name: string; detail: string }) => `${c.name}: ${c.detail}`).join("; ")}`);
    for (const k of ["drive:slope_torque", "drive:top_speed", "power:runtime", "power:voltage", "stability:tip"]) assert.ok(d.checks.some((c: { name: string }) => c.name === k), `missing check ${k}`);
    // printed parts fit the bed and are watertight
    assert.ok(d.printed.length > 0);
    for (const p of d.printed) assert.ok(p.check.fits_bed && p.check.watertight, `${p.name}: ${JSON.stringify(p.check)}`);
    // real catalog parts, wheels driven by the bought motors
    for (const p of d.purchased) assert.ok(part(p.key).price_usd >= 0);
    const driven = spec.joints.filter((j) => j.type === "continuous" && !j.passive);
    assert.ok(driven.length >= 2);
    for (const j of driven) assert.ok(j.limit && j.limit.effort > 0 && j.limit.velocity > 0);
    // battery and compute are on board, sensors are registered
    assert.ok(d.purchased.some((p: { key: string }) => p.key.startsWith("lipo_")));
    assert.ok(d.purchased.some((p: { key: string }) => p.key === "rpi5" || p.key === "jetson_orin_nano_super"));
    assert.ok(spec.sensors.length > 0);
    for (const s of spec.sensors) assert.ok(spec.links.some((l) => l.name === s.parent), `sensor ${s.name} on missing link ${s.parent}`);
    // mass and cost are sane
    const mass = totalMass(spec);
    assert.ok(mass >= m0 && mass <= m1, `mass ${mass}`);
    assert.ok(d.performance.cost_usd >= c0 && d.performance.cost_usd <= c1, `cost ${d.performance.cost_usd}`);
    assert.ok(d.performance.runtime_h >= 1);
    assert.ok(d.request && typeof d.request === "object");
  });
}

test("mobile designer: no two parts intersect (diff drive, Baymax)", () => {
  for (const spec of [designDiffDrive({}), designBaymax({})]) {
    const r = interference(spec);
    assert.equal(r.skipped.length, 0, r.skipped.join(", "));
    assert.deepEqual(r.overlaps, []);
  }
});

test("mobile designer: requested sensors are mounted as catalog parts", () => {
  for (const make of [designWallE, designEva, designBaymax, designFourWheel]) {
    const spec = make({ sensors: ["camera", "depth", "lidar", "imu"] });
    const keys = design(spec).purchased.map((p: { key: string }) => p.key);
    for (const k of ["rplidar_c1", "realsense_d435i", "bno085_breakout"]) assert.ok(keys.includes(k), `${spec.robot_name} lacks ${k}`);
    for (const t of ["lidar", "depth", "imu", "camera"]) assert.ok(spec.sensors.some((s) => s.type === t), `${spec.robot_name} lacks a ${t} sensor`);
    assert.deepEqual(design(spec).checks.filter((c: { pass: boolean }) => !c.pass), []);
  }
});

test("mobile designer: drive motor and battery follow the load", () => {
  const light = design(designFourWheel({}));
  const heavy = design(designFourWheel({ payloadKg: 25 }));
  const ladder = ["pololu_37d_30to1_64cpr", "pololu_37d_50to1_64cpr", "pololu_37d_70to1_64cpr"];
  assert.ok(ladder.indexOf(heavy.performance.drive_motor) > ladder.indexOf(light.performance.drive_motor), `${light.performance.drive_motor} -> ${heavy.performance.drive_motor}`);
  assert.ok(heavy.checks.find((c: { name: string }) => c.name === "drive:slope_torque").pass);
});

test("mobile designer: rover wheel count and deterministic output", () => {
  const four = designRover({ wheels: 4 }), six = designRover({});
  const wheels = (s: RobotSpecification) => s.joints.filter((j) => j.type === "continuous" && !j.passive).length;
  assert.equal(wheels(four), 4);
  assert.equal(wheels(six), 6);
  const strip = (s: RobotSpecification) => JSON.stringify({ ...s, metadata: { ...s.metadata, created: "" } });
  assert.equal(strip(designRover({ wheels: 4 })), strip(four));
});
