# 🤖 Text&nbsp;to&nbsp;Robot

### «Describe a robot. Get a ROS&nbsp;2 robot.»

Text-to-speech turns words into audio. **Text-to-Robot turns words into a robot** — a validated URDF/Xacro, an interactive 3D model, and a buildable ROS 2 package.

```
        TEXT                          ROBOT                         ROS 2
"Create a 6 DOF robotic     →   interactive 3D model,    →   URDF / Xacro +
 arm with a parallel             joints you can move          ament package you
 gripper."                        with sliders                 can colcon build
```

> The hard rule that makes this reliable: **the language model never writes URDF.**
> It only produces a typed `RobotSpecification`. Deterministic, tested code turns
> that into XML. See [Architecture](docs/ARCHITECTURE.md).

---

## Why Text to Robot?

Writing URDF by hand is slow and error-prone: nested XML, inertia tensors, joint
limits, frame conventions. Asking an LLM to emit raw URDF is worse — it hallucinates
tags, invents inertias and breaks the kinematic tree. Text-to-Robot splits the
problem the right way:

- **The LLM does understanding** — turning "6 DOF arm with a gripper" into structure.
- **Deterministic code does generation** — inertia from geometry, validated topology,
  clean XML, every time.

The result is reproducible, testable, and works **with no API key at all** (deterministic
demo mode), so the repo runs the moment you clone it.

## Features

- 🗣️ **Natural-language generation** — arms, mobile bases, quadrupeds, humanoids, grippers.
- 🧱 **Typed RobotSpecification** — one strongly-typed IR for the whole pipeline.
- 🧮 **Automatic inertia** — box / cylinder / sphere / capsule tensors from geometry + mass.
- ✅ **Real validation** — single root, no cycles, unique names, valid limits, positive mass,
  physically-plausible inertia; plus a self-healing repair loop (max 3 attempts).
- 🧊 **Interactive 3D viewer** — Three.js, orbit/zoom/pan, click to inspect, **joint sliders**
  driven by forward kinematics — no ROS required in the browser.
- ✏️ **Natural-language modification** — "make the forearm 30% longer", "add a camera to the head",
  "replace the gripper with a suction gripper" — edits the existing spec, with a **git-style diff**.
- 🕑 **Version history** — every change is a version you can switch between.
- 📦 **ROS 2 export** — a complete `ament_cmake` package with `display.launch.py`, RViz config,
  joint limits, and optional `ros2_control`.
- 🖥️ **CLI + HTTP API** — scriptable and embeddable.
- 🔌 **Pluggable LLMs** — OpenAI, Anthropic, or deterministic demo mode.

## Architecture

```
prompt → LLM (or demo parser) → RobotSpecification → validate → repair → inertia →
         URDF/Xacro → validate → 3D viewer + ROS 2 package
```

Full diagram and package map in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Supported robots

Templates (used as sensible starting points the AI can customize):

| | | |
|---|---|---|
| 2 / 3 / 6 / 7 DOF arms | SCARA | Parallel & two-finger grippers |
| Differential drive | Four-wheel | Mecanum |
| Quadruped | Humanoid (torso, head, two arms) | Suction gripper |

Ten worked examples live in [`examples/`](examples/) — each passes schema **and** URDF validation.

## Installation

Requires **Node.js ≥ 22.6** (uses native TypeScript execution — no build step). No other runtime dependencies.

```bash
git clone https://github.com/megazron/text-to-robot
cd text-to-robot
npm install          # links the workspace packages (no third-party deps to download)
npm test             # 37 tests
```

## Quick start

**Web app (the full experience):**

```bash
npm run api
# open http://localhost:8787
```

Type a prompt, watch the robot appear, drag the joint sliders, then click **ROS 2 Package**.

**CLI:**

```bash
node cli/src/index.ts "Create a 6 DOF robotic arm with a parallel gripper"
# → ./arm_6dof/  (URDF, Xacro, launch, config, rviz, README, JSON)
```

## CLI

```bash
text-to-robot "<prompt>"                         # generate (bare prompt)
text-to-robot generate "<prompt>" -o out/        # generate into out/
text-to-robot modify robot.json "make it longer" # modify an existing spec
text-to-robot validate robot.urdf                # structural URDF validation
text-to-robot inspect robot.urdf                 # print links + joints
```

(Invoke with `node cli/src/index.ts ...`, or `npm link` the `cli` workspace to get the
`text-to-robot` binary on your PATH.)

## ROS 2

The exported package is a normal `ament_cmake` package:

