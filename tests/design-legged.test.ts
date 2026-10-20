// Legged designers: valid specs, printable parts, every actuator sized from the loads of the built robot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSpec } from "@ttr/robot-schema";
import { designQuadruped, designHexapod, designHumanoid, designBattleMech, type LeggedRequest } from "@ttr/design";

const cases: [string, (r: LeggedRequest) => any, LeggedRequest][] = [
  ["quadruped", designQuadruped, { prompt: "Create a quadruped robot" }],
  ["hexapod", designHexapod, { prompt: "Build a six-legged reconnaissance spider-bot with a LiDAR turret, budget $1500", budget: 1500, sensors: ["lidar", "camera"] }],
  ["humanoid", designHumanoid, { prompt: "Create a small humanoid robot with a torso, head and two 7 DOF arms and two-finger grippers", armDof: 7, gripper: true }],
  ["battle mech", designBattleMech, { prompt: "Create a humanoid battle mech with two 7 DOF arms, a head camera and an IMU", armDof: 7, sensors: ["camera", "imu"] }],
];

for (const [name, design, req] of cases) {
  test(`${name}: valid spec, printable, every joint sized, every check passes`, () => {
    const spec = design(req), d = (spec.metadata as any).design;
    const v = validateSpec(spec);
    assert.ok(v.valid, v.issues.filter((i: any) => i.severity === "error").map((i: any) => i.message).join("; "));
    const prints = d.checks.filter((c: any) => c.name.startsWith("print:"));
    assert.ok(prints.length > 0);
    for (const c of prints) assert.ok(c.pass, `${c.name}: ${c.detail}`);
    const actuated = spec.joints.filter((j: any) => j.type === "revolute");
    const torque = d.checks.filter((c: any) => c.name.startsWith("torque:"));
    assert.equal(torque.length, actuated.length);
    for (const c of torque) assert.ok(c.pass, `${c.name}: ${c.detail}`);
    for (const c of d.checks) assert.ok(c.pass, `${c.name}: ${c.detail}`);
    // every revolute joint carries a real actuator rating and a geometry-checked range
    for (const j of actuated) { assert.ok(j.limit.effort > 0 && j.limit.velocity > 0); assert.ok(j.limit.lower <= 0 && j.limit.upper >= 0, j.name); }
    // sensors are real parts on the robot and listed in spec.sensors
    assert.ok(spec.sensors.some((s: any) => s.type === "imu"));
    assert.ok(spec.sensors.some((s: any) => s.type === "camera" || s.type === "depth"));
    assert.deepEqual(d.request, { ...req });
    assert.ok(d.performance.runtime_min >= 20);
  });
}

test("hexapod: 18 servos, LiDAR turret, within the $1500 budget", () => {
  const spec = designHexapod(cases[1][2]), d = (spec.metadata as any).design;
  assert.equal(spec.joints.filter((j: any) => j.type === "revolute").length, 18);
  assert.ok(spec.sensors.some((s: any) => s.type === "lidar"));
  assert.ok(d.performance.cost_usd <= 1500);
});

test("feet stand on the ground plane at zero joint angles (quadruped)", async () => {
  const { pointWorld } = await import("@ttr/design");
  const spec = designQuadruped({});
  const z = ["fl", "fr", "rl", "rr"].map((l) => pointWorld(spec, {}, `${l}_foot`)[2]);
  for (const v of z) assert.ok(Math.abs(v - z[0]) < 1e-6, "all feet at one height");
});

test("designers are deterministic for a given request", () => {
  const a = JSON.stringify(designQuadruped({ prompt: "dog" })), b = JSON.stringify(designQuadruped({ prompt: "dog" }));
  assert.equal(a.replace(/"created":"[^"]*"/g, ""), b.replace(/"created":"[^"]*"/g, ""));
});

test("a big / payload quadruped switches to CubeMars QDD actuators", () => {
  const spec = designQuadruped({ prompt: "Create a big quadruped that carries 3 kg", payloadKg: 3 });
  const keys = spec.links.filter((l: any) => l.name.endsWith("_actuator")).map((l: any) => l.geometry.params.key);
  assert.ok(keys.every((k: string) => k.startsWith("cubemars_")));
  for (const c of (spec.metadata as any).design.checks) assert.ok(c.pass, `${c.name}: ${c.detail}`);
});
