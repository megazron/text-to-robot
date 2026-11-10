# Wiring: scara

17 cables, 48 conductors, 24.24 m of wire, wiring parts $18.51.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| V24 | 24 | psu_24v | 6.5 / 7.1 | 3.216 / 5.36 | 2.0x | - | 0.043 |
| V12 | 12 | psu_12v | 6 / 6.6 | 0.9 / 3.15 | 6.7x | - | 0.288 |

**V24 loads** (peak assumes all three steppers at full current):

| Load | Typical A | Peak A |
|---|--:|--:|
| driver_j1 | 1.008 | 1.68 |
| driver_j2 | 1.008 | 1.68 |
| driver_z | 1.2 | 2 |

**V12 loads** (peak assumes one servo stalled, the other running):

| Load | Typical A | Peak A |
|---|--:|--:|
| servo_bus | 0.9 | 3.15 |

## Protection

- Main switch: **mains_inlet** breaks the positive feed after the fuse. Ground is never switched.
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | MAINS_L0 | mains_inlet.L | psu_24v.AC/L | 24 | red | 1 | 2 |
| C1 | W2 | MAINS_N0 | mains_inlet.N | psu_24v.AC/N | 24 | red | 1 | 2 |
| C1 | W3 | MAINS_E0 | mains_inlet.E | psu_24v.FG | 24 | red | 1 | 2 |
| C2 | W4 | MAINS_L1 | mains_inlet.L | psu_12v.AC/L | 24 | red | 1 | 2 |
| C2 | W5 | MAINS_N1 | mains_inlet.N | psu_12v.AC/N | 24 | red | 1 | 2 |
| C2 | W6 | MAINS_E1 | mains_inlet.E | psu_12v.FG | 24 | red | 1 | 2 |
| C3 | W7 | J1_VIO | controller.3V3 | driver_j1.VIO | 24 | red | 0.02 | 0.02 |
| C3 | W8 | J1_STEP | controller.4 | driver_j1.STEP | 26 | blue | 0.02 | 0.02 |
| C3 | W9 | J1_DIR | controller.5 | driver_j1.DIR | 26 | blue | 0.02 | 0.02 |
| C3 | W10 | J1_EN | controller.6 | driver_j1.EN | 26 | blue | 0.02 | 0.02 |
| C3 | W11 | GND | controller.G | driver_j1.GND | 24 | black | 0.02 | 0.02 |
| C4 | W12 | J1_M1A | driver_j1.M1A | j1_motor.A (black) | 22 | orange | 1.008 | 1.68 |
| C4 | W13 | J1_M1B | driver_j1.M1B | j1_motor.A\ (green) | 22 | orange | 1.008 | 1.68 |
| C4 | W14 | J1_M2A | driver_j1.M2A | j1_motor.B (red) | 22 | orange | 1.008 | 1.68 |
| C4 | W15 | J1_M2B | driver_j1.M2B | j1_motor.B\ (blue) | 22 | orange | 1.008 | 1.68 |
| C5 | W16 | J2_VIO | controller.3V3 | driver_j2.VIO | 24 | red | 0.02 | 0.02 |
| C5 | W17 | J2_STEP | controller.7 | driver_j2.STEP | 26 | blue | 0.02 | 0.02 |
| C5 | W18 | J2_DIR | controller.15 | driver_j2.DIR | 26 | blue | 0.02 | 0.02 |
| C5 | W19 | J2_EN | controller.16 | driver_j2.EN | 26 | blue | 0.02 | 0.02 |
| C6 | W20 | J2_M1A | driver_j2.M1A | j2_motor.A (black) | 20 | orange | 1.008 | 1.68 |
| C6 | W21 | J2_M1B | driver_j2.M1B | j2_motor.A\ (green) | 20 | orange | 1.008 | 1.68 |
| C6 | W22 | J2_M2A | driver_j2.M2A | j2_motor.B (red) | 20 | orange | 1.008 | 1.68 |
| C6 | W23 | J2_M2B | driver_j2.M2B | j2_motor.B\ (blue) | 20 | orange | 1.008 | 1.68 |
| C7 | W24 | Z_VIO | controller.3V3 | driver_z.VIO | 24 | red | 0.02 | 0.02 |
| C7 | W25 | Z_STEP | controller.17 | driver_z.STEP | 26 | blue | 0.02 | 0.02 |
| C7 | W26 | Z_DIR | controller.18 | driver_z.DIR | 26 | blue | 0.02 | 0.02 |
| C7 | W27 | Z_EN | controller.8 | driver_z.EN | 26 | blue | 0.02 | 0.02 |
| C8 | W28 | Z_M1A | driver_z.M1A | z_motor.A (black) | 20 | orange | 1.2 | 2 |
| C8 | W29 | Z_M1B | driver_z.M1B | z_motor.A\ (green) | 20 | orange | 1.2 | 2 |
| C8 | W30 | Z_M2A | driver_z.M2A | z_motor.B (red) | 20 | orange | 1.2 | 2 |
| C8 | W31 | Z_M2B | driver_z.M2B | z_motor.B\ (blue) | 20 | orange | 1.2 | 2 |
| C9 | W32 | BUS_SERVO_BUS | servo_bus.SIG | wrist_servo.DATA | 26 | yellow | 0.02 | 0.02 |
| C9 | W33 | GND | servo_bus.GND | wrist_servo.GND | 24 | black | 0.05 | 0.05 |
| C9 | W34 | V12 | servo_bus.VIN | wrist_servo.VCC | 22 | red | 0.9 | 3.15 |
| C10 | W35 | V12 | wrist_servo.VCC | gripper_servo.VCC | 24 | red | 0.45 | 2.7 |
| C10 | W36 | GND | wrist_servo.GND | gripper_servo.GND | 24 | black | 0.45 | 2.7 |
| C10 | W37 | BUS_SERVO_BUS | wrist_servo.DATA | gripper_servo.DATA | 26 | yellow | 0.02 | 0.02 |
| C11 | W38 | GND | psu_24v.DC OUTPUT -V | star_ground.P1 | 20 | black | 3.216 | 5.36 |
| C12 | W39 | V24 | psu_24v.DC OUTPUT +V | splice_v24.P1 | 20 | red | 3.216 | 5.36 |
| C13 | W40 | V24 | splice_v24.P2 | driver_j1.VM | 24 | red | 1.008 | 1.68 |
| C13 | W41 | GND | star_ground.P2 | driver_j1.GND | 24 | black | 1.008 | 1.68 |
| C14 | W42 | V24 | splice_v24.P2 | driver_j2.VM | 24 | red | 1.008 | 1.68 |
| C14 | W43 | GND | star_ground.P2 | driver_j2.GND | 24 | black | 1.008 | 1.68 |
| C15 | W44 | V24 | splice_v24.P2 | driver_z.VM | 24 | red | 1.2 | 2 |
| C15 | W45 | GND | star_ground.P2 | driver_z.GND | 24 | black | 1.2 | 2 |
| C16 | W46 | GND | psu_12v.DC OUTPUT -V | star_ground.P2 | 22 | black | 0.9 | 3.15 |
| C17 | W47 | V12 | psu_12v.DC OUTPUT +V | servo_bus.VIN | 22 | red | 0.9 | 3.15 |
| C17 | W48 | GND | star_ground.P2 | servo_bus.GND | 22 | black | 0.9 | 3.15 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | mains_inlet to psu_24v | 3 | 430 | 327.2 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / barrier screw terminal | controller_bay.harness |
| C2 | mains_inlet to psu_12v | 3 | 420 | 318.4 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / barrier screw terminal | controller_bay.harness |
| C3 | controller to driver_j1 | 5 | 170 | 67.8 | 40 | 0 | 60 | 22-pin male header / same header | - |
| C4 | driver_j1 to j1_motor | 4 | 745 | 640.7 | 40 | 0 | 60 | 2.54 mm pin header / Four bare leads | controller_bay.harness |
| C5 | controller to driver_j2 | 4 | 170 | 67.9 | 40 | 0 | 60 | 22-pin male header / same header | - |
| C6 | driver_j2 to j2_motor | 4 | 1200 | 958.4 | 40 | 140 | 60 | 2.54 mm pin header / Four bare leads | controller_bay.harness |
| C7 | controller to driver_z | 4 | 180 | 78.2 | 40 | 0 | 60 | 22-pin male header / same header | - |
| C8 | driver_z to z_motor | 4 | 1220 | 1015.4 | 40 | 100 | 60 | 2.54 mm pin header / Harwin-type 2.54 mm 4-pin housing on the end of a 1000 mm cable | controller_bay.harness |
| C9 | servo_bus to wrist_servo | 3 | 1440 | 1133.4 | 40 | 205 | 60 | 3-pin 2.5 mm bus servo header (5264 class) / Feetech 5264-3P | controller_bay.harness |
| C10 | wrist_servo to gripper_servo | 3 | 245 | 74.2 | 40 | 70 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C11 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | barrier screw terminal / lever clamp | - |
| C12 | psu_24v to the V24 splice | 1 | 100 | 0 | 40 | 0 | 60 | barrier screw terminal / lever clamp | - |
| C13 | V24 to driver_j1 | 2 | 155 | 55 | 40 | 0 | 60 | lever clamp / same header | - |
| C14 | V24 to driver_j2 | 2 | 160 | 59.3 | 40 | 0 | 60 | lever clamp / same header | - |
| C15 | V24 to driver_z | 2 | 175 | 72 | 40 | 0 | 60 | lever clamp / same header | - |
| C16 | psu_12v to star_ground | 1 | 230 | 128.3 | 40 | 0 | 60 | barrier screw terminal / lever clamp | - |
| C17 | V12 to servo_bus | 2 | 155 | 52.6 | 40 | 0 | 60 | barrier screw terminal / green screw terminal | - |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C6 | j1 | -2.9 to 2.9 | 28.6 | 84.4 | 100 |
| C6 | z | 0 to 0.159 | 24.7 | 24.7 | 40 |
| C8 | j1 | -2.9 to 2.9 | 1.7 | 57.5 | 100 |
| C9 | j1 | -2.9 to 2.9 | 26.3 | 77.8 | 90 |
| C9 | z | 0 to 0.159 | 22.7 | 22.7 | 35 |
| C9 | j2 | -2.208 to 2.208 | 55.7 | 94.9 | 80 |
| C10 | wrist_roll | -3 to 3 | 0 | 30 | 70 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Mains supply

