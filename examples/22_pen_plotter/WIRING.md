# Wiring: cartesian_gantry

19 cables, 47 conductors, 20.52 m of wire, wiring parts $14.54.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| V24 | 24 | power_supply | 6.5 / 7.1 | 3.6 / 6 | 1.8x | - | 0.096 |
| 3V3 | 3.3 | controller | 0.5 / 0.6 | 0.015 / 0.06 | 33.3x | - | 0.002 |

**V24 loads** (peak assumes all three steppers at full current):

| Load | Typical A | Peak A |
|---|--:|--:|
| driver_x | 1.2 | 2 |
| driver_y | 1.2 | 2 |
| driver_z | 1.2 | 2 |

**3V3 loads** (peak assumes every load at its peak at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| x_endstop | 0.005 | 0.02 |
| y_endstop | 0.005 | 0.02 |
| z_endstop | 0.005 | 0.02 |

## Protection

- Main switch: **mains_inlet** breaks the positive feed after the fuse. Ground is never switched.
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | MAINS_L | mains_inlet.L | power_supply.AC/L | 24 | red | 1 | 2 |
| C1 | W2 | MAINS_N | mains_inlet.N | power_supply.AC/N | 24 | red | 1 | 2 |
| C1 | W3 | MAINS_E | mains_inlet.E | power_supply.FG | 24 | red | 1 | 2 |
| C2 | W4 | X_VIO | controller.3V3 | driver_x.VIO | 24 | red | 0.02 | 0.02 |
| C2 | W5 | X_STEP | controller.4 | driver_x.STEP | 26 | blue | 0.02 | 0.02 |
| C2 | W6 | X_DIR | controller.5 | driver_x.DIR | 26 | blue | 0.02 | 0.02 |
| C2 | W7 | X_EN | controller.6 | driver_x.EN | 26 | blue | 0.02 | 0.02 |
| C2 | W8 | GND | controller.G | driver_x.GND | 24 | black | 0.02 | 0.02 |
| C3 | W9 | X_M1A | driver_x.M1A | x_motor.A (black) | 22 | orange | 1.2 | 2 |
| C3 | W10 | X_M1B | driver_x.M1B | x_motor.A\ (green) | 22 | orange | 1.2 | 2 |
| C3 | W11 | X_M2A | driver_x.M2A | x_motor.B (red) | 22 | orange | 1.2 | 2 |
| C3 | W12 | X_M2B | driver_x.M2B | x_motor.B\ (blue) | 22 | orange | 1.2 | 2 |
| C4 | W13 | X_HOME | x_endstop.SIG | controller.10 | 26 | blue | 0.02 | 0.02 |
| C5 | W14 | Y_VIO | controller.3V3 | driver_y.VIO | 24 | red | 0.02 | 0.02 |
| C5 | W15 | Y_STEP | controller.7 | driver_y.STEP | 26 | blue | 0.02 | 0.02 |
| C5 | W16 | Y_DIR | controller.15 | driver_y.DIR | 26 | blue | 0.02 | 0.02 |
| C5 | W17 | Y_EN | controller.16 | driver_y.EN | 26 | blue | 0.02 | 0.02 |
| C6 | W18 | Y_M1A | driver_y.M1A | y_motor.A (black) | 24 | orange | 1.2 | 2 |
| C6 | W19 | Y_M1B | driver_y.M1B | y_motor.A\ (green) | 24 | orange | 1.2 | 2 |
| C6 | W20 | Y_M2A | driver_y.M2A | y_motor.B (red) | 24 | orange | 1.2 | 2 |
| C6 | W21 | Y_M2B | driver_y.M2B | y_motor.B\ (blue) | 24 | orange | 1.2 | 2 |
| C7 | W22 | Y_HOME | y_endstop.SIG | controller.11 | 26 | blue | 0.02 | 0.02 |
| C8 | W23 | Z_VIO | controller.3V3 | driver_z.VIO | 24 | red | 0.02 | 0.02 |
| C8 | W24 | Z_STEP | controller.17 | driver_z.STEP | 26 | blue | 0.02 | 0.02 |
| C8 | W25 | Z_DIR | controller.18 | driver_z.DIR | 26 | blue | 0.02 | 0.02 |
| C8 | W26 | Z_EN | controller.8 | driver_z.EN | 26 | blue | 0.02 | 0.02 |
| C9 | W27 | Z_M1A | driver_z.M1A | z_motor.A (black) | 22 | orange | 1.2 | 2 |
| C9 | W28 | Z_M1B | driver_z.M1B | z_motor.A\ (green) | 22 | orange | 1.2 | 2 |
| C9 | W29 | Z_M2A | driver_z.M2A | z_motor.B (red) | 22 | orange | 1.2 | 2 |
| C9 | W30 | Z_M2B | driver_z.M2B | z_motor.B\ (blue) | 22 | orange | 1.2 | 2 |
| C10 | W31 | Z_HOME | z_endstop.SIG | controller.12 | 26 | blue | 0.02 | 0.02 |
| C11 | W32 | GND | power_supply.DC OUTPUT -V | star_ground.P1 | 20 | black | 3.6 | 6 |
| C12 | W33 | V24 | power_supply.DC OUTPUT +V | splice_v24.P1 | 20 | red | 3.6 | 6 |
| C13 | W34 | V24 | splice_v24.P2 | driver_x.VM | 24 | red | 1.2 | 2 |
| C13 | W35 | GND | star_ground.P2 | driver_x.GND | 24 | black | 1.2 | 2 |
| C14 | W36 | V24 | splice_v24.P2 | driver_y.VM | 24 | red | 1.2 | 2 |
| C14 | W37 | GND | star_ground.P2 | driver_y.GND | 24 | black | 1.2 | 2 |
| C15 | W38 | V24 | splice_v24.P2 | driver_z.VM | 24 | red | 1.2 | 2 |
| C15 | W39 | GND | star_ground.P2 | driver_z.GND | 24 | black | 1.2 | 2 |
| C16 | W40 | 3V3 | controller.3V3 | splice_3v3.P1 | 24 | red | 0.015 | 0.06 |
| C16 | W41 | GND | controller.G | star_ground.P2 | 24 | black | 0.015 | 0.06 |
| C17 | W42 | 3V3 | splice_3v3.P2 | x_endstop.VCC | 24 | red | 0.005 | 0.02 |
| C17 | W43 | GND | star_ground.P2 | x_endstop.GND | 24 | black | 0.005 | 0.02 |
| C18 | W44 | 3V3 | splice_3v3.P2 | y_endstop.VCC | 24 | red | 0.005 | 0.02 |
| C18 | W45 | GND | star_ground.P2 | y_endstop.GND | 24 | black | 0.005 | 0.02 |
| C19 | W46 | 3V3 | splice_3v3.P2 | z_endstop.VCC | 24 | red | 0.005 | 0.02 |
| C19 | W47 | GND | star_ground.P2 | z_endstop.GND | 24 | black | 0.005 | 0.02 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | mains inlet to the supply (crimped, insulated spades; earth first) | 3 | 160 | 58.2 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / barrier screw terminal | - |
| C2 | controller to driver_x | 5 | 200 | 97.4 | 40 | 0 | 60 | 22-pin male header / same header | - |
| C3 | driver_x to x_motor | 4 | 670 | 529.2 | 40 | 40 | 60 | 2.54 mm pin header / Harwin-type 2.54 mm 4-pin housing on the end of a 1000 mm cable | control_case.harness |
| C4 | x_endstop to controller | 1 | 730 | 611.7 | 40 | 15 | 60 | 3-pin JST-XH / 22-pin male header | control_case.harness |
| C5 | controller to driver_y | 4 | 205 | 101.7 | 40 | 0 | 60 | 22-pin male header / same header | - |
| C6 | driver_y to y_motor | 4 | 490 | 387.8 | 40 | 0 | 60 | 2.54 mm pin header / Harwin-type 2.54 mm 4-pin housing on the end of a 1000 mm cable | control_case.harness |
| C7 | y_endstop to controller | 1 | 520 | 416.6 | 40 | 0 | 60 | 3-pin JST-XH / 22-pin male header | control_case.harness |
| C8 | controller to driver_z | 4 | 360 | 258.8 | 40 | 0 | 60 | 22-pin male header / same header | - |
| C9 | driver_z to z_motor | 4 | 825 | 643.3 | 40 | 80 | 60 | 2.54 mm pin header / Harwin-type 2.54 mm 4-pin housing on the end of a 1000 mm cable | control_case.harness |
| C10 | z_endstop to controller | 1 | 695 | 560.1 | 40 | 30 | 60 | 3-pin JST-XH / 22-pin male header | control_case.harness |
| C11 | battery negative to star ground | 1 | 290 | 186.8 | 40 | 0 | 60 | barrier screw terminal / lever clamp | - |
| C12 | power_supply to the V24 splice | 1 | 320 | 215.6 | 40 | 0 | 60 | barrier screw terminal / lever clamp | - |
| C13 | V24 to driver_x | 2 | 260 | 156.4 | 40 | 0 | 60 | lever clamp / same header | - |
| C14 | V24 to driver_y | 2 | 240 | 138.3 | 40 | 0 | 60 | lever clamp / same header | - |
| C15 | V24 to driver_z | 2 | 185 | 83.6 | 40 | 0 | 60 | lever clamp / same header | - |
| C16 | controller to the 3V3 splice | 2 | 250 | 148.9 | 40 | 0 | 60 | 22-pin male header / lever clamp | - |
| C17 | 3V3 to x_endstop | 2 | 775 | 641.9 | 40 | 30 | 60 | lever clamp / 3-pin JST-XH | control_case.harness |
| C18 | 3V3 to y_endstop | 2 | 595 | 491.9 | 40 | 0 | 60 | lever clamp / 3-pin JST-XH | control_case.harness |
| C19 | 3V3 to z_endstop | 2 | 835 | 676.6 | 40 | 55 | 60 | lever clamp / 3-pin JST-XH | control_case.harness |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C3 | y_axis | 0 to 0.183 | 39.5 | 39.6 | 40 |
| C4 | y_axis | 0 to 0.183 | 29 | 29 | 15 |
| C9 | y_axis | 0 to 0.183 | 30.9 | 31 | 40 |
| C9 | x_axis | 0 to 0.183 | 31.2 | 31.2 | 40 |
| C10 | x_axis | 0 to 0.183 | 29 | 29 | 15 |
| C10 | y_axis | 0 to 0.183 | 29 | 29.1 | 15 |
| C17 | y_axis | 0 to 0.183 | 32.9 | 32.9 | 30 |
| C19 | y_axis | 0 to 0.183 | 32.4 | 32.4 | 25 |
| C19 | x_axis | 0 to 0.183 | 32.9 | 33.1 | 30 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Mains supply

| Supply | Rail | Rated A | Typical A | Peak A | Load at typical |
|---|---|--:|--:|--:|--:|
| power_supply (Mean Well LRS-150-24 enclosed PSU, 24 V 6.5 A) | V24 24 V | 6.5 | 3.6 | 6 | 55.38 % |

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| X_DIR | A1 5 | U1 DIR | 3.3 | 2.31 | 5.5 | ok |
| X_EN | A1 6 | U1 EN | 3.3 | 2.31 | 5.5 | ok |
| X_HOME | U4 SIG | A1 10 | - | 2.475 | 3.6 | not checked: no published logic levels for one side |
| X_STEP | A1 4 | U1 STEP | 3.3 | 2.31 | 5.5 | ok |
| Y_DIR | A1 15 | U2 DIR | 3.3 | 2.31 | 5.5 | ok |
| Y_EN | A1 16 | U2 EN | 3.3 | 2.31 | 5.5 | ok |
| Y_HOME | U5 SIG | A1 11 | - | 2.475 | 3.6 | not checked: no published logic levels for one side |
| Y_STEP | A1 7 | U2 STEP | 3.3 | 2.31 | 5.5 | ok |
| Z_DIR | A1 18 | U3 DIR | 3.3 | 2.31 | 5.5 | ok |
| Z_EN | A1 8 | U3 EN | 3.3 | 2.31 | 5.5 | ok |
| Z_HOME | U6 SIG | A1 12 | - | 2.475 | 3.6 | not checked: no published logic levels for one side |
| Z_STEP | A1 17 | U3 STEP | 3.3 | 2.31 | 5.5 | ok |

Not checked (no logic levels in the parts data): Mechanical end stop, microswitch on a small board, 3-pin.

### Sources

| Input | Source |
|---|---|
| Mean Well LRS-150-24 enclosed PSU, 24 V 6.5 A (156 W) output | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-150/LRS-150-SPEC.PDF) |
| Espressif ESP32-S3-DevKitC-1 (N8R8) logic levels | [datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf): VDD 3.3 V: VIH min 0.75 VDD, inputs to VDD + 0.3 V; not 5 V tolerant. |
| BigTreeTech TMC2209 V1.3 StepStick stepper driver (UART) logic levels | [estimated](https://www.analog.com/media/en/technical-documentation/data-sheets/TMC2209_datasheet_rev1.09.pdf): Digital inputs referenced to VCC_IO (3.3 V or 5 V); 0.7 VCC_IO threshold assumed for the Schmitt inputs. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 20 AWG silicone wire | 0.7 | m | 0.5 | 0.35 | 0.519 mm2, rated 5.5 A in a bundle; 0.61 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 6.6 | m | 0.4 | 2.64 | 0.327 mm2, rated 3.5 A in a bundle; 5.96 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 9.9 | m | 0.35 | 3.46 | 0.205 mm2, rated 1.75 A in a bundle; 8.98 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 4.6 | m | 0.3 | 1.38 | 0.128 mm2, rated 1.1 A in a bundle; 4.10 m cut + 10 % waste | estimated |
| 6.3 mm spade contacts | 3 | pc | 0.08 | 0.24 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 5 | pc | 0.03 | 0.15 | rated 17.5 A per contact | estimated |
| Dupont 2.54 mm contacts | 61 | pc | 0.02 | 1.22 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 19 | pc | 0.02 | 0.38 | one per cable end | estimated |
| JST XH 2.5 mm contacts | 9 | pc | 0.03 | 0.27 | rated 3 A per contact | estimated |
| JST XH 2.5 mm housings | 6 | pc | 0.05 | 0.30 | one per cable end | estimated |
| Heat shrink 3 mm, 2:1 | 1.2 | m | 0.2 | 0.24 | 0 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 23 | pc | 0.02 | 0.46 | at every clip, cable end and strain-relief anchor | estimated |
| PG7 cable gland | 1 | pc | 2.97 | 2.97 | cable exit with strain relief | estimated |
| Nylon braided sleeving 6 mm | 1.2 | m | 0.4 | 0.48 | over every cable where it crosses a joint | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Mechanical end stop, microswitch on a small board, 3-pin | estimated | estimated | estimated | estimated |
| Espressif ESP32-S3-DevKitC-1 | estimated | [datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf) | estimated | [datasheet](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html) |
| IEC C14 panel inlet with fuse drawer and rocker switch, 10 A | estimated | estimated | estimated | estimated |
| NEMA17 stepper 42x42x40 mm, 0.45 N.m | estimated | [datasheet](https://www.oyostepper.com/images/upload/File/17HS16-2004S1.pdf) | [datasheet](https://www.oyostepper.com/images/upload/File/17HS16-2004S1.pdf) | [datasheet](https://www.oyostepper.com/images/upload/File/17HS16-2004S1.pdf) |
| Mean Well LRS-150-24 enclosed PSU, 24 V 6.5 A | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-150/LRS-150-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-150/LRS-150-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-150/LRS-150-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-150/LRS-150-SPEC.PDF) |
| BigTreeTech TMC2209 V1.3 StepStick stepper driver | [datasheet](https://botland.store/replacement-parts/19883-bigtreetech-tmc2209-v12-stepper-motor-driver.html) | estimated | [datasheet](https://learn.watterott.com/silentstepstick/pinconfig/tmc2209/) | [datasheet](https://learn.watterott.com/silentstepstick/pinconfig/tmc2209/) |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |

## Notes

- Mains side: IEC inlet to the supply's AC terminals with insulated spades, earth wired first, case closed before plugging in. Have it checked if you are not qualified to wire mains.
- The ESP32-S3 runs from its USB lead to the PC; its 3V3 feeds the drivers' logic and the home switches. Motor and switch leads run in drag chain or spiral wrap along each module.
- Routing: 15 wire runs could only be laid through solid parts at the home pose (834 mm in all), for example driver_x~x_motor wire 4 through a printed part for 2 mm at -17,-277,18; controller~x_endstop wire 1 through power_supply for 146 mm at 112,-309,31; driver_y~y_motor wire 4 through a printed part for 2 mm at 9,-277,18. Lay those wires round the part by hand.