```
my_robot/
├── package.xml
├── CMakeLists.txt
├── urdf/my_robot.urdf.xacro     # real Xacro: <xacro:macro> inertials
├── urdf/my_robot.urdf           # flattened URDF
├── launch/display.launch.py     # robot_state_publisher + joint_state_publisher_gui + rviz2
├── config/joint_limits.yaml
├── config/controllers.yaml      # optional ros2_control
├── rviz/my_robot.rviz
└── README.md
```

```bash
cp -r my_robot ~/ros2_ws/src/
cd ~/ros2_ws && colcon build --packages-select my_robot
source install/setup.bash
ros2 launch my_robot display.launch.py
```

## AI architecture

`packages/llm-providers` defines a small `LlmProvider` interface with `generateSpec` and
`modifySpec`. Two cloud adapters (OpenAI, Anthropic) ask the model for a **JSON
RobotSpecification** — never XML — using a strict system prompt. If no `OPENAI_API_KEY` /
`ANTHROPIC_API_KEY` is set, the app uses a **deterministic demo parser** (keyword + regex)
so it always works offline. Cloud output is untrusted: it is JSON-parsed, coerced, then run
through the same validation + repair loop as everything else.

```bash
export ANTHROPIC_API_KEY=sk-...   # or OPENAI_API_KEY=...
npm run api                       # badge switches from "demo" to "cloud"
```

Keys are read only on the server and never sent to the browser.

## URDF generation

Deterministic, in `packages/urdf-generator`: `generateRobot`, `generateLink`, `generateJoint`,
`generateVisual`, `generateCollision`, `generateInertial`, `generateMaterial`, `generateLimits`.
The Xacro output uses real `<xacro:macro>` inertials computed with `${...}` expressions.
URDF has no capsule primitive, so capsules are emitted as cylinders (documented in the output).

## Validation

Every robot is checked for: exactly one root, no cycles, all parent/child links exist, one
parent per child, unique link/joint names, valid joint types and axes, valid limits, positive
masses and dimensions, and physically-plausible inertia (positive principal moments + triangle
inequality). Invalid specs enter a **repair loop** (drop dangling joints, de-duplicate names,
enforce a single root, fix limits/axes, clamp masses) for up to 3 attempts. Failures are shown,
never hidden. The tool validates **URDF structure**; it does not claim physical/dynamic validity.

## Examples

```bash
node cli/src/index.ts validate examples/02_arm_6dof/robot.urdf
```

| # | Example | Prompt |
|---|---|---|
| 1 | 2 DOF arm | `Create a 2 DOF robotic arm` |
| 2 | 6 DOF arm | `Create a 6 DOF robotic arm with a parallel gripper` |
| 3 | 7 DOF arm | `Create a 7 DOF robotic arm with a two-finger gripper` |
| 4 | SCARA | `Create a SCARA robot` |
| 5 | Differential drive | `Create a differential drive mobile robot` |
| 6 | Four-wheel | `Create a four-wheel robot` |
| 7 | Mecanum | `Create a mecanum-wheel robot` |
| 8 | Humanoid | `... torso, head and two 7 DOF arms and two-finger grippers` |
| 9 | Gripper | `Create a two-finger parallel gripper` |
| 10 | Quadruped | `Create a quadruped robot` |

## Development

```
text-to-robot/
├── apps/            web (Three.js viewer) + api (zero-dep HTTP server)
├── packages/        robot-schema, kinematics, robot-templates, urdf-generator,
│                    urdf-validator, llm-providers, robot-generator, ros2-export
├── cli/             text-to-robot command
├── examples/        10 validated robots
├── tests/           37 node:test cases
└── docs/            architecture
```

Pure TypeScript, run directly by Node 22 (type stripping). No bundler, no transpile step.

```bash
npm test              # run the suite
npm run typecheck     # tsc --noEmit (optional; needs a local typescript)
npm run api           # serve web + API on :8787
```

## Roadmap

- [x] Natural-language robot generation
- [x] Typed RobotSpecification + schema/topology/physics validation
- [x] Deterministic URDF + Xacro generation
- [x] Automatic inertia
- [x] Interactive 3D viewer + joint sliders (forward kinematics)
- [x] Natural-language modification + version history + diff
- [x] ROS 2 package export (+ optional ros2_control)
- [x] CLI + HTTP API + demo mode

Future:

- [ ] Gazebo / Isaac Sim world export
- [ ] MoveIt 2 config generation
- [ ] Automatic mesh / STL / OpenSCAD generation
- [ ] Physics-based (not just structural) validation
- [ ] Automatic sensor placement + perception stack
- [ ] Generate robot + controller + task plan

## Contributing

Issues and pull requests welcome. Please keep the core rule intact: LLMs produce
`RobotSpecification`, deterministic code produces URDF. Add a test for any new behaviour.

## License

MIT — see [LICENSE](LICENSE).
