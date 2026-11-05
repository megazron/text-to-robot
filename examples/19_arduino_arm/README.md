# arduino arm

> A cheap Arduino robot arm with a claw

![simulation](simulation.gif)

Interpreted as: Arduino desk arm (3 DOF + claw) · no gripper

**Arduino desk arm: 3 DOF + claw, 280 mm reach, 20 g payload, 0.27 kg, $39 of parts**

Parts cost **$43.61** · printed structure 5 parts, 145 g · checks passed 12/12

## What it can do

| | |
|---|--:|
| reach m | 0.28 |
| payload kg | 0.02 |
| mass kg | 0.273 |
| cost usd | 38.5 |
| dof | 3 |
| gripper | one-servo claw |
| servos | TowerPro SG90 micro servo / TowerPro MG996R standard servo |

## Actuators (sized from this robot's own loads)

| Joint | Actuator | Needs (peak) N·m | Rated / peak N·m | Margin | Speed loaded rad/s |
|---|---|--:|--:|--:|--:|
| shoulder | hobby_mg996r | 0.3205 | 0.3236 / 1.0787 | 3.37x | 7.48 |
| elbow | hobby_mg996r | 0.0945 | 0.3236 / 1.0787 | 11.42x | 7.48 |

## Engineering checks

All 12 checks pass (torque, speed, power, stability, print-bed fit). Details in `robot.json` → `metadata.design.checks`.

## Assumptions and limits

- Every joint's limits are inside its collision-free range (exact solid sweeps).
- each joint runs on its servo's own output bearing (no extra bearings), as in MeArm-class kits: links are kept short so the servo holds them continuously
- prices are typical single-unit marketplace prices and vary by seller

## Prompt notes

- conflict: "arm" asks for a arm, but a prompt builds one robot; built the Arduino desk arm (3 DOF + claw)
- not applied: hobby servos / Arduino: only arms are designed for hobby servos so far; the Arduino desk arm (3 DOF + claw) uses its standard actuators

<!-- SIM -->
## Simulation (MuJoCo, real actuator limits)

**3/3 task tests pass.** Every motor is limited to its datasheet peak torque and its torque-speed line, with the rotor inertia reflected through its gearbox; continuous loads are compared with the rated torque. The animation above is recorded from these tests.

| | Test | Result |
|---|---|---|
| ✅ | payload hold | stretched_plus: holds 0.02 kg with the arm stretched out for 3 s; worst continuous utilisation 0.76x rated at shoulder | stretched_minus: holds 0.02 kg with the arm stretched out for 3 s; worst continuous utilisation 0.76x rated at shoulder |
| ✅ | reach | TCP 0.293 m from the shoulder axis with the payload, claimed 0.280 m (tolerance 6 mm) |
| ✅ | speed | 1.47 s move at 80 % rated speed tracks within 0.1 rad; most saturated yaw (0 % of the move) |

Not tested: grip: the arm has no gripper joint

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
