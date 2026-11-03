# arm 2dof

> Create a 2 DOF robotic arm

![simulation](simulation.gif)

Interpreted as: 2-DOF serial arm · parallel gripper

**2-DOF arm, 350 mm reach, 0.1 kg payload, Feetech STS serial-bus servos (12 V)**

Parts cost **$130.09** · printed structure 4 parts, 366 g · checks passed 10/10

## What it can do

| | |
|---|--:|
| reach m | 0.35 |
| payload kg | 0.1 |
| mass kg | 0.551 |
| actuators | Feetech STS serial-bus servos (12 V) |
| max joint speed rad s | 4.42 |
| grip force n | 14 |
| holding current a | 1.26 |
| upper arm m | 0.144 |
| forearm m | 0.205 |

## Actuators (sized from this robot's own loads)

| Joint | Actuator | Needs (peak) N·m | Rated / peak N·m | Margin | Speed loaded rad/s |
|---|---|--:|--:|--:|--:|
| shoulder_pitch | feetech_sts3250 | 1.333 | 1.5691 / 4.9033 | 3.68x | 5.94 |
| elbow_pitch | feetech_sts3215_c047 | 0.543 | 0.9807 / 2.942 | 5.42x | 4.42 |

## Engineering checks

All 10 checks pass (torque, speed, power, stability, print-bed fit, grip). Details in `robot.json` → `metadata.design.checks`.

## Assumptions and limits

- Arm clamps or bolts to the bench through the four M5 holes in the base; it is not free-standing at full reach.
- Every pitch joint is a clevis: one cheek bolts to the servo horn, the other turns on a 625ZZ bearing on an M5 bolt screwed into a heat-set insert in a boss on the back of the servo's cradle, so the servo's own bearing carries no bending moment. An M5 washer sits between the boss and the bearing's inner race.
- Print the links in PETG or PLA+ with 4 perimeters and 30 % gyroid infill, cradle opening up; press the 625ZZ bearings into their seats (16.15 mm) and set the M5 inserts with a soldering iron.
- Torques are exact static gravity loads of this geometry: the worst pose (stretched out with the payload) must be held within each actuator's rated continuous torque, peaks get +30 %, and each joint must still reach >= 1 rad/s loaded on its torque-speed line.

<!-- SIM -->
## Simulation (MuJoCo, real actuator limits)

**4/4 task tests pass.** Every motor is limited to its datasheet peak torque and its torque-speed line, with the rotor inertia reflected through its gearbox; continuous loads are compared with the rated torque. The animation above is recorded from these tests.

| | Test | Result |
|---|---|---|
| ✅ | payload hold | stretched_plus: holds 0.1 kg with the arm stretched out for 3 s; worst continuous utilisation 0.65x rated at shoulder_pitch | stretched_minus: holds 0.1 kg with the arm stretched out for 3 s; worst continuous utilisation 0.65x rated at shoulder_pitch |
| ✅ | reach | TCP 0.350 m from the shoulder axis with the payload, claimed 0.350 m (tolerance 7 mm) |
| ✅ | speed | 1.24 s move at 80 % rated speed tracks within 0.1 rad; most saturated shoulder_pitch (0 % of the move) |
| ✅ | grip | holds 0.1 kg against its weight with friction 0.5: slip 0.1 mm in 3 s, clamp force 27.5 N (needs >= 1.0 N), gripper limited to its rated (continuous) torque |

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
