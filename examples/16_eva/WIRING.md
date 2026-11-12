# Wiring: eva

26 cables, 52 conductors, 24.49 m of wire, wiring parts $25.53.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 11.1 | main_switch | 35 / 70 | 5.651 / 16.051 | 6.2x | 10 | 0.183 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 1 / 5 | 5.5x | - | 0.115 |

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
| C6 | W17 | RIGHT_MOTOR_PHASE_A | motor_driver_1.M2A | right_motor.Motor (red) | 18 | orange | 1.4 | 5.5 |
| C6 | W18 | RIGHT_MOTOR_PHASE_B | motor_driver_1.M2B | right_motor.Motor (black) | 18 | orange | 1.4 | 5.5 |
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
| C20 | W41 | GND | star_ground.P2 | motor_driver_1.POWER- | 16 | black | 2.85 | 11 |
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
| C1 | head_camera to computer | 1 | 520 | 432.8 | 0 | 85 | 0 | FFC | egg_bay.neck |
| C2 | computer to imu | 4 | 600 | 497.4 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | egg_bay.down + electronics_enclosure.lid_down |
| C3 | motor_driver_1 to computer | 5 | 185 | 83.8 | 40 | 0 | 60 | 5-pin 2.54 mm header / 40-pin header | - |
| C4 | motor_driver_1 channel 1 to left_motor | 2 | 660 | 555.5 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | egg_bay.down |
| C5 | left_motor encoder to computer | 4 | 710 | 607.1 | 40 | 0 | 60 | 40-pin header / 1x6 female header | egg_bay.down |
| C6 | motor_driver_1 channel 2 to right_motor | 2 | 755 | 653.9 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | egg_bay.down |
| C7 | right_motor encoder to computer | 4 | 730 | 626 | 40 | 0 | 60 | 40-pin header / 1x6 female header | egg_bay.down |
| C8 | servo_bus to servo_bus_hub | 1 | 150 | 46.1 | 40 | 0 | 60 | 3-pin 2.5 mm bus servo header (5264 class) / lever clamp | - |
| C9 | servo_bus_hub to head_pan_actuator | 1 | 650 | 546.5 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_enclosure.lid_down + egg_bay.down |
| C10 | servo_bus_hub to left_arm_shoulder_pitch_actuator | 1 | 595 | 492.5 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_enclosure.lid_down |
| C11 | left_arm_shoulder_pitch_actuator to left_arm_elbow_pitch_actuator | 3 | 350 | 179.9 | 40 | 70 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C12 | servo_bus_hub to right_arm_shoulder_pitch_actuator | 1 | 620 | 518.9 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_enclosure.lid_down |
| C13 | right_arm_shoulder_pitch_actuator to right_arm_elbow_pitch_actuator | 3 | 355 | 180.2 | 40 | 70 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C14 | servo_bus to computer | 1 | 540 | 535.6 | 0 | 0 | 0 | USB | electronics_enclosure.lid_down + egg_bay.down |
| C15 | battery positive to main fuse | 1 | 175 | 70.2 | 40 | 0 | 60 | XT60 / soldered leads | - |
| C16 | main fuse to main switch | 1 | 180 | 78.2 | 40 | 0 | 60 | soldered leads / 6.3 mm quick-connect tabs | - |
| C17 | battery negative to star ground | 1 | 170 | 66.5 | 40 | 0 | 60 | XT60 / lever clamp | - |
| C18 | main_switch to the VBAT splice | 1 | 160 | 58.2 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / lever clamp | - |
| C19 | VBAT to regulator_5v | 2 | 195 | 93.9 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | - |
| C20 | VBAT to motor_driver_1 | 2 | 640 | 535.4 | 40 | 0 | 60 | lever clamp / 2-position screw terminal | electronics_enclosure.lid_down + egg_bay.down |
| C21 | VBAT to servo_bus | 2 | 235 | 133.3 | 40 | 0 | 60 | lever clamp / green screw terminal | - |
| C22 | VBAT to head_pan_actuator | 2 | 725 | 621.9 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_enclosure.lid_down + egg_bay.down |
| C23 | VBAT to left_arm_shoulder_pitch_actuator | 2 | 670 | 567.1 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_enclosure.lid_down |
| C24 | VBAT to right_arm_shoulder_pitch_actuator | 2 | 690 | 589.1 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_enclosure.lid_down |
| C25 | regulator_5v to star_ground | 1 | 200 | 95.2 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C26 | 5V to computer | 2 | 625 | 524.5 | 40 | 0 | 60 | 0.1 in through holes / 40-pin header | electronics_enclosure.lid_down + egg_bay.down |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C1 | head_pan | -2.6 to 2.6 | 28.9 | 90.2 | 85 |
| C11 | left_arm_shoulder_pitch | -1.1 to 1.1 | 37.1 | 68.1 | 70 |
| C13 | right_arm_shoulder_pitch | -1.1 to 1.1 | 37.1 | 68 | 70 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (LiPo 3S 2200 mAh 25C, XT60) | 24.4 | 2200 | VBAT 11.1 V | 5.651 | 19 min | 16.051 | 7 min | 7.3 C | 55 |

