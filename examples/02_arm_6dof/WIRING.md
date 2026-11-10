# Wiring: arm_6dof

9 cables, 25 conductors, 9.16 m of wire, wiring parts $10.37.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBUS | 12 | power_supply | 6 / 6.6 | 2.1 / 6.25 | 2.9x | - | 0.208 |

**VBUS loads** (peak assumes two joints at peak at once, the rest at half load):

| Load | Typical A | Peak A |
|---|--:|--:|
| base_yaw_actuator | 2.1 | 6.25 |

## Protection

- Main switch: **mains_inlet** breaks the positive feed after the fuse. Ground is never switched.
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | MAINS_L | mains_inlet.L | power_supply.AC/L | 24 | red | 1 | 2 |
| C1 | W2 | MAINS_N | mains_inlet.N | power_supply.AC/N | 24 | red | 1 | 2 |
| C1 | W3 | MAINS_E | mains_inlet.E | power_supply.FG | 24 | red | 1 | 2 |
| C2 | W4 | BUS_SERVO_BUS | servo_bus.DATA | base_yaw_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C2 | W5 | GND | servo_bus.GND | base_yaw_actuator.GND | 24 | black | 0.05 | 0.05 |
| C3 | W6 | VBUS | base_yaw_actuator.VDD | shoulder_pitch_actuator.VDD | 20 | red | 1.9 | 6.05 |
| C3 | W7 | GND | base_yaw_actuator.GND | shoulder_pitch_actuator.GND | 20 | black | 1.9 | 6.05 |
| C3 | W8 | BUS_SERVO_BUS | base_yaw_actuator.DATA | shoulder_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C4 | W9 | VBUS | shoulder_pitch_actuator.VDD | elbow_pitch_actuator.VDD | 22 | red | 1.15 | 3.1 |
| C4 | W10 | GND | shoulder_pitch_actuator.GND | elbow_pitch_actuator.GND | 22 | black | 1.15 | 3.1 |
| C4 | W11 | BUS_SERVO_BUS | shoulder_pitch_actuator.DATA | elbow_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C5 | W12 | VBUS | elbow_pitch_actuator.VDD | forearm_roll_actuator.VDD | 24 | red | 0.8 | 1.9 |
| C5 | W13 | GND | elbow_pitch_actuator.GND | forearm_roll_actuator.GND | 24 | black | 0.8 | 1.9 |
| C5 | W14 | BUS_SERVO_BUS | elbow_pitch_actuator.DATA | forearm_roll_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C6 | W15 | VBUS | forearm_roll_actuator.VDD | wrist_pitch_actuator.VDD | 24 | red | 0.6 | 1.7 |
| C6 | W16 | GND | forearm_roll_actuator.GND | wrist_pitch_actuator.GND | 24 | black | 0.6 | 1.7 |
| C6 | W17 | BUS_SERVO_BUS | forearm_roll_actuator.DATA | wrist_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C7 | W18 | VBUS | wrist_pitch_actuator.VDD | wrist_roll_actuator.VDD | 24 | red | 0.4 | 1.5 |
| C7 | W19 | GND | wrist_pitch_actuator.GND | wrist_roll_actuator.GND | 24 | black | 0.4 | 1.5 |
| C7 | W20 | BUS_SERVO_BUS | wrist_pitch_actuator.DATA | wrist_roll_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C8 | W21 | VBUS | wrist_roll_actuator.VDD | gripper_actuator.VDD | 24 | red | 0.2 | 1.3 |
| C8 | W22 | GND | wrist_roll_actuator.GND | gripper_actuator.GND | 24 | black | 0.2 | 1.3 |
| C8 | W23 | BUS_SERVO_BUS | wrist_roll_actuator.DATA | gripper_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C9 | W24 | VBUS | power_supply.DC OUTPUT +V | base_yaw_actuator.VDD | 20 | red | 2.1 | 6.25 |
| C9 | W25 | GND | power_supply.DC OUTPUT -V | base_yaw_actuator.GND | 18 | black | 2.1 | 6.25 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | mains inlet to the supply (crimped, insulated spades; earth first) | 3 | 185 | 80.5 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / barrier screw terminal | - |
| C2 | servo_bus to base_yaw_actuator | 2 | 905 | 804.9 | 40 | 0 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | control_case.harness |
| C3 | base_yaw_actuator to shoulder_pitch_actuator | 3 | 275 | 92.1 | 40 | 80 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C4 | shoulder_pitch_actuator to elbow_pitch_actuator | 3 | 325 | 156.4 | 40 | 65 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C5 | elbow_pitch_actuator to forearm_roll_actuator | 3 | 295 | 129.6 | 40 | 65 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C6 | forearm_roll_actuator to wrist_pitch_actuator | 3 | 265 | 84.4 | 40 | 80 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C7 | wrist_pitch_actuator to wrist_roll_actuator | 3 | 285 | 110.6 | 40 | 70 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C8 | wrist_roll_actuator to gripper_actuator | 3 | 265 | 84.4 | 40 | 80 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C9 | VBUS to base_yaw_actuator | 2 | 835 | 733.9 | 40 | 0 | 60 | barrier screw terminal / JST B3B-EH-A header | control_case.harness |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C3 | base_yaw | -2.97 to 2.97 | 23.1 | 63.5 | 80 |
| C4 | shoulder_pitch | -1.75 to 1.75 | 48.5 | 75.3 | 65 |
| C5 | elbow_pitch | -2.1 to 2.3 | 42.3 | 71.1 | 65 |
| C6 | forearm_roll | -2.97 to 2.97 | 23.1 | 63.5 | 80 |
| C7 | wrist_pitch | -1.7 to 2.3 | 41.7 | 73.3 | 70 |
| C8 | wrist_roll | -2.97 to 2.97 | 23.1 | 63.5 | 80 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Mains supply

