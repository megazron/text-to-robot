# iron man mark 43

> Build me a movie-accurate wearable Iron Man Mark 43 suit from Age of Ultron with all the small polygon armour plates that open and close, repulsors, a HUD and an IMU. Budget $60000

![simulation](simulation.gif)

Interpreted as: Iron Man Mark 43 wearable suit · budget $60000

**Iron Man Mark 43 (full wearable suit): 327 printed pieces, 7.2 kg filament, motorised faceplate, $289 incl. filament**

Parts cost **$299.95** (budget $60000: within) · printed structure 327 parts, 6631 g · checks passed 339/339

## What it can do

| | |
|---|--:|
| tier | suit |
| tier label | full wearable suit |
| wearer height m | 1.75 |
| printed pieces | 327 |
| armour mass kg | 7.68 |
| filament kg | 7.16 |
| cost usd | 289.26 |
| mass kg | 7.85 |

## Actuators (sized from this robot's own loads)

| Joint | Actuator | Needs (peak) N·m | Rated / peak N·m | Margin | Speed loaded rad/s |
|---|---|--:|--:|--:|--:|
| faceplate | hobby_mg90s | 0.1533 | 0.1294 / 0.4314 | 2.81x | 13.09 |

## Engineering checks

All 339 checks pass (torque, speed, power, stability, print-bed fit). Details in `robot.json` → `metadata.design.checks`.

## Assumptions and limits

- armour shape from: suit: designed directly by scripts/forge_mark43.py from reference photos of the movie suit; 3 mm walls, 2 mm faceplate, 15 % gyroid infill (shells are mostly walls)
- filament at $22/kg, 8 % waste
- the suit is worn armour over a black undersuit: the wearer moves every joint; nothing powers the limbs (hobby servos cannot move a person)
- the wearer is an average adult male body at 1.75 m and the pieces scale evenly with height; check against your own measurements before printing
- gaps at the groin, armpits and elbows are cut on purpose so the joints move; the undersuit shows through them, as on real builds

## Prompt notes

- not applied: imu: the Iron Man Mark 43 wearable suit design has no mount for it yet

<!-- SIM -->
## Simulation (MuJoCo, real actuator limits)

**1/1 task tests pass.** Every motor is limited to its datasheet peak torque and its torque-speed line, with the rotor inertia reflected through its gearbox; continuous loads are compared with the rated torque. The animation above is recorded from these tests.

| | Test | Result |
|---|---|---|
| ✅ | open and hold | opens faceplate to -0.95 rad (target -0.95) and holds 1.5 s |

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
