# Changelog

Dated from the git history. Pull request numbers refer to
[github.com/megazron/text-to-robot](https://github.com/megazron/text-to-robot/pulls).

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
