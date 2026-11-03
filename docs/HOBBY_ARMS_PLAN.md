# Hobby-servo arms: plan and progress

Goal: from a sentence, design a small Arduino + hobby-servo robot arm that a person can
actually print, wire, flash and run, and that behaves the same way in simulation.
Everything the generator outputs must be checked by a tool, not assumed.

Status key: ☐ todo · ◐ in progress · ☑ done (with the check that proves it)

## 1. Data and references
- ☐ `references/hardware/`: manifest of open designs (MeArm, EEZYbotARM, SO-ARM100/101,
  Koch, Menagerie models) with URL, licence, DOF, servos, reach. Only permissively
  licensed files are stored in the repo; NonCommercial ones are listed by URL only.
- ☐ Servo data with sources: SG90, MG90S, MG996R, DS3218 (torque at 4.8/6 V, speed,
  stall current, mass, case, tab holes, spline, horn screw).
- ☐ Electronics data: Arduino Uno R3 / Nano, PCA9685 board, buck converters, supplies,
  servo connectors and wire gauge.
- ☐ FDM mechanics data: ISO fastener sizes, heat-set inserts, clearance / press fits,
  bearings (623ZZ, 608ZZ).

## 2. Components (python/ttr_build → packages/parts)
- ☐ SG90, MG90S, MG996R, DS3218 with real case, tabs, output position and horns
- ☐ Arduino Uno R3, Nano, PCA9685 board, 5–6 V supply / buck, DC jack, switch
- ☐ Fasteners with lengths, inserts, bearings used by printed joints

## 3. Design engine
- ☑ Hobby ladder (SG90 → MG90S → MG996R → DS3218) chosen for SG90/MG996R/Arduino/hobby-servo prompts (named models restrict the choice); tests in prompt + design suites
- ◐ Rated (30 % stall) / peak torque, loaded speed, all-servo stall current vs the 5 V 10 A supply; deadband and voltage-dependent torque still to do
- ☐ Horn couplers for cross/disc horns, bearing-supported joints opposite the horn
- ☐ Base housing for Arduino + driver + power with cable channels and strain relief

## 4. Firmware
- ☐ Generated Arduino sketch (Servo.h direct or PCA9685), calibration offsets, joint
  limits, smooth moves, serial command protocol; compiled with arduino-cli in tests

## 5. Verification (every design, automatically)
- ☐ Slice every printed part with PrusaSlicer CLI: success, time, filament
- ☐ DFM: wall thickness, overhangs vs print orientation, fit clearances to bought parts,
  fastener length and thread engagement
- ☐ Interference swept over the joint ranges, not only the home pose
- ☐ MuJoCo with the hobby-servo model; task tests pass with margin
- ☐ Compare against the open reference arms (reach, torque margins, mass)

## 6. Test matrix
- ☐ 3–6 DOF × each servo class × payloads × reaches, all generated and verified in CI

## Session log
- 2026-10-27: mapped the codebase; backed up the unpushed `rebuild/real-parts` branch;
  installed arduino-cli (Uno/Nano core, Servo + PCA9685 libs) and PrusaSlicer CLI for checks.
- 2026-11-03: full audit of the live site and branch. Hobby ladder + Arduino/PCA9685/5 V supply wired into the arm
  designer and the prompt reader; failing design checks surfaced as warnings. Fixed mounted-arm sizing, 3S voltage,
  caster friction, turn claims, track coupling, humanoid proportions, template scaling; CI moved to
  verify_examples.py + simulate_examples.py --check. Next here: servo cradles/horn couplers for hobby servos, firmware.
