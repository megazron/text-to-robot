import { test } from "node:test";
import assert from "node:assert/strict";
import { finalizeSpec } from "@ttr/robot-generator";
import { nDofArm, humanoid, diffDrive, TEMPLATES, ironManMark43 } from "@ttr/robot-templates";
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
test("STL: assembly is a valid binary STL with one part file per link", () => {
  const spec = finalizeSpec(nDofArm(6));
  const stl = assemblyStl(spec), n = new DataView(stl.buffer, stl.byteOffset).getUint32(80, true);
  assert.ok(n > 500);
  assert.equal(stl.byteLength, 84 + n * 50);
  const files = generateStlFiles(spec);
  for (const l of spec.links) assert.ok(files[`cad/stl/parts/${l.name}.stl`], `missing ${l.name}.stl`);
  assert.ok(files["cad/PRINTABILITY.md"]);
});
test("printability flags parts larger than the build volume", () => {
  const spec = finalizeSpec(nDofArm(6));
  const forearm = spec.links.find((l) => l.role === "forearm")!;
  forearm.geometry = {type:"cylinder",radius:.03,length:.5}; // 500 mm > 220 mm
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

test('MoveIt wearable groups separate both limbs from armour and wire mock control',()=>{
  const spec=finalizeSpec(ironManMark43());
  const files=exportRos2Package(spec),prefix=spec.robot_name;
  const srdf=String(files[`${prefix}/moveit/${prefix}.srdf`]);
  assert.ok(srdf.includes('group name="left_arm"')&&srdf.includes('group name="right_arm"'));
  assert.ok(srdf.includes('group name="left_leg"')&&srdf.includes('group name="right_leg"'));
  assert.ok(String(files[`${prefix}/urdf/${prefix}.urdf.xacro`]).includes('config/ros2_control.xacro'));
  assert.ok(String(files[`${prefix}/config/controllers.yaml`]).includes('allow_partial_joints_goal: true'));
  assert.ok(String(files[`${prefix}/config/ompl_planning.yaml`]).includes('geometric::RRTConnect'));
});
test('training download includes the actual MuJoCo runtime and per-joint PyBullet limits',()=>{
  const files=exportTraining(finalizeSpec(nDofArm(6)));
  assert.ok(files['training/mujoco/ttr_mujoco/convert.py']);
  assert.ok(files['training/mujoco/ttr_mujoco/wearability.py']);
  const env=String(files['training/robot_env.py']);
  assert.ok(env.includes('force=effort')&&env.includes('BulletClient'));assert.ok(!env.includes('force=50'));
});

test('ROS collision meshes preserve hollow geometry without changing default simulation boxes', async()=>{
  const {generateUrdf}=await import('@ttr/urdf-generator');
  const spec=finalizeSpec(ironManMark43());
  const files=exportRos2Package(spec),name=spec.robot_name;
  const collisions=(xml:string)=>[...xml.matchAll(/<collision>[\s\S]*?<\/collision>/g)].map(m=>m[0]);
  assert.ok(collisions(String(files[`${name}/urdf/${name}.urdf`])).some(c=>c.includes('<mesh')));
  assert.ok(!collisions(generateUrdf(spec)).some(c=>c.includes('<mesh')));
  const link=spec.links.find(l=>l.geometry.type==='mesh')!;
  const xml=generateUrdf(spec,{meshCollisions:true});
  const body=xml.split(`<link name="${link.name}">`)[1].split('</link>')[0];
  assert.equal(body.match(/<visual>\s*(<origin[^>]+>)/)?.[1],body.match(/<collision>\s*(<origin[^>]+>)/)?.[1]);
});

test('MoveIt creates separate humanoid arms and names legged chains as legs', async()=>{
  const {planningGroups}=await import('@ttr/ros2-export');
  const {quadruped,hexapod}=await import('@ttr/robot-templates');
  const arms=planningGroups(finalizeSpec(humanoid())).map(g=>g.name);
  assert.ok(arms.includes('left_arm')&&arms.includes('right_arm'));
  for(const [spec,n] of [[quadruped(),4],[hexapod(),6]] as const){
    const groups=planningGroups(finalizeSpec(spec));assert.equal(groups.length,n);
    assert.ok(groups.every(g=>g.name.endsWith('_leg')));
  }
});

test('MoveIt excludes fixed-assembly contacts while keeping non-adjacent bodies checked',()=>{
  const spec=finalizeSpec(nDofArm(6));
  const srdf=exportMoveIt(spec)['arm_6dof/moveit/arm_6dof.srdf'] as string;
  const excluded=(a:string,b:string)=>srdf.includes(`link1="${a}" link2="${b}"`) || srdf.includes(`link1="${b}" link2="${a}"`);
  assert.ok(excluded('base_link_service_lid','base_link_front_panel'));
  assert.ok(excluded('forearm','wrist_1_joint_hub'));
  assert.ok(!excluded('shoulder_joint_hub','forearm'));
  assert.ok(!excluded('base_link_service_lid','forearm'));
});

test('mock control starts sliding fingers open without excluding opposing pad contacts',()=>{
  const spec=finalizeSpec(nDofArm(6));const files=exportRos2Package(spec);
  const xacro=files['arm_6dof/config/ros2_control.xacro'] as string;
  assert.ok(xacro);
  const finger=xacro.split('<joint name="left_finger_joint">')[1].split('</joint>')[0];
  assert.match(finger,/<param name="initial_value">0.01<\/param>/);
  const srdf=files['arm_6dof/moveit/arm_6dof.srdf'] as string;
  assert.ok(!/link1="left_finger_pad" link2="right_finger_pad"|link1="right_finger_pad" link2="left_finger_pad"/.test(srdf));
});

test("ROS 2 launch files pass robot_description as a string and the display layout needs no MoveIt", () => {
  // Jazzy parses an untyped Command(...) parameter as YAML and refuses to start robot_state_publisher on a URDF
  for (const spec of [nDofArm(6), diffDrive()]) {
    const f = exportRos2Package(spec, { ros2_control: true }), pkg = spec.robot_name;
    for (const launch of [`${pkg}/launch/display.launch.py`, `${pkg}/launch/gazebo.launch.py`]) {
      const text = String(f[launch]);
      assert.match(text, /ParameterValue\(Command\(\["xacro ", xacro_file\]\), value_type=str\)/, launch);
      assert.doesNotMatch(text.replace(/ParameterValue\(Command\(\[[^\]]*\]\), value_type=str\)/g, ""), /Command\(\[/, `${launch}: an untyped Command parameter is left`);
      assert.match(text, /from launch_ros\.parameter_descriptions import ParameterValue/);
    }
    const display = String(f[`${pkg}/launch/display.launch.py`]);
    assert.match(display, /IfCondition\(LaunchConfiguration\("gui"\)\)/, "the gui argument chooses the slider window");
    assert.match(display, /UnlessCondition\(LaunchConfiguration\("gui"\)\)/);
    const xml = String(f[`${pkg}/package.xml`]);
    for (const dep of ["joint_state_publisher", "joint_state_publisher_gui", "ros_gz_sim", "ros_gz_bridge"]) assert.ok(xml.includes(`<exec_depend>${dep}</exec_depend>`), dep);
    // display.launch.py runs without move_group: its RViz layout must not load the MoveIt panel
    const rviz = String(f[`${pkg}/rviz/${pkg}.rviz`]);
    assert.doesNotMatch(rviz, /MotionPlanning/);
    assert.doesNotMatch(rviz.split("Views:")[0], /rviz_default_plugins\/Orbit/, "Orbit is a view controller, not a tool");
  }
  const arm = exportRos2Package(nDofArm(6), { ros2_control: true });
  assert.match(String(arm["arm_6dof/rviz/arm_6dof_moveit.rviz"]), /moveit_rviz_plugin\/MotionPlanning/);
  assert.match(String(arm["arm_6dof/launch/move_group.launch.py"]), /rviz\/arm_6dof_moveit\.rviz/);
});

test("training env: mimic joints are driven from their leader and a geared gripper does not collide with itself; a gripper trains on aperture", async () => {
  const { readFileSync } = await import("node:fs");
  // PyBullet ignores URDF <mimic>: with the second finger and the rack pinion left free, no sampled pose of the SCARA was
  // collision-free and reset() raised "No collision-free target found"
  const scara = JSON.parse(readFileSync("examples/04_scara/robot.json", "utf8"));
  const env = String(exportTraining(scara)["training/robot_env.py"]);
  assert.ok(env.includes(`mimic = {"gripper_pinion":["finger_a",95.238095,0],"finger_b":["finger_a",1,0]}`));
  assert.match(env, /for f,l,m,o in self\.mimic: self\.p\.resetJointState/);
  assert.match(env, /geared\.setdefault/);
  const gripper = JSON.parse(readFileSync("examples/09_gripper/robot.json", "utf8"));
  assert.equal(classify(gripper), "gripper", "a standalone gripper opens and closes; it cannot reach");
  assert.equal(classify(scara), "manipulator");
});
