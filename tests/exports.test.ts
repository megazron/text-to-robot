import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeSpec } from "@ttr/robot-generator";
import { nDofArm, humanoid, diffDrive, TEMPLATES } from "@ttr/robot-templates";
import { validateSpec } from "@ttr/robot-schema";
import { linkPositions } from "@ttr/kinematics";
import { generateStlFiles, assemblyStl, printabilityReport, geometryTris } from "@ttr/cad";
import { exportMoveIt, exportGazebo, exportRos2Package } from "@ttr/ros2-export";
import { exportTraining, classify } from "@ttr/training-export";

test("STL: every primitive triangulates to a closed-ish, non-empty mesh", () => {
  assert.equal(geometryTris({ type: "box", size: [1, 1, 1] }).length, 12);
  assert.ok(geometryTris({ type: "cylinder", radius: 0.1, length: 0.2 }).length > 60);
  assert.ok(geometryTris({ type: "sphere", radius: 0.1 }).length > 100);
  assert.ok(geometryTris({ type: "capsule", radius: 0.05, length: 0.2 }).length > 100);
});
test("STL: assembly is valid ASCII STL with one part file per link", () => {
  const spec = finalizeSpec(nDofArm(6));
  const stl = assemblyStl(spec);
  assert.ok(stl.startsWith("solid ") && stl.trim().endsWith("endsolid arm_6dof"));
  assert.ok((stl.match(/facet normal/g) ?? []).length > 500);
  const files = generateStlFiles(spec);
  for (const l of spec.links) assert.ok(files[`cad/stl/parts/${l.name}.stl`], `missing ${l.name}.stl`);
  assert.ok(files["cad/PRINTABILITY.md"]);
});
test("printability flags parts larger than the build volume", () => {
  const spec = finalizeSpec(nDofArm(6));
  const forearm = spec.links.find((l) => l.role === "forearm")!;
  if (forearm.geometry.type === "cylinder") forearm.geometry.length = 0.5; // 500 mm > 220 mm
  const rep = printabilityReport(spec, 220);
  assert.ok(rep.issues.some((i) => i.part === "forearm" && /build volume/.test(i.message)));
});
test("MoveIt: arm gets an SRDF chain, a launch file and controllers", () => {
  const spec = finalizeSpec(nDofArm(6));
  const f = exportMoveIt(spec);
  const srdf = String(f[`arm_6dof/moveit/arm_6dof.srdf`]);
  assert.ok(srdf && srdf.includes('<group name="arm">') && srdf.includes("<chain"));
  assert.ok(String(f[`arm_6dof/launch/move_group.launch.py`]).includes("MoveItConfigsBuilder"));
  assert.ok(String(f[`arm_6dof/moveit/moveit_controllers.yaml`]).includes("joint_1"));
});
test("MoveIt: a robot without an arm chain degrades gracefully", () => {
  const f = exportMoveIt(finalizeSpec(diffDrive()));
  assert.ok(Object.keys(f).some((k) => k.endsWith("moveit/README.md")));
  assert.ok(!Object.keys(f).some((k) => k.endsWith(".srdf")));
});
test("Gazebo: world SDF + launch are produced and referenced by the package", () => {
  const spec = finalizeSpec(nDofArm(6));
  const g = exportGazebo(spec);
  assert.ok(String(g[`arm_6dof/worlds/arm_6dof.sdf`]).includes("<sdf"));
  assert.ok(String(g[`arm_6dof/launch/gazebo.launch.py`]).includes("ros_gz_sim"));
  const pkg = exportRos2Package(spec);
  assert.ok(String(pkg[`arm_6dof/CMakeLists.txt`]).includes("worlds"));
  assert.ok(pkg[`arm_6dof/worlds/arm_6dof.sdf`]);
});
test("humanoid stands on the ground with coherent frames", () => {
  const spec = finalizeSpec(humanoid());
  assert.ok(validateSpec(spec).valid);
  const pos = linkPositions(spec, {});
  const minZ = Math.min(...Object.values(pos).map((p) => p[2]));
  assert.ok(minZ >= -1e-9, `a link frame is below ground: ${minZ}`);
  assert.ok(pos["head"][2] > pos["left_shoulder"][2], "head must be above the shoulders");
  assert.ok(pos["left_shoulder"][2] > pos["left_foot"][2] + 0.5, "shoulders must be well above the feet");
  assert.equal(classify(spec), "locomotion");
});
test("training export produces a coherent suite for every template", () => {
  for (const t of TEMPLATES) {
    const f = exportTraining(finalizeSpec(t.build()));
    for (const req of ["training/robot_env.py", "training/tasks.py", "training/train_rl.py", "training/collect_demos.py", "training/train_bc.py", "training/evaluate.py", "training/requirements.txt"])
      assert.ok(f[req], `${t.id} missing ${req}`);
    assert.ok(String(f["training/train_rl.py"]).includes("_tb_dir"), "trainer must tolerate missing tensorboard");
  }
});
