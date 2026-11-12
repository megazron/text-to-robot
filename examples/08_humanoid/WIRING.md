# Wiring: humanoid_robot

52 cables, 97 conductors, 38.93 m of wire, wiring parts $44.30.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 11.1 | main_switch | 35 / 70 | 10.011 / 29.911 | 3.5x | 15 | 0.269 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 1 / 5 | 5.5x | - | 0.084 |
| 5V_ARMS | 5 | regulator_5v_arms | 5.5 / 8 | 1.32 / 5.07 | 4.2x | - | 0.1 |

**VBAT loads** (peak assumes one leg at peak, the rest at half load):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator_5v | 0.501 | 2.503 |
| regulator_5v_arms | 0.661 | 2.538 |
| leg_bus | 0.05 | 0.1 |
| l_hip_yaw_actuator | 0.45 | 2.7 |
| l_ankle_pitch_actuator | 1.1 | 4.65 |
| r_hip_yaw_actuator | 0.45 | 2.7 |
| r_ankle_pitch_actuator | 1.1 | 4.65 |
| l_hip_roll_actuator | 2.25 | 6.4 |
| r_hip_roll_actuator | 2.25 | 6.4 |
| l_shoulder_pitch_actuator | 0.6 | 1.7 |
| r_shoulder_pitch_actuator | 0.6 | 1.7 |

**5V loads** (peak assumes the computer at its peak and every sensor running):

| Load | Typical A | Peak A |
|---|--:|--:|
| computer | 1 | 5 |

