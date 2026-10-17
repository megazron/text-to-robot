// The local parser must apply, approximate or explicitly report every request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, interpretPrompt, applyModification, finalizeSpec, parsePrompt, extractBudget, splitClauses } from "@ttr/robot-generator";
import { extractLengths, extractMasses, parseBudget, extractName, extractColour, isNegated } from "../packages/robot-generator/src/text.ts";

const read = (prompt: string) => interpretPrompt(prompt).interpretation;
const family = (prompt: string) => read(prompt).family;

test("negated sensors and grippers are not added", () => {
  assert.equal(parsePrompt("a robot arm without a camera").sensors.length, 0);
  assert.equal(parsePrompt("6 dof arm with no lidar").sensors.length, 0);
  assert.deepEqual(parsePrompt("6 dof arm with no lidar, but a camera").sensors.map((s) => s.type), ["camera"]);
  assert.equal(parsePrompt("a 6 dof arm without a gripper").end_effectors.length, 0);
  assert.equal(read("6 dof arm without lidar or camera").sensors.length, 0);
  assert.ok(isNegated("no lidar", 3));
  assert.ok(!isNegated("no lidar and a camera", 16));
});

test("words inside other words do not select robots", () => {
  assert.throws(() => parsePrompt("a farming robot"), /not recognised/);
  assert.throws(() => parsePrompt("a robot alarm"), /not recognised/);
  assert.throws(() => parsePrompt("a hotdog stand"), /not recognised/);
  assert.equal(parsePrompt("6 dof arm with maximum reach").sensors.length, 0, "'maximum' is not an IMU");
});

test("families: synonyms and approximations are explicit", () => {
  assert.equal(family("a two legged walking robot"), "humanoid");
  assert.equal(family("a bipedal robot"), "humanoid");
  assert.equal(family("a mobile manipulator"), "rover_arm");
  assert.equal(family("wheeled robot with an arm"), "rover_arm");
  assert.equal(family("robot with 4 wheels and an arm"), "rover_arm");
  assert.match(read("tracked robot with an arm").approximations.join(), /tracks/);
  assert.equal(family("a robot dog"), "quadruped");
  assert.equal(family("robot vacuum cleaner"), "diff_drive");
  assert.equal(family("skid steer 4wd rover"), "four_wheel");
  assert.equal(family("a cobot"), "serial_arm");
  assert.equal(family("a six-axis industrial robot"), "serial_arm");
  assert.equal(family("soft robot arm"), "serial_arm");
  const omni = read("omnidirectional robot with omni wheels");
  assert.equal(omni.family, "mecanum"); assert.match(omni.approximations.join(), /mecanum/);
  const tracked = read("tracked tank robot");
  assert.equal(tracked.family, "four_wheel"); assert.match(tracked.approximations.join(), /tracks/);
  assert.match(read("a dual-arm robot").approximations.join(), /humanoid/);
});

test("unsupported robot types explain themselves", () => {
  assert.throws(() => parsePrompt("quadcopter drone"), /Aerial/);
  assert.throws(() => parsePrompt("a delta robot"), /Parallel-kinematics/);
  assert.throws(() => parsePrompt("gantry robot"), /gantry/);
  assert.throws(() => parsePrompt("robotic hand"), /hands/);
  assert.throws(() => parsePrompt("asdf qwerty"), /not recognised.*Try an arm/);
});

test("DOF: clamped with a note; fixed templates accept per-limb counts", () => {
  const i = read("a 20 dof arm");
  assert.equal(i.dof, 14); // 12 arm joints + 2 finger joints
  assert.match(i.approximations.join(), /20 DOF clamped to 12/);
  assert.ok(!read("Create a humanoid battle mech with two 7 DOF arms").ignored.length);
  assert.match(read("a quadruped with 5 dof legs").ignored.join(), /fixed kinematics/);
  assert.equal(family("a manipulator with 7 joints"), "serial_arm");
});

test("names stop at the next phrase", () => {
  assert.equal(parsePrompt("an arm called atlas with a camera").robot_name, "atlas");
  assert.equal(parsePrompt('a quadruped named "Rover Prime" for patrols').robot_name, "rover_prime");
  assert.equal(extractName("a robot named zed, with wheels"), "zed");
});

