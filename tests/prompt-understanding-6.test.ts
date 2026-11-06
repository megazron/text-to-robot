// Second half of the file named after this one: the CSG heap never shrinks, so each process designs only so many robots.
// The local parser must apply, approximate or explicitly report every request (part 2 of 3: the
// design engine's CSG library keeps a little WASM memory per robot, so the suite is split across processes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretPrompt, applyModification, finalizeSpec, parsePrompt, } from "@ttr/robot-generator";

const _read = (prompt: string) => interpretPrompt(prompt).interpretation;
const arm = () => finalizeSpec(parsePrompt("6 dof arm"));
const seg = (spec: ReturnType<typeof arm>, name: string): number => (spec.metadata as any).design.performance[`${name}_m`];


test("modify: absolute and relative lengths", () => {
  const a = arm();
  assert.ok(Math.abs(seg(applyModification(a, "make the forearm 20 cm longer").spec, "forearm") - (seg(a, "forearm") + 0.2)) < 0.002);
  assert.ok(Math.abs(seg(applyModification(a, "set the forearm to 40 cm").spec, "forearm") - 0.40) < 0.002);
  const reach = applyModification(a, "set the reach to 80 cm");
  assert.match(reach.changes.join(), /-> 0\.800 m/);
  assert.ok(Math.abs((reach.spec.metadata as any).design.performance.reach_m - 0.8) < 0.02, "the arm is redesigned to that reach");
  assert.match(applyModification(arm(), "make the arm shorter").changes.join(), /used 20%/);
});


test("modify: resized links keep collision geometry in step with visuals", () => {
  const { spec } = applyModification(arm(), "make the forearm 30% longer");
  const f = spec.links.find((l) => l.name === "forearm")!;
  assert.ok(f.collision === undefined || JSON.stringify(f.collision) === JSON.stringify(f.geometry), "collision follows the printed bracket");
  // the designed SCARA is resized through its reach (and re-sized actuators), not link by link
  const scara = applyModification(finalizeSpec(parsePrompt("a scara robot")), "make the arm 50% longer");
  assert.ok(Math.abs((scara.spec.metadata as any).design.performance.reach_m - 0.45) < 0.01, "SCARA reach grows");
  assert.match(applyModification(finalizeSpec(parsePrompt("a scara robot")), "make the forearm 50% longer").changes.join(), /Changing the forearm is not supported/);
});


test("modify: humanoid limb lengths are refused clearly (sized from the actuators)", () => {
  // the designed humanoid sizes its limbs from its actuators: a limb-length edit is refused by name
  const { changes } = applyModification(finalizeSpec(parsePrompt("humanoid")), "make the arms 20% longer");
  assert.match(changes.join(), /Changing the arms is not supported/);
});


test("modify: sensors add to the named location and can be removed", () => {
  // a designed arm mounts real parts where they can work: a wrist camera yes, a 2D lidar no
  const added = applyModification(arm(), "add a lidar and a camera to the wrist");
  assert.deepEqual(added.spec.sensors.map((s) => s.type), ["camera"]);
  assert.match(added.changes.join(), /lidar: this arm design has no mount for it/);
  assert.ok(added.spec.links.some((l) => l.name === "wrist_camera" && (l.geometry as any).params?.key === "rpi_camera_module_3"));
  const removed = applyModification(added.spec, "remove the camera");
  assert.deepEqual(removed.spec.sensors.map((s) => s.type), []);
  assert.ok(!removed.spec.links.some((l) => l.name === "wrist_camera"));
});


test("modify: grippers can be removed, added and swapped both ways", () => {
  const bare = applyModification(arm(), "remove the gripper").spec;
  assert.equal(bare.end_effectors.length, 0);
  assert.ok(!bare.links.some((l) => l.role === "gripper" || l.role === "contact_pad"));
  assert.match(applyModification(bare, "add a suction gripper").changes.join(), /Suction cups are not in the parts library/);
  const back = applyModification(bare, "add a two-finger gripper").spec;
  assert.deepEqual(back.end_effectors.map((e) => e.type), ["two_finger_gripper"]);
});


test("modify: DOF, colour and name", () => {
  const seven = applyModification(finalizeSpec(parsePrompt("6 dof arm with a wrist camera")), "make it 7 dof");
  assert.equal(seven.spec.joints.filter((j) => j.type === "revolute" && j.name !== "gripper").length, 7);
  assert.deepEqual(seven.spec.sensors.map((s) => s.type), ["camera"]);
  assert.match(applyModification(arm(), "paint it blue").changes.join(), /blue/);
  assert.equal(applyModification(arm(), "rename it to atlas").spec.robot_name, "atlas");
});


test("modify: unsupported requests are reported per clause", () => {
  const { changes } = applyModification(arm(), "make it lighter and add a camera");
  assert.ok(changes.includes('? Not understood: "make it lighter"'));
  assert.ok(changes.some((c) => c.includes("camera sensor")));
});
