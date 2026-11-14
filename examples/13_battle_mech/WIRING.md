# Wiring: battle_mech

97 cables, 140 conductors, 87.82 m of wire, wiring parts $272.98.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 44.4 | main_switch | 120 / 240 | 17.73 / 106.21 | 6.8x | 60 | 0.425 |
| 12V | 12 | dcdc_12v | 8.4 / 8.8 | 3.85 / 8.45 | 2.2x | - | 0.28 |
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
| C36 | W64 | GND | r_upper_arm_yaw_actuator.GND | r_elbow_actuator.GND | 20 | black | 1.02 | 5.62 |
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
| C51 | W93 | VBAT | splice_vbat.P2 | dcdc_12v_2.DC INPUT V+ | 22 | red | 0.5 | 2 |
| C52 | W94 | VBAT | splice_vbat.P2 | l_hip_yaw_actuator.V+ (red) | 18 | red | 0.57 | 11.2 |
| C53 | W95 | VBAT | splice_vbat.P2 | l_hip_roll_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C54 | W96 | VBAT | splice_vbat.P2 | l_hip_pitch_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C55 | W97 | VBAT | splice_vbat.P2 | l_knee_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C56 | W98 | VBAT | splice_vbat.P2 | l_ankle_pitch_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C57 | W99 | VBAT | splice_vbat.P2 | l_ankle_roll_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C58 | W100 | VBAT | splice_vbat.P2 | l_shoulder_pitch_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C59 | W101 | VBAT | splice_vbat.P2 | l_shoulder_roll_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C60 | W102 | VBAT | splice_vbat.P2 | r_hip_yaw_actuator.V+ (red) | 18 | red | 0.57 | 11.2 |
| C61 | W103 | VBAT | splice_vbat.P2 | r_hip_roll_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C62 | W104 | VBAT | splice_vbat.P2 | r_hip_pitch_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C63 | W105 | VBAT | splice_vbat.P2 | r_knee_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C64 | W106 | VBAT | splice_vbat.P2 | r_ankle_pitch_actuator.Positive (+) | 14 | red | 1.05 | 19 |
| C65 | W107 | VBAT | splice_vbat.P2 | r_ankle_roll_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C66 | W108 | VBAT | splice_vbat.P2 | r_shoulder_pitch_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C67 | W109 | VBAT | splice_vbat.P2 | r_shoulder_roll_actuator.Positive (+) | 14 | red | 1.08 | 23.2 |
| C68 | W110 | 12V | dcdc_12v.DC OUTPUT +V | splice_12v.P1 | 20 | red | 3.85 | 8.45 |
| C68 | W111 | GND | dcdc_12v.DC OUTPUT -V | star_ground.P2 | 18 | black | 3.85 | 8.45 |
| C69 | W112 | 12V | splice_12v.P2 | regulator_5v.VIN | 24 | red | 0 | 0 |
| C70 | W113 | 12V | splice_12v.P2 | computer.DC_IN | 24 | red | 1.3 | 2.1 |
| C71 | W114 | 12V | splice_12v.P2 | l_upper_arm_yaw_actuator.VDD | 22 | red | 1.16 | 5.76 |
| C72 | W115 | 12V | splice_12v.P2 | r_upper_arm_yaw_actuator.VDD | 22 | red | 1.16 | 5.76 |
| C73 | W116 | 12V | splice_12v.P2 | neck_pan_actuator.VDD | 24 | red | 0.22 | 2.38 |
| C74 | W117 | GND | regulator_5v.GND | star_ground.P2 | 24 | black | 0 | 0 |
| C75 | W118 | GND | star_ground.P2 | dcdc_12v.DC INPUT V- | 22 | black | 1.21 | 2.656 |
| C76 | W119 | GND | star_ground.P2 | dcdc_12v_2.DC INPUT V- | 24 | black | 0.5 | 2 |
| C77 | W120 | GND | star_ground.P2 | l_hip_yaw_actuator.V- (black) | 16 | black | 0.57 | 11.2 |
| C78 | W121 | GND | star_ground.P2 | l_hip_roll_actuator.Negative (-) | 14 | black | 1.05 | 19 |
| C79 | W122 | GND | star_ground.P2 | l_hip_pitch_actuator.Negative (-) | 12 | black | 1.05 | 19 |
| C80 | W123 | GND | star_ground.P2 | l_knee_actuator.Negative (-) | 12 | black | 1.05 | 19 |
| C81 | W124 | GND | star_ground.P2 | l_ankle_pitch_actuator.Negative (-) | 10 | black | 1.05 | 19 |
| C82 | W125 | GND | star_ground.P2 | l_ankle_roll_actuator.Negative (-) | 10 | black | 1.08 | 23.2 |
| C83 | W126 | GND | star_ground.P2 | l_shoulder_pitch_actuator.Negative (-) | 14 | black | 1.08 | 23.2 |
| C84 | W127 | GND | star_ground.P2 | l_shoulder_roll_actuator.Negative (-) | 12 | black | 1.08 | 23.2 |
| C85 | W128 | GND | star_ground.P2 | r_hip_yaw_actuator.V- (black) | 16 | black | 0.57 | 11.2 |
| C86 | W129 | GND | star_ground.P2 | r_hip_roll_actuator.Negative (-) | 14 | black | 1.05 | 19 |
| C87 | W130 | GND | star_ground.P2 | r_hip_pitch_actuator.Negative (-) | 12 | black | 1.05 | 19 |
| C88 | W131 | GND | star_ground.P2 | r_knee_actuator.Negative (-) | 12 | black | 1.05 | 19 |
| C89 | W132 | GND | star_ground.P2 | r_ankle_pitch_actuator.Negative (-) | 10 | black | 1.05 | 19 |
| C90 | W133 | GND | star_ground.P2 | r_ankle_roll_actuator.Negative (-) | 10 | black | 1.08 | 23.2 |
| C91 | W134 | GND | star_ground.P2 | r_shoulder_pitch_actuator.Negative (-) | 14 | black | 1.08 | 23.2 |
| C92 | W135 | GND | star_ground.P2 | r_shoulder_roll_actuator.Negative (-) | 12 | black | 1.08 | 23.2 |
| C93 | W136 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0 | 0 |
| C94 | W137 | GND | star_ground.P2 | computer.GND | 24 | black | 1.3 | 2.1 |
| C95 | W138 | GND | star_ground.P2 | l_upper_arm_yaw_actuator.GND | 18 | black | 1.16 | 5.76 |
| C96 | W139 | GND | star_ground.P2 | r_upper_arm_yaw_actuator.GND | 18 | black | 1.16 | 5.76 |
| C97 | W140 | GND | star_ground.P2 | neck_pan_actuator.GND | 24 | black | 0.22 | 2.38 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | battery to battery_2 | 1 | 205 | 101.5 | 40 | 0 | 60 | EC5 / EC5 | - |
| C2 | dcdc_12v_2 to dcdc_12v | 2 | 335 | 232.8 | 40 | 0 | 60 | barrier screw terminal / barrier screw terminal | - |
| C3 | leg_bus to leg_bus_hub_h | 1 | 130 | 29.4 | 40 | 0 | 60 | 3-pin screw terminal / lever clamp | - |
| C4 | leg_bus to leg_bus_hub_l | 1 | 130 | 25.9 | 40 | 0 | 60 | 3-pin screw terminal / lever clamp | - |
| C5 | CAN to l_hip_yaw_actuator | 2 | 435 | 333.9 | 40 | 0 | 60 | lever clamp / AMASS XT30PW(2+2)-M | torso_bay.legs |
| C6 | CAN to l_hip_roll_actuator | 2 | 625 | 450.7 | 40 | 70 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.legs |
| C7 | CAN to l_hip_pitch_actuator | 2 | 705 | 473.4 | 40 | 130 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.legs |
| C8 | CAN to l_knee_actuator | 2 | 980 | 686.8 | 40 | 190 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.legs |
| C9 | CAN to l_ankle_pitch_actuator | 2 | 1200 | 819.8 | 40 | 280 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.legs |
| C10 | CAN to l_ankle_roll_actuator | 2 | 1465 | 1008.3 | 40 | 355 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.legs |
| C11 | CAN to l_shoulder_pitch_actuator | 2 | 590 | 489.8 | 40 | 0 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.arm_l |
| C12 | CAN to l_shoulder_roll_actuator | 2 | 760 | 585.7 | 40 | 70 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.arm_l |
| C13 | leg_bus to l_hip_yaw_actuator | 1 | 355 | 251.3 | 40 | 0 | 60 | 3-pin screw terminal / AMASS XT30PW(2+2)-M | torso_bay.legs |
| C14 | leg_bus_2 to leg_bus_2_hub_h | 1 | 125 | 24.7 | 40 | 0 | 60 | 3-pin screw terminal / lever clamp | - |
| C15 | leg_bus_2 to leg_bus_2_hub_l | 1 | 140 | 38.7 | 40 | 0 | 60 | 3-pin screw terminal / lever clamp | - |
| C16 | CAN to r_hip_yaw_actuator | 2 | 340 | 237.4 | 40 | 0 | 60 | lever clamp / AMASS XT30PW(2+2)-M | torso_bay.legs |
| C17 | CAN to r_hip_roll_actuator | 2 | 515 | 343.9 | 40 | 70 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.legs |
| C18 | CAN to r_hip_pitch_actuator | 2 | 600 | 369.3 | 40 | 130 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.legs |
| C19 | CAN to r_knee_actuator | 2 | 870 | 584.5 | 40 | 185 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.legs |
| C20 | CAN to r_ankle_pitch_actuator | 2 | 1150 | 717.1 | 40 | 330 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.legs |
| C21 | CAN to r_ankle_roll_actuator | 2 | 1365 | 909.3 | 40 | 355 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.legs |
| C22 | CAN to r_shoulder_pitch_actuator | 2 | 615 | 511.4 | 40 | 0 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.arm_r |
| C23 | CAN to r_shoulder_roll_actuator | 2 | 785 | 612 | 40 | 70 | 60 | lever clamp / CJT A1257WR-S-4P | torso_bay.arm_r |
| C24 | leg_bus_2 to r_hip_yaw_actuator | 1 | 305 | 203.1 | 40 | 0 | 60 | 3-pin screw terminal / AMASS XT30PW(2+2)-M | torso_bay.legs |
| C25 | leg_bus to computer | 1 | 165 | 163.6 | 0 | 0 | 0 | USB | - |
| C26 | leg_bus_2 to computer | 1 | 250 | 249.9 | 0 | 0 | 0 | USB | - |
| C27 | arm_bus to arm_bus_hub | 1 | 140 | 38.1 | 40 | 0 | 60 | JST B3B-EH-A header / lever clamp | - |
| C28 | arm_bus to l_upper_arm_yaw_actuator | 1 | 1140 | 603.6 | 40 | 435 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | torso_bay.arm_l |
| C29 | arm_bus_hub to l_upper_arm_yaw_actuator | 1 | 1120 | 593 | 40 | 425 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_l |
| C30 | l_upper_arm_yaw_actuator to l_elbow_actuator | 3 | 390 | 201.5 | 40 | 85 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C31 | l_elbow_actuator to l_wrist_yaw_actuator | 3 | 375 | 179.2 | 40 | 95 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C32 | l_wrist_yaw_actuator to l_wrist_pitch_actuator | 3 | 350 | 118.3 | 40 | 130 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C33 | l_wrist_pitch_actuator to l_wrist_roll_actuator | 3 | 335 | 172.8 | 40 | 60 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C34 | l_wrist_roll_actuator to l_gripper_actuator | 3 | 300 | 99.3 | 40 | 100 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C35 | arm_bus_hub to r_upper_arm_yaw_actuator | 1 | 1050 | 449.4 | 40 | 500 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_r |
| C36 | r_upper_arm_yaw_actuator to r_elbow_actuator | 3 | 475 | 266.7 | 40 | 105 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C37 | r_elbow_actuator to r_wrist_yaw_actuator | 3 | 340 | 89.3 | 40 | 150 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C38 | r_wrist_yaw_actuator to r_wrist_pitch_actuator | 3 | 425 | 194.7 | 40 | 130 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C39 | r_wrist_pitch_actuator to r_wrist_roll_actuator | 3 | 305 | 95.8 | 40 | 105 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C40 | r_wrist_roll_actuator to r_gripper_actuator | 3 | 360 | 123.2 | 40 | 135 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C41 | arm_bus_hub to neck_pan_actuator | 1 | 580 | 475.3 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.neck |
| C42 | neck_pan_actuator to neck_tilt_actuator | 3 | 485 | 300.8 | 40 | 80 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C43 | head_camera to computer | 1 | 580 | 468.5 | 0 | 110 | 0 | FFC | torso_bay.neck |
| C44 | computer to imu | 4 | 640 | 539.8 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | torso_bay.imu + imu_hood.out |
| C45 | arm_bus to computer | 1 | 200 | 196.4 | 0 | 0 | 0 | USB | - |
| C46 | battery positive to main fuse | 1 | 245 | 144.9 | 40 | 0 | 60 | EC5 / M8 studs | - |
| C47 | main fuse to main switch | 1 | 555 | 452.9 | 40 | 0 | 60 | M8 studs / 3/8 in-16 studs | torso_bay.neck + switch_case.down |
| C48 | battery negative to star ground | 1 | 255 | 153.9 | 40 | 0 | 60 | EC5 / lever clamp | - |
| C49 | main_switch to the VBAT splice | 1 | 215 | 112.2 | 40 | 0 | 60 | 3/8 in-16 studs / lever clamp | - |
| C50 | VBAT to dcdc_12v | 1 | 255 | 150.9 | 40 | 0 | 60 | lever clamp / barrier screw terminal | switch_case.down |
| C51 | VBAT to dcdc_12v_2 | 1 | 270 | 166.3 | 40 | 0 | 60 | lever clamp / barrier screw terminal | switch_case.down |
| C52 | VBAT to l_hip_yaw_actuator | 1 | 640 | 538 | 40 | 0 | 60 | lever clamp / AMASS XT30PW(2+2)-M | switch_case.down |
| C53 | VBAT to l_hip_roll_actuator | 1 | 700 | 555.4 | 40 | 40 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C54 | VBAT to l_hip_pitch_actuator | 1 | 935 | 713.7 | 40 | 120 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C55 | VBAT to l_knee_actuator | 1 | 1085 | 850.6 | 40 | 130 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C56 | VBAT to l_ankle_pitch_actuator | 1 | 1410 | 1026.6 | 40 | 280 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C57 | VBAT to l_ankle_roll_actuator | 1 | 1755 | 1153 | 40 | 500 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C58 | VBAT to l_shoulder_pitch_actuator | 1 | 465 | 360.8 | 40 | 0 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C59 | VBAT to l_shoulder_roll_actuator | 1 | 715 | 394.4 | 40 | 220 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C60 | VBAT to r_hip_yaw_actuator | 1 | 650 | 549.9 | 40 | 0 | 60 | lever clamp / AMASS XT30PW(2+2)-M | switch_case.down |
| C61 | VBAT to r_hip_roll_actuator | 1 | 700 | 557.7 | 40 | 40 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C62 | VBAT to r_hip_pitch_actuator | 1 | 945 | 722.5 | 40 | 120 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C63 | VBAT to r_knee_actuator | 1 | 1105 | 861.9 | 40 | 140 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C64 | VBAT to r_ankle_pitch_actuator | 1 | 1440 | 1032.9 | 40 | 305 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C65 | VBAT to r_ankle_roll_actuator | 1 | 1845 | 1140.5 | 40 | 600 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C66 | VBAT to r_shoulder_pitch_actuator | 1 | 450 | 346.3 | 40 | 0 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C67 | VBAT to r_shoulder_roll_actuator | 1 | 710 | 390.9 | 40 | 215 | 60 | lever clamp / AMASS XT30PW-M | switch_case.down |
| C68 | dcdc_12v to the 12V splice | 2 | 610 | 509.3 | 40 | 0 | 60 | barrier screw terminal / lever clamp | - |
| C69 | 12V to regulator_5v | 1 | 770 | 666.1 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | backpack_hood.to_torso + torso_bay.neck |
| C70 | 12V to computer | 1 | 595 | 492 | 40 | 0 | 60 | lever clamp / Singatron 2DC-0005D206F DC power jack (J16) | backpack_hood.to_torso + torso_bay.neck |
| C71 | 12V to l_upper_arm_yaw_actuator | 1 | 765 | 558.2 | 40 | 105 | 60 | lever clamp / JST B3B-EH-A header | backpack_hood.to_torso |
| C72 | 12V to r_upper_arm_yaw_actuator | 1 | 710 | 501 | 40 | 105 | 60 | lever clamp / JST B3B-EH-A header | backpack_hood.to_torso |
| C73 | 12V to neck_pan_actuator | 1 | 495 | 390.1 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | backpack_hood.to_torso |
| C74 | regulator_5v to star_ground | 1 | 330 | 228.5 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C75 | VBAT to dcdc_12v | 1 | 650 | 547.9 | 40 | 0 | 60 | lever clamp / barrier screw terminal | torso_bay.neck + backpack_hood.to_torso |
| C76 | VBAT to dcdc_12v_2 | 1 | 570 | 468.6 | 40 | 0 | 60 | lever clamp / barrier screw terminal | torso_bay.neck + backpack_hood.to_torso |
| C77 | VBAT to l_hip_yaw_actuator | 1 | 595 | 494.5 | 40 | 0 | 60 | lever clamp / AMASS XT30PW(2+2)-M | torso_bay.legs |
| C78 | VBAT to l_hip_roll_actuator | 1 | 765 | 605.2 | 40 | 55 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.legs |
| C79 | VBAT to l_hip_pitch_actuator | 1 | 825 | 602.5 | 40 | 120 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.legs |
| C80 | VBAT to l_knee_actuator | 1 | 1080 | 820.2 | 40 | 155 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.legs |
| C81 | VBAT to l_ankle_pitch_actuator | 1 | 1250 | 1026.8 | 40 | 120 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.legs |
| C82 | VBAT to l_ankle_roll_actuator | 1 | 1430 | 1164.8 | 40 | 165 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.legs |
| C83 | VBAT to l_shoulder_pitch_actuator | 1 | 435 | 332.9 | 40 | 0 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.arm_l |
| C84 | VBAT to l_shoulder_roll_actuator | 1 | 855 | 467.2 | 40 | 285 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.arm_l |
| C85 | VBAT to r_hip_yaw_actuator | 1 | 595 | 492 | 40 | 0 | 60 | lever clamp / AMASS XT30PW(2+2)-M | torso_bay.legs |
| C86 | VBAT to r_hip_roll_actuator | 1 | 760 | 601.9 | 40 | 55 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.legs |
| C87 | VBAT to r_hip_pitch_actuator | 1 | 825 | 601.2 | 40 | 120 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.legs |
| C88 | VBAT to r_knee_actuator | 1 | 1075 | 820.6 | 40 | 150 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.legs |
| C89 | VBAT to r_ankle_pitch_actuator | 1 | 1250 | 1026.7 | 40 | 120 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.legs |
| C90 | VBAT to r_ankle_roll_actuator | 1 | 1435 | 1165.4 | 40 | 165 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.legs |
| C91 | VBAT to r_shoulder_pitch_actuator | 1 | 405 | 304.4 | 40 | 0 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.arm_r |
| C92 | VBAT to r_shoulder_roll_actuator | 1 | 835 | 445.5 | 40 | 285 | 60 | lever clamp / AMASS XT30PW-M | torso_bay.arm_r |
| C93 | 12V to regulator_5v | 1 | 330 | 228.6 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | - |
| C94 | 12V to computer | 1 | 270 | 165 | 40 | 0 | 60 | lever clamp / Singatron 2DC-0005D206F DC power jack (J16) | - |
| C95 | 12V to l_upper_arm_yaw_actuator | 1 | 960 | 421.5 | 40 | 435 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_l |
| C96 | 12V to r_upper_arm_yaw_actuator | 1 | 895 | 338.7 | 40 | 455 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_r |
| C97 | 12V to neck_pan_actuator | 1 | 430 | 327.7 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.neck |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C6 | l_hip_yaw | -0.6 to 0.6 | 33.2 | 72.3 | 70 |
| C7 | l_hip_yaw | -0.6 to 0.6 | 32.9 | 66.7 | 65 |
| C7 | l_hip_roll | -0.071 to 0.45 | 33.2 | 63.7 | 65 |
| C8 | l_hip_yaw | -0.6 to 0.6 | 33 | 57.7 | 55 |
| C8 | l_hip_roll | -0.071 to 0.45 | 51 | 58.4 | 35 |
| C8 | l_hip_pitch | -0.84 to 1.6 | 33.9 | 97.5 | 100 |
| C9 | l_hip_yaw | -0.6 to 0.6 | 32.9 | 74.7 | 75 |
| C9 | l_hip_roll | -0.071 to 0.45 | 33.1 | 70.7 | 70 |
| C9 | l_hip_pitch | -0.84 to 1.6 | 33.9 | 99 | 100 |
| C9 | l_knee | -2.042 to 0.313 | 37.6 | 44.1 | 35 |
| C10 | l_hip_yaw | -0.6 to 0.6 | 32.9 | 74.6 | 75 |
| C10 | l_hip_roll | -0.071 to 0.45 | 33.1 | 70.6 | 70 |
| C10 | l_hip_pitch | -0.84 to 1.6 | 36.1 | 75.2 | 70 |
| C10 | l_knee | -2.042 to 0.313 | 33.6 | 65.8 | 65 |
| C10 | l_ankle_pitch | -1.2 to 1.2 | 34.2 | 76.8 | 75 |
| C12 | l_shoulder_pitch | -3 to 3 | 35.2 | 71.4 | 70 |
| C17 | r_hip_yaw | -0.6 to 0.6 | 33.2 | 71.6 | 70 |
| C18 | r_hip_yaw | -0.6 to 0.6 | 32.9 | 66.6 | 65 |
| C18 | r_hip_roll | -0.45 to 0.071 | 33.2 | 63.8 | 65 |
| C19 | r_hip_yaw | -0.6 to 0.6 | 32.9 | 56.6 | 55 |
| C19 | r_hip_roll | -0.45 to 0.071 | 45.4 | 46.6 | 30 |
| C19 | r_hip_pitch | -1.6 to 0.84 | 34 | 96.7 | 100 |
| C20 | r_hip_yaw | -0.6 to 0.6 | 32.9 | 75.8 | 75 |
| C20 | r_hip_roll | -0.45 to 0.071 | 33.1 | 71.7 | 70 |
| C20 | r_hip_pitch | -1.6 to 0.84 | 33.5 | 113.7 | 120 |
| C20 | r_knee | -0.313 to 2.042 | 45.7 | 79.9 | 65 |
| C21 | r_hip_yaw | -0.6 to 0.6 | 32.9 | 74.5 | 75 |
| C21 | r_hip_roll | -0.45 to 0.071 | 33.1 | 70.5 | 70 |
| C21 | r_hip_pitch | -1.6 to 0.84 | 36.1 | 75.2 | 70 |
| C21 | r_knee | -0.313 to 2.042 | 33.6 | 65.8 | 65 |
| C21 | r_ankle_pitch | -1.2 to 1.2 | 34.3 | 76.2 | 75 |
| C23 | r_shoulder_pitch | -3 to 3 | 35.4 | 72 | 70 |
| C28 | l_shoulder_pitch | -3 to 3 | 29 | 295.7 | 325 |
| C28 | l_shoulder_roll | -0.04 to 1.6 | 23.3 | 103.1 | 110 |
| C29 | l_shoulder_pitch | -3 to 3 | 29 | 299.5 | 330 |
| C29 | l_shoulder_roll | -0.04 to 1.6 | 23.3 | 92 | 95 |
| C30 | l_upper_arm_yaw | -2 to 2 | 36.5 | 81.4 | 85 |
| C31 | l_elbow | -2.3 to 2.182 | 36.5 | 91.7 | 95 |
| C32 | l_wrist_yaw | -2.6 to 2.6 | 34.2 | 116.8 | 130 |
| C33 | l_wrist_pitch | -1.6 to 1.27 | 36.1 | 60.1 | 60 |
| C34 | l_wrist_roll | -2.8 to 2.8 | 36.5 | 94.9 | 100 |
| C35 | r_shoulder_pitch | -3 to 3 | 17.4 | 302.2 | 345 |
| C35 | r_shoulder_roll | -1.6 to 0.04 | 26.3 | 147.2 | 155 |
| C36 | r_upper_arm_yaw | -2 to 2 | 36.6 | 100.3 | 105 |
| C37 | r_elbow | -2.182 to 2.3 | 28.4 | 129.8 | 150 |
| C38 | r_wrist_yaw | -2.6 to 2.6 | 36.9 | 121.4 | 130 |
| C39 | r_wrist_pitch | -1.27 to 1.6 | 28.3 | 92.5 | 105 |
| C40 | r_wrist_roll | -2.8 to 2.8 | 25.7 | 112.6 | 135 |
| C42 | neck_pan | -1.6 to 1.6 | 39.3 | 79.7 | 80 |
| C43 | neck_tilt | -0.7 to 0.57 | 29.8 | 49.4 | 40 |
| C43 | neck_pan | -1.6 to 1.6 | 29.7 | 78 | 70 |
| C53 | l_hip_yaw | -0.6 to 0.6 | 29 | 51.2 | 40 |
| C54 | l_hip_yaw | -0.6 to 0.6 | 29.1 | 77.5 | 70 |
| C54 | l_hip_roll | -0.071 to 0.45 | 29.2 | 60.2 | 50 |
| C55 | l_hip_yaw | -0.6 to 0.6 | 29 | 66.3 | 60 |
| C55 | l_hip_roll | -0.071 to 0.45 | 29.4 | 32.5 | 20 |
| C55 | l_hip_pitch | -0.84 to 1.6 | 29.9 | 59.5 | 50 |
| C56 | l_hip_yaw | -0.6 to 0.6 | 29 | 73.3 | 70 |
| C56 | l_hip_roll | -0.071 to 0.45 | 29 | 29.9 | 20 |
| C56 | l_hip_pitch | -0.84 to 1.6 | 29.2 | 94.1 | 90 |
| C56 | l_knee | -2.042 to 0.313 | 29.3 | 101.5 | 100 |
| C57 | l_hip_yaw | -0.6 to 0.6 | 29 | 80.7 | 75 |
| C57 | l_hip_roll | -0.071 to 0.45 | 29.6 | 32.6 | 20 |
| C57 | l_hip_pitch | -0.84 to 1.6 | 29.1 | 127.5 | 130 |
| C57 | l_knee | -2.042 to 0.313 | 29.1 | 173.1 | 180 |
| C57 | l_ankle_pitch | -1.2 to 1.2 | 29.3 | 99.1 | 95 |
| C59 | l_shoulder_pitch | -3 to 3 | 29 | 206.4 | 220 |
| C61 | r_hip_yaw | -0.6 to 0.6 | 29 | 50.4 | 40 |
| C62 | r_hip_yaw | -0.6 to 0.6 | 29.1 | 77.3 | 70 |
| C62 | r_hip_roll | -0.45 to 0.071 | 29.2 | 59.9 | 50 |
| C63 | r_hip_yaw | -0.6 to 0.6 | 29 | 72.7 | 65 |
| C63 | r_hip_roll | -0.45 to 0.071 | 29.3 | 32.7 | 20 |
| C63 | r_hip_pitch | -1.6 to 0.84 | 29.7 | 63.1 | 55 |
| C64 | r_hip_yaw | -0.6 to 0.6 | 29 | 82.8 | 80 |
| C64 | r_hip_roll | -0.45 to 0.071 | 29 | 33.7 | 20 |
| C64 | r_hip_pitch | -1.6 to 0.84 | 29.1 | 107.7 | 105 |
| C64 | r_knee | -0.313 to 2.042 | 29.2 | 103.6 | 100 |
| C65 | r_hip_yaw | -0.6 to 0.6 | 29 | 93.5 | 90 |
| C65 | r_hip_roll | -0.45 to 0.071 | 29.7 | 32 | 20 |
| C65 | r_hip_pitch | -1.6 to 0.84 | 29.1 | 161.3 | 170 |
| C65 | r_knee | -0.313 to 2.042 | 29.1 | 201.9 | 215 |
| C65 | r_ankle_pitch | -1.2 to 1.2 | 29.2 | 107.6 | 105 |
| C67 | r_shoulder_pitch | -3 to 3 | 29 | 200.5 | 215 |
| C71 | l_shoulder_pitch | -3 to 3 | 35.9 | 65.8 | 50 |
| C71 | l_shoulder_roll | -0.04 to 1.6 | 27.9 | 62.4 | 55 |
| C72 | r_shoulder_pitch | -3 to 3 | 36.7 | 69.3 | 55 |
| C72 | r_shoulder_roll | -1.6 to 0.04 | 28.6 | 58.2 | 50 |
| C78 | l_hip_yaw | -0.6 to 0.6 | 29.3 | 61.2 | 55 |
| C79 | l_hip_yaw | -0.6 to 0.6 | 29 | 69.5 | 65 |
| C79 | l_hip_roll | -0.071 to 0.45 | 29.1 | 63.3 | 55 |
| C80 | l_hip_yaw | -0.6 to 0.6 | 29 | 58.6 | 50 |
| C80 | l_hip_roll | -0.071 to 0.45 | 33.6 | 41.5 | 25 |
| C80 | l_hip_pitch | -0.84 to 1.6 | 30 | 83.4 | 80 |
| C81 | l_hip_yaw | -0.6 to 0.6 | 29 | 35.5 | 25 |
| C81 | l_hip_roll | -0.071 to 0.45 | 41.6 | 42.6 | 20 |
| C81 | l_hip_pitch | -0.84 to 1.6 | 32.5 | 60.9 | 50 |
| C81 | l_knee | -2.042 to 0.313 | 31.9 | 37.8 | 25 |
| C82 | l_hip_yaw | -0.6 to 0.6 | 29 | 35.5 | 25 |
| C82 | l_hip_roll | -0.071 to 0.45 | 41.6 | 42.6 | 20 |
| C82 | l_hip_pitch | -0.84 to 1.6 | 32.5 | 60.9 | 50 |
| C82 | l_knee | -2.042 to 0.313 | 30.8 | 36.7 | 25 |
| C82 | l_ankle_pitch | -1.2 to 1.2 | 31.5 | 54.2 | 45 |
| C84 | l_shoulder_pitch | -3 to 3 | 29.2 | 262.2 | 285 |
| C86 | r_hip_yaw | -0.6 to 0.6 | 29.3 | 61.3 | 55 |
| C87 | r_hip_yaw | -0.6 to 0.6 | 29 | 69.5 | 65 |
| C87 | r_hip_roll | -0.45 to 0.071 | 29.1 | 63.4 | 55 |
| C88 | r_hip_yaw | -0.6 to 0.6 | 29 | 58.6 | 50 |
| C88 | r_hip_roll | -0.45 to 0.071 | 33.8 | 41.6 | 25 |
| C88 | r_hip_pitch | -1.6 to 0.84 | 30 | 82.7 | 75 |
| C89 | r_hip_yaw | -0.6 to 0.6 | 29 | 35.5 | 25 |
| C89 | r_hip_roll | -0.45 to 0.071 | 41.6 | 42.6 | 20 |
| C89 | r_hip_pitch | -1.6 to 0.84 | 32.5 | 60.9 | 50 |
| C89 | r_knee | -0.313 to 2.042 | 32 | 37.9 | 25 |
| C90 | r_hip_yaw | -0.6 to 0.6 | 29 | 35.5 | 25 |
| C90 | r_hip_roll | -0.45 to 0.071 | 41.6 | 42.6 | 20 |
| C90 | r_hip_pitch | -1.6 to 0.84 | 32.5 | 60.9 | 50 |
| C90 | r_knee | -0.313 to 2.042 | 30.8 | 36.7 | 25 |
| C90 | r_ankle_pitch | -1.2 to 1.2 | 31.5 | 54 | 45 |
| C92 | r_shoulder_pitch | -3 to 3 | 29.2 | 262 | 285 |
| C95 | l_shoulder_pitch | -3 to 3 | 29 | 296.3 | 325 |
| C95 | l_shoulder_roll | -0.04 to 1.6 | 25.3 | 105.2 | 110 |
| C96 | r_shoulder_pitch | -3 to 3 | 29.1 | 273.6 | 300 |
| C96 | r_shoulder_roll | -1.6 to 0.04 | 29 | 149.9 | 155 |

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
| 4 AWG silicone wire | 1.4 | m | 10 | 14.00 | 21.2 mm2, rated 70 A in a bundle; 1.27 m cut + 10 % waste | estimated |
| 8 AWG silicone wire | 0.3 | m | 4.5 | 1.35 | 8.37 mm2, rated 36.5 A in a bundle; 0.20 m cut + 10 % waste | estimated |
| 10 AWG silicone wire | 6 | m | 3.2 | 19.20 | 5.261 mm2, rated 27.5 A in a bundle; 5.37 m cut + 10 % waste | estimated |
| 12 AWG silicone wire | 6.1 | m | 2.2 | 13.42 | 3.308 mm2, rated 20.5 A in a bundle; 5.50 m cut + 10 % waste | estimated |
| 14 AWG silicone wire | 18.3 | m | 1.5 | 27.45 | 2.082 mm2, rated 16 A in a bundle; 16.63 m cut + 10 % waste | estimated |
| 16 AWG silicone wire | 1.4 | m | 1 | 1.40 | 1.308 mm2, rated 11 A in a bundle; 1.19 m cut + 10 % waste | estimated |
| 18 AWG silicone wire | 4.2 | m | 0.7 | 2.94 | 0.823 mm2, rated 8 A in a bundle; 3.75 m cut + 10 % waste | estimated |
| 20 AWG silicone wire | 0.8 | m | 0.5 | 0.40 | 0.519 mm2, rated 5.5 A in a bundle; 0.71 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 8.3 | m | 0.4 | 3.32 | 0.327 mm2, rated 3.5 A in a bundle; 7.54 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 11.4 | m | 0.35 | 3.99 | 0.205 mm2, rated 1.75 A in a bundle; 10.36 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 37.5 | m | 0.3 | 11.25 | 0.128 mm2, rated 1.1 A in a bundle; 34.03 m cut + 10 % waste | estimated |
| EC5 contacts | 4 | pc | 1.5 | 6.00 | rated 120 A per contact | estimated |
| Bootlace ferrule contacts | 16 | pc | 0.03 | 0.48 | rated 17.5 A per contact | estimated |
| XT30 contacts | 38 | pc | 0.6 | 22.80 | rated 20 A per contact | estimated |
| Dupont 2.54 mm contacts | 36 | pc | 0.02 | 0.72 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 16 | pc | 0.02 | 0.32 | one per cable end | estimated |
| JST EH 2.5 mm contacts | 78 | pc | 0.03 | 2.34 | rated 3 A per contact | estimated |
| JST EH 2.5 mm housings | 34 | pc | 0.05 | 1.70 | one per cable end | estimated |
| Heat shrink 3 mm, 2:1 | 6.1 | m | 0.2 | 1.22 | 9 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 142 | pc | 0.02 | 2.84 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 12 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 8 | pc | 0.08 | 0.64 | 9.5 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 22.8 | m | 0.4 | 9.12 | over every cable where it crosses a joint | estimated |
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
- Routing: 25 wire runs could only be laid through solid parts at the home pose (2733 mm in all), for example leg_bus~leg_bus_hub_h wire 1 through battery_2 for 9 mm at 49,-91,90; leg_bus~leg_bus_hub_l wire 1 through battery_2 for 10 mm at 49,-86,91; can~l_shoulder_roll_actuator (leg_bus_hub_l) wire 2 through a printed part for 56 mm at 22,139,213. Lay those wires round the part by hand.
