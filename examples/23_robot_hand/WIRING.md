# Wiring: robot_hand

9 cables, 27 conductors, 13.96 m of wire, wiring parts $10.34.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| V_SERVO | 5 | power_supply | 10 / 11 | 4.76 / 9.56 | 2.1x | - | 0.042 |

**V_SERVO loads** (peak assumes three flexion servos stalled on an object, the rest moving):

| Load | Typical A | Peak A |
|---|--:|--:|
| servo_driver | 4.76 | 9.56 |

## Protection

- Main switch: **mains_inlet** breaks the positive feed after the fuse. Ground is never switched.
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | MAINS_L | mains_inlet.L | power_supply.AC/L | 24 | red | 1 | 2 |
| C1 | W2 | MAINS_N | mains_inlet.N | power_supply.AC/N | 24 | red | 1 | 2 |
| C1 | W3 | MAINS_E | mains_inlet.E | power_supply.FG | 24 | red | 1 | 2 |
| C2 | W4 | SERVO0_PWM | servo_driver.PWM0 | index_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C2 | W5 | SERVO0_V | servo_driver.V+ | index_servo.V+ (red) | 22 | red | 0.9 | 2.5 |
| C2 | W6 | GND | servo_driver.GND | index_servo.GND (brown) | 22 | black | 0.9 | 2.5 |
| C3 | W7 | SERVO1_PWM | servo_driver.PWM1 | middle_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C3 | W8 | SERVO1_V | servo_driver.V+ | middle_servo.V+ (red) | 22 | red | 0.9 | 2.5 |
| C3 | W9 | GND | servo_driver.GND | middle_servo.GND (brown) | 22 | black | 0.9 | 2.5 |
| C4 | W10 | SERVO2_PWM | servo_driver.PWM2 | ring_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C4 | W11 | SERVO2_V | servo_driver.V+ | ring_servo.V+ (red) | 22 | red | 0.9 | 2.5 |
| C4 | W12 | GND | servo_driver.GND | ring_servo.GND (brown) | 22 | black | 0.9 | 2.5 |
| C5 | W13 | SERVO3_PWM | servo_driver.PWM3 | little_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C5 | W14 | SERVO3_V | servo_driver.V+ | little_servo.V+ (red) | 22 | red | 0.9 | 2.5 |
| C5 | W15 | GND | servo_driver.GND | little_servo.GND (brown) | 22 | black | 0.9 | 2.5 |
| C6 | W16 | SERVO4_PWM | servo_driver.PWM4 | thumb_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C6 | W17 | SERVO4_V | servo_driver.V+ | thumb_servo.V+ (red) | 22 | red | 0.9 | 2.5 |
| C6 | W18 | GND | servo_driver.GND | thumb_servo.GND (brown) | 22 | black | 0.9 | 2.5 |
| C7 | W19 | SERVO5_PWM | servo_driver.PWM5 | thumb_swing_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C7 | W20 | SERVO5_V | servo_driver.V+ | thumb_swing_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C7 | W21 | GND | servo_driver.GND | thumb_swing_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C8 | W22 | 5V_LOGIC | controller.5V | servo_driver.VCC | 24 | red | 0.01 | 0.01 |
| C8 | W23 | GND | controller.GND | servo_driver.GND | 24 | black | 0.01 | 0.01 |
| C8 | W24 | I2C_SDA | controller.A4/SDA | servo_driver.SDA | 26 | blue | 0.02 | 0.02 |
| C8 | W25 | I2C_SCL | controller.A5/SCL | servo_driver.SCL | 26 | yellow | 0.02 | 0.02 |
| C9 | W26 | V_SERVO | power_supply.DC OUTPUT +V | servo_driver.V+ | 18 | red | 4.76 | 9.56 |
| C9 | W27 | GND | power_supply.DC OUTPUT -V | servo_driver.GND | 18 | black | 4.76 | 9.56 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | mains inlet to the supply (crimped, insulated spades; earth first) | 3 | 185 | 80.5 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / barrier screw terminal | - |
| C2 | servo_driver to index_servo | 3 | 630 | 527.9 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | control_case.harness |
| C3 | servo_driver to middle_servo | 3 | 660 | 559.6 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | control_case.harness |
| C4 | servo_driver to ring_servo | 3 | 700 | 599.6 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | control_case.harness |
| C5 | servo_driver to little_servo | 3 | 645 | 543.7 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | control_case.harness |
| C6 | servo_driver to thumb_servo | 3 | 680 | 579 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | control_case.harness |
| C7 | servo_driver to thumb_swing_servo | 3 | 815 | 713.8 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | control_case.harness |
| C8 | controller to servo_driver | 4 | 170 | 65.6 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 6-pin 0.1 in header | - |
| C9 | V_SERVO to servo_driver | 2 | 170 | 66.6 | 40 | 0 | 60 | barrier screw terminal / 2-position screw terminal | - |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Mains supply

