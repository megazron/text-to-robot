// MoveIt 2 planning groups and a complete mock-control launch. Mock execution
// validates ROS wiring; it is not a dynamics engine or a real hardware driver.
import type {RobotSpecification,Joint} from '@ttr/robot-schema';
import {safeName,findRoot} from '@ttr/robot-schema';
import type {FileMap} from './export.ts';
interface Group {name:string;joints:Joint[];base?:string;tip?:string}
export function planningGroups(spec:RobotSpecification):Group[] {
  const {root}=findRoot(spec);if(!root)return [];
  const parents=new Map(spec.joints.map(j=>[j.child,j]));
  const path=(base:string,tip:string):Joint[]=>{const out:Joint[]=[];let at=tip;while(at!==base){const j=parents.get(at);if(!j)return [];out.unshift(j);at=j.parent;}return out;};
  const groups:Group[]=[];
  if(spec.links.some(l=>l.name==='pelvis_frame')) {
    for(const side of ['left','right']) {
      for(const [name,base,tip] of [[`${side}_arm`,'shoulder_yoke',`${side}_hand`],[`${side}_leg`,'pelvis_frame',`${side}_boot`]]) {
        const joints=path(base,tip).filter(j=>j.type!=='fixed');if(joints.length)groups.push({name,base,tip,joints});
      }
      const joints=spec.joints.filter(j=>j.type!=='fixed'&&j.name.startsWith(side+'_')&&/finger|thumb/.test(j.name));
      if(joints.length)groups.push({name:`${side}_hand`,joints});
    }
    const torso=spec.joints.filter(j=>j.name==='trunk_flex');if(torso.length)groups.push({name:'torso',joints:torso});
    const armour=spec.joints.filter(j=>j.type!=='fixed'&&j.name.endsWith('_hinge')&&!/finger|thumb/.test(j.name));
    if(armour.length)groups.push({name:'armour',joints:armour});
    return groups;
  }
  const excluded=(j:Joint)=>/_hinge$|finger|thumb|gripper|suction|wheel|track/.test(j.name);
  // Every named limb has its own chain; a quadruped leg is not an "arm".
  for(const side of ['left','right']) {
    const tips=spec.links.filter(l=>l.name.startsWith(side+'_')&&/hand$|forearm$|wrist_[123]$/.test(l.name));
    tips.sort((a,b)=>path(root,b.name).length-path(root,a.name).length);
    if(tips.length) {
      const chain=path(root,tips[0].name),moving=chain.filter(j=>j.type!=='fixed');
      if(moving.length>=2&&!moving.some(excluded))groups.push({name:side+'_arm',base:root,tip:tips[0].name,joints:moving});
    }
  }
  for(const tip of spec.links.filter(l=>/(?:^|_)(?:foot|shin|tibia)$/.test(l.name))) {
    const chain=path(root,tip.name),moving=chain.filter(j=>j.type!=='fixed');
    if(moving.length<2||moving.some(excluded))continue;
    const name=tip.name.replace(/_(foot|shin|tibia)$/,'_leg');
    const old=groups.find(g=>g.name===name);
    if(old){if(old.joints.length<moving.length){old.tip=tip.name;old.joints=moving;}}
    else groups.push({name,base:root,tip:tip.name,joints:moving});
  }
  if(groups.length)return groups;
  // Choose an intact serial path; filtering out middle joints would disconnect it.
  const candidates=spec.links.map(l=>path(root,l.name)).filter(chain=>!chain.some(excluded));
  candidates.sort((a,b)=>b.filter(j=>j.type!=='fixed').length-a.filter(j=>j.type!=='fixed').length);
  const chain=candidates[0]??[],moving=chain.filter(j=>j.type!=='fixed');
  if(moving.length>=2)groups.push({name:'arm',base:root,tip:moving.at(-1)!.child,joints:moving});
  return groups;
}
export function exportMoveIt(spec:RobotSpecification):FileMap {
  const pkg=safeName(spec.robot_name),groups=planningGroups(spec),files:FileMap={};
  if(!groups.length){files[`${pkg}/moveit/README.md`]=`# MoveIt 2\n\nNo serial arm chain with 2+ actuated joints was found in ${pkg}, so no MoveIt config was generated.\n`;return files;}
  const {root}=findRoot(spec),joints=spec.joints.filter(j=>j.type!=='fixed');
  const home=(j:Joint)=>Math.max(j.limit?.lower??0,Math.min(j.limit?.upper??0,0));
  files[`${pkg}/moveit/${pkg}.srdf`]=`<?xml version="1.0"?>
<robot name="${pkg}">
${groups.map(g=>`  <group name="${g.name}">\n${g.base?`    <chain base_link="${g.base}" tip_link="${g.tip}"/>`:g.joints.map(j=>`    <joint name="${j.name}"/>`).join('\n')}\n  </group>\n  <group_state name="home" group="${g.name}">\n${g.joints.map(j=>`    <joint name="${j.name}" value="${home(j)}"/>`).join('\n')}\n  </group_state>`).join('\n')}
  <virtual_joint name="world_joint" type="fixed" parent_frame="world" child_link="${root}"/>
${spec.joints.map(j=>`  <disable_collisions link1="${j.parent}" link2="${j.child}" reason="Adjacent"/>`).join('\n')}
</robot>
`;
  files[`${pkg}/moveit/kinematics.yaml`]=groups.filter(g=>g.base).map(g=>`${g.name}:
  kinematics_solver: kdl_kinematics_plugin/KDLKinematicsPlugin
  kinematics_solver_search_resolution: 0.005
  kinematics_solver_timeout: 0.1
  position_only_ik: ${g.joints.length<6}
`).join('\n');
  files[`${pkg}/moveit/moveit_controllers.yaml`]=`moveit_controller_manager: moveit_simple_controller_manager/MoveItSimpleControllerManager
moveit_simple_controller_manager:
  controller_names: [joint_trajectory_controller]
  joint_trajectory_controller:
    type: FollowJointTrajectory
    action_ns: follow_joint_trajectory
    default: true
    joints:
${joints.map(j=>`      - ${j.name}`).join('\n')}
`;
  const ompl=`planning_plugins: [ompl_interface/OMPLPlanner]
request_adapters:
  - default_planning_request_adapters/ResolveConstraintFrames
  - default_planning_request_adapters/ValidateWorkspaceBounds
  - default_planning_request_adapters/CheckStartStateBounds
  - default_planning_request_adapters/CheckStartStateCollision
response_adapters:
  - default_planning_response_adapters/AddTimeOptimalParameterization
  - default_planning_response_adapters/ValidateSolution
planner_configs:
  RRTConnect:
    type: geometric::RRTConnect
    range: 0.0
${groups.map(g=>`${g.name}:\n  default_planner_config: RRTConnect\n  planner_configs: [RRTConnect]\n  enforce_joint_model_state_space: true`).join('\n')}
`;
  files[`${pkg}/moveit/ompl_planning.yaml`]=ompl;
  files[`${pkg}/config/ompl_planning.yaml`]=ompl;
  files[`${pkg}/launch/move_group.launch.py`]=`# Fixed-root planning with mock hardware, not physical simulation.
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
from moveit_configs_utils import MoveItConfigsBuilder


def generate_launch_description():
    share = get_package_share_directory("${pkg}")
    config = (MoveItConfigsBuilder("${pkg}", package_name="${pkg}")
        .robot_description(file_path="urdf/${pkg}.urdf.xacro")
        .robot_description_semantic(file_path="moveit/${pkg}.srdf")
        .robot_description_kinematics(file_path="moveit/kinematics.yaml")
        .joint_limits(file_path="config/joint_limits.yaml")
        .trajectory_execution(file_path="moveit/moveit_controllers.yaml")
        .planning_pipelines(pipelines=["ompl"])
        .to_moveit_configs())
    return LaunchDescription([
        DeclareLaunchArgument("rviz", default_value="true"),
        Node(package="robot_state_publisher", executable="robot_state_publisher", parameters=[config.robot_description]),
        Node(package="tf2_ros", executable="static_transform_publisher", arguments=["--frame-id", "world", "--child-frame-id", "${root}"]),
        Node(package="controller_manager", executable="ros2_control_node", parameters=[os.path.join(share,"config/controllers.yaml")], output="screen"),
        Node(package="controller_manager", executable="spawner", arguments=["joint_state_broadcaster", "joint_trajectory_controller", "--controller-manager-timeout", "60"]),
        Node(package="moveit_ros_move_group", executable="move_group", parameters=[config.to_dict()], output="screen"),
        Node(package="rviz2", executable="rviz2", arguments=["-d", os.path.join(share,"rviz/${pkg}.rviz")], parameters=[config.to_dict()], condition=IfCondition(LaunchConfiguration("rviz"))),
    ])
`;
  files[`${pkg}/moveit/README.md`]=`# MoveIt 2 — ${pkg}

Groups: ${groups.map(g=>`${g.name} (${g.joints.length} joints)`).join(', ')}.
Armour hinges are separate from arm/leg planning chains. Underactuated chains use
position-only IK; arbitrary six-dimensional hand poses are not achievable.

Build with colcon, source install/setup.bash, then:

\`\`\`bash
ros2 launch ${pkg} move_group.launch.py
# Headless: append rviz:=false
\`\`\`

This launches MoveIt, robot_state_publisher, world TF, ros2_control GenericSystem,
joint-state broadcaster and a partial-goal trajectory controller. GenericSystem is
mock hardware, not MuJoCo and not a motor driver. The root is fixed for planning;
whole-body balance and load feasibility require a dynamics/controller layer.
ROS collision geometry uses the actual STL triangles for MoveIt/FCL, not filled bounding boxes.
Adjacent links are excluded; other collisions remain active. Existing model
intersections can correctly cause planning requests to fail. Joint accelerations
are conservative inferred planning limits, not measured actuator specifications.
`;
  return files;
}
