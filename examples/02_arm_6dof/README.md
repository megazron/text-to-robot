# arm 6dof

> Create a 6 DOF robotic arm with a parallel gripper

![simulation](simulation.gif)

Interpreted as: 6-DOF serial arm · parallel gripper

**6-DOF arm, 450 mm reach, 0.1 kg payload, Feetech STS serial-bus servos (12 V)**

Parts cost **$217.18** · printed structure 8 parts, 231 g · checks passed 22/22

## What it can do

| | |
|---|--:|
| reach m | 0.45 |
| payload kg | 0.1 |
| mass kg | 0.636 |
| actuators | Feetech STS serial-bus servos (12 V) |
| max joint speed rad s | 3.4 |
| grip force n | 14 |
| holding current a | 2.36 |
| upper arm m | 0.108 |
| forearm m | 0.152 |

## Actuators (sized from this robot's own loads)

| Joint | Actuator | Needs (peak) N·m | Rated / peak N·m | Margin | Speed loaded rad/s |
|---|---|--:|--:|--:|--:|
| base_yaw | feetech_sts3215_c047 | 0 | 0.9807 / 2.942 | 99x | 4.48 |
| shoulder_pitch | feetech_sts3250 | 1.858 | 1.5691 / 4.9033 | 2.64x | 5.02 |
| elbow_pitch | feetech_sts3215_c047 | 1.176 | 0.9807 / 2.942 | 2.5x | 3.4 |
| forearm_roll | feetech_sts3215_c047 | 0.002 | 0.9807 / 2.942 | 99x | 4.48 |
| wrist_pitch | feetech_sts3215_c047 | 0.435 | 0.9807 / 2.942 | 6.76x | 4.48 |
| wrist_roll | feetech_sts3215_c047 | 0.001 | 0.9807 / 2.942 | 99x | 4.48 |

## Engineering checks

All 22 checks pass (torque, speed, power, stability, print-bed fit, grip). Details in `robot.json` → `metadata.design.checks`.

## Assumptions and limits

- Arm clamps or bolts to the bench through the four M5 holes in the base; it is not free-standing at full reach.
- Links are cantilevered from one side of each horn (as on SO-101 / Koch arms); add an idler bearing on the far side for heavy use.
- Torques are exact static gravity loads of this geometry: the worst pose (stretched out with the payload) must be held within each actuator's rated continuous torque, peaks get +30 %, and each joint must still reach >= 1 rad/s loaded on its torque-speed line.

<!-- SIM -->
## Simulation (MuJoCo, real actuator limits)

**4/4 task tests pass.** Every motor is limited to its datasheet peak torque and its torque-speed line, with the rotor inertia reflected through its gearbox; continuous loads are compared with the rated torque. The animation above is recorded from these tests.

| | Test | Result |
|---|---|---|
| ✅ | payload hold | stretched_plus: holds 0.1 kg with the arm stretched out for 3 s; worst continuous utilisation 0.92x rated at elbow_pitch | stretched_minus: holds 0.1 kg with the arm stretched out for 3 s; worst continuous utilisation 0.92x rated at elbow_pitch |
| ✅ | reach | TCP 0.450 m from the shoulder axis with the payload, claimed 0.450 m (tolerance 9 mm) |
| ✅ | speed | 1.47 s move at 80 % rated speed tracks within 0.1 rad; most saturated wrist_roll (0 % of the move) |
| ✅ | grip | holds 0.1 kg against its weight with friction 0.5: slip 0.1 mm in 3 s, clamp force 27.1 N (needs >= 1.0 N), gripper limited to its rated (continuous) torque |

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
