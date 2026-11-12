# Wiring: quadruped

35 cables, 54 conductors, 15.25 m of wire, wiring parts $24.39.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 11.1 | main_switch | 35 / 70 | 5.951 / 14.951 | 5.9x | 7.5 | 0.101 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 1 / 5 | 5.5x | - | 0.078 |

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
| C22 | W41 | VBAT | splice_vbat.P2 | actuator_bus.VIN | 22 | red | 0.05 | 0.1 |
| C23 | W42 | VBAT | splice_vbat.P2 | fl_hip_abduction_actuator.VCC | 22 | red | 1.35 | 3.6 |
| C24 | W43 | VBAT | splice_vbat.P2 | fr_hip_abduction_actuator.VCC | 22 | red | 1.35 | 3.6 |
| C25 | W44 | VBAT | splice_vbat.P2 | rl_hip_abduction_actuator.VCC | 22 | red | 1.35 | 3.6 |
| C26 | W45 | VBAT | splice_vbat.P2 | rr_hip_abduction_actuator.VCC | 22 | red | 1.35 | 3.6 |
| C27 | W46 | GND | regulator_5v.GND | star_ground.P2 | 22 | black | 1 | 5 |
| C28 | W47 | 5V | regulator_5v.VOUT | computer.5V | 22 | red | 1 | 5 |
| C29 | W48 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0.501 | 2.503 |
| C30 | W49 | GND | star_ground.P2 | actuator_bus.GND | 24 | black | 0.05 | 0.1 |
| C31 | W50 | GND | star_ground.P2 | fl_hip_abduction_actuator.GND | 22 | black | 1.35 | 3.6 |
| C32 | W51 | GND | star_ground.P2 | fr_hip_abduction_actuator.GND | 22 | black | 1.35 | 3.6 |
| C33 | W52 | GND | star_ground.P2 | rl_hip_abduction_actuator.GND | 22 | black | 1.35 | 3.6 |
| C34 | W53 | GND | star_ground.P2 | rr_hip_abduction_actuator.GND | 22 | black | 1.35 | 3.6 |
| C35 | W54 | GND | star_ground.P2 | computer.GND | 22 | black | 1 | 5 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | camera to computer | 1 | 230 | 228.3 | 0 | 0 | 0 | FFC | electronics_hood.camera |
| C2 | computer to imu | 4 | 275 | 173 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | - |
| C3 | actuator_bus to actuator_bus_hub | 1 | 175 | 72 | 40 | 0 | 60 | 3-pin 2.5 mm bus servo header (5264 class) / lever clamp | - |
| C4 | actuator_bus_hub to fl_hip_abduction_actuator | 1 | 275 | 172 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_hood.deck |
| C5 | fl_hip_abduction_actuator to fl_hip_pitch_actuator | 3 | 310 | 166.7 | 40 | 40 | 60 | Feetech 5264-3P / Feetech 5264-3P | body_bay.front_left |
| C6 | fl_hip_pitch_actuator to fl_knee_actuator | 3 | 370 | 209.6 | 40 | 60 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C7 | actuator_bus_hub to fr_hip_abduction_actuator | 1 | 235 | 134.4 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_hood.deck |
| C8 | fr_hip_abduction_actuator to fr_hip_pitch_actuator | 3 | 315 | 166.8 | 40 | 45 | 60 | Feetech 5264-3P / Feetech 5264-3P | body_bay.front_right |
| C9 | fr_hip_pitch_actuator to fr_knee_actuator | 3 | 360 | 174 | 40 | 85 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C10 | actuator_bus_hub to rl_hip_abduction_actuator | 1 | 325 | 221 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_hood.deck |
| C11 | rl_hip_abduction_actuator to rl_hip_pitch_actuator | 3 | 315 | 167.4 | 40 | 45 | 60 | Feetech 5264-3P / Feetech 5264-3P | body_bay.rear_left |
| C12 | rl_hip_pitch_actuator to rl_knee_actuator | 3 | 355 | 194.1 | 40 | 60 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C13 | actuator_bus_hub to rr_hip_abduction_actuator | 1 | 315 | 213.2 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_hood.deck |
| C14 | rr_hip_abduction_actuator to rr_hip_pitch_actuator | 3 | 310 | 166 | 40 | 40 | 60 | Feetech 5264-3P / Feetech 5264-3P | body_bay.rear_right |
| C15 | rr_hip_pitch_actuator to rr_knee_actuator | 3 | 365 | 204.9 | 40 | 60 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C16 | actuator_bus to computer | 1 | 80 | 75.7 | 0 | 0 | 0 | USB | - |
| C17 | battery positive to main fuse | 1 | 165 | 63.6 | 40 | 0 | 60 | XT60 / soldered leads | - |
| C18 | main fuse to main switch | 1 | 215 | 110.4 | 40 | 0 | 60 | soldered leads / 6.3 mm quick-connect tabs | electronics_hood.deck |
| C19 | battery negative to star ground | 1 | 195 | 91.6 | 40 | 0 | 60 | XT60 / lever clamp | - |
| C20 | main_switch to the VBAT splice | 1 | 200 | 96.2 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / lever clamp | - |
| C21 | VBAT to regulator_5v | 1 | 160 | 57.7 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | - |
| C22 | VBAT to actuator_bus | 1 | 165 | 64.1 | 40 | 0 | 60 | lever clamp / green screw terminal | - |
| C23 | VBAT to fl_hip_abduction_actuator | 1 | 285 | 183.3 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_hood.deck |
| C24 | VBAT to fr_hip_abduction_actuator | 1 | 245 | 141.1 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_hood.deck |
| C25 | VBAT to rl_hip_abduction_actuator | 1 | 330 | 228.9 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_hood.deck |
| C26 | VBAT to rr_hip_abduction_actuator | 1 | 325 | 220 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | electronics_hood.deck |
| C27 | regulator_5v to star_ground | 1 | 325 | 222.9 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | electronics_hood.deck |
| C28 | 5V to computer | 1 | 245 | 143.6 | 40 | 0 | 60 | 0.1 in through holes / 40-pin header | - |
| C29 | VBAT to regulator_5v | 1 | 325 | 220.8 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | electronics_hood.deck |
| C30 | VBAT to actuator_bus | 1 | 295 | 193.1 | 40 | 0 | 60 | lever clamp / green screw terminal | electronics_hood.deck |
| C31 | VBAT to fl_hip_abduction_actuator | 1 | 230 | 125.6 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C32 | VBAT to fr_hip_abduction_actuator | 1 | 240 | 138.1 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C33 | VBAT to rl_hip_abduction_actuator | 1 | 170 | 68.7 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C34 | VBAT to rr_hip_abduction_actuator | 1 | 205 | 105 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C35 | 5V to computer | 1 | 405 | 301.7 | 40 | 0 | 60 | lever clamp / 40-pin header | electronics_hood.deck |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C5 | fl_hip_abduction | -0.165 to 0.6 | 36.5 | 41.8 | 40 |
| C6 | fl_hip_pitch | -1.4 to 1.4 | 33.2 | 55.4 | 60 |
| C8 | fr_hip_abduction | -0.6 to 0.165 | 36.5 | 45.6 | 45 |
| C9 | fr_hip_pitch | -1.4 to 1.4 | 36.6 | 81.1 | 85 |
| C11 | rl_hip_abduction | -0.6 to 0.165 | 36.5 | 45.8 | 45 |
| C12 | rl_hip_pitch | -1.4 to 1.4 | 34.9 | 60.3 | 60 |
| C14 | rr_hip_abduction | -0.165 to 0.6 | 36.5 | 41.6 | 40 |
| C15 | rr_hip_pitch | -1.4 to 1.4 | 36.5 | 58.9 | 60 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (LiPo 3S 2200 mAh 25C, XT60) | 24.4 | 2200 | VBAT 11.1 V | 5.951 | 18 min | 14.951 | 7 min | 6.8 C | 55 |

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
| BUS_ACTUATOR_BUS | U1 SIG | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U1 SIG | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | U1 SIG | - | - | - | not checked: no published logic levels for one side |
| I2C_SCL | A1 GPIO3 | U3 SCL | 3.3 | 2.3 | 5.5 | ok |
| I2C_SCL | U3 SCL | A1 GPIO3 | 3.3 | 2.15 | 3.6 | ok |
| I2C_SDA | A1 GPIO2 | U3 SDA | 3.3 | 2.3 | 5.5 | ok |
| I2C_SDA | U3 SDA | A1 GPIO2 | 3.3 | 2.15 | 3.6 | ok |