test("lengths are unit-aware and set the arm's stretched reach", () => {
  const cm = extractLengths("with 60 cm reach")[0];
  assert.equal(cm.context, "reach"); assert.ok(Math.abs(cm.metres - 0.6) < 1e-9);
  assert.ok(Math.abs(extractLengths("600mm reach")[0].metres - 0.6) < 1e-9);
  assert.ok(Math.abs(extractLengths("a 6 ft 2 wearer")[0].metres - 1.8796) < 1e-4);
  assert.equal(extractLengths("moves at 2 m/s").length, 0);
  assert.equal(extractLengths("under 2 m reach")[0].bound, "max");
  for (const [prompt, reach] of [["6 dof arm with 60 cm reach", "0.60"], ["6 dof arm with 1 m reach", "1.00"], ["a scara with 600 mm reach", "0.60"]] as const)
    assert.match(read(prompt).dimensions.join(), new RegExp(`reach ${reach} m`), prompt);
  assert.match(read("6 dof arm under 2 m reach").dimensions.join(), /within the 2 m limit/);
  assert.match(read("1.2 m tall humanoid").ignored.join(), /height 1.2 m/);
  assert.match(read("a quadruped that moves at 2 m/s").ignored.join(), /speed 2 m\/s/);
});

test("size adjectives apply to arms and ignore sensor adjectives", () => {
  assert.match(read("a small 4 dof arm").dimensions.join(), /small: reach/);
  assert.equal(read("small camera on a 6 dof arm").dimensions.length, 0);
});

test("budget: dollars only; lengths and masses are not money", () => {
  assert.equal(extractBudget("budget $1500"), 1500);
  assert.equal(extractBudget("under 2000 dollars"), 2000);
  assert.equal(extractBudget("budget of 1.5k"), 1500);
  assert.equal(extractBudget("6 dof arm under 2 m reach"), undefined);
  assert.equal(extractBudget("6 dof arm, max 5 kg payload"), undefined);
  assert.equal(parseBudget("budget 500 euros").unsupported, "500 euros");
  assert.equal(parseBudget("₹40000").usd, undefined);
  assert.match(read("6 dof arm, budget 500 euros").ignored.join(), /only US-dollar/);
});

test("payload is sized into the BOM actuators", async () => {
  assert.deepEqual(extractMasses("lifts 2 kg").map((m) => [m.kg, m.context]), [[2, "payload"]]);
  assert.ok(Math.abs(extractMasses("a 10 lb payload")[0].kg - 4.5359237) < 1e-6);
  const plain = await generateRobot("6 dof arm");
  const loaded = await generateRobot("6 dof arm with a 2 kg payload");
  assert.equal(loaded.interpretation?.payload_kg, 2);
  const effort = (r: typeof plain, j: string) => r.bom.actuator_sizing.find((s) => s.joint === j)!.required_effort;
  // Neutral-pose proxy; joints whose declared effort floor is higher (the shoulder) keep that floor.
  for (const j of ["joint_3", "joint_4", "joint_5", "joint_6"]) assert.ok(effort(loaded, j) > effort(plain, j), j);
  assert.ok(effort(loaded, "joint_6") - effort(plain, "joint_6") > 0.4, "wrist carries the payload's tool moment");
  assert.match(loaded.bom.notes.join(), /2 kg payload/);
  assert.match(read("a quadruped carrying 3 kg").ignored.join(), /no end effector/);
});

test("colour applies to the robot body, not to objects it handles", () => {
  assert.equal(extractColour("a red 6 dof arm that sorts blue blocks"), "red");
  assert.equal(extractColour("an arm that sorts red blocks"), undefined);
  assert.deepEqual(parsePrompt("a blue quadruped").materials.find((m) => m.name === "link_mat")!.color, [0.15, 0.35, 0.8, 1]);
  assert.match(read("a red Baymax robot").ignored.join(), /livery/);
});

test("wearable suits fit a stated stature and say what is unaudited", () => {
  const i = read("Iron Man suit for a 6 ft 2 wearer");
  assert.equal(i.family, "iron_man_mark_43");
  assert.ok(Math.abs(i.wearer_height_m! - 1.88) < 0.01);
  assert.match(i.approximations.join(), /reference size only/);
  assert.match(read("exoskeleton for a 2.4 m person").ignored.join(), /outside the supported/);
});

