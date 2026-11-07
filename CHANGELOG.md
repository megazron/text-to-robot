# Changelog

Dated from the git history. Pull request numbers refer to
[github.com/megazron/text-to-robot](https://github.com/megazron/text-to-robot/pulls).

## 2026-11-07: Mark 43 forehead and neck

- The hole in the forehead is gone. The red wedge and the front of the crown now ride on the mask link and lift with it; before, they sat on the fixed
  shell and the mask's swing cut them away. The mask's pivot moved 12 mm forward of the ear disc, where the forehead and the back of the crown are the same
  distance from it, and the moving crown is forged to slide under the fixed shell, so almost nothing behind it is cut (0.2 cm3 instead of the whole front crown).
- The mask's seam is now a clean line drawn from the side, through the shell rather than along it: the ragged edge down the cheek is gone.
- The helmet's field is in true millimetres at the crown, where a 2.2 mm wall used to come out under 1 mm and break up.
- The collar's front lip gives way to the chin: the neck turns 69 degrees each way before its range is capped, up from 14.
- The mask's servo check now counts the head tipped 20 degrees, inertia and friction (0.106 N·m to hold against 0.129 continuous from two MG90S).

## 2026-11-07: Mark 43 housing and harness

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

## 2026-11-06: Real wiring and electronics compartments

- Every electrical part has dimensions and an electrical record (ports, pins, connector, voltage, typical and peak
  current), each value marked `datasheet` with a URL or `estimated` with the reason. See `docs/PARTS_DATA.md`.
- Wiring model: netlist per robot, gauge from current, fuses, main switch, star ground, power budget per rail, cables
  routed along the links with a slack loop at every joint. Output: `WIRING.md`, `wiring.svg`, real BOM lines instead of
  the 12 % guess, `wiring:*` checks.
- Compartments: no loose electronics. Printed tubs and hoods with screwed lids, standoffs on real hole patterns, vents,
  grommeted exits, USB and switch access, a bench control case with a fused mains inlet, `enclosure:*` checks.

## 2026-11-03: Fixes from a full audit (prompts, design engine, simulation)

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

## 2026-09-27: Prompt understanding

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

## 2026-09-20: Motion-path and joint audits (#10, #11, #12)

- `scripts/audit_motion_path.py` interpolates named joints together (at most 0.02 rad /
  2 mm per step) and records the exact failing pose and link pairs. Six reproducible
  paths cover the four arm examples and Mark 43 chest/neck and knees.
- Mark 43: neck and clamshell opening directions corrected; every one of the 86 limited
  joints audited (295 failing moving samples out of 1,119 poses); early chest-opening
  interference fixed.

## 2026-09-19: Local generation, rendered-geometry checks, example audit (#7, #8, #9)

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

## 2026-09-18: Physical fidelity and solid CAD

- Closed-solid mass properties, COM and full inertia tensors preserved through MuJoCo.
- CadQuery enclosure backend producing STEP base/lid solids from dimensioned board
  manifests; compound-convex collision exports.
- Mark 43 rebuilt in procedural polygon armour and reworked against visual references;
  MuJoCo GIF for every example.

## 2026-09-17: First release

- Prompt to typed robot specification to URDF/Xacro and a ROS 2 package.
- Budget-fitted bill of materials, CAD parts, training suite, character robots.
- MoveIt 2 and Gazebo export, native STL with printability report, share links.
- Python MuJoCo layer (`ttr-mujoco`): convert, test battery, render, train.
- Wearable exosuit simulated with a strapped-in mannequin; CI runs the battery.