**5V_ARMS loads** (peak assumes four arm servos at peak at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| l_elbow_actuator | 0.44 | 1.69 |
| r_elbow_actuator | 0.44 | 1.69 |
| neck_pan_actuator | 0.44 | 1.69 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 15 A ATM blade fuse, inline holder, protects everything on VBAT (12 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch regulator_5v (22 AWG).
- Fuse **F3**: 2 A ATM blade fuse, inline holder, protects branch regulator_5v_arms (22 AWG).
- Fuse **F4**: 2 A ATM blade fuse, inline holder, protects branch leg_bus (22 AWG).
- Fuse **F5**: 2 A ATM blade fuse, inline holder, protects branch l_hip_yaw_actuator (22 AWG).
- Fuse **F6**: 3 A ATM blade fuse, inline holder, protects branch l_ankle_pitch_actuator (22 AWG).
- Fuse **F7**: 2 A ATM blade fuse, inline holder, protects branch r_hip_yaw_actuator (22 AWG).
- Fuse **F8**: 3 A ATM blade fuse, inline holder, protects branch r_ankle_pitch_actuator (22 AWG).
- Fuse **F9**: 4 A ATM blade fuse, inline holder, protects branch l_hip_roll_actuator (20 AWG).
- Fuse **F10**: 4 A ATM blade fuse, inline holder, protects branch r_hip_roll_actuator (20 AWG).
- Fuse **F11**: 2 A ATM blade fuse, inline holder, protects branch l_shoulder_pitch_actuator (22 AWG).
- Fuse **F12**: 2 A ATM blade fuse, inline holder, protects branch r_shoulder_pitch_actuator (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | HEAD_CAMERA_CSI | head_camera.GND | computer.GND | made | black | 0.2 | 0.25 |
| C2 | W2 | 3V3_IMU | computer.3V3 | imu.VIN | 24 | red | 0.011 | 0.015 |
| C2 | W3 | GND | computer.GND | imu.GND | 24 | black | 0.011 | 0.015 |
| C2 | W4 | I2C_SDA | computer.GPIO2 | imu.SDA | 26 | blue | 0.02 | 0.02 |
| C2 | W5 | I2C_SCL | computer.GPIO3 | imu.SCL | 26 | yellow | 0.02 | 0.02 |
| C3 | W6 | BUS_LEG_BUS | leg_bus.SIG | leg_bus_hub.P1 | 26 | yellow | 0.02 | 0.02 |
| C4 | W7 | BUS_LEG_BUS | leg_bus_hub.P2 | l_hip_yaw_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C5 | W8 | BUS_LEG_BUS | leg_bus_hub.P2 | l_ankle_pitch_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C6 | W9 | VBAT | l_ankle_pitch_actuator.VCC | l_ankle_roll_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C6 | W10 | GND | l_ankle_pitch_actuator.GND | l_ankle_roll_actuator.GND | 24 | black | 0.45 | 2.7 |
| C6 | W11 | BUS_LEG_BUS | l_ankle_pitch_actuator.DATA | l_ankle_roll_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C7 | W12 | BUS_LEG_BUS | leg_bus_hub.P2 | r_hip_yaw_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C8 | W13 | BUS_LEG_BUS | leg_bus_hub.P2 | r_ankle_pitch_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C9 | W14 | VBAT | r_ankle_pitch_actuator.VCC | r_ankle_roll_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C9 | W15 | GND | r_ankle_pitch_actuator.GND | r_ankle_roll_actuator.GND | 24 | black | 0.45 | 2.7 |
| C9 | W16 | BUS_LEG_BUS | r_ankle_pitch_actuator.DATA | r_ankle_roll_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C10 | W17 | BUS_ARM_BUS | arm_bus.DATA | arm_bus_hub.P1 | 26 | yellow | 0.02 | 0.02 |
| C11 | W18 | GND | arm_bus.GND | l_hip_roll_actuator.GND | 24 | black | 0.01 | 0.01 |
| C12 | W19 | BUS_ARM_BUS | arm_bus_hub.P2 | l_hip_roll_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C13 | W20 | VBAT | l_hip_roll_actuator.VDD | l_hip_pitch_actuator.VDD | 22 | red | 1.5 | 5.65 |
| C13 | W21 | GND | l_hip_roll_actuator.GND | l_hip_pitch_actuator.GND | 22 | black | 1.5 | 5.65 |
| C13 | W22 | BUS_ARM_BUS | l_hip_roll_actuator.DATA | l_hip_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C14 | W23 | VBAT | l_hip_pitch_actuator.VDD | l_knee_actuator.VDD | 22 | red | 0.75 | 4.9 |
| C14 | W24 | GND | l_hip_pitch_actuator.GND | l_knee_actuator.GND | 22 | black | 0.75 | 4.9 |
| C14 | W25 | BUS_ARM_BUS | l_hip_pitch_actuator.DATA | l_knee_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C15 | W26 | BUS_ARM_BUS | arm_bus_hub.P2 | r_hip_roll_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C16 | W27 | VBAT | r_hip_roll_actuator.VDD | r_hip_pitch_actuator.VDD | 22 | red | 1.5 | 5.65 |
| C16 | W28 | GND | r_hip_roll_actuator.GND | r_hip_pitch_actuator.GND | 22 | black | 1.5 | 5.65 |
| C16 | W29 | BUS_ARM_BUS | r_hip_roll_actuator.DATA | r_hip_pitch_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C17 | W30 | VBAT | r_hip_pitch_actuator.VDD | r_knee_actuator.VDD | 22 | red | 0.75 | 4.9 |
| C17 | W31 | GND | r_hip_pitch_actuator.GND | r_knee_actuator.GND | 22 | black | 0.75 | 4.9 |
| C17 | W32 | BUS_ARM_BUS | r_hip_pitch_actuator.DATA | r_knee_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C18 | W33 | BUS_ARM_BUS | arm_bus_hub.P2 | l_shoulder_pitch_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C19 | W34 | VBAT | l_shoulder_pitch_actuator.VDD | l_shoulder_roll_actuator.VDD | 24 | red | 0.4 | 1.5 |
| C19 | W35 | GND | l_shoulder_pitch_actuator.GND | l_shoulder_roll_actuator.GND | 24 | black | 0.4 | 1.5 |
| C19 | W36 | BUS_ARM_BUS | l_shoulder_pitch_actuator.DATA | l_shoulder_roll_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C20 | W37 | VBAT | l_shoulder_roll_actuator.VDD | l_upper_arm_yaw_actuator.VDD | 24 | red | 0.2 | 1.3 |
| C20 | W38 | GND | l_shoulder_roll_actuator.GND | l_upper_arm_yaw_actuator.GND | 24 | black | 0.2 | 1.3 |
| C20 | W39 | BUS_ARM_BUS | l_shoulder_roll_actuator.DATA | l_upper_arm_yaw_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C21 | W40 | BUS_ARM_BUS | arm_bus_hub.P2 | r_shoulder_pitch_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C22 | W41 | VBAT | r_shoulder_pitch_actuator.VDD | r_shoulder_roll_actuator.VDD | 24 | red | 0.4 | 1.5 |
| C22 | W42 | GND | r_shoulder_pitch_actuator.GND | r_shoulder_roll_actuator.GND | 24 | black | 0.4 | 1.5 |
| C22 | W43 | BUS_ARM_BUS | r_shoulder_pitch_actuator.DATA | r_shoulder_roll_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C23 | W44 | VBAT | r_shoulder_roll_actuator.VDD | r_upper_arm_yaw_actuator.VDD | 24 | red | 0.2 | 1.3 |
| C23 | W45 | GND | r_shoulder_roll_actuator.GND | r_upper_arm_yaw_actuator.GND | 24 | black | 0.2 | 1.3 |
| C23 | W46 | BUS_ARM_BUS | r_shoulder_roll_actuator.DATA | r_upper_arm_yaw_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C24 | W47 | BUS_ARM_BUS | arm_bus_hub.P2 | l_elbow_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C25 | W48 | 5V_ARMS | l_elbow_actuator.VDD | l_gripper_actuator.VDD | 24 | red | 0.22 | 1.47 |
| C25 | W49 | GND | l_elbow_actuator.GND | l_gripper_actuator.GND | 24 | black | 0.22 | 1.47 |
| C25 | W50 | BUS_ARM_BUS | l_elbow_actuator.DATA | l_gripper_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C26 | W51 | BUS_ARM_BUS | arm_bus_hub.P2 | r_elbow_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C27 | W52 | 5V_ARMS | r_elbow_actuator.VDD | r_gripper_actuator.VDD | 24 | red | 0.22 | 1.47 |
| C27 | W53 | GND | r_elbow_actuator.GND | r_gripper_actuator.GND | 24 | black | 0.22 | 1.47 |
| C27 | W54 | BUS_ARM_BUS | r_elbow_actuator.DATA | r_gripper_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C28 | W55 | BUS_ARM_BUS | arm_bus_hub.P2 | neck_pan_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C29 | W56 | 5V_ARMS | neck_pan_actuator.VDD | neck_tilt_actuator.VDD | 24 | red | 0.22 | 1.47 |
| C29 | W57 | GND | neck_pan_actuator.GND | neck_tilt_actuator.GND | 24 | black | 0.22 | 1.47 |
| C29 | W58 | BUS_ARM_BUS | neck_pan_actuator.DATA | neck_tilt_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C30 | W59 | LEG_BUS_USB | leg_bus.VBUS | computer.LINK | made | red | 0.05 | 0.1 |
| C31 | W60 | ARM_BUS_USB | arm_bus.VBUS | computer.LINK | made | red | 0.05 | 0.1 |
| C32 | W61 | VBAT | battery.BAT+ | main_fuse.IN | 12 | red | 10.011 | 29.911 |
| C33 | W62 | VBAT | main_fuse.OUT | main_switch.IN | 12 | red | 10.011 | 29.911 |
| C34 | W63 | GND | battery.BAT- | star_ground.P1 | 12 | black | 10.011 | 29.911 |
| C35 | W64 | VBAT | main_switch.OUT | splice_vbat.P1 | 12 | red | 10.011 | 29.911 |
| C36 | W65 | VBAT | splice_vbat.P2 | regulator_5v.VIN | 22 | red | 0.501 | 2.503 |
| C36 | W66 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0.501 | 2.503 |
| C37 | W67 | VBAT | splice_vbat.P2 | regulator_5v_arms.VIN | 22 | red | 0.661 | 2.538 |
| C37 | W68 | GND | star_ground.P2 | regulator_5v_arms.GND | 24 | black | 0.661 | 2.538 |
| C38 | W69 | VBAT | splice_vbat.P2 | leg_bus.VIN | 22 | red | 0.05 | 0.1 |
| C38 | W70 | GND | star_ground.P2 | leg_bus.GND | 24 | black | 0.05 | 0.1 |
| C39 | W71 | VBAT | splice_vbat.P2 | l_hip_yaw_actuator.VCC | 22 | red | 0.45 | 2.7 |
| C39 | W72 | GND | star_ground.P2 | l_hip_yaw_actuator.GND | 24 | black | 0.45 | 2.7 |
| C40 | W73 | VBAT | splice_vbat.P2 | l_ankle_pitch_actuator.VCC | 22 | red | 1.1 | 4.65 |
| C40 | W74 | GND | star_ground.P2 | l_ankle_pitch_actuator.GND | 20 | black | 1.1 | 4.65 |
| C41 | W75 | VBAT | splice_vbat.P2 | r_hip_yaw_actuator.VCC | 22 | red | 0.45 | 2.7 |
| C41 | W76 | GND | star_ground.P2 | r_hip_yaw_actuator.GND | 24 | black | 0.45 | 2.7 |
| C42 | W77 | VBAT | splice_vbat.P2 | r_ankle_pitch_actuator.VCC | 22 | red | 1.1 | 4.65 |
| C42 | W78 | GND | star_ground.P2 | r_ankle_pitch_actuator.GND | 20 | black | 1.1 | 4.65 |
| C43 | W79 | VBAT | splice_vbat.P2 | l_hip_roll_actuator.VDD | 20 | red | 2.25 | 6.4 |
| C43 | W80 | GND | star_ground.P2 | l_hip_roll_actuator.GND | 20 | black | 2.25 | 6.4 |
| C44 | W81 | VBAT | splice_vbat.P2 | r_hip_roll_actuator.VDD | 20 | red | 2.25 | 6.4 |
| C44 | W82 | GND | star_ground.P2 | r_hip_roll_actuator.GND | 20 | black | 2.25 | 6.4 |
| C45 | W83 | VBAT | splice_vbat.P2 | l_shoulder_pitch_actuator.VDD | 22 | red | 0.6 | 1.7 |
| C45 | W84 | GND | star_ground.P2 | l_shoulder_pitch_actuator.GND | 24 | black | 0.6 | 1.7 |
| C46 | W85 | VBAT | splice_vbat.P2 | r_shoulder_pitch_actuator.VDD | 22 | red | 0.6 | 1.7 |
| C46 | W86 | GND | star_ground.P2 | r_shoulder_pitch_actuator.GND | 24 | black | 0.6 | 1.7 |
| C47 | W87 | GND | regulator_5v.GND | star_ground.P2 | 22 | black | 1 | 5 |
| C48 | W88 | 5V | regulator_5v.VOUT | computer.5V | 22 | red | 1 | 5 |
| C48 | W89 | GND | star_ground.P2 | computer.GND | 22 | black | 1 | 5 |
| C49 | W90 | 5V_ARMS | regulator_5v_arms.VOUT | splice_5v_arms.P1 | 22 | red | 1.32 | 5.07 |
| C49 | W91 | GND | regulator_5v_arms.GND | star_ground.P2 | 22 | black | 1.32 | 5.07 |
| C50 | W92 | 5V_ARMS | splice_5v_arms.P2 | l_elbow_actuator.VDD | 22 | red | 0.44 | 1.69 |
| C50 | W93 | GND | star_ground.P2 | l_elbow_actuator.GND | 22 | black | 0.44 | 1.69 |
| C51 | W94 | 5V_ARMS | splice_5v_arms.P2 | r_elbow_actuator.VDD | 22 | red | 0.44 | 1.69 |
| C51 | W95 | GND | star_ground.P2 | r_elbow_actuator.GND | 22 | black | 0.44 | 1.69 |
| C52 | W96 | 5V_ARMS | splice_5v_arms.P2 | neck_pan_actuator.VDD | 24 | red | 0.44 | 1.69 |
| C52 | W97 | GND | star_ground.P2 | neck_pan_actuator.GND | 24 | black | 0.44 | 1.69 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | head_camera to computer | 1 | 390 | 298.6 | 0 | 90 | 0 | FFC | torso_bay.neck |
| C2 | computer to imu | 4 | 440 | 338.9 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | torso_bay.imu + imu_hood.out |
| C3 | leg_bus to leg_bus_hub | 1 | 145 | 43.6 | 40 | 0 | 60 | 3-pin 2.5 mm bus servo header (5264 class) / lever clamp | - |
| C4 | leg_bus_hub to l_hip_yaw_actuator | 1 | 315 | 210.9 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | torso_bay.legs |
| C5 | leg_bus_hub to l_ankle_pitch_actuator | 1 | 815 | 490.6 | 40 | 220 | 60 | lever clamp / Feetech 5264-3P | torso_bay.legs |
| C6 | l_ankle_pitch_actuator to l_ankle_roll_actuator | 3 | 300 | 138.8 | 40 | 60 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C7 | leg_bus_hub to r_hip_yaw_actuator | 1 | 305 | 203.7 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | torso_bay.legs |
| C8 | leg_bus_hub to r_ankle_pitch_actuator | 1 | 835 | 490 | 40 | 245 | 60 | lever clamp / Feetech 5264-3P | torso_bay.legs |
| C9 | r_ankle_pitch_actuator to r_ankle_roll_actuator | 3 | 275 | 114.4 | 40 | 60 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C10 | arm_bus to arm_bus_hub | 1 | 140 | 39.2 | 40 | 0 | 60 | JST B3B-EH-A header / lever clamp | - |
| C11 | arm_bus to l_hip_roll_actuator | 1 | 445 | 306.3 | 40 | 35 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | torso_bay.legs |
| C12 | arm_bus_hub to l_hip_roll_actuator | 1 | 435 | 298.5 | 40 | 35 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.legs |
| C13 | l_hip_roll_actuator to l_hip_pitch_actuator | 3 | 275 | 117.4 | 40 | 55 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C14 | l_hip_pitch_actuator to l_knee_actuator | 3 | 370 | 146 | 40 | 120 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C15 | arm_bus_hub to r_hip_roll_actuator | 1 | 355 | 223 | 40 | 30 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.legs |
| C16 | r_hip_roll_actuator to r_hip_pitch_actuator | 3 | 325 | 187.9 | 40 | 35 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C17 | r_hip_pitch_actuator to r_knee_actuator | 3 | 345 | 133.1 | 40 | 110 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C18 | arm_bus_hub to l_shoulder_pitch_actuator | 1 | 390 | 286 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_l |
| C19 | l_shoulder_pitch_actuator to l_shoulder_roll_actuator | 3 | 730 | 455.8 | 40 | 170 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C20 | l_shoulder_roll_actuator to l_upper_arm_yaw_actuator | 3 | 320 | 143.3 | 40 | 75 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C21 | arm_bus_hub to r_shoulder_pitch_actuator | 1 | 315 | 211.7 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_r |
| C22 | r_shoulder_pitch_actuator to r_shoulder_roll_actuator | 3 | 425 | 152.8 | 40 | 170 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C23 | r_shoulder_roll_actuator to r_upper_arm_yaw_actuator | 3 | 295 | 128.9 | 40 | 65 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C24 | arm_bus_hub to l_elbow_actuator | 1 | 950 | 355.7 | 40 | 490 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_l |
| C25 | l_elbow_actuator to l_gripper_actuator | 3 | 280 | 72.9 | 40 | 105 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C26 | arm_bus_hub to r_elbow_actuator | 1 | 825 | 235.8 | 40 | 485 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_r |
| C27 | r_elbow_actuator to r_gripper_actuator | 3 | 305 | 109.3 | 40 | 95 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C28 | arm_bus_hub to neck_pan_actuator | 1 | 375 | 273.3 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.neck |
| C29 | neck_pan_actuator to neck_tilt_actuator | 3 | 385 | 190.5 | 40 | 90 | 60 | JST B3B-EH-A header / JST B3B-EH-A header | - |
| C30 | leg_bus to computer | 1 | 150 | 147.4 | 0 | 0 | 0 | USB | - |
| C31 | arm_bus to computer | 1 | 165 | 164.1 | 0 | 0 | 0 | USB | - |
| C32 | battery positive to main fuse | 1 | 210 | 105.2 | 40 | 0 | 60 | XT60 (male discharge plug on the pack per the listing) / soldered leads | - |
| C33 | main fuse to main switch | 1 | 185 | 80.6 | 40 | 0 | 60 | soldered leads / 6.3 mm quick-connect tabs | - |
| C34 | battery negative to star ground | 1 | 230 | 127.7 | 40 | 0 | 60 | XT60 (male discharge plug on the pack per the listing) / lever clamp | - |
| C35 | main_switch to the VBAT splice | 1 | 170 | 66.7 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / lever clamp | - |
| C36 | VBAT to regulator_5v | 2 | 265 | 161.5 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | - |
| C37 | VBAT to regulator_5v_arms | 2 | 235 | 134.6 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | - |
| C38 | VBAT to leg_bus | 2 | 315 | 212.7 | 40 | 0 | 60 | lever clamp / green screw terminal | - |
| C39 | VBAT to l_hip_yaw_actuator | 2 | 390 | 286.9 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | torso_bay.legs |
| C40 | VBAT to l_ankle_pitch_actuator | 2 | 910 | 570.9 | 40 | 235 | 60 | lever clamp / Feetech 5264-3P | torso_bay.legs |
| C41 | VBAT to r_hip_yaw_actuator | 2 | 380 | 279.4 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | torso_bay.legs |
| C42 | VBAT to r_ankle_pitch_actuator | 2 | 910 | 570.1 | 40 | 235 | 60 | lever clamp / Feetech 5264-3P | torso_bay.legs |
| C43 | VBAT to l_hip_roll_actuator | 2 | 575 | 426.6 | 40 | 45 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.legs |
| C44 | VBAT to r_hip_roll_actuator | 2 | 500 | 350.8 | 40 | 45 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.legs |
| C45 | VBAT to l_shoulder_pitch_actuator | 2 | 320 | 217.5 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_l |
| C46 | VBAT to r_shoulder_pitch_actuator | 2 | 345 | 242.7 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_r |
| C47 | regulator_5v to star_ground | 1 | 150 | 46.7 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C48 | 5V to computer | 2 | 280 | 177.9 | 40 | 0 | 60 | 0.1 in through holes / 40-pin header | - |
| C49 | regulator_5v_arms to the 5V_ARMS splice | 2 | 170 | 66.9 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C50 | 5V_ARMS to l_elbow_actuator | 2 | 965 | 329.7 | 40 | 535 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_l |
| C51 | 5V_ARMS to r_elbow_actuator | 2 | 935 | 314.7 | 40 | 520 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.arm_r |
| C52 | 5V_ARMS to neck_pan_actuator | 2 | 350 | 247 | 40 | 0 | 60 | lever clamp / JST B3B-EH-A header | torso_bay.neck |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C1 | neck_tilt | -0.7 to 0.377 | 30.6 | 40.8 | 30 |
| C1 | neck_pan | -1.6 to 1.6 | 29.9 | 68.4 | 60 |
| C5 | l_hip_yaw | -0.6 to 0.6 | 29 | 46.9 | 35 |
| C5 | l_hip_roll | -0.128 to 0.45 | 29.4 | 52.9 | 45 |
| C5 | l_hip_pitch | -1.6 to 1.6 | 30 | 82.4 | 75 |
| C5 | l_knee | -2.042 to 2.2 | 32.4 | 73.4 | 65 |
| C6 | l_ankle_pitch | -1.2 to 1.2 | 28.7 | 51.2 | 60 |
| C8 | r_hip_yaw | -0.6 to 0.6 | 29 | 47.4 | 40 |
| C8 | r_hip_roll | -0.45 to 0.128 | 29.4 | 53.1 | 45 |
| C8 | r_hip_pitch | -1.6 to 1.6 | 29.9 | 85.4 | 80 |
| C8 | r_knee | -2.2 to 2.042 | 30.3 | 83.7 | 80 |
| C9 | r_ankle_pitch | -1.2 to 1.2 | 23.3 | 46.6 | 60 |
| C11 | l_hip_yaw | -0.6 to 0.6 | 29.4 | 47 | 35 |
| C12 | l_hip_yaw | -0.6 to 0.6 | 29.4 | 47.5 | 35 |
| C13 | l_hip_roll | -0.128 to 0.45 | 27.1 | 44.4 | 55 |
| C14 | l_hip_pitch | -1.6 to 1.6 | 26.6 | 102.9 | 120 |
| C15 | r_hip_yaw | -0.6 to 0.6 | 29.2 | 42.9 | 30 |
| C16 | r_hip_roll | -0.45 to 0.128 | 34 | 36.3 | 35 |
| C17 | r_hip_pitch | -1.6 to 1.6 | 26 | 93.6 | 110 |
| C19 | l_shoulder_pitch | -3 to 3 | 37.7 | 156.4 | 170 |
| C20 | l_shoulder_roll | -0.115 to 1.6 | 41.5 | 79.7 | 75 |
| C22 | r_shoulder_pitch | -3 to 3 | 21.4 | 138.3 | 170 |
| C23 | r_shoulder_roll | -1.6 to 0.115 | 21.3 | 47.1 | 65 |
| C24 | l_shoulder_pitch | -3 to 3 | 16.4 | 230.9 | 265 |
| C24 | l_shoulder_roll | -0.115 to 1.6 | 25.7 | 143.8 | 150 |
| C24 | l_upper_arm_yaw | -2 to 2 | 29.2 | 78.1 | 75 |
| C25 | l_elbow | -2.3 to 2.3 | 24.9 | 87.7 | 105 |
| C26 | r_shoulder_pitch | -3 to 3 | 16.7 | 231.5 | 265 |
| C26 | r_shoulder_roll | -1.6 to 0.115 | 25.2 | 144.1 | 155 |
| C26 | r_upper_arm_yaw | -2 to 2 | 29.1 | 72.9 | 65 |
| C27 | r_elbow | -2.3 to 2.3 | 30 | 85.9 | 95 |
| C29 | neck_pan | -1.6 to 1.6 | 29.1 | 77.4 | 90 |
| C40 | l_hip_yaw | -0.6 to 0.6 | 32.9 | 49.4 | 45 |
| C40 | l_hip_roll | -0.128 to 0.45 | 33.4 | 58.4 | 55 |
| C40 | l_hip_pitch | -1.6 to 1.6 | 38.2 | 70.9 | 65 |
| C40 | l_knee | -2.042 to 2.2 | 42 | 81.1 | 70 |
| C42 | r_hip_yaw | -0.6 to 0.6 | 32.9 | 49 | 45 |
| C42 | r_hip_roll | -0.45 to 0.128 | 33.4 | 58.3 | 55 |
| C42 | r_hip_pitch | -1.6 to 1.6 | 36.5 | 73.9 | 70 |
| C42 | r_knee | -2.2 to 2.042 | 51.2 | 84.7 | 65 |
| C43 | l_hip_yaw | -0.6 to 0.6 | 34 | 50.9 | 45 |
| C44 | r_hip_yaw | -0.6 to 0.6 | 33.1 | 47.6 | 45 |
| C50 | l_shoulder_pitch | -3 to 3 | 18.3 | 235.1 | 275 |
| C50 | l_shoulder_roll | -0.115 to 1.6 | 29.1 | 147.9 | 165 |
| C50 | l_upper_arm_yaw | -2 to 2 | 33 | 89.6 | 95 |
| C51 | r_shoulder_pitch | -3 to 3 | 17.2 | 233 | 275 |
| C51 | r_shoulder_roll | -1.6 to 0.115 | 28 | 147.8 | 165 |
| C51 | r_upper_arm_yaw | -2 to 2 | 33 | 79.5 | 80 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (LiPo 3S 5000 mAh 60C, XT60) | 55.5 | 5000 | VBAT 11.1 V | 10.011 | 24 min | 29.911 | 8 min | 5.98 C | 300 |

### Regulator heat

Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.

| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|
| regulator_5v | switching | VBAT 11.1 V | 5V 5 V | 1 / 5 | 5.561 | 5 | 0.561 / 2.783 | 90 % | 3 | yes |
| regulator_5v_arms | switching | VBAT 11.1 V | 5V_ARMS 5 V | 1.32 / 5.07 | 7.337 | 6.6 | 0.737 / 2.822 | 90 % | 3 | yes |
- regulator_5v: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 3 W of heat.
- regulator_5v_arms: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 3 W of heat.

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| BUS_ARM_BUS | U1 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | U1 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M3 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M4 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M5 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M6 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M8 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M9 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M10 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M11 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M12 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M13 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M16 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M17 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M18 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M19 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M22 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M23 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M21 DATA | M24 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M22 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M23 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | U1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M19 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ARM_BUS | M24 DATA | M21 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M1 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M1 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M1 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M1 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M1 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M1 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M1 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M1 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M2 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M2 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M2 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M2 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M2 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M7 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M7 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M7 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M7 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M7 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | U4 SIG | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | U4 SIG | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | U4 SIG | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | U4 SIG | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | U4 SIG | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | U4 SIG | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | U4 SIG | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | U4 SIG | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M14 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M14 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M14 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M14 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M14 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M14 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M14 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M14 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M14 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M14 DATA | M20 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M15 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M15 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M15 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M15 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M15 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M20 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M20 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M20 DATA | U4 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M20 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_LEG_BUS | M20 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| I2C_SCL | A1 GPIO3 | U3 SCL | 3.3 | 2.3 | 5.5 | ok |
| I2C_SCL | U3 SCL | A1 GPIO3 | 3.3 | 2.15 | 3.6 | ok |
| I2C_SDA | A1 GPIO2 | U3 SDA | 3.3 | 2.3 | 5.5 | ok |
| I2C_SDA | U3 SDA | A1 GPIO2 | 3.3 | 2.15 | 3.6 | ok |

Not checked (no logic levels in the parts data): DYNAMIXEL XH540-W270-T(R), DYNAMIXEL XL330-M288-T, DYNAMIXEL XL430-W250-T, Feetech STS3215 C047 12 V 30 kg.cm (1:345), Feetech STS3250 C002 12 V 50 kg.cm (1:345), ROBOTIS U2D2 USB to TTL/RS-485 interface, Waveshare Bus Servo Adapter (A).

### Sources

| Input | Source |
|---|---|
| LiPo 3S 5000 mAh 60C, XT60 (Gens Ace G-Tech) capacity and energy | [datasheet](https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) heat | estimated: 27.5 W out at about 90 % (Pololu range 80-95 %) |
| Raspberry Pi 5 (4 GB) logic levels | [estimated](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html): The documentation gives 3.3 V GPIO, not 5 V tolerant. RP1 input thresholds are not published; 0.65 x 3.3 V assumed (common CMOS figure). |
| Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) logic levels | [estimated](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085): 3.3 V sensor on a breakout with a regulator and level shifting for 3-5 V hosts (Adafruit guide); thresholds assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 12 AWG silicone wire | 0.9 | m | 2.2 | 1.98 | 3.308 mm2, rated 20.5 A in a bundle; 0.80 m cut + 10 % waste | estimated |
| 20 AWG silicone wire | 3.9 | m | 0.5 | 1.95 | 0.519 mm2, rated 5.5 A in a bundle; 3.46 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 12.6 | m | 0.4 | 5.04 | 0.327 mm2, rated 3.5 A in a bundle; 11.41 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 11.2 | m | 0.35 | 3.92 | 0.205 mm2, rated 1.75 A in a bundle; 10.15 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 12.9 | m | 0.3 | 3.87 | 0.128 mm2, rated 1.1 A in a bundle; 11.68 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 10 | pc | 0.02 | 0.20 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 3 | pc | 0.02 | 0.06 | one per cable end | estimated |
| Molex 5264 contacts | 25 | pc | 0.05 | 1.25 | rated 3 A per contact | estimated |
| Molex 5264 housings | 13 | pc | 0.08 | 1.04 | one per cable end | estimated |
| JST EH 2.5 mm contacts | 90 | pc | 0.03 | 2.70 | rated 3 A per contact | estimated |
| JST EH 2.5 mm housings | 39 | pc | 0.05 | 1.95 | one per cable end | estimated |
| XT60 contacts | 2 | pc | 0.9 | 1.80 | rated 35 A per contact | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 2 | pc | 0.03 | 0.06 | rated 17.5 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 3.5 | m | 0.2 | 0.70 | 11 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 71 | pc | 0.02 | 1.42 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 12 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 5 | pc | 0.08 | 0.40 | 9.5 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 9.3 | m | 0.4 | 3.72 | over every cable where it crosses a joint | estimated |
| FFC | 1 | pc | 3 | 3.00 | head_camera to computer | estimated |
| USB | 1 | pc | 3 | 3.00 | leg_bus to computer | estimated |
| USB | 1 | pc | 3 | 3.00 | arm_bus to computer | estimated |
| 15 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 7 | pc | 0.25 | 1.75 | plus spares | estimated |
| 3 A ATM blade fuse | 2 | pc | 0.25 | 0.50 | plus spares | estimated |
| 4 A ATM blade fuse | 2 | pc | 0.25 | 0.50 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Adafruit BNO085 9-DoF IMU breakout | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.ceva-ip.com/wp-content/uploads/BNO080_085-Datasheet.pdf) | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.adafruit.com/product/4754) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator | [datasheet](https://www.pololu.com/product/4091/specs) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) |
| ROBOTIS U2D2 USB to TTL/RS-485 interface | estimated | estimated | estimated | [datasheet](https://emanual.robotis.com/docs/en/parts/interface/u2d2/) |
| DYNAMIXEL XH540-W270-T(R) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xh540-w270/) |
| DYNAMIXEL XL330-M288-T | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/) |
| DYNAMIXEL XL430-W250-T | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl430-w250/) | estimated | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl430-w250/) | [datasheet](https://emanual.robotis.com/docs/en/dxl/x/xl430-w250/) |
| Feetech STS3215 C047 12 V 30 kg.cm | [datasheet](https://files.seeedstudio.com/Bazaar/product_pdf/108090003.pdf) | estimated | [datasheet](https://files.waveshare.com/wiki/Bus-Servo-Adapter-(A)/Bus%20Servo%20Adapter%20(A)-Sch.pdf) | estimated |
| Feetech STS3250 C002 12 V 50 kg.cm | [datasheet](https://evelta.com/12v-50kg-360deg-magnetic-encoder-double-shaft-ttl-servo) | estimated | [datasheet](https://files.waveshare.com/wiki/Bus-Servo-Adapter-(A)/Bus%20Servo%20Adapter%20(A)-Sch.pdf) | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| LiPo 3S 5000 mAh 60C, XT60 | estimated | [datasheet](https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug) | estimated | [datasheet](https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug) |
| Raspberry Pi 5 | estimated | [datasheet](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html) | estimated | [datasheet](https://pip.raspberrypi.com/documents/RP-008348-DS-raspberry-pi-5-product-brief.pdf) |
| Raspberry Pi Camera Module 3 | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated |
| KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
| Waveshare Bus Servo Adapter | [datasheet](https://www.waveshare.com/bus-servo-adapter-a.htm) | estimated | estimated | [datasheet](https://www.waveshare.com/wiki/Bus_Servo_Adapter_(A)) |

## Notes

- Routing: 1 wire runs pass through solid parts at the home pose (27 mm in all), for example W70 through battery for 27 mm at -4,-36,90. Lay those wires round the part by hand.
