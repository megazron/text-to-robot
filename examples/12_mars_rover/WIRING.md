# Wiring: rover_arm

35 cables, 77 conductors, 26.57 m of wire, wiring parts $35.09.

Diagram: [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 11.1 | main_switch | 35 / 70 | 10.806 / 27.106 | 3.2x | 15 | 0.305 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 0.1 / 0.5 | 55.0x | - | 0.008 |

**VBAT loads** (peak assumes two drive motors stalling at once, the rest running):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator_5v | 0.05 | 0.25 |
| computer | 1.756 | 2.93 |
| motor_driver_1 | 2.85 | 11 |
| motor_driver_2 | 2.85 | 11 |
| servo_bus | 0.05 | 0.1 |
| arm_base_yaw_actuator | 2.55 | 6.7 |
| arm_wrist_roll_actuator | 0.7 | 2.65 |

**5V loads** (peak assumes the computer at its peak and every sensor running):

| Load | Typical A | Peak A |
|---|--:|--:|
| io_controller | 0.1 | 0.5 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 15 A ATM blade fuse, inline holder, protects everything on VBAT (12 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch regulator_5v (22 AWG).
- Fuse **F3**: 3 A ATM blade fuse, inline holder, protects branch computer (22 AWG).
- Fuse **F4**: 2 A ATM blade fuse, inline holder, protects branch servo_bus (22 AWG).
- Fuse **F5**: 4 A ATM blade fuse, inline holder, protects branch arm_base_yaw_actuator (20 AWG).
- Fuse **F6**: 2 A ATM blade fuse, inline holder, protects branch arm_wrist_roll_actuator (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | DEPTH_CAMERA_USB | depth_camera.VBUS | computer.LINK | made | red | 0.61 | 0.68 |
| C2 | W2 | MAST_CAMERA_CSI | mast_camera.GND | computer.LINK | made | black | 0.2 | 0.25 |
| C3 | W3 | IO_USB | io_controller.VBUS | computer.LINK | made | red | 0.05 | 0.1 |
| C4 | W4 | GND | motor_driver_1.GND | io_controller.G | 24 | black | 0.01 | 0.01 |
| C4 | W5 | LEFT_FRONT_MOTOR_PWM | io_controller.4 | motor_driver_1.PWM1 | 26 | blue | 0.02 | 0.02 |
| C4 | W6 | LEFT_FRONT_MOTOR_DIR | io_controller.5 | motor_driver_1.DIR1 | 26 | blue | 0.02 | 0.02 |
| C4 | W7 | LEFT_REAR_MOTOR_PWM | io_controller.15 | motor_driver_1.PWM2 | 26 | blue | 0.02 | 0.02 |
| C4 | W8 | LEFT_REAR_MOTOR_DIR | io_controller.16 | motor_driver_1.DIR2 | 26 | blue | 0.02 | 0.02 |
| C5 | W9 | LEFT_FRONT_MOTOR_PHASE_A | motor_driver_1.M1A | left_front_motor.Motor (red) | 20 | orange | 1.4 | 5.5 |
| C5 | W10 | LEFT_FRONT_MOTOR_PHASE_B | motor_driver_1.M1B | left_front_motor.Motor (black) | 20 | orange | 1.4 | 5.5 |
| C6 | W11 | LEFT_FRONT_MOTOR_ENC_VCC | io_controller.3V3 | left_front_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C6 | W12 | GND | io_controller.G | left_front_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C6 | W13 | LEFT_FRONT_MOTOR_ENC_A | io_controller.6 | left_front_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C6 | W14 | LEFT_FRONT_MOTOR_ENC_B | io_controller.7 | left_front_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C7 | W15 | LEFT_REAR_MOTOR_PHASE_A | motor_driver_1.M2A | left_rear_motor.Motor (red) | 20 | orange | 1.4 | 5.5 |
| C7 | W16 | LEFT_REAR_MOTOR_PHASE_B | motor_driver_1.M2B | left_rear_motor.Motor (black) | 20 | orange | 1.4 | 5.5 |
| C8 | W17 | LEFT_REAR_MOTOR_ENC_VCC | io_controller.3V3 | left_rear_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C8 | W18 | GND | io_controller.G | left_rear_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C8 | W19 | LEFT_REAR_MOTOR_ENC_A | io_controller.17 | left_rear_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C8 | W20 | LEFT_REAR_MOTOR_ENC_B | io_controller.18 | left_rear_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C9 | W21 | GND | motor_driver_2.GND | io_controller.G | 24 | black | 0.01 | 0.01 |
| C9 | W22 | RIGHT_FRONT_MOTOR_PWM | io_controller.8 | motor_driver_2.PWM1 | 26 | blue | 0.02 | 0.02 |
| C9 | W23 | RIGHT_FRONT_MOTOR_DIR | io_controller.3 | motor_driver_2.DIR1 | 26 | blue | 0.02 | 0.02 |
| C9 | W24 | RIGHT_REAR_MOTOR_PWM | io_controller.11 | motor_driver_2.PWM2 | 26 | blue | 0.02 | 0.02 |
| C9 | W25 | RIGHT_REAR_MOTOR_DIR | io_controller.12 | motor_driver_2.DIR2 | 26 | blue | 0.02 | 0.02 |
| C10 | W26 | RIGHT_FRONT_MOTOR_PHASE_A | motor_driver_2.M1A | right_front_motor.Motor (red) | 22 | orange | 1.4 | 5.5 |
| C10 | W27 | RIGHT_FRONT_MOTOR_PHASE_B | motor_driver_2.M1B | right_front_motor.Motor (black) | 22 | orange | 1.4 | 5.5 |
| C11 | W28 | RIGHT_FRONT_MOTOR_ENC_VCC | io_controller.3V3 | right_front_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C11 | W29 | GND | io_controller.G | right_front_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C11 | W30 | RIGHT_FRONT_MOTOR_ENC_A | io_controller.9 | right_front_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C11 | W31 | RIGHT_FRONT_MOTOR_ENC_B | io_controller.10 | right_front_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C12 | W32 | RIGHT_REAR_MOTOR_PHASE_A | motor_driver_2.M2A | right_rear_motor.Motor (red) | 20 | orange | 1.4 | 5.5 |
| C12 | W33 | RIGHT_REAR_MOTOR_PHASE_B | motor_driver_2.M2B | right_rear_motor.Motor (black) | 20 | orange | 1.4 | 5.5 |
| C13 | W34 | RIGHT_REAR_MOTOR_ENC_VCC | io_controller.3V3 | right_rear_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C13 | W35 | GND | io_controller.G | right_rear_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C13 | W36 | RIGHT_REAR_MOTOR_ENC_A | io_controller.13 | right_rear_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C13 | W37 | RIGHT_REAR_MOTOR_ENC_B | io_controller.14 | right_rear_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C14 | W38 | BUS_SERVO_BUS | servo_bus.SIG | servo_bus_hub.P1 | 26 | yellow | 0.02 | 0.02 |
| C15 | W39 | BUS_SERVO_BUS | servo_bus_hub.P2 | arm_base_yaw_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C16 | W40 | VBAT | arm_base_yaw_actuator.VDD | arm_shoulder_pitch_actuator.VDD | 20 | red | 2.2 | 6.35 |
| C16 | W41 | GND | arm_base_yaw_actuator.GND | arm_shoulder_pitch_actuator.GND | 20 | black | 2.2 | 6.35 |
| C16 | W42 | BUS_SERVO_BUS | arm_base_yaw_actuator.DATA | arm_shoulder_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C17 | W43 | VBAT | arm_shoulder_pitch_actuator.VDD | arm_elbow_pitch_actuator.VDD | 22 | red | 1.45 | 5.6 |
| C17 | W44 | GND | arm_shoulder_pitch_actuator.GND | arm_elbow_pitch_actuator.GND | 22 | black | 1.45 | 5.6 |
| C17 | W45 | BUS_SERVO_BUS | arm_shoulder_pitch_actuator.DATA | arm_elbow_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C18 | W46 | VBAT | arm_elbow_pitch_actuator.VDD | arm_forearm_roll_actuator.VDD | 24 | red | 0.7 | 2.65 |
| C18 | W47 | GND | arm_elbow_pitch_actuator.GND | arm_forearm_roll_actuator.GND | 24 | black | 0.7 | 2.65 |
| C18 | W48 | BUS_SERVO_BUS | arm_elbow_pitch_actuator.DATA | arm_forearm_roll_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C19 | W49 | VBAT | arm_forearm_roll_actuator.VDD | arm_wrist_pitch_actuator.VDD | 24 | red | 0.35 | 2.3 |
| C19 | W50 | GND | arm_forearm_roll_actuator.GND | arm_wrist_pitch_actuator.GND | 24 | black | 0.35 | 2.3 |
| C19 | W51 | BUS_SERVO_BUS | arm_forearm_roll_actuator.DATA | arm_wrist_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C20 | W52 | VBAT | arm_wrist_roll_actuator.VDD | arm_gripper_actuator.VDD | 24 | red | 0.35 | 2.3 |
| C20 | W53 | GND | arm_wrist_roll_actuator.GND | arm_gripper_actuator.GND | 24 | black | 0.35 | 2.3 |
| C20 | W54 | BUS_SERVO_BUS | arm_wrist_roll_actuator.DATA | arm_gripper_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C21 | W55 | BUS_SERVO_BUS | arm_wrist_pitch_actuator.DATA | arm_wrist_roll_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C22 | W56 | SERVO_BUS_USB | servo_bus.VBUS | computer.LINK | made | red | 0.05 | 0.1 |
| C23 | W57 | VBAT | battery.BAT+ | main_fuse.IN | 12 | red | 10.806 | 27.106 |
| C24 | W58 | VBAT | main_fuse.OUT | main_switch.IN | 12 | red | 10.806 | 27.106 |
| C25 | W59 | GND | battery.BAT- | star_ground.P1 | 12 | black | 10.806 | 27.106 |
| C26 | W60 | VBAT | main_switch.OUT | splice_vbat.P1 | 12 | red | 10.806 | 27.106 |
| C27 | W61 | VBAT | splice_vbat.P2 | regulator_5v.VIN | 22 | red | 0.05 | 0.25 |
| C27 | W62 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0.05 | 0.25 |
| C28 | W63 | VBAT | splice_vbat.P2 | computer.DC_IN | 22 | red | 1.756 | 2.93 |
| C28 | W64 | GND | star_ground.P2 | computer.GND | 22 | black | 1.756 | 2.93 |
| C29 | W65 | VBAT | splice_vbat.P2 | motor_driver_1.POWER+ | 18 | red | 2.85 | 11 |
| C29 | W66 | GND | star_ground.P2 | motor_driver_1.POWER- | 18 | black | 2.85 | 11 |
| C30 | W67 | VBAT | splice_vbat.P2 | motor_driver_2.POWER+ | 18 | red | 2.85 | 11 |
| C30 | W68 | GND | star_ground.P2 | motor_driver_2.POWER- | 18 | black | 2.85 | 11 |
| C31 | W69 | VBAT | splice_vbat.P2 | servo_bus.VIN | 22 | red | 0.05 | 0.1 |
| C31 | W70 | GND | star_ground.P2 | servo_bus.GND | 24 | black | 0.05 | 0.1 |
| C32 | W71 | VBAT | splice_vbat.P2 | arm_base_yaw_actuator.VDD | 20 | red | 2.55 | 6.7 |
| C32 | W72 | GND | star_ground.P2 | arm_base_yaw_actuator.GND | 20 | black | 2.55 | 6.7 |
| C33 | W73 | VBAT | splice_vbat.P2 | arm_wrist_roll_actuator.VDD | 22 | red | 0.7 | 2.65 |
| C33 | W74 | GND | star_ground.P2 | arm_wrist_roll_actuator.GND | 20 | black | 0.7 | 2.65 |
| C34 | W75 | GND | regulator_5v.GND | star_ground.P2 | 24 | black | 0.1 | 0.5 |
| C35 | W76 | 5V | regulator_5v.VOUT | io_controller.5V | 24 | red | 0.1 | 0.5 |
| C35 | W77 | GND | star_ground.P2 | io_controller.G | 24 | black | 0.1 | 0.5 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | depth_camera to computer | 1 | 425 | 421.8 | 0 | 0 | 0 | USB-C | body_bay.left_rocker |
| C2 | mast_camera to computer | 1 | 380 | 375.9 | 0 | 0 | 0 | FFC | body_bay.lid_leads |
| C3 | io_controller to computer | 1 | 210 | 208.6 | 0 | 0 | 0 | USB | - |
| C4 | motor_driver_1 to io_controller | 5 | 170 | 65.5 | 40 | 0 | 60 | 5-pin 2.54 mm header / 22-pin male header | - |
| C5 | motor_driver_1 channel 1 to left_front_motor | 2 | 570 | 431.7 | 40 | 35 | 60 | 2-position screw terminal / 1x6 female header | body_bay.left_rocker |
| C6 | left_front_motor encoder to io_controller | 4 | 515 | 369.3 | 40 | 45 | 60 | 22-pin male header / 1x6 female header | body_bay.left_rocker |
| C7 | motor_driver_1 channel 2 to left_rear_motor | 2 | 585 | 449 | 40 | 35 | 60 | 2-position screw terminal / 1x6 female header | body_bay.left_rocker |
| C8 | left_rear_motor encoder to io_controller | 4 | 535 | 388 | 40 | 45 | 60 | 22-pin male header / 1x6 female header | body_bay.left_rocker |
| C9 | motor_driver_2 to io_controller | 5 | 195 | 94 | 40 | 0 | 60 | 5-pin 2.54 mm header / 22-pin male header | - |
| C10 | motor_driver_2 channel 1 to right_front_motor | 2 | 420 | 317.1 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | body_bay.right_rocker |
| C11 | right_front_motor encoder to io_controller | 4 | 410 | 307.9 | 40 | 0 | 60 | 22-pin male header / 1x6 female header | body_bay.right_rocker |
| C12 | motor_driver_2 channel 2 to right_rear_motor | 2 | 480 | 379.5 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | body_bay.right_rocker |
| C13 | right_rear_motor encoder to io_controller | 4 | 475 | 370.4 | 40 | 0 | 60 | 22-pin male header / 1x6 female header | body_bay.right_rocker |
| C14 | servo_bus to servo_bus_hub | 1 | 340 | 236.4 | 40 | 0 | 60 | 3-pin 2.5 mm bus servo header (5264 class) / lever clamp | body_bay.left_rocker |
| C15 | servo_bus_hub to arm_base_yaw_actuator | 1 | 245 | 144.1 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | - |
| C16 | arm_base_yaw_actuator to arm_shoulder_pitch_actuator | 3 | 275 | 92.1 | 40 | 80 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C17 | arm_shoulder_pitch_actuator to arm_elbow_pitch_actuator | 3 | 330 | 163.1 | 40 | 65 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C18 | arm_elbow_pitch_actuator to arm_forearm_roll_actuator | 3 | 330 | 150.3 | 40 | 75 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C19 | arm_forearm_roll_actuator to arm_wrist_pitch_actuator | 3 | 265 | 84.4 | 40 | 80 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C20 | arm_wrist_roll_actuator to arm_gripper_actuator | 3 | 265 | 84.4 | 40 | 80 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C21 | arm_wrist_pitch_actuator to arm_wrist_roll_actuator | 1 | 265 | 110.3 | 40 | 50 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C22 | servo_bus to computer | 1 | 200 | 196.5 | 0 | 0 | 0 | USB | - |
| C23 | battery positive to main fuse | 1 | 100 | 0 | 40 | 0 | 60 | XT60 (male discharge plug on the pack per the listing) / soldered leads | - |
| C24 | main fuse to main switch | 1 | 420 | 318.9 | 40 | 0 | 60 | soldered leads / 6.3 mm quick-connect tabs | body_bay.left_rocker |
| C25 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | XT60 (male discharge plug on the pack per the listing) / lever clamp | - |
| C26 | main_switch to the VBAT splice | 1 | 100 | 0 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / lever clamp | - |
| C27 | VBAT to regulator_5v | 2 | 325 | 221.4 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | body_bay.left_rocker |
| C28 | VBAT to computer | 2 | 400 | 296.2 | 40 | 0 | 60 | lever clamp / Singatron 2DC-0005D206F DC power jack (J16) | body_bay.left_rocker |
| C29 | VBAT to motor_driver_1 | 2 | 395 | 294.7 | 40 | 0 | 60 | lever clamp / 2-position screw terminal | body_bay.left_rocker |
| C30 | VBAT to motor_driver_2 | 2 | 320 | 216.2 | 40 | 0 | 60 | lever clamp / 2-position screw terminal | body_bay.left_rocker |
| C31 | VBAT to servo_bus | 2 | 295 | 193.7 | 40 | 0 | 60 | lever clamp / green screw terminal | body_bay.left_rocker |
| C32 | VBAT to arm_base_yaw_actuator | 2 | 280 | 178.2 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | - |
| C33 | VBAT to arm_wrist_roll_actuator | 2 | 1140 | 678.4 | 40 | 360 | 60 | lever clamp / JST B3B-EH-A header | - |
| C34 | regulator_5v to star_ground | 1 | 310 | 209.4 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C35 | 5V to io_controller | 2 | 155 | 53.7 | 40 | 0 | 60 | 0.1 in through holes / 22-pin male header | - |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C5 | left_rocker_pivot | -0.35 to 0.35 | 18.4 | 24 | 35 |
| C6 | left_rocker_pivot | -0.35 to 0.35 | 22.2 | 28.9 | 45 |
| C7 | left_rocker_pivot | -0.35 to 0.35 | 47.9 | 53.5 | 35 |
| C8 | left_rocker_pivot | -0.35 to 0.35 | 57.8 | 64.5 | 45 |
| C16 | arm_base_yaw | -2.97 to 2.97 | 23.1 | 63.5 | 80 |
| C17 | arm_shoulder_pitch | -1.75 to 1.75 | 48.5 | 75.3 | 65 |
| C18 | arm_elbow_pitch | -2.3 to 2.3 | 46.5 | 81.8 | 75 |
| C19 | arm_forearm_roll | -2.97 to 2.97 | 23.1 | 63.5 | 80 |
| C20 | arm_wrist_roll | -2.97 to 2.97 | 23.1 | 63.5 | 80 |
| C21 | arm_wrist_pitch | -2.3 to 2.3 | 35.7 | 63.2 | 50 |
| C33 | arm_base_yaw | -2.97 to 2.97 | 11.5 | 58.9 | 80 |
| C33 | arm_shoulder_pitch | -1.75 to 1.75 | 50.1 | 78 | 60 |
| C33 | arm_elbow_pitch | -2.3 to 2.3 | 50.1 | 86.8 | 70 |
| C33 | arm_forearm_roll | -2.97 to 2.97 | 48.9 | 95.1 | 80 |
| C33 | arm_wrist_pitch | -2.3 to 2.3 | 47.2 | 83.9 | 70 |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 12 AWG silicone wire | 0.8 | m | 2.2 | 1.76 | 3.308 mm2, rated 20.5 A in a bundle; 0.72 m cut + 10 % waste | estimated |
| 18 AWG silicone wire | 1.6 | m | 0.7 | 1.12 | 0.823 mm2, rated 8 A in a bundle; 1.43 m cut + 10 % waste | estimated |
| 20 AWG silicone wire | 6.1 | m | 0.5 | 3.05 | 0.519 mm2, rated 5.5 A in a bundle; 5.52 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 4.5 | m | 0.4 | 1.80 | 0.327 mm2, rated 3.5 A in a bundle; 4.06 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 8 | m | 0.35 | 2.80 | 0.205 mm2, rated 1.75 A in a bundle; 7.19 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 8.5 | m | 0.3 | 2.55 | 0.128 mm2, rated 1.1 A in a bundle; 7.64 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 38 | pc | 0.02 | 0.76 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 9 | pc | 0.02 | 0.18 | one per cable end | estimated |
| Bootlace ferrule contacts | 14 | pc | 0.03 | 0.42 | rated 17.5 A per contact | estimated |
| Molex 5264 contacts | 1 | pc | 0.05 | 0.05 | rated 3 A per contact | estimated |
| Molex 5264 housings | 1 | pc | 0.08 | 0.08 | one per cable end | estimated |
| JST EH 2.5 mm contacts | 37 | pc | 0.03 | 1.11 | rated 3 A per contact | estimated |
| JST EH 2.5 mm housings | 15 | pc | 0.05 | 0.75 | one per cable end | estimated |
| XT60 contacts | 2 | pc | 0.9 | 1.80 | rated 35 A per contact | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 3.1 | m | 0.2 | 0.62 | 33 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 67 | pc | 0.02 | 1.34 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 3 | pc | 0.08 | 0.24 | 9.5 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 2.5 | m | 0.4 | 1.00 | over every cable where it crosses a joint | estimated |
| USB-C | 1 | pc | 3 | 3.00 | depth_camera to computer | estimated |
| FFC | 1 | pc | 3 | 3.00 | mast_camera to computer | estimated |
| USB | 1 | pc | 3 | 3.00 | io_controller to computer | estimated |
| USB | 1 | pc | 3 | 3.00 | servo_bus to computer | estimated |
| 15 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 3 | pc | 0.25 | 0.75 | plus spares | estimated |
| 3 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 4 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Pololu D36V50F5 5 V 5.5 A step-down regulator | [datasheet](https://www.pololu.com/product/4091/specs) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) |
| Cytron MDD10A dual-channel 10 A DC motor driver | estimated | estimated | estimated | estimated |
| DYNAMIXEL XH540-W270-T(R) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) |
| DYNAMIXEL XM430-W350-T(R) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/) |
| Espressif ESP32-S3-DevKitC-1 | estimated | [datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-s3-wroom-1_wroom-1u_datasheet_en.pdf) | estimated | [datasheet](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html) |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| NVIDIA Jetson Orin Nano Super Developer Kit | [datasheet](https://developer.nvidia.com/downloads/assets/embedded/secure/jetson/orin_nano/docs/jetson_orin_nano_devkit_carrier_board_specification_sp.pdf) | estimated | [datasheet](https://developer.nvidia.com/downloads/assets/embedded/secure/jetson/orin_nano/docs/jetson_orin_nano_devkit_carrier_board_specification_sp.pdf) | [datasheet](https://developer.nvidia.com/downloads/assets/embedded/secure/jetson/orin_nano/docs/jetson_orin_nano_devkit_carrier_board_specification_sp.pdf) |
| LiPo 3S 5000 mAh 60C, XT60 | estimated | [datasheet](https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug) | estimated | [datasheet](https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug) |
| Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder | estimated | estimated | [datasheet](https://www.pololu.com/product/4752) | [datasheet](https://www.pololu.com/file/0J1735/37d-metal-gearmotors-dimension-diagram.pdf) |
| Intel RealSense D435i depth camera + IMU | estimated | [datasheet](https://realsenseai.com/wp-content/uploads/2025/09/Intel-RealSense-D400-Series-Datasheet-October-2025.pdf) | estimated | [datasheet](https://realsenseai.com/wp-content/uploads/2025/09/Intel-RealSense-D400-Series-Datasheet-October-2025.pdf) |
| Raspberry Pi Camera Module 3 | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated |
| KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
| Waveshare Bus Servo Adapter | [datasheet](https://www.waveshare.com/bus-servo-adapter-a.htm) | estimated | estimated | [datasheet](https://www.waveshare.com/wiki/Bus_Servo_Adapter_(A)) |
