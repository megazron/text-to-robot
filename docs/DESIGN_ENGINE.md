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
```
