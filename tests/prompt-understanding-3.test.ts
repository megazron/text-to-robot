// The local parser must apply, approximate or explicitly report every request (part 3 of 3: the
// design engine's CSG library keeps a little WASM memory per robot, so the suite is split across processes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, interpretPrompt, applyModification, finalizeSpec, parsePrompt, extractBudget, } from "@ttr/robot-generator";
import { extractLengths, extractColour, } from "../packages/robot-generator/src/text.ts";

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const family = (prompt: string) => read(prompt).family;
const arm = () => finalizeSpec(parsePrompt("6 dof arm"));
const seg = (spec: ReturnType<typeof arm>, name: string): number => (spec.metadata as any).design.performance[`${name}_m`];


test("modify keeps the original budget and payload for the BOM", async () => {
  const r = await generateRobot("6 dof arm with a 1 kg payload, budget $2500");
  const { modifyRobot } = await import("@ttr/robot-generator");
  const m = await modifyRobot(r.robot, "make the forearm 10% longer");
  assert.equal(m.bom.budget, 2500);
  assert.match(m.bom.notes.join(), /1 kg payload/);
});

// ---------------- sensor mounting ----------------
import { bodyEnvelope } from "../packages/robot-generator/src/nlp.ts";


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


test("families: legs, wheels, SCARA grippers, suction on mobile manipulators, arms on legs", () => {
  assert.equal(family("a robot with 4 legs"), "quadruped");
  assert.equal(family("a robot with 6 legs"), "hexapod");
  assert.equal(family("a robot with wheels"), "diff_drive");
  assert.deepEqual(parsePrompt("a SCARA with a suction cup").end_effectors.map((e) => e.type), ["suction_gripper"]);
  // the designed SCARA carries its parallel gripper
  assert.deepEqual(parsePrompt("a SCARA robot").end_effectors.map((e) => e.type), ["parallel_gripper"]);
  assert.deepEqual(parsePrompt("a mobile manipulator with a suction cup").end_effectors.map((e) => e.type), ["suction_gripper"]);
  assert.match(read("a quadruped with an arm").ignored.join(), /legged base/);
  assert.match(read("7-DOF arm with a force torque sensor").ignored.join(), /only cameras/);
});


test("budgets, colours and sensor counts", () => {
  assert.equal(extractBudget("budget of 5 grand"), 5000);
  assert.equal(extractBudget("for 2000$"), 2000);
  assert.equal(extractColour("a robot arm, colour: red"), "red");
  assert.equal(extractColour("6 dof arm (blue)"), "blue");
  assert.equal(extractColour("a golden robot dog"), "gold");
  assert.match(read("a red baymax").ignored.join(), /livery/);
  assert.deepEqual(parsePrompt("an arm with two cameras").sensors.map((s) => s.type), ["camera"]);
  assert.match(read("an arm with two cameras").ignored.join(), /2 cameras: .* mounts 1/);
  const noWrist = finalizeSpec(parsePrompt("a 6 dof arm with a camera, but no gripper"));
  assert.equal(noWrist.end_effectors.length, 0);
  assert.equal(noWrist.joints.find((j) => j.child === "wrist_camera")!.parent, "tool_link");
});


test("modify: relative DOF, gripper-mounted sensors, shared predicates, exclusions", () => {
  const joints = (m: string) => applyModification(arm(), m).spec.joints.filter((j) => j.type === "revolute" && j.name !== "gripper").length;
  assert.equal(joints("add one joint"), 7);
  assert.equal(joints("remove one axis"), 5);
  assert.match(applyModification(arm(), "add two joints").changes.join(), /8 requested; supported range 1–7/);
  assert.equal(applyModification(arm(), "add a camera to the gripper").spec.sensors[0]?.type, "camera");
  const a = arm(), both = applyModification(a, "make the forearm and upper arm 10% longer").spec;
  assert.ok(Math.abs(seg(both, "forearm") - seg(a, "forearm") * 1.1) < 0.002 && Math.abs(seg(both, "upper_arm") - seg(a, "upper_arm") * 1.1) < 0.002);
  const partial = applyModification(a, "make the forearm longer but not the upper arm").spec;
  assert.ok(Math.abs(seg(partial, "upper_arm") - seg(a, "upper_arm")) < 0.002 && seg(partial, "forearm") > seg(a, "forearm"));
  const sensored = finalizeSpec(parsePrompt("6 dof arm with a depth camera and a camera"));
  assert.deepEqual(applyModification(sensored, "remove the depth camera but keep the camera").spec.sensors.map((s) => s.type), ["camera"]);
  assert.deepEqual(applyModification(arm(), "add a depth camera, not a camera").spec.sensors.map((s) => s.type), ["depth"]);
});


test("modify: names, politeness, sentence splits, budgets alongside edits", () => {
  assert.equal(applyModification(arm(), "rename it to rock and roll").spec.robot_name, "rock_and_roll");
  assert.equal(applyModification(arm(), 'rename it "Arm, Mk 2"').spec.robot_name, "arm_mk_2");
  assert.equal(applyModification(arm(), "change the name to atlas").spec.robot_name, "atlas");
  assert.equal(applyModification(arm(), "can you add a camera?").spec.sensors.length, 1);
  const two = applyModification(arm(), "make it 10% longer.add a camera");
  assert.ok(two.changes.some((c) => c.startsWith("~ reach")) && two.spec.sensors.length === 1);
  const b = applyModification(arm(), "add a camera with a budget of $500");
  assert.ok(b.changes.some((c) => c.includes("$500")) && b.spec.sensors.length === 1);
  assert.match(applyModification(arm(), "make the camera red").changes.join(), /Only the body colour/);
});


test("modify: humanoid grippers swap on both hands; legs and characters refuse clearly", () => {
  // the designed humanoid has servo grippers only, and says so instead of pretending
  const h = applyModification(finalizeSpec(parsePrompt("humanoid")), "replace the grippers with suction cups");
  assert.match(h.changes.join(), /Suction cups are not in the parts library/);
  assert.ok(h.spec.end_effectors.length === 2 && h.spec.end_effectors.every((e) => e.type !== "suction_gripper"));
  assert.match(applyModification(finalizeSpec(parsePrompt("humanoid")), "make the legs longer").changes.join(), /legs is not supported/);
  assert.match(applyModification(finalizeSpec(parsePrompt("baymax")), "paint it red").changes.join(), /livery/);
});


test("modify: a suit is refitted to a new wearer instead of stretching one limb", () => {
  const suit = finalizeSpec(parsePrompt("a wearable exoskeleton"));
  assert.match(applyModification(suit, "make the arms longer").changes.join(), /follow the wearer/);
  const refit = applyModification(suit, "fit it to a 1.9 m wearer");
  assert.match(refit.changes.join(), /1\.90 m wearer/);
  const z = (s: typeof suit) => s.joints.find((j) => /shoulder/.test(j.name))!.origin.xyz[2];
  assert.ok(z(refit.spec) > z(suit), "shoulders rise for a taller wearer");
});