Not checked (no logic levels in the parts data): Feetech STS3215 C047 12 V 30 kg.cm (1:345), Waveshare Bus Servo Adapter (A).

### Sources

| Input | Source |
|---|---|
| LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) capacity and energy | [datasheet](https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) heat | estimated: 27.5 W out at about 90 % (Pololu range 80-95 %) |
| Raspberry Pi 5 (4 GB) logic levels | [estimated](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html): The documentation gives 3.3 V GPIO, not 5 V tolerant. RP1 input thresholds are not published; 0.65 x 3.3 V assumed (common CMOS figure). |
| Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) logic levels | [estimated](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085): 3.3 V sensor on a breakout with a regulator and level shifting for 3-5 V hosts (Adafruit guide); thresholds assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 16 AWG silicone wire | 0.9 | m | 1 | 0.90 | 1.308 mm2, rated 11 A in a bundle; 0.77 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 6.4 | m | 0.4 | 2.56 | 0.327 mm2, rated 3.5 A in a bundle; 5.81 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 4.5 | m | 0.35 | 1.57 | 0.205 mm2, rated 1.75 A in a bundle; 4.05 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 5 | m | 0.3 | 1.50 | 0.128 mm2, rated 1.1 A in a bundle; 4.54 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 10 | pc | 0.02 | 0.20 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 4 | pc | 0.02 | 0.08 | one per cable end | estimated |
| Molex 5264 contacts | 61 | pc | 0.05 | 3.05 | rated 3 A per contact | estimated |
| Molex 5264 housings | 29 | pc | 0.08 | 2.32 | one per cable end | estimated |
| XT60 contacts | 2 | pc | 0.9 | 1.80 | rated 35 A per contact | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 2 | pc | 0.03 | 0.06 | rated 17.5 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 2.3 | m | 0.2 | 0.46 | 6 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 53 | pc | 0.02 | 1.06 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 9.5 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 4 | pc | 0.08 | 0.32 | 10 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 1.3 | m | 0.4 | 0.52 | over every cable where it crosses a joint | estimated |
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