| Supply | Rail | Rated A | Typical A | Peak A | Load at typical |
|---|---|--:|--:|--:|--:|
| power_supply (Mean Well LRS-75-12 enclosed PSU, 12 V 6 A) | VBUS 12 V | 6 | 2.1 | 6.25 | 35 % |

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| BUS_SERVO_BUS | M1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M1 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M1 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M4 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M4 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M4 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M4 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M4 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M7 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M7 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M7 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M7 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M7 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M7 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M7 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M7 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M7 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M7 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |

Not checked (no logic levels in the parts data): DYNAMIXEL XH540-W270-T(R), DYNAMIXEL XL430-W250-T, DYNAMIXEL XM430-W350-T(R), ROBOTIS U2D2 USB to TTL/RS-485 interface.

### Sources

| Input | Source |
|---|---|
| Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) output | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 18 AWG silicone wire | 1 | m | 0.7 | 0.70 | 0.823 mm2, rated 8 A in a bundle; 0.83 m cut + 10 % waste | estimated |
| 20 AWG silicone wire | 1.6 | m | 0.5 | 0.80 | 0.519 mm2, rated 5.5 A in a bundle; 1.39 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 0.8 | m | 0.4 | 0.32 | 0.327 mm2, rated 3.5 A in a bundle; 0.65 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 4.1 | m | 0.35 | 1.43 | 0.205 mm2, rated 1.75 A in a bundle; 3.68 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 2.9 | m | 0.3 | 0.87 | 0.128 mm2, rated 1.1 A in a bundle; 2.62 m cut + 10 % waste | estimated |
| 6.3 mm spade contacts | 3 | pc | 0.08 | 0.24 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 5 | pc | 0.03 | 0.15 | rated 17.5 A per contact | estimated |
| JST EH 2.5 mm contacts | 42 | pc | 0.03 | 1.26 | rated 3 A per contact | estimated |
| JST EH 2.5 mm housings | 15 | pc | 0.05 | 0.75 | one per cable end | estimated |
| Heat shrink 3 mm, 2:1 | 0.6 | m | 0.2 | 0.12 | 0 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 16 | pc | 0.02 | 0.32 | at every clip, cable end and strain-relief anchor | estimated |
| PG7 cable gland | 1 | pc | 2.97 | 2.97 | cable exit with strain relief | estimated |
| Nylon braided sleeving 6 mm | 1.1 | m | 0.4 | 0.44 | over every cable where it crosses a joint | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| ROBOTIS U2D2 USB to TTL/RS-485 interface | estimated | estimated | estimated | [datasheet](https://emanual.robotis.com/docs/en/parts/interface/u2d2/) |
| DYNAMIXEL XH540-W270-T(R) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) |
| DYNAMIXEL XL430-W250-T | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl430-w250/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl430-w250/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl430-w250/) |
| DYNAMIXEL XM430-W350-T(R) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/) |
| IEC C14 panel inlet with fuse drawer and rocker switch, 10 A | estimated | estimated | estimated | estimated |
| Mean Well LRS-75-12 enclosed PSU, 12 V 6 A | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) |

## Notes

- Mains side: IEC inlet to the supply's AC terminals with insulated spades, earth wired first, case closed before plugging in. Have it checked if you are not qualified to wire mains.
- clips on upper_arm not printed: mass properties require a closed manifold mesh
