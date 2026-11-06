# Wiring: eva

26 cables, 52 conductors, 20.59 m of wire, wiring parts $23.55.

Diagram: [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 11.1 | main_switch | 35 / 70 | 5.651 / 16.051 | 6.2x | 10 | 0.178 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 1 / 5 | 5.5x | - | 0.117 |

**VBAT loads** (peak assumes two drive motors stalling at once, the rest running):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator_5v | 0.501 | 2.503 |
| motor_driver_1 | 2.85 | 11 |
| servo_bus | 0.05 | 0.1 |
| head_pan_actuator | 0.45 | 2.7 |
| left_arm_shoulder_pitch_actuator | 0.9 | 3.15 |
| right_arm_shoulder_pitch_actuator | 0.9 | 3.15 |

**5V loads** (peak assumes the computer at its peak and every sensor running):

| Load | Typical A | Peak A |
|---|--:|--:|
| computer | 1 | 5 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 10 A ATM blade fuse, inline holder, protects everything on VBAT (16 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch regulator_5v (22 AWG).
- Fuse **F3**: 2 A ATM blade fuse, inline holder, protects branch servo_bus (22 AWG).
- Fuse **F4**: 2 A ATM blade fuse, inline holder, protects branch head_pan_actuator (22 AWG).
- Fuse **F5**: 2 A ATM blade fuse, inline holder, protects branch left_arm_shoulder_pitch_actuator (22 AWG).
- Fuse **F6**: 2 A ATM blade fuse, inline holder, protects branch right_arm_shoulder_pitch_actuator (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | HEAD_CAMERA_CSI | head_camera.GND | computer.GND | made | black | 0.2 | 0.25 |
| C2 | W2 | 3V3_IMU | computer.3V3 | imu.VIN | 24 | red | 0.011 | 0.015 |
| C2 | W3 | GND | computer.GND | imu.GND | 24 | black | 0.011 | 0.015 |
| C2 | W4 | I2C_SDA | computer.GPIO2 | imu.SDA | 26 | blue | 0.02 | 0.02 |
| C2 | W5 | I2C_SCL | computer.GPIO3 | imu.SCL | 26 | yellow | 0.02 | 0.02 |
| C3 | W6 | GND | motor_driver_1.GND | computer.GND | 24 | black | 0.01 | 0.01 |
| C3 | W7 | LEFT_MOTOR_PWM | computer.GPIO12 | motor_driver_1.PWM1 | 26 | yellow | 0.02 | 0.02 |
| C3 | W8 | LEFT_MOTOR_DIR | computer.GPIO13 | motor_driver_1.DIR1 | 26 | yellow | 0.02 | 0.02 |
| C3 | W9 | RIGHT_MOTOR_PWM | computer.GPIO5 | motor_driver_1.PWM2 | 26 | blue | 0.02 | 0.02 |
| C3 | W10 | RIGHT_MOTOR_DIR | computer.GPIO6 | motor_driver_1.DIR2 | 26 | blue | 0.02 | 0.02 |
| C4 | W11 | LEFT_MOTOR_PHASE_A | motor_driver_1.M1A | left_motor.Motor (red) | 20 | orange | 1.4 | 5.5 |
| C4 | W12 | LEFT_MOTOR_PHASE_B | motor_driver_1.M1B | left_motor.Motor (black) | 20 | orange | 1.4 | 5.5 |
| C5 | W13 | LEFT_MOTOR_ENC_VCC | computer.3V3 | left_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C5 | W14 | GND | computer.GND | left_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C5 | W15 | LEFT_MOTOR_ENC_A | computer.GPIO18 | left_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C5 | W16 | LEFT_MOTOR_ENC_B | computer.GPIO19 | left_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C6 | W17 | RIGHT_MOTOR_PHASE_A | motor_driver_1.M2A | right_motor.Motor (red) | 20 | orange | 1.4 | 5.5 |
| C6 | W18 | RIGHT_MOTOR_PHASE_B | motor_driver_1.M2B | right_motor.Motor (black) | 20 | orange | 1.4 | 5.5 |
| C7 | W19 | RIGHT_MOTOR_ENC_VCC | computer.3V3 | right_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C7 | W20 | GND | computer.GND | right_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C7 | W21 | RIGHT_MOTOR_ENC_A | computer.GPIO16 | right_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C7 | W22 | RIGHT_MOTOR_ENC_B | computer.GPIO20 | right_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C8 | W23 | BUS_SERVO_BUS | servo_bus.SIG | servo_bus_hub.P1 | 26 | yellow | 0.02 | 0.02 |
| C9 | W24 | BUS_SERVO_BUS | servo_bus_hub.P2 | head_pan_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C10 | W25 | BUS_SERVO_BUS | servo_bus_hub.P2 | left_arm_shoulder_pitch_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C11 | W26 | VBAT | left_arm_shoulder_pitch_actuator.VCC | left_arm_elbow_pitch_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C11 | W27 | GND | left_arm_shoulder_pitch_actuator.GND | left_arm_elbow_pitch_actuator.GND | 24 | black | 0.45 | 2.7 |
| C11 | W28 | BUS_SERVO_BUS | left_arm_shoulder_pitch_actuator.DATA | left_arm_elbow_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C12 | W29 | BUS_SERVO_BUS | servo_bus_hub.P2 | right_arm_shoulder_pitch_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C13 | W30 | VBAT | right_arm_shoulder_pitch_actuator.VCC | right_arm_elbow_pitch_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C13 | W31 | GND | right_arm_shoulder_pitch_actuator.GND | right_arm_elbow_pitch_actuator.GND | 24 | black | 0.45 | 2.7 |
| C13 | W32 | BUS_SERVO_BUS | right_arm_shoulder_pitch_actuator.DATA | right_arm_elbow_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C14 | W33 | SERVO_BUS_USB | servo_bus.VBUS | computer.LINK | made | red | 0.05 | 0.1 |
| C15 | W34 | VBAT | battery.BAT+ | main_fuse.IN | 16 | red | 5.651 | 16.051 |
| C16 | W35 | VBAT | main_fuse.OUT | main_switch.IN | 16 | red | 5.651 | 16.051 |
| C17 | W36 | GND | battery.BAT- | star_ground.P1 | 16 | black | 5.651 | 16.051 |
| C18 | W37 | VBAT | main_switch.OUT | splice_vbat.P1 | 16 | red | 5.651 | 16.051 |
| C19 | W38 | VBAT | splice_vbat.P2 | regulator_5v.VIN | 22 | red | 0.501 | 2.503 |
| C19 | W39 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0.501 | 2.503 |
| C20 | W40 | VBAT | splice_vbat.P2 | motor_driver_1.POWER+ | 18 | red | 2.85 | 11 |
| C20 | W41 | GND | star_ground.P2 | motor_driver_1.POWER- | 18 | black | 2.85 | 11 |
| C21 | W42 | VBAT | splice_vbat.P2 | servo_bus.VIN | 22 | red | 0.05 | 0.1 |
| C21 | W43 | GND | star_ground.P2 | servo_bus.GND | 24 | black | 0.05 | 0.1 |
| C22 | W44 | VBAT | splice_vbat.P2 | head_pan_actuator.VCC | 22 | red | 0.45 | 2.7 |
| C22 | W45 | GND | star_ground.P2 | head_pan_actuator.GND | 22 | black | 0.45 | 2.7 |
| C23 | W46 | VBAT | splice_vbat.P2 | left_arm_shoulder_pitch_actuator.VCC | 22 | red | 0.9 | 3.15 |
| C23 | W47 | GND | star_ground.P2 | left_arm_shoulder_pitch_actuator.GND | 22 | black | 0.9 | 3.15 |
| C24 | W48 | VBAT | splice_vbat.P2 | right_arm_shoulder_pitch_actuator.VCC | 22 | red | 0.9 | 3.15 |
| C24 | W49 | GND | star_ground.P2 | right_arm_shoulder_pitch_actuator.GND | 22 | black | 0.9 | 3.15 |
| C25 | W50 | GND | regulator_5v.GND | star_ground.P2 | 22 | black | 1 | 5 |
| C26 | W51 | 5V | regulator_5v.VOUT | computer.5V | 20 | red | 1 | 5 |
| C26 | W52 | GND | star_ground.P2 | computer.GND | 20 | black | 1 | 5 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | head_camera to computer | 1 | 540 | 475.8 | 0 | 60 | 0 | FFC | egg_bay.down |
| C2 | computer to imu | 4 | 575 | 473.9 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | egg_bay.down + electronics_enclosure.deck_right |
| C3 | motor_driver_1 to computer | 5 | 185 | 83.9 | 40 | 0 | 60 | 5-pin 2.54 mm header / 40-pin header | - |
| C4 | motor_driver_1 channel 1 to left_motor | 2 | 510 | 406.3 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | egg_bay.down |
| C5 | left_motor encoder to computer | 4 | 530 | 426.6 | 40 | 0 | 60 | 40-pin header / 1x6 female header | egg_bay.down |
| C6 | motor_driver_1 channel 2 to right_motor | 2 | 510 | 408.3 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | egg_bay.down |
| C7 | right_motor encoder to computer | 4 | 530 | 428.6 | 40 | 0 | 60 | 40-pin header / 1x6 female header | egg_bay.down |
| C8 | servo_bus to servo_bus_hub | 1 | 175 | 73.1 | 40 | 0 | 60 | 3-pin 2.5 mm bus servo header (5264 class) / lever clamp | electronics_enclosure.deck_right |
| C9 | servo_bus_hub to head_pan_actuator | 1 | 685 | 580.5 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C10 | servo_bus_hub to left_arm_shoulder_pitch_actuator | 1 | 570 | 466.6 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C11 | left_arm_shoulder_pitch_actuator to left_arm_elbow_pitch_actuator | 3 | 285 | 131.8 | 40 | 50 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C12 | servo_bus_hub to right_arm_shoulder_pitch_actuator | 1 | 530 | 429.8 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C13 | right_arm_shoulder_pitch_actuator to right_arm_elbow_pitch_actuator | 3 | 285 | 131.8 | 40 | 50 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C14 | servo_bus to computer | 1 | 430 | 429.9 | 0 | 0 | 0 | USB | electronics_enclosure.deck_right + egg_bay.down |
| C15 | battery positive to main fuse | 1 | 100 | 0 | 40 | 0 | 60 | XT60 / soldered leads | - |
| C16 | main fuse to main switch | 1 | 305 | 203.4 | 40 | 0 | 60 | soldered leads / 6.3 mm quick-connect tabs | electronics_enclosure.deck_left |
| C17 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | XT60 / lever clamp | - |
| C18 | main_switch to the VBAT splice | 1 | 100 | 0 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / lever clamp | - |
| C19 | VBAT to regulator_5v | 2 | 230 | 127.4 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | electronics_enclosure.deck_left |
| C20 | VBAT to motor_driver_1 | 2 | 485 | 382.8 | 40 | 0 | 60 | lever clamp / 2-position screw terminal | egg_bay.down |
| C21 | VBAT to servo_bus | 2 | 265 | 163.6 | 40 | 0 | 60 | lever clamp / green screw terminal | electronics_enclosure.deck_left |
| C22 | VBAT to head_pan_actuator | 2 | 655 | 551.5 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C23 | VBAT to left_arm_shoulder_pitch_actuator | 2 | 510 | 409.4 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C24 | VBAT to right_arm_shoulder_pitch_actuator | 2 | 585 | 483.5 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C25 | regulator_5v to star_ground | 1 | 185 | 81 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C26 | 5V to computer | 2 | 585 | 483.3 | 40 | 0 | 60 | 0.1 in through holes / 40-pin header | electronics_enclosure.deck_right + egg_bay.down |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C1 | head_pan | -2.6 to 2.6 | 43.6 | 80 | 60 |
| C11 | left_arm_shoulder_pitch | -1.1 to 1.1 | 44.3 | 59.3 | 50 |
| C13 | right_arm_shoulder_pitch | -1.1 to 1.1 | 44.3 | 59.3 | 50 |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 16 AWG silicone wire | 0.7 | m | 1 | 0.70 | 1.308 mm2, rated 11 A in a bundle; 0.60 m cut + 10 % waste | estimated |
| 18 AWG silicone wire | 1.1 | m | 0.7 | 0.77 | 0.823 mm2, rated 8 A in a bundle; 0.97 m cut + 10 % waste | estimated |
| 20 AWG silicone wire | 3.6 | m | 0.5 | 1.80 | 0.519 mm2, rated 5.5 A in a bundle; 3.21 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 4.6 | m | 0.4 | 1.84 | 0.327 mm2, rated 3.5 A in a bundle; 4.18 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 5.6 | m | 0.35 | 1.96 | 0.205 mm2, rated 1.75 A in a bundle; 5.09 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 7.2 | m | 0.3 | 2.16 | 0.128 mm2, rated 1.1 A in a bundle; 6.54 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 28 | pc | 0.02 | 0.56 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 7 | pc | 0.02 | 0.14 | one per cable end | estimated |
| Bootlace ferrule contacts | 8 | pc | 0.03 | 0.24 | rated 17.5 A per contact | estimated |
| Molex 5264 contacts | 22 | pc | 0.05 | 1.10 | rated 3 A per contact | estimated |
| Molex 5264 housings | 11 | pc | 0.08 | 0.88 | one per cable end | estimated |
| XT60 contacts | 2 | pc | 0.9 | 1.80 | rated 35 A per contact | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 2.2 | m | 0.2 | 0.44 | 19 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 53 | pc | 0.02 | 1.06 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 2 | pc | 0.08 | 0.16 | 9.5 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 12 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 0.5 | m | 0.4 | 0.20 | over every cable where it crosses a joint | estimated |
| FFC | 1 | pc | 3 | 3.00 | head_camera to computer | estimated |
| USB | 1 | pc | 3 | 3.00 | servo_bus to computer | estimated |
| 10 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 5 | pc | 0.25 | 1.25 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Adafruit BNO085 9-DoF IMU breakout | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.ceva-ip.com/wp-content/uploads/BNO080_085-Datasheet.pdf) | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.adafruit.com/product/4754) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator | [datasheet](https://www.pololu.com/product/4091/specs) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) |
| Cytron MDD10A dual-channel 10 A DC motor driver | estimated | estimated | estimated | estimated |
| Feetech STS3215 C047 12 V 30 kg.cm | [datasheet](https://files.seeedstudio.com/Bazaar/product_pdf/108090003.pdf) | estimated | [datasheet](https://files.waveshare.com/wiki/Bus-Servo-Adapter-(A)/Bus%20Servo%20Adapter%20(A)-Sch.pdf) | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| LiPo 3S 2200 mAh 25C, XT60 | estimated | estimated | estimated | estimated |
| Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder | estimated | estimated | [datasheet](https://www.pololu.com/product/4752) | [datasheet](https://www.pololu.com/file/0J1735/37d-metal-gearmotors-dimension-diagram.pdf) |
| Raspberry Pi 5 | estimated | [datasheet](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html) | estimated | [datasheet](https://pip.raspberrypi.com/documents/RP-008348-DS-raspberry-pi-5-product-brief.pdf) |
| Raspberry Pi Camera Module 3 | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated |
| KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
| Waveshare Bus Servo Adapter | [datasheet](https://www.waveshare.com/bus-servo-adapter-a.htm) | estimated | estimated | [datasheet](https://www.waveshare.com/wiki/Bus_Servo_Adapter_(A)) |

## Notes

- clips on left_arm_upper_arm not printed: mass properties require a closed manifold mesh
