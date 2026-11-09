# Wiring: hexapod

37 cables, 73 conductors, 16.04 m of wire, wiring parts $31.20.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 11.1 | main_switch | 35 / 70 | 10.916 / 32.216 | 3.2x | 20 | 0.077 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 0 / 0 | -x | - | 0 |

**VBAT loads** (peak assumes six joints at peak at once, the rest at half load):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator_5v | 0 | 0 |
| computer | 1.566 | 2.74 |
| actuator_bus | 0.05 | 0.1 |
| lf_coxa_actuator | 1.55 | 5.1 |
| lm_coxa_actuator | 1.55 | 5.1 |
| lr_coxa_actuator | 1.55 | 5.1 |
| rr_coxa_actuator | 1.55 | 5.1 |
| rm_coxa_actuator | 1.55 | 5.1 |
| rf_coxa_actuator | 1.55 | 5.1 |

**5V loads** (peak assumes the computer at its peak and every sensor running):

| Load | Typical A | Peak A |
|---|--:|--:|

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 20 A ATM blade fuse, inline holder, protects everything on VBAT (12 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch regulator_5v (22 AWG).
- Fuse **F3**: 2 A ATM blade fuse, inline holder, protects branch computer (22 AWG).
- Fuse **F4**: 2 A ATM blade fuse, inline holder, protects branch actuator_bus (22 AWG).
- Fuse **F5**: 3 A ATM blade fuse, inline holder, protects branch lf_coxa_actuator (22 AWG).
- Fuse **F6**: 3 A ATM blade fuse, inline holder, protects branch lm_coxa_actuator (22 AWG).
- Fuse **F7**: 3 A ATM blade fuse, inline holder, protects branch lr_coxa_actuator (22 AWG).
- Fuse **F8**: 3 A ATM blade fuse, inline holder, protects branch rr_coxa_actuator (22 AWG).
- Fuse **F9**: 3 A ATM blade fuse, inline holder, protects branch rm_coxa_actuator (22 AWG).
- Fuse **F10**: 3 A ATM blade fuse, inline holder, protects branch rf_coxa_actuator (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | LIDAR_USB | lidar.VCC (red) | computer.LINK | made | red | 0.23 | 0.8 |
| C2 | W2 | CAMERA_CSI | camera.GND | computer.LINK | made | black | 0.2 | 0.25 |
| C3 | W3 | 3V3_IMU | computer.3V3 | imu.VIN | 24 | red | 0.011 | 0.015 |
| C3 | W4 | GND | computer.GND | imu.GND | 24 | black | 0.011 | 0.015 |
| C3 | W5 | I2C_SDA | computer.I2C1_SDA | imu.SDA | 26 | blue | 0.02 | 0.02 |
| C3 | W6 | I2C_SCL | computer.I2C1_SCL | imu.SCL | 26 | yellow | 0.02 | 0.02 |
| C4 | W7 | BUS_ACTUATOR_BUS | actuator_bus.SIG | actuator_bus_hub.P1 | 26 | yellow | 0.02 | 0.02 |
| C5 | W8 | BUS_ACTUATOR_BUS | actuator_bus_hub.P2 | lf_coxa_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C6 | W9 | VBAT | lf_coxa_actuator.VCC | lf_femur_actuator.VCC | 22 | red | 1.1 | 4.65 |
| C6 | W10 | GND | lf_coxa_actuator.GND | lf_femur_actuator.GND | 22 | black | 1.1 | 4.65 |
| C6 | W11 | BUS_ACTUATOR_BUS | lf_coxa_actuator.DATA | lf_femur_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C7 | W12 | VBAT | lf_femur_actuator.VCC | lf_tibia_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C7 | W13 | GND | lf_femur_actuator.GND | lf_tibia_actuator.GND | 24 | black | 0.45 | 2.7 |
| C7 | W14 | BUS_ACTUATOR_BUS | lf_femur_actuator.DATA | lf_tibia_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C8 | W15 | BUS_ACTUATOR_BUS | actuator_bus_hub.P2 | lm_coxa_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C9 | W16 | VBAT | lm_coxa_actuator.VCC | lm_femur_actuator.VCC | 22 | red | 1.1 | 4.65 |
| C9 | W17 | GND | lm_coxa_actuator.GND | lm_femur_actuator.GND | 22 | black | 1.1 | 4.65 |
| C9 | W18 | BUS_ACTUATOR_BUS | lm_coxa_actuator.DATA | lm_femur_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C10 | W19 | VBAT | lm_femur_actuator.VCC | lm_tibia_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C10 | W20 | GND | lm_femur_actuator.GND | lm_tibia_actuator.GND | 24 | black | 0.45 | 2.7 |
| C10 | W21 | BUS_ACTUATOR_BUS | lm_femur_actuator.DATA | lm_tibia_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C11 | W22 | BUS_ACTUATOR_BUS | actuator_bus_hub.P2 | lr_coxa_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C12 | W23 | VBAT | lr_coxa_actuator.VCC | lr_femur_actuator.VCC | 22 | red | 1.1 | 4.65 |
| C12 | W24 | GND | lr_coxa_actuator.GND | lr_femur_actuator.GND | 22 | black | 1.1 | 4.65 |
| C12 | W25 | BUS_ACTUATOR_BUS | lr_coxa_actuator.DATA | lr_femur_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C13 | W26 | VBAT | lr_femur_actuator.VCC | lr_tibia_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C13 | W27 | GND | lr_femur_actuator.GND | lr_tibia_actuator.GND | 24 | black | 0.45 | 2.7 |
| C13 | W28 | BUS_ACTUATOR_BUS | lr_femur_actuator.DATA | lr_tibia_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C14 | W29 | BUS_ACTUATOR_BUS | actuator_bus_hub.P2 | rr_coxa_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C15 | W30 | VBAT | rr_coxa_actuator.VCC | rr_femur_actuator.VCC | 22 | red | 1.1 | 4.65 |
| C15 | W31 | GND | rr_coxa_actuator.GND | rr_femur_actuator.GND | 22 | black | 1.1 | 4.65 |
| C15 | W32 | BUS_ACTUATOR_BUS | rr_coxa_actuator.DATA | rr_femur_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C16 | W33 | VBAT | rr_femur_actuator.VCC | rr_tibia_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C16 | W34 | GND | rr_femur_actuator.GND | rr_tibia_actuator.GND | 24 | black | 0.45 | 2.7 |
| C16 | W35 | BUS_ACTUATOR_BUS | rr_femur_actuator.DATA | rr_tibia_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C17 | W36 | BUS_ACTUATOR_BUS | actuator_bus_hub.P2 | rm_coxa_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C18 | W37 | VBAT | rm_coxa_actuator.VCC | rm_femur_actuator.VCC | 22 | red | 1.1 | 4.65 |
| C18 | W38 | GND | rm_coxa_actuator.GND | rm_femur_actuator.GND | 22 | black | 1.1 | 4.65 |
| C18 | W39 | BUS_ACTUATOR_BUS | rm_coxa_actuator.DATA | rm_femur_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C19 | W40 | VBAT | rm_femur_actuator.VCC | rm_tibia_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C19 | W41 | GND | rm_femur_actuator.GND | rm_tibia_actuator.GND | 24 | black | 0.45 | 2.7 |
| C19 | W42 | BUS_ACTUATOR_BUS | rm_femur_actuator.DATA | rm_tibia_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C20 | W43 | BUS_ACTUATOR_BUS | actuator_bus_hub.P2 | rf_coxa_actuator.DATA | 26 | red | 0.02 | 0.02 |
| C21 | W44 | VBAT | rf_coxa_actuator.VCC | rf_femur_actuator.VCC | 22 | red | 1.1 | 4.65 |
| C21 | W45 | GND | rf_coxa_actuator.GND | rf_femur_actuator.GND | 22 | black | 1.1 | 4.65 |
| C21 | W46 | BUS_ACTUATOR_BUS | rf_coxa_actuator.DATA | rf_femur_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C22 | W47 | VBAT | rf_femur_actuator.VCC | rf_tibia_actuator.VCC | 24 | red | 0.45 | 2.7 |
| C22 | W48 | GND | rf_femur_actuator.GND | rf_tibia_actuator.GND | 24 | black | 0.45 | 2.7 |
| C22 | W49 | BUS_ACTUATOR_BUS | rf_femur_actuator.DATA | rf_tibia_actuator.DATA | 26 | yellow | 0.02 | 0.02 |
| C23 | W50 | BUS_USB | actuator_bus.VBUS | computer.LINK | made | red | 0.05 | 0.1 |
| C24 | W51 | VBAT | battery.BAT+ | main_fuse.IN | 12 | red | 10.916 | 32.216 |
| C25 | W52 | VBAT | main_fuse.OUT | main_switch.IN | 12 | red | 10.916 | 32.216 |
| C26 | W53 | GND | battery.BAT- | star_ground.P1 | 12 | black | 10.916 | 32.216 |
| C27 | W54 | VBAT | main_switch.OUT | splice_vbat.P1 | 12 | red | 10.916 | 32.216 |
| C28 | W55 | VBAT | splice_vbat.P2 | regulator_5v.VIN | 22 | red | 0 | 0 |
| C28 | W56 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0 | 0 |
| C29 | W57 | VBAT | splice_vbat.P2 | computer.DC_IN | 22 | red | 1.566 | 2.74 |
| C29 | W58 | GND | star_ground.P2 | computer.GND | 22 | black | 1.566 | 2.74 |
| C30 | W59 | VBAT | splice_vbat.P2 | actuator_bus.VIN | 22 | red | 0.05 | 0.1 |
| C30 | W60 | GND | star_ground.P2 | actuator_bus.GND | 24 | black | 0.05 | 0.1 |
| C31 | W61 | VBAT | splice_vbat.P2 | lf_coxa_actuator.VCC | 22 | red | 1.55 | 5.1 |
| C31 | W62 | GND | star_ground.P2 | lf_coxa_actuator.GND | 22 | black | 1.55 | 5.1 |
| C32 | W63 | VBAT | splice_vbat.P2 | lm_coxa_actuator.VCC | 22 | red | 1.55 | 5.1 |
| C32 | W64 | GND | star_ground.P2 | lm_coxa_actuator.GND | 22 | black | 1.55 | 5.1 |
| C33 | W65 | VBAT | splice_vbat.P2 | lr_coxa_actuator.VCC | 22 | red | 1.55 | 5.1 |
| C33 | W66 | GND | star_ground.P2 | lr_coxa_actuator.GND | 22 | black | 1.55 | 5.1 |
| C34 | W67 | VBAT | splice_vbat.P2 | rr_coxa_actuator.VCC | 22 | red | 1.55 | 5.1 |
| C34 | W68 | GND | star_ground.P2 | rr_coxa_actuator.GND | 22 | black | 1.55 | 5.1 |
| C35 | W69 | VBAT | splice_vbat.P2 | rm_coxa_actuator.VCC | 22 | red | 1.55 | 5.1 |
| C35 | W70 | GND | star_ground.P2 | rm_coxa_actuator.GND | 22 | black | 1.55 | 5.1 |
| C36 | W71 | VBAT | splice_vbat.P2 | rf_coxa_actuator.VCC | 22 | red | 1.55 | 5.1 |
| C36 | W72 | GND | star_ground.P2 | rf_coxa_actuator.GND | 22 | black | 1.55 | 5.1 |
| C37 | W73 | GND | regulator_5v.GND | star_ground.P2 | 24 | black | 0 | 0 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | lidar to computer | 1 | 185 | 181.4 | 0 | 0 | 0 | USB | computer_hood.deck |
| C2 | camera to computer | 1 | 175 | 170.6 | 0 | 0 | 0 | FFC | computer_hood.deck |
| C3 | computer to imu | 4 | 325 | 220.5 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | computer_hood.deck + board_hood.deck |
| C4 | actuator_bus to actuator_bus_hub | 1 | 225 | 123.1 | 40 | 0 | 60 | 3-pin 2.5 mm bus servo header (5264 class) / lever clamp | board_hood.deck |
| C5 | actuator_bus_hub to lf_coxa_actuator | 1 | 235 | 130.7 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C6 | lf_coxa_actuator to lf_femur_actuator | 3 | 200 | 57.3 | 40 | 40 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C7 | lf_femur_actuator to lf_tibia_actuator | 3 | 265 | 114.5 | 40 | 50 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C8 | actuator_bus_hub to lm_coxa_actuator | 1 | 270 | 166.3 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C9 | lm_coxa_actuator to lm_femur_actuator | 3 | 200 | 57.3 | 40 | 40 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C10 | lm_femur_actuator to lm_tibia_actuator | 3 | 265 | 114.5 | 40 | 50 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C11 | actuator_bus_hub to lr_coxa_actuator | 1 | 255 | 151.4 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C12 | lr_coxa_actuator to lr_femur_actuator | 3 | 200 | 57.3 | 40 | 40 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C13 | lr_femur_actuator to lr_tibia_actuator | 3 | 265 | 114.5 | 40 | 50 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C14 | actuator_bus_hub to rr_coxa_actuator | 1 | 195 | 93.2 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C15 | rr_coxa_actuator to rr_femur_actuator | 3 | 200 | 57.3 | 40 | 40 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C16 | rr_femur_actuator to rr_tibia_actuator | 3 | 265 | 114.5 | 40 | 50 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C17 | actuator_bus_hub to rm_coxa_actuator | 1 | 170 | 65.9 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C18 | rm_coxa_actuator to rm_femur_actuator | 3 | 200 | 57.3 | 40 | 40 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C19 | rm_femur_actuator to rm_tibia_actuator | 3 | 265 | 114.5 | 40 | 50 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C20 | actuator_bus_hub to rf_coxa_actuator | 1 | 235 | 130.2 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C21 | rf_coxa_actuator to rf_femur_actuator | 3 | 200 | 57.3 | 40 | 40 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C22 | rf_femur_actuator to rf_tibia_actuator | 3 | 265 | 114.5 | 40 | 50 | 60 | Feetech 5264-3P / Feetech 5264-3P | - |
| C23 | actuator_bus to computer | 1 | 240 | 238.7 | 0 | 0 | 0 | USB | board_hood.deck + computer_hood.deck |
| C24 | battery positive to main fuse | 1 | 100 | 0 | 40 | 0 | 60 | XT60 (male discharge plug on the pack per the listing) / soldered leads | - |
| C25 | main fuse to main switch | 1 | 245 | 144.2 | 40 | 0 | 60 | soldered leads / 6.3 mm quick-connect tabs | battery_tray.up |
| C26 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | XT60 (male discharge plug on the pack per the listing) / lever clamp | - |
| C27 | main_switch to the VBAT splice | 1 | 100 | 0 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / lever clamp | - |
| C28 | VBAT to regulator_5v | 2 | 210 | 107.6 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | board_hood.deck |
| C29 | VBAT to computer | 2 | 295 | 193.4 | 40 | 0 | 60 | lever clamp / Singatron 2DC-0005D206F DC power jack (J16) | computer_hood.deck |
| C30 | VBAT to actuator_bus | 2 | 165 | 63.6 | 40 | 0 | 60 | lever clamp / green screw terminal | board_hood.deck |
| C31 | VBAT to lf_coxa_actuator | 2 | 170 | 68 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C32 | VBAT to lm_coxa_actuator | 2 | 235 | 132.4 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C33 | VBAT to lr_coxa_actuator | 2 | 230 | 128.5 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C34 | VBAT to rr_coxa_actuator | 2 | 240 | 137.8 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C35 | VBAT to rm_coxa_actuator | 2 | 225 | 121.5 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C36 | VBAT to rf_coxa_actuator | 2 | 180 | 78.8 | 40 | 0 | 60 | lever clamp / Feetech 5264-3P | - |
| C37 | regulator_5v to star_ground | 1 | 340 | 237 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | board_hood.deck + battery_tray.up |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C6 | lf_coxa | -0.6 to 0.6 | 14 | 18.6 | 40 |
| C7 | lf_femur | -1.2 to 1.2 | 39.5 | 55.9 | 50 |
| C9 | lm_coxa | -0.6 to 0.6 | 14 | 18.6 | 40 |
| C10 | lm_femur | -1.2 to 1.2 | 39.5 | 55.9 | 50 |
| C12 | lr_coxa | -0.6 to 0.6 | 14 | 18.6 | 40 |
| C13 | lr_femur | -1.2 to 1.2 | 39.5 | 55.9 | 50 |
| C15 | rr_coxa | -0.6 to 0.6 | 14 | 18.6 | 40 |
| C16 | rr_femur | -1.2 to 1.2 | 39.5 | 55.9 | 50 |
| C18 | rm_coxa | -0.6 to 0.6 | 14 | 18.6 | 40 |
| C19 | rm_femur | -1.2 to 1.2 | 39.5 | 55.9 | 50 |
| C21 | rf_coxa | -0.6 to 0.6 | 14 | 18.6 | 40 |
| C22 | rf_femur | -1.2 to 1.2 | 39.5 | 55.9 | 50 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (LiPo 3S 5000 mAh 60C, XT60) | 55.5 | 5000 | VBAT 11.1 V | 10.916 | 22 min | 32.216 | 7 min | 6.44 C | 300 |

### Regulator heat

Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.

| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|
| regulator_5v | switching | VBAT 11.1 V | 5V 5 V | 0 / 0 | 0 | 0 | 0 / 0 | - | 3 | yes |
- regulator_5v: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 3 W of heat.

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| BUS_ACTUATOR_BUS | U2 SIG | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | U2 SIG | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M1 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M2 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M3 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M4 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M5 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M6 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M7 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M8 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M9 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M16 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M17 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M18 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M13 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M14 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M15 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M10 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M1 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M3 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M4 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M6 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M7 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M9 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M16 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M18 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M13 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M15 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M10 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M11 DATA | M12 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | U2 SIG | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M2 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M5 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M8 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M17 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M14 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| BUS_ACTUATOR_BUS | M12 DATA | M11 DATA | - | - | - | not checked: no published logic levels for one side |
| I2C_SCL | A1 I2C1_SCL | U1 SCL | 3.3 | 2.3 | 5.5 | ok |
| I2C_SCL | U1 SCL | A1 I2C1_SCL | 3.3 | 2.3 | 3.6 | ok |
| I2C_SDA | A1 I2C1_SDA | U1 SDA | 3.3 | 2.3 | 5.5 | ok |
| I2C_SDA | U1 SDA | A1 I2C1_SDA | 3.3 | 2.3 | 3.6 | ok |

Not checked (no logic levels in the parts data): Feetech STS3215 C047 12 V 30 kg.cm (1:345), Feetech STS3250 C002 12 V 50 kg.cm (1:345), Waveshare Bus Servo Adapter (A).

### Sources

| Input | Source |
|---|---|
| LiPo 3S 5000 mAh 60C, XT60 (Gens Ace G-Tech) capacity and energy | [datasheet](https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) heat | estimated: 27.5 W out at about 90 % (Pololu range 80-95 %) |
| NVIDIA Jetson Orin Nano Super Developer Kit logic levels | [estimated](https://developer.nvidia.com/embedded/learn/jetson-orin-nano-devkit-user-guide/hardware_spec.html): 40-pin header is 3.3 V logic (developer kit guide), not 5 V tolerant. Threshold 0.7 x 3.3 V assumed. |
| Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) logic levels | [estimated](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085): 3.3 V sensor on a breakout with a regulator and level shifting for 3-5 V hosts (Adafruit guide); thresholds assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 12 AWG silicone wire | 0.6 | m | 2.2 | 1.32 | 3.308 mm2, rated 20.5 A in a bundle; 0.54 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 6.6 | m | 0.4 | 2.64 | 0.327 mm2, rated 3.5 A in a bundle; 5.92 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 5 | m | 0.35 | 1.75 | 0.205 mm2, rated 1.75 A in a bundle; 4.55 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 5.6 | m | 0.3 | 1.68 | 0.128 mm2, rated 1.1 A in a bundle; 5.03 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 8 | pc | 0.02 | 0.16 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 2 | pc | 0.02 | 0.04 | one per cable end | estimated |
| Molex 5264 contacts | 91 | pc | 0.05 | 4.55 | rated 3 A per contact | estimated |
| Molex 5264 housings | 37 | pc | 0.08 | 2.96 | one per cable end | estimated |
| XT60 contacts | 2 | pc | 0.9 | 1.80 | rated 35 A per contact | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 2 | pc | 0.03 | 0.06 | rated 17.5 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 2.5 | m | 0.2 | 0.50 | 7 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 56 | pc | 0.02 | 1.12 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 3 | pc | 0.08 | 0.24 | 9.5 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 1.8 | m | 0.4 | 0.72 | over every cable where it crosses a joint | estimated |
| USB | 1 | pc | 3 | 3.00 | lidar to computer | estimated |
| FFC | 1 | pc | 3 | 3.00 | camera to computer | estimated |
| USB | 1 | pc | 3 | 3.00 | actuator_bus to computer | estimated |
| 20 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 3 | pc | 0.25 | 0.75 | plus spares | estimated |
| 3 A ATM blade fuse | 6 | pc | 0.25 | 1.50 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Adafruit BNO085 9-DoF IMU breakout | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.ceva-ip.com/wp-content/uploads/BNO080_085-Datasheet.pdf) | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.adafruit.com/product/4754) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator | [datasheet](https://www.pololu.com/product/4091/specs) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) |
| Feetech STS3215 C047 12 V 30 kg.cm | [datasheet](https://files.seeedstudio.com/Bazaar/product_pdf/108090003.pdf) | estimated | [datasheet](https://files.waveshare.com/wiki/Bus-Servo-Adapter-(A)/Bus%20Servo%20Adapter%20(A)-Sch.pdf) | estimated |
| Feetech STS3250 C002 12 V 50 kg.cm | [datasheet](https://evelta.com/12v-50kg-360deg-magnetic-encoder-double-shaft-ttl-servo) | estimated | [datasheet](https://files.waveshare.com/wiki/Bus-Servo-Adapter-(A)/Bus%20Servo%20Adapter%20(A)-Sch.pdf) | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| NVIDIA Jetson Orin Nano Super Developer Kit | [datasheet](https://developer.nvidia.com/downloads/assets/embedded/secure/jetson/orin_nano/docs/jetson_orin_nano_devkit_carrier_board_specification_sp.pdf) | estimated | [datasheet](https://developer.nvidia.com/downloads/assets/embedded/secure/jetson/orin_nano/docs/jetson_orin_nano_devkit_carrier_board_specification_sp.pdf) | [datasheet](https://developer.nvidia.com/downloads/assets/embedded/secure/jetson/orin_nano/docs/jetson_orin_nano_devkit_carrier_board_specification_sp.pdf) |
| LiPo 3S 5000 mAh 60C, XT60 | estimated | [datasheet](https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug) | estimated | [datasheet](https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug) |
| Raspberry Pi Camera Module 3 | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated |
| Slamtec RPLIDAR C1 | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) |
| KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
| Waveshare Bus Servo Adapter | [datasheet](https://www.waveshare.com/bus-servo-adapter-a.htm) | estimated | estimated | [datasheet](https://www.waveshare.com/wiki/Bus_Servo_Adapter_(A)) |
