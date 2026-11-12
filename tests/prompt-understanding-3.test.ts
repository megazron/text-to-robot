// The local parser must apply, approximate or explicitly report every request (part 3 of 3: the
// design engine's CSG library keeps a little WASM memory per robot, so the suite is split across processes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, interpretPrompt, finalizeSpec, parsePrompt, } from "@ttr/robot-generator";
import { extractLengths, } from "../packages/robot-generator/src/text.ts";

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const family = (prompt: string) => read(prompt).family;
const arm = () => finalizeSpec(parsePrompt("6 dof arm"));
const _seg = (spec: ReturnType<typeof arm>, name: string): number => (spec.metadata as any).design.performance[`${name}_m`];


test("modify keeps the original budget and payload for the BOM", async () => {
  const r = await generateRobot("6 dof arm with a 1 kg payload, budget $2500");
  const { modifyRobot } = await import("@ttr/robot-generator");
  const m = await modifyRobot(r.robot, "make the forearm 10% longer");
  assert.equal(m.bom.budget, 2500);
  assert.match(m.bom.notes.join(), /1 kg payload/);
});

// ---------------- sensor mounting ----------------
import { bodyEnvelope } from "../packages/robot-generator/src/nlp.ts";
import { setDefaultRouter } from "@ttr/design";

// These tests check how prompts are read, not the harness the 3D router lays (tests/wiring3d and the example tests check
// that), so their designs lay wires as straight runs, as the website's first pass does.
setDefaultRouter("legacy");


test("inline sensors sit on the outer surface, never inside the body", () => {
  for (const prompt of ["hexapod with a lidar", "Mars rover with a 6 dof arm and an RGB-D camera", "diff drive robot with a camera and a lidar",
    "quadruped with a lidar and a camera", "6 dof arm with a lidar", "6 dof arm with a camera", "humanoid with a lidar and a camera", "gripper with a camera"]) {
    const spec = finalizeSpec(parsePrompt(prompt));
    for (const s of spec.sensors.filter((x) => x.type !== "imu" && /_\d+$/.test(x.name))) {
      const j = spec.joints.find((x) => x.child === s.parent)!;
      const env = bodyEnvelope(spec, j.parent), [x, y, z] = j.origin.xyz, eps = 1e-9;
      const inside = x > env.min[0] + eps && x < env.max[0] - eps && y > env.min[1] + eps && y < env.max[1] - eps && z > env.min[2] + eps && z < env.max[2] - eps;
      assert.ok(!inside, `${prompt}: ${s.name} mount ${j.origin.xyz} is inside ${j.parent} ${JSON.stringify(env)}`);
    }
  }
  assert.match(read("6 dof arm with a lidar").ignored.join(), /lidar: the 6-DOF serial arm design has no mount/);
  // designed robots mount the real IMU board on the chassis, never on a wheel or another sensor
  const dd = finalizeSpec(parsePrompt("diff drive robot with an imu"));
  const imu = dd.sensors.find((x) => x.type === "imu")!;
  assert.equal((dd.links.find((l) => l.name === imu.parent)!.geometry as any).params?.key, "bno085_breakout");
  const holder = dd.links.find((l) => l.name === dd.joints.find((j) => j.child === imu.parent)!.parent)!;
  assert.ok(!["wheel", "sensor", "actuator"].includes(holder.role ?? ""), `IMU sits on ${holder.name} (${holder.role})`);
});


// ---------------- adversarial regressions ----------------
test("negation: doesn't / neither-nor / postfix / instead of / blanket exceptions", () => {
  const types = (p: string) => parsePrompt(p).sensors.map((s) => s.type).sort();
  // a designed base keeps its default IMU; the negated lidar is never mounted
  assert.ok(!types("a rover that doesn't have a lidar").includes("lidar"));
  assert.deepEqual(types("a rover with neither lidar nor camera"), ["imu"]);
  assert.deepEqual(types("rover, lidar is not needed"), ["imu"]);
  assert.deepEqual(types("a rover but not with a lidar"), ["imu"]);
  assert.deepEqual(types("a rover with lidar instead of a camera"), ["lidar"]);
  // a walking robot keeps the IMU it balances with
  assert.deepEqual(types("a quadruped with no sensors except a camera"), ["camera", "imu"]);
  assert.equal(parsePrompt("a robot arm that doesn't need a gripper").end_effectors.length, 0);
  assert.equal(family("no camera on my quadruped"), "quadruped");
  assert.equal(family("I don't want a lidar on the rover"), "diff_drive");
});


test("payload vs robot mass", () => {
  assert.equal(read("a robot arm that weighs under 20 kg and lifts 3 kg").payload_kg, 3);
  assert.equal(read("a lightweight 6 dof arm under 5 kg with a 1 kg payload").payload_kg, 1);
  assert.match(read("6 dof arm, 2 kg payload, 6 kg total weight").ignored.join(), /mass 6 kg/);
  for (const p of ["6 dof arm that picks up 2 kg boxes", "6 dof arm for 2 kg parts", "arm with 2kg capacity", "arm rated for 2 kg"]) assert.equal(read(p).payload_kg, 2, p);
});


test("sizes, names and objects are not confused", () => {
  assert.equal(read("a robot arm for small parts").dimensions.length, 0);
  assert.equal(read("a robot arm that handles large boxes").dimensions.length, 0);
  assert.equal(read("an arm named Tiny").dimensions.length, 0);
  assert.equal(read('an arm named "Unit 50"').dimensions.length, 0);
  assert.equal(parsePrompt("a robot arm named after my dog").robot_name, "arm_6dof");
  assert.equal(parsePrompt("an arm that can be called from ROS").robot_name, "arm_6dof");
  assert.equal(parsePrompt("an arm, name: atlas").robot_name, "atlas");
  assert.match(read("small quadruped").ignored.join(), /sized from its parts/, "size words do not scale a designed robot");
  assert.match(read("small diff drive robot").ignored.join(), /sized from its parts/);
  assert.match(read("6 dof arm mounted 50 cm above the table").ignored.join(), /positions and part sizes/);
  assert.ok(Math.abs(extractLengths("1,000 mm reach")[0].metres - 1) < 1e-9);
  assert.ok(Math.abs(extractLengths("a reach of one meter")[0].metres - 1) < 1e-9);
  assert.equal(extractLengths("a 5'10\" wearer").length, 1);
});
