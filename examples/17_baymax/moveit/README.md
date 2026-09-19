# MoveIt 2 — baymax

Groups: left_arm (4 joints), right_arm (4 joints), left_leg (6 joints), right_leg (6 joints).
Armour hinges are separate from arm/leg planning chains. Underactuated chains use
position-only IK; arbitrary six-dimensional hand poses are not achievable.

Build with colcon, source install/setup.bash, then:

```bash
ros2 launch baymax move_group.launch.py
# Headless: append rviz:=false
```

This launches MoveIt, robot_state_publisher, world TF, ros2_control GenericSystem,
joint-state broadcaster and a partial-goal trajectory controller. GenericSystem is
mock hardware, not MuJoCo and not a motor driver. The root is fixed for planning;
whole-body balance and load feasibility require a dynamics/controller layer.
Sliding finger joints start 10 mm above their closed limit (clamped to travel)
to avoid pad-on-pad contact during arm planning. Contact checks remain enabled
between opposing fingers.
ROS collision geometry uses the actual STL triangles for MoveIt/FCL, not filled bounding boxes.
Parts within one fixed subassembly and across one articulated joint are excluded,
matching rigid-body adjacency used in physics. Non-adjacent rigid bodies remain
checked. This exclusion is not an assembly-interference or bearing-fit validation;
independent mesh/fit audits are still required. Other intersections can correctly
cause planning requests to fail. Joint accelerations
are conservative inferred planning limits, not measured actuator specifications.
