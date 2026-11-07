# four wheel

> Create a four-wheel robot

![studio render](studio.gif)

Interpreted as: four-wheel skid-steer base · lidar (upper_deck) · camera (base_link) · imu (upper_deck)

**Four-wheel skid-steer base: pololu_37d_30to1_64cpr gearmotors, 2.396 kg, 1.24 m/s, 1.47 h on 1 x lipo_3s_2200, rpi5**

Parts cost **$695.1** · printed structure 21 parts, 539 g · checks passed 61/61

## What it can do

| | |
|---|--:|
| mass kg | 2.396 |
| loaded mass kg | 4.396 |
| top speed m s | 1.24 |
| wheel torque nm | 0.123 |
| drive motor | pololu_37d_30to1_64cpr |
| battery | 1 x lipo_3s_2200 |
| average power w | 13.3 |
| runtime h | 1.47 |
| tip angle deg | 39.3 |
| compute | rpi5 |
| slope deg | 10 |
| turn rate rad s | 2.44 |
| turn slip factor | 2.14 |
| cargo kg | 2 |
| cost usd | 741 |
| cost breakdown | catalog parts $651, filament 0.62 kg $15, fasteners $11, fabricated/other $44 (300 x 200 x 3 mm 5052 aluminium deck, laser cut (~$44); power switch, 15 A fuse, wiring) |

## Actuators (sized from this robot's own loads)

| Joint | Actuator | Needs (peak) N·m | Rated / peak N·m | Margin | Speed loaded rad/s |
|---|---|--:|--:|--:|--:|
| front_left_wheel_joint | pololu_37d_30to1_64cpr | 0.123 | 0.686 / 1.373 | 5.56x | 34.558 |
| front_right_wheel_joint | pololu_37d_30to1_64cpr | 0.123 | 0.686 / 1.373 | 5.56x | 34.558 |
| rear_left_wheel_joint | pololu_37d_30to1_64cpr | 0.123 | 0.686 / 1.373 | 5.56x | 34.558 |
| rear_right_wheel_joint | pololu_37d_30to1_64cpr | 0.123 | 0.686 / 1.373 | 5.56x | 34.558 |

## Engineering checks

All 61 checks pass (torque, speed, power, stability, print-bed fit). Details in `robot.json` → `metadata.design.checks`.

## Assumptions and limits

- Drive sized for the robot plus 2 kg cargo on a 10 deg slope accelerating at 0.5 m/s^2, rolling resistance 0.03; motors compared at their continuous (not stall) rating.
- All motors and servos are 12 V parts run straight from a 3S LiPo (9.9-12.6 V) through the main fuse and switch; see WIRING.md.
- Printed parts: PETG; brackets bolt to the deck with M3 screws and nuts; the motor face screws are the gearmotor's own six M3 holes.
- Skid steering: both wheels on a side get the same command; turning on the spot scrubs the tyres sideways (checked as a short-transient torque).
- The deck is larger than a 250 x 210 mm bed, so it is a laser-cut 3 mm aluminium plate (send-cut-send style service) rather than a print.

<!-- SIM -->
## Simulation (MuJoCo, real actuator limits)

**3/3 task tests pass.** Every motor is limited to its datasheet peak torque and its torque-speed line, with the rotor inertia reflected through its gearbox; continuous loads are compared with the rated torque. The animation below is recorded from these tests.

![simulation](simulation.gif)

| | Test | Result |
|---|---|---|
| ✅ | drive straight | 3.44 m in 4.01 s, cruise speed 1.213 m/s vs claimed 1.240 m/s, heading drift -0.0 deg, lateral -0.0 cm |
| ✅ | ramp 10deg | from standstill on a 10 deg slope (speed ramped over 4.7 s at 0.5 m/s^2): 5.20 m uphill in 6.7 s, speed 1.207 m/s of 1.240 commanded |
| ✅ | turn in place | mean yaw rate 2.21 rad/s with 4.85 commanded (no-slip), claimed 2.44 rad/s (needs >= 2.07), centre moved 0.6 cm over 1.0 turn(s) (0.6 cm per turn) |

_PASS means the modelled actuators (datasheet peak torque as a hard limit, a linear torque-speed line to no-load speed, reflected rotor inertia, URDF damping/friction) can produce the torques and speeds the task needs in this geometry and mass distribution, and that mean torque over the hold stays within the continuous (rated) torque. Joint control uses an ideal model-based feedforward (computed torque) through the force-limited servo for fixed-base robots and plain position servos for floating robots; a pass therefore proves torque/speed capacity, not that a given controller achieves it. Untested: thermal limits over long duty cycles (only the mean-vs-rated proxy), gearbox backlash and compliance, link and joint flexibility, encoder resolution, supply voltage sag and current limits, bus latency, controller tuning, and contact/friction values (nominal friction only)._
<!-- /SIM -->

## Files

| File | What |
|---|---|
| `robot.urdf`, `meshes/` | URDF with real component and printed-part meshes, datasheet effort/velocity limits |
| `BOM.md`, `bom.json` | every part to buy, with supplier links and prices |
| `WIRING.md`, `wiring.svg` | power budget per rail, pin-to-pin table, cut list, slack at each joint, wiring diagram |
| `robot.cad.zip` | build package: printable STLs, print list, bought-part models, assembly order |
| `robot.ros2.zip` | ROS 2 description package (ros2_control, MoveIt config, Gazebo launch) |
| `robot.training.zip` | MuJoCo / RL training scaffold |
| `simulation_report.json`, `simulation.gif` | MuJoCo task tests under the real actuator limits |
| `studio.gif` | Cycles render of a physics motion loop: every link where MuJoCo put it, the harness on its real routes |