| Supply | Rail | Rated A | Typical A | Peak A | Load at typical |
|---|---|--:|--:|--:|--:|
| psu_24v (Mean Well LRS-150-24 enclosed PSU, 24 V 6.5 A) | V24 24 V | 6.5 | 3.216 | 5.36 | 49.48 % |
| psu_12v (Mean Well LRS-75-12 enclosed PSU, 12 V 6 A) | V24 24 V | 6 | 3.216 | 5.36 | 53.6 % |

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| BUS_SERVO_BUS | M1 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U4 SIG | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U4 SIG | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U4 SIG | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M4 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M4 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| J1_DIR | A1 5 | U1 DIR | 3.3 | 2.31 | 5.5 | ok |
| J1_EN | A1 6 | U1 EN | 3.3 | 2.31 | 5.5 | ok |
| J1_STEP | A1 4 | U1 STEP | 3.3 | 2.31 | 5.5 | ok |
| J2_DIR | A1 15 | U2 DIR | 3.3 | 2.31 | 5.5 | ok |
| J2_EN | A1 16 | U2 EN | 3.3 | 2.31 | 5.5 | ok |
| J2_STEP | A1 7 | U2 STEP | 3.3 | 2.31 | 5.5 | ok |
| Z_DIR | A1 18 | U3 DIR | 3.3 | 2.31 | 5.5 | ok |
| Z_EN | A1 8 | U3 EN | 3.3 | 2.31 | 5.5 | ok |
| Z_STEP | A1 17 | U3 STEP | 3.3 | 2.31 | 5.5 | ok |

