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
- ☐ Hobby ladder (SG90 → MG90S → MG996R → DS3218) chosen for small/cheap/Arduino prompts
- ☐ Real torque at the supply voltage, stall-current power budget, deadband and speed
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
