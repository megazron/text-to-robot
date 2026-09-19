import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRobot, modifyRobot, DemoProvider } from "@ttr/robot-generator";
import { exportRos2Package } from "@ttr/ros2-export";

test("acceptance: generate 6 DOF arm -> valid spec + URDF, ROS2 package", async () => {
  const r = await generateRobot("Create a 6 DOF robotic arm with a parallel gripper", { provider: new DemoProvider() });
  assert.ok(r.validation.valid, "spec invalid");
  assert.ok(r.urdfValidation.valid, "urdf invalid");
  const files = exportRos2Package(r.robot, { ros2_control: true });
  const name = r.robot.robot_name;
  for (const req of [`${name}/package.xml`, `${name}/CMakeLists.txt`, `${name}/urdf/${name}.urdf.xacro`, `${name}/launch/display.launch.py`]) {
    assert.ok(files[req], `missing ${req}`);
  }
});
test("acceptance: modify forearm keeps validity and recomputes inertia", async () => {
  const r = await generateRobot("6 dof arm", { provider: new DemoProvider() });
  const beforeMass = r.robot.links.find((l) => l.role === "forearm")!.mass;
  const m = await modifyRobot(r.robot, "make the forearm 30% longer", { provider: new DemoProvider() });
  assert.ok(m.validation.valid);
  const afterMass = m.robot.links.find((l) => l.role === "forearm")!.mass;
  assert.ok(afterMass > beforeMass, "mass should grow with length");
  assert.ok(m.changes.length > 0);
});
test("empty prompt throws", async () => {
  await assert.rejects(() => generateRobot("", { provider: new DemoProvider() }));
});
test("unrecognised requests do not silently become unrelated arms", async () => {
  await assert.rejects(generateRobot("asdf qwerty zzz"), /Robot type not recognised/);
});
