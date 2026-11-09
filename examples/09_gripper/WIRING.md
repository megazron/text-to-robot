# Wiring: parallel_gripper

3 cables, 8 conductors, 2.35 m of wire, wiring parts $4.95.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBUS | 12 | power_supply | 6 / 6.6 | 0.45 / 2.7 | 13.3x | - | 0.126 |

**VBUS loads** (peak assumes every load at its peak at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| servo_bus | 0.45 | 2.7 |

## Protection

- Main switch: **mains_inlet** breaks the positive feed after the fuse. Ground is never switched.
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | MAINS_L | mains_inlet.L | power_supply.AC/L | 24 | red | 1 | 2 |
| C1 | W2 | MAINS_N | mains_inlet.N | power_supply.AC/N | 24 | red | 1 | 2 |
| C1 | W3 | MAINS_E | mains_inlet.E | power_supply.FG | 24 | red | 1 | 2 |
| C2 | W4 | BUS_SERVO_BUS | servo_bus.SIG | gripper_servo.DATA | 26 | yellow | 0.02 | 0.02 |
| C2 | W5 | GND | servo_bus.GND | gripper_servo.GND | 24 | black | 0.05 | 0.05 |
| C2 | W6 | VBUS | servo_bus.VIN | gripper_servo.VCC | 24 | red | 0.45 | 2.7 |
| C3 | W7 | VBUS | power_supply.DC OUTPUT +V | servo_bus.VIN | 24 | red | 0.45 | 2.7 |
| C3 | W8 | GND | power_supply.DC OUTPUT -V | servo_bus.GND | 24 | black | 0.45 | 2.7 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | mains inlet to the supply (crimped, insulated spades; earth first) | 3 | 185 | 80.5 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / barrier screw terminal | - |
| C2 | servo_bus to gripper_servo | 3 | 465 | 360.2 | 40 | 0 | 60 | 3-pin 2.5 mm bus servo header (5264 class) / Feetech 5264-3P | control_case.harness |
| C3 | VBUS to servo_bus | 2 | 200 | 99.1 | 40 | 0 | 60 | barrier screw terminal / green screw terminal | - |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Mains supply

| Supply | Rail | Rated A | Typical A | Peak A | Load at typical |
|---|---|--:|--:|--:|--:|
| power_supply (Mean Well LRS-75-12 enclosed PSU, 12 V 6 A) | VBUS 12 V | 6 | 0.45 | 2.7 | 7.5 % |

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| BUS_SERVO_BUS | M1 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U1 SIG | M1 DATA | - | - | - | not checked: no published logic levels for one side |

Not checked (no logic levels in the parts data): Feetech STS3215 C047 12 V 30 kg.cm (1:345), Waveshare Bus Servo Adapter (A).

### Sources

| Input | Source |
|---|---|
| Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) output | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 24 AWG silicone wire | 2.1 | m | 0.35 | 0.73 | 0.205 mm2, rated 1.75 A in a bundle; 1.89 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 0.6 | m | 0.3 | 0.18 | 0.128 mm2, rated 1.1 A in a bundle; 0.47 m cut + 10 % waste | estimated |
| 6.3 mm spade contacts | 3 | pc | 0.08 | 0.24 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 7 | pc | 0.03 | 0.21 | rated 17.5 A per contact | estimated |
| Molex 5264 contacts | 6 | pc | 0.05 | 0.30 | rated 3 A per contact | estimated |
| Molex 5264 housings | 2 | pc | 0.08 | 0.16 | one per cable end | estimated |
| Heat shrink 3 mm, 2:1 | 0.2 | m | 0.2 | 0.04 | 0 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 6 | pc | 0.02 | 0.12 | at every clip, cable end and strain-relief anchor | estimated |
| PG7 cable gland | 1 | pc | 2.97 | 2.97 | cable exit with strain relief | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Feetech STS3215 C047 12 V 30 kg.cm | [datasheet](https://files.seeedstudio.com/Bazaar/product_pdf/108090003.pdf) | estimated | [datasheet](https://files.waveshare.com/wiki/Bus-Servo-Adapter-(A)/Bus%20Servo%20Adapter%20(A)-Sch.pdf) | estimated |
| IEC C14 panel inlet with fuse drawer and rocker switch, 10 A | estimated | estimated | estimated | estimated |
| Mean Well LRS-75-12 enclosed PSU, 12 V 6 A | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) |
| Waveshare Bus Servo Adapter | [datasheet](https://www.waveshare.com/bus-servo-adapter-a.htm) | estimated | estimated | [datasheet](https://www.waveshare.com/wiki/Bus_Servo_Adapter_(A)) |

## Notes

- Mains side: IEC inlet to the supply's AC terminals with insulated spades, earth wired first, case closed before plugging in. Have it checked if you are not qualified to wire mains.
