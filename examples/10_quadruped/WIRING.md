# Wiring: quadruped

28 cables, 54 conductors, 11.78 m of wire, wiring parts $22.03.

Diagram: [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 11.1 | main_switch | 35 / 70 | 5.951 / 14.951 | 5.9x | 7.5 | 0.079 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 1 / 5 | 5.5x | - | 0.055 |

**VBAT loads** (peak assumes four joints at peak at once, the rest at half load):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator_5v | 0.501 | 2.503 |
| actuator_bus | 0.05 | 0.1 |
| fl_hip_abduction_actuator | 1.35 | 3.6 |
| fr_hip_abduction_actuator | 1.35 | 3.6 |
| rl_hip_abduction_actuator | 1.35 | 3.6 |
| rr_hip_abduction_actuator | 1.35 | 3.6 |

**5V loads** (peak assumes the computer at its peak and every sensor running):

| Load | Typical A | Peak A |
|---|--:|--:|
| computer | 1 | 5 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 7.5 A ATM blade fuse, inline holder, protects everything on VBAT (16 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch regulator_5v (22 AWG).
- Fuse **F3**: 2 A ATM blade fuse, inline holder, protects branch actuator_bus (22 AWG).
- Fuse **F4**: 2 A ATM blade fuse, inline holder, protects branch fl_hip_abduction_actuator (22 AWG).
- Fuse **F5**: 2 A ATM blade fuse, inline holder, protects branch fr_hip_abduction_actuator (22 AWG).
- Fuse **F6**: 2 A ATM blade fuse, inline holder, protects branch rl_hip_abduction_actuator (22 AWG).
- Fuse **F7**: 2 A ATM blade fuse, inline holder, protects branch rr_hip_abduction_actuator (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | CAMERA_CSI | camera.GND | computer.GND | made | black | 0.2 | 0.25 |
| C2 | W2 | 3V3_IMU | computer.3V3 | imu.VIN | 24 | red | 0.011 | 0.015 |
| C2 | W3 | GND | computer.GND | imu.GND | 24 | black | 0.011 | 0.015 |
| C2 | W4 | I2C_SDA | computer.GPIO2 | imu.SDA | 26 | blue | 0.02 | 0.02 |
| C2 | W5 | I2C_SCL | computer.GPIO3 | imu.SCL | 26 | yellow | 0.02 | 0.02 |
| C3 | W6 | BUS_ACTUATOR_BUS | actuator_bus.SIG | actuator_bus_hub.P1 | 26 | yellow | 0.02 | 0.02 |
| C4 | W7 | BUS_ACTUATOR_BUS | actuator_bus_hub.P2 | fl_hip_abduction_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C5 | W8 | VBAT | fl_hip_abduction_actuator.VCC | fl_hip_pitch_actuator.VCC | 22 | red | 0.9 | 3.15 |
| C5 | W9 | GND | fl_hip_abduction_actuator.GND | fl_hip_pitch_actuator.GND | 22 | black | 0.9 | 3.15 |
| C5 | W10 | BUS_ACTUATOR_BUS | fl_hip_abduction_actuator.DATA | fl_hip_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C6 | W11 | VBAT | fl_hip_pitch_actuator.VCC | fl_knee_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C6 | W12 | GND | fl_hip_pitch_actuator.GND | fl_knee_actuator.GND | 24 | black | 0.45 | 2.7 |
| C6 | W13 | BUS_ACTUATOR_BUS | fl_hip_pitch_actuator.DATA | fl_knee_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C7 | W14 | BUS_ACTUATOR_BUS | actuator_bus_hub.P2 | fr_hip_abduction_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C8 | W15 | VBAT | fr_hip_abduction_actuator.VCC | fr_hip_pitch_actuator.VCC | 22 | red | 0.9 | 3.15 |
| C8 | W16 | GND | fr_hip_abduction_actuator.GND | fr_hip_pitch_actuator.GND | 22 | black | 0.9 | 3.15 |
| C8 | W17 | BUS_ACTUATOR_BUS | fr_hip_abduction_actuator.DATA | fr_hip_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C9 | W18 | VBAT | fr_hip_pitch_actuator.VCC | fr_knee_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C9 | W19 | GND | fr_hip_pitch_actuator.GND | fr_knee_actuator.GND | 24 | black | 0.45 | 2.7 |
| C9 | W20 | BUS_ACTUATOR_BUS | fr_hip_pitch_actuator.DATA | fr_knee_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C10 | W21 | BUS_ACTUATOR_BUS | actuator_bus_hub.P2 | rl_hip_abduction_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C11 | W22 | VBAT | rl_hip_abduction_actuator.VCC | rl_hip_pitch_actuator.VCC | 22 | red | 0.9 | 3.15 |
| C11 | W23 | GND | rl_hip_abduction_actuator.GND | rl_hip_pitch_actuator.GND | 22 | black | 0.9 | 3.15 |
| C11 | W24 | BUS_ACTUATOR_BUS | rl_hip_abduction_actuator.DATA | rl_hip_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C12 | W25 | VBAT | rl_hip_pitch_actuator.VCC | rl_knee_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C12 | W26 | GND | rl_hip_pitch_actuator.GND | rl_knee_actuator.GND | 24 | black | 0.45 | 2.7 |
| C12 | W27 | BUS_ACTUATOR_BUS | rl_hip_pitch_actuator.DATA | rl_knee_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C13 | W28 | BUS_ACTUATOR_BUS | actuator_bus_hub.P2 | rr_hip_abduction_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C14 | W29 | VBAT | rr_hip_abduction_actuator.VCC | rr_hip_pitch_actuator.VCC | 22 | red | 0.9 | 3.15 |
| C14 | W30 | GND | rr_hip_abduction_actuator.GND | rr_hip_pitch_actuator.GND | 22 | black | 0.9 | 3.15 |
| C14 | W31 | BUS_ACTUATOR_BUS | rr_hip_abduction_actuator.DATA | rr_hip_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C15 | W32 | VBAT | rr_hip_pitch_actuator.VCC | rr_knee_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C15 | W33 | GND | rr_hip_pitch_actuator.GND | rr_knee_actuator.GND | 24 | black | 0.45 | 2.7 |
| C15 | W34 | BUS_ACTUATOR_BUS | rr_hip_pitch_actuator.DATA | rr_knee_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C16 | W35 | BUS_USB | actuator_bus.VBUS | computer.LINK | made | red | 0.05 | 0.1 |
| C17 | W36 | VBAT | battery.BAT+ | main_fuse.IN | 16 | red | 5.951 | 14.951 |
| C18 | W37 | VBAT | main_fuse.OUT | main_switch.IN | 16 | red | 5.951 | 14.951 |
| C19 | W38 | GND | battery.BAT- | star_ground.P1 | 16 | black | 5.951 | 14.951 |
| C20 | W39 | VBAT | main_switch.OUT | splice_vbat.P1 | 16 | red | 5.951 | 14.951 |
| C21 | W40 | VBAT | splice_vbat.P2 | regulator_5v.VIN | 22 | red | 0.501 | 2.503 |
| C21 | W41 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0.501 | 2.503 |
| C22 | W42 | VBAT | splice_vbat.P2 | actuator_bus.VIN | 22 | red | 0.05 | 0.1 |
| C22 | W43 | GND | star_ground.P2 | actuator_bus.GND | 24 | black | 0.05 | 0.1 |
| C23 | W44 | VBAT | splice_vbat.P2 | fl_hip_abduction_actuator.VCC | 22 | red | 1.35 | 3.6 |
| C23 | W45 | GND | star_ground.P2 | fl_hip_abduction_actuator.GND | 22 | black | 1.35 | 3.6 |
| C24 | W46 | VBAT | splice_vbat.P2 | fr_hip_abduction_actuator.VCC | 22 | red | 1.35 | 3.6 |
| C24 | W47 | GND | star_ground.P2 | fr_hip_abduction_actuator.GND | 22 | black | 1.35 | 3.6 |
| C25 | W48 | VBAT | splice_vbat.P2 | rl_hip_abduction_actuator.VCC | 22 | red | 1.35 | 3.6 |
| C25 | W49 | GND | star_ground.P2 | rl_hip_abduction_actuator.GND | 22 | black | 1.35 | 3.6 |
| C26 | W50 | VBAT | splice_vbat.P2 | rr_hip_abduction_actuator.VCC | 22 | red | 1.35 | 3.6 |
| C26 | W51 | GND | star_ground.P2 | rr_hip_abduction_actuator.GND | 22 | black | 1.35 | 3.6 |
| C27 | W52 | GND | regulator_5v.GND | star_ground.P2 | 22 | black | 1 | 5 |
| C28 | W53 | 5V | regulator_5v.VOUT | computer.5V | 22 | red | 1 | 5 |
| C28 | W54 | GND | star_ground.P2 | computer.GND | 22 | black | 1 | 5 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | camera to computer | 1 | 185 | 181.8 | 0 | 0 | 0 | FFC | electronics_hood.deck |
| C2 | computer to imu | 4 | 225 | 124.4 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | - |
| C3 | actuator_bus to actuator_bus_hub | 1 | 190 | 87.4 | 40 | 0 | 60 | 3-pin 2.5 mm bus servo header (5264 class) / lever clamp | electronics_hood.deck |
| C4 | actuator_bus_hub to fl_hip_abduction_actuator | 1 | 215 | 113.7 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C5 | fl_hip_abduction_actuator to fl_hip_pitch_actuator | 3 | 210 | 72.2 | 40 | 35 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C6 | fl_hip_pitch_actuator to fl_knee_actuator | 3 | 290 | 134.8 | 40 | 55 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C7 | actuator_bus_hub to fr_hip_abduction_actuator | 1 | 195 | 92.8 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C8 | fr_hip_abduction_actuator to fr_hip_pitch_actuator | 3 | 210 | 72.2 | 40 | 35 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C9 | fr_hip_pitch_actuator to fr_knee_actuator | 3 | 290 | 134.8 | 40 | 55 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C10 | actuator_bus_hub to rl_hip_abduction_actuator | 1 | 235 | 130.3 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C11 | rl_hip_abduction_actuator to rl_hip_pitch_actuator | 3 | 215 | 72.2 | 40 | 40 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C12 | rl_hip_pitch_actuator to rl_knee_actuator | 3 | 290 | 134.8 | 40 | 55 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C13 | actuator_bus_hub to rr_hip_abduction_actuator | 1 | 215 | 112.5 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C14 | rr_hip_abduction_actuator to rr_hip_pitch_actuator | 3 | 215 | 72.2 | 40 | 40 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C15 | rr_hip_pitch_actuator to rr_knee_actuator | 3 | 290 | 134.8 | 40 | 55 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C16 | actuator_bus to computer | 1 | 85 | 83.5 | 0 | 0 | 0 | USB | - |
| C17 | battery positive to main fuse | 1 | 100 | 0 | 40 | 0 | 60 | XT60 / soldered leads | - |
| C18 | main fuse to main switch | 1 | 260 | 159.5 | 40 | 0 | 60 | soldered leads / 6.3 mm quick-connect tabs | body_bay.right |
| C19 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | XT60 / lever clamp | - |
| C20 | main_switch to the VBAT splice | 1 | 100 | 0 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / lever clamp | - |
| C21 | VBAT to regulator_5v | 2 | 200 | 98.4 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | electronics_hood.deck |
| C22 | VBAT to actuator_bus | 2 | 205 | 102.4 | 40 | 0 | 60 | lever clamp / green screw terminal | electronics_hood.deck |
| C23 | VBAT to fl_hip_abduction_actuator | 2 | 170 | 69.1 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C24 | VBAT to fr_hip_abduction_actuator | 2 | 145 | 40.5 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C25 | VBAT to rl_hip_abduction_actuator | 2 | 305 | 202.2 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C26 | VBAT to rr_hip_abduction_actuator | 2 | 295 | 194.3 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C27 | regulator_5v to star_ground | 1 | 250 | 149.5 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | electronics_hood.deck + body_bay.left |
| C28 | 5V to computer | 2 | 175 | 74.3 | 40 | 0 | 60 | 0.1 in through holes / 40-pin header | - |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C5 | fl_hip_abduction | -0.165 to 0.6 | 25.4 | 26.8 | 35 |
| C6 | fl_hip_pitch | -1.4 to 1.4 | 33.1 | 52.2 | 55 |
| C8 | fr_hip_abduction | -0.6 to 0.165 | 25.4 | 26.8 | 35 |
| C9 | fr_hip_pitch | -1.4 to 1.4 | 33.1 | 52.2 | 55 |
| C11 | rl_hip_abduction | -0.6 to 0.165 | 25.4 | 30.2 | 40 |
| C12 | rl_hip_pitch | -1.4 to 1.4 | 33.1 | 52.2 | 55 |
| C14 | rr_hip_abduction | -0.165 to 0.6 | 25.4 | 30.2 | 40 |
| C15 | rr_hip_pitch | -1.4 to 1.4 | 33.1 | 52.2 | 55 |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 16 AWG silicone wire | 0.7 | m | 1 | 0.70 | 1.308 mm2, rated 11 A in a bundle; 0.56 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 5 | m | 0.4 | 2.00 | 0.327 mm2, rated 3.5 A in a bundle; 4.54 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 3.5 | m | 0.35 | 1.22 | 0.205 mm2, rated 1.75 A in a bundle; 3.18 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 3.9 | m | 0.3 | 1.17 | 0.128 mm2, rated 1.1 A in a bundle; 3.51 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 10 | pc | 0.02 | 0.20 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 3 | pc | 0.02 | 0.06 | one per cable end | estimated |
| Molex 5264 contacts | 61 | pc | 0.05 | 3.05 | rated 3 A per contact | estimated |
| Molex 5264 housings | 25 | pc | 0.08 | 2.00 | one per cable end | estimated |
| XT60 contacts | 2 | pc | 0.9 | 1.80 | rated 35 A per contact | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 2 | pc | 0.03 | 0.06 | rated 17.5 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 1.9 | m | 0.2 | 0.38 | 7 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 38 | pc | 0.02 | 0.76 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 9.5 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 2 | pc | 0.08 | 0.16 | 10 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 1.2 | m | 0.4 | 0.48 | over every cable where it crosses a joint | estimated |
| FFC | 1 | pc | 3 | 3.00 | camera to computer | estimated |
| USB | 1 | pc | 3 | 3.00 | actuator_bus to computer | estimated |
| 7.5 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 6 | pc | 0.25 | 1.50 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Adafruit BNO085 9-DoF IMU breakout | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.ceva-ip.com/wp-content/uploads/BNO080_085-Datasheet.pdf) | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.adafruit.com/product/4754) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator | [datasheet](https://www.pololu.com/product/4091/specs) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) |
| Feetech STS3215 C047 12 V 30 kg.cm | [datasheet](https://files.seeedstudio.com/Bazaar/product_pdf/108090003.pdf) | estimated | [datasheet](https://files.waveshare.com/wiki/Bus-Servo-Adapter-(A)/Bus%20Servo%20Adapter%20(A)-Sch.pdf) | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| LiPo 3S 2200 mAh 25C, XT60 | estimated | estimated | estimated | estimated |
| Raspberry Pi 5 | estimated | [datasheet](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html) | estimated | [datasheet](https://pip.raspberrypi.com/documents/RP-008348-DS-raspberry-pi-5-product-brief.pdf) |
| Raspberry Pi Camera Module 3 | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated |
| KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
| Waveshare Bus Servo Adapter | [datasheet](https://www.waveshare.com/bus-servo-adapter-a.htm) | estimated | estimated | [datasheet](https://www.waveshare.com/wiki/Bus_Servo_Adapter_(A)) |