| Supply | Rail | Rated A | Typical A | Peak A | Load at typical |
|---|---|--:|--:|--:|--:|
| power_supply (Mean Well LRS-50-5 enclosed PSU, 5 V 10 A) | V_SERVO 5 V | 10 | 4.76 | 9.56 | 47.6 % |

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| I2C_SCL | A1 A5/SCL | U1 SCL | 5 | 3.5 | 5.5 | ok |
| I2C_SDA | A1 A4/SDA | U1 SDA | 5 | 3.5 | 5.5 | ok |
| I2C_SDA | U1 SDA | A1 A4/SDA | 5 | 3 | 5.5 | ok |
| SERVO0_PWM | U1 PWM0 | M1 Signal | 5 | 2 | 7.2 | ok |
| SERVO1_PWM | U1 PWM1 | M3 Signal | 5 | 2 | 7.2 | ok |
| SERVO2_PWM | U1 PWM2 | M4 Signal | 5 | 2 | 7.2 | ok |
| SERVO3_PWM | U1 PWM3 | M2 Signal | 5 | 2 | 7.2 | ok |
| SERVO4_PWM | U1 PWM4 | M5 Signal | 5 | 2 | 7.2 | ok |
| SERVO5_PWM | U1 PWM5 | M6 Signal | 5 | 2 | 6 | ok |

### Sources

| Input | Source |
|---|---|
| Mean Well LRS-50-5 enclosed PSU, 5 V 10 A (50 W) output | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-50/LRS-50-SPEC.PDF) |
| Arduino Nano compatible board (ATmega328P, CH340, USB-C) logic levels | [datasheet](https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf): ATmega328P at VCC 5 V: VIH min 0.6 VCC = 3.0 V, pins to VCC + 0.5 V. Outputs swing to VCC at light load. |
| PCA9685 16-channel PWM servo driver board (generic, I2C) logic levels | [datasheet](https://cdn-shop.adafruit.com/datasheets/PCA9685.pdf): VIH 0.7 VDD on SCL/SDA; inputs are 5.5 V tolerant; LED outputs are totem pole to VDD. |
| TowerPro MG996R standard servo (metal gears) + round horn logic levels | estimated: Pulse input of a hobby servo: no threshold published; 2 V assumed. |
| TowerPro MG90S micro servo (metal gears) + cross horn logic levels | estimated: Pulse input of a hobby servo: no threshold published; 2 V assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 18 AWG silicone wire | 0.4 | m | 0.7 | 0.28 | 0.823 mm2, rated 8 A in a bundle; 0.34 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 7.3 | m | 0.4 | 2.92 | 0.327 mm2, rated 3.5 A in a bundle; 6.63 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 2.8 | m | 0.35 | 0.98 | 0.205 mm2, rated 1.75 A in a bundle; 2.52 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 5 | m | 0.3 | 1.50 | 0.128 mm2, rated 1.1 A in a bundle; 4.47 m cut + 10 % waste | estimated |
| 6.3 mm spade contacts | 3 | pc | 0.08 | 0.24 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 7 | pc | 0.03 | 0.21 | rated 17.5 A per contact | estimated |
| Dupont 2.54 mm contacts | 26 | pc | 0.02 | 0.52 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 8 | pc | 0.02 | 0.16 | one per cable end | estimated |
| Heat shrink 3 mm, 2:1 | 1.1 | m | 0.2 | 0.22 | 18 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 17 | pc | 0.02 | 0.34 | at every clip, cable end and strain-relief anchor | estimated |
| PG7 cable gland | 1 | pc | 2.97 | 2.97 | cable exit with strain relief | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Arduino Nano compatible board | estimated | estimated | estimated | estimated |
| TowerPro MG90S micro servo | estimated | estimated | estimated | [datasheet](https://www.towerpro.com.tw/product/mg90s-3/) |
| TowerPro MG996R standard servo | [datasheet](https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/f2017/kmv48_rp625/kmv48_rp625/kmv48_rp625/MG996RTowerPro.pdf) | [datasheet](https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/f2017/kmv48_rp625/kmv48_rp625/kmv48_rp625/MG996RTowerPro.pdf) | estimated | [datasheet](https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/f2017/kmv48_rp625/kmv48_rp625/kmv48_rp625/MG996RTowerPro.pdf) |
| IEC C14 panel inlet with fuse drawer and rocker switch, 10 A | estimated | estimated | estimated | estimated |
| PCA9685 16-channel PWM servo driver board | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://cdn-shop.adafruit.com/datasheets/PCA9685.pdf) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) |
| Mean Well LRS-50-5 enclosed PSU, 5 V 10 A | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-50/LRS-50-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-50/LRS-50-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-50/LRS-50-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-50/LRS-50-SPEC.PDF) |

## Notes

- Mains side: IEC inlet to the supply's AC terminals with insulated spades, earth wired first, case closed before plugging in. Have it checked if you are not qualified to wire mains.
- The Nano runs from its USB cable (serial commands from the PC); the servos from the adapter. Servo leads are extended to the forearm in one braided sleeve.
