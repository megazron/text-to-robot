# Engine API (version 1)

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
| `design(prompt)` | Design a robot from a description. Same result as the website's prompt bar: `{ id, robot, urdf, xacro, summary, warnings, bom, ... }`. |
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

## Versions

`/engine/v1/` keeps its method names, arguments and result fields. New methods and fields may be added. A change that breaks a caller gets a new path (`/engine/v2/`), and v1 stays.
