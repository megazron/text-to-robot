# Engine API (version 1)

The current release is 1.3.0: version 1.1 added the parts-list methods (`parseInventory`, `searchParts`, `fromParts`, `firmware`), 1.2 gives `firmware` a sketch for every Arduino robot, written from its wiring record, and 1.3 adds the electrical simulation (`electricalSim`, `batteryLife`); nothing in 1.0 changed.

The Text to Robot engine can be used from any web page. It is the same engine the website runs: the prompt parser, the design engine, the checks and every export. It runs in a Web Worker in the visitor's browser; nothing is sent to a server.

```js
import { createEngine } from "https://megazron.github.io/text-to-robot/engine/v1/engine.js";

const engine = await createEngine();
const { robot } = await engine.design("a 4 DOF arm with a gripper");
const report = await engine.check(robot);           // checks, mass, cost, torque margins, power per rail
const { urdf, xacro } = await engine.urdf(robot);
const ros2 = await engine.ros2(robot);               // { "path/in/package": text or bytes }
const blob = engine.zip(ros2);                       // a .zip to download
```

Types: [`engine/v1/engine.d.ts`](https://megazron.github.io/text-to-robot/engine/v1/engine.d.ts), generated from the sources by `scripts/engine_types.ts`.

## Loading

- `engine.js` is an ES module. Import it from the published site, or from a local build (`deploy/build-pages.sh pages-dist`, then serve `pages-dist/`).
- `createEngine({ base })` starts the worker from `base` (default: the site `engine.js` came from). From another origin I start it through a small same-origin bootstrap that imports the worker with CORS; GitHub Pages sends `Access-Control-Allow-Origin: *`, so this works from any page. A page with a Content Security Policy needs the directives under [Security](#security).
- The first call waits for the CAD kernels (OpenCascade and manifold, about 12 MB of WebAssembly, cached by the browser).
- `onProgress` hears long jobs, such as forging the Mark 43 armour.

## Methods

| Method | What it does |
|---|---|
| `design(prompt)` | Design a robot from a description. Same result as the website's prompt bar: `{ id, robot, urdf, xacro, summary, warnings, bom, ... }`. The reference Mark 43 comes ready-made; a custom Mark 43 shape (build, pauldrons, panels) is refused with a reason (HTTP 409, `forgeNeeded`) because forging it takes many minutes and gigabytes of memory, until the request is sent again with `forgeConsent: true`. |
| `modify(robot, instruction)` | Change a robot by a description. |
| `arduino(prompt)` | Cheap Arduino versions with their prices. |
| `open(robot)` | Check and keep a spec from elsewhere; its `id` serves its meshes. |
| `check(robot, { quick, interference, wiring })` | Spec and URDF validity, torque margin per joint, stability (centre of mass over the footprint, the slope it tips at), print bed fit, clearance between parts, automatic wiring with the power budget per rail; `engineering` holds mass, centre of mass, cost and those numbers. For an edited robot, `robot` comes back with its design record rebuilt. |
| `clearance(robot, link)` | Parts that one part intersects where it is now (mm^3 each), the part it is attached to included. For checking a placement before keeping it. |
| `sweep(robot, joint, samples)` | Parts that collide over one joint's travel, per sample. |
| `urdf(robot)` | URDF and xacro. |
| `ros2(robot)`, `cad(robot)`, `training(robot)` | The ROS 2 package, the CAD files (STL, with STEP for the parts modelled on the CAD kernel) and the training scaffold (PyBullet tasks and MuJoCo tests), as file maps. |
| `bom(robot, budget)` | Bill of materials. |
| `catalog()` | Every purchasable part (dimensions, mass, price, supplier, rating, electrical ports) with its mounting points, and the parametric printed parts. |
| `edit(robot, ops)` | Apply edit operations; returns the new spec and every mount in world coordinates. |
| `mounts(robot)`, `printedMounts(params)` | Mounting points of a robot, or of a printed part before it is added. |
| `empty(name)` | An empty robot to build by hand. |
| `partMesh(key)`, `mesh(geometry)`, `robotMesh(id, file)` | Binary STL of a catalog part, of any link geometry, or of a mesh of a robot the engine designed. |
| `templates()` | The template robots. |
| `schematic(robot)` | The robot's schematic, drawn from its wiring record: KiCad-style symbols with numbered and named pins, reference designators, power and ground symbols with each rail's voltage, net labels, routed wires and a title block. Returns `{ svg, pdf, size, netlist, layout, electrical }`: `pdf` is the same sheet as bytes, `netlist` lists every conductor with its pins, `layout` lists overlaps (empty when the drawing is clean) and `electrical` holds the battery runtime, regulator heat and logic-level checks. A robot without a design record is wired automatically first. |
| `breadboard(robot)` | A picture wiring diagram: drawings of the parts with labelled pins and every wire of the harness in its colour, pin to pin. Returns `{ svg, layout, unrouted }`. |
| `electronics3d(robot, { checks? })` | The electronics and harness in 3D. Returns `{ robot, rails, models, parts, wires, groups, notes, checks? }`. `models` holds one 3D model per catalog key (meshes per material in mm, silkscreen labels, each pin's place and lead direction as `port.pin`; `detailed` when the pin map comes from the board's datasheet, `replaces` when the model stands in for the part's catalog body). `parts` places each part on its link (`T`, its frame in the link, row-major 4x4 in mm), harness parts (splices, inline fuses) included. Each wire in `wires` carries its net, colour, AWG, insulation diameter, current, cut length and its centreline as points in the frames of the links it rides: multiply each point by its link's matrix and the harness follows every joint. With `checks: true`, `checks` lists wires through solid parts, bends under the gauge's minimum radius and cut lengths that do not match the drawn run, at the home pose. |
| `electronicsGlb(robot)` | The same electronics and harness at the home pose as one binary glTF (`ArrayBuffer`, metres, Y up): a node per part and per wire, each wire's net, ends, gauge and current in its `extras`. |
| `parseInventory(text)` | Read a parts list: a sentence ("I have an Arduino Uno, 2 TT motors, an L298N ..."), a pasted shopping list or kit contents, Hinglish ("mere paas 2 motor aur ek Arduino hai"). Returns `{ items, extras, unknown, notes }`: catalog keys with quantities (each with what it was read from, and `assumed` when a loose name was read as the usual part), parts understood but not designed with (jumper wires, resistors), and lines not recognised with the closest catalog parts. Added in 1.1. |
| `searchParts(query, limit)` | Catalog parts matching a model, a name or a category word, for a parts picker. Added in 1.1. |
| `fromParts(inventory, { design, limit, budget, prompt })` | Build from my parts. `inventory` is text, `[{ key, qty }]`, `{ key: qty }` or a parsed inventory. Returns `{ inventory, options, designs, cannot?, notes }`: up to `limit` (3) options best first, each with `uses` and `buys` per part, a `headline` ("uses 6/7 of your parts, needs +$20 (1x 2S 18650 pack, ...)"), the `honesty` notes (what the user's own parts cannot do safely, with numbers, and the fix the option takes) and a `thumbnail`; `designs` holds the options asked for by `design` ("top" by default, "all", "none" or an option id): `{ robot, bom, failing, shopping, to_buy_usd }`, where every BOM line carries `have` and `buy`. With no option, `cannot` says why and what to add. Added in 1.1. |
| `firmware(robot)` | The program of a robot. A robot built from a parts list gets an Arduino sketch (AVR and ESP32 boards) or a Python script (Raspberry Pi) with the pins its harness assigned. Any other robot with an Arduino-class board (Uno, Nano) gets a sketch whose every pin is a wire of its wiring record: motor driver, servo and range sensor code, a simple behaviour (obstacle avoidance for a car, a pose sequence for an arm) and serial reports. Returns `{ name, language, code, fqbn, libraries }`; a sketch from the wiring record also carries `{ files, sketch, board, pins, notes, behaviour, serial_baud, motors, servos, servo_drivers, range_sensor, pwm_max, poses }` (`files`: the sketch in a folder of its own name and `README.md` with the flashing steps and pin map). Rejects when the robot has no program (no such board, or the wearable Mark 43, whose door sequence I do not script). Added in 1.1; the sketch from the wiring record was added in 1.2. |
| `motions(robot)` | The motions a robot has: its joint tour, its purpose demo and, for a wearable, human motion. See [Motions](#motions). |
| `motion(robot, name, { fps, collision, to, files })` | A motion sampled at `fps` (30), with its limit, speed, torque and self-collision checks; `files: true` adds its CSV, ROS 2 JointTrajectory and BVH. |
| `ik(robot, link, target, options)` | Inverse kinematics: joint values that bring a point on `link` to a world pose, and whether they reach it. |
| `electricalSim(robot, { scenario, faults, soc, transient, loads, actuator_load })` | The harness solved as a circuit (a solver of its own, modified nodal analysis): every power, ground and motor wire a resistor from its gauge and cut length, the battery its rest voltage at `soc` behind its internal resistance, regulators, fuses, switches, drivers and loads from their records. `scenario` is `"idle"`, `"typical"` (default), `"stall"` or `"peak"`; `faults` are `{ kind: "short", rail }`, `{ kind: "open", wire }`, `{ kind: "stall", inst }` and `{ kind: "low_battery", soc }`. Returns the operating point (`pins`, `wires`, `rails`, `parts`, `sources`, `regulators`, `fuses`, `power` with its balance) and `events` for what trips (fuses by their datasheet curve, brown-outs, regulator dropout and limit, wires over their rating); `converged: false` when there is no steady state. `transient: { t_end_s, dt_s, t_fault_s }` also steps it in time. Every estimate is in `assumptions`. Added in 1.3. |
| `batteryLife(robot, { scenario, faults, step })` | Battery life by simulation: the pack run down from full in steps of charge (2 %), the harness solved at every step, the time from the current each solution draws. Returns `{ ok, life_h, ends, ends_at_soc, points, capacity_ah, source }`; `ends` is the first error as the pack runs down (a brown-out, the pack under its cutoff) or `"empty"`. `ok: false` with a reason for a robot on a supply or with more than one battery. Added in 1.3. |
| `zip(files)` | A zip archive of a file map. |

The module also exports the pure functions behind editing, for use on the page without a round trip to the worker: `applyEdits`, `toScene` and `fromScene` (the spec as a tree of parts and joints; an unedited spec round-trips exactly), `worldFrames`, `snapPart` and `mate` (placing a part on a matching mount or on a surface grid), and the transform helpers.

## Edit operations

`edit(robot, ops)` applies `ops` in order to a copy. An invalid edit throws and nothing changes.

| op | Fields | Effect |
|---|---|---|
| `pose` | `link, world` | Put a link's frame at a world pose (the zero pose). What it carries moves with it. |
| `translate`, `rotate` | `link, by` / `link, axis, angle, about?` | Move or turn a link in world coordinates. |
| `delete` | `link` | Remove a link and everything it carries. |
| `duplicate` | `link, offset?, name?` | Copy a link and what it carries. |
| `rename` | `link` or `joint`, `to` | Rename, updating every reference. |
| `attach` | `link, parent` | Re-parent with a fixed joint, keeping the world pose. |
| `joint` | `child, parent?, type, axis, at, lower?, upper?, effort?, velocity?, actuator?` | Make a revolute, continuous, prismatic or fixed joint about a world axis through a world point. The child's frame moves onto the pivot; nothing moves on screen. |
| `limits` | `joint, lower?, upper?, effort?, velocity?` | Joint limits. |
| `color`, `material` | `link, rgba` / `link, material` | Appearance. |
| `add` | `key` or `printed`, `parent?, world, name?` | Add a catalog part or a printed part. The first part of an empty robot becomes its root. |
| `printed` | `link, params` | Change a printed part's parameters (size, wall, fillet, holes). |
| `swap` | `link, key` | Replace a bought part by another. |
| `robot_name` | `to` | Rename the robot. |

An edited robot carries `metadata.studio` (`edited: true`, printed part parameters, which actuator drives which joint). Its designer's request is removed, so `modify` does not re-run the designer over the edits.

## Mounting points

A mount is a frame on a part: `pos` (metres), `axis` (out of the part), `ref` (across it) and a `kind`. Kinds that mate: `output` with `hub` (a shaft or horn and a wheel hub or a printed link's horn coupling; mating them offers a joint), `case` with `seat` (a servo in a printed bracket made for it), `board` with `standoffs` (matching hole patterns), and `base` or `board` on any `face`. Mounts come from the catalog: an actuator's output frame, its case holes, a board's mounting holes (the electrical record's drawing where the catalog has none), a wheel's bore. Every part also has a `base` for placing it on a surface: its lowest face, so a part set down touches the surface and none of it is inside (a gearmotor whose shaft runs through its body lies on its side). A servo held by its tabs belongs in a printed servo bracket (`servo_bracket`), which screws to the surface.

The `clearance:home` check of `check(robot)` covers every part placed by hand against every other, the part it is attached to included; only pairs the designer joined and nobody moved since are taken as designed. `clearance(robot, link)` answers the same for one part, for checking a placement before keeping it.

Catalog entries carry what a viewer needs to paint the regions of a part's one mesh: `horn_radius_mm` (actuators), `case_top_mm` (servos with a case size) and `body_mm` (a motor's body without its shaft).

## Security

- **Content Security Policy.** The worker is started from a `blob:` bootstrap, and a blob worker runs under the page's own policy. The strictest policy that runs the engine, tested in CI by `scripts/check_engine.py`, is:

  ```
  script-src 'self' https://megazron.github.io/text-to-robot/ 'unsafe-eval'; worker-src blob:; connect-src https://megazron.github.io/text-to-robot/
  ```

  `'unsafe-eval'` is needed because the kernels' Emscripten glue (manifold-3d, OpenCascade) builds its call wrappers with `new Function` from C++ type signatures when it starts; nothing the engine is given is ever evaluated. It also covers compiling the WebAssembly, so `'wasm-unsafe-eval'` is not needed on top. `worker-src blob:` covers the bootstrap and the forge's helper workers. If your page cannot allow `'unsafe-eval'`, serve the engine from your own origin (a local build, `deploy/build-pages.sh`) so the worker loads as a same-origin script with its own policy.
- **Pin what you load.** `/engine/v1/` changes when I fix or extend it. To freeze a version, copy a build to your own site, or load it through an import map with an `integrity` entry for `engine.js` (and keep in mind the worker files it loads are not covered by that hash).
- **What the engine can reach.** It runs in a worker in your page's origin: it sees only what you pass it, stores the Mark 43 cache in your origin's IndexedDB, and makes no network request except fetching its own files from `base`. It never reads this site's storage.
- **Treat robots as data.** Names in a robot must be plain identifiers (letters, digits, `_`); a robot with other names is refused before any file is generated, so a hostile spec cannot write quotes, markup or `../` into a URDF, a Python script or a zip path. Text inside a robot (notes, design summaries) is still untrusted: show it with `textContent`, never `innerHTML`.

## Motions

`motions(robot)` lists what a robot can show, each as `{ name, title, description, kind, moves_base, default }`. I choose them from what the joints are for, not from the family name, so a robot nobody has designed before still gets the right ones:

| A robot with | gets | named |
|---|---|---|
| any joints | a joint tour: each joint through its full limits, one after another, then all together | `tour` |
| a tool point or a gripper on a chain of joints | pick and place: reach, close the gripper on a block, lift, carry, put it down | `pick_place` |
| finger joints | open and close | `grip` |
| two or more driven wheels | forward, reverse and a turn on the spot (and a strafe for mecanum wheels), wheels turning at the ground speed | `drive` |
| three or more legs | a trot (four legs), a tripod gait (six) or a wave gait, feet planted while they carry the body | `gait` |
| two legs | a slow step cycle, the body shifting over the planted foot | `step` |
| shoulders and elbows | a wave | `wave` |
| limbs the wearer moves and servo doors (a wearable suit) | suit-up, the doors on their own, and human motion: `idle`, `walk`, `look`, `wave`, `squat`, `punch`, `arms_up`, `hover` | `suit_up`, `doors`, ... |

The one marked `default` is the robot's purpose demo; a robot with nothing else gets the tour.

`motion(robot, name, options)` returns a trajectory: `t` (seconds), `q[frame][column]` for the joints in `joints` (every joint that is not fixed and not a mimic joint), `base` (the root's pose `[x, y, z, qx, qy, qz, qw]` per frame, with the floor at z = 0, when the whole robot moves), `focus` (the joint a tour is moving), `props` (the block a gripper carries, its table, the wearer of a suit), `segments` (labelled stretches), and the checks:

- `limits`: position, speed and torque. Each move is timed from the actuator's rated speed (with headroom) and from its spare torque against the inertia it turns; `torque_ok` adds gravity and inertia against the actuator's peak for joints whose load hangs free.
- `collisions`: every frame, every pair of parts that move relative to each other, on the parts' real solids as distance grids; `frames[k]` is true where something collides, `pairs` says what, when and how deep, `floor` lists parts below the floor. Overlap parts already have with every joint at zero (a shaft in its bearing) is not counted. A part whose mesh is not in the tab yet (the Mark 43 armour before it is forged) is listed in `skipped`. Pass `collision: false` to skip the check.
- `clamped`: where a motion wanted a joint past its limit and was held at it (human motion on a suit: "beyond the suit's range of motion").
- `measures`: for a gait the largest drift of a planted foot (`stance_drift_mm`), stride, cycle and speed; for a drive the gap between a wheel's roll and its hub's travel (`wheel_speed_error_mm`).

`to: [dx, dy]` makes a gait walk that far (metres, robot frame) instead of its demo path. With `files: true` the answer also carries `files`: `<name>.csv` (`time_s` and one column per joint), `<name>_base.csv` (the root's path, when it moves), `<name>.yaml` (a ROS 2 `trajectory_msgs/JointTrajectory` of the motor-driven joints that move) and, for a body with shoulders, hips and knees, `<name>.bvh` (z up, x forward, centimetres).

The ROS 2 package (`ros2(robot)`) carries the default motion and the tour in `motions/`, with `scripts/replay_motion.py`: `ros2 launch <pkg> display.launch.py motion:=tour` replays one in RViz, and `--controller /joint_trajectory_controller` sends it to Gazebo or the robot. The training scaffold (`training(robot)`) carries them in `reference_motions/` with a small loader for imitation.

Human motion is real motion capture: the Quaternius Universal Animation Library (CC0), turned into anatomical angles by `scripts/human_clips.py` and put onto whatever joints a robot has for each movement, clamped to their limits. A movement the robot has no joint for is named in `warnings`.

```js
const list = await engine.motions(robot);                       // [{ name: "pick_place", default: true, ... }, ...]
const m = await engine.motion(robot, "pick_place", { files: true });
m.collisions.colliding_frames;                                  // 0
m.files["pick_place.yaml"];                                     // trajectory_msgs/JointTrajectory
```

## Inverse kinematics

`ik(robot, link, target, options)` solves by damped least squares on the URDF chain to `link`, within the joint limits, from several starting poses. `target` is `{ xyz }` in metres (world, the root at the origin), with `rpy` or `quat` for an orientation; `options`:

| Option | Default | |
|---|---|---|
| `point` | the robot's tool point when `link` carries it, else the link origin | the point on the link to bring to `xyz` (link frame) |
| `seed` | the design's home pose | joint values to start from (and to stay near) |
| `joints` | every motor-driven joint on the chain (and a wearable's limb joints) | the joints it may move |
| `base` | at the origin | the root's pose `[x, y, z, qx, qy, qz, qw]` |
| `orientation` | `false` | match `rpy` or `quat` too |
| `restarts`, `iterations` | 8, 150 | more starting poses find more of the workspace |
| `collision` | `false` | also check the pose for self-collision (`collisions`) |

The answer is `{ values, reached, error_mm, error_deg, position, at_limit, collisions }`: `reached` is true within 0.5 mm and 0.5 degrees; when it is false, `values` is the closest pose found and `position` where the point ended up. `at_limit` names the joints the answer leaves at a limit.

The website uses the same solver to drag a robot into a pose (Move in the 3D view): the tool tip, a hand or a foot follows the pointer, any other part turns the joint above it, a legged body leans with its feet planted and walks when dragged further than it can lean, and a wheeled robot drives towards where it is held.

## Versions

`/engine/v1/` keeps its method names, arguments and result fields. New methods and fields may be added. A change that breaks a caller gets a new path (`/engine/v2/`), and v1 stays.
