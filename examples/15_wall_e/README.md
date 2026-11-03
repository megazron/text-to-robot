# wall e

> Build WALL-E: a tracked trash-compactor robot with a telescoping neck, binocular eyes and two gripper arms

![simulation](simulation.gif)

Interpreted as: WALL-E character · camera (head) · camera (head)

**WALL-E style tracked robot: 3.736 kg, 1.24 m/s, pan/tilt/lift head with stereo cameras, two servo arms**

Parts cost **$1872.14** · printed structure 29 parts, 2194 g · checks passed 53/53

## What it can do

| | |
|---|--:|
| mass kg | 3.736 |
| loaded mass kg | 3.736 |
| top speed m s | 1.24 |
| wheel torque nm | 0.07 |
| drive motor | pololu_37d_30to1_64cpr |
| battery | 1 x lipo_3s_2200 |
| average power w | 18.3 |
| runtime h | 1.06 |
| tip angle deg | 13.1 |
| compute | rpi5 |
| slope deg | 10 |
| turn rate rad s | 2.17 |
| turn slip factor | 2.41 |
| cost usd | 1895 |
| cost breakdown | catalog parts $1798, filament 2.52 kg $63, fasteners $18, fabricated/other $15 (power switch, 15 A fuse, wiring) |

## Actuators (sized from this robot's own loads)

| Joint | Actuator | Needs (peak) N·m | Rated / peak N·m | Margin | Speed loaded rad/s |
|---|---|--:|--:|--:|--:|
| neck_shoulder_pitch | dxl_xh540_w270 | 1.729 | 2.97 / 9.9 | 5.73x | 3.76 |
| neck_base_yaw | dxl_xm430_w350 | 0.503 | 1.23 / 4.1 | 8.15x | 4.58 |
| neck_elbow_pitch | dxl_xm430_w350 | 1.157 | 1.23 / 4.1 | 3.54x | 4.58 |
| left_arm_shoulder_pitch | feetech_sts3215_c047 | 0.547 | 0.9807 / 2.942 | 5.38x | 4.4 |
| left_arm_elbow_pitch | feetech_sts3215_c047 | 0.272 | 0.9807 / 2.942 | 10.82x | 4.48 |
| right_arm_shoulder_pitch | feetech_sts3215_c047 | 0.547 | 0.9807 / 2.942 | 5.38x | 4.4 |
| right_arm_elbow_pitch | feetech_sts3215_c047 | 0.272 | 0.9807 / 2.942 | 10.82x | 4.48 |
| left_middle_wheel_joint | pololu_37d_30to1_64cpr | 0.07 | 0.686 / 1.373 | 9.82x | 34.558 |
| right_middle_wheel_joint | pololu_37d_30to1_64cpr | 0.07 | 0.686 / 1.373 | 9.82x | 34.558 |

## Engineering checks

All 53 checks pass (torque, speed, power, stability, print-bed fit). Details in `robot.json` → `metadata.design.checks`.

## Assumptions and limits

- WALL-E's tracks are represented by three 90 mm wheels per side: the middle wheel of each side is driven by a gearmotor, the front and rear are idlers on 625 bearings. A real build wraps a printed or rubber track (or a T5 timing belt) round the three wheels, so traction and drive sizing use the full weight.
- The film's telescoping neck is replaced by a servo-driven pitch neck (the 'lift') with pan and tilt servos above it; the binoculars are two printed eye barrels with a Raspberry Pi Camera Module 3 in each (stereo pair).
- Arms: a shoulder and an elbow servo plus a one-servo gripper hand per side, reusing the arm designer's brackets; they are sized as mounted (pointing forward) for the hand payload.
- The body is five printed PETG panels bolted with corner cleats on the deck; no compactor mechanism.

<!-- SIM -->
## Simulation (MuJoCo, real actuator limits)

**3/3 task tests pass.** Every motor is limited to its datasheet peak torque and its torque-speed line, with the rotor inertia reflected through its gearbox; continuous loads are compared with the rated torque. The animation above is recorded from these tests.

| | Test | Result |
|---|---|---|
| ✅ | drive straight | 3.44 m in 4.02 s, cruise speed 1.212 m/s vs claimed 1.240 m/s, heading drift -0.0 deg, lateral -0.0 cm |
| ✅ | ramp 10deg | from standstill on a 10 deg slope (speed ramped over 4.7 s at 0.5 m/s^2): 5.12 m uphill in 6.7 s, speed 1.196 m/s of 1.240 commanded |
| ✅ | turn in place | yaw rate 4.80 rad/s with 5.18 commanded (no-slip), claimed 2.17 rad/s (needs >= 1.84), centre moved 20.1 cm over 1.9 turn(s) (10.5 cm per turn) |

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