test("every generate result carries a readable summary and surfaced warnings", async () => {
  const r = await generateRobot("a tracked robot with a lidar, budget $800");
  assert.match(r.summary!, /four-wheel skid-steer base · lidar \(base_link\) · budget \$800/);
  assert.ok(r.warnings.some((w) => w.startsWith("approximated: tracks")));
});

// ---------------- modifications ----------------
const arm = () => finalizeSpec(parsePrompt("6 dof arm"));
const lengthOf = (spec: ReturnType<typeof arm>, name: string) => {
  const g = spec.links.find((l) => l.name === name)!.geometry; return g.type === "mesh" ? g.bbox.max[2] - g.bbox.min[2] : NaN;
};

test("clauses split on 'and' and inherit the verb", () => {
  assert.deepEqual(splitClauses("add a lidar and a camera"), ["add a lidar", "add a camera"]);
  assert.deepEqual(splitClauses("make the upper arm 50% longer and the forearm 10% shorter, then paint it red"),
    ["make the upper arm 50% longer", "make the forearm 10% shorter", "paint it red"]);
});

test("modify: each clause targets its own link", () => {
  const { spec } = applyModification(arm(), "make the upper arm 50% longer and the forearm 10% shorter");
  assert.ok(Math.abs(lengthOf(spec, "upper_arm") - 0.375) < 1e-6);
  assert.ok(Math.abs(lengthOf(spec, "forearm") - 0.225) < 1e-6);
});

test("modify: absolute and relative lengths", () => {
  assert.ok(Math.abs(lengthOf(applyModification(arm(), "make the forearm 20 cm longer").spec, "forearm") - 0.45) < 1e-6);
  assert.ok(Math.abs(lengthOf(applyModification(arm(), "set the forearm to 40 cm").spec, "forearm") - 0.40) < 1e-6);
  const reach = applyModification(arm(), "set the reach to 80 cm");
  assert.match(reach.changes.join(), /-> 0\.800m/);
  assert.match(applyModification(arm(), "make the arm shorter").changes.join(), /used 20%/);
});

test("modify: resized links keep collision geometry in step with visuals", () => {
  const { spec } = applyModification(arm(), "make the forearm 30% longer");
  const f = spec.links.find((l) => l.name === "forearm")!;
  assert.deepEqual(f.collision, f.geometry);
  const scara = applyModification(finalizeSpec(parsePrompt("a scara robot")), "make the forearm 50% longer").spec;
  assert.ok(Math.abs(scara.joints.find((j) => j.name === "joint_3")!.origin.xyz[0] - 0.30) < 1e-9, "SCARA links extend along x");
});

test("modify: humanoid arms change symmetrically", () => {
  const { changes } = applyModification(finalizeSpec(parsePrompt("humanoid")), "make the arms 20% longer");
  assert.ok(changes.some((c) => c.startsWith("~ left_forearm")) && changes.some((c) => c.startsWith("~ right_forearm")));
});

test("modify: sensors add to the named location and can be removed", () => {
  const added = applyModification(arm(), "add a lidar and a camera to the wrist");
  assert.deepEqual(added.spec.sensors.map((s) => s.type), ["lidar", "camera"]);
  assert.ok(added.changes.every((c) => !c.includes("base_link")));
  const removed = applyModification(added.spec, "remove the camera");
  assert.deepEqual(removed.spec.sensors.map((s) => s.type), ["lidar"]);
  assert.ok(!removed.spec.links.some((l) => l.name === "camera_1_link"));
});

test("modify: grippers can be removed, added and swapped both ways", () => {
  const bare = applyModification(arm(), "remove the gripper").spec;
  assert.equal(bare.end_effectors.length, 0);
  assert.ok(!bare.links.some((l) => l.role === "gripper" || l.role === "contact_pad"));
  const suction = applyModification(bare, "add a suction gripper").spec;
  assert.deepEqual(suction.end_effectors.map((e) => e.type), ["suction_gripper"]);
  const back = applyModification(suction, "replace the suction cup with a two-finger gripper").spec;
  assert.deepEqual(back.end_effectors.map((e) => e.type), ["two_finger_gripper"]);
});