Not checked (no logic levels in the parts data): Feetech STS3215 C047 12 V 30 kg.cm (1:345), Waveshare Bus Servo Adapter (A).

### Sources

| Input | Source |
|---|---|
| Mean Well LRS-150-24 enclosed PSU, 24 V 6.5 A (156 W) output | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-150/LRS-150-SPEC.PDF) |
| Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) output | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) |
| Espressif ESP32-S3-DevKitC-1 (N8R8) logic levels | [datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf): VDD 3.3 V: VIH min 0.75 VDD, inputs to VDD + 0.3 V; not 5 V tolerant. |
| BigTreeTech TMC2209 V1.3 StepStick stepper driver (UART) logic levels | [estimated](https://www.analog.com/media/en/technical-documentation/data-sheets/TMC2209_datasheet_rev1.09.pdf): Digital inputs referenced to VCC_IO (3.3 V or 5 V); 0.7 VCC_IO threshold assumed for the Schmitt inputs. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 20 AWG silicone wire | 10.9 | m | 0.5 | 5.45 | 0.519 mm2, rated 5.5 A in a bundle; 9.88 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 5.5 | m | 0.4 | 2.20 | 0.327 mm2, rated 3.5 A in a bundle; 4.96 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 6.8 | m | 0.35 | 2.38 | 0.205 mm2, rated 1.75 A in a bundle; 6.15 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 3.6 | m | 0.3 | 1.08 | 0.128 mm2, rated 1.1 A in a bundle; 3.25 m cut + 10 % waste | estimated |
| 6.3 mm spade contacts | 6 | pc | 0.08 | 0.48 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 13 | pc | 0.03 | 0.39 | rated 17.5 A per contact | estimated |
| Dupont 2.54 mm contacts | 48 | pc | 0.02 | 0.96 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 13 | pc | 0.02 | 0.26 | one per cable end | estimated |
| Molex 5264 contacts | 12 | pc | 0.05 | 0.60 | rated 3 A per contact | estimated |
| Molex 5264 housings | 4 | pc | 0.08 | 0.32 | one per cable end | estimated |
| Heat shrink 3 mm, 2:1 | 1.3 | m | 0.2 | 0.26 | 8 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 32 | pc | 0.02 | 0.64 | at every clip, cable end and strain-relief anchor | estimated |
| PG7 cable gland | 1 | pc | 2.97 | 2.97 | cable exit with strain relief | estimated |
| Nylon braided sleeving 6 mm | 1.3 | m | 0.4 | 0.52 | over every cable where it crosses a joint | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Espressif ESP32-S3-DevKitC-1 | estimated | [datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf) | estimated | [datasheet](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html) |
| Feetech STS3215 C047 12 V 30 kg.cm | [datasheet](https://files.seeedstudio.com/Bazaar/product_pdf/108090003.pdf) | estimated | [datasheet](https://files.waveshare.com/wiki/Bus-Servo-Adapter-(A)/Bus%20Servo%20Adapter%20(A)-Sch.pdf) | estimated |
| IEC C14 panel inlet with fuse drawer and rocker switch, 10 A | estimated | estimated | estimated | estimated |
| NEMA17 stepper 42x42x40 mm, 0.45 N.m | estimated | [datasheet](https://www.oyostepper.com/images/upload/File/17HS16-2004S1.pdf) | [datasheet](https://www.oyostepper.com/images/upload/File/17HS16-2004S1.pdf) | [datasheet](https://www.oyostepper.com/images/upload/File/17HS16-2004S1.pdf) |
| NEMA17 stepper + 5.18:1 planetary gearbox | estimated | [datasheet](https://www.oyostepper.com/images/upload/File/17HS19-1684S-PG5.pdf) | [datasheet](https://www.oyostepper.com/images/upload/File/17HS19-1684S-PG5.pdf) | [datasheet](https://www.oyostepper.com/images/upload/File/17HS19-1684S-PG5.pdf) |
| Mean Well LRS-75-12 enclosed PSU, 12 V 6 A | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF) |
| Mean Well LRS-150-24 enclosed PSU, 24 V 6.5 A | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-150/LRS-150-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-150/LRS-150-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-150/LRS-150-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-150/LRS-150-SPEC.PDF) |
| BigTreeTech TMC2209 V1.3 StepStick stepper driver | [datasheet](https://botland.store/replacement-parts/19883-bigtreetech-tmc2209-v12-stepper-motor-driver.html) | estimated | [datasheet](https://learn.watterott.com/silentstepstick/pinconfig/tmc2209/) | [datasheet](https://learn.watterott.com/silentstepstick/pinconfig/tmc2209/) |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
| Waveshare Bus Servo Adapter | [datasheet](https://www.waveshare.com/bus-servo-adapter-a.htm) | estimated | estimated | [datasheet](https://www.waveshare.com/wiki/Bus_Servo_Adapter_(A)) |

## Notes

- Mains side: IEC inlet to both supplies' AC terminals with insulated spades, earth wired first, lid on before plugging in. Have it checked if you are not qualified to wire mains.
- The ESP32-S3 runs from its USB lead to the PC; its 3V3 drives the stepper drivers' logic. Ground joins through the bus and control wires.
