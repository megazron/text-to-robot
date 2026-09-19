# MoveIt 2 — arm_6dof

Groups: arm (6 joints).
Armour hinges are separate from arm/leg planning chains. Underactuated chains use
position-only IK; arbitrary six-dimensional hand poses are not achievable.

Build with colcon, source install/setup.bash, then:

```bash
ros2 launch arm_6dof move_group.launch.py
# Headless: append rviz:=false
```

This launches MoveIt, robot_state_publisher, world TF, ros2_control GenericSystem,
joint-state broadcaster and a partial-goal trajectory controller. GenericSystem is
mock hardware, not MuJoCo and not a motor driver. The root is fixed for planning;
whole-body balance and load feasibility require a dynamics/controller layer.
ROS collision geometry uses the actual STL triangles for MoveIt/FCL, not filled bounding boxes.
Adjacent links are excluded; other collisions remain active. Existing model
intersections can correctly cause planning requests to fail. Joint accelerations
are conservative inferred planning limits, not measured actuator specifications.
