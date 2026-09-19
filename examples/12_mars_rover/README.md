# rover_arm

Prompt: Design a Mars rover with four wheels and a 6 DOF sampling arm, RGB-D camera, budget $4000


![Current MuJoCo simulation](simulation.gif)

This GIF runs gravity, pose holding and self-collision on the shipped URDF. It is
not a learned policy or proof of hardware accuracy. The model's failures remain visible.

## Download and inspect

- [ROS 2 package](robot.ros2.zip), [training package](robot.training.zip), [URDF](robot.urdf), [robot JSON](robot.json), [BOM](BOM.md).
- [Simulation report](simulation_report.json): **5/6** checks;
  **0** initial penetration contacts.
- Failed checks: actuator_sweep.

## MoveIt / ROS 2

[Browse the generated MoveIt configuration](moveit/) (SRDF, KDL, OMPL, controllers).
Unzip the ROS package into a workspace's `src/` directory, then:

```bash
source /opt/ros/jazzy/setup.bash
rosdep install --from-paths src --ignore-src -r -y
colcon build
source install/setup.bash
ros2 launch rover_arm move_group.launch.py
```

The launch uses mock hardware. Planning requires a collision-free start state.
The fixed-root planner is not a walking controller or a simulation bridge.

## Reproduce

From the repository root:

```bash
python scripts/audit_examples.py
python scripts/render_example_gifs.py
```

These are procedural concept models. Masses, motors and contacts are approximate;
manufacturing interfaces and measured dynamics remain unverified.
