# Wiring: arduino_arm

8 cables, 22 conductors, 7.01 m of wire, wiring parts $8.11.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| V_SERVO | 5 | main_switch | 10 / 11 | 2.21 / 6.31 | 4.5x | - | 0.071 |

**V_SERVO loads** (peak assumes every servo stalled at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| servo_driver | 2.21 | 6.31 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | MAINS_L | mains_inlet.L | power_supply.AC/L | 24 | red | 1 | 2 |
| C1 | W2 | MAINS_N | mains_inlet.N | power_supply.AC/N | 24 | red | 1 | 2 |
| C1 | W3 | MAINS_E | mains_inlet.E | power_supply.FG | 24 | red | 1 | 2 |
| C2 | W4 | SERVO0_PWM | servo_driver.PWM0 | yaw_servo.Signal (yellow) | 26 | yellow | 0.02 | 0.02 |
| C2 | W5 | SERVO0_V | servo_driver.V+ | yaw_servo.V+ (red) | 24 | red | 0.2 | 0.65 |
| C2 | W6 | GND | servo_driver.GND | yaw_servo.GND (brown) | 24 | black | 0.2 | 0.65 |
| C3 | W7 | SERVO1_PWM | servo_driver.PWM1 | shoulder_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C3 | W8 | SERVO1_V | servo_driver.V+ | shoulder_servo.V+ (red) | 24 | red | 0.9 | 2.5 |
| C3 | W9 | GND | servo_driver.GND | shoulder_servo.GND (brown) | 24 | black | 0.9 | 2.5 |
| C4 | W10 | SERVO2_PWM | servo_driver.PWM2 | elbow_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C4 | W11 | SERVO2_V | servo_driver.V+ | elbow_servo.V+ (red) | 24 | red | 0.9 | 2.5 |
| C4 | W12 | GND | servo_driver.GND | elbow_servo.GND (brown) | 24 | black | 0.9 | 2.5 |
| C5 | W13 | SERVO3_PWM | servo_driver.PWM3 | claw_servo.Signal (yellow) | 26 | yellow | 0.02 | 0.02 |
| C5 | W14 | SERVO3_V | servo_driver.V+ | claw_servo.V+ (red) | 24 | red | 0.2 | 0.65 |
| C5 | W15 | GND | servo_driver.GND | claw_servo.GND (brown) | 24 | black | 0.2 | 0.65 |
| C6 | W16 | 5V_LOGIC | controller.5V | servo_driver.VCC | 24 | red | 0.01 | 0.01 |
| C6 | W17 | GND | controller.GND | servo_driver.GND | 24 | black | 0.01 | 0.01 |
| C6 | W18 | I2C_SDA | controller.A4/SDA | servo_driver.SDA | 26 | blue | 0.02 | 0.02 |
| C6 | W19 | I2C_SCL | controller.A5/SCL | servo_driver.SCL | 26 | yellow | 0.02 | 0.02 |
| C7 | W20 | V_SERVO | power_supply.DC OUTPUT +V | main_switch.IN | 20 | red | 2.21 | 6.31 |
| C8 | W21 | V_SERVO | main_switch.OUT | servo_driver.V+ | 20 | red | 2.21 | 6.31 |
| C8 | W22 | GND | power_supply.DC OUTPUT -V | servo_driver.GND | 20 | black | 2.21 | 6.31 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | mains inlet to the supply (crimped, insulated spades; earth first) | 3 | 185 | 80.5 | 40 | 0 | 60 | 6.3 mm quick-connect tabs / barrier screw terminal | - |
| C2 | PCA9685 channel 0 to yaw_servo | 3 | 185 | 84.5 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | console.yaw_lead |
| C3 | PCA9685 channel 1 to shoulder_servo | 3 | 305 | 146.8 | 40 | 55 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | console.arm_leads |
| C4 | PCA9685 channel 2 to elbow_servo | 3 | 515 | 286 | 40 | 125 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | console.arm_leads |
| C5 | PCA9685 channel 3 to claw_servo | 3 | 730 | 427.5 | 40 | 200 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | console.arm_leads |
| C6 | controller to servo_driver | 4 | 160 | 58.2 | 40 | 0 | 60 | female 2.54 mm socket header / 6-pin 0.1 in header | - |
| C7 | battery positive to main fuse | 1 | 280 | 179.9 | 40 | 0 | 60 | barrier screw terminal / 4.8 mm quick-connect tabs | supply_case.dc_out + console.power_in |
| C8 | V_SERVO to servo_driver | 2 | 165 | 60.5 | 40 | 0 | 60 | 4.8 mm quick-connect tabs / 2-position screw terminal | - |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C3 | yaw | -1.571 to 1.571 | 22.1 | 39.4 | 55 |
| C4 | yaw | -1.571 to 1.571 | 23.7 | 45.9 | 60 |
| C4 | shoulder | -1.571 to 1.571 | 55.7 | 83.6 | 65 |
| C5 | yaw | -1.571 to 1.571 | 23.7 | 45.9 | 60 |
| C5 | shoulder | -1.571 to 1.571 | 55.7 | 83.6 | 65 |
| C5 | elbow | -2.1 to 2.1 | 55.7 | 93 | 75 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Mains supply

| Supply | Rail | Rated A | Typical A | Peak A | Load at typical |
|---|---|--:|--:|--:|--:|
| power_supply (Mean Well LRS-50-5 enclosed PSU, 5 V 10 A) | V_SERVO 5 V | 10 | 2.21 | 6.31 | 22.1 % |

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| I2C_SCL | A1 A5/SCL | U1 SCL | 5 | 3.5 | 5.5 | ok |
| I2C_SDA | A1 A4/SDA | U1 SDA | 5 | 3.5 | 5.5 | ok |
| I2C_SDA | U1 SDA | A1 A4/SDA | 5 | 3 | 5.5 | ok |
| SERVO0_PWM | U1 PWM0 | M1 Signal | 5 | 2 | 6 | ok |
| SERVO1_PWM | U1 PWM1 | M2 Signal | 5 | 2 | 7.2 | ok |
| SERVO2_PWM | U1 PWM2 | M3 Signal | 5 | 2 | 7.2 | ok |
| SERVO3_PWM | U1 PWM3 | M4 Signal | 5 | 2 | 6 | ok |

### Sources

| Input | Source |
|---|---|
| Mean Well LRS-50-5 enclosed PSU, 5 V 10 A (50 W) output | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-50/LRS-50-SPEC.PDF) |
| Arduino Uno R3 compatible board (ATmega328P, CH340 USB) logic levels | [datasheet](https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf): ATmega328P at VCC 5 V: VIH min 0.6 VCC = 3.0 V, pins to VCC + 0.5 V. |
| PCA9685 16-channel PWM servo driver board (generic, I2C) logic levels | [datasheet](https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf): VIH 0.7 VDD on SCL/SDA; inputs are 5.5 V tolerant; LED outputs are totem pole to VDD. |
| TowerPro SG90 micro servo (nylon gears) + cross horn logic levels | [estimated](http://www.ee.ic.ac.uk/pcheung/teaching/DE1_EE/stores/sg90_datasheet.pdf): Pulse input of an analogue servo: no threshold published; 3.3 V and 5 V pulses both work in practice, 2 V assumed. |
| TowerPro MG996R standard servo (metal gears) + round horn logic levels | estimated: Pulse input of a hobby servo: no threshold published; 2 V assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 20 AWG silicone wire | 0.7 | m | 0.5 | 0.35 | 0.519 mm2, rated 5.5 A in a bundle; 0.61 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 4.8 | m | 0.35 | 1.68 | 0.205 mm2, rated 1.75 A in a bundle; 4.35 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 2.3 | m | 0.3 | 0.69 | 0.128 mm2, rated 1.1 A in a bundle; 2.05 m cut + 10 % waste | estimated |
| 6.3 mm spade contacts | 6 | pc | 0.08 | 0.48 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 6 | pc | 0.03 | 0.18 | rated 17.5 A per contact | estimated |
| Dupont 2.54 mm contacts | 20 | pc | 0.02 | 0.40 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 6 | pc | 0.02 | 0.12 | one per cable end | estimated |
| Heat shrink 3 mm, 2:1 | 0.9 | m | 0.2 | 0.18 | 12 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 21 | pc | 0.02 | 0.42 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 7.9 mm panel hole, 4.8 mm bore | 2 | pc | 0.08 | 0.16 | 8 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 6.5 mm panel hole | estimated |
| PG7 cable gland | 1 | pc | 2.97 | 2.97 | cable exit with strain relief | estimated |
| Nylon braided sleeving 6 mm | 1 | m | 0.4 | 0.40 | over every cable where it crosses a joint | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Arduino Uno R3 compatible board | estimated | estimated | estimated | estimated |
| TowerPro MG996R standard servo | [datasheet](https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/f2017/kmv48_rp625/kmv48_rp625/kmv48_rp625/MG996RTowerPro.pdf) | [datasheet](https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/f2017/kmv48_rp625/kmv48_rp625/kmv48_rp625/MG996RTowerPro.pdf) | estimated | [datasheet](https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/f2017/kmv48_rp625/kmv48_rp625/kmv48_rp625/MG996RTowerPro.pdf) |
| TowerPro SG90 micro servo | [datasheet](https://docs.m5stack.com/en/accessory/SG90_Servo) | estimated | [datasheet](https://docs.m5stack.com/en/accessory/SG90_Servo) | [datasheet](https://www.towerpro.com.tw/product/sg90-7/) |
| IEC C14 panel inlet with fuse drawer and rocker switch, 10 A | estimated | estimated | estimated | estimated |
| PCA9685 16-channel PWM servo driver board | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) |
| Mean Well LRS-50-5 enclosed PSU, 5 V 10 A | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-50/LRS-50-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-50/LRS-50-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-50/LRS-50-SPEC.PDF) | [datasheet](https://www.meanwell.com/Upload/PDF/LRS-50/LRS-50-SPEC.PDF) |
| KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC | estimated | estimated | estimated | estimated |

## Notes

- Mains side: IEC inlet to the supply's AC terminals with insulated spades and ferrules, earth wired first, case closed before plugging in. Have it checked if you are not qualified to wire mains.
- The Uno runs from its USB cable (it takes serial commands from the PC), the servos from the adapter; the two grounds join at the I2C lead.
