# Wiring: wall_e

37 cables, 77 conductors, 21.93 m of wire, wiring parts $13.37.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 7.2 | main_switch | 20 / 100 | 3.041 / 7.441 | 6.6x | 4 | 0.058 |
| 5V_LOGIC | 5 | controller | 0.2 / 0.4 | 0.029 / 0.029 | 6.9x | - | 0.001 |
| 5V_SERVO | 5 | servo_regulator | 2 / 3 | 0.81 / 2.61 | 2.5x | - | 0.066 |
| 5V_ARMS | 5 | arm_regulator | 2 / 3 | 0.9 / 2.7 | 2.2x | - | 0.044 |

**VBAT loads** (peak assumes two motors stalling at once, the rest running):

| Load | Typical A | Peak A |
|---|--:|--:|
| controller | 0.024 | 0.024 |
| servo_regulator | 0.662 | 2.132 |
| arm_regulator | 0.735 | 2.206 |
| motor_driver_1 | 0.81 | 3.01 |
| motor_driver_2 | 0.81 | 3.01 |

**5V_LOGIC loads** (peak assumes every load at its peak at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| motor_driver_1 | 0.002 | 0.002 |
| motor_driver_2 | 0.002 | 0.002 |
| servo_driver | 0.01 | 0.01 |
| ultrasonic | 0.015 | 0.015 |

**5V_SERVO loads** (peak assumes every servo on it stalled at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| servo_driver | 0.81 | 2.61 |

**5V_ARMS loads** (peak assumes every servo on it stalled at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| left_arm_servo | 0.25 | 0.7 |
| right_arm_servo | 0.25 | 0.7 |
| left_elbow_servo | 0.2 | 0.65 |
| right_elbow_servo | 0.2 | 0.65 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 4 A ATM blade fuse, inline holder, protects everything on VBAT (20 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch controller (22 AWG).
- Fuse **F3**: 2 A ATM blade fuse, inline holder, protects branch servo_regulator (22 AWG).
- Fuse **F4**: 2 A ATM blade fuse, inline holder, protects branch arm_regulator (22 AWG).
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
| C9 | W29 | SERVO2_PWM | servo_driver.PWM2 | left_hand_servo.Signal (yellow) | 26 | yellow | 0.02 | 0.02 |
| C9 | W30 | SERVO2_V | servo_driver.V+ | left_hand_servo.V+ (red) | 24 | red | 0.2 | 0.65 |
| C9 | W31 | GND | servo_driver.GND | left_hand_servo.GND (brown) | 24 | black | 0.2 | 0.65 |
| C10 | W32 | SERVO3_PWM | servo_driver.PWM3 | right_hand_servo.Signal (yellow) | 26 | yellow | 0.02 | 0.02 |
| C10 | W33 | SERVO3_V | servo_driver.V+ | right_hand_servo.V+ (red) | 24 | red | 0.2 | 0.65 |
| C10 | W34 | GND | servo_driver.GND | right_hand_servo.GND (brown) | 24 | black | 0.2 | 0.65 |
| C11 | W35 | SERVO4_PWM | servo_driver.PWM4 | left_arm_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C12 | W36 | SERVO5_PWM | servo_driver.PWM5 | right_arm_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C13 | W37 | SERVO6_PWM | servo_driver.PWM6 | left_elbow_servo.Signal (yellow) | 26 | yellow | 0.02 | 0.02 |
| C14 | W38 | SERVO7_PWM | servo_driver.PWM7 | right_elbow_servo.Signal (yellow) | 26 | yellow | 0.02 | 0.02 |
| C15 | W39 | I2C_SDA | controller.A4/SDA | servo_driver.SDA | 26 | blue | 0.02 | 0.02 |
| C15 | W40 | I2C_SCL | controller.A5/SCL | servo_driver.SCL | 26 | yellow | 0.02 | 0.02 |
| C16 | W41 | CONTROLLER_D11 | controller.D11/MOSI | ultrasonic.Trig | 26 | violet | 0.02 | 0.02 |
| C16 | W42 | CONTROLLER_D12 | controller.D12/MISO | ultrasonic.Echo | 26 | violet | 0.02 | 0.02 |
| C17 | W43 | VBAT | battery.BAT+ | main_fuse.IN | 20 | red | 3.041 | 7.441 |
| C18 | W44 | VBAT | main_fuse.OUT | main_switch.IN | 20 | red | 3.041 | 7.441 |
| C19 | W45 | GND | battery.BAT- | star_ground.P1 | 20 | black | 3.041 | 7.441 |
| C20 | W46 | VBAT | main_switch.OUT | splice_vbat.P1 | 20 | red | 3.041 | 7.441 |
| C21 | W47 | VBAT | splice_vbat.P2 | controller.VIN | 22 | red | 0.024 | 0.024 |
| C21 | W48 | GND | star_ground.P2 | controller.GND | 24 | black | 0.024 | 0.024 |
| C22 | W49 | VBAT | splice_vbat.P2 | servo_regulator.IN+ | 22 | red | 0.662 | 2.132 |
| C22 | W50 | GND | star_ground.P2 | servo_regulator.IN- | 24 | black | 0.662 | 2.132 |
| C23 | W51 | VBAT | splice_vbat.P2 | arm_regulator.IN+ | 22 | red | 0.735 | 2.206 |
| C23 | W52 | GND | star_ground.P2 | arm_regulator.IN- | 24 | black | 0.735 | 2.206 |
| C24 | W53 | VBAT | splice_vbat.P2 | motor_driver_1.VM | 22 | red | 0.81 | 3.01 |
| C24 | W54 | GND | star_ground.P2 | motor_driver_1.GND | 22 | black | 0.81 | 3.01 |
| C25 | W55 | VBAT | splice_vbat.P2 | motor_driver_2.VM | 22 | red | 0.81 | 3.01 |
| C25 | W56 | GND | star_ground.P2 | motor_driver_2.GND | 22 | black | 0.81 | 3.01 |
| C26 | W57 | 5V_LOGIC | controller.5V | splice_5v_logic.P1 | 24 | red | 0.029 | 0.029 |
| C26 | W58 | GND | controller.GND | star_ground.P2 | 24 | black | 0.029 | 0.029 |
| C27 | W59 | 5V_LOGIC | splice_5v_logic.P2 | motor_driver_1.VCC | 24 | red | 0.002 | 0.002 |
| C28 | W60 | 5V_LOGIC | splice_5v_logic.P2 | motor_driver_2.VCC | 24 | red | 0.002 | 0.002 |
| C29 | W61 | 5V_LOGIC | splice_5v_logic.P2 | servo_driver.VCC | 24 | red | 0.01 | 0.01 |
| C29 | W62 | GND | star_ground.P2 | servo_driver.GND | 24 | black | 0.01 | 0.01 |
| C30 | W63 | 5V_LOGIC | splice_5v_logic.P2 | ultrasonic.Vcc | 24 | red | 0.015 | 0.015 |
| C30 | W64 | GND | star_ground.P2 | ultrasonic.GND | 24 | black | 0.015 | 0.015 |
| C31 | W65 | GND | servo_regulator.OUT- | star_ground.P2 | 24 | black | 0.81 | 2.61 |
| C32 | W66 | 5V_SERVO | servo_regulator.OUT+ | servo_driver.V+ | 24 | red | 0.81 | 2.61 |
| C32 | W67 | GND | star_ground.P2 | servo_driver.GND | 24 | black | 0.81 | 2.61 |
| C33 | W68 | 5V_ARMS | arm_regulator.OUT+ | splice_5v_arms.P1 | 24 | red | 0.9 | 2.7 |
| C33 | W69 | GND | arm_regulator.OUT- | star_ground.P2 | 24 | black | 0.9 | 2.7 |
| C34 | W70 | 5V_ARMS | splice_5v_arms.P2 | left_arm_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C34 | W71 | GND | star_ground.P2 | left_arm_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C35 | W72 | 5V_ARMS | splice_5v_arms.P2 | right_arm_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C35 | W73 | GND | star_ground.P2 | right_arm_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C36 | W74 | 5V_ARMS | splice_5v_arms.P2 | left_elbow_servo.V+ (red) | 24 | red | 0.2 | 0.65 |
| C36 | W75 | GND | star_ground.P2 | left_elbow_servo.GND (brown) | 24 | black | 0.2 | 0.65 |
| C37 | W76 | 5V_ARMS | splice_5v_arms.P2 | right_elbow_servo.V+ (red) | 24 | red | 0.2 | 0.65 |
| C37 | W77 | GND | star_ground.P2 | right_elbow_servo.GND (brown) | 24 | black | 0.2 | 0.65 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | controller to motor_driver_1 | 7 | 190 | 85.4 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 0.1 in header | - |
| C2 | motor_driver_1 to front_left_motor | 2 | 265 | 164.5 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | - |
| C3 | motor_driver_1 to front_right_motor | 2 | 260 | 156.3 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | - |
| C4 | controller to motor_driver_2 | 7 | 245 | 143.7 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 0.1 in header | - |
| C5 | motor_driver_2 to rear_left_motor | 2 | 190 | 89.9 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | - |
| C6 | motor_driver_2 to rear_right_motor | 2 | 235 | 132.5 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | - |
| C7 | servo_driver to neck_pan_servo | 3 | 240 | 138.4 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | - |
| C8 | servo_driver to neck_tilt_servo | 3 | 430 | 270.1 | 40 | 55 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | body_bay.neck_leads |
| C9 | servo_driver to left_hand_servo | 3 | 620 | 410.9 | 40 | 105 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | body_bay.neck_leads |
| C10 | servo_driver to right_hand_servo | 3 | 655 | 444.5 | 40 | 110 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | body_bay.neck_leads |
| C11 | servo_driver to left_arm_servo | 1 | 225 | 121.4 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | - |
| C12 | servo_driver to right_arm_servo | 1 | 245 | 144.3 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | - |
| C13 | servo_driver to left_elbow_servo | 1 | 485 | 350.7 | 40 | 30 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | body_bay.neck_leads |
| C14 | servo_driver to right_elbow_servo | 1 | 445 | 303.7 | 40 | 40 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | body_bay.neck_leads |
| C15 | controller to servo_driver | 2 | 280 | 178.9 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 6-pin 0.1 in header | - |
| C16 | controller to ultrasonic | 2 | 290 | 188 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 4-pin 2.54 mm right-angle male header | - |
| C17 | battery positive to main fuse | 1 | 155 | 52.2 | 40 | 0 | 60 | flying leads / soldered leads | - |
| C18 | main fuse to main switch | 1 | 195 | 92.1 | 40 | 0 | 60 | soldered leads / 4.8 mm quick-connect tabs | - |
| C19 | battery negative to star ground | 1 | 225 | 122.6 | 40 | 0 | 60 | flying leads / lever clamp | - |
| C20 | main_switch to the VBAT splice | 1 | 140 | 36.2 | 40 | 0 | 60 | 4.8 mm quick-connect tabs / lever clamp | - |
| C21 | VBAT to controller | 2 | 215 | 113.3 | 40 | 0 | 60 | lever clamp / 15-pin 2.54 mm male header | - |
| C22 | VBAT to servo_regulator | 2 | 210 | 107 | 40 | 0 | 60 | lever clamp / solder pads | - |
| C23 | VBAT to arm_regulator | 2 | 240 | 138.4 | 40 | 0 | 60 | lever clamp / solder pads | - |
| C24 | VBAT to motor_driver_1 | 2 | 200 | 98.4 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C25 | VBAT to motor_driver_2 | 2 | 185 | 83.2 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C26 | controller to the 5V_LOGIC splice | 2 | 205 | 104.8 | 40 | 0 | 60 | 15-pin 2.54 mm male header / lever clamp | - |
| C27 | 5V_LOGIC to motor_driver_1 | 1 | 165 | 61.4 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C28 | 5V_LOGIC to motor_driver_2 | 1 | 225 | 123.8 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C29 | 5V_LOGIC to servo_driver | 2 | 285 | 182 | 40 | 0 | 60 | lever clamp / 6-pin 0.1 in header | - |
| C30 | 5V_LOGIC to ultrasonic | 2 | 300 | 196.4 | 40 | 0 | 60 | lever clamp / 4-pin 2.54 mm right-angle male header | - |
| C31 | servo_regulator to star_ground | 1 | 175 | 71.6 | 40 | 0 | 60 | solder pads / lever clamp | - |
| C32 | 5V_SERVO to servo_driver | 2 | 250 | 146.9 | 40 | 0 | 60 | solder pads / 2-position screw terminal | - |
| C33 | arm_regulator to the 5V_ARMS splice | 2 | 240 | 138.5 | 40 | 0 | 60 | solder pads / lever clamp | - |
| C34 | 5V_ARMS to left_arm_servo | 2 | 225 | 122.8 | 40 | 0 | 60 | lever clamp / JR plug | - |
| C35 | 5V_ARMS to right_arm_servo | 2 | 225 | 120.5 | 40 | 0 | 60 | lever clamp / JR plug | - |
| C36 | 5V_ARMS to left_elbow_servo | 2 | 465 | 322.7 | 40 | 40 | 60 | lever clamp / JR plug | body_bay.neck_leads |
| C37 | 5V_ARMS to right_elbow_servo | 2 | 420 | 279.6 | 40 | 40 | 60 | lever clamp / JR plug | body_bay.neck_leads |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C8 | neck_pan | -1.4 to 1.4 | 36.4 | 56 | 55 |
| C9 | left_arm_lift | -1 to 0.494 | 36.8 | 48.8 | 45 |
| C9 | left_elbow | -1.5 to 1.252 | 52 | 74.7 | 60 |
| C10 | right_arm_lift | -0.494 to 1 | 35.9 | 44 | 40 |
| C10 | right_elbow | -1.252 to 1.5 | 46 | 76 | 70 |
| C13 | left_arm_lift | -1 to 0.494 | 32.4 | 42.2 | 30 |
| C14 | right_arm_lift | -0.494 to 1 | 29.8 | 48.4 | 40 |
| C36 | left_arm_lift | -1 to 0.494 | 36.8 | 47.9 | 40 |
| C37 | right_arm_lift | -0.494 to 1 | 27.4 | 38 | 40 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (2S 18650 pack: two 2500 mAh 20 A cells) | 18.5 | 2500 | VBAT 7.2 V | 3.041 | 41 min | 7.441 | 17 min | 2.9 C | 20 |

### Regulator heat

Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.

| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|
| controller | linear | VBAT 7.2 V | 5V_LOGIC 5 V | 0.029 / 0.029 | 0.209 | 0.145 | 0.064 / 0.064 | 69 % | 0.13 | yes |
| servo_regulator | switching | VBAT 7.2 V | 5V_SERVO 5 V | 0.81 / 2.61 | 4.766 | 4.05 | 0.716 / 2.3 | 85 % | 2.5 | yes |
| arm_regulator | switching | VBAT 7.2 V | 5V_ARMS 5 V | 0.9 / 2.7 | 5.292 | 4.5 | 0.792 / 2.383 | 85 % | 2.5 | yes |
- controller: on-board linear regulator: (Vin - Vout) x Iout.
- servo_regulator: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 2.5 W of heat.
- arm_regulator: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 2.5 W of heat.

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| CONTROLLER_D10 | A1 D10/SS | U3 PWMB | 5 | 2 | 5.7 | ok |
| CONTROLLER_D11 | A1 D11/MOSI | U6 Trig | 5 | 2 | 5.5 | ok |
| CONTROLLER_D12 | U6 Echo | A1 D12/MISO | 5 | 3 | 5.5 | ok |
| CONTROLLER_D2 | A1 D2 | U3 BIN2 | 5 | 2 | 5.7 | ok |
| CONTROLLER_D4 | A1 D4 | U2 BIN1 | 5 | 2 | 5.7 | ok |
| CONTROLLER_D5 | A1 D5 | U2 PWMA | 5 | 2 | 5.7 | ok |
| CONTROLLER_D6 | A1 D6 | U2 PWMB | 5 | 2 | 5.7 | ok |
| CONTROLLER_D7 | A1 D7 | U2 AIN1 | 5 | 2 | 5.7 | ok |
| CONTROLLER_D8 | A1 D8 | U2 AIN2 | 5 | 2 | 5.7 | ok |
| CONTROLLER_D9 | A1 D9 | U3 PWMA | 5 | 2 | 5.7 | ok |
| I2C_SCL | A1 A5/SCL | U4 SCL | 5 | 3.5 | 5.5 | ok |
| I2C_SDA | A1 A4/SDA | U4 SDA | 5 | 3.5 | 5.5 | ok |
| I2C_SDA | U4 SDA | A1 A4/SDA | 5 | 3 | 5.5 | ok |
| SERVO0_PWM | U4 PWM0 | M6 Signal | 5 | 2 | 6 | ok |
| SERVO1_PWM | U4 PWM1 | M7 Signal | 5 | 2 | 6 | ok |
| SERVO2_PWM | U4 PWM2 | M5 Signal | 5 | 2 | 6 | ok |
| SERVO3_PWM | U4 PWM3 | M12 Signal | 5 | 2 | 6 | ok |
| SERVO4_PWM | U4 PWM4 | M3 Signal | 5 | 2 | 6 | ok |
| SERVO5_PWM | U4 PWM5 | M10 Signal | 5 | 2 | 6 | ok |
| SERVO6_PWM | U4 PWM6 | M4 Signal | 5 | 2 | 6 | ok |
| SERVO7_PWM | U4 PWM7 | M11 Signal | 5 | 2 | 6 | ok |

### Sources

| Input | Source |
|---|---|
| 2S 18650 pack: two 2500 mAh 20 A cells (Samsung 25R class) in a plain two-cell holder capacity and energy | [datasheet](https://lygte-info.dk/review/batteries2012/Samsung%20INR18650-25R%202500mAh%20(Green)%20UK.html) |
| Arduino Nano compatible board (ATmega328P, CH340, USB-C) heat | estimated: 5 V x 25 mA typical; more when fed from VIN |
| LM2596S adjustable buck module (3 A, 43 x 21 mm) heat | estimated: 10 W out at about 80 %; TI: 73 % at 12 V in, 3 V out, 3 A |
| Arduino Nano compatible board (ATmega328P, CH340, USB-C) logic levels | [datasheet](https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf): ATmega328P at VCC 5 V: VIH min 0.6 VCC = 3.0 V, pins to VCC + 0.5 V. Outputs swing to VCC at light load. |
| TB6612FNG dual DC motor driver module (1.2 A per channel) logic levels | [datasheet](https://cdn-shop.adafruit.com/datasheets/TB6612FNG_datasheet_en_20121101.pdf): Control inputs: VIH 2 V min, up to VCC + 0.2 V (Toshiba electrical characteristics); 3.3 V and 5 V hosts both drive it. |
| HC-SR04 ultrasonic distance sensor (2-400 cm) logic levels | [estimated](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf): 5 V TTL module: Echo drives 5 V. The trigger threshold is not published; TTL 2 V assumed. |
| PCA9685 16-channel PWM servo driver board (generic, I2C) logic levels | [datasheet](https://cdn-shop.adafruit.com/datasheets/PCA9685.pdf): VIH 0.7 VDD on SCL/SDA; inputs are 5.5 V tolerant; LED outputs are totem pole to VDD. |
| TowerPro SG90 micro servo (nylon gears) + cross horn logic levels | [estimated](http://www.ee.ic.ac.uk/pcheung/teaching/DE1_EE/stores/sg90_datasheet.pdf): Pulse input of an analogue servo: no threshold published; 3.3 V and 5 V pulses both work in practice, 2 V assumed. |
| TowerPro MG90S micro servo (metal gears) + cross horn logic levels | estimated: Pulse input of a hobby servo: no threshold published; 2 V assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 20 AWG silicone wire | 0.8 | m | 0.5 | 0.40 | 0.519 mm2, rated 5.5 A in a bundle; 0.71 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 1.6 | m | 0.4 | 0.64 | 0.327 mm2, rated 3.5 A in a bundle; 1.38 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 11 | m | 0.35 | 3.85 | 0.205 mm2, rated 1.75 A in a bundle; 9.95 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 10 | m | 0.3 | 3.00 | 0.128 mm2, rated 1.1 A in a bundle; 9.09 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 74 | pc | 0.02 | 1.48 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 28 | pc | 0.02 | 0.56 | one per cable end | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 2 | pc | 0.03 | 0.06 | rated 17.5 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 3.6 | m | 0.2 | 0.72 | 45 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 43 | pc | 0.02 | 0.86 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 7.9 mm panel hole, 4.8 mm bore | 1 | pc | 0.08 | 0.08 | 8 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 1.4 | m | 0.4 | 0.56 | over every cable where it crosses a joint | estimated |
| 4 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 3 | pc | 0.25 | 0.75 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Arduino Nano compatible board | estimated | estimated | estimated | estimated |
| Half-size solderless breadboard, 400 points, adhesive back | estimated | estimated | estimated | estimated |
| LM2596S adjustable buck module | [datasheet](https://cdn.shopify.com/s/files/1/1509/1638/files/AZ-LM2596S_datasheet.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/1509/1638/files/AZ-LM2596S_datasheet.pdf) | estimated | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| HC-SR04 ultrasonic distance sensor | [datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf) | [datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf) | [datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf) | estimated |
| TowerPro MG90S micro servo | estimated | estimated | estimated | [datasheet](https://www.towerpro.com.tw/product/mg90s-3/) |
| TowerPro SG90 micro servo | [datasheet](https://docs.m5stack.com/en/accessory/SG90_Servo) | estimated | [datasheet](https://docs.m5stack.com/en/accessory/SG90_Servo) | [datasheet](https://www.towerpro.com.tw/product/sg90-7/) |
| 2S 18650 pack: two 2500 mAh 20 A cells | [datasheet](https://www.akkuman.de/shop/mediafiles/PDF/18650%20Lithium/samsung%20inr18650-25r%2036v%202550mah%208c%2020a.pdf) | [datasheet](https://www.akkuman.de/shop/mediafiles/PDF/18650%20Lithium/samsung%20inr18650-25r%2036v%202550mah%208c%2020a.pdf) | estimated | estimated |
| PCA9685 16-channel PWM servo driver board | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://cdn-shop.adafruit.com/datasheets/PCA9685.pdf) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) |
| KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC | estimated | estimated | estimated | estimated |
| TB6612FNG dual DC motor driver module | [datasheet](https://cdn-shop.adafruit.com/datasheets/TB6612FNG_datasheet_en_20121101.pdf) | [datasheet](https://cdn-shop.adafruit.com/datasheets/TB6612FNG_datasheet_en_20121101.pdf) | [datasheet](https://learn.sparkfun.com/tutorials/tb6612fng-hookup-guide/all) | [datasheet](https://learn.sparkfun.com/tutorials/tb6612fng-hookup-guide/all) |
| TT gear motor 3-6 V, 1:48, 200 rpm | [datasheet](https://www.adafruit.com/product/3777) | estimated | estimated | [datasheet](https://www.adafruit.com/product/3777) |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |

## Notes

- Board to board wires on the breadboard are jumper wires in the rows of the two pins; the cut list length is the most a jumper needs.
