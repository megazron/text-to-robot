# battle mech

> Create a humanoid battle mech with two 7 DOF arms, a head camera and an IMU

![simulation](simulation.gif)

Interpreted as: humanoid battle mech · camera (torso) · imu (torso)

<!-- SIM -->
## Simulation (MuJoCo, real actuator limits)

**3/3 task tests pass.** Every motor is limited to its datasheet peak torque and its torque-speed line, with the rotor inertia reflected through its gearbox; continuous loads are compared with the rated torque. The animation above is recorded from these tests.

| | Test | Result |
|---|---|---|
| ➖ | stand free | informational (no balance controller; a biped is not statically stable): base z 0.005 -> -0.000 m (creep after settling 0.0 mm), upright 1.000; no continuous ratings known; worst leg joint at 0.00x peak |
| ✅ | stand rail | on a vertical guide rail (balance removed, full weight on the legs): base z 0.005 -> -0.000 m (creep after settling 0.0 mm), upright 1.000; no continuous ratings known; worst leg joint at 0.00x peak |
| ✅ | single leg rail | one leg (left_hip_yaw chain) carrying the full body weight on the rail, the other legs out of contact: base z 0.005 -> -0.000 m (creep after settling 0.0 mm), upright 1.000; no continuous ratings known; worst leg joint at 0.00x peak |
| ✅ | squat rail | on the rail: commanded body drop 98 mm (20 % of 491 mm leg), achieved 101 mm, back up to 101 mm above the low point, upright 1.000 |

_PASS means the modelled actuators (datasheet peak torque as a hard limit, a linear torque-speed line to no-load speed, reflected rotor inertia, URDF damping/friction) can produce the torques and speeds the task needs in this geometry and mass distribution, and that mean torque over the hold stays within the continuous (rated) torque. Joint control uses an ideal model-based feedforward (computed torque) through the force-limited servo for fixed-base robots and plain position servos for floating robots; a pass therefore proves torque/speed capacity, not that a given controller achieves it. Untested: thermal limits over long duty cycles (only the mean-vs-rated proxy), gearbox backlash and compliance, link and joint flexibility, encoder resolution, supply voltage sag and current limits, bus latency, controller tuning, and contact/friction values (nominal friction only)._
<!-- /SIM -->

## Files

| File | What |
|---|---|
| `robot.urdf`, `meshes/` | URDF with real component and printed-part meshes, datasheet effort/velocity limits |
| `BOM.md`, `bom.json` | every part to buy, with supplier links and prices |
| `robot.cad.zip` | build package: printable STLs, print list, bought-part models, assembly order |
| `robot.ros2.zip` | ROS 2 description package (ros2_control, MoveIt config, Gazebo launch) |
| `robot.training.zip` | MuJoCo / RL training scaffold |
| `simulation_report.json` | MuJoCo task tests under the real actuator limits |