### Regulator heat

Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.

| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|
| regulator_5v | switching | VBAT 11.1 V | 5V 5 V | 1 / 5 | 5.561 | 5 | 0.561 / 2.783 | 90 % | 3 | yes |
- regulator_5v: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 3 W of heat.

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| BUS_SERVO_BUS | M1 DATA | U5 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M2 DATA | U5 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | U5 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M3 DATA | U5 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M5 DATA | U5 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | U5 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | M6 DATA | U5 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U5 SIG | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U5 SIG | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U5 SIG | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U5 SIG | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U5 SIG | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U5 SIG | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_SERVO_BUS | U5 SIG | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| I2C_SCL | A1 GPIO3 | U2 SCL | 3.3 | 2.3 | 5.5 | ok |
| I2C_SCL | U2 SCL | A1 GPIO3 | 3.3 | 2.15 | 3.6 | ok |
| I2C_SDA | A1 GPIO2 | U2 SDA | 3.3 | 2.3 | 5.5 | ok |
| I2C_SDA | U2 SDA | A1 GPIO2 | 3.3 | 2.15 | 3.6 | ok |
| LEFT_MOTOR_DIR | A1 GPIO13 | U3 DIR1 | 3.3 | 2 | 5.5 | ok |
| LEFT_MOTOR_ENC_A | M4 Encoder A | A1 GPIO18 | 3.3 | 2.15 | 3.6 | ok |
| LEFT_MOTOR_ENC_B | M4 Encoder B | A1 GPIO19 | 3.3 | 2.15 | 3.6 | ok |
| LEFT_MOTOR_PWM | A1 GPIO12 | U3 PWM1 | 3.3 | 2 | 5.5 | ok |
| RIGHT_MOTOR_DIR | A1 GPIO6 | U3 DIR2 | 3.3 | 2 | 5.5 | ok |
| RIGHT_MOTOR_ENC_A | M7 Encoder A | A1 GPIO16 | 3.3 | 2.15 | 3.6 | ok |
| RIGHT_MOTOR_ENC_B | M7 Encoder B | A1 GPIO20 | 3.3 | 2.15 | 3.6 | ok |
| RIGHT_MOTOR_PWM | A1 GPIO5 | U3 PWM2 | 3.3 | 2 | 5.5 | ok |

Not checked (no logic levels in the parts data): Feetech STS3215 C047 12 V 30 kg.cm (1:345), Waveshare Bus Servo Adapter (A).

### Sources

| Input | Source |
|---|---|
| LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) capacity and energy | [datasheet](https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) heat | estimated: 27.5 W out at about 90 % (Pololu range 80-95 %) |
| Raspberry Pi 5 (4 GB) logic levels | [estimated](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html): The documentation gives 3.3 V GPIO, not 5 V tolerant. RP1 input thresholds are not published; 0.65 x 3.3 V assumed (common CMOS figure). |
| Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) logic levels | [estimated](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085): 3.3 V sensor on a breakout with a regulator and level shifting for 3-5 V hosts (Adafruit guide); thresholds assumed. |
| Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) logic levels | [estimated](https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels): Cytron states 3.3 V and 5 V logic inputs; the 2 V threshold is assumed from that, not published. |
| Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) logic levels | [datasheet](https://www.pololu.com/product/4751): Hall encoder outputs swing to the encoder Vcc (3.5-20 V), so they match the host when fed from its own logic supply. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 16 AWG silicone wire | 1.5 | m | 1 | 1.50 | 1.308 mm2, rated 11 A in a bundle; 1.33 m cut + 10 % waste | estimated |
| 18 AWG silicone wire | 2.3 | m | 0.7 | 1.61 | 0.823 mm2, rated 8 A in a bundle; 2.05 m cut + 10 % waste | estimated |
| 20 AWG silicone wire | 2.8 | m | 0.5 | 1.40 | 0.519 mm2, rated 5.5 A in a bundle; 2.51 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 5 | m | 0.4 | 2.00 | 0.327 mm2, rated 3.5 A in a bundle; 4.53 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 6.6 | m | 0.35 | 2.31 | 0.205 mm2, rated 1.75 A in a bundle; 5.92 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 8.3 | m | 0.3 | 2.49 | 0.128 mm2, rated 1.1 A in a bundle; 7.49 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 28 | pc | 0.02 | 0.56 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 7 | pc | 0.02 | 0.14 | one per cable end | estimated |
| Bootlace ferrule contacts | 8 | pc | 0.03 | 0.24 | rated 17.5 A per contact | estimated |
| Molex 5264 contacts | 22 | pc | 0.05 | 1.10 | rated 3 A per contact | estimated |
| Molex 5264 housings | 11 | pc | 0.08 | 0.88 | one per cable end | estimated |
| XT60 contacts | 2 | pc | 0.9 | 1.80 | rated 35 A per contact | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 2.2 | m | 0.2 | 0.44 | 19 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 42 | pc | 0.02 | 0.84 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 2 | pc | 0.08 | 0.16 | 9.5 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 2 | pc | 0.08 | 0.16 | 12 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 0.6 | m | 0.4 | 0.24 | over every cable where it crosses a joint | estimated |
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
