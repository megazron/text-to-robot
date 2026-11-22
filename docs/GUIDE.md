# Text to Robot: the full guide

Everything the [README](../README.md) leaves out: what each output contains, Arduino mode, building from your own parts, the Mark 43, what you can ask for, how it works and its limits.

## What you get

| | |
|---|---|
| **Parts list** | Real components with prices and suppliers, sized to the job. |
| **Printable parts** | STL files that fit a normal print bed, with a print report for each. |
| **Robot files** | URDF, Xacro, ROS 2, MoveIt, MuJoCo. |
| **Wiring and circuits** | A schematic in KiCad style (reference designators, numbered pins, power symbols with each rail's voltage, net labels, title block; SVG and PDF), a picture view with every wire in its colour, and `WIRING.md`: power budget, fuses, wire gauges and drop, battery runtime, regulator heat and a 3.3 V / 5 V logic-level check. See the [Arduino car's schematic](../examples/18_arduino_car/schematic.svg) and [breadboard view](../examples/18_arduino_car/breadboard.svg). |
| **Arduino firmware** | For robots on an Arduino Uno or Nano: a commented sketch whose pins come from the wiring record, with motor driver, servo and range sensor code, a simple behaviour (obstacle avoidance, a pose sequence), serial reports and the flashing steps. Compiled in CI for the examples; not yet run on hardware. See [Arduino firmware](FIRMWARE.md). |
| **Engineering checks** | Torque, speed, power, runtime, clearance and tipping, shown with the numbers. |
| **Motion** | Every robot moves in the 3D view: a tour of its joints and a demo of what it is for (pick and place, a drive, a gait, a step cycle, suit-up), checked for collisions on every frame. Drag it into a pose, record a clip, download it as a GIF, a video, a joint CSV or a ROS 2 trajectory. See [Motions](ENGINE_API.md#motions). |
| **Physics tests** | The MuJoCo task tests (drive, ramp, turn, hold, squat, grip) come with every robot to run on your machine; the 24 examples are run in CI and their results are in the gallery. Failures are listed, not hidden. |

## Arduino mode

Flip the Arduino switch and the design is rebuilt around cheap, compatible parts with price tiers. If a request can't be done on a budget it says so and offers what can, like a motorised helmet instead of a powered suit. Name a part ("with MG996R servos and an Arduino Nano") and it is used, or you are told why not.

## Build from my parts

Tell it what you have: "I have an Arduino Uno, 2 TT gear motors, an L298N, an HC-SR04, 4 AA batteries and a servo SG90". Type it in the prompt bar, open **My parts** in the Create pane to pick parts from the catalog with counts, or paste a shopping list or a kit's contents ("Elegoo smart robot car kit", Hinglish like "mere paas 2 motor aur ek Arduino hai" works too). Parts it cannot place are listed as not recognised, with the closest parts it knows.

It ranks what those parts can build (obstacle-avoiding car, scanning car, line follower, camera car, desk arm, radar scanner, eight-servo walker, WALL-E) by how much of your list each uses and how little it needs on top, and shows the best three as cards: "uses 6/7 of your parts, needs +$20 (1x 2S 18650 pack, ...)". The design you pick uses your exact parts: the parts list marks each line "you have it" or "to buy", the wiring, schematic and power budget use your board, driver and battery, and the Arduino sketch (or Pi script) is written for the pins it wired. When your parts cannot do it safely it says so with numbers, for example that 4 AA cells sag to 3.6 V when two TT motors start, so an Uno resets, and takes the cheapest fix. The engine API has the same thing as `parseInventory(text)` and `fromParts(inventory)`.

## Surgical and healthcare robots

`surgical robot`, `da vinci style surgical robot`, `laparoscopic robot`, `minimally invasive surgery robot with 4 arms` build a tabletop teaching model of a teleoperated surgical robot: three instrument arms and a camera arm round a laparoscopic trainer box (a plywood box with an acrylic lid and a silicone practice pad). Each arm is a spherical remote-centre-of-motion mechanism, the layout research systems such as the Raven use: two servos turn it about two axes that cross at the arm's port in the lid, so the instrument shaft always pivots about that point, as a laparoscopic instrument pivots in the incision (checked as `<arm>:rcm` at every corner of the ranges). A servo-driven GT2 belt slides the instrument in and out along its shaft on two rods and LM8UU bushings; a third servo rolls it; the wrist and jaw servos ride on the rolling housing and pull the tip by braided line through a 6 mm carbon shaft. The camera arm carries a 19 mm FPV camera at its tip. All of it runs on Feetech STS3215 bus servos from a PC: the ROS 2 package has a MoveIt group per arm, and teleoperation (leader arms, game controllers or a 3D mouse) is software started from there.

Counts and tools are read as asked: `with 2 arms`, `3 instrument arms and a camera arm`, `without a camera`; `a surgical arm`, `robotic surgery arm`, `eye surgery robot` build one instrument arm; `with a scalpel` puts a scalpel holder on the wrist (a tool mount only: practise with a marker or a blunt dummy blade), `needle insertion`, `biopsy`, `draws blood`, `hair transplant` a needle guide, `dental` and `orthopedic` a drill guide; `an endoscope holder` builds the camera arm alone. Medical words (surgery, scalpel, needle, incision, injection, drugs on a ward) never trip the harm filter; a request to hurt someone still does.

**It is an educational and research model, not a medical device.** It has no regulatory clearance, no sterile barrier, no force sensing and no certified safety system, and it must never be used on a person or an animal. Every result says so.

Other healthcare and lab prompts get the robot the job needs: `lab pipetting robot` the Cartesian gantry (a liquid handler is Cartesian), `pharmacy pick robot` an arm with a suction cup, `lab sample sorting robot` an arm with a gripper, `disinfection UV robot` a wheeled base with a lamp mast (the UV-C lamp itself is not designed: it burns eyes and skin), `hospital nurse assistant robot` a mobile manipulator, `rehabilitation exoskeleton` the exoskeleton, `ultrasound robot` an arm holding the probe, `prosthetic hand` the tendon hand, `endoscope snake robot` the snake. `patient lift robot` says that lifting a person is a certified hoist's job and builds a base that carries a carer's things. `tests/fidelity/medical.test.ts` holds 46 surgical prompts and 18 healthcare ones.

## Mark 43, designed to be worn, not yet built

<img src="img/mark43_suit_up.gif" width="300" align="right" alt="The Mark 43 opens, a person walks in, the armour closes">

The hardest thing I could think of. Designed directly from reference photos of the film suit, with no body or scanned model underneath: every part is a mathematical form with plates, panel lines and bevels added to it. The website designs the armour itself, in your browser: a worker forges every part from the prompt (fields, marching cubes, shells cut to the print bed), trims the overlaps, fits the hinges, servos, latches, cable channels and battery bay, and measures every joint and door by exact intersection. Words in the prompt change the armour: its build (`bulky`, `sleek`, `10 % bulkier`), the pauldrons (`bigger shoulders`), the panels (`smooth panels`, `heavy plates`), the paint (`black and gold`, `silver joints`), and the height, tier and budget. The reference suit opens at once: it is the forge's own output for the film shape, shipped ready-made. A custom shape is forged in your browser only after the page tells you the time and memory it will take on your device (about 25 minutes in Chrome on a laptop, up to 6 GB) and you agree; it shows progress and a cancel button, and the result is kept in the browser. The offline Python scripts that first made it stay in `scripts/` as the reference the browser forge is tested against. 358 printed parts sized for a home printer, a mask that lifts on two micro servos, lit eyes, chest and palms. Joint ranges are measured by sweeping armour against armour.

It opens for real, and the film is the design: every mesh, hinge line and limit in it comes from the built example. The back splits on its centre line and the rear shells of the helmet and limbs swing out 80 degrees or more on hinges, each a revolute joint in the URDF on its own servo, with pinned hinges, servo pods, sprung latches that hold with no power, hand-release cords and a slipping clutch at each horn. Two PCA9685 boards and their own regulator drive 23 servos; the battery bay rides on one back door and its cables cross the hinge in a service loop. Door ranges are measured by exact intersection in the order the suit opens, and the sequence runs in simulation.

**Nothing has been built or tested, and a person must not get in on the strength of this design.** Clutch, latch and pinch figures are calculations with estimated inputs; the shell has no body model inside it and fits only a slim wearer; gloves and boots do not come on through the suit. [What must be checked first](../examples/14_iron_man_mark_43/README.md#before-anyone-gets-inside).

Fan work, not affiliated with or endorsed by the rights holders. See [NOTICE](../NOTICE.md).

<br clear="right">

## Quick start

**In the browser.** Open [megazron.github.io/text-to-robot](https://megazron.github.io/text-to-robot/), type a robot and press enter. Every download is built in the tab.

**On your machine.** You need Node.js 22.6 or newer.

```bash
git clone https://github.com/megazron/text-to-robot
cd text-to-robot
npm ci
node cli/src/index.ts "a 6 DOF arm with a gripper" -o out/arm
```

`out/arm/` now holds the ROS 2 package (`arm_6dof/`, with `urdf/arm_6dof.urdf` and `.urdf.xacro`), the spec `arm_6dof.json`, a simulation URDF, `meshes/`, `cad/` (print list, wiring table, `wiring.svg`, `schematic.svg` and `.pdf`, `breadboard.svg`), `training/` and `BOM.md`. The CLI also has `modify`, `bom`, `validate` and `inspect`; see `node cli/src/index.ts --help`.

**The app, locally.** `npm run api` serves the same web app and an HTTP API on http://localhost:8787. `docker compose up --build` does the same with persistent storage.

![The web app showing a generated 6-DOF arm](img/web/02_arm_6dof.png)

**Simulate it.** With Python 3.10 or newer:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e ./python
ttr-mujoco test out/arm/arm_6dof.sim.urdf --self-collision
ttr-mujoco convert out/arm/arm_6dof.sim.urdf -o out/arm/arm_6dof.mjcf.xml
```

## What you can ask for

```text
$ node cli/src/index.ts "a red 6 dof arm with 70 cm reach, a wrist camera and no lidar, lifting 1 kg, budget $600"
✓ Interpreted as: 6-DOF serial arm · parallel gripper · camera (wrist_rotator) · reach 0.70 m · red · payload 1 kg · budget $600
  ! warning: design check failed: wiring:rail:V48: power_supply gives 7.3 A continuous, 10.9 A peak; loads 7.725 A typical, 42.825 A peak ...
```

| Say | Effect |
|---|---|
| `6 DOF`, `seven-axis`, `3-link arm`, `60 cm reach`, `each link 25 cm`, `small` | arm size and joint count |
| `two 6 DOF arms`, `a pair of 4-axis arms`, `a 6 DOF and a 4 DOF arm`, `three arms on a table`, `dual arm torso` | several arms: a work cell on one plate, or a dual-arm torso |
| `2 robot arms on a mobile robot`, `an AGV with two arms`, `a 4 wheel rover with a 6 dof arm`, `a quadruped with an arm` | arms on a base, with its wheel count |
| `a 3 wheel robot`, `a tricycle robot`, `a six wheeled rover` | wheel count (casters counted) |
| `a heart emoji robot`, `a sneaker on wheels`, `looks like a teapot`, `a cartoon robot`, `steampunk` | the look: a printed shape shell over a wheeled robot |
| `a heart shaped robot arm`, `a cartoon robot dog`, `a star shaped hexapod`, `a heart shaped humanoid`, `🦄 drone` | the look on that robot: round an arm's base, over a legged body, on a humanoid's head and chest, a light canopy on a drone; the joints are swept and the legs, neck and props sized with it on |
| `🦄 robot`, `shaped like a banana`, `looks like a rocket`, any emoji | a shape the library does not have: that emoji's own outline (Twemoji), inflated like a cushion |
| `2 kg payload`, `budget $1500` | actuator sizing and BOM tier |
| `wrist camera`, `lidar on the front`, `no lidar`, `suction cup` | sensors and gripper, including negation |
| `robot dog`, `mobile manipulator`, `mecanum`, `hexapod`, `cobot` | template family |
| `called Atlas`, `painted blue`, `for a 1.85 m wearer` | name, colour, suit size (a Mark 43 is scaled as a whole; there is no body model) |
| `sleek`, `sci-fi`, `rugged`, `retro`, `industrial style`, `minimalist` | a design preset: its fairing silhouettes, details and palettes (sleek: wedge or dome, few lines, no vents; rugged: slab or cab, deep panel lines, vents, a bumper; retro: round lamps and a belt line in cream and teal...) |
| `steampunk`, `cute`, `cartoon`, `boxy` | a costume shell: a cube with rivets, a capsule with a big head and eyes |
| `no fairing`, `bare chassis` | the robot without its fairing |
| `surgical robot`, `laparoscopic robot with 4 arms`, `surgical arm with a scalpel`, `needle insertion robot`, `an endoscope holder` | the surgical robot: instrument arms and a camera arm on remote-centre mechanisms over a trainer box, or one arm with the tool named |
| `bulky`, `sleek`, `bigger shoulders`, `smooth panels`, `black and gold` | the Mark 43 armour itself: forged again with that build, pauldrons, panels or paint |

Every wheeled base, legged robot, arm, drone and humanoid gets a **designed look** of its own: a fairing silhouette (pod, wedge, cab, dome, slab or drum), a palette of a body colour, an accent and a dark trim, and printed details, chosen by what the prompt means (the same prompt always gives the same robot, different prompts different-looking ones; `tests/fidelity/design-look.test.ts` holds 100 prompts to that). A colour you name is the body colour; a robot made for a job (`a robot that waters my plants`) gets its job's own hue. The 24 gallery prompts, typed in as they are (and the gallery's jobs, said any way: `a robot to water my plants`), keep the gallery robots as they were designed, simulated and rendered. See [Designed looks](#designed-looks).

**Changing a robot** (the Modify box, or `text-to-robot modify`) edits the robot that is there. Small edits are made in place: `make it blue` changes colours and nothing else, `change the arm to 4 dof`, `add a camera`, `remove the gripper`, `carry 1 kg` re-size its parts. A change that needs another body re-plans it: `only 4 wheels`, `only 3 wheels`, `add an arm`, `remove one arm`, `make it look like a shoe`, `no shell`, `make it bigger` (a humanoid's height, an arm's reach) read the robot back into its plan (body, wheels, arms and joints, gripper, sensors, look, colour, payload, budget), change that, and design the robot again from it, so six wheels become four with the drive, wiring, power, BOM, URDF, CAD and firmware made for four. Every change is listed (`~ 6 wheels -> 4 wheels`, `~ colour -> red`), and what could not be done is said, never dropped. `undo` goes back one version; every version stays in the history. `tests/fidelity/modify.test.ts` runs chains of changes.

Every result shows **Here's what I understood**: the arms, joints per arm, base and wheels as built, anything asked for and not built said under them, and selects to change them and build again. What it cannot apply is listed as `not applied`, and contradictions (two robot types, two joint counts, two reaches) are each flagged as `conflict:`. A few requests are still dropped without a note (a slope or runtime target, a second colour or budget); the [launch audit](LAUNCH_AUDIT.md#bugs-remaining) lists them. A small German, French, Spanish, Hindi and Urdu keyword list (romanised Hindi too) covers the common robot words (`Roboterarm mit sechs Achsen und Greifer`, `छह पैरों वाला रोबोट`, `ایک روبوٹک بازو گرپر کے ساتھ`).

Families: 1-7 DOF arms (a larger count is built as 7 and says so), work cells of 2 to 4 arms and a dual-arm torso, SCARA, grippers, differential, four-wheel and mecanum bases, a rover with one or two arms, a three-wheel base, quadruped (with or without an arm on its back), hexapod, humanoid, character robots, a 5 in quadcopter, a tethered underwater ROV, a snake robot, a Cartesian gantry (pen plotter or tool plate), a delta robot, a five-finger tendon hand and a surgical robot (see [Surgical and healthcare robots](#surgical-and-healthcare-robots)). Each new family is sized from real parts like the others: thrust against weight for the drone, buoyancy and trim for the ROV, screw thrust and rod sag for the gantry, loop closures and ball-joint angles for the delta, tendon force for the hand.

Prompts that name no robot type are read in three steps, and the result says which one was used: the rules above; a knowledge table of tasks, objects, animals and named robots (`a robot that waters my plants`, `a toaster`, `a robot fish`, `R2-D2` read as its body plan); and, when no keyword matches, the closest table entry by meaning. Markup and scripts are removed before reading, a harmful request gets a safe robot with the harmful part left out, an impossible one the nearest real thing, nonsense or an empty prompt the general-purpose robot (each said), and words in Hindi, Urdu, Japanese and Chinese are read for the common robot terms.

On the website there are two reading options in **Create > How it reads**. **Smarter reading** is a small sentence model (all-MiniLM-L6-v2, about 30 MB with its runtime, served by this site and cached by the browser) that runs in the tab when the word table cannot place a prompt; it is on by default on devices with 4 or more cores and 4 GB or more of memory. Counts and structure never depend on it. **Your own model** takes an Anthropic key (`claude-opus-5-5` by default) or any OpenAI-compatible endpoint: the model writes a body plan as JSON, and the page checks it field by field and builds it from real parts like any other prompt. The key stays in that browser (this tab, or this device if *Remember on this device* is ticked) and goes only to the provider chosen; if the model fails, refuses or returns something unusable, the local parser designs the robot and the log says so. Every result starts with a *Designed by* line that names the path. [docs/OPEN_PROMPTS.md](OPEN_PROMPTS.md) has how 396 open prompts are answered.

## Designed looks

A robot should look designed, not like boxes on wheels, and still be a robot you can print and build. Every robot of the
kinds above wears a printed fairing, sized by proportion rules and fitted like any other part:

- **Proportions.** A wheeled body is 0.75 to 1.1 times its wheel's diameter tall over the deck (by silhouette), reaches past
  whatever stands at its nose, overhangs the deck a little and covers the bay's wall fixtures; a check (`look:proportion`)
  says where it landed. A wedge's nose and a cab's hood stand clear of what is under them, and a check (`look:covered`)
  says nothing on the deck stands through the roof. A legged body's fairing follows the body's length; an arm's base fairing stands round the
  pedestal under the turret and under anything the folded arm sweeps past (a check holds every joint's range); a humanoid wears a helmet; a drone a canopy over its pack.
- **Silhouettes.** Pod (soft and pillowed), wedge (a sloped nose), cab (a raised cabin), dome, slab (chamfered,
  industrial), truck (a cab at the nose and a load bed behind), buggy (a low tub under a roll cage), tower (a tall body that
  narrows upward), skate (a low deck with a spine) and drum (an arm's base), chosen per body kind: nine for a wheeled base. A LiDAR stands on a mast that lifts its scan plane over the
  fairing (`look:lidar_view` checks it sees all round).
- **Details, all printable.** On wheeled, legged and arm fairings, a 2.4 mm wall; panel lines and a belt line 1.2 mm wide and 0.9 mm deep (1.5 mm of wall
  left); vent slots through the flanks; a bumper rail on the skirt's nose; a light bar or two round lamps and a badge
  with the prompt chevron, each its own part in a 1.2 mm pocket (1.2 mm of wall behind it); a two-tone split: the upper
  body in the body colour, the skirt in the dark trim, and (but in the minimal look) an accent band over the seam, a ring of
  the wall printed in the accent. The light bar glows in the 3D view. Printed hub caps (a dish, five spokes or a turbine) on every wheel,
  in the accent. An arm's base fairing keeps to panel lines and vents in one colour (a folded wrist sweeps close by). No third-party logos.
- **Style details on wheeled bodies.** Each style word brings its own, printed with the fairing or as small parts: `rugged`
  a bull bar, a roof rack, wheel-arch flares and a grille; `industrial` an amber roof beacon, a rack and flares; `sci-fi`
  light strips along the flanks and tail fins; `retro` round lamps, tail fins and a grille; `sleek` stripes and nothing
  else; `minimalist` nothing at all. Every body but the minimal one has two red tail lamps. A robot that carries or delivers
  things gets a truck, a tower or a cab with a lid line and a handle on its roof (the fairing lifts off there to load it).
  Roof details stand under a LiDAR's scan plane: its mast is raised by their height. `cute` is still the older rounded
  character shell, not one of these presets.
- **Paint.** Panels 1.2 mm thick that lie on the fairing's surface, printed in the accent and bonded on: a centre stripe,
  twin stripes, a bonnet panel or flank panels, chosen with the look. A humanoid's helmet gets a dark visor with two lit
  eyes and a crest stripe; a drone's canopy a dark screen, a nose light and a stripe.
- **Palettes.** Fourteen, each named the way its filament is sold (arctic white, signal orange, graphite...). A colour you
  name is the body colour; the accent parts, the band, the badge and the hub caps keep the look's accent (silver or graphite
  when the accent is too close to the colour named), so a red arm is red and silver, not red all over; the parts
  list buys the filament per colour. The 3D view shows a fairing's paint as a satin coat under a rim light, with a soft shadow on the floor; printed structure as matte plastic, aluminium anodised, tyres as rubber
  and the light lenses lit.
- **Still a robot.** The fairing is cut 3 mm clear of every part and given windows for cameras, the switch and USB; its
  pieces are cut to the bed; its mass is in the drive, leg and flight sizing and the tipping checks; the joints are swept
  with it on. Shell pieces print upright on their open bottoms with supports under the roof (the flat-topped ones also
  upside down).

## How it works

1. **Read the prompt.** A local, rule-based parser picks a robot family and reads sizes, payload, budget, sensors, colour and parts. It is not a language model, so it runs offline and gives the same answer every time.
2. **Design from parts.** The design engine picks real motors, servos, boards and batteries for the loads, then builds the structure around them: cradles, bearings, housings, an electronics bay and the wiring.
3. **Check it.** Torque, speed, power, runtime, tipping, clearance and printability are computed and shown with their numbers. A request that cannot be met is still built, with a warning that names the failing check.
4. **Export it.** Every output is generated from one typed `RobotSpecification`: URDF and Xacro, ROS 2 and MoveIt, MuJoCo, STL, BOM, wiring and training scaffolds.

On the website the robot is shown as soon as it is designed and its 3D harness follows; the work runs in background workers
sized to your device (fewer on a phone or a small-memory laptop), the page stays usable, **Cancel** stops everything at once,
and results are kept in the browser, so a robot made before opens at once. Nothing about the robot changes with the device
or the cache: see [Performance](PERFORMANCE.md).

The same engine runs in the CLI, the local server and, compiled for the browser, the website. Other web pages can load it too, from `engine/v1/engine.js` on the website: see [Engine API](ENGINE_API.md). More in [Architecture](ARCHITECTURE.md) and [Design engine](DESIGN_ENGINE.md).

## Limits

- Nothing here has been built on a real bench yet. Printability is checked on the geometry, not in a slicer.
- Simulation is not proof. Every example passes the tests it has; what is not tested (mecanum strafing, free standing on the bipeds) is listed in its README.
- Some printed parts have known issues, each with its cause, in [Printability](PRINTABILITY.md).
- The parser covers the families above. Anything else is built as the nearest of them (the general-purpose arm when nothing in the prompt names a robot, a task or an object) and the result says so. A harmful request gets a safe robot with the harmful part left out, and the note says so.
- A custom Mark 43 shape is forged in the tab, which takes about 25 minutes and up to 6 GB of memory the first time; the page asks first. Its shells match the offline Python reference to within about 1 % in volume, with a few thin slivers joined to their neighbours instead of printed apart; hinge clearances are cut with each part's convex hull through its swing, a little more generous than the reference. Shape words outside the supported range are reported as `not applied`. A custom shape is checked like the reference suit, and not every shape passes: a bulkier build (1.12) forges, but four of its doors (the right back door, the right upper arm and both shins) meet other armour within a few degrees, and its door checks say so.
- Prices are estimates from the parts catalogue, and about half the electrical values (pinouts, currents) are estimated rather than taken from a datasheet. Each one is marked in [Parts data](PARTS_DATA.md). Check before you order or power anything.
