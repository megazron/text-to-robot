# wall e

> Build WALL-E: a tracked trash-compactor robot with a telescoping neck, binocular eyes and two gripper arms

![simulation](simulation.gif)

Interpreted as: WALL-E character · camera (head) · camera (head)

**WALL-E style tracked robot: 3.744 kg, 0.57 m/s, pan/tilt/lift head with stereo cameras, two servo arms**

Parts cost **$780.88** · printed structure 29 parts, 2347 g · checks passed 53/53

## What it can do

| | |
|---|--:|
| mass kg | 3.744 |
| loaded mass kg | 3.744 |
| top speed m s | 0.57 |
| wheel torque nm | 0.07 |
| drive motor | pololu_37d_70to1_64cpr |
| battery | 1 x lipo_3s_2200 |
| average power w | 18.2 |
| runtime h | 1.07 |
| tip angle deg | 15.6 |
| compute | rpi5 |
| slope deg | 10 |
| turn rate rad s | 0.99 |
| turn slip factor | 2.41 |
| cost usd | 804 |
| cost breakdown | catalog parts $703, filament 2.70 kg $67, fasteners $18, fabricated/other $15 (power switch, 15 A fuse, wiring) |

## Actuators (sized from this robot's own loads)

| Joint | Actuator | Needs (peak) N·m | Rated / peak N·m | Margin | Speed loaded rad/s |
|---|---|--:|--:|--:|--:|
| neck_shoulder_pitch | feetech_sts3250 | 1.036 | 1.5691 / 4.9033 | 4.73x | 6.16 |
| neck_base_yaw | feetech_sts3215_c047 | 0.298 | 0.9807 / 2.942 | 9.87x | 4.48 |
| neck_elbow_pitch | feetech_sts3215_c047 | 0.685 | 0.9807 / 2.942 | 4.29x | 4.48 |
| left_arm_shoulder_pitch | feetech_sts3215_c047 | 0.638 | 0.9807 / 2.942 | 4.61x | 4.26 |
| left_arm_elbow_pitch | feetech_sts3215_c047 | 0.307 | 0.9807 / 2.942 | 9.59x | 4.48 |
| right_arm_shoulder_pitch | feetech_sts3215_c047 | 0.638 | 0.9807 / 2.942 | 4.61x | 4.26 |
| right_arm_elbow_pitch | feetech_sts3215_c047 | 0.307 | 0.9807 / 2.942 | 9.59x | 4.48 |
| left_middle_wheel_joint | pololu_37d_70to1_64cpr | 0.07 | 0.981 / 2.648 | 14.01x | 15.708 |
| right_middle_wheel_joint | pololu_37d_70to1_64cpr | 0.07 | 0.981 / 2.648 | 14.01x | 15.708 |

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
| ✅ | drive straight | 2.30 m in 4.68 s, cruise speed 0.557 m/s vs claimed 0.570 m/s, heading drift -0.0 deg, lateral -0.0 cm |
| ✅ | ramp 10deg | from standstill on a 10 deg slope (speed ramped over 2.1 s at 0.5 m/s^2): 1.69 m uphill in 4.1 s, speed 0.554 m/s of 0.570 commanded |
| ✅ | turn in place | yaw rate 1.98 rad/s with 2.38 commanded (no-slip), claimed 0.99 rad/s (needs >= 0.84), centre moved 4.6 cm over 1.0 turn(s) (4.6 cm per turn) |

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
