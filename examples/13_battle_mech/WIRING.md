# Wiring: battle_mech

74 cables, 140 conductors, 74.59 m of wire, wiring parts $256.48.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 44.4 | main_switch | 120 / 240 | 17.73 / 106.21 | 6.8x | 60 | 0.352 |
| 12V | 12 | dcdc_12v | 8.4 / 8.8 | 3.85 / 8.45 | 2.2x | - | 0.315 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 0 / 0 | -x | - | 0 |

**VBAT loads** (peak assumes four leg joints at peak at once, the rest walking (15 % of rated)):

| Load | Typical A | Peak A |
|---|--:|--:|
| dcdc_12v | 1.21 | 2.656 |
| dcdc_12v_2 | 0.5 | 2 |
| l_hip_yaw_actuator | 0.57 | 11.2 |
| l_hip_roll_actuator | 1.05 | 19 |
| l_hip_pitch_actuator | 1.05 | 19 |
| l_knee_actuator | 1.05 | 19 |
| l_ankle_pitch_actuator | 1.05 | 19 |
| l_ankle_roll_actuator | 1.08 | 23.2 |
| l_shoulder_pitch_actuator | 1.08 | 23.2 |
| l_shoulder_roll_actuator | 1.08 | 23.2 |
| r_hip_yaw_actuator | 0.57 | 11.2 |
| r_hip_roll_actuator | 1.05 | 19 |
| r_hip_pitch_actuator | 1.05 | 19 |
| r_knee_actuator | 1.05 | 19 |
| r_ankle_pitch_actuator | 1.05 | 19 |
| r_ankle_roll_actuator | 1.08 | 23.2 |
| r_shoulder_pitch_actuator | 1.08 | 23.2 |
| r_shoulder_roll_actuator | 1.08 | 23.2 |

**12V loads** (peak assumes one arm joint at peak, the rest holding (20 % of rated)):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator_5v | 0 | 0 |
| computer | 1.3 | 2.1 |
| l_upper_arm_yaw_actuator | 1.16 | 5.76 |
| r_upper_arm_yaw_actuator | 1.16 | 5.76 |
| neck_pan_actuator | 0.22 | 2.38 |

**5V loads** (peak assumes every load at its peak at once):

