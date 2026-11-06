# Wiring: baymax

36 cables, 83 conductors, 32.82 m of wire, wiring parts $33.65.

Diagram: [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 11.1 | main_switch | 35 / 70 | 10.701 / 27.001 | 3.3x | 15 | 0.317 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 1 / 5 | 5.5x | - | 0.052 |

**VBAT loads** (peak assumes two drive motors stalling at once, the rest running):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator_5v | 0.501 | 2.503 |
| motor_driver_1 | 2.85 | 11 |
| motor_driver_2 | 2.85 | 11 |
| servo_bus | 0.05 | 0.1 |
| head_pan_actuator | 0.45 | 2.7 |
| left_arm_base_yaw_actuator | 2 | 5.55 |
| right_arm_base_yaw_actuator | 2 | 5.55 |

**5V loads** (peak assumes the computer at its peak and every sensor running):

| Load | Typical A | Peak A |
|---|--:|--:|
| computer | 1 | 5 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 15 A ATM blade fuse, inline holder, protects everything on VBAT (12 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch regulator_5v (22 AWG).
- Fuse **F3**: 2 A ATM blade fuse, inline holder, protects branch servo_bus (22 AWG).
- Fuse **F4**: 2 A ATM blade fuse, inline holder, protects branch head_pan_actuator (22 AWG).
- Fuse **F5**: 3 A ATM blade fuse, inline holder, protects branch left_arm_base_yaw_actuator (22 AWG).
- Fuse **F6**: 3 A ATM blade fuse, inline holder, protects branch right_arm_base_yaw_actuator (22 AWG).
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
| C3 | W7 | LEFT_FRONT_MOTOR_PWM | computer.GPIO12 | motor_driver_1.PWM1 | 26 | yellow | 0.02 | 0.02 |
| C3 | W8 | LEFT_FRONT_MOTOR_DIR | computer.GPIO13 | motor_driver_1.DIR1 | 26 | yellow | 0.02 | 0.02 |
| C3 | W9 | LEFT_REAR_MOTOR_PWM | computer.GPIO5 | motor_driver_1.PWM2 | 26 | blue | 0.02 | 0.02 |
| C3 | W10 | LEFT_REAR_MOTOR_DIR | computer.GPIO6 | motor_driver_1.DIR2 | 26 | blue | 0.02 | 0.02 |
| C4 | W11 | LEFT_FRONT_MOTOR_PHASE_A | motor_driver_1.M1A | left_front_motor.Motor (red) | 20 | orange | 1.4 | 5.5 |
| C4 | W12 | LEFT_FRONT_MOTOR_PHASE_B | motor_driver_1.M1B | left_front_motor.Motor (black) | 20 | orange | 1.4 | 5.5 |
| C5 | W13 | LEFT_FRONT_MOTOR_ENC_VCC | computer.3V3 | left_front_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C5 | W14 | GND | computer.GND | left_front_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C5 | W15 | LEFT_FRONT_MOTOR_ENC_A | computer.GPIO18 | left_front_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C5 | W16 | LEFT_FRONT_MOTOR_ENC_B | computer.GPIO19 | left_front_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C6 | W17 | LEFT_REAR_MOTOR_PHASE_A | motor_driver_1.M2A | left_rear_motor.Motor (red) | 18 | orange | 1.4 | 5.5 |
| C6 | W18 | LEFT_REAR_MOTOR_PHASE_B | motor_driver_1.M2B | left_rear_motor.Motor (black) | 18 | orange | 1.4 | 5.5 |
| C7 | W19 | LEFT_REAR_MOTOR_ENC_VCC | computer.3V3 | left_rear_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C7 | W20 | GND | computer.GND | left_rear_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C7 | W21 | LEFT_REAR_MOTOR_ENC_A | computer.GPIO16 | left_rear_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C7 | W22 | LEFT_REAR_MOTOR_ENC_B | computer.GPIO20 | left_rear_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C8 | W23 | GND | motor_driver_2.GND | computer.GND | 24 | black | 0.01 | 0.01 |
| C8 | W24 | RIGHT_FRONT_MOTOR_PWM | computer.GPIO21 | motor_driver_2.PWM1 | 26 | blue | 0.02 | 0.02 |
| C8 | W25 | RIGHT_FRONT_MOTOR_DIR | computer.GPIO26 | motor_driver_2.DIR1 | 26 | blue | 0.02 | 0.02 |
| C8 | W26 | RIGHT_REAR_MOTOR_PWM | computer.GPIO22 | motor_driver_2.PWM2 | 26 | blue | 0.02 | 0.02 |
| C8 | W27 | RIGHT_REAR_MOTOR_DIR | computer.GPIO23 | motor_driver_2.DIR2 | 26 | blue | 0.02 | 0.02 |
| C9 | W28 | RIGHT_FRONT_MOTOR_PHASE_A | motor_driver_2.M1A | right_front_motor.Motor (red) | 20 | orange | 1.4 | 5.5 |
| C9 | W29 | RIGHT_FRONT_MOTOR_PHASE_B | motor_driver_2.M1B | right_front_motor.Motor (black) | 20 | orange | 1.4 | 5.5 |
| C10 | W30 | RIGHT_FRONT_MOTOR_ENC_VCC | computer.3V3 | right_front_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C10 | W31 | GND | computer.GND | right_front_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C10 | W32 | RIGHT_FRONT_MOTOR_ENC_A | computer.GPIO17 | right_front_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C10 | W33 | RIGHT_FRONT_MOTOR_ENC_B | computer.GPIO27 | right_front_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C11 | W34 | RIGHT_REAR_MOTOR_PHASE_A | motor_driver_2.M2A | right_rear_motor.Motor (red) | 22 | orange | 1.4 | 5.5 |
| C11 | W35 | RIGHT_REAR_MOTOR_PHASE_B | motor_driver_2.M2B | right_rear_motor.Motor (black) | 22 | orange | 1.4 | 5.5 |
| C12 | W36 | RIGHT_REAR_MOTOR_ENC_VCC | computer.3V3 | right_rear_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C12 | W37 | GND | computer.GND | right_rear_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C12 | W38 | RIGHT_REAR_MOTOR_ENC_A | computer.GPIO24 | right_rear_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C12 | W39 | RIGHT_REAR_MOTOR_ENC_B | computer.GPIO25 | right_rear_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C13 | W40 | BUS_SERVO_BUS | servo_bus.SIG | servo_bus_hub.P1 | 26 | yellow | 0.02 | 0.02 |
| C14 | W41 | BUS_SERVO_BUS | servo_bus_hub.P2 | head_pan_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C15 | W42 | BUS_SERVO_BUS | servo_bus_hub.P2 | left_arm_base_yaw_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C16 | W43 | VBAT | left_arm_base_yaw_actuator.VCC | left_arm_shoulder_pitch_actuator.VCC | 22 | red | 1.55 | 5.1 |
| C16 | W44 | GND | left_arm_base_yaw_actuator.GND | left_arm_shoulder_pitch_actuator.GND | 22 | black | 1.55 | 5.1 |
| C16 | W45 | BUS_SERVO_BUS | left_arm_base_yaw_actuator.DATA | left_arm_shoulder_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C17 | W46 | VBAT | left_arm_shoulder_pitch_actuator.VCC | left_arm_elbow_pitch_actuator.VCC | 22 | red | 0.9 | 3.15 |
| C17 | W47 | GND | left_arm_shoulder_pitch_actuator.GND | left_arm_elbow_pitch_actuator.GND | 22 | black | 0.9 | 3.15 |
| C17 | W48 | BUS_SERVO_BUS | left_arm_shoulder_pitch_actuator.DATA | left_arm_elbow_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C18 | W49 | VBAT | left_arm_elbow_pitch_actuator.VCC | left_arm_wrist_pitch_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C18 | W50 | GND | left_arm_elbow_pitch_actuator.GND | left_arm_wrist_pitch_actuator.GND | 24 | black | 0.45 | 2.7 |
| C18 | W51 | BUS_SERVO_BUS | left_arm_elbow_pitch_actuator.DATA | left_arm_wrist_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C19 | W52 | BUS_SERVO_BUS | servo_bus_hub.P2 | right_arm_base_yaw_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C20 | W53 | VBAT | right_arm_base_yaw_actuator.VCC | right_arm_shoulder_pitch_actuator.VCC | 22 | red | 1.55 | 5.1 |
| C20 | W54 | GND | right_arm_base_yaw_actuator.GND | right_arm_shoulder_pitch_actuator.GND | 22 | black | 1.55 | 5.1 |
| C20 | W55 | BUS_SERVO_BUS | right_arm_base_yaw_actuator.DATA | right_arm_shoulder_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C21 | W56 | VBAT | right_arm_shoulder_pitch_actuator.VCC | right_arm_elbow_pitch_actuator.VCC | 22 | red | 0.9 | 3.15 |
| C21 | W57 | GND | right_arm_shoulder_pitch_actuator.GND | right_arm_elbow_pitch_actuator.GND | 22 | black | 0.9 | 3.15 |
| C21 | W58 | BUS_SERVO_BUS | right_arm_shoulder_pitch_actuator.DATA | right_arm_elbow_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C22 | W59 | VBAT | right_arm_elbow_pitch_actuator.VCC | right_arm_wrist_pitch_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C22 | W60 | GND | right_arm_elbow_pitch_actuator.GND | right_arm_wrist_pitch_actuator.GND | 24 | black | 0.45 | 2.7 |
| C22 | W61 | BUS_SERVO_BUS | right_arm_elbow_pitch_actuator.DATA | right_arm_wrist_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C23 | W62 | SERVO_BUS_USB | servo_bus.VBUS | computer.LINK | made | red | 0.05 | 0.1 |
| C24 | W63 | VBAT | battery.BAT+ | main_fuse.IN | 12 | red | 10.701 | 27.001 |
| C25 | W64 | VBAT | main_fuse.OUT | main_switch.IN | 12 | red | 10.701 | 27.001 |
| C26 | W65 | GND | battery.BAT- | star_ground.P1 | 12 | black | 10.701 | 27.001 |
| C27 | W66 | VBAT | main_switch.OUT | splice_vbat.P1 | 12 | red | 10.701 | 27.001 |
| C28 | W67 | VBAT | splice_vbat.P2 | regulator_5v.VIN | 22 | red | 0.501 | 2.503 |
| C28 | W68 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0.501 | 2.503 |
| C29 | W69 | VBAT | splice_vbat.P2 | motor_driver_1.POWER+ | 18 | red | 2.85 | 11 |
| C29 | W70 | GND | star_ground.P2 | motor_driver_1.POWER- | 18 | black | 2.85 | 11 |
| C30 | W71 | VBAT | splice_vbat.P2 | motor_driver_2.POWER+ | 18 | red | 2.85 | 11 |
| C30 | W72 | GND | star_ground.P2 | motor_driver_2.POWER- | 18 | black | 2.85 | 11 |
| C31 | W73 | VBAT | splice_vbat.P2 | servo_bus.VIN | 22 | red | 0.05 | 0.1 |
| C31 | W74 | GND | star_ground.P2 | servo_bus.GND | 24 | black | 0.05 | 0.1 |
| C32 | W75 | VBAT | splice_vbat.P2 | head_pan_actuator.VCC | 22 | red | 0.45 | 2.7 |
| C32 | W76 | GND | star_ground.P2 | head_pan_actuator.GND | 20 | black | 0.45 | 2.7 |
| C33 | W77 | VBAT | splice_vbat.P2 | left_arm_base_yaw_actuator.VCC | 22 | red | 2 | 5.55 |
| C33 | W78 | GND | star_ground.P2 | left_arm_base_yaw_actuator.GND | 18 | black | 2 | 5.55 |
| C34 | W79 | VBAT | splice_vbat.P2 | right_arm_base_yaw_actuator.VCC | 22 | red | 2 | 5.55 |
| C34 | W80 | GND | star_ground.P2 | right_arm_base_yaw_actuator.GND | 18 | black | 2 | 5.55 |
| C35 | W81 | GND | regulator_5v.GND | star_ground.P2 | 22 | black | 1 | 5 |
| C36 | W82 | 5V | regulator_5v.VOUT | computer.5V | 22 | red | 1 | 5 |
| C36 | W83 | GND | star_ground.P2 | computer.GND | 22 | black | 1 | 5 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | head_camera to computer | 1 | 1125 | 1081.5 | 0 | 40 | 0 | FFC | electronics_enclosure.deck_left |
| C2 | computer to imu | 4 | 185 | 80.9 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | - |
| C3 | motor_driver_1 to computer | 5 | 225 | 124.1 | 40 | 0 | 60 | 5-pin 2.54 mm header / 40-pin header | - |
| C4 | motor_driver_1 channel 1 to left_front_motor | 2 | 460 | 358.5 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | electronics_enclosure.deck_left |
| C5 | left_front_motor encoder to computer | 4 | 405 | 301.9 | 40 | 0 | 60 | 40-pin header / 1x6 female header | electronics_enclosure.deck_left |
| C6 | motor_driver_1 channel 2 to left_rear_motor | 2 | 695 | 590.7 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | electronics_enclosure.rear_slot |
| C7 | left_rear_motor encoder to computer | 4 | 575 | 470.7 | 40 | 0 | 60 | 40-pin header / 1x6 female header | electronics_enclosure.rear_slot |
| C8 | motor_driver_2 to computer | 5 | 295 | 193.4 | 40 | 0 | 60 | 5-pin 2.54 mm header / 40-pin header | - |
| C9 | motor_driver_2 channel 1 to right_front_motor | 2 | 465 | 362.5 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | electronics_enclosure.deck_left |
| C10 | right_front_motor encoder to computer | 4 | 365 | 264.1 | 40 | 0 | 60 | 40-pin header / 1x6 female header | electronics_enclosure.deck_left |
| C11 | motor_driver_2 channel 2 to right_rear_motor | 2 | 235 | 133.6 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | electronics_enclosure.rear_slot |
| C12 | right_rear_motor encoder to computer | 4 | 420 | 316.2 | 40 | 0 | 60 | 40-pin header / 1x6 female header | electronics_enclosure.rear_slot |
| C13 | servo_bus to servo_bus_hub | 1 | 370 | 265.3 | 40 | 0 | 60 | 3-pin 2.5 mm bus servo header (5264 class) / lever clamp | electronics_enclosure.rear_slot |
| C14 | servo_bus_hub to head_pan_actuator | 1 | 960 | 858.1 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C15 | servo_bus_hub to left_arm_base_yaw_actuator | 1 | 940 | 838.7 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C16 | left_arm_base_yaw_actuator to left_arm_shoulder_pitch_actuator | 3 | 265 | 82.3 | 40 | 80 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C17 | left_arm_shoulder_pitch_actuator to left_arm_elbow_pitch_actuator | 3 | 370 | 206.1 | 40 | 60 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C18 | left_arm_elbow_pitch_actuator to left_arm_wrist_pitch_actuator | 3 | 380 | 206.1 | 40 | 70 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C19 | servo_bus_hub to right_arm_base_yaw_actuator | 1 | 860 | 759.9 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C20 | right_arm_base_yaw_actuator to right_arm_shoulder_pitch_actuator | 3 | 265 | 82.3 | 40 | 80 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C21 | right_arm_shoulder_pitch_actuator to right_arm_elbow_pitch_actuator | 3 | 370 | 206.1 | 40 | 60 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C22 | right_arm_elbow_pitch_actuator to right_arm_wrist_pitch_actuator | 3 | 380 | 206.1 | 40 | 70 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C23 | servo_bus to computer | 1 | 115 | 111.6 | 0 | 0 | 0 | USB | - |
| C24 | battery positive to main fuse | 1 | 100 | 0 | 40 | 0 | 60 | XT60 / soldered leads | - |
| C25 | main fuse to main switch | 1 | 390 | 289 | 40 | 0 | 60 | soldered leads / 6.3 mm quick-connect tabs | electronics_enclosure.deck_left |
| C26 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | XT60 / lever clamp | - |
| C27 | main_switch to the VBAT splice | 1 | 100 | 0 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / lever clamp | - |
| C28 | VBAT to regulator_5v | 2 | 260 | 156.3 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | electronics_enclosure.deck_left |
| C29 | VBAT to motor_driver_1 | 2 | 370 | 265.4 | 40 | 0 | 60 | lever clamp / 2-position screw terminal | electronics_enclosure.deck_left |
| C30 | VBAT to motor_driver_2 | 2 | 410 | 307.7 | 40 | 0 | 60 | lever clamp / 2-position screw terminal | electronics_enclosure.deck_left |
| C31 | VBAT to servo_bus | 2 | 335 | 234.7 | 40 | 0 | 60 | lever clamp / green screw terminal | electronics_enclosure.deck_left |
| C32 | VBAT to head_pan_actuator | 2 | 955 | 851.7 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C33 | VBAT to left_arm_base_yaw_actuator | 2 | 900 | 799.1 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C34 | VBAT to right_arm_base_yaw_actuator | 2 | 885 | 782 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C35 | regulator_5v to star_ground | 1 | 240 | 138.1 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C36 | 5V to computer | 2 | 165 | 63.7 | 40 | 0 | 60 | 0.1 in through holes / 40-pin header | - |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C1 | head_pan | -1.4 to 1.4 | 10.7 | 30.3 | 40 |
| C16 | left_arm_base_yaw | -2.97 to 2.97 | 23.1 | 63.5 | 80 |
| C17 | left_arm_shoulder_pitch | -1.75 to 1.75 | 44.3 | 68.3 | 60 |
| C18 | left_arm_elbow_pitch | -2.3 to 2.3 | 44.3 | 75.9 | 70 |
| C20 | right_arm_base_yaw | -2.97 to 2.97 | 23.1 | 63.5 | 80 |
| C21 | right_arm_shoulder_pitch | -1.75 to 1.75 | 44.3 | 68.3 | 60 |
| C22 | right_arm_elbow_pitch | -2.3 to 2.3 | 44.3 | 75.9 | 70 |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 12 AWG silicone wire | 0.8 | m | 2.2 | 1.76 | 3.308 mm2, rated 20.5 A in a bundle; 0.69 m cut + 10 % waste | estimated |
| 18 AWG silicone wire | 5.3 | m | 0.7 | 3.71 | 0.823 mm2, rated 8 A in a bundle; 4.74 m cut + 10 % waste | estimated |
| 20 AWG silicone wire | 3.1 | m | 0.5 | 1.55 | 0.519 mm2, rated 5.5 A in a bundle; 2.81 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 7.7 | m | 0.4 | 3.08 | 0.327 mm2, rated 3.5 A in a bundle; 6.92 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 7.2 | m | 0.35 | 2.52 | 0.205 mm2, rated 1.75 A in a bundle; 6.53 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 12.3 | m | 0.3 | 3.69 | 0.128 mm2, rated 1.1 A in a bundle; 11.14 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 46 | pc | 0.02 | 0.92 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 11 | pc | 0.02 | 0.22 | one per cable end | estimated |
| Bootlace ferrule contacts | 14 | pc | 0.03 | 0.42 | rated 17.5 A per contact | estimated |
| Molex 5264 contacts | 46 | pc | 0.05 | 2.30 | rated 3 A per contact | estimated |
| Molex 5264 housings | 19 | pc | 0.08 | 1.52 | one per cable end | estimated |
| XT60 contacts | 2 | pc | 0.9 | 1.80 | rated 35 A per contact | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 3.1 | m | 0.2 | 0.62 | 31 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 66 | pc | 0.02 | 1.32 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 9.5 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 1.2 | m | 0.4 | 0.48 | over every cable where it crosses a joint | estimated |
| FFC | 1 | pc | 3 | 3.00 | head_camera to computer | estimated |
| USB | 1 | pc | 3 | 3.00 | servo_bus to computer | estimated |
| 15 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 3 | pc | 0.25 | 0.75 | plus spares | estimated |
| 3 A ATM blade fuse | 2 | pc | 0.25 | 0.50 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Adafruit BNO085 9-DoF IMU breakout | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.ceva-ip.com/wp-content/uploads/BNO080_085-Datasheet.pdf) | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.adafruit.com/product/4754) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator | [datasheet](https://www.pololu.com/product/4091/specs) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) |
| Cytron MDD10A dual-channel 10 A DC motor driver | estimated | estimated | estimated | estimated |
| Feetech STS3215 C047 12 V 30 kg.cm | [datasheet](https://files.seeedstudio.com/Bazaar/product_pdf/108090003.pdf) | estimated | [datasheet](https://files.waveshare.com/wiki/Bus-Servo-Adapter-(A)/Bus%20Servo%20Adapter%20(A)-Sch.pdf) | estimated |
| Feetech STS3250 C002 12 V 50 kg.cm | [datasheet](https://evelta.com/12v-50kg-360deg-magnetic-encoder-double-shaft-ttl-servo) | estimated | [datasheet](https://files.waveshare.com/wiki/Bus-Servo-Adapter-(A)/Bus%20Servo%20Adapter%20(A)-Sch.pdf) | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| LiPo 3S 2200 mAh 25C, XT60 | estimated | estimated | estimated | estimated |
| Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder | estimated | estimated | [datasheet](https://www.pololu.com/product/4752) | [datasheet](https://www.pololu.com/file/0J1735/37d-metal-gearmotors-dimension-diagram.pdf) |
| Raspberry Pi 5 | estimated | [datasheet](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html) | estimated | [datasheet](https://pip.raspberrypi.com/documents/RP-008348-DS-raspberry-pi-5-product-brief.pdf) |
| Raspberry Pi Camera Module 3 | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated |
| KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
| Waveshare Bus Servo Adapter | [datasheet](https://www.waveshare.com/bus-servo-adapter-a.htm) | estimated | estimated | [datasheet](https://www.waveshare.com/wiki/Bus_Servo_Adapter_(A)) |
