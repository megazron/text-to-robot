# Wiring: underwater_rov

23 cables, 46 conductors, 12.68 m of wire, wiring parts $50.19.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 14.8 | main_fuse | 60 / 120 | 24.485 / 96.485 | 2.5x | 50 | 0.085 |
| 5V | 5 | regulator | 5 / 5 | 1.221 / 3.035 | 4.1x | - | 0.054 |

**VBAT loads** (peak assumes all four thrusters at full thrust):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator | 0.485 | 1.206 |
| esc_1 | 6 | 24 |
| esc_2 | 6 | 24 |
| esc_3 | 6 | 24 |
| esc_4 | 6 | 24 |

**5V loads** (peak assumes every load at its peak at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| controller | 1.2 | 3 |
| pwm_driver | 0.01 | 0.02 |
| imu | 0.011 | 0.015 |

## Protection

- Fuse **F1**: 50 A ANL fuse holder, protects everything on VBAT (4 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch regulator (22 AWG).
- Fuse **F3**: 15 A ATM blade fuse, inline holder, protects branch esc_1 (14 AWG).
- Fuse **F4**: 15 A ATM blade fuse, inline holder, protects branch esc_2 (14 AWG).
- Fuse **F5**: 15 A ATM blade fuse, inline holder, protects branch esc_3 (14 AWG).
- Fuse **F6**: 15 A ATM blade fuse, inline holder, protects branch esc_4 (14 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | I2C_SDA | controller.GPIO2 | pwm_driver.SDA | 26 | blue | 0.02 | 0.02 |
| C1 | W2 | I2C_SCL | controller.GPIO3 | pwm_driver.SCL | 26 | yellow | 0.02 | 0.02 |
| C2 | W3 | I2C_SDA | controller.GPIO2 | imu.SDA | 26 | blue | 0.02 | 0.02 |
| C2 | W4 | I2C_SCL | controller.GPIO3 | imu.SCL | 26 | yellow | 0.02 | 0.02 |
| C3 | W5 | ESC1_PWM | pwm_driver.PWM0 | esc_1.PWM | 26 | yellow | 0.02 | 0.02 |
| C3 | W6 | GND | pwm_driver.GND | esc_1.GND_SIG | 24 | black | 0.01 | 0.01 |
| C4 | W7 | THRUSTER_LEFT_A | esc_1.A | thruster_left.A | 16 | orange | 4 | 16 |
| C4 | W8 | THRUSTER_LEFT_B | esc_1.B | thruster_left.B | 16 | orange | 4 | 16 |
| C4 | W9 | THRUSTER_LEFT_C | esc_1.C | thruster_left.C | 16 | orange | 4 | 16 |
| C5 | W10 | ESC2_PWM | pwm_driver.PWM1 | esc_2.PWM | 26 | yellow | 0.02 | 0.02 |
| C5 | W11 | GND | pwm_driver.GND | esc_2.GND_SIG | 24 | black | 0.01 | 0.01 |
| C6 | W12 | THRUSTER_RIGHT_A | esc_2.A | thruster_right.A | 16 | orange | 4 | 16 |
| C6 | W13 | THRUSTER_RIGHT_B | esc_2.B | thruster_right.B | 16 | orange | 4 | 16 |
| C6 | W14 | THRUSTER_RIGHT_C | esc_2.C | thruster_right.C | 16 | orange | 4 | 16 |
| C7 | W15 | ESC3_PWM | pwm_driver.PWM2 | esc_3.PWM | 26 | yellow | 0.02 | 0.02 |
| C7 | W16 | GND | pwm_driver.GND | esc_3.GND_SIG | 24 | black | 0.01 | 0.01 |
| C8 | W17 | THRUSTER_VERT_LEFT_A | esc_3.A | thruster_vert_left.A | 16 | orange | 4 | 16 |
| C8 | W18 | THRUSTER_VERT_LEFT_B | esc_3.B | thruster_vert_left.B | 16 | orange | 4 | 16 |
| C8 | W19 | THRUSTER_VERT_LEFT_C | esc_3.C | thruster_vert_left.C | 16 | orange | 4 | 16 |
| C9 | W20 | ESC4_PWM | pwm_driver.PWM3 | esc_4.PWM | 26 | yellow | 0.02 | 0.02 |
| C9 | W21 | GND | pwm_driver.GND | esc_4.GND_SIG | 24 | black | 0.01 | 0.01 |
| C10 | W22 | THRUSTER_VERT_RIGHT_A | esc_4.A | thruster_vert_right.A | 16 | orange | 4 | 16 |
| C10 | W23 | THRUSTER_VERT_RIGHT_B | esc_4.B | thruster_vert_right.B | 16 | orange | 4 | 16 |
| C10 | W24 | THRUSTER_VERT_RIGHT_C | esc_4.C | thruster_vert_right.C | 16 | orange | 4 | 16 |
| C11 | W25 | CAMERA_CONTROLLER_LINK | camera.CAM_DN0 | controller.CAM_DN0 | made | grey | 0.1 | 0.1 |
| C12 | W26 | VBAT | battery.BAT+ | main_fuse.IN | 4 | red | 24.485 | 96.485 |
| C13 | W27 | GND | battery.BAT- | star_ground.P1 | 4 | black | 24.485 | 96.485 |
| C14 | W28 | VBAT | main_fuse.OUT | splice_vbat.P1 | 4 | red | 24.485 | 96.485 |
| C15 | W29 | VBAT | splice_vbat.P2 | regulator.VIN | 22 | red | 0.485 | 1.206 |
| C15 | W30 | GND | star_ground.P2 | regulator.GND | 24 | black | 0.485 | 1.206 |
| C16 | W31 | VBAT | splice_vbat.P2 | esc_1.VBAT+ | 14 | red | 6 | 24 |
| C16 | W32 | GND | star_ground.P2 | esc_1.GND | 14 | black | 6 | 24 |
| C17 | W33 | VBAT | splice_vbat.P2 | esc_2.VBAT+ | 14 | red | 6 | 24 |
| C17 | W34 | GND | star_ground.P2 | esc_2.GND | 14 | black | 6 | 24 |
| C18 | W35 | VBAT | splice_vbat.P2 | esc_3.VBAT+ | 14 | red | 6 | 24 |
| C18 | W36 | GND | star_ground.P2 | esc_3.GND | 14 | black | 6 | 24 |
| C19 | W37 | VBAT | splice_vbat.P2 | esc_4.VBAT+ | 14 | red | 6 | 24 |
| C19 | W38 | GND | star_ground.P2 | esc_4.GND | 14 | black | 6 | 24 |
| C20 | W39 | 5V | regulator.VOUT | splice_5v.P1 | 22 | red | 1.221 | 3.035 |
| C20 | W40 | GND | regulator.GND | star_ground.P2 | 22 | black | 1.221 | 3.035 |
| C21 | W41 | 5V | splice_5v.P2 | controller.VBUS | 22 | red | 1.2 | 3 |
| C21 | W42 | GND | star_ground.P2 | controller.GND | 22 | black | 1.2 | 3 |
| C22 | W43 | 5V | splice_5v.P2 | pwm_driver.VCC | 24 | red | 0.01 | 0.02 |
| C22 | W44 | GND | star_ground.P2 | pwm_driver.GND | 24 | black | 0.01 | 0.02 |
| C23 | W45 | 5V | splice_5v.P2 | imu.VIN | 24 | red | 0.011 | 0.015 |
| C23 | W46 | GND | star_ground.P2 | imu.GND | 24 | black | 0.011 | 0.015 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | controller to pwm_driver | 2 | 165 | 60.3 | 40 | 0 | 60 | 40-pin header / 6-pin 0.1 in header | - |
| C2 | controller to imu | 2 | 215 | 110.6 | 40 | 0 | 60 | 40-pin header / 12-pin breadboard-friendly header | - |
| C3 | pwm_driver to esc_1 | 2 | 295 | 193.9 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin 0.1 in servo plug (signal | - |
| C4 | esc_1 to thruster_left | 3 | 340 | 235.4 | 40 | 0 | 60 | Three 16 AWG leads / Three 18 AWG leads in a 1 m potted cable | hull_bay.pen_4 |
| C5 | pwm_driver to esc_2 | 2 | 300 | 195.2 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin 0.1 in servo plug (signal | - |
| C6 | esc_2 to thruster_right | 3 | 320 | 217.7 | 40 | 0 | 60 | Three 16 AWG leads / Three 18 AWG leads in a 1 m potted cable | hull_bay.pen_1 |
| C7 | pwm_driver to esc_3 | 2 | 230 | 125.2 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin 0.1 in servo plug (signal | - |
| C8 | esc_3 to thruster_vert_left | 3 | 325 | 224.7 | 40 | 0 | 60 | Three 16 AWG leads / Three 18 AWG leads in a 1 m potted cable | hull_bay.pen_4 |
| C9 | pwm_driver to esc_4 | 2 | 230 | 125.7 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin 0.1 in servo plug (signal | - |
| C10 | esc_4 to thruster_vert_right | 3 | 310 | 205.9 | 40 | 0 | 60 | Three 16 AWG leads / Three 18 AWG leads in a 1 m potted cable | hull_bay.pen_1 |
| C11 | camera to controller | 1 | 85 | 80.5 | 0 | 0 | 0 | camera FFC, 200 mm (Pi 5 22-pin to 15-pin) | - |
| C12 | battery positive to main fuse | 1 | 205 | 100 | 40 | 0 | 60 | XT90 / soldered leads | - |
| C13 | battery negative to star ground | 1 | 210 | 106.5 | 40 | 0 | 60 | XT90 / lever clamp | - |
| C14 | main_fuse to the VBAT splice | 1 | 345 | 242.5 | 40 | 0 | 60 | soldered leads / lever clamp | - |
| C15 | VBAT to regulator | 2 | 280 | 179.4 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | - |
| C16 | VBAT to esc_1 | 2 | 340 | 237.4 | 40 | 0 | 60 | lever clamp / Two 16 AWG leads | - |
| C17 | VBAT to esc_2 | 2 | 355 | 253.9 | 40 | 0 | 60 | lever clamp / Two 16 AWG leads | - |
| C18 | VBAT to esc_3 | 2 | 265 | 163.1 | 40 | 0 | 60 | lever clamp / Two 16 AWG leads | - |
| C19 | VBAT to esc_4 | 2 | 290 | 187.9 | 40 | 0 | 60 | lever clamp / Two 16 AWG leads | - |
| C20 | regulator to the 5V splice | 2 | 280 | 179.2 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C21 | 5V to controller | 2 | 220 | 115.1 | 40 | 0 | 60 | lever clamp / USB-C | - |
| C22 | 5V to pwm_driver | 2 | 255 | 155 | 40 | 0 | 60 | lever clamp / 6-pin 0.1 in header | - |
| C23 | 5V to imu | 2 | 300 | 196.6 | 40 | 0 | 60 | lever clamp / 12-pin breadboard-friendly header | - |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (LiPo 4S 5000 mAh 60C, XT90) | 74 | 5000 | VBAT 14.8 V | 24.485 | 10 min | 96.485 | 2 min | 19.3 C | 300 |

### Regulator heat

Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.

| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|
| regulator | switching | VBAT 14.8 V | 5V 5 V | 1.221 / 3.035 | 7.178 | 6.105 | 1.073 / 2.674 | 85 % | 3 | yes |
- regulator: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 3 W of heat.

### Logic levels

**5 signals need a level shifter.**

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| ESC1_PWM | U7 PWM0 | U2 PWM | 5 | - | - | not checked: no published logic levels for one side |
| ESC2_PWM | U7 PWM1 | U3 PWM | 5 | - | - | not checked: no published logic levels for one side |
| ESC3_PWM | U7 PWM2 | U4 PWM | 5 | - | - | not checked: no published logic levels for one side |
| ESC4_PWM | U7 PWM3 | U5 PWM | 5 | - | - | not checked: no published logic levels for one side |
| I2C_SCL | A1 GPIO3 | U6 SCL | 3.3 | 2.3 | 5.5 | ok |
| I2C_SCL | A1 GPIO3 | U7 SCL | 3.3 | 3.5 | 5.5 | **too low**: 3.3 V high is under the 3.5 V threshold: add a level shifter |
| I2C_SCL | U6 SCL | A1 GPIO3 | 3.3 | 2.15 | 3.6 | ok |
| I2C_SCL | U6 SCL | U7 SCL | 3.3 | 3.5 | 5.5 | **too low**: 3.3 V high is under the 3.5 V threshold: add a level shifter |
| I2C_SDA | A1 GPIO2 | U6 SDA | 3.3 | 2.3 | 5.5 | ok |
| I2C_SDA | A1 GPIO2 | U7 SDA | 3.3 | 3.5 | 5.5 | **too low**: 3.3 V high is under the 3.5 V threshold: add a level shifter |
| I2C_SDA | U6 SDA | A1 GPIO2 | 3.3 | 2.15 | 3.6 | ok |
| I2C_SDA | U6 SDA | U7 SDA | 3.3 | 3.5 | 5.5 | **too low**: 3.3 V high is under the 3.5 V threshold: add a level shifter |
| I2C_SDA | U7 SDA | A1 GPIO2 | 5 | 2.15 | 3.6 | **over voltage**: 5 V into a 3.6 V input: add a level shifter (or a 2:1 divider on a one-way line) |
| I2C_SDA | U7 SDA | U6 SDA | 5 | 2.3 | 5.5 | ok |

Not checked (no logic levels in the parts data): Blue Robotics Basic ESC 30 A (7-26 V, PWM input).

### Sources

| Input | Source |
|---|---|
| LiPo 4S 5000 mAh 60C, XT90 (Gens Ace G-Tech) capacity and energy | [datasheet](https://www.unmannedtechshop.co.uk/de/products/gens-ace-g-tech-5000mah-14-8v-4s-60c-lipo-battery-pack-xt90) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) heat | estimated: 27.5 W out at about 90 % (Pololu range 80-95 %) |
| PCA9685 16-channel PWM servo driver board (generic, I2C) logic levels | [datasheet](https://cdn-shop.adafruit.com/datasheets/PCA9685.pdf): VIH 0.7 VDD on SCL/SDA; inputs are 5.5 V tolerant; LED outputs are totem pole to VDD. |
| Raspberry Pi 5 (4 GB) logic levels | [estimated](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html): The documentation gives 3.3 V GPIO, not 5 V tolerant. RP1 input thresholds are not published; 0.65 x 3.3 V assumed (common CMOS figure). |
| Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) logic levels | [estimated](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085): 3.3 V sensor on a breakout with a regulator and level shifting for 3-5 V hosts (Adafruit guide); thresholds assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 4 AWG silicone wire | 0.9 | m | 10 | 9.00 | 21.2 mm2, rated 70 A in a bundle; 0.76 m cut + 10 % waste | estimated |
| 14 AWG silicone wire | 2.3 | m | 1.5 | 3.45 | 2.082 mm2, rated 16 A in a bundle; 2.06 m cut + 10 % waste | estimated |
| 16 AWG silicone wire | 4.3 | m | 1 | 4.30 | 1.308 mm2, rated 11 A in a bundle; 3.85 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 1.4 | m | 0.4 | 0.56 | 0.327 mm2, rated 3.5 A in a bundle; 1.24 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 2.7 | m | 0.35 | 0.94 | 0.205 mm2, rated 1.75 A in a bundle; 2.41 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 2 | m | 0.3 | 0.60 | 0.128 mm2, rated 1.1 A in a bundle; 1.77 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 28 | pc | 0.02 | 0.56 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 14 | pc | 0.02 | 0.28 | one per cable end | estimated |
| XT90 contacts | 2 | pc | 1.6 | 3.20 | rated 45 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 2.6 | m | 0.2 | 0.52 | 38 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 34 | pc | 0.02 | 0.68 | at every clip, cable end and strain-relief anchor | estimated |
| PG7 cable gland | 5 | pc | 2.97 | 14.85 | cable exit with strain relief | estimated |
| camera FFC, 200 mm (Pi 5 22-pin to 15-pin) | 1 | pc | 4 | 4.00 | camera to controller | estimated |
| 50 A ANL fuse | 1 | pc | 6 | 6.00 | plus spares | estimated |
| 2 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 15 A ATM blade fuse | 4 | pc | 0.25 | 1.00 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Blue Robotics Basic ESC 30 A | [datasheet](https://bluerobotics.com/store/thrusters/speed-controllers/besc30-r3/) | [datasheet](https://bluerobotics.com/store/thrusters/speed-controllers/besc30-r3/) | estimated | estimated |
| Adafruit BNO085 9-DoF IMU breakout | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.ceva-ip.com/wp-content/uploads/BNO080_085-Datasheet.pdf) | [datasheet](https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/pinouts) | [datasheet](https://www.adafruit.com/product/4754) |
| Pololu D36V50F5 5 V 5.5 A step-down regulator | [datasheet](https://www.pololu.com/product/4091/specs) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| LiPo 4S 5000 mAh 60C, XT90 | estimated | [datasheet](https://www.unmannedtechshop.co.uk/de/products/gens-ace-g-tech-5000mah-14-8v-4s-60c-lipo-battery-pack-xt90) | estimated | [datasheet](https://www.unmannedtechshop.co.uk/de/products/gens-ace-g-tech-5000mah-14-8v-4s-60c-lipo-battery-pack-xt90) |
| PCA9685 16-channel PWM servo driver board | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://cdn-shop.adafruit.com/datasheets/PCA9685.pdf) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) |
| Raspberry Pi 5 | estimated | [datasheet](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html) | estimated | [datasheet](https://pip.raspberrypi.com/documents/RP-008348-DS-raspberry-pi-5-product-brief.pdf) |
| Raspberry Pi Camera Module 3 | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated | [datasheet](https://www.raspberrypi.com/documentation/accessories/camera.html) | estimated |
| Blue Robotics T200 underwater thruster | [datasheet](https://bluerobotics.com/store/thrusters/t100-t200-thrusters/t200-thruster-r2-rp/) | [datasheet](https://bluerobotics.com/store/thrusters/t100-t200-thrusters/t200-thruster-r2-rp/) | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |

## Notes

- The tether's twisted pairs carry 100 Mbit Ethernet from the Pi to the surface laptop; it enters through a potted penetrator in the rear end cap like the thruster cables.
- Routing: 12 wire runs could only be laid through solid parts at the home pose (1053 mm in all), for example camera~controller wire 1 through hull for 77 mm at 139,0,-14; main_feed_a wire 1 through hull for 37 mm at 13,-23,-1; main_return wire 1 through hull for 44 mm at 13,-19,-1. Lay those wires round the part by hand.
