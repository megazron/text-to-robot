<p align="center"><img src="docs/brand/banner.png" alt="text-to-robot" width="100%"></p>

<p align="center">
  <a href="https://megazron.github.io/text-to-robot/"><b>Try it in your browser</b></a> &nbsp;·&nbsp;
  <a href="examples/README.md">Gallery</a> &nbsp;·&nbsp;
  <a href="DEVELOPMENT.md">Develop</a>
</p>
<p align="center">
  <a href="https://github.com/megazron/text-to-robot/actions/workflows/ci.yml"><img src="https://github.com/megazron/text-to-robot/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-39ff88.svg" alt="MIT"></a>
</p>

Type what you want. Get a robot you can simulate, wire and print: real parts with prices, printable housings, a ROS 2 package and a physics test report.

```text
> an arduino car with four wheels
Arduino car (4WD) · TT motors · HC-SR04 · $41 of parts · checks passed
```

Your design stays yours. The website runs entirely in your browser, nothing is uploaded, and there is no account.

| | | | |
|:-:|:-:|:-:|:-:|
| <img src="examples/18_arduino_car/simulation.gif" width="200"><br>Arduino car | <img src="examples/19_arduino_arm/simulation.gif" width="200"><br>Arduino arm | <img src="examples/15_wall_e/simulation.gif" width="200"><br>WALL-E | <img src="examples/02_arm_6dof/simulation.gif" width="200"><br>6-DOF arm |
| <img src="examples/10_quadruped/simulation.gif" width="200"><br>Quadruped | <img src="examples/11_spider_scout/simulation.gif" width="200"><br>Hexapod | <img src="examples/08_humanoid/simulation.gif" width="200"><br>Humanoid | <img src="examples/12_mars_rover/simulation.gif" width="200"><br>Mars rover |

Every animation above is a physics run of the exported model, not a render of a separate asset.

## What you get

| | |
|---|---|
| **Parts list** | Real components with prices and suppliers, sized to the job. |
| **Printable parts** | STL files that fit a normal print bed, with a print report for each. |
| **Robot files** | URDF, Xacro, ROS 2, MoveIt, MuJoCo. |
| **Engineering checks** | Torque, speed, power, runtime, clearance and tipping, shown with the numbers. |
| **Physics tests** | Each robot is driven through its tasks in MuJoCo. Failures are listed, not hidden. |

## Arduino mode

Flip the Arduino switch and the design is rebuilt around cheap, compatible parts with price tiers. If a request can't be done on a budget it says so and offers what can, like a motorised helmet instead of a powered suit. Name a part ("with MG996R servos and an Arduino Nano") and it is used, or you are told why not.

## Mark 43, wearable

<img src="docs/img/mark43_suit_up.gif" width="300" align="right" alt="The Mark 43 opens, a person walks in, the armour closes">

The hardest thing we could think of. Designed directly from reference photos of the film suit, with no body or scanned model underneath: every part is a mathematical form with plates, panel lines and bevels added to it. 327 hollow printed parts sized for a home printer, a mask that lifts on two micro servos, lit eyes, chest and palms. Joint ranges are measured by sweeping armour against armour.

Fan work, not affiliated with or endorsed by the rights holders. See [NOTICE](NOTICE.md).

<br clear="right">

## Quick start

Requires Node.js 22.6 or newer.

```bash
git clone https://github.com/megazron/text-to-robot
cd text-to-robot
npm ci
node cli/src/index.ts "a 6 DOF arm with a gripper" -o out/arm
npm run api          # web viewer and API on http://localhost:8787
```

The CLI writes `out/arm/` with the ROS 2 package (`arm_6dof/`, including
`urdf/arm_6dof.urdf` and `.urdf.xacro`), `arm_6dof.json`, a simulation URDF, `meshes/`,
`cad/` (with `WIRING.md`: pin-to-pin table, cut list, power budget, and `wiring.svg`), `training/` and `BOM.md`. Other commands: `modify robot.json "<instruction>"`,
`bom`, `validate` and `inspect`; run `node cli/src/index.ts --help`.

![Viewer showing a generated 6-DOF arm](docs/img/web/02_arm_6dof.png)

The viewer has joint sliders, modification, version history, share links and
downloads. `docker compose up --build` serves the same app with persistent storage.

To simulate the generated arm in MuJoCo (Python 3.10+):

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e ./python
ttr-mujoco test out/arm/arm_6dof.sim.urdf --self-collision
ttr-mujoco convert out/arm/arm_6dof.sim.urdf -o out/arm/arm_6dof.mjcf.xml
```

## What you can ask for

```text
$ node cli/src/index.ts "a red 6 dof arm with 70 cm reach, a wrist camera and no lidar, lifting 1 kg, budget $600"
✓ Interpreted as: 6-DOF serial arm · parallel gripper · camera (wrist_3) · reach 0.70 m · red · payload 1 kg · budget $600
```

| Say | Effect |
|---|---|
| `6 DOF`, `seven-axis`, `3-link arm`, `60 cm reach`, `each link 25 cm`, `small` | arm size and joint count |
| `2 kg payload`, `budget $1500` | actuator sizing and BOM tier |
| `wrist camera`, `lidar on the front`, `no lidar`, `suction cup` | sensors and gripper, including negation |
| `robot dog`, `mobile manipulator`, `mecanum`, `hexapod`, `cobot` | template family |
| `called Atlas`, `painted blue`, `for a 1.85 m wearer` | name, colour, wearable fit |

Anything it cannot apply is listed as `not applied`, and contradictions (two robot types,
two joint counts, two reaches) are each flagged as `conflict:`. A small German, French and
Spanish keyword list covers the common robot words (`Roboterarm mit sechs Achsen und Greifer`).

Families: 1-12 DOF arms, SCARA, grippers, differential/four-wheel/mecanum bases, a
rover with an arm, quadruped, hexapod, humanoid, and character robots. Drones, delta and
gantry robots, snake and marine robots and dexterous hands are refused with a reason.

## Honest limits

- Nothing here has been built on a real bench yet. Printability is checked on geometry, not in a slicer.
- Simulation is not proof of real-world behaviour. Two robots currently fail their turn-on-the-spot test, and those failures are listed in the [gallery](examples/README.md).
- Some printed parts have known issues, each with its cause, in [PRINTABILITY](docs/PRINTABILITY.md).
- The parser covers the robot families above and refuses the rest with a reason.

## Legal

[MIT licence](LICENSE) for the code · [Terms](TERMS.md) · [Privacy](PRIVACY.md) · [Third-party notice](NOTICE.md). Character names belong to their owners.
