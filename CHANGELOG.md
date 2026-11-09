# Changelog

All notable changes to Text to Robot. Versions follow [Semantic Versioning](https://semver.org/); while the major version is 0, a minor version can change outputs and file layouts. Releases before 0.7.0 were not tagged, so their versions are assigned here from the git history. Pull request numbers refer to [github.com/megazron/text-to-robot](https://github.com/megazron/text-to-robot/pulls).

## Unreleased

- Build from my parts. Say what you have ("I have an Arduino Uno, 2 TT gear motors, an L298N ...", a pasted shopping list, a kit by name, Hinglish), or pick parts with counts in the new **My parts** panel of the Create pane. The parser reads counts ("2x", "pack of 4", "a pair of"), model names in any spelling, loose names ("small yellow motors", "a cheap ultrasonic sensor"), typos and AA or 18650 cells; nothing it cannot place is dropped (not recognised, with suggestions). The robots the list can build are ranked by how much of it each uses and how little it needs on top; the top three are cards with a thumbnail. The chosen one is designed with those exact parts: "you have it" / "to buy" on every parts list line, "What you still need to buy" with links and a total, wiring and power from the user's board, driver and battery, and honesty notes with numbers when they cannot do it safely (AA sag at stall, the L298N's 2 V drop, a USB port's 0.5 A).
- New designers for it: a car laid out for any board (Arduino Uno, Nano, Mega, ESP32, ESP32-CAM, Raspberry Pi 4, 5, Zero 2 W), driver (L298N, TB6612FNG, DRV8833, L9110S), battery and sensors (ultrasonic, ToF, a scanning servo head, IR line sensors, IR obstacle sensors, a Pi camera, Bluetooth, IMU, buzzer); an ultrasonic radar scanner; an eight-servo walker. The Arduino desk arm takes the user's servos, board, servo driver (or none) and battery.
- Generated programs: an Arduino sketch (AVR and ESP32) or a Pi script for every robot built from a parts list, with the pins the harness assigned (obstacle avoiding, line following, radar sweep, arm on serial commands, creep gait). Website: Files, Arduino sketch.
- 23 common hobby parts in the catalog with electrical records, each value from a datasheet or marked estimated with the reason: AA and 9 V batteries, a power bank, line, IR obstacle, ToF, PIR and IMU sensors, an OLED, HC-05, a buzzer, ESP32 DevKit V1, ESP32-CAM, Arduino Mega, Raspberry Pi 4 and Zero 2 W, DRV8833, L9110S, ULN2003 with the 28BYJ-48 stepper, and the MG995 servo.
- Engine API 1.1: `parseInventory(text)`, `searchParts(query)`, `fromParts(inventory, options)` and `firmware(robot)`; nothing in 1.0 changed.

- Circuit drawings for every robot, generated from its wiring record. `schematic.svg` and `schematic.pdf`: KiCad-style symbols (boards and modules with numbered, named pins; motors, servos, battery, fuse, switch, regulators, sensors), reference designators (A1, U1, M1, BT1, F1, SW1, J1; numbered in instance-name order, each shown with its part's name, the same in both drawings), every fuse in its lead (the main fuse and each branch fuse, F2 and on, under its record id), power symbols with each rail's voltage, ground symbols, net labels, orthogonal wires and a title block. `breadboard.svg`: drawings of the parts with labelled pins and every wire of the harness in its colour, pin to pin. Both are in every example, in the CAD download and on the website's new Circuit tab (Schematic, Breadboard, Wiring), with downloads under Files.
- A layout check fails on any overlapping symbol, label or text, any wire through a symbol and any two nets sharing a run; a test reads the connectivity back out of the schematic SVG alone and compares it with the wiring record for all 19 examples.
- `WIRING.md` adds battery runtime at typical and peak draw, heat in each regulator (switching and on-board linear) and a logic-level check of every signal (a 5 V output into a 3.3 V pin, a 3.3 V output under a 5 V threshold), each with its source. Logic levels are new, sourced fields in the parts' electrical records.
- Engine API v1 gains `schematic(robot)` and `breadboard(robot)`; nothing existing changed.
- New logo: a green speech bubble with a white robot arm (base, two links, ring joints, open gripper) cut out of it, shared with Robot Studio, which cuts the same arm out of a tile with selection corners. Wordmark in Sora Bold. All brand files in [docs/brand](docs/brand/README.md) are regenerated from one geometry, with favicon cuts drawn on their own 16 and 32 px grids, a light banner and a family sheet. The website's favicons, app icons, header mark, social card and Twitter card use it.
- The electronics and wiring in 3D. The 3D view has three modes: Robot, Electronics (the printed and bought shells turn to glass, the electronics and every wire stay solid) and Exploded (parts pulled apart along their board normals, wires stretched to them). Boards I use most have their real header layout from the datasheet (Arduino Nano and Uno, Raspberry Pi 5, PCA9685, TB6612FNG, ESP32-S3 DevKitC-1, HC-SR04, Pololu D36V50F regulator); every other part is drawn from its catalog body with its pins where its leads leave, and a board whose header points down plugs into the breadboard. Each wire is a tube of its gauge in its colour along its cable's route, with a connector at each pin, a slack loop at each joint it crosses, and corners rounded to the gauge's bend radius; it rides the links, so it follows the joint sliders. Hover a wire or pin for its net, ends, current and gauge; tap a wire to light its net end to end, in the schematic and breadboard view too; filter by rail. A Wiring 3D download (GLB) and `cad/electronics.glb` in the CAD package carry the same parts and wires.
- Harness checks at the home pose: wires through solid parts (ray-parity test against each printed part, a short run through a declared exit allowed), bends under the gauge's minimum radius (the WIRING table's flexing figure across joints, a new sourced fixed-installation figure, 3 x OD, elsewhere) and cut lengths that cannot reach. The site check runs them on every example; `examples/harness_check.json` records what they find today, and a test fails if a change makes any example worse.
- Engine API v1 gains `electronics3d(robot, { checks })` and `electronicsGlb(robot)`; nothing existing changed.
- A community blog, off until its server is deployed: **Share on the blog** shows exactly what will be posted and sends it only on **Post publicly**; a Community tab shows the posts as cards with an **Open this design** button. No login, email or IP address; a display name is optional. The server is a Cloudflare Worker on D1 in `community/` (Turnstile, a daily-salted connection hash for rate limits, a word filter, reports that hide a post, an owner's admin page, a private delete link per post). See [docs/COMMUNITY.md](docs/COMMUNITY.md) and [community/DEPLOY.md](community/DEPLOY.md).
- Motion for every robot (`packages/motion`). The 3D view has a Motion control: a joint tour (each joint through its full limits, the moving parts lit and the joint's name and angle shown, then all together) and a purpose demo picked from what the joints are for, not the family: pick and place for arms and SCARA, open and close for grippers, a drive with the wheels turning at the ground speed, a trot or tripod gait with planted feet, a step cycle and a wave for humanoids. Play, pause (the sliders take over at that pose), speed, loop and a time bar. Moves are minimum-jerk, timed from each actuator's rated speed and spare torque, and played back with spline interpolation.
- Every frame is checked for self-collision on the parts' real solids; frames that collide turn the parts red and are listed, never hidden. Two design findings came out of it, listed in `examples/motion_play_known_issues.json`: the 7 DOF arm's elbow can fold its forearm into the upper arm at its lower limit, and the rover's arm can reach its own camera mast.
- Move: drag the tool tip, a hand or a foot and the robot follows by inverse kinematics; drag any other part and its own joint turns; drag a legged body and it leans over planted feet, or walks there when it is too far; hold the ground under a wheeled robot and it drives there. Joints at a limit glow amber, a pose that would collide is refused and turns red, an unreachable target shows the closest pose and a dashed line. Reset, undo, named poses saved in the design, and Record, which turns a drag session into a clip.
- Downloads: the animation as a GIF (gifenc, MIT) or a video (MP4 or WebM), the joint CSV, a ROS 2 `trajectory_msgs/JointTrajectory`, BVH for bodies. The ROS 2 package carries the robot's motions in `motions/` with `scripts/replay_motion.py` (`ros2 launch <pkg> display.launch.py motion:=tour`); the training scaffold carries them as reference motions.
- The Mark 43 is labelled as a wearable: its limbs follow the wearer, only the doors are motorised. Suit-up and doors-only run the door servos in the designed order; human motion from motion capture (the Quaternius Universal Animation Library, CC0) walks, waves, squats, punches and holds the hover pose on the suit's joints, clamped to the suit's range of motion and saying where the person goes further. The Joints tab shows that range.
- Engine API v1 adds `motions(robot)`, `motion(robot, name, options)` and `ik(robot, link, target, options)` ([docs](docs/ENGINE_API.md#motions)).
- The Mark 43 no longer starts a long forge on one tap. The reference suit (the dial's "Suit" stop, the example chip and the film paint or a new paint) opens at once from the shipped pack, which is the forge's own output. A custom shape (build, pauldrons, panels) first shows the time and memory it will take on the visitor's device and is forged only if they agree, with progress and a cancel button. The engine API answers such a request with 409 and a reason until it is sent again with `forgeConsent: true`.
- A stated amount is never quietly clamped: "300% bigger shoulders" or "2x bigger shoulders" is built at the checked limit (1.20 of the film suit) and the result says what was asked and what was built.
- The website designs the Mark 43 armour itself. The field generator, the shell and bed-cell cutting, the pack steps (overlaps, mask relief, collar, joint swing trims), the door hardware (hinges, servo pods, drive arms, latches and their staged trims), the cable channels and bays, and the measured joint and door ranges now run in TypeScript (`packages/mesh/src/forge/`) in the page's worker, on manifold-3d with a small pool of helper workers. Nothing about the armour is fetched; a forged suit is kept in the browser.
- Prompt words change the armour: its build (`bulky`, `sleek`, `10 % bulkier`), the pauldrons (`bigger shoulders`), the panels (`smooth panels`, `heavy plates`) and the paint (`black and gold`, `silver joints`), as well as height, tier and budget. Out-of-range values are reported as `not applied`.
- `packages/parts/data/mark43_pack.*` is now the forge's own output for the reference suit, written by `scripts/forge_suit.ts`, a cache of what the website makes. The Python scripts (`scripts/forge_mark43.py`, `pack_armour.py`, `fit_doors.py`, `fit_wiring.py`) stay as the reference the forge is tested against (`tests/mark43-forge.test.ts`, `tests/fixtures/forge_oracle.json`).
- Against that reference: the same door hinge lines, joint limits, door ranges, opening sequence and staged trims; total shell volume within 1 %; 386 pieces against 392, where a few slivers the reference prints apart stay joined to their neighbours. Hinge clearances are cut with each part's convex hull through its swing, slightly more generous than the reference.
- The forge uses its own deterministic maths and fixed work splits, so a browser and Node make the same bytes: the site check forges the example suit live in the tab and every mesh and download equals the example. The first suit takes about 25 minutes in Chrome on a Windows laptop and up to 6 GB of memory; it is then kept in the browser. `?helpers=N` caps the helper workers.
- The README heading says the Mark 43 is designed to be worn and not yet built.

## 0.7.0 (2026-11-08)

A product identity and a full set of project documents.

- New logo: the prompt's `>` drawn as two links with a pin joint, and the cursor beneath it. App icon, horizontal lockup, light and one colour variants, README banner, social card, favicons and app icons, with a brand guide in [docs/brand](docs/brand/README.md).
- Website: the new logo in the header and as favicon, an app manifest with home screen icons, and Open Graph and Twitter card tags. The local server now serves `.png` and `.webmanifest` files with their types.
- README rewritten as a product page: value line, quick start, what you get, how it works, limits.
- New: [CONTRIBUTING](CONTRIBUTING.md), [SECURITY](SECURITY.md), [CODE_OF_CONDUCT](CODE_OF_CONDUCT.md) (Contributor Covenant 2.1), issue forms for bugs, features and robot requests, and a pull request template.
- Every `package.json` and the Python package carry the same version, description, homepage, repository, keywords and licence.
- CI checks that every relative link and image in the Markdown files resolves.

## 0.6.0 (2026-11-07)

Real wiring, a Mark 43 designed from scratch that opens on hinges, and studio films proven on the website.

### Mark 43 opens for real

- The opening is in the design now, not only in the film. The back splits on its centre line and the rear shells of the helmet, upper arms, forearms, thighs and
  shins are twelve doors, each a revolute joint in the URDF on its own servo, opening 80 degrees on hinge lines along the flanks.
- `scripts/fit_doors.py` makes the hardware from the finished shells: pinned hinge leaves, servo pods on the fixed halves with the output on the hinge line, drive
  arms, and 11 sprung latches (pawl, ledge, servo). It then sweeps every door against everything else with exact intersection, in the order the suit opens; the angles it reaches
  are the joint limits. Doors open a left and right pair at a time, forearms first, back and helmet last, right door before left on the centre seams.
- Torque per door comes from the spec's masses and inertias with the suit 10 degrees off plumb, pin friction and an estimated cable loop, at the 5 V rail: DS3218 on the back,
  MG996R on the limbs, MG90S on the helmet. New `door:*` checks cover range, torque, clutch and pinch force, latch strength and hand release.
- The compartment moved off the centre split: a battery bay on the left back door with its own 5 V door regulator, and a PCA9685 in a small bay in the hollow of the waist on each
  side, so no limb's servo lead crosses a door. The spine channel is gone; channels now run on the fixed halves and cables cross one hinge in a service loop sized from its real travel.
- A MuJoCo test runs the whole sequence open and shut. The suit-up film is rebuilt from the built example: same meshes, same hinge lines, same limits, same order, with a lofted figure in place of the capsules.
- Nothing has been built or tested. See "Before anyone gets inside" in the example's README.

### Mark 43 forehead and neck

- The hole in the forehead is gone. The red wedge and the front of the crown now ride on the mask link and lift with it; before, they sat on the fixed
  shell and the mask's swing cut them away. The mask's pivot moved 12 mm forward of the ear disc, where the forehead and the back of the crown are the same
  distance from it, and the moving crown is forged to slide under the fixed shell, so almost nothing behind it is cut (0.2 cm3 instead of the whole front crown).
- The mask's seam is now a clean line drawn from the side, through the shell rather than along it: the ragged edge down the cheek is gone.
- The helmet's field is in true millimetres at the crown, where a 2.2 mm wall used to come out under 1 mm and break up.
- The collar's front lip gives way to the chin: the neck turns 69 degrees each way before its range is capped, up from 14.
- The mask's servo check now counts the head tipped 20 degrees, inertia and friction (0.106 N·m to hold against 0.129 continuous from two MG90S).

### Mark 43 housing and harness

- The Mark 43 now has the same wiring model as every other robot: netlist, fuse, main switch, star ground, power budget
  per rail, `WIRING.md`, `wiring.svg`, BOM lines, `wiring:*` and `enclosure:*` checks, in all three tiers.
- The lumbar box is a real compartment: lid on four screws, standoffs, vents, USB and switch cut-outs, grommets in the floor
  over ports through the shell, seated on a saddle made from the torso's own back. The helmet alone gets the same case on a belt.
- Leads run inside the suit in printed channels bonded to the inner faces of the shells (`scripts/fit_wiring.py`): up the
  spine to the helmet, across the yoke and down each arm, round the neck to the chest ring. Nothing new shows on the outside
  except what is on the compartment; the shells keep their bytes, except the lumbar panel, which has four cable ports behind the compartment.
- The neck is a joint now (the helmet turns with the wearer, range measured by sweeping it against the collar), so the
  cables get a loop there. A second LM2596 runs the LED rings: servos stalled and rings at full white exceed one module.
- Harness gains channels, extra loop at a joint, a chosen exit per cable and a home for harness parts. Robots that declare
  none of these come out exactly as before.

### Mark 43 redesigned from scratch

- The suit no longer sits on a human body model or a scan. `scripts/forge_mark43.py` designs every part as a mathematical form from film references, with plates, panel lines and bevels added, and `scripts/pack_armour.py` trims and measures the shells into a pack (`packages/parts/data/mark43_pack.*`).
- New helmet. Renders and the suit-up film are made in Blender Cycles.

### Studio films, proof from the website

- `scripts/check_site.py` drives the static site in Chromium: every example prompt typed in, generated in the tab, its
  spec, meshes, URDF and download packages compared with the shipped example, Arduino mode pressed tier by tier. Runs in CI.
- Arduino mode no longer loses its tiers when the prompt itself says Arduino.
- `studio.gif` for every example: a motion loop run in MuJoCo through the real actuators (pick and place from IK, drive
  paths with feedback, gaits and squats on the free base), rendered in Cycles with the real harness routes.
- Rover: the differential bar is modelled (the right rocker was bolted to the body), so it now passes its turn on the spot.
- Turn test: mean yaw rate, not the rate at one instant. WALL-E's claim counts its tracks' torque limit.
- WALL-E rebuilt against film references: triangular treads round the drive wheels and a top idler, arms with shoulder and
  elbow servos and a gripping thumb, sad teardrop binocular eyes, grey band, hatch, name plate, weathered paint in the render.
  A second LM2596 feeds the arm servos. Baymax: a round belly.
- `scripts/check_motion.py`: every frame of every film, and with `--sweep` every joint across its range, intersected on the
  exact meshes. It found the rover's arm passing through its depth camera and deck, the rocker reaching the body, the
  Arduino claw swinging through its fixed jaw and arm wrists folding into their forearms; each is fixed in the design
  (limits from the swept clear range) or listed with a reason in `examples/motion_known_issues.json`. Runs in CI.
- Geometry cache keeps text, not live objects: on the site a cached part once came back with another part's inertia.

### Real wiring and electronics compartments

- Every electrical part has dimensions and an electrical record (ports, pins, connector, voltage, typical and peak
  current), each value marked `datasheet` with a URL or `estimated` with the reason. See `docs/PARTS_DATA.md`.
- Wiring model: netlist per robot, gauge from current, fuses, main switch, star ground, power budget per rail, cables
  routed along the links with a slack loop at every joint. Output: `WIRING.md`, `wiring.svg`, real BOM lines instead of
  the 12 % guess, `wiring:*` checks.
- Compartments: no loose electronics. Printed tubs and hoods with screwed lids, standoffs on real hole patterns, vents,
  grommeted exits, USB and switch access, a bench control case with a fused mains inlet, `enclosure:*` checks.

## 0.5.0 (2026-11-05)

Real parts, printable structure, a CAD kernel and Arduino mode.

- Hobby servo groundwork: open hardware references, SG90, MG90S, MG996R and DS3218 servos, Arduino Uno and Nano, PCA9685, cheap Arduino parts (TT gear motor, L298N, TB6612FNG, HC-SR04, WS2812 ring, 2S 18650 pack) and bench supplies.
- Printable redesign: clevis pitch joints with a 625ZZ bearing on an M5 boss, closed servo cradles, truss-lightened links, printed electronics enclosures, bed fit tried in every orientation on a Prusa MK4 bed, fabricated parts listed in `cad/fabricate` with a cut list. `scripts/print_audit.py` runs in CI with known issues listed and explained.
- CAD kernel on OpenCascade (Replicad): part programs built as exact solids with fillets, STEP export and welded, watertight print meshes.
- Arduino mode: priced tiers per prompt, budgets marked, honest notes. Designers for an Arduino car (cheapest 2WD from $28, stronger 4WD), an Arduino desk arm and an Arduino WALL-E. Named boards and drivers are used when asked, or swapped with the reason stated.
- Every example is a designed robot, rebuilt, re-simulated and audited. Exact-mesh clearance across every example.
- New web UI with an Arduino switch, price tier cards, cost and checks cards, and opt-in Publish to a gallery.
- A first wearable Mark 43 built body first, later replaced in 0.6.0.

### Fixes from a full audit (2026-11-03)

- Prompts: hobby-servo arms (`SG90`, `MG90S`, `MG996R`, `DS3218`, `arduino`, `hobby servo`) are designed on an
  Arduino Uno + PCA9685 with a 5 V supply; Hinglish (`jo 1 kg utha sake`, `char pahiye`, `robot kutta`); task-only
  prompts (`a robot that can water my plants`) pick a robot type and say why; `SCARA for pick and place` gets a
  suction cup; `6 dof arm with a suction cup` builds the designed arm with a cup (it built no tool before);
  template robots (humanoid, quadruped, hexapod...) scale to a stated height or size word; failed design checks
  are shown as warnings with a suggestion.
- Design engine: servos are sized with gravity in the arm's real mounting direction and with everything it
  carries counted once; 3S robots only use 12 V servo families (no 11.1 V XL430 on a 12.6 V pack); WALL-E's
  neck and battery placement, Baymax's arm load; excluded sensors (`no lidar`) are honoured by designed bases;
  passive rollers and caster balls get bearing-level friction (they used to brake a robot with ~15 N);
  claimed turn rates include skid-steer slip; WALL-E's track idlers are coupled to the drive wheel (URDF `mimic`).
- Simulation: speed is ramped at the design acceleration (it used to launch at ~4.7 m/s^2 and tip tall robots);
  mecanum families were tested as plain wheels; fixed-base robots crashed the generic test; template robots now
  record their family so the right tests run; turn drift is judged per full turn.
- Humanoid arms end at mid-thigh (hands used to touch the floor and hold the robot up in a squat).
- CI moved to the new example pipeline (`verify_examples.py`, `simulate_examples.py --check`); retired stale
  evidence from the old smoke battery.

## 0.4.0 (2026-10-20)

A design engine on real components, and the website on GitHub Pages.

- Design engine: a parts catalogue, CSG printed parts and load-based actuator sizing. Designers for arms, SCARA, parallel grippers, wheeled bases (differential, skid steer, mecanum, rocker-bogie rover), quadrupeds, hexapods, humanoids, a battle mech, WALL-E, EVA and Baymax.
- Arms sized for continuous holding, loaded speed and swung inertia. URDF mimic joints end to end.
- New example pipeline: `scripts/build_examples.ts` makes every deliverable from the prompt and `scripts/simulate_examples.py` runs the task tests, films them and writes the results.
- The CAD download for designed robots is a build package: printable STLs, print list, bought-part models, BOM and assembly order.
- The website is published on GitHub Pages and runs the whole generator in the browser (#16). WebGL fallback, an engineering report in the Build tab and a phone layout.
- Parser split into focused modules; reach, link count, multilingual and contradiction handling fixed; the CLI rejects ambiguous arguments; CI runs typecheck and lint and installs from a committed lockfile (#13).
- MuJoCo servo gains come from the URDF, and the actuator sweep tests the motors (#14). Datasheet-backed component library in `ttr_build.components`.

## 0.3.0 (2026-09-27)

Prompt understanding.

- Every request in a prompt is now applied, approximated with a named substitute, or
  reported as not applied; each result starts with a one-line reading of the prompt.
- Negation (`no lidar`, `neither lidar nor camera`, `no sensors except a camera`),
  units for reach and payload (`60 cm reach`, `lifts 10 lb`), budget phrasing
  (`1.5k budget`), wearer height for suits, names and colours.
- Modifications are split into clauses and each clause is applied or reported on its
  own (`make the upper arm 50% longer and the forearm 10% shorter`). Resized links keep
  collision geometry, mass and downstream joints in step.
- Drones, delta/gantry, snake and marine robots and dexterous hands are refused with a
  reason and an alternative instead of returning an unrelated arm.
- Hardened against adversarial prompts; names and quoted text never change features.
- Sensors are mounted on the body surface (lidars on top, cameras at the front or
  wrist, IMUs inside).

## 0.2.0 (2026-09-20)

Local generation, physical fidelity and audits.

### Motion-path and joint audits (#10, #11, #12)

- `scripts/audit_motion_path.py` interpolates named joints together (at most 0.02 rad /
  2 mm per step) and records the exact failing pose and link pairs. Six reproducible
  paths cover the four arm examples and Mark 43 chest/neck and knees.
- Mark 43: neck and clamshell opening directions corrected; every one of the 86 limited
  joints audited (295 failing moving samples out of 1,119 poses); early chest-opening
  interference fixed.

### Local generation, rendered-geometry checks, example audit (#7, #8, #9)

- Generation is local and deterministic. The earlier hosted-model adapters (#7) were
  removed in #8; no account, API key or inference provider is used. Three.js is vendored
  at install time, so the viewer makes no third-party requests.
- Hollow sheet chassis with mounting bores and vented lids; corrected planar and 6-axis
  arm layouts with visible joint hubs; closing gripper pads; ground-contact feet;
  six-axis humanoid legs; a supported EVA; passive mecanum rollers; swivel casters on the
  differential-drive robot. Wheel motors use velocity commands in MuJoCo, PyBullet and
  ROS configuration.
- The viewer waits for the actual mesh geometry before marking a preview ready, reports
  failed parts and offers retry. Browser validation compares rendered triangle counts with
  the served STL files.
- Serial-arm link blanks extend continuously between pivots, with compound collision
  cylinders. Four coordinated arm motion demos run through the effort-limited actuators.
- All 17 examples audited and re-exported with MoveIt configurations, GIFs, per-example
  READMEs, build-evidence inventories and training smoke checks.
- Component selection excludes limited-angle hobby servos from continuous wheel joints,
  reports linear forces in newtons, and uses the CubeMars AK80-64 rated (48 Nm) rather than
  peak torque.
- Pinned SO-101 simulation reference under `references/so101`.
- Mark 43: panel attachments, segmented fingers and neck articulation; torso, wrist, cuff
  and clamshell interference resolved; neutral surface intersections reduced from 81 to 0.

### Physical fidelity and solid CAD

- Closed-solid mass properties, COM and full inertia tensors preserved through MuJoCo.
- CadQuery enclosure backend producing STEP base/lid solids from dimensioned board
  manifests; compound-convex collision exports.
- Mark 43 rebuilt in procedural polygon armour and reworked against visual references;
  MuJoCo GIF for every example.

## 0.1.0 (2026-09-17)

First release.

- Prompt to typed robot specification to URDF/Xacro and a ROS 2 package.
- Budget-fitted bill of materials, CAD parts, training suite, character robots.
- MoveIt 2 and Gazebo export, native STL with printability report, share links.
- Python MuJoCo layer (`ttr-mujoco`): convert, test battery, render, train.
- Wearable exosuit simulated with a strapped-in mannequin; CI runs the battery.