test("modify: DOF, colour and name", () => {
  const seven = applyModification(finalizeSpec(parsePrompt("6 dof arm with a wrist camera")), "make it 7 dof");
  assert.equal(seven.spec.joints.filter((j) => /^joint_\d+$/.test(j.name)).length, 7);
  assert.deepEqual(seven.spec.sensors.map((s) => s.type), ["camera"]);
  assert.match(applyModification(arm(), "paint it blue").changes.join(), /blue/);
  assert.equal(applyModification(arm(), "rename it to atlas").spec.robot_name, "atlas");
});

test("modify: unsupported requests are reported per clause", () => {
  const { changes } = applyModification(arm(), "make it lighter and add a camera");
  assert.ok(changes.includes('? Not understood: "make it lighter"'));
  assert.ok(changes.some((c) => c.includes("camera sensor")));
});

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
  const arm = finalizeSpec(parsePrompt("6 dof arm with a lidar"));
  const lidar = arm.joints.find((j) => j.child === "lidar_1_link")!;
  assert.ok(lidar.origin.xyz[0] > 0.05, "a crowded arm base puts the lidar on its front face, clear of the shoulder");
  const imu = finalizeSpec(parsePrompt("diff drive robot with an imu")).joints.find((j) => j.child === "imu_1_link")!;
  const env = bodyEnvelope(finalizeSpec(parsePrompt("diff drive robot")), "base_link");
  assert.ok(imu.origin.xyz[2] > env.min[2] && imu.origin.xyz[2] < env.max[2], "IMUs belong inside the body");
});

// ---------------- adversarial regressions ----------------
test("negation: doesn't / neither-nor / postfix / instead of / blanket exceptions", () => {
  const types = (p: string) => parsePrompt(p).sensors.map((s) => s.type).sort();
  assert.deepEqual(types("a rover that doesn't have a lidar"), []);
  assert.deepEqual(types("a rover with neither lidar nor camera"), []);
  assert.deepEqual(types("rover, lidar is not needed"), []);
  assert.deepEqual(types("a rover but not with a lidar"), []);
  assert.deepEqual(types("a rover with lidar instead of a camera"), ["lidar"]);
  assert.deepEqual(types("a quadruped with no sensors except a camera"), ["camera"]);
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
  assert.match(read("small quadruped").ignored.join(), /fixed size/);
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
  assert.equal(parsePrompt("a SCARA robot").end_effectors.length, 0);
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
  assert.deepEqual(parsePrompt("an arm with two cameras").sensors.map((s) => s.type), ["camera", "camera"]);
  const noWrist = finalizeSpec(parsePrompt("a 6 dof arm with a camera, but no gripper"));
  assert.equal(noWrist.joints.find((j) => j.child === "camera_1_link")!.parent, "base_link");
});

test("modify: relative DOF, gripper-mounted sensors, shared predicates, exclusions", () => {
  const joints = (m: string) => applyModification(arm(), m).spec.joints.filter((j) => /^joint_\d+$/.test(j.name)).length;
  assert.equal(joints("add two joints"), 8);
  assert.equal(joints("remove one axis"), 5);
  assert.equal(applyModification(arm(), "add a camera to the gripper").spec.sensors[0]?.type, "camera");
  const both = applyModification(arm(), "make the forearm and upper arm 10% longer").spec;
  assert.ok(Math.abs(lengthOf(both, "forearm") - 0.275) < 1e-6 && Math.abs(lengthOf(both, "upper_arm") - 0.275) < 1e-6);
  const partial = applyModification(arm(), "make the forearm longer but not the upper arm").spec;
  assert.ok(Math.abs(lengthOf(partial, "upper_arm") - 0.25) < 1e-9 && lengthOf(partial, "forearm") > 0.25);
  const sensored = finalizeSpec(parsePrompt("6 dof arm with a lidar and a camera"));
  assert.deepEqual(applyModification(sensored, "remove the lidar but keep the camera").spec.sensors.map((s) => s.type), ["camera"]);
  assert.deepEqual(applyModification(sensored, "remove everything except the camera").spec.sensors.map((s) => s.type), ["camera"]);
  assert.deepEqual(applyModification(arm(), "add a lidar, not a camera").spec.sensors.map((s) => s.type), ["lidar"]);
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
  const h = applyModification(finalizeSpec(parsePrompt("humanoid")), "replace the grippers with suction cups").spec;
  assert.deepEqual(h.end_effectors.map((e) => e.type), ["suction_gripper", "suction_gripper"]);
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