| Load | Typical A | Peak A |
|---|--:|--:|

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 60 A ANL fuse holder, protects everything on VBAT (4 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch dcdc_12v (22 AWG).
- Fuse **F3**: 2 A ATM blade fuse, inline holder, protects branch dcdc_12v_2 (22 AWG).
- Fuse **F4**: 7.5 A ATM blade fuse, inline holder, protects branch l_hip_yaw_actuator (18 AWG).
- Fuse **F5**: 10 A ATM blade fuse, inline holder, protects branch l_hip_roll_actuator (14 AWG).
- Fuse **F6**: 10 A ATM blade fuse, inline holder, protects branch l_hip_pitch_actuator (14 AWG).
- Fuse **F7**: 10 A ATM blade fuse, inline holder, protects branch l_knee_actuator (14 AWG).
- Fuse **F8**: 10 A ATM blade fuse, inline holder, protects branch l_ankle_pitch_actuator (14 AWG).
- Fuse **F9**: 15 A ATM blade fuse, inline holder, protects branch l_ankle_roll_actuator (14 AWG).
- Fuse **F10**: 15 A ATM blade fuse, inline holder, protects branch l_shoulder_pitch_actuator (14 AWG).
- Fuse **F11**: 15 A ATM blade fuse, inline holder, protects branch l_shoulder_roll_actuator (14 AWG).
- Fuse **F12**: 7.5 A ATM blade fuse, inline holder, protects branch r_hip_yaw_actuator (18 AWG).
- Fuse **F13**: 10 A ATM blade fuse, inline holder, protects branch r_hip_roll_actuator (14 AWG).
- Fuse **F14**: 10 A ATM blade fuse, inline holder, protects branch r_hip_pitch_actuator (14 AWG).
- Fuse **F15**: 10 A ATM blade fuse, inline holder, protects branch r_knee_actuator (14 AWG).
- Fuse **F16**: 10 A ATM blade fuse, inline holder, protects branch r_ankle_pitch_actuator (14 AWG).
- Fuse **F17**: 15 A ATM blade fuse, inline holder, protects branch r_ankle_roll_actuator (14 AWG).
- Fuse **F18**: 15 A ATM blade fuse, inline holder, protects branch r_shoulder_pitch_actuator (14 AWG).
- Fuse **F19**: 15 A ATM blade fuse, inline holder, protects branch r_shoulder_roll_actuator (14 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | MID_PACK | battery.BAT- | battery_2.BAT+ | 8 | red | 20 | 60 |
| C2 | W2 | 12V | dcdc_12v_2.DC OUTPUT +V | dcdc_12v.DC OUTPUT +V | 22 | red | 2 | 4.2 |
| C2 | W3 | GND | dcdc_12v_2.DC OUTPUT -V | dcdc_12v.DC OUTPUT -V | 22 | black | 2 | 4.2 |
| C3 | W4 | CAN_H_LEG_BUS | leg_bus.CAN_H | leg_bus_hub_h.P1 | 26 | yellow | 0.02 | 0.02 |
| C4 | W5 | CAN_L_LEG_BUS | leg_bus.CAN_L | leg_bus_hub_l.P1 | 26 | green | 0.02 | 0.02 |
| C5 | W6 | CAN_H_LEG_BUS | leg_bus_hub_h.P2 | l_hip_yaw_actuator.CAN_H (white) | 26 | red | 0.02 | 0.02 |
| C5 | W7 | CAN_L_LEG_BUS | leg_bus_hub_l.P2 | l_hip_yaw_actuator.CAN_L (blue) | 26 | red | 0.02 | 0.02 |
| C6 | W8 | CAN_H_LEG_BUS | leg_bus_hub_h.P2 | l_hip_roll_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C6 | W9 | CAN_L_LEG_BUS | leg_bus_hub_l.P2 | l_hip_roll_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C7 | W10 | CAN_H_LEG_BUS | leg_bus_hub_h.P2 | l_hip_pitch_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C7 | W11 | CAN_L_LEG_BUS | leg_bus_hub_l.P2 | l_hip_pitch_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C8 | W12 | CAN_H_LEG_BUS | leg_bus_hub_h.P2 | l_knee_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C8 | W13 | CAN_L_LEG_BUS | leg_bus_hub_l.P2 | l_knee_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C9 | W14 | CAN_H_LEG_BUS | leg_bus_hub_h.P2 | l_ankle_pitch_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C9 | W15 | CAN_L_LEG_BUS | leg_bus_hub_l.P2 | l_ankle_pitch_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C10 | W16 | CAN_H_LEG_BUS | leg_bus_hub_h.P2 | l_ankle_roll_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C10 | W17 | CAN_L_LEG_BUS | leg_bus_hub_l.P2 | l_ankle_roll_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C11 | W18 | CAN_H_LEG_BUS | leg_bus_hub_h.P2 | l_shoulder_pitch_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C11 | W19 | CAN_L_LEG_BUS | leg_bus_hub_l.P2 | l_shoulder_pitch_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C12 | W20 | CAN_H_LEG_BUS | leg_bus_hub_h.P2 | l_shoulder_roll_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C12 | W21 | CAN_L_LEG_BUS | leg_bus_hub_l.P2 | l_shoulder_roll_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C13 | W22 | GND | leg_bus.CAN_GND | l_hip_yaw_actuator.V- (black) | 24 | black | 0.01 | 0.01 |
| C14 | W23 | CAN_H_LEG_BUS_2 | leg_bus_2.CAN_H | leg_bus_2_hub_h.P1 | 26 | yellow | 0.02 | 0.02 |
| C15 | W24 | CAN_L_LEG_BUS_2 | leg_bus_2.CAN_L | leg_bus_2_hub_l.P1 | 26 | green | 0.02 | 0.02 |
| C16 | W25 | CAN_H_LEG_BUS_2 | leg_bus_2_hub_h.P2 | r_hip_yaw_actuator.CAN_H (white) | 26 | red | 0.02 | 0.02 |
| C16 | W26 | CAN_L_LEG_BUS_2 | leg_bus_2_hub_l.P2 | r_hip_yaw_actuator.CAN_L (blue) | 26 | red | 0.02 | 0.02 |
| C17 | W27 | CAN_H_LEG_BUS_2 | leg_bus_2_hub_h.P2 | r_hip_roll_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C17 | W28 | CAN_L_LEG_BUS_2 | leg_bus_2_hub_l.P2 | r_hip_roll_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C18 | W29 | CAN_H_LEG_BUS_2 | leg_bus_2_hub_h.P2 | r_hip_pitch_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C18 | W30 | CAN_L_LEG_BUS_2 | leg_bus_2_hub_l.P2 | r_hip_pitch_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C19 | W31 | CAN_H_LEG_BUS_2 | leg_bus_2_hub_h.P2 | r_knee_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C19 | W32 | CAN_L_LEG_BUS_2 | leg_bus_2_hub_l.P2 | r_knee_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C20 | W33 | CAN_H_LEG_BUS_2 | leg_bus_2_hub_h.P2 | r_ankle_pitch_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C20 | W34 | CAN_L_LEG_BUS_2 | leg_bus_2_hub_l.P2 | r_ankle_pitch_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C21 | W35 | CAN_H_LEG_BUS_2 | leg_bus_2_hub_h.P2 | r_ankle_roll_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C21 | W36 | CAN_L_LEG_BUS_2 | leg_bus_2_hub_l.P2 | r_ankle_roll_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C22 | W37 | CAN_H_LEG_BUS_2 | leg_bus_2_hub_h.P2 | r_shoulder_pitch_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C22 | W38 | CAN_L_LEG_BUS_2 | leg_bus_2_hub_l.P2 | r_shoulder_pitch_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C23 | W39 | CAN_H_LEG_BUS_2 | leg_bus_2_hub_h.P2 | r_shoulder_roll_actuator.CAN_H | 26 | red | 0.02 | 0.02 |
| C23 | W40 | CAN_L_LEG_BUS_2 | leg_bus_2_hub_l.P2 | r_shoulder_roll_actuator.CAN_L | 26 | red | 0.02 | 0.02 |
| C24 | W41 | GND | leg_bus_2.CAN_GND | r_hip_yaw_actuator.V- (black) | 24 | black | 0.01 | 0.01 |
| C25 | W42 | LEG_BUS_USB | leg_bus.VBUS | computer.LINK | made | red | 0.1 | 0.5 |
| C26 | W43 | LEG_BUS_2_USB | leg_bus_2.VBUS | computer.LINK | made | red | 0.1 | 0.5 |
| C27 | W44 | BUS_ARM_BUS | arm_bus.DATA | arm_bus_hub.P1 | 26 | yellow | 0.02 | 0.02 |
| C28 | W45 | GND | arm_bus.GND | l_upper_arm_yaw_actuator.GND | 24 | black | 0.01 | 0.01 |
| C29 | W46 | BUS_ARM_BUS | arm_bus_hub.P2 | l_upper_arm_yaw_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C30 | W47 | 12V | l_upper_arm_yaw_actuator.VDD | l_elbow_actuator.VDD | 22 | red | 1.02 | 5.62 |
| C30 | W48 | GND | l_upper_arm_yaw_actuator.GND | l_elbow_actuator.GND | 22 | black | 1.02 | 5.62 |
| C30 | W49 | BUS_ARM_BUS | l_upper_arm_yaw_actuator.DATA | l_elbow_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C31 | W50 | 12V | l_elbow_actuator.VDD | l_wrist_yaw_actuator.VDD | 22 | red | 0.72 | 5.32 |
| C31 | W51 | GND | l_elbow_actuator.GND | l_wrist_yaw_actuator.GND | 22 | black | 0.72 | 5.32 |
| C31 | W52 | BUS_ARM_BUS | l_elbow_actuator.DATA | l_wrist_yaw_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C32 | W53 | 12V | l_wrist_yaw_actuator.VDD | l_wrist_pitch_actuator.VDD | 22 | red | 0.58 | 5.18 |
| C32 | W54 | GND | l_wrist_yaw_actuator.GND | l_wrist_pitch_actuator.GND | 22 | black | 0.58 | 5.18 |
| C32 | W55 | BUS_ARM_BUS | l_wrist_yaw_actuator.DATA | l_wrist_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C33 | W56 | 12V | l_wrist_pitch_actuator.VDD | l_wrist_roll_actuator.VDD | 24 | red | 0.28 | 2.44 |
| C33 | W57 | GND | l_wrist_pitch_actuator.GND | l_wrist_roll_actuator.GND | 24 | black | 0.28 | 2.44 |
| C33 | W58 | BUS_ARM_BUS | l_wrist_pitch_actuator.DATA | l_wrist_roll_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C34 | W59 | 12V | l_wrist_roll_actuator.VDD | l_gripper_actuator.VDD | 24 | red | 0.14 | 2.3 |
| C34 | W60 | GND | l_wrist_roll_actuator.GND | l_gripper_actuator.GND | 24 | black | 0.14 | 2.3 |
| C34 | W61 | BUS_ARM_BUS | l_wrist_roll_actuator.DATA | l_gripper_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C35 | W62 | BUS_ARM_BUS | arm_bus_hub.P2 | r_upper_arm_yaw_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C36 | W63 | 12V | r_upper_arm_yaw_actuator.VDD | r_elbow_actuator.VDD | 22 | red | 1.02 | 5.62 |
| C36 | W64 | GND | r_upper_arm_yaw_actuator.GND | r_elbow_actuator.GND | 22 | black | 1.02 | 5.62 |
| C36 | W65 | BUS_ARM_BUS | r_upper_arm_yaw_actuator.DATA | r_elbow_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C37 | W66 | 12V | r_elbow_actuator.VDD | r_wrist_yaw_actuator.VDD | 22 | red | 0.72 | 5.32 |
| C37 | W67 | GND | r_elbow_actuator.GND | r_wrist_yaw_actuator.GND | 22 | black | 0.72 | 5.32 |
| C37 | W68 | BUS_ARM_BUS | r_elbow_actuator.DATA | r_wrist_yaw_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C38 | W69 | 12V | r_wrist_yaw_actuator.VDD | r_wrist_pitch_actuator.VDD | 22 | red | 0.58 | 5.18 |
| C38 | W70 | GND | r_wrist_yaw_actuator.GND | r_wrist_pitch_actuator.GND | 22 | black | 0.58 | 5.18 |
| C38 | W71 | BUS_ARM_BUS | r_wrist_yaw_actuator.DATA | r_wrist_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C39 | W72 | 12V | r_wrist_pitch_actuator.VDD | r_wrist_roll_actuator.VDD | 24 | red | 0.28 | 2.44 |
| C39 | W73 | GND | r_wrist_pitch_actuator.GND | r_wrist_roll_actuator.GND | 24 | black | 0.28 | 2.44 |
| C39 | W74 | BUS_ARM_BUS | r_wrist_pitch_actuator.DATA | r_wrist_roll_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C40 | W75 | 12V | r_wrist_roll_actuator.VDD | r_gripper_actuator.VDD | 24 | red | 0.14 | 2.3 |
| C40 | W76 | GND | r_wrist_roll_actuator.GND | r_gripper_actuator.GND | 24 | black | 0.14 | 2.3 |
| C40 | W77 | BUS_ARM_BUS | r_wrist_roll_actuator.DATA | r_gripper_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C41 | W78 | BUS_ARM_BUS | arm_bus_hub.P2 | neck_pan_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C42 | W79 | 12V | neck_pan_actuator.VDD | neck_tilt_actuator.VDD | 24 | red | 0.14 | 2.3 |
| C42 | W80 | GND | neck_pan_actuator.GND | neck_tilt_actuator.GND | 24 | black | 0.14 | 2.3 |
| C42 | W81 | BUS_ARM_BUS | neck_pan_actuator.DATA | neck_tilt_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C43 | W82 | HEAD_CAMERA_CSI | head_camera.GND | computer.LINK | made | black | 0.2 | 0.25 |
| C44 | W83 | 3V3_IMU | computer.3V3 | imu.VIN | 24 | red | 0.011 | 0.015 |
| C44 | W84 | GND | computer.GND | imu.GND | 24 | black | 0.011 | 0.015 |
| C44 | W85 | I2C_SDA | computer.I2C1_SDA | imu.SDA | 26 | blue | 0.02 | 0.02 |
| C44 | W86 | I2C_SCL | computer.I2C1_SCL | imu.SCL | 26 | yellow | 0.02 | 0.02 |
| C45 | W87 | ARM_BUS_USB | arm_bus.VBUS | computer.LINK | made | red | 0.05 | 0.1 |
| C46 | W88 | VBAT | battery.BAT+ | main_fuse.IN | 4 | red | 17.73 | 106.21 |
| C47 | W89 | VBAT | main_fuse.OUT | main_switch.IN | 4 | red | 17.73 | 106.21 |
| C48 | W90 | GND | battery_2.BAT- | star_ground.P1 | 4 | black | 17.73 | 106.21 |
| C49 | W91 | VBAT | main_switch.OUT | splice_vbat.P1 | 4 | red | 17.73 | 106.21 |
| C50 | W92 | VBAT | splice_vbat.P2 | dcdc_12v.DC INPUT V+ | 22 | red | 1.21 | 2.656 |
| C50 | W93 | GND | star_ground.P2 | dcdc_12v.DC INPUT V- | 24 | black | 1.21 | 2.656 |
| C51 | W94 | VBAT | splice_vbat.P2 | dcdc_12v_2.DC INPUT V+ | 22 | red | 0.5 | 2 |
| C51 | W95 | GND | star_ground.P2 | dcdc_12v_2.DC INPUT V- | 24 | black | 0.5 | 2 |
| C52 | W96 | VBAT | splice_vbat.P2 | l_hip_yaw_actuator.V+ (red) | 18 | red | 0.57 | 11.2 |
| C52 | W97 | GND | star_ground.P2 | l_hip_yaw_actuator.V- (black) | 18 | black | 0.57 | 11.2 |
| C53 | W98 | VBAT | splice_vbat.P2 | l_hip_roll_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C53 | W99 | GND | star_ground.P2 | l_hip_roll_actuator.Negative (-) | 14 | black | 1.05 | 19 |
| C54 | W100 | VBAT | splice_vbat.P2 | l_hip_pitch_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C54 | W101 | GND | star_ground.P2 | l_hip_pitch_actuator.Negative (-) | 12 | black | 1.05 | 19 |
| C55 | W102 | VBAT | splice_vbat.P2 | l_knee_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C55 | W103 | GND | star_ground.P2 | l_knee_actuator.Negative (-) | 12 | black | 1.05 | 19 |
| C56 | W104 | VBAT | splice_vbat.P2 | l_ankle_pitch_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C56 | W105 | GND | star_ground.P2 | l_ankle_pitch_actuator.Negative (-) | 10 | black | 1.05 | 19 |
| C57 | W106 | VBAT | splice_vbat.P2 | l_ankle_roll_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C57 | W107 | GND | star_ground.P2 | l_ankle_roll_actuator.Negative (-) | 10 | black | 1.08 | 23.2 |
| C58 | W108 | VBAT | splice_vbat.P2 | l_shoulder_pitch_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C58 | W109 | GND | star_ground.P2 | l_shoulder_pitch_actuator.Negative (-) | 14 | black | 1.08 | 23.2 |
| C59 | W110 | VBAT | splice_vbat.P2 | l_shoulder_roll_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C59 | W111 | GND | star_ground.P2 | l_shoulder_roll_actuator.Negative (-) | 14 | black | 1.08 | 23.2 |
| C60 | W112 | VBAT | splice_vbat.P2 | r_hip_yaw_actuator.V+ (red) | 18 | red | 0.57 | 11.2 |
| C60 | W113 | GND | star_ground.P2 | r_hip_yaw_actuator.V- (black) | 18 | black | 0.57 | 11.2 |
| C61 | W114 | VBAT | splice_vbat.P2 | r_hip_roll_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C61 | W115 | GND | star_ground.P2 | r_hip_roll_actuator.Negative (-) | 14 | black | 1.05 | 19 |
| C62 | W116 | VBAT | splice_vbat.P2 | r_hip_pitch_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C62 | W117 | GND | star_ground.P2 | r_hip_pitch_actuator.Negative (-) | 12 | black | 1.05 | 19 |
| C63 | W118 | VBAT | splice_vbat.P2 | r_knee_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C63 | W119 | GND | star_ground.P2 | r_knee_actuator.Negative (-) | 12 | black | 1.05 | 19 |
| C64 | W120 | VBAT | splice_vbat.P2 | r_ankle_pitch_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C64 | W121 | GND | star_ground.P2 | r_ankle_pitch_actuator.Negative (-) | 10 | black | 1.05 | 19 |
| C65 | W122 | VBAT | splice_vbat.P2 | r_ankle_roll_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C65 | W123 | GND | star_ground.P2 | r_ankle_roll_actuator.Negative (-) | 10 | black | 1.08 | 23.2 |
| C66 | W124 | VBAT | splice_vbat.P2 | r_shoulder_pitch_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C66 | W125 | GND | star_ground.P2 | r_shoulder_pitch_actuator.Negative (-) | 14 | black | 1.08 | 23.2 |
| C67 | W126 | VBAT | splice_vbat.P2 | r_shoulder_roll_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C67 | W127 | GND | star_ground.P2 | r_shoulder_roll_actuator.Negative (-) | 14 | black | 1.08 | 23.2 |
| C68 | W128 | 12V | dcdc_12v.DC OUTPUT +V | splice_12v.P1 | 20 | red | 3.85 | 8.45 |
| C68 | W129 | GND | dcdc_12v.DC OUTPUT -V | star_ground.P2 | 20 | black | 3.85 | 8.45 |
| C69 | W130 | 12V | splice_12v.P2 | regulator_5v.VIN | 24 | red | 0 | 0 |
| C69 | W131 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0 | 0 |
| C70 | W132 | 12V | splice_12v.P2 | computer.DC_IN | 24 | red | 1.3 | 2.1 |
| C70 | W133 | GND | star_ground.P2 | computer.GND | 22 | black | 1.3 | 2.1 |
| C71 | W134 | 12V | splice_12v.P2 | l_upper_arm_yaw_actuator.VDD | 22 | red | 1.16 | 5.76 |
| C71 | W135 | GND | star_ground.P2 | l_upper_arm_yaw_actuator.GND | 18 | black | 1.16 | 5.76 |
| C72 | W136 | 12V | splice_12v.P2 | r_upper_arm_yaw_actuator.VDD | 22 | red | 1.16 | 5.76 |
| C72 | W137 | GND | star_ground.P2 | r_upper_arm_yaw_actuator.GND | 18 | black | 1.16 | 5.76 |
| C73 | W138 | 12V | splice_12v.P2 | neck_pan_actuator.VDD | 24 | red | 0.22 | 2.38 |
| C73 | W139 | GND | star_ground.P2 | neck_pan_actuator.GND | 24 | black | 0.22 | 2.38 |
| C74 | W140 | GND | regulator_5v.GND | star_ground.P2 | 24 | black | 0 | 0 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | battery to battery_2 | 1 | 195 | 94.2 | 40 | 0 | 60 | EC5 / EC5 | - |
| C2 | dcdc_12v_2 to dcdc_12v | 2 | 210 | 108.9 | 40 | 0 | 60 | barrier screw terminal / barrier screw terminal | - |
| C3 | leg_bus to leg_bus_hub_h | 1 | 260 | 156 | 40 | 0 | 60 | 3-pin screw terminal / lever clamp | torso_bay.arm_r |
| C4 | leg_bus to leg_bus_hub_l | 1 | 260 | 156 | 40 | 0 | 60 | 3-pin screw terminal / lever clamp | torso_bay.arm_r |
| C5 | CAN to l_hip_yaw_actuator | 2 | 340 | 235.2 | 40 | 0 | 60 | lever clamp / AMASS XT30PW(2+2)-M | - |
| C6 | CAN to l_hip_roll_actuator | 2 | 445 | 303.3 | 40 | 40 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C7 | CAN to l_hip_pitch_actuator | 2 | 630 | 458.4 | 40 | 70 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C8 | CAN to l_knee_actuator | 2 | 890 | 664.4 | 40 | 125 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C9 | CAN to l_ankle_pitch_actuator | 2 | 1145 | 880.4 | 40 | 160 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C10 | CAN to l_ankle_roll_actuator | 2 | 1345 | 1033.3 | 40 | 210 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C11 | CAN to l_shoulder_pitch_actuator | 2 | 390 | 290 | 40 | 0 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C12 | CAN to l_shoulder_roll_actuator | 2 | 620 | 431.9 | 40 | 85 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C13 | leg_bus to l_hip_yaw_actuator | 1 | 340 | 236.8 | 40 | 0 | 60 | 3-pin screw terminal / AMASS XT30PW(2+2)-M | torso_bay.legs |
| C14 | leg_bus_2 to leg_bus_2_hub_h | 1 | 160 | 55.9 | 40 | 0 | 60 | 3-pin screw terminal / lever clamp | torso_bay.legs |
| C15 | leg_bus_2 to leg_bus_2_hub_l | 1 | 160 | 55.9 | 40 | 0 | 60 | 3-pin screw terminal / lever clamp | torso_bay.legs |
| C16 | CAN to r_hip_yaw_actuator | 2 | 245 | 144.4 | 40 | 0 | 60 | lever clamp / AMASS XT30PW(2+2)-M | - |
| C17 | CAN to r_hip_roll_actuator | 2 | 390 | 245.1 | 40 | 40 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C18 | CAN to r_hip_pitch_actuator | 2 | 545 | 368.5 | 40 | 75 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C19 | CAN to r_knee_actuator | 2 | 800 | 574.5 | 40 | 125 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C20 | CAN to r_ankle_pitch_actuator | 2 | 1055 | 790.4 | 40 | 160 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C21 | CAN to r_ankle_roll_actuator | 2 | 1255 | 943.3 | 40 | 210 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C22 | CAN to r_shoulder_pitch_actuator | 2 | 315 | 213 | 40 | 0 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C23 | CAN to r_shoulder_roll_actuator | 2 | 545 | 357.9 | 40 | 85 | 60 | lever clamp / CJT A1257WR-S-4P | - |
| C24 | leg_bus_2 to r_hip_yaw_actuator | 1 | 280 | 178.2 | 40 | 0 | 60 | 3-pin screw terminal / AMASS XT30PW(2+2)-M | torso_bay.legs |
| C25 | leg_bus to computer | 1 | 175 | 172.9 | 0 | 0 | 0 | USB | - |
| C26 | leg_bus_2 to computer | 1 | 140 | 136.7 | 0 | 0 | 0 | USB | - |
| C27 | arm_bus to arm_bus_hub | 1 | 200 | 96.4 | 40 | 0 | 60 | JST B3B-EH-A header / lever clamp | torso_bay.legs |
| C28 | arm_bus to l_upper_arm_yaw_actuator | 1 | 735 | 528 | 40 | 105 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | torso_bay.arm_l |
| C29 | arm_bus_hub to l_upper_arm_yaw_actuator | 1 | 685 | 479.5 | 40 | 105 | 60 | lever clamp / JST B3B-EH-A header | - |
| C30 | l_upper_arm_yaw_actuator to l_elbow_actuator | 3 | 350 | 183.7 | 40 | 65 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C31 | l_elbow_actuator to l_wrist_yaw_actuator | 3 | 275 | 101.5 | 40 | 70 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C32 | l_wrist_yaw_actuator to l_wrist_pitch_actuator | 3 | 270 | 92.5 | 40 | 75 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C33 | l_wrist_pitch_actuator to l_wrist_roll_actuator | 3 | 260 | 101.5 | 40 | 55 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C34 | l_wrist_roll_actuator to l_gripper_actuator | 3 | 260 | 84.4 | 40 | 75 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C35 | arm_bus_hub to r_upper_arm_yaw_actuator | 1 | 620 | 412.4 | 40 | 105 | 60 | lever clamp / JST B3B-EH-A header | - |
| C36 | r_upper_arm_yaw_actuator to r_elbow_actuator | 3 | 350 | 183.7 | 40 | 65 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C37 | r_elbow_actuator to r_wrist_yaw_actuator | 3 | 275 | 101.5 | 40 | 70 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C38 | r_wrist_yaw_actuator to r_wrist_pitch_actuator | 3 | 270 | 92.5 | 40 | 75 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C39 | r_wrist_pitch_actuator to r_wrist_roll_actuator | 3 | 260 | 101.5 | 40 | 55 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C40 | r_wrist_roll_actuator to r_gripper_actuator | 3 | 260 | 84.4 | 40 | 75 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C41 | arm_bus_hub to neck_pan_actuator | 1 | 325 | 224.4 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | - |
| C42 | neck_pan_actuator to neck_tilt_actuator | 3 | 320 | 157.9 | 40 | 60 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C43 | head_camera to computer | 1 | 510 | 443.5 | 0 | 65 | 0 | FFC | torso_bay.neck |
| C44 | computer to imu | 4 | 360 | 256.9 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | torso_bay.legs + imu_hood.up |
| C45 | arm_bus to computer | 1 | 140 | 137.3 | 0 | 0 | 0 | USB | - |
| C46 | battery positive to main fuse | 1 | 100 | 0 | 40 | 0 | 60 | EC5 / M8 studs | - |
| C47 | main fuse to main switch | 1 | 525 | 424.4 | 40 | 0 | 60 | M8 studs / 3/8 in-16 studs | torso_bay.neck |
| C48 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | EC5 / lever clamp | - |
| C49 | main_switch to the VBAT splice | 1 | 100 | 0 | 40 | 0 | 60 | 3/8 in-16 studs / lever clamp | - |
| C50 | VBAT to dcdc_12v | 2 | 330 | 227.8 | 40 | 0 | 60 | lever clamp / barrier screw terminal | backpack_hood.deck |
| C51 | VBAT to dcdc_12v_2 | 2 | 330 | 227.8 | 40 | 0 | 60 | lever clamp / barrier screw terminal | backpack_hood.deck |
| C52 | VBAT to l_hip_yaw_actuator | 2 | 495 | 393.5 | 40 | 0 | 60 | lever clamp / AMASS XT30PW(2+2)-M | - |
| C53 | VBAT to l_hip_roll_actuator | 2 | 630 | 485.7 | 40 | 40 | 60 | lever clamp / AMASS XT30PW-M | - |
| C54 | VBAT to l_hip_pitch_actuator | 2 | 815 | 640.5 | 40 | 70 | 60 | lever clamp / AMASS XT30PW-M | - |
| C55 | VBAT to l_knee_actuator | 2 | 1075 | 846.4 | 40 | 125 | 60 | lever clamp / AMASS XT30PW-M | - |
| C56 | VBAT to l_ankle_pitch_actuator | 2 | 1325 | 1062.4 | 40 | 160 | 60 | lever clamp / AMASS XT30PW-M | - |
| C57 | VBAT to l_ankle_roll_actuator | 2 | 1530 | 1215.3 | 40 | 210 | 60 | lever clamp / AMASS XT30PW-M | - |
| C58 | VBAT to l_shoulder_pitch_actuator | 2 | 415 | 311.4 | 40 | 0 | 60 | lever clamp / AMASS XT30PW-M | - |
| C59 | VBAT to l_shoulder_roll_actuator | 2 | 655 | 465.7 | 40 | 85 | 60 | lever clamp / AMASS XT30PW-M | - |
| C60 | VBAT to r_hip_yaw_actuator | 2 | 495 | 393.5 | 40 | 0 | 60 | lever clamp / AMASS XT30PW(2+2)-M | - |
| C61 | VBAT to r_hip_roll_actuator | 2 | 635 | 494.2 | 40 | 40 | 60 | lever clamp / AMASS XT30PW-M | - |
| C62 | VBAT to r_hip_pitch_actuator | 2 | 820 | 640.5 | 40 | 75 | 60 | lever clamp / AMASS XT30PW-M | - |
| C63 | VBAT to r_knee_actuator | 2 | 1075 | 846.4 | 40 | 125 | 60 | lever clamp / AMASS XT30PW-M | - |
| C64 | VBAT to r_ankle_pitch_actuator | 2 | 1325 | 1062.4 | 40 | 160 | 60 | lever clamp / AMASS XT30PW-M | - |
| C65 | VBAT to r_ankle_roll_actuator | 2 | 1530 | 1215.3 | 40 | 210 | 60 | lever clamp / AMASS XT30PW-M | - |
| C66 | VBAT to r_shoulder_pitch_actuator | 2 | 415 | 311.4 | 40 | 0 | 60 | lever clamp / AMASS XT30PW-M | - |
| C67 | VBAT to r_shoulder_roll_actuator | 2 | 620 | 431 | 40 | 85 | 60 | lever clamp / AMASS XT30PW-M | - |
| C68 | dcdc_12v to the 12V splice | 2 | 100 | 0 | 40 | 0 | 60 | barrier screw terminal / lever clamp | - |
| C69 | 12V to regulator_5v | 2 | 665 | 563.4 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | backpack_hood.to_torso + torso_bay.neck |
| C70 | 12V to computer | 2 | 595 | 491 | 40 | 0 | 60 | lever clamp / Singatron 2DC-0005D206F DC power jack (J16) | backpack_hood.to_torso + torso_bay.neck |
| C71 | 12V to l_upper_arm_yaw_actuator | 2 | 860 | 619.5 | 40 | 140 | 60 | lever clamp / JST B3B-EH-A header | backpack_hood.to_torso |
| C72 | 12V to r_upper_arm_yaw_actuator | 2 | 860 | 619.5 | 40 | 140 | 60 | lever clamp / JST B3B-EH-A header | backpack_hood.to_torso |
| C73 | 12V to neck_pan_actuator | 2 | 455 | 350.9 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | backpack_hood.to_torso |
| C74 | regulator_5v to star_ground | 1 | 225 | 122.1 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C6 | l_hip_yaw | -0.6 to 0.6 | 5.2 | 14.8 | 40 |
| C7 | l_hip_yaw | -0.6 to 0.6 | 19.8 | 29.4 | 40 |
| C7 | l_hip_roll | -0.071 to 0.45 | 50.1 | 51.3 | 30 |
| C8 | l_hip_yaw | -0.6 to 0.6 | 19.8 | 29.4 | 40 |
| C8 | l_hip_roll | -0.071 to 0.45 | 46.3 | 47.4 | 30 |
| C8 | l_hip_pitch | -0.84 to 1.6 | 43.9 | 69.4 | 55 |
| C9 | l_hip_yaw | -0.6 to 0.6 | 19.8 | 29.4 | 40 |
| C9 | l_hip_roll | -0.071 to 0.45 | 46.3 | 47.4 | 30 |
| C9 | l_hip_pitch | -0.84 to 1.6 | 43.9 | 69.4 | 55 |
| C9 | l_knee | -2.042 to 0.313 | 46.3 | 51.3 | 35 |
| C10 | l_hip_yaw | -0.6 to 0.6 | 19.8 | 29.4 | 40 |
| C10 | l_hip_roll | -0.071 to 0.45 | 46.3 | 47.4 | 30 |
| C10 | l_hip_pitch | -0.84 to 1.6 | 43.9 | 69.4 | 55 |
| C10 | l_knee | -2.042 to 0.313 | 46.3 | 51.3 | 35 |
| C10 | l_ankle_pitch | -1.2 to 1.2 | 48.2 | 67.4 | 50 |
| C12 | l_shoulder_pitch | -3 to 3 | 18.3 | 66.2 | 85 |
| C17 | r_hip_yaw | -0.6 to 0.6 | 40.9 | 50.5 | 40 |
| C18 | r_hip_yaw | -0.6 to 0.6 | 15.9 | 25.4 | 40 |
| C18 | r_hip_roll | -0.45 to 0.071 | 50.1 | 57.3 | 35 |
| C19 | r_hip_yaw | -0.6 to 0.6 | 15.9 | 25.4 | 40 |
| C19 | r_hip_roll | -0.45 to 0.071 | 46.3 | 47.4 | 30 |
| C19 | r_hip_pitch | -1.6 to 0.84 | 43.9 | 69.4 | 55 |
| C20 | r_hip_yaw | -0.6 to 0.6 | 15.9 | 25.4 | 40 |
| C20 | r_hip_roll | -0.45 to 0.071 | 46.3 | 47.4 | 30 |
| C20 | r_hip_pitch | -1.6 to 0.84 | 43.9 | 69.4 | 55 |
| C20 | r_knee | -0.313 to 2.042 | 46.3 | 51.3 | 35 |
| C21 | r_hip_yaw | -0.6 to 0.6 | 15.9 | 25.4 | 40 |
| C21 | r_hip_roll | -0.45 to 0.071 | 46.3 | 47.4 | 30 |
| C21 | r_hip_pitch | -1.6 to 0.84 | 43.9 | 69.4 | 55 |
| C21 | r_knee | -0.313 to 2.042 | 46.3 | 51.3 | 35 |
| C21 | r_ankle_pitch | -1.2 to 1.2 | 48.2 | 67.4 | 50 |
| C23 | r_shoulder_pitch | -3 to 3 | 31.8 | 79.7 | 85 |
| C28 | l_shoulder_pitch | -3 to 3 | 11.7 | 53.7 | 65 |
| C28 | l_shoulder_roll | -0.04 to 1.6 | 22 | 44.4 | 40 |
| C29 | l_shoulder_pitch | -3 to 3 | 16.6 | 58.6 | 65 |
| C29 | l_shoulder_roll | -0.04 to 1.6 | 22 | 44.4 | 40 |
| C30 | l_upper_arm_yaw | -2 to 2 | 23.1 | 50.1 | 65 |
| C31 | l_elbow | -2.3 to 2.182 | 5.4 | 36.4 | 70 |
| C32 | l_wrist_yaw | -2.6 to 2.6 | 23.1 | 58.4 | 75 |
| C33 | l_wrist_pitch | -1.6 to 1.27 | 5.4 | 22.6 | 55 |
| C34 | l_wrist_roll | -2.8 to 2.8 | 23.1 | 61.1 | 75 |
| C35 | r_shoulder_pitch | -3 to 3 | 16.6 | 58.6 | 65 |
| C35 | r_shoulder_roll | -1.6 to 0.04 | 22 | 44.4 | 40 |
| C36 | r_upper_arm_yaw | -2 to 2 | 23.1 | 50.1 | 65 |
| C37 | r_elbow | -2.182 to 2.3 | 5.4 | 36.4 | 70 |
| C38 | r_wrist_yaw | -2.6 to 2.6 | 23.1 | 58.4 | 75 |
| C39 | r_wrist_pitch | -1.27 to 1.6 | 5.4 | 22.6 | 55 |
| C40 | r_wrist_roll | -2.8 to 2.8 | 23.1 | 61.1 | 75 |
| C42 | neck_pan | -1.6 to 1.6 | 23.1 | 44.7 | 60 |
| C43 | neck_tilt | -0.7 to 0.57 | 22 | 30 | 25 |
| C43 | neck_pan | -1.6 to 1.6 | 22 | 44.4 | 40 |
| C53 | l_hip_yaw | -0.6 to 0.6 | 19.6 | 29.2 | 40 |
| C54 | l_hip_yaw | -0.6 to 0.6 | 44.7 | 54.2 | 40 |
| C54 | l_hip_roll | -0.071 to 0.45 | 50.1 | 51.3 | 30 |
| C55 | l_hip_yaw | -0.6 to 0.6 | 44.7 | 54.2 | 40 |
| C55 | l_hip_roll | -0.071 to 0.45 | 46.3 | 47.4 | 30 |
| C55 | l_hip_pitch | -0.84 to 1.6 | 43.9 | 69.4 | 55 |
| C56 | l_hip_yaw | -0.6 to 0.6 | 44.7 | 54.2 | 40 |
| C56 | l_hip_roll | -0.071 to 0.45 | 46.3 | 47.4 | 30 |
| C56 | l_hip_pitch | -0.84 to 1.6 | 43.9 | 69.4 | 55 |
| C56 | l_knee | -2.042 to 0.313 | 46.3 | 51.3 | 35 |
| C57 | l_hip_yaw | -0.6 to 0.6 | 44.7 | 54.2 | 40 |
| C57 | l_hip_roll | -0.071 to 0.45 | 46.3 | 47.4 | 30 |
| C57 | l_hip_pitch | -0.84 to 1.6 | 43.9 | 69.4 | 55 |
| C57 | l_knee | -2.042 to 0.313 | 46.3 | 51.3 | 35 |
| C57 | l_ankle_pitch | -1.2 to 1.2 | 48.2 | 67.4 | 50 |
| C59 | l_shoulder_pitch | -3 to 3 | 49.8 | 97.6 | 85 |
| C61 | r_hip_yaw | -0.6 to 0.6 | 30.5 | 40.1 | 40 |
| C62 | r_hip_yaw | -0.6 to 0.6 | 44.7 | 54.2 | 40 |
| C62 | r_hip_roll | -0.45 to 0.071 | 50.1 | 57.3 | 35 |
| C63 | r_hip_yaw | -0.6 to 0.6 | 44.7 | 54.2 | 40 |
| C63 | r_hip_roll | -0.45 to 0.071 | 46.3 | 47.4 | 30 |
| C63 | r_hip_pitch | -1.6 to 0.84 | 43.9 | 69.4 | 55 |
| C64 | r_hip_yaw | -0.6 to 0.6 | 44.7 | 54.2 | 40 |
| C64 | r_hip_roll | -0.45 to 0.071 | 46.3 | 47.4 | 30 |
| C64 | r_hip_pitch | -1.6 to 0.84 | 43.9 | 69.4 | 55 |
| C64 | r_knee | -0.313 to 2.042 | 46.3 | 51.3 | 35 |
| C65 | r_hip_yaw | -0.6 to 0.6 | 44.7 | 54.2 | 40 |
| C65 | r_hip_roll | -0.45 to 0.071 | 46.3 | 47.4 | 30 |
| C65 | r_hip_pitch | -1.6 to 0.84 | 43.9 | 69.4 | 55 |
| C65 | r_knee | -0.313 to 2.042 | 46.3 | 51.3 | 35 |
| C65 | r_ankle_pitch | -1.2 to 1.2 | 48.2 | 67.4 | 50 |
| C67 | r_shoulder_pitch | -3 to 3 | 0.3 | 48.2 | 85 |
| C71 | l_shoulder_pitch | -3 to 3 | 39.4 | 87.3 | 85 |
| C71 | l_shoulder_roll | -0.04 to 1.6 | 25.1 | 50.6 | 55 |
| C72 | r_shoulder_pitch | -3 to 3 | 39.4 | 87.3 | 85 |
| C72 | r_shoulder_roll | -1.6 to 0.04 | 25.1 | 50.6 | 55 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (LiPo 6S 10000 mAh 30C, EC5) | 222 | 10000 | VBAT 44.4 V | 17.73 | 27 min | 106.21 | 5 min | 10.62 C | 300 |
| battery_2 (LiPo 6S 10000 mAh 30C, EC5) | 222 | 10000 | VBAT 44.4 V | 17.73 | 27 min | 106.21 | 5 min | 10.62 C | 300 |

### Regulator heat

Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.

| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|
| dcdc_12v | switching | VBAT 44.4 V | 12V 12 V | 3.85 / 8.45 | 53.724 | 46.2 | 7.524 / 16.526 | 86 % | 14.2 | yes |
| regulator_5v | switching | 12V 12 V | 5V 5 V | 0 / 0 | 0 | 0 | 0 / 0 | - | 3 | yes |
- dcdc_12v: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 14.2 W of heat.
- regulator_5v: input from the 12V budget at the converter efficiency the budget assumes; the part is rated for about 3 W of heat.

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| BUS_ARM_BUS | U1 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M14 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M15 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M20 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M27 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M27 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M29 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M28 DATA | M30 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M29 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M30 DATA | M28 DATA | - | - | - | not checked: no published logic levels for one side |
| I2C_SCL | A1 I2C1_SCL | U5 SCL | 3.3 | 2.3 | 5.5 | ok |
| I2C_SCL | U5 SCL | A1 I2C1_SCL | 3.3 | 2.3 | 3.6 | ok |
| I2C_SDA | A1 I2C1_SDA | U5 SDA | 3.3 | 2.3 | 5.5 | ok |
| I2C_SDA | U5 SDA | A1 I2C1_SDA | 3.3 | 2.3 | 3.6 | ok |

Not checked (no logic levels in the parts data): DYNAMIXEL XH540-W270-T(R), DYNAMIXEL XL430-W250-T, DYNAMIXEL XM430-W350-T(R), ROBOTIS U2D2 USB to TTL/RS-485 interface.

### Sources

| Input | Source |
|---|---|
| LiPo 6S 10000 mAh 30C, EC5 (Tattu) capacity and energy | [datasheet](https://www.buddyrc.com/products/tattu-22-2v-30c-6s-10000mah-lipo-battery-pack-with-ec5-plug-for-uav-drone) |
| Mean Well SD-50C-12 enclosed DC-DC converter, 36-72 V in, 12 V 4.2 A (50 W) heat | estimated: 50.4 W x (1/0.78 - 1), 78 % typ for SD-50C-12 |
| Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) heat | estimated: 27.5 W out at about 90 % (Pololu range 80-95 %) |
| NVIDIA Jetson Orin Nano Super Developer Kit logic levels | [estimated](https://developer.nvidia.com/embedded/learn/jetson-orin-nano-devkit-user-guide/hardware_spec.html): 40-pin header is 3.3 V logic (developer kit guide), not 5 V tolerant. Threshold 0.7 x 3.3 V assumed. |
| Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) logic levels | [estimated](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085): 3.3 V sensor on a breakout with a regulator and level shifting for 3-5 V hosts (Adafruit guide); thresholds assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 4 AWG silicone wire | 1 | m | 10 | 10.00 | 21.2 mm2, rated 70 A in a bundle; 0.82 m cut + 10 % waste | estimated |
| 8 AWG silicone wire | 0.3 | m | 4.5 | 1.35 | 8.37 mm2, rated 36.5 A in a bundle; 0.20 m cut + 10 % waste | estimated |
| 10 AWG silicone wire | 6.3 | m | 3.2 | 20.16 | 5.261 mm2, rated 27.5 A in a bundle; 5.71 m cut + 10 % waste | estimated |
| 12 AWG silicone wire | 4.2 | m | 2.2 | 9.24 | 3.308 mm2, rated 20.5 A in a bundle; 3.79 m cut + 10 % waste | estimated |
| 14 AWG silicone wire | 17.9 | m | 1.5 | 26.85 | 2.082 mm2, rated 16 A in a bundle; 16.23 m cut + 10 % waste | estimated |
| 18 AWG silicone wire | 4.1 | m | 0.7 | 2.87 | 0.823 mm2, rated 8 A in a bundle; 3.70 m cut + 10 % waste | estimated |
| 20 AWG silicone wire | 0.3 | m | 0.5 | 0.15 | 0.519 mm2, rated 5.5 A in a bundle; 0.20 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 7.7 | m | 0.4 | 3.08 | 0.327 mm2, rated 3.5 A in a bundle; 6.98 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 9.4 | m | 0.35 | 3.29 | 0.205 mm2, rated 1.75 A in a bundle; 8.51 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 31.3 | m | 0.3 | 9.39 | 0.128 mm2, rated 1.1 A in a bundle; 28.45 m cut + 10 % waste | estimated |
| EC5 contacts | 4 | pc | 1.5 | 6.00 | rated 120 A per contact | estimated |
| Bootlace ferrule contacts | 16 | pc | 0.03 | 0.48 | rated 17.5 A per contact | estimated |
| XT30 contacts | 38 | pc | 0.6 | 22.80 | rated 20 A per contact | estimated |
| Dupont 2.54 mm contacts | 36 | pc | 0.02 | 0.72 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 16 | pc | 0.02 | 0.32 | one per cable end | estimated |
| JST EH 2.5 mm contacts | 78 | pc | 0.03 | 2.34 | rated 3 A per contact | estimated |
| JST EH 2.5 mm housings | 31 | pc | 0.05 | 1.55 | one per cable end | estimated |
| Heat shrink 3 mm, 2:1 | 4.8 | m | 0.2 | 0.96 | 9 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 158 | pc | 0.02 | 3.16 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 12 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 6 | pc | 0.08 | 0.48 | 9.5 mm panel hole | estimated |
| Rubber grommet, 5.0 mm panel hole, 3.0 mm bore | 1 | pc | 0.05 | 0.05 | 5 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 12.9 | m | 0.4 | 5.16 | over every cable where it crosses a joint | estimated |
| USB | 1 | pc | 3 | 3.00 | leg_bus to computer | estimated |
| USB | 1 | pc | 3 | 3.00 | leg_bus_2 to computer | estimated |
| FFC | 1 | pc | 3 | 3.00 | head_camera to computer | estimated |
| USB | 1 | pc | 3 | 3.00 | arm_bus to computer | estimated |
| 60 A ANL fuse | 1 | pc | 6 | 6.00 | plus spares | estimated |
| 2 A ANL fuse | 2 | pc | 6 | 12.00 | plus spares | estimated |
| 7.5 A ANL fuse | 2 | pc | 6 | 12.00 | plus spares | estimated |
| 10 A ANL fuse | 8 | pc | 6 | 48.00 | plus spares | estimated |
| 15 A ANL fuse | 6 | pc | 6 | 36.00 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Adafruit BNO085 9-DoF IMU breakout | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.ceva-ip.com/wp-content/uploads/BNO080_085-Datasheet.pdf) | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.adafruit.com/product/4754) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator | [datasheet](https://www.pololu.com/product/4091/specs) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) |
| CubeMars AK60-6 V3.0 KV80 | [datasheet](https://www.cubemars.com/images/file/20241217/1734428582786471.pdf) | [datasheet](https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html) | [datasheet](https://www.cubemars.com/images/file/20241217/1734428582786471.pdf) | [datasheet](https://www.cubemars.com/images/file/20241217/1734428582786471.pdf) |
| CubeMars AK70-10 KV100 | estimated | [datasheet](https://www.cubemars.com/product/ak70-10-kv100-robotic-actuator.html) | [datasheet](https://www.cubemars.com/images/file/20240102/1704163364483999.pdf) | [datasheet](https://www.cubemars.com/product/ak70-10-kv100-robotic-actuator.html) |
| CubeMars AK80-64 KV80 | estimated | [datasheet](https://www.cubemars.com/product/ak80-64-kv80-robotic-actuator.html) | [datasheet](https://www.cubemars.com/images/file/20240102/1704163364483999.pdf) | [datasheet](https://www.cubemars.com/product/ak80-64-kv80-robotic-actuator.html) |
| Mean Well SD-50C-12 enclosed DC-DC converter, 36-72 V in, 12 V 4.2 A | [datasheet](https://www.meanwell.com/Upload/PDF/SD-50/SD-50-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/SD-50/SD-50-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/SD-50/SD-50-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/SD-50/SD-50-SPEC.PDF) |
| ROBOTIS U2D2 USB to TTL/RS-485 interface | estimated | estimated | estimated | [datasheet](https://emanual.robotis.com/docs/en/parts/interface/u2d2/) |
| DYNAMIXEL XH540-W270-T(R) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) |
| DYNAMIXEL XL430-W250-T | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl430-w250/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl430-w250/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl430-w250/) |
| DYNAMIXEL XM430-W350-T(R) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xm430-w350/) |
| ANL fuse holder, 58 V class, 35-300 A | estimated | estimated | estimated | estimated |
| NVIDIA Jetson Orin Nano Super Developer Kit | [datasheet](https://developer.nvidia.com/downloads/assets/embedded/secure/jetson/orin_nano/docs/jetson_orin_nano_devkit_carrier_board_specification_sp.pdf) | estimated | [datasheet](https://developer.nvidia.com/downloads/assets/embedded/secure/jetson/orin_nano/docs/jetson_orin_nano_devkit_carrier_board_specification_sp.pdf) | [datasheet](https://developer.nvidia.com/downloads/assets/embedded/secure/jetson/orin_nano/docs/jetson_orin_nano_devkit_carrier_board_specification_sp.pdf) |
| LiPo 6S 10000 mAh 30C, EC5 | estimated | [datasheet](https://www.buddyrc.com/products/tattu-22-2v-30c-6s-10000mah-lipo-battery-pack-with-ec5-plug-for-uav-drone) | estimated | [datasheet](https://www.buddyrc.com/products/tattu-22-2v-30c-6s-10000mah-lipo-battery-pack-with-ec5-plug-for-uav-drone) |
| Raspberry Pi Camera Module 3 | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated |
| Blue Sea 6006 m-Series battery switch, ON-OFF, 48 VDC | estimated | estimated | estimated | estimated |
| EYOU Robotics CANable PRO isolated USB-CAN adapter | estimated | estimated | estimated | [datasheet](https://cdn.robotshop.com/media/E/EYO/RBC-Eyo-33/pdf/eyou-canable-pro-datasheet.pdf) |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |

## Notes

- CAN: keep the branches short and fit a 120 ohm terminator at each end of the longest run.
- CAN: keep the branches short and fit a 120 ohm terminator at each end of the longest run.
