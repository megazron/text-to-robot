# wall e

> Build WALL-E: a tracked trash-compactor robot with a telescoping neck, binocular eyes and two gripper arms

![simulation](simulation.gif)

Interpreted as: WALL-E character · range (body)

**Arduino WALL-E: TPU tracks on 4 TT motors, pan/tilt binocular head, 2 servo arms, 0.95 kg, $52 of parts**

Parts cost **$67.39** · printed structure 8 parts, 457 g · checks passed 20/20

## What it can do

| | |
|---|--:|
| mass kg | 0.948 |
| top speed m s | 0.59 |
| runtime min | 87 |
| cost usd | 52 |
| height mm | 0 |
| tier | cheapest |
| tier label | Arduino WALL-E |
| turn rate rad s | 1.6 |
| turn slip factor | 2.37 |

## Actuators (sized from this robot's own loads)

| Joint | Actuator | Needs (peak) N·m | Rated / peak N·m | Margin | Speed loaded rad/s |
|---|---|--:|--:|--:|--:|
| neck_pan | hobby_sg90 | 0 | 0.0529 / 0.1765 | 176500x | 10.472 |
| neck_tilt | hobby_sg90 | 0.039 | 0.0529 / 0.1765 | 4.53x | 10.472 |
| left_arm_lift | hobby_sg90 | 0.0027 | 0.0529 / 0.1765 | 65.2x | 10.472 |
| right_arm_lift | hobby_sg90 | 0.0027 | 0.0529 / 0.1765 | 65.2x | 10.472 |

## Engineering checks

All 20 checks pass (torque, speed, power, stability, print-bed fit). Details in `robot.json` → `metadata.design.checks`.

## Assumptions and limits

- Joint limits trimmed to the collision-free range found by exact solid sweeps: left_arm_lift [-1.00, 1.00] -> [-1.00, 0.35]; right_arm_lift [-1.00, 1.00] -> [-0.35, 1.00].
- tracks print in TPU 95A (flexible), everything else in PETG/PLA+; the body prints open side up without supports
- TT motor continuous torque taken as 30 % of the 0.8 kg.cm stall; a turn on the spot is a short transient above that (the tracks slide sideways), so spin in bursts on carpet or rubber floors
- prices are typical single-unit marketplace prices and vary by seller

## Prompt notes

- not applied: camera: the WALL-E character design has no mount for it yet

<!-- SIM -->
## Simulation (MuJoCo, real actuator limits)

**3/3 task tests pass.** Every motor is limited to its datasheet peak torque and its torque-speed line, with the rotor inertia reflected through its gearbox; continuous loads are compared with the rated torque. The animation above is recorded from these tests.

| | Test | Result |
|---|---|---|
| ✅ | drive straight | 2.33 m in 4.71 s, cruise speed 0.583 m/s vs claimed 0.590 m/s, heading drift -0.0 deg, lateral -0.0 cm |
| ✅ | ramp 10deg | from standstill on a 10 deg slope (speed ramped over 2.2 s at 0.5 m/s^2): 1.65 m uphill in 4.2 s, speed 0.569 m/s of 0.590 commanded |
| ✅ | turn in place | yaw rate 1.81 rad/s with 3.78 commanded (no-slip), claimed 1.60 rad/s (needs >= 1.36), centre moved 1.4 cm over 1.0 turn(s) (1.4 cm per turn) |

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
