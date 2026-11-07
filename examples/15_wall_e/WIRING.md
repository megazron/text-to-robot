# Wiring: wall_e

27 cables, 61 conductors, 12.66 m of wire, wiring parts $8.92.

Diagram: [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 7.2 | main_switch | 20 / 100 | 2.305 / 6.705 | 8.7x | 4 | 0.06 |
| 5V_LOGIC | 5 | controller | 0.2 / 0.4 | 0.029 / 0.029 | 6.9x | - | 0.001 |
| 5V_SERVO | 5 | servo_regulator | 2 / 3 | 0.81 / 2.61 | 2.5x | - | 0.063 |

**VBAT loads** (peak assumes two motors stalling at once, the rest running):

| Load | Typical A | Peak A |
|---|--:|--:|
| controller | 0.024 | 0.024 |
| servo_regulator | 0.662 | 2.132 |
| motor_driver_1 | 0.81 | 3.01 |
| motor_driver_2 | 0.81 | 3.01 |

**5V_LOGIC loads** (peak assumes every load at its peak at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| motor_driver_1 | 0.002 | 0.002 |
| motor_driver_2 | 0.002 | 0.002 |
| servo_driver | 0.01 | 0.01 |
| ultrasonic | 0.015 | 0.015 |

**5V_SERVO loads** (peak assumes every servo stalled at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| servo_driver | 0.81 | 2.61 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 4 A ATM blade fuse, inline holder, protects everything on VBAT (20 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch controller (22 AWG).
- Fuse **F3**: 2 A ATM blade fuse, inline holder, protects branch servo_regulator (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | CONTROLLER_D5 | controller.D5 | motor_driver_1.PWMA | 26 | yellow | 0.02 | 0.02 |
| C1 | W2 | CONTROLLER_D7 | controller.D7 | motor_driver_1.AIN1 | 26 | blue | 0.02 | 0.02 |
| C1 | W3 | CONTROLLER_D8 | controller.D8 | motor_driver_1.AIN2 | 26 | blue | 0.02 | 0.02 |
| C1 | W4 | CONTROLLER_D6 | controller.D6 | motor_driver_1.PWMB | 26 | yellow | 0.02 | 0.02 |
| C1 | W5 | CONTROLLER_D4 | controller.D4 | motor_driver_1.BIN1 | 26 | blue | 0.02 | 0.02 |
| C1 | W6 | CONTROLLER_A0 | controller.A0 | motor_driver_1.BIN2 | 26 | white | 0.02 | 0.02 |
| C1 | W7 | MOTOR_DRIVER_1_STBY | controller.5V | motor_driver_1.STBY | 26 | red | 0.02 | 0.02 |
| C2 | W8 | FRONT_LEFT_MOTOR_PHASE_1 | motor_driver_1.AO1 | front_left_motor.M+ | 26 | orange | 0.4 | 1.5 |
| C2 | W9 | FRONT_LEFT_MOTOR_PHASE_2 | motor_driver_1.AO2 | front_left_motor.M- | 26 | orange | 0.4 | 1.5 |
| C3 | W10 | FRONT_RIGHT_MOTOR_PHASE_1 | motor_driver_1.BO1 | front_right_motor.M+ | 26 | orange | 0.4 | 1.5 |
| C3 | W11 | FRONT_RIGHT_MOTOR_PHASE_2 | motor_driver_1.BO2 | front_right_motor.M- | 26 | orange | 0.4 | 1.5 |
| C4 | W12 | CONTROLLER_D9 | controller.D9 | motor_driver_2.PWMA | 26 | yellow | 0.02 | 0.02 |
| C4 | W13 | CONTROLLER_A1 | controller.A1 | motor_driver_2.AIN1 | 26 | white | 0.02 | 0.02 |
| C4 | W14 | CONTROLLER_A2 | controller.A2 | motor_driver_2.AIN2 | 26 | white | 0.02 | 0.02 |
| C4 | W15 | CONTROLLER_D10 | controller.D10/SS | motor_driver_2.PWMB | 26 | violet | 0.02 | 0.02 |
| C4 | W16 | CONTROLLER_A3 | controller.A3 | motor_driver_2.BIN1 | 26 | white | 0.02 | 0.02 |
| C4 | W17 | CONTROLLER_D2 | controller.D2 | motor_driver_2.BIN2 | 26 | blue | 0.02 | 0.02 |
| C4 | W18 | MOTOR_DRIVER_2_STBY | controller.5V | motor_driver_2.STBY | 26 | red | 0.02 | 0.02 |
| C5 | W19 | REAR_LEFT_MOTOR_PHASE_1 | motor_driver_2.AO1 | rear_left_motor.M+ | 26 | orange | 0.4 | 1.5 |
| C5 | W20 | REAR_LEFT_MOTOR_PHASE_2 | motor_driver_2.AO2 | rear_left_motor.M- | 26 | orange | 0.4 | 1.5 |
| C6 | W21 | REAR_RIGHT_MOTOR_PHASE_1 | motor_driver_2.BO1 | rear_right_motor.M+ | 26 | orange | 0.4 | 1.5 |
| C6 | W22 | REAR_RIGHT_MOTOR_PHASE_2 | motor_driver_2.BO2 | rear_right_motor.M- | 26 | orange | 0.4 | 1.5 |
| C7 | W23 | SERVO0_PWM | servo_driver.PWM0 | neck_pan_servo.Signal (yellow) | 26 | yellow | 0.02 | 0.02 |
| C7 | W24 | SERVO0_V | servo_driver.V+ | neck_pan_servo.V+ (red) | 24 | red | 0.2 | 0.65 |
| C7 | W25 | GND | servo_driver.GND | neck_pan_servo.GND (brown) | 24 | black | 0.2 | 0.65 |
| C8 | W26 | SERVO1_PWM | servo_driver.PWM1 | neck_tilt_servo.Signal (yellow) | 26 | yellow | 0.02 | 0.02 |
| C8 | W27 | SERVO1_V | servo_driver.V+ | neck_tilt_servo.V+ (red) | 24 | red | 0.2 | 0.65 |
| C8 | W28 | GND | servo_driver.GND | neck_tilt_servo.GND (brown) | 24 | black | 0.2 | 0.65 |
| C9 | W29 | SERVO2_PWM | servo_driver.PWM2 | left_arm_servo.Signal (yellow) | 26 | yellow | 0.02 | 0.02 |
| C9 | W30 | SERVO2_V | servo_driver.V+ | left_arm_servo.V+ (red) | 24 | red | 0.2 | 0.65 |
| C9 | W31 | GND | servo_driver.GND | left_arm_servo.GND (brown) | 24 | black | 0.2 | 0.65 |
| C10 | W32 | SERVO3_PWM | servo_driver.PWM3 | right_arm_servo.Signal (yellow) | 26 | yellow | 0.02 | 0.02 |
| C10 | W33 | SERVO3_V | servo_driver.V+ | right_arm_servo.V+ (red) | 24 | red | 0.2 | 0.65 |
| C10 | W34 | GND | servo_driver.GND | right_arm_servo.GND (brown) | 24 | black | 0.2 | 0.65 |
| C11 | W35 | I2C_SDA | controller.A4/SDA | servo_driver.SDA | 26 | blue | 0.02 | 0.02 |
| C11 | W36 | I2C_SCL | controller.A5/SCL | servo_driver.SCL | 26 | yellow | 0.02 | 0.02 |
| C12 | W37 | CONTROLLER_D11 | controller.D11/MOSI | ultrasonic.Trig | 26 | violet | 0.02 | 0.02 |
| C12 | W38 | CONTROLLER_D12 | controller.D12/MISO | ultrasonic.Echo | 26 | violet | 0.02 | 0.02 |
| C13 | W39 | VBAT | battery.BAT+ | main_fuse.IN | 20 | red | 2.305 | 6.705 |
| C14 | W40 | VBAT | main_fuse.OUT | main_switch.IN | 20 | red | 2.305 | 6.705 |
| C15 | W41 | GND | battery.BAT- | star_ground.P1 | 20 | black | 2.305 | 6.705 |
| C16 | W42 | VBAT | main_switch.OUT | splice_vbat.P1 | 20 | red | 2.305 | 6.705 |
| C17 | W43 | VBAT | splice_vbat.P2 | controller.VIN | 22 | red | 0.024 | 0.024 |
| C17 | W44 | GND | star_ground.P2 | controller.GND | 24 | black | 0.024 | 0.024 |
| C18 | W45 | VBAT | splice_vbat.P2 | servo_regulator.IN+ | 22 | red | 0.662 | 2.132 |
| C18 | W46 | GND | star_ground.P2 | servo_regulator.IN- | 24 | black | 0.662 | 2.132 |
| C19 | W47 | VBAT | splice_vbat.P2 | motor_driver_1.VM | 22 | red | 0.81 | 3.01 |
| C19 | W48 | GND | star_ground.P2 | motor_driver_1.GND | 22 | black | 0.81 | 3.01 |
| C20 | W49 | VBAT | splice_vbat.P2 | motor_driver_2.VM | 22 | red | 0.81 | 3.01 |
| C20 | W50 | GND | star_ground.P2 | motor_driver_2.GND | 22 | black | 0.81 | 3.01 |
| C21 | W51 | 5V_LOGIC | controller.5V | splice_5v_logic.P1 | 24 | red | 0.029 | 0.029 |
| C21 | W52 | GND | controller.GND | star_ground.P2 | 24 | black | 0.029 | 0.029 |
| C22 | W53 | 5V_LOGIC | splice_5v_logic.P2 | motor_driver_1.VCC | 24 | red | 0.002 | 0.002 |
| C23 | W54 | 5V_LOGIC | splice_5v_logic.P2 | motor_driver_2.VCC | 24 | red | 0.002 | 0.002 |
| C24 | W55 | 5V_LOGIC | splice_5v_logic.P2 | servo_driver.VCC | 24 | red | 0.01 | 0.01 |
| C24 | W56 | GND | star_ground.P2 | servo_driver.GND | 24 | black | 0.01 | 0.01 |
| C25 | W57 | 5V_LOGIC | splice_5v_logic.P2 | ultrasonic.Vcc | 24 | red | 0.015 | 0.015 |
| C25 | W58 | GND | star_ground.P2 | ultrasonic.GND | 24 | black | 0.015 | 0.015 |
| C26 | W59 | GND | servo_regulator.OUT- | star_ground.P2 | 24 | black | 0.81 | 2.61 |
| C27 | W60 | 5V_SERVO | servo_regulator.OUT+ | servo_driver.V+ | 24 | red | 0.81 | 2.61 |
| C27 | W61 | GND | star_ground.P2 | servo_driver.GND | 24 | black | 0.81 | 2.61 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | controller to motor_driver_1 | 7 | 135 | 30.7 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 0.1 in header | - |
| C2 | motor_driver_1 to front_left_motor | 2 | 280 | 176.4 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | - |
| C3 | motor_driver_1 to front_right_motor | 2 | 240 | 139.5 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | - |
| C4 | controller to motor_driver_2 | 7 | 135 | 31.9 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 0.1 in header | - |
| C5 | motor_driver_2 to rear_left_motor | 2 | 210 | 106.1 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | - |
| C6 | motor_driver_2 to rear_right_motor | 2 | 180 | 77 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | - |
| C7 | servo_driver to neck_pan_servo | 3 | 270 | 165.6 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | - |
| C8 | servo_driver to neck_tilt_servo | 3 | 425 | 274.7 | 40 | 50 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | body_bay.neck_leads |
| C9 | servo_driver to left_arm_servo | 3 | 270 | 168.4 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | - |
| C10 | servo_driver to right_arm_servo | 3 | 220 | 118.4 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | - |
| C11 | controller to servo_driver | 2 | 280 | 175.4 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 6-pin 0.1 in header | - |
| C12 | controller to ultrasonic | 2 | 285 | 183.8 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 4-pin 2.54 mm right-angle male header | - |
| C13 | battery positive to main fuse | 1 | 100 | 0 | 40 | 0 | 60 | flying leads / soldered leads | - |
| C14 | main fuse to main switch | 1 | 225 | 123.7 | 40 | 0 | 60 | soldered leads / 4.8 mm quick-connect tabs | - |
| C15 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | flying leads / lever clamp | - |
| C16 | main_switch to the VBAT splice | 1 | 100 | 0 | 40 | 0 | 60 | 4.8 mm quick-connect tabs / lever clamp | - |
| C17 | VBAT to controller | 2 | 185 | 81.6 | 40 | 0 | 60 | lever clamp / 15-pin 2.54 mm male header | - |
| C18 | VBAT to servo_regulator | 2 | 190 | 89.3 | 40 | 0 | 60 | lever clamp / solder pads | - |
| C19 | VBAT to motor_driver_1 | 2 | 195 | 94.2 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C20 | VBAT to motor_driver_2 | 2 | 170 | 68.4 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C21 | controller to the 5V_LOGIC splice | 2 | 100 | 0 | 40 | 0 | 60 | 15-pin 2.54 mm male header / lever clamp | - |
| C22 | 5V_LOGIC to motor_driver_1 | 1 | 135 | 30.7 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C23 | 5V_LOGIC to motor_driver_2 | 1 | 135 | 31.9 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C24 | 5V_LOGIC to servo_driver | 2 | 280 | 175.4 | 40 | 0 | 60 | lever clamp / 6-pin 0.1 in header | - |
| C25 | 5V_LOGIC to ultrasonic | 2 | 285 | 183.8 | 40 | 0 | 60 | lever clamp / 4-pin 2.54 mm right-angle male header | - |
| C26 | servo_regulator to star_ground | 1 | 180 | 76.3 | 40 | 0 | 60 | solder pads / lever clamp | - |
| C27 | 5V_SERVO to servo_driver | 2 | 240 | 139.7 | 40 | 0 | 60 | solder pads / 2-position screw terminal | - |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C8 | neck_pan | -1.4 to 1.4 | 22 | 37.2 | 50 |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 20 AWG silicone wire | 0.6 | m | 0.5 | 0.30 | 0.519 mm2, rated 5.5 A in a bundle; 0.53 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 1.3 | m | 0.4 | 0.52 | 0.327 mm2, rated 3.5 A in a bundle; 1.11 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 5.6 | m | 0.35 | 1.96 | 0.205 mm2, rated 1.75 A in a bundle; 5.01 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 6.7 | m | 0.3 | 2.01 | 0.128 mm2, rated 1.1 A in a bundle; 6.02 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 70 | pc | 0.02 | 1.40 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 24 | pc | 0.02 | 0.48 | one per cable end | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 2 | pc | 0.03 | 0.06 | rated 17.5 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 2.5 | m | 0.2 | 0.50 | 29 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 31 | pc | 0.02 | 0.62 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 7.9 mm panel hole, 4.8 mm bore | 1 | pc | 0.08 | 0.08 | 8 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 0.2 | m | 0.4 | 0.08 | over every cable where it crosses a joint | estimated |
| 4 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 2 | pc | 0.25 | 0.50 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Arduino Nano compatible board | estimated | estimated | estimated | estimated |
| Half-size solderless breadboard, 400 points, adhesive back | estimated | estimated | estimated | estimated |
| LM2596S adjustable buck module | [datasheet](https://cdn.shopify.com/s/files/1/1509/1638/files/AZ-LM2596S_datasheet.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/1509/1638/files/AZ-LM2596S_datasheet.pdf) | estimated | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| HC-SR04 ultrasonic distance sensor | [datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf) | [datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf) | [datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf) | estimated |
| TowerPro SG90 micro servo | [datasheet](https://docs.m5stack.com/en/accessory/SG90_Servo) | estimated | [datasheet](https://docs.m5stack.com/en/accessory/SG90_Servo) | [datasheet](https://www.towerpro.com.tw/product/sg90-7/) |
| 2S 18650 pack: two 2500 mAh 20 A cells | [datasheet](https://www.akkuman.de/shop/mediafiles/PDF/18650%20Lithium/samsung%20inr18650-25r%2036v%202550mah%208c%2020a.pdf) | [datasheet](https://www.akkuman.de/shop/mediafiles/PDF/18650%20Lithium/samsung%20inr18650-25r%2036v%202550mah%208c%2020a.pdf) | estimated | estimated |
| PCA9685 16-channel PWM servo driver board | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) |
| KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC | estimated | estimated | estimated | estimated |
| TB6612FNG dual DC motor driver module | [datasheet](https://cdn-shop.adafruit.com/datasheets/TB6612FNG_datasheet_en_20121101.pdf) | [datasheet](https://cdn-shop.adafruit.com/datasheets/TB6612FNG_datasheet_en_20121101.pdf) | [datasheet](https://learn.sparkfun.com/tutorials/tb6612fng-hookup-guide/all) | [datasheet](https://learn.sparkfun.com/tutorials/tb6612fng-hookup-guide/all) |
| TT gear motor 3-6 V, 1:48, 200 rpm | [datasheet](https://www.adafruit.com/product/3777) | estimated | estimated | [datasheet](https://www.adafruit.com/product/3777) |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |

## Notes

- Board to board wires on the breadboard are jumper wires in the rows of the two pins; the cut list length is the most a jumper needs.
