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
