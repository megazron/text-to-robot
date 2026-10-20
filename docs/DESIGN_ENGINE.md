# Design engine

Robots are designed **parts first**: every joint is a real, purchasable actuator with its
datasheet dimensions, mass, torque, speed and price; every structural part is a printed
part generated around those components; actuators are chosen from the loads of the robot
as built. Nothing is a placeholder box with a guessed motor.

## Packages

| package | role |
| --- | --- |
| `@ttr/parts` | catalog of real components (`data/catalog.json`) and their CAD meshes (`data/meshes.json`), exported from `python/ttr_build/components` by `scripts/export_parts.py` (needs build123d in `.venv`). Units: mm, g. `rating(key)` gives SI torque/speed. `caseHoles`, `outputHoles`, `hornRadiusMm`, `bboxM`. |
| `@ttr/solid` | manifold-3d CSG kernel. Printed parts are serializable **programs** (`Op[]`): `horn` (plate bolted to an actuator output at the origin, +z), `cradle` (holds an actuator by its case screws, with windows), `beam`, `rod`, `box`, `hull`, `keepout`, `hole`, `cutbox`, `lighten`, `at` (transform a sub-program). All in mm. `printCheck` = watertight + fits a 250x210x220 bed. Frames: `frame(origin, z, xHint)`, `mul`, `invert`, `apply`. |
| `@ttr/design` | `Assembly` (spec + engineering record), `kin` (FK, exact gravity torques), `sizing` (actuator ladders), `families/*` designers. |
| `@ttr/mesh` | registers mesh parts `component` (`{key}`) and `printed` (`{program}`) so every exporter rebuilds them. |

## Component frames (from `python/ttr_build/components`)

* Actuators: output axis **+z through the origin**, output (horn/hub) face at z = 0, body towards -z.
  Feetech STS / Dynamixel X: case length along -x (output end at +x). CubeMars AK: round, hub at z = 0.
* Shaft motors (NEMA17, Pololu 37D, N20): mounting face at z = 0, shaft along +z.
* Wheels: axis +z, motor-side hub face at z = 0, wheel towards +z.

## Writing a designer

```ts
const A = new Assembly(name, "quadruped", prompt);
A.printedLink("base_link", { name: "base_link", ops }, { role: "base" });   // printed body, mass from volume
A.mount("base_link", key, T, "hip_actuator");                                // bought part, fixed, adds to BOM
A.revolute("hip", "base_link", "thigh", T, key, lower, upper);               // effort/velocity from datasheet
A.continuous("wheel_l", "base_link", "wheel_l_link", T, motorKey);           // drive; null motor = passive
A.buy(key, qty, use); A.fastener("M3 x 10", 8); A.check(name, pass, detail);
return A.finish(summary);                                                    // record -> spec.metadata.design
```

Rules every designer follows:

1. **Size from loads of the built robot.** Build, compute loads (`worstTorques` for joints; force/torque
   for wheels), pick the smallest part in the ladder that passes, rebuild, repeat until stable.
   `sizing.evaluate(key, staticNm)` applies the dynamic factor (1.3) against peak and the duty
   factor (0.5) against rated torque.
2. **Record the engineering**: `A.design.joints` (required vs rated/peak, margin), `A.check(...)` for every
   claim (torque, battery runtime, speed, slope, grip, bed fit), `A.design.performance`, `A.design.assumptions`.
   A failing check is reported honestly, never hidden.
3. **No overlaps**: printed parts use `cradle` + `keepout` so they never intersect the components they hold;
   moving links stay outside the swept volume of their neighbours (see `families/arm.ts` side alternation).
4. Joint limits come from geometry (clearance), effort/velocity from the datasheet (`Assembly.revolute`).
5. Everything printable must pass `printCheck` (the Assembly records it automatically).

## Checking a design

```
node scripts/stage_ros2.ts robot.json /tmp/stage     # prints <pkg>/robot.urdf (meshes beside it)
MUJOCO_GL=osmesa .venv/bin/python -B scripts/render_stills.py <urdf> out.png [--floating] [joint=rad ...]
cd python && ../.venv/bin/python -B -m ttr_mujoco test <urdf> [--floating]
cd python && ../.venv/bin/python -B -m ttr_mujoco task <urdf> --spec robot.json [--json report.json]
```

