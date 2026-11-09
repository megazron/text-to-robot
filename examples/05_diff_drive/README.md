# diff drive

> Create a differential drive mobile robot

![studio render](studio.gif)

Interpreted as: differential-drive base · lidar (base_link) · imu (base_link)

**Differential-drive base: pololu_37d_30to1_64cpr gearmotors, 1.487 kg, 1.24 m/s, 1.8 h on 1 x lipo_3s_2200, rpi5**

Parts cost **$512.23** · printed structure 15 parts, 565 g · checks passed 49/49

## What it can do

| | |
|---|--:|
| mass kg | 1.487 |
| loaded mass kg | 2.487 |
| top speed m s | 1.24 |
| wheel torque nm | 0.14 |
| drive motor | pololu_37d_30to1_64cpr |
| battery | 1 x lipo_3s_2200 |
| average power w | 10.8 |
| runtime h | 1.8 |
| tip angle deg | 37.7 |
| compute | rpi5 |
| slope deg | 10 |
| turn rate rad s | 5.22 |
| turn slip factor | 1 |
| cargo kg | 1 |
| cost usd | 514 |
| cost breakdown | catalog parts $479, filament 0.65 kg $16, fasteners $8, fabricated/other $0 (power switch, 15 A fuse, wiring) |

## Actuators (sized from this robot's own loads)

| Joint | Actuator | Needs (peak) N·m | Rated / peak N·m | Margin | Speed loaded rad/s |
|---|---|--:|--:|--:|--:|
| left_wheel_joint | pololu_37d_30to1_64cpr | 0.14 | 0.686 / 1.373 | 4.92x | 34.558 |
| right_wheel_joint | pololu_37d_30to1_64cpr | 0.14 | 0.686 / 1.373 | 4.92x | 34.558 |

## Engineering checks

All 49 checks pass (torque, speed, power, stability, print-bed fit). Details in `robot.json` → `metadata.design.checks`.

## Assumptions and limits

- Drive sized for the robot plus 1 kg cargo on a 10 deg slope accelerating at 0.5 m/s^2, rolling resistance 0.03; motors compared at their continuous (not stall) rating.
- All motors and servos are 12 V parts run straight from a 3S LiPo (9.9-12.6 V) through the main fuse and switch; see WIRING.md.
- Printed parts: PETG; brackets bolt to the deck with M3 screws and nuts; the motor face screws are the gearmotor's own six M3 holes.
- Two ball casters (front and rear) keep the deck level; on rough floors fit only one or add the Pololu spacer set so the drive wheels never lift.

<!-- SIM -->
## Simulation (MuJoCo, real actuator limits)

**3/3 task tests pass.** Every motor is limited to its datasheet peak torque and its torque-speed line, with the rotor inertia reflected through its gearbox; continuous loads are compared with the rated torque. The animation below is recorded from these tests.

![simulation](simulation.gif)

| | Test | Result |
|---|---|---|
| ✅ | drive straight | 3.44 m in 4.01 s, cruise speed 1.212 m/s vs claimed 1.240 m/s, heading drift 0.1 deg, lateral 0.3 cm |
| ✅ | ramp 10deg | from standstill on a 10 deg slope (speed ramped over 4.7 s at 0.5 m/s^2): 5.19 m uphill in 6.7 s, speed 1.205 m/s of 1.240 commanded |
| ✅ | turn in place | mean yaw rate 5.22 rad/s with 5.06 commanded (no-slip), claimed 5.22 rad/s (needs >= 4.44), centre moved 0.1 cm over 2.1 turn(s) (0.1 cm per turn) |

_PASS means the modelled actuators (datasheet peak torque as a hard limit, a linear torque-speed line to no-load speed, reflected rotor inertia, URDF damping/friction) can produce the torques and speeds the task needs in this geometry and mass distribution, and that mean torque over the hold stays within the continuous (rated) torque. Joint control uses an ideal model-based feedforward (computed torque) through the force-limited servo for fixed-base robots and plain position servos for floating robots; a pass therefore proves torque/speed capacity, not that a given controller achieves it. Untested: thermal limits over long duty cycles (only the mean-vs-rated proxy), gearbox backlash and compliance, link and joint flexibility, encoder resolution, supply voltage sag and current limits, bus latency, controller tuning, and contact/friction values (nominal friction only)._
<!-- /SIM -->

## Files

| File | What |
|---|---|
| `robot.urdf`, `meshes/` | URDF with real component and printed-part meshes, datasheet effort/velocity limits |
| `BOM.md`, `bom.json` | every part to buy, with supplier links and prices |
| `WIRING.md`, `wiring.svg` | power budget per rail, battery runtime, regulator heat, logic levels, pin-to-pin table, cut list, slack at each joint, cable diagram |
| `schematic.svg`, `schematic.pdf`, `breadboard.svg` | schematic with reference designators, power symbols and net labels; picture view with every wire in its colour |
| `robot.cad.zip` | build package: printable STLs, print list, bought-part models, assembly order |
| `robot.ros2.zip` | ROS 2 description package (ros2_control, MoveIt config, Gazebo launch) |
| `robot.training.zip` | MuJoCo / RL training scaffold |
| `simulation_report.json`, `simulation.gif` | MuJoCo task tests under the real actuator limits |
| `studio.gif` | Cycles render of a physics motion loop: every link where MuJoCo put it, the harness on its real routes |
