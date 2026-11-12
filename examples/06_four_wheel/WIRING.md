# Wiring: four_wheel_robot

22 cables, 53 conductors, 15.62 m of wire, wiring parts $18.69.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 11.1 | main_switch | 35 / 70 | 6.316 / 22.616 | 5.5x | 15 | 0.098 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 1.23 / 5 | 4.5x | - | 0.083 |

**VBAT loads** (peak assumes two drive motors stalling at once, the rest running):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator_5v | 0.616 | 2.503 |
| motor_driver_1 | 2.85 | 11 |
| motor_driver_2 | 2.85 | 11 |

**5V loads** (peak assumes the computer at its peak and every sensor running):

| Load | Typical A | Peak A |
|---|--:|--:|
| computer | 1.23 | 5 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 15 A ATM blade fuse, inline holder, protects everything on VBAT (14 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch regulator_5v (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | LIDAR_USB | lidar.VCC (red) | computer.LINK | made | red | 0.23 | 0.8 |
| C2 | W2 | FRONT_CAMERA_CSI | front_camera.GND | computer.GND | made | black | 0.2 | 0.25 |
| C3 | W3 | 3V3_IMU | computer.3V3 | imu.VIN | 24 | red | 0.011 | 0.015 |
| C3 | W4 | GND | computer.GND | imu.GND | 24 | black | 0.011 | 0.015 |
| C3 | W5 | I2C_SDA | computer.GPIO2 | imu.SDA | 26 | blue | 0.02 | 0.02 |
| C3 | W6 | I2C_SCL | computer.GPIO3 | imu.SCL | 26 | yellow | 0.02 | 0.02 |
| C4 | W7 | GND | motor_driver_1.GND | computer.GND | 24 | black | 0.01 | 0.01 |
| C4 | W8 | FRONT_LEFT_MOTOR_PWM | computer.GPIO12 | motor_driver_1.PWM1 | 26 | yellow | 0.02 | 0.02 |
| C4 | W9 | FRONT_LEFT_MOTOR_DIR | computer.GPIO13 | motor_driver_1.DIR1 | 26 | yellow | 0.02 | 0.02 |
| C4 | W10 | FRONT_RIGHT_MOTOR_PWM | computer.GPIO5 | motor_driver_1.PWM2 | 26 | blue | 0.02 | 0.02 |
| C4 | W11 | FRONT_RIGHT_MOTOR_DIR | computer.GPIO6 | motor_driver_1.DIR2 | 26 | blue | 0.02 | 0.02 |
| C5 | W12 | FRONT_LEFT_MOTOR_PHASE_A | motor_driver_1.M1A | front_left_motor.Motor (red) | 22 | orange | 1.4 | 5.5 |
| C5 | W13 | FRONT_LEFT_MOTOR_PHASE_B | motor_driver_1.M1B | front_left_motor.Motor (black) | 22 | orange | 1.4 | 5.5 |
| C6 | W14 | FRONT_LEFT_MOTOR_ENC_VCC | computer.3V3 | front_left_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C6 | W15 | GND | computer.GND | front_left_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C6 | W16 | FRONT_LEFT_MOTOR_ENC_A | computer.GPIO18 | front_left_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C6 | W17 | FRONT_LEFT_MOTOR_ENC_B | computer.GPIO19 | front_left_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C7 | W18 | FRONT_RIGHT_MOTOR_PHASE_A | motor_driver_1.M2A | front_right_motor.Motor (red) | 22 | orange | 1.4 | 5.5 |
| C7 | W19 | FRONT_RIGHT_MOTOR_PHASE_B | motor_driver_1.M2B | front_right_motor.Motor (black) | 22 | orange | 1.4 | 5.5 |
| C8 | W20 | FRONT_RIGHT_MOTOR_ENC_VCC | computer.3V3 | front_right_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C8 | W21 | GND | computer.GND | front_right_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C8 | W22 | FRONT_RIGHT_MOTOR_ENC_A | computer.GPIO16 | front_right_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C8 | W23 | FRONT_RIGHT_MOTOR_ENC_B | computer.GPIO20 | front_right_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C9 | W24 | GND | motor_driver_2.GND | computer.GND | 24 | black | 0.01 | 0.01 |
| C9 | W25 | REAR_LEFT_MOTOR_PWM | computer.GPIO21 | motor_driver_2.PWM1 | 26 | blue | 0.02 | 0.02 |
| C9 | W26 | REAR_LEFT_MOTOR_DIR | computer.GPIO26 | motor_driver_2.DIR1 | 26 | blue | 0.02 | 0.02 |
| C9 | W27 | REAR_RIGHT_MOTOR_PWM | computer.GPIO22 | motor_driver_2.PWM2 | 26 | blue | 0.02 | 0.02 |
| C9 | W28 | REAR_RIGHT_MOTOR_DIR | computer.GPIO23 | motor_driver_2.DIR2 | 26 | blue | 0.02 | 0.02 |
| C10 | W29 | REAR_LEFT_MOTOR_PHASE_A | motor_driver_2.M1A | rear_left_motor.Motor (red) | 22 | orange | 1.4 | 5.5 |
| C10 | W30 | REAR_LEFT_MOTOR_PHASE_B | motor_driver_2.M1B | rear_left_motor.Motor (black) | 22 | orange | 1.4 | 5.5 |
| C11 | W31 | REAR_LEFT_MOTOR_ENC_VCC | computer.3V3 | rear_left_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C11 | W32 | GND | computer.GND | rear_left_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C11 | W33 | REAR_LEFT_MOTOR_ENC_A | computer.GPIO17 | rear_left_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C11 | W34 | REAR_LEFT_MOTOR_ENC_B | computer.GPIO27 | rear_left_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C12 | W35 | REAR_RIGHT_MOTOR_PHASE_A | motor_driver_2.M2A | rear_right_motor.Motor (red) | 22 | orange | 1.4 | 5.5 |
| C12 | W36 | REAR_RIGHT_MOTOR_PHASE_B | motor_driver_2.M2B | rear_right_motor.Motor (black) | 22 | orange | 1.4 | 5.5 |
| C13 | W37 | REAR_RIGHT_MOTOR_ENC_VCC | computer.3V3 | rear_right_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C13 | W38 | GND | computer.GND | rear_right_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C13 | W39 | REAR_RIGHT_MOTOR_ENC_A | computer.GPIO24 | rear_right_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C13 | W40 | REAR_RIGHT_MOTOR_ENC_B | computer.GPIO25 | rear_right_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C14 | W41 | VBAT | battery.BAT+ | main_fuse.IN | 14 | red | 6.316 | 22.616 |
| C15 | W42 | VBAT | main_fuse.OUT | main_switch.IN | 14 | red | 6.316 | 22.616 |
| C16 | W43 | GND | battery.BAT- | star_ground.P1 | 14 | black | 6.316 | 22.616 |
| C17 | W44 | VBAT | main_switch.OUT | splice_vbat.P1 | 14 | red | 6.316 | 22.616 |
| C18 | W45 | VBAT | splice_vbat.P2 | regulator_5v.VIN | 22 | red | 0.616 | 2.503 |
| C18 | W46 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0.616 | 2.503 |
| C19 | W47 | VBAT | splice_vbat.P2 | motor_driver_1.POWER+ | 18 | red | 2.85 | 11 |
| C19 | W48 | GND | star_ground.P2 | motor_driver_1.POWER- | 18 | black | 2.85 | 11 |
| C20 | W49 | VBAT | splice_vbat.P2 | motor_driver_2.POWER+ | 18 | red | 2.85 | 11 |
| C20 | W50 | GND | star_ground.P2 | motor_driver_2.POWER- | 18 | black | 2.85 | 11 |
| C21 | W51 | GND | regulator_5v.GND | star_ground.P2 | 22 | black | 1.23 | 5 |
| C22 | W52 | 5V | regulator_5v.VOUT | computer.5V | 22 | red | 1.23 | 5 |
| C22 | W53 | GND | star_ground.P2 | computer.GND | 22 | black | 1.23 | 5 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | lidar to computer | 1 | 270 | 270 | 0 | 0 | 0 | USB | - |
| C2 | front_camera to computer | 1 | 295 | 294.8 | 0 | 0 | 0 | FFC | electronics_enclosure.deck_front_left_motor |
| C3 | computer to imu | 4 | 250 | 148.1 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | - |
| C4 | motor_driver_1 to computer | 5 | 285 | 184.6 | 40 | 0 | 60 | 5-pin 2.54 mm header / 40-pin header | - |
| C5 | motor_driver_1 channel 1 to front_left_motor | 2 | 360 | 259.5 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | electronics_enclosure.deck_front_left_motor |
| C6 | front_left_motor encoder to computer | 4 | 290 | 189.7 | 40 | 0 | 60 | 40-pin header / 1x6 female header | electronics_enclosure.deck_front_left_motor |
| C7 | motor_driver_1 channel 2 to front_right_motor | 2 | 415 | 310.6 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | electronics_enclosure.deck_right |
| C8 | front_right_motor encoder to computer | 4 | 410 | 305.8 | 40 | 0 | 60 | 40-pin header / 1x6 female header | electronics_enclosure.deck_right |
| C9 | motor_driver_2 to computer | 5 | 190 | 87.3 | 40 | 0 | 60 | 5-pin 2.54 mm header / 40-pin header | - |
| C10 | motor_driver_2 channel 1 to rear_left_motor | 2 | 415 | 310.3 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | electronics_enclosure.deck_left |
| C11 | rear_left_motor encoder to computer | 4 | 430 | 329.6 | 40 | 0 | 60 | 40-pin header / 1x6 female header | electronics_enclosure.deck_left |
| C12 | motor_driver_2 channel 2 to rear_right_motor | 2 | 370 | 266.9 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | electronics_enclosure.deck_right |
| C13 | rear_right_motor encoder to computer | 4 | 290 | 185.1 | 40 | 0 | 60 | 40-pin header / 1x6 female header | electronics_enclosure.deck_right |
| C14 | battery positive to main fuse | 1 | 170 | 65.7 | 40 | 0 | 60 | XT60 / soldered leads | - |
| C15 | main fuse to main switch | 1 | 365 | 264 | 40 | 0 | 60 | soldered leads / 6.3 mm quick-connect tabs | - |
| C16 | battery negative to star ground | 1 | 175 | 74.8 | 40 | 0 | 60 | XT60 / lever clamp | - |
| C17 | main_switch to the VBAT splice | 1 | 160 | 57.9 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / lever clamp | - |
| C18 | VBAT to regulator_5v | 2 | 275 | 174.3 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | - |
| C19 | VBAT to motor_driver_1 | 2 | 355 | 252.8 | 40 | 0 | 60 | lever clamp / 2-position screw terminal | - |
| C20 | VBAT to motor_driver_2 | 2 | 260 | 159.3 | 40 | 0 | 60 | lever clamp / 2-position screw terminal | - |
| C21 | regulator_5v to star_ground | 1 | 275 | 174.6 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C22 | 5V to computer | 2 | 260 | 159.9 | 40 | 0 | 60 | 0.1 in through holes / 40-pin header | - |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (LiPo 3S 2200 mAh 25C, XT60) | 24.4 | 2200 | VBAT 11.1 V | 6.316 | 17 min | 22.616 | 5 min | 10.28 C | 55 |

### Regulator heat

Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.

| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|
| regulator_5v | switching | VBAT 11.1 V | 5V 5 V | 1.23 / 5 | 6.838 | 6.15 | 0.688 / 2.783 | 90 % | 3 | yes |
- regulator_5v: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 3 W of heat.

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| FRONT_LEFT_MOTOR_DIR | A1 GPIO13 | U4 DIR1 | 3.3 | 2 | 5.5 | ok |
| FRONT_LEFT_MOTOR_ENC_A | M1 Encoder A | A1 GPIO18 | 3.3 | 2.15 | 3.6 | ok |
| FRONT_LEFT_MOTOR_ENC_B | M1 Encoder B | A1 GPIO19 | 3.3 | 2.15 | 3.6 | ok |
| FRONT_LEFT_MOTOR_PWM | A1 GPIO12 | U4 PWM1 | 3.3 | 2 | 5.5 | ok |
| FRONT_RIGHT_MOTOR_DIR | A1 GPIO6 | U4 DIR2 | 3.3 | 2 | 5.5 | ok |
| FRONT_RIGHT_MOTOR_ENC_A | M2 Encoder A | A1 GPIO16 | 3.3 | 2.15 | 3.6 | ok |
| FRONT_RIGHT_MOTOR_ENC_B | M2 Encoder B | A1 GPIO20 | 3.3 | 2.15 | 3.6 | ok |
| FRONT_RIGHT_MOTOR_PWM | A1 GPIO5 | U4 PWM2 | 3.3 | 2 | 5.5 | ok |
| I2C_SCL | A1 GPIO3 | U2 SCL | 3.3 | 2.3 | 5.5 | ok |
| I2C_SCL | U2 SCL | A1 GPIO3 | 3.3 | 2.15 | 3.6 | ok |
| I2C_SDA | A1 GPIO2 | U2 SDA | 3.3 | 2.3 | 5.5 | ok |
| I2C_SDA | U2 SDA | A1 GPIO2 | 3.3 | 2.15 | 3.6 | ok |
| REAR_LEFT_MOTOR_DIR | A1 GPIO26 | U5 DIR1 | 3.3 | 2 | 5.5 | ok |
| REAR_LEFT_MOTOR_ENC_A | M3 Encoder A | A1 GPIO17 | 3.3 | 2.15 | 3.6 | ok |
| REAR_LEFT_MOTOR_ENC_B | M3 Encoder B | A1 GPIO27 | 3.3 | 2.15 | 3.6 | ok |
| REAR_LEFT_MOTOR_PWM | A1 GPIO21 | U5 PWM1 | 3.3 | 2 | 5.5 | ok |
| REAR_RIGHT_MOTOR_DIR | A1 GPIO23 | U5 DIR2 | 3.3 | 2 | 5.5 | ok |
| REAR_RIGHT_MOTOR_ENC_A | M4 Encoder A | A1 GPIO24 | 3.3 | 2.15 | 3.6 | ok |
| REAR_RIGHT_MOTOR_ENC_B | M4 Encoder B | A1 GPIO25 | 3.3 | 2.15 | 3.6 | ok |
| REAR_RIGHT_MOTOR_PWM | A1 GPIO22 | U5 PWM2 | 3.3 | 2 | 5.5 | ok |

### Sources

| Input | Source |
|---|---|
| LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) capacity and energy | [datasheet](https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) heat | estimated: 27.5 W out at about 90 % (Pololu range 80-95 %) |
| Raspberry Pi 5 (4 GB) logic levels | [estimated](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html): The documentation gives 3.3 V GPIO, not 5 V tolerant. RP1 input thresholds are not published; 0.65 x 3.3 V assumed (common CMOS figure). |
| Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) logic levels | [estimated](https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels): Cytron states 3.3 V and 5 V logic inputs; the 2 V threshold is assumed from that, not published. |
| Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) logic levels | [datasheet](https://www.pololu.com/product/4751): Hall encoder outputs swing to the encoder Vcc (3.5-20 V), so they match the host when fed from its own logic supply. |
| Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) logic levels | [estimated](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085): 3.3 V sensor on a breakout with a regulator and level shifting for 3-5 V hosts (Adafruit guide); thresholds assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 14 AWG silicone wire | 1 | m | 1.5 | 1.50 | 2.082 mm2, rated 16 A in a bundle; 0.87 m cut + 10 % waste | estimated |
| 18 AWG silicone wire | 1.3 | m | 0.7 | 0.91 | 0.823 mm2, rated 8 A in a bundle; 1.11 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 4.5 | m | 0.4 | 1.80 | 0.327 mm2, rated 3.5 A in a bundle; 4.07 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 4.3 | m | 0.35 | 1.50 | 0.205 mm2, rated 1.75 A in a bundle; 3.87 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 5.6 | m | 0.3 | 1.68 | 0.128 mm2, rated 1.1 A in a bundle; 5.09 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 46 | pc | 0.02 | 0.92 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 11 | pc | 0.02 | 0.22 | one per cable end | estimated |
| Bootlace ferrule contacts | 12 | pc | 0.03 | 0.36 | rated 17.5 A per contact | estimated |
| XT60 contacts | 2 | pc | 0.9 | 1.80 | rated 35 A per contact | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 2.3 | m | 0.2 | 0.46 | 31 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 32 | pc | 0.02 | 0.64 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 3 | pc | 0.08 | 0.24 | 9.5 mm panel hole | estimated |
| USB | 1 | pc | 3 | 3.00 | lidar to computer | estimated |
| FFC | 1 | pc | 3 | 3.00 | front_camera to computer | estimated |
| 15 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Adafruit BNO085 9-DoF IMU breakout | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.ceva-ip.com/wp-content/uploads/BNO080_085-Datasheet.pdf) | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.adafruit.com/product/4754) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator | [datasheet](https://www.pololu.com/product/4091/specs) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) |
| Cytron MDD10A dual-channel 10 A DC motor driver | estimated | estimated | estimated | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| LiPo 3S 2200 mAh 25C, XT60 | estimated | estimated | estimated | estimated |
| Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder | estimated | estimated | [datasheet](https://www.pololu.com/product/4752) | [datasheet](https://www.pololu.com/file/0J1735/37d-metal-gearmotors-dimension-diagram.pdf) |
| Raspberry Pi 5 | estimated | [datasheet](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html) | estimated | [datasheet](https://pip.raspberrypi.com/documents/RP-008348-DS-raspberry-pi-5-product-brief.pdf) |
| Raspberry Pi Camera Module 3 | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated |
| Slamtec RPLIDAR C1 | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) |
| KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
