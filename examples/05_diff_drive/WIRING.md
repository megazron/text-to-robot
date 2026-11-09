# Wiring: diff_drive_robot

15 cables, 33 conductors, 7.9 m of wire, wiring parts $11.19.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 11.1 | main_switch | 35 / 70 | 3.366 / 13.503 | 10.4x | 7.5 | 0.083 |
| 5V | 5 | regulator_5v | 5.5 / 8 | 1.03 / 5 | 5.3x | - | 0.066 |

**VBAT loads** (peak assumes two drive motors stalling at once, the rest running):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator_5v | 0.516 | 2.503 |
| motor_driver_1 | 2.85 | 11 |

**5V loads** (peak assumes the computer at its peak and every sensor running):

| Load | Typical A | Peak A |
|---|--:|--:|
| computer | 1.03 | 5 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 7.5 A ATM blade fuse, inline holder, protects everything on VBAT (16 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch regulator_5v (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | LIDAR_USB | lidar.VCC (red) | computer.LINK | made | red | 0.23 | 0.8 |
| C2 | W2 | 3V3_IMU | computer.3V3 | imu.VIN | 24 | red | 0.011 | 0.015 |
| C2 | W3 | GND | computer.GND | imu.GND | 24 | black | 0.011 | 0.015 |
| C2 | W4 | I2C_SDA | computer.GPIO2 | imu.SDA | 26 | blue | 0.02 | 0.02 |
| C2 | W5 | I2C_SCL | computer.GPIO3 | imu.SCL | 26 | yellow | 0.02 | 0.02 |
| C3 | W6 | GND | motor_driver_1.GND | computer.GND | 24 | black | 0.01 | 0.01 |
| C3 | W7 | LEFT_MOTOR_PWM | computer.GPIO12 | motor_driver_1.PWM1 | 26 | yellow | 0.02 | 0.02 |
| C3 | W8 | LEFT_MOTOR_DIR | computer.GPIO13 | motor_driver_1.DIR1 | 26 | yellow | 0.02 | 0.02 |
| C3 | W9 | RIGHT_MOTOR_PWM | computer.GPIO5 | motor_driver_1.PWM2 | 26 | blue | 0.02 | 0.02 |
| C3 | W10 | RIGHT_MOTOR_DIR | computer.GPIO6 | motor_driver_1.DIR2 | 26 | blue | 0.02 | 0.02 |
| C4 | W11 | LEFT_MOTOR_PHASE_A | motor_driver_1.M1A | left_motor.Motor (red) | 22 | orange | 1.4 | 5.5 |
| C4 | W12 | LEFT_MOTOR_PHASE_B | motor_driver_1.M1B | left_motor.Motor (black) | 22 | orange | 1.4 | 5.5 |
| C5 | W13 | LEFT_MOTOR_ENC_VCC | computer.3V3 | left_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C5 | W14 | GND | computer.GND | left_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C5 | W15 | LEFT_MOTOR_ENC_A | computer.GPIO18 | left_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C5 | W16 | LEFT_MOTOR_ENC_B | computer.GPIO19 | left_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C6 | W17 | RIGHT_MOTOR_PHASE_A | motor_driver_1.M2A | right_motor.Motor (red) | 22 | orange | 1.4 | 5.5 |
| C6 | W18 | RIGHT_MOTOR_PHASE_B | motor_driver_1.M2B | right_motor.Motor (black) | 22 | orange | 1.4 | 5.5 |
| C7 | W19 | RIGHT_MOTOR_ENC_VCC | computer.3V3 | right_motor.Encoder Vcc (blue) | 24 | red | 0.01 | 0.01 |
| C7 | W20 | GND | computer.GND | right_motor.Encoder GND (green) | 24 | black | 0.01 | 0.01 |
| C7 | W21 | RIGHT_MOTOR_ENC_A | computer.GPIO16 | right_motor.Encoder A (yellow) | 26 | blue | 0.02 | 0.02 |
| C7 | W22 | RIGHT_MOTOR_ENC_B | computer.GPIO20 | right_motor.Encoder B (white) | 26 | blue | 0.02 | 0.02 |
| C8 | W23 | VBAT | battery.BAT+ | main_fuse.IN | 16 | red | 3.366 | 13.503 |
| C9 | W24 | VBAT | main_fuse.OUT | main_switch.IN | 16 | red | 3.366 | 13.503 |
| C10 | W25 | GND | battery.BAT- | star_ground.P1 | 16 | black | 3.366 | 13.503 |
| C11 | W26 | VBAT | main_switch.OUT | splice_vbat.P1 | 16 | red | 3.366 | 13.503 |
| C12 | W27 | VBAT | splice_vbat.P2 | regulator_5v.VIN | 22 | red | 0.516 | 2.503 |
| C12 | W28 | GND | star_ground.P2 | regulator_5v.GND | 24 | black | 0.516 | 2.503 |
| C13 | W29 | VBAT | splice_vbat.P2 | motor_driver_1.POWER+ | 18 | red | 2.85 | 11 |
| C13 | W30 | GND | star_ground.P2 | motor_driver_1.POWER- | 18 | black | 2.85 | 11 |
| C14 | W31 | GND | regulator_5v.GND | star_ground.P2 | 22 | black | 1.03 | 5 |
| C15 | W32 | 5V | regulator_5v.VOUT | computer.5V | 22 | red | 1.03 | 5 |
| C15 | W33 | GND | star_ground.P2 | computer.GND | 22 | black | 1.03 | 5 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | lidar to computer | 1 | 170 | 166.8 | 0 | 0 | 0 | USB | electronics_enclosure.rear_slot |
| C2 | computer to imu | 4 | 235 | 132.5 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | - |
| C3 | motor_driver_1 to computer | 5 | 185 | 84.9 | 40 | 0 | 60 | 5-pin 2.54 mm header / 40-pin header | - |
| C4 | motor_driver_1 channel 1 to left_motor | 2 | 360 | 255.4 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | electronics_enclosure.deck_left |
| C5 | left_motor encoder to computer | 4 | 300 | 197 | 40 | 0 | 60 | 40-pin header / 1x6 female header | electronics_enclosure.deck_left |
| C6 | motor_driver_1 channel 2 to right_motor | 2 | 315 | 213.8 | 40 | 0 | 60 | 2-position screw terminal / 1x6 female header | electronics_enclosure.deck_right |
| C7 | right_motor encoder to computer | 4 | 260 | 155.6 | 40 | 0 | 60 | 40-pin header / 1x6 female header | electronics_enclosure.deck_right |
| C8 | battery positive to main fuse | 1 | 100 | 0 | 40 | 0 | 60 | XT60 / soldered leads | - |
| C9 | main fuse to main switch | 1 | 230 | 129.9 | 40 | 0 | 60 | soldered leads / 4.8 mm quick-connect tabs | electronics_enclosure.deck_left |
| C10 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | XT60 / lever clamp | - |
| C11 | main_switch to the VBAT splice | 1 | 100 | 0 | 40 | 0 | 60 | 4.8 mm quick-connect tabs / lever clamp | - |
| C12 | VBAT to regulator_5v | 2 | 290 | 185.2 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | electronics_enclosure.deck_left |
| C13 | VBAT to motor_driver_1 | 2 | 305 | 202 | 40 | 0 | 60 | lever clamp / 2-position screw terminal | electronics_enclosure.deck_left |
| C14 | regulator_5v to star_ground | 1 | 310 | 208 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C15 | 5V to computer | 2 | 210 | 106.4 | 40 | 0 | 60 | 0.1 in through holes / 40-pin header | - |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (LiPo 3S 2200 mAh 25C, XT60) | 24.4 | 2200 | VBAT 11.1 V | 3.366 | 31 min | 13.503 | 8 min | 6.14 C | 55 |

### Regulator heat

Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.

| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|
| regulator_5v | switching | VBAT 11.1 V | 5V 5 V | 1.03 / 5 | 5.728 | 5.15 | 0.578 / 2.783 | 90 % | 3 | yes |
- regulator_5v: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 3 W of heat.

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| I2C_SCL | A1 GPIO3 | U3 SCL | 3.3 | 2.3 | 5.5 | ok |
| I2C_SCL | U3 SCL | A1 GPIO3 | 3.3 | 2.15 | 3.6 | ok |
| I2C_SDA | A1 GPIO2 | U3 SDA | 3.3 | 2.3 | 5.5 | ok |
| I2C_SDA | U3 SDA | A1 GPIO2 | 3.3 | 2.15 | 3.6 | ok |
| LEFT_MOTOR_DIR | A1 GPIO13 | U1 DIR1 | 3.3 | 2 | 5.5 | ok |
| LEFT_MOTOR_ENC_A | M1 Encoder A | A1 GPIO18 | 3.3 | 2.15 | 3.6 | ok |
| LEFT_MOTOR_ENC_B | M1 Encoder B | A1 GPIO19 | 3.3 | 2.15 | 3.6 | ok |
| LEFT_MOTOR_PWM | A1 GPIO12 | U1 PWM1 | 3.3 | 2 | 5.5 | ok |
| RIGHT_MOTOR_DIR | A1 GPIO6 | U1 DIR2 | 3.3 | 2 | 5.5 | ok |
| RIGHT_MOTOR_ENC_A | M2 Encoder A | A1 GPIO16 | 3.3 | 2.15 | 3.6 | ok |
| RIGHT_MOTOR_ENC_B | M2 Encoder B | A1 GPIO20 | 3.3 | 2.15 | 3.6 | ok |
| RIGHT_MOTOR_PWM | A1 GPIO5 | U1 PWM2 | 3.3 | 2 | 5.5 | ok |

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
| 16 AWG silicone wire | 0.6 | m | 1 | 0.60 | 1.308 mm2, rated 11 A in a bundle; 0.53 m cut + 10 % waste | estimated |
| 18 AWG silicone wire | 0.7 | m | 0.7 | 0.49 | 0.823 mm2, rated 8 A in a bundle; 0.61 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 2.7 | m | 0.4 | 1.08 | 0.327 mm2, rated 3.5 A in a bundle; 2.37 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 2.3 | m | 0.35 | 0.80 | 0.205 mm2, rated 1.75 A in a bundle; 2.06 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 2.6 | m | 0.3 | 0.78 | 0.128 mm2, rated 1.1 A in a bundle; 2.33 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 28 | pc | 0.02 | 0.56 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 7 | pc | 0.02 | 0.14 | one per cable end | estimated |
| Bootlace ferrule contacts | 6 | pc | 0.03 | 0.18 | rated 17.5 A per contact | estimated |
| XT60 contacts | 2 | pc | 0.9 | 1.80 | rated 35 A per contact | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 1.5 | m | 0.2 | 0.30 | 19 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 32 | pc | 0.02 | 0.64 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 2 | pc | 0.08 | 0.16 | 9.5 mm panel hole | estimated |
| USB | 1 | pc | 3 | 3.00 | lidar to computer | estimated |
| 7.5 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
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
| Slamtec RPLIDAR C1 | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf) |
| KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