`test` only proves the model compiles and stays stable. `task` (`python/ttr_mujoco/tasks.py`) checks the
**claims** of `metadata.design` under the real actuator limits: motors force-limited to the datasheet peak
and, at speed, to the linear torque-speed line (peak at standstill, zero at no-load speed); reflected rotor
inertia as joint armature (`python/ttr_mujoco/actuators.py`, rotor inertia estimated per actuator family x
gear ratio squared); utilisation from the actual actuator forces against `peak_nm` and `rated_nm`.

| family | tests | pass when |
| --- | --- | --- |
| arm, scara | payload hold (payload at `design.tcp`, shoulder to +-90 deg, hold 3 s), speed (point-to-point at 80 % of rated joint speed with the payload), reach | tracking within 0.02 rad while holding / 0.1 rad while moving, no torque saturation in the hold, mean hold torque <= rated; reach >= claimed - max(5 mm, 2 %) |
| gripper (and arms with one) | close on a box of the payload mass (friction 0.5) with the gripper limited to its rated torque, then let its weight pull it out of the fingers for 3 s | slip <= 5 mm |
| diff_drive, four_wheel, mecanum, rover, ... | 2 m straight at the claimed top speed, 10 deg ramp (and the claimed slope) from standstill, turn in place, strafe (mecanum, if rollers are modelled) | >= 90 % of the claimed speed, drift <= 5 deg / 10 cm, climbs at >= 50 % of the commanded speed, mean wheel torque <= rated |
| quadruped, hexapod | free stand 5 s holding the home pose (no balance controller), squat: body lowered 20 % of the leg length by per-leg IK | upright, no saturation, mean <= rated, squat within 30 % |
| humanoid | free stand (informational), stand / single leg / squat on a vertical guide rail (balance removed, full weight on the legs) | as above |
| exo | wearer mannequin assist test with per-actuator utilisation | suit holds the wearer, no saturation, mean <= rated |

The report's `scope` states what a pass does not cover (thermal duty, backlash, compliance, control).
`render --motion task --spec robot.json` plays the arm payload hold with the payload drawn as a red box.
## Wheeled robots (`families/mobile.ts`)

`designDiffDrive`, `designFourWheel`, `designMecanum`, `designRover`, `designWallE`, `designEva`, `designBaymax`
take `{ name?, prompt?, budget?, payloadKg?, sensors?, wheels?, arm? }` and record it as `design.request`.

* Wheel stations: Pololu 37D gearmotor (axis along y, gearbox above the shaft) bolted through its six face holes
  to a printed L-bracket / rocker / track frame, wheel on the shaft as a `continuous` joint (collision: cylinder).
* Sizing loop (`sizeAndBuild`): build, take the robot's mass, wheel torque for a 10 deg slope + 0.5 m/s^2
  (Crr 0.03) against the motor's continuous rating, runtime >= 1 h at the estimated average power; step up the
  motor (37D 30:1 -> 50:1 -> 70:1) or battery (3S 2200 -> 3S 5000 -> 2 x 3S 5000) and rebuild.
* Checks: `drive:slope_torque`, `drive:top_speed`, `drive:traction`, `drive:skid_turn`, `power:runtime`,
  `power:voltage`, `power:peak_current`, `stability:tip` (CoM vs support polygon, arms stretched with payload),
  `torque:*` for every servo as mounted on the robot, `print:*`, `budget`.
* Arms and necks reuse `designArm` (`kinds`, `basePlateMm`) and are grafted with `graftArm`.
* Decks larger than the bed are laser-cut aluminium (fabricated, costed, not catalog parts).

```
node scripts/design_robot.ts rover robot.json '{"wheels":4,"arm":{"dof":6},"sensors":["depth"]}'
node scripts/check_interference.ts robot.json        # exact pairwise overlap of all solids at home pose
```
