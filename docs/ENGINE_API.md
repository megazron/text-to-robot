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
- `createEngine({ base })` starts the worker from `base` (default: the site `engine.js` came from). From another origin I start it through a small same-origin bootstrap that imports the worker with CORS; GitHub Pages sends `Access-Control-Allow-Origin: *`, so this works from any page. A page with a Content Security Policy needs `worker-src blob:` and `script-src` for the engine's site.
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
| `sweep(robot, joint, samples)` | Parts that collide over one joint's travel, per sample. |
| `urdf(robot)` | URDF and xacro. |
| `ros2(robot)`, `cad(robot)`, `training(robot)` | The ROS 2 package, the CAD files (STEP and STL) and the MuJoCo training scaffold, as file maps. |
| `bom(robot, budget)` | Bill of materials. |
| `catalog()` | Every purchasable part (dimensions, mass, price, supplier, rating, electrical ports) with its mounting points, and the parametric printed parts. |
| `edit(robot, ops)` | Apply edit operations; returns the new spec and every mount in world coordinates. |
| `mounts(robot)`, `printedMounts(params)` | Mounting points of a robot, or of a printed part before it is added. |
| `empty(name)` | An empty robot to build by hand. |
| `partMesh(key)`, `mesh(geometry)`, `robotMesh(id, file)` | Binary STL of a catalog part, of any link geometry, or of a mesh of a robot the engine designed. |
| `templates()` | The template robots. |
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

A mount is a frame on a part: `pos` (metres), `axis` (out of the part), `ref` (across it) and a `kind`. Kinds that mate: `output` with `hub` (a shaft or horn and a wheel hub or a printed link's horn coupling; mating them offers a joint), `case` with `seat` (a servo in a printed bracket made for it), `board` with `standoffs` (matching hole patterns), and `base` or `board` on any `face`. Mounts come from the catalog: an actuator's output frame, its case holes, a board's mounting holes (the electrical record's drawing where the catalog has none), a wheel's bore. Every part also has a `base` under its body for placing it on a surface.

## Versions

`/engine/v1/` keeps its method names, arguments and result fields. New methods and fields may be added. A change that breaks a caller gets a new path (`/engine/v2/`), and v1 stays.
