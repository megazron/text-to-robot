# Wiring: iron_man_mark_43

45 cables, 116 conductors, 115.56 m of wire, wiring parts $69.22.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 7.2 | main_switch | 6 / 10 | 2.72 / 7.935 | 2.2x | 4 | 0.063 |
| 5V_SERVO | 5 | regulator | 2 / 3 | 0.5 / 1.4 | 4.0x | - | 0.103 |
| 5V_LIGHTS | 5 | regulator_lights | 2 / 3 | 0.72 / 2.16 | 2.8x | - | 0.135 |
| 5V_DOORS | 5 | regulator_doors | 5.5 / 8 | 2.03 / 6.03 | 2.7x | - | 0.14 |

**VBAT loads** (peak assumes every load on the 5 V rails at its peak, through the regulators):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator | 0.408 | 1.144 |
| controller | 0.065 | 0.1 |
| regulator_lights | 0.588 | 1.765 |
| regulator_doors | 1.658 | 4.926 |

**5V_SERVO loads** (peak assumes both faceplate servos stalled):

| Load | Typical A | Peak A |
|---|--:|--:|
| faceplate_servo_left | 0.25 | 0.7 |
| faceplate_servo_right | 0.25 | 0.7 |

**5V_LIGHTS loads** (peak assumes all three rings at full white):

| Load | Typical A | Peak A |
|---|--:|--:|
| arc_reactor | 0.24 | 0.72 |
| left_repulsor | 0.24 | 0.72 |
| right_repulsor | 0.24 | 0.72 |

**5V_DOORS loads** (peak assumes a left and right door stalled together, the rest idle):

| Load | Typical A | Peak A |
|---|--:|--:|
| servo_driver_left | 1.03 | 3.03 |
| servo_driver_right | 1 | 3 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 4 A ATM blade fuse, inline holder, protects everything on VBAT (20 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch regulator (22 AWG).
- Fuse **F3**: 2 A ATM blade fuse, inline holder, protects branch controller (22 AWG).
- Fuse **F4**: 2 A ATM blade fuse, inline holder, protects branch regulator_lights (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | FACEPLATE_LEFT_PWM | controller.D9 | faceplate_servo_left.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C1 | W2 | 5V_SERVO | splice_5v_servo.P2 | faceplate_servo_left.V+ (red) | 24 | red | 0.25 | 0.7 |
| C1 | W3 | GND | star_ground.P2 | faceplate_servo_left.GND (brown) | 24 | black | 0.25 | 0.7 |
| C2 | W4 | FACEPLATE_RIGHT_PWM | controller.D10/SS | faceplate_servo_right.Signal (orange) | 26 | violet | 0.02 | 0.02 |
| C2 | W5 | 5V_SERVO | splice_5v_servo.P2 | faceplate_servo_right.V+ (red) | 24 | red | 0.25 | 0.7 |
| C2 | W6 | GND | star_ground.P2 | faceplate_servo_right.GND (brown) | 24 | black | 0.25 | 0.7 |
| C3 | W7 | EYE_LED_LEFT | controller.D3 | eye_led_left.ANODE | 26 | yellow | 0.02 | 0.02 |
| C3 | W8 | GND | controller.GND | eye_led_left.CATHODE | 24 | black | 0.02 | 0.02 |
| C4 | W9 | EYE_LED_RIGHT | controller.D5 | eye_led_right.ANODE | 26 | yellow | 0.02 | 0.02 |
| C4 | W10 | GND | controller.GND | eye_led_right.CATHODE | 24 | black | 0.02 | 0.02 |
| C5 | W11 | ARC_REACTOR_DATA | controller.D6 | arc_reactor.DIN | 26 | yellow | 0.02 | 0.02 |
| C5 | W12 | 5V_LIGHTS | splice_5v_lights.P2 | arc_reactor.5V | 24 | red | 0.24 | 0.72 |
| C5 | W13 | GND | star_ground.P2 | arc_reactor.GND | 24 | black | 0.24 | 0.72 |
| C6 | W14 | LEFT_REPULSOR_DATA | controller.D7 | left_repulsor.DIN | 26 | blue | 0.02 | 0.02 |
| C6 | W15 | 5V_LIGHTS | splice_5v_lights.P2 | left_repulsor.5V | 24 | red | 0.24 | 0.72 |
| C6 | W16 | GND | star_ground.P2 | left_repulsor.GND | 24 | black | 0.24 | 0.72 |
| C7 | W17 | RIGHT_REPULSOR_DATA | controller.D8 | right_repulsor.DIN | 26 | blue | 0.02 | 0.02 |
| C7 | W18 | 5V_LIGHTS | splice_5v_lights.P2 | right_repulsor.5V | 24 | red | 0.24 | 0.72 |
| C7 | W19 | GND | star_ground.P2 | right_repulsor.GND | 24 | black | 0.24 | 0.72 |
| C8 | W20 | I2C_SDA_LEFT | controller.A4/SDA | servo_driver_left.SDA | 26 | blue | 0.02 | 0.02 |
| C8 | W21 | I2C_SCL_LEFT | controller.A5/SCL | servo_driver_left.SCL | 26 | yellow | 0.02 | 0.02 |
| C8 | W22 | LOGIC_5V_LEFT | controller.5V | servo_driver_left.VCC | 24 | red | 0.01 | 0.01 |
| C9 | W23 | BACK_LEFT_SERVO_PWM | servo_driver_left.PWM0 | back_left_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C9 | W24 | 5V_DOORS | servo_driver_left.V+ | back_left_servo.V+ (red) | 24 | red | 0.8 | 2.9 |
| C9 | W25 | GND | servo_driver_left.GND | back_left_servo.GND (brown) | 24 | black | 0.8 | 2.9 |
| C10 | W26 | HELMET_LEFT_SERVO_PWM | servo_driver_left.PWM1 | helmet_left_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C10 | W27 | 5V_DOORS | servo_driver_left.V+ | helmet_left_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C10 | W28 | GND | servo_driver_left.GND | helmet_left_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C11 | W29 | LEFT_UPPER_ARM_SERVO_PWM | servo_driver_left.PWM2 | left_upper_arm_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C11 | W30 | 5V_DOORS | servo_driver_left.V+ | left_upper_arm_servo.V+ (red) | 20 | red | 0.9 | 2.5 |
| C11 | W31 | GND | servo_driver_left.GND | left_upper_arm_servo.GND (brown) | 20 | black | 0.9 | 2.5 |
| C12 | W32 | LEFT_FOREARM_SERVO_PWM | servo_driver_left.PWM3 | left_forearm_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C12 | W33 | 5V_DOORS | servo_driver_left.V+ | left_forearm_servo.V+ (red) | 20 | red | 0.9 | 2.5 |
| C12 | W34 | GND | servo_driver_left.GND | left_forearm_servo.GND (brown) | 20 | black | 0.9 | 2.5 |
| C13 | W35 | LEFT_THIGH_SERVO_PWM | servo_driver_left.PWM4 | left_thigh_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C13 | W36 | 5V_DOORS | servo_driver_left.V+ | left_thigh_servo.V+ (red) | 22 | red | 0.9 | 2.5 |
| C13 | W37 | GND | servo_driver_left.GND | left_thigh_servo.GND (brown) | 22 | black | 0.9 | 2.5 |
| C14 | W38 | LEFT_SHIN_SERVO_PWM | servo_driver_left.PWM5 | left_shin_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C14 | W39 | 5V_DOORS | servo_driver_left.V+ | left_shin_servo.V+ (red) | 20 | red | 0.9 | 2.5 |
| C14 | W40 | GND | servo_driver_left.GND | left_shin_servo.GND (brown) | 20 | black | 0.9 | 2.5 |
| C15 | W41 | LATCH_BACK_LEFT_0_SERVO_PWM | servo_driver_left.PWM6 | latch_back_left_0_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C15 | W42 | 5V_DOORS | servo_driver_left.V+ | latch_back_left_0_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C15 | W43 | GND | servo_driver_left.GND | latch_back_left_0_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C16 | W44 | LATCH_BACK_LEFT_1_SERVO_PWM | servo_driver_left.PWM7 | latch_back_left_1_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C16 | W45 | 5V_DOORS | servo_driver_left.V+ | latch_back_left_1_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C16 | W46 | GND | servo_driver_left.GND | latch_back_left_1_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C17 | W47 | LATCH_HELMET_LEFT_0_SERVO_PWM | servo_driver_left.PWM8 | latch_helmet_left_0_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C17 | W48 | 5V_DOORS | servo_driver_left.V+ | latch_helmet_left_0_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C17 | W49 | GND | servo_driver_left.GND | latch_helmet_left_0_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C18 | W50 | LATCH_LEFT_UPPER_ARM_0_SERVO_PWM | servo_driver_left.PWM9 | latch_left_upper_arm_0_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C18 | W51 | 5V_DOORS | servo_driver_left.V+ | latch_left_upper_arm_0_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C18 | W52 | GND | servo_driver_left.GND | latch_left_upper_arm_0_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C19 | W53 | LATCH_LEFT_FOREARM_0_SERVO_PWM | servo_driver_left.PWM10 | latch_left_forearm_0_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C19 | W54 | 5V_DOORS | servo_driver_left.V+ | latch_left_forearm_0_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C19 | W55 | GND | servo_driver_left.GND | latch_left_forearm_0_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C20 | W56 | LATCH_LEFT_THIGH_0_SERVO_PWM | servo_driver_left.PWM11 | latch_left_thigh_0_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C20 | W57 | 5V_DOORS | servo_driver_left.V+ | latch_left_thigh_0_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C20 | W58 | GND | servo_driver_left.GND | latch_left_thigh_0_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C21 | W59 | LATCH_LEFT_SHIN_0_SERVO_PWM | servo_driver_left.PWM12 | latch_left_shin_0_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C21 | W60 | 5V_DOORS | servo_driver_left.V+ | latch_left_shin_0_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C21 | W61 | GND | servo_driver_left.GND | latch_left_shin_0_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C22 | W62 | I2C_SDA_RIGHT | controller.A4/SDA | servo_driver_right.SDA | 26 | blue | 0.02 | 0.02 |
| C22 | W63 | I2C_SCL_RIGHT | controller.A5/SCL | servo_driver_right.SCL | 26 | yellow | 0.02 | 0.02 |
| C22 | W64 | LOGIC_5V_RIGHT | controller.5V | servo_driver_right.VCC | 24 | red | 0.01 | 0.01 |
| C23 | W65 | BACK_RIGHT_SERVO_PWM | servo_driver_right.PWM0 | back_right_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C23 | W66 | 5V_DOORS | servo_driver_right.V+ | back_right_servo.V+ (red) | 24 | red | 0.8 | 2.9 |
| C23 | W67 | GND | servo_driver_right.GND | back_right_servo.GND (brown) | 24 | black | 0.8 | 2.9 |
| C24 | W68 | HELMET_RIGHT_SERVO_PWM | servo_driver_right.PWM1 | helmet_right_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C24 | W69 | 5V_DOORS | servo_driver_right.V+ | helmet_right_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C24 | W70 | GND | servo_driver_right.GND | helmet_right_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C25 | W71 | RIGHT_UPPER_ARM_SERVO_PWM | servo_driver_right.PWM2 | right_upper_arm_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C25 | W72 | 5V_DOORS | servo_driver_right.V+ | right_upper_arm_servo.V+ (red) | 22 | red | 0.9 | 2.5 |
| C25 | W73 | GND | servo_driver_right.GND | right_upper_arm_servo.GND (brown) | 22 | black | 0.9 | 2.5 |
| C26 | W74 | RIGHT_FOREARM_SERVO_PWM | servo_driver_right.PWM3 | right_forearm_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C26 | W75 | 5V_DOORS | servo_driver_right.V+ | right_forearm_servo.V+ (red) | 20 | red | 0.9 | 2.5 |
| C26 | W76 | GND | servo_driver_right.GND | right_forearm_servo.GND (brown) | 20 | black | 0.9 | 2.5 |
| C27 | W77 | RIGHT_THIGH_SERVO_PWM | servo_driver_right.PWM4 | right_thigh_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C27 | W78 | 5V_DOORS | servo_driver_right.V+ | right_thigh_servo.V+ (red) | 22 | red | 0.9 | 2.5 |
| C27 | W79 | GND | servo_driver_right.GND | right_thigh_servo.GND (brown) | 22 | black | 0.9 | 2.5 |
| C28 | W80 | RIGHT_SHIN_SERVO_PWM | servo_driver_right.PWM5 | right_shin_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C28 | W81 | 5V_DOORS | servo_driver_right.V+ | right_shin_servo.V+ (red) | 20 | red | 0.9 | 2.5 |
| C28 | W82 | GND | servo_driver_right.GND | right_shin_servo.GND (brown) | 20 | black | 0.9 | 2.5 |
| C29 | W83 | LATCH_RIGHT_UPPER_ARM_0_SERVO_PWM | servo_driver_right.PWM6 | latch_right_upper_arm_0_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C29 | W84 | 5V_DOORS | servo_driver_right.V+ | latch_right_upper_arm_0_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C29 | W85 | GND | servo_driver_right.GND | latch_right_upper_arm_0_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C30 | W86 | LATCH_RIGHT_FOREARM_0_SERVO_PWM | servo_driver_right.PWM7 | latch_right_forearm_0_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C30 | W87 | 5V_DOORS | servo_driver_right.V+ | latch_right_forearm_0_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C30 | W88 | GND | servo_driver_right.GND | latch_right_forearm_0_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C31 | W89 | LATCH_RIGHT_THIGH_0_SERVO_PWM | servo_driver_right.PWM8 | latch_right_thigh_0_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C31 | W90 | 5V_DOORS | servo_driver_right.V+ | latch_right_thigh_0_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C31 | W91 | GND | servo_driver_right.GND | latch_right_thigh_0_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C32 | W92 | LATCH_RIGHT_SHIN_0_SERVO_PWM | servo_driver_right.PWM9 | latch_right_shin_0_servo.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C32 | W93 | 5V_DOORS | servo_driver_right.V+ | latch_right_shin_0_servo.V+ (red) | 24 | red | 0.25 | 0.7 |
| C32 | W94 | GND | servo_driver_right.GND | latch_right_shin_0_servo.GND (brown) | 24 | black | 0.25 | 0.7 |
| C33 | W95 | VBAT | battery.BAT+ | main_fuse.IN | 20 | red | 2.72 | 7.935 |
| C34 | W96 | VBAT | main_fuse.OUT | main_switch.IN | 20 | red | 2.72 | 7.935 |
| C35 | W97 | GND | battery.BAT- | star_ground.P1 | 20 | black | 2.72 | 7.935 |
| C36 | W98 | VBAT | main_switch.OUT | splice_vbat.P1 | 20 | red | 2.72 | 7.935 |
| C37 | W99 | VBAT | splice_vbat.P2 | regulator.IN+ | 22 | red | 0.408 | 1.144 |
| C37 | W100 | GND | star_ground.P2 | regulator.IN- | 24 | black | 0.408 | 1.144 |
| C38 | W101 | VBAT | splice_vbat.P2 | controller.VIN | 22 | red | 0.065 | 0.1 |
| C38 | W102 | GND | star_ground.P2 | controller.GND | 24 | black | 0.065 | 0.1 |
| C39 | W103 | VBAT | splice_vbat.P2 | regulator_lights.IN+ | 22 | red | 0.588 | 1.765 |
| C39 | W104 | GND | star_ground.P2 | regulator_lights.IN- | 24 | black | 0.588 | 1.765 |
| C40 | W105 | VBAT | splice_vbat.P2 | regulator_doors.VIN | 22 | red | 1.658 | 4.926 |
| C40 | W106 | GND | star_ground.P2 | regulator_doors.GND | 22 | black | 1.658 | 4.926 |
| C41 | W107 | 5V_SERVO | regulator.OUT+ | splice_5v_servo.P1 | 24 | red | 0.5 | 1.4 |
| C41 | W108 | GND | regulator.OUT- | star_ground.P2 | 24 | black | 0.5 | 1.4 |
| C42 | W109 | 5V_LIGHTS | regulator_lights.OUT+ | splice_5v_lights.P1 | 24 | red | 0.72 | 2.16 |
| C42 | W110 | GND | regulator_lights.OUT- | star_ground.P2 | 24 | black | 0.72 | 2.16 |
| C43 | W111 | 5V_DOORS | regulator_doors.VOUT | splice_5v_doors.P1 | 20 | red | 2.03 | 6.03 |
| C43 | W112 | GND | regulator_doors.GND | star_ground.P2 | 20 | black | 2.03 | 6.03 |
| C44 | W113 | 5V_DOORS | splice_5v_doors.P2 | servo_driver_left.V+ | 20 | red | 1.03 | 3.03 |
| C44 | W114 | GND | star_ground.P2 | servo_driver_left.GND | 20 | black | 1.03 | 3.03 |
| C45 | W115 | 5V_DOORS | splice_5v_doors.P2 | servo_driver_right.V+ | 18 | red | 1 | 3 |
| C45 | W116 | GND | star_ground.P2 | servo_driver_right.GND | 18 | black | 1 | 3 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | 5V_SERVO to faceplate_servo_left | 3 | 1455 | 1061.1 | 40 | 290 | 60 | 15-pin 2.54 mm male header / JR plug | back_bay.leads_1 |
| C2 | 5V_SERVO to faceplate_servo_right | 3 | 1295 | 904.3 | 40 | 290 | 60 | 15-pin 2.54 mm male header / JR plug | back_bay.leads_1 |
| C3 | controller to eye_led_left | 2 | 1555 | 1114.2 | 40 | 340 | 60 | 15-pin 2.54 mm male header / 2 axial leads | back_bay.leads_2 |
| C4 | controller to eye_led_right | 2 | 1685 | 1242.1 | 40 | 340 | 60 | 15-pin 2.54 mm male header / 2 axial leads | back_bay.leads_2 |
| C5 | 5V_LIGHTS to arc_reactor | 3 | 880 | 639 | 40 | 140 | 60 | 15-pin 2.54 mm male header / 4 solder pads on the back | back_bay.leads_3 |
| C6 | 5V_LIGHTS to left_repulsor | 3 | 1640 | 1013.5 | 40 | 525 | 60 | 15-pin 2.54 mm male header / 4 solder pads on the back | back_bay.leads_3 |
| C7 | 5V_LIGHTS to right_repulsor | 3 | 1855 | 1262.6 | 40 | 490 | 60 | 15-pin 2.54 mm male header / 4 solder pads on the back | back_bay.leads_4 |
| C8 | controller to servo_driver_left | 3 | 980 | 736.1 | 40 | 140 | 60 | 15-pin 2.54 mm male header / 6-pin 0.1 in header | back_bay.leads_4 + drive_left.leads |
| C9 | servo_driver_left to back_left_servo | 3 | 340 | 236.8 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR universal 3-pin 2.54 mm female | drive_left.leads |
| C10 | servo_driver_left to helmet_left_servo | 3 | 1435 | 1140.8 | 40 | 190 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_left.leads |
| C11 | servo_driver_left to left_upper_arm_servo | 3 | 990 | 734 | 40 | 155 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | drive_left.leads |
| C12 | servo_driver_left to left_forearm_servo | 3 | 1355 | 1061.1 | 40 | 190 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | drive_left.leads |
| C13 | servo_driver_left to left_thigh_servo | 3 | 685 | 534.7 | 40 | 50 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | drive_left.leads |
| C14 | servo_driver_left to left_shin_servo | 3 | 1355 | 1059.5 | 40 | 195 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | drive_left.leads |
| C15 | servo_driver_left to latch_back_left_0_servo | 3 | 805 | 575.2 | 40 | 125 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_left.leads |
| C16 | servo_driver_left to latch_back_left_1_servo | 3 | 840 | 612.1 | 40 | 125 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_left.leads |
| C17 | servo_driver_left to latch_helmet_left_0_servo | 3 | 1630 | 1261.2 | 40 | 265 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_left.leads |
| C18 | servo_driver_left to latch_left_upper_arm_0_servo | 3 | 915 | 659.2 | 40 | 155 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_left.leads |
| C19 | servo_driver_left to latch_left_forearm_0_servo | 3 | 1310 | 1015.6 | 40 | 190 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_left.leads |
| C20 | servo_driver_left to latch_left_thigh_0_servo | 3 | 835 | 684 | 40 | 50 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_left.leads |
| C21 | servo_driver_left to latch_left_shin_0_servo | 3 | 1465 | 1165.2 | 40 | 195 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_left.leads |
| C22 | controller to servo_driver_right | 3 | 1350 | 1109 | 40 | 140 | 60 | 15-pin 2.54 mm male header / 6-pin 0.1 in header | back_bay.leads_5 + drive_right.leads |
| C23 | servo_driver_right to back_right_servo | 3 | 285 | 184.9 | 40 | 0 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR universal 3-pin 2.54 mm female | drive_right.leads |
| C24 | servo_driver_right to helmet_right_servo | 3 | 1620 | 1327.9 | 40 | 190 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_right.leads |
| C25 | servo_driver_right to right_upper_arm_servo | 3 | 845 | 571.6 | 40 | 170 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | drive_right.leads |
| C26 | servo_driver_right to right_forearm_servo | 3 | 1205 | 898.7 | 40 | 205 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | drive_right.leads |
| C27 | servo_driver_right to right_thigh_servo | 3 | 730 | 577.9 | 40 | 50 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | drive_right.leads |
| C28 | servo_driver_right to right_shin_servo | 3 | 1400 | 1102.7 | 40 | 195 | 60 | 3-pin 0.1 in header row (3x4 groups) / 3-pin S-type female header | drive_right.leads |
| C29 | servo_driver_right to latch_right_upper_arm_0_servo | 3 | 770 | 496.5 | 40 | 170 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_right.leads |
| C30 | servo_driver_right to latch_right_forearm_0_servo | 3 | 1160 | 853.3 | 40 | 205 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_right.leads |
| C31 | servo_driver_right to latch_right_thigh_0_servo | 3 | 880 | 727.4 | 40 | 50 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_right.leads |
| C32 | servo_driver_right to latch_right_shin_0_servo | 3 | 1505 | 1208.3 | 40 | 195 | 60 | 3-pin 0.1 in header row (3x4 groups) / JR plug | drive_right.leads |
| C33 | battery positive to main fuse | 1 | 200 | 98.3 | 40 | 0 | 60 | flying leads / soldered leads | - |
| C34 | main fuse to main switch | 1 | 150 | 46 | 40 | 0 | 60 | soldered leads / 4.8 mm quick-connect tabs | - |
| C35 | battery negative to star ground | 1 | 200 | 98.3 | 40 | 0 | 60 | flying leads / lever clamp | - |
| C36 | main_switch to the VBAT splice | 1 | 150 | 46 | 40 | 0 | 60 | 4.8 mm quick-connect tabs / lever clamp | - |
| C37 | VBAT to regulator | 2 | 210 | 109.1 | 40 | 0 | 60 | lever clamp / solder pads | - |
| C38 | VBAT to controller | 2 | 100 | 0 | 40 | 0 | 60 | lever clamp / 15-pin 2.54 mm male header | - |
| C39 | VBAT to regulator_lights | 2 | 160 | 58.5 | 40 | 0 | 60 | lever clamp / solder pads | - |
| C40 | VBAT to regulator_doors | 2 | 160 | 55.8 | 40 | 0 | 60 | lever clamp / 0.1 in through holes | - |
| C41 | regulator to the 5V_SERVO splice | 2 | 210 | 109.1 | 40 | 0 | 60 | solder pads / lever clamp | - |
| C42 | regulator_lights to the 5V_LIGHTS splice | 2 | 160 | 58.5 | 40 | 0 | 60 | solder pads / lever clamp | - |
| C43 | regulator_doors to the 5V_DOORS splice | 2 | 160 | 55.8 | 40 | 0 | 60 | 0.1 in through holes / lever clamp | - |
| C44 | 5V_DOORS to servo_driver_left | 2 | 965 | 728.9 | 40 | 135 | 60 | lever clamp / 2-position screw terminal | back_bay.leads_2 + drive_left.leads |
| C45 | 5V_DOORS to servo_driver_right | 2 | 1345 | 1109 | 40 | 135 | 60 | lever clamp / 2-position screw terminal | back_bay.leads_5 + drive_right.leads |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C1 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 140 |
| C1 | neck | -1.2 to 1.2 | 367.5 | 417.3 | 150 |
| C2 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 140 |
| C2 | neck | -1.2 to 1.2 | 367.5 | 417.3 | 150 |
| C3 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 135 |
| C3 | neck | -1.2 to 1.2 | 367.5 | 417.3 | 145 |
| C3 | faceplate | -1 to 0 | 71.1 | 99 | 60 |
| C4 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 135 |
| C4 | neck | -1.2 to 1.2 | 367.5 | 417.3 | 145 |
| C4 | faceplate | -1 to 0 | 71.1 | 99 | 60 |
| C5 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 140 |
| C6 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 140 |
| C6 | left_shoulder | -1 to 0.2 | 141.4 | 296.7 | 310 |
| C6 | left_elbow | -1.95 to 0 | 73.9 | 73.9 | 35 |
| C7 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 140 |
| C7 | right_shoulder | -1 to 0.2 | 275.5 | 399.8 | 275 |
| C7 | right_elbow | -1.95 to 0 | 73.8 | 73.8 | 35 |
| C8 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 140 |
| C10 | neck | -1.2 to 1.2 | 169.9 | 254.9 | 190 |
| C11 | left_shoulder | -1 to 0.2 | 76.8 | 96.2 | 155 |
| C12 | left_shoulder | -1 to 0.2 | 76.8 | 96.2 | 155 |
| C12 | left_elbow | -1.95 to 0 | 73.9 | 73.9 | 35 |
| C13 | left_hip | -1 to 0.2 | 143.3 | 157.3 | 50 |
| C14 | left_hip | -1 to 0.2 | 143.3 | 157.3 | 50 |
| C14 | left_knee | 0 to 1.75 | 83.3 | 180.2 | 145 |
| C15 | back_door_left_hinge | -1.396 to 0 | 122.4 | 201.7 | 125 |
| C16 | back_door_left_hinge | -1.396 to 0 | 122.4 | 201.7 | 125 |
| C17 | neck | -1.2 to 1.2 | 169.9 | 254.9 | 190 |
| C17 | helmet_door_left_hinge | -1.396 to 0 | 59.2 | 97.1 | 75 |
| C18 | left_shoulder | -1 to 0.2 | 76.8 | 96.2 | 155 |
| C19 | left_shoulder | -1 to 0.2 | 76.8 | 96.2 | 155 |
| C19 | left_elbow | -1.95 to 0 | 73.9 | 73.9 | 35 |
| C20 | left_hip | -1 to 0.2 | 143.3 | 157.3 | 50 |
| C21 | left_hip | -1 to 0.2 | 143.3 | 157.3 | 50 |
| C21 | left_knee | 0 to 1.75 | 83.3 | 180.2 | 145 |
| C22 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 140 |
| C24 | neck | -1.2 to 1.2 | 169.9 | 254.9 | 190 |
| C25 | right_shoulder | -1 to 0.2 | 61.8 | 93.3 | 170 |
| C26 | right_shoulder | -1 to 0.2 | 61.8 | 93.3 | 170 |
| C26 | right_elbow | -1.95 to 0 | 73.8 | 73.8 | 35 |
| C27 | right_hip | -1 to 0.2 | 143 | 157 | 50 |
| C28 | right_hip | -1 to 0.2 | 143 | 157 | 50 |
| C28 | right_knee | 0 to 1.75 | 83.4 | 179.9 | 145 |
| C29 | right_shoulder | -1 to 0.2 | 61.8 | 93.3 | 170 |
| C30 | right_shoulder | -1 to 0.2 | 61.8 | 93.3 | 170 |
| C30 | right_elbow | -1.95 to 0 | 73.8 | 73.8 | 35 |
| C31 | right_hip | -1 to 0.2 | 143 | 157 | 50 |
| C32 | right_hip | -1 to 0.2 | 143 | 157 | 50 |
| C32 | right_knee | 0 to 1.75 | 83.4 | 179.9 | 145 |
| C44 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 135 |
| C45 | back_door_left_hinge | -1.396 to 0 | 0 | 93.7 | 135 |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (2S 18650 pack: two 2500 mAh 20 A cells) | 18.5 | 2500 | VBAT 7.2 V | 2.72 | 45 min | 7.935 | 16 min | 3.09 C | 20 |

### Regulator heat

Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.

| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|
| regulator | switching | VBAT 7.2 V | 5V_SERVO 5 V | 0.5 / 1.4 | 2.938 | 2.5 | 0.438 / 1.237 | 85 % | 2.5 | yes |
| regulator_lights | switching | VBAT 7.2 V | 5V_LIGHTS 5 V | 0.72 / 2.16 | 4.234 | 3.6 | 0.634 / 1.908 | 85 % | 2.5 | yes |
| regulator_doors | switching | VBAT 7.2 V | 5V_DOORS 5 V | 2.03 / 6.03 | 11.938 | 10.15 | 1.788 / 5.317 | 85 % | 3 | yes |
- regulator: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 2.5 W of heat.
- regulator_lights: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 2.5 W of heat.
- regulator_doors: input from the VBAT budget at the converter efficiency the budget assumes; the part is rated for about 3 W of heat.

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| ARC_REACTOR_DATA | A1 D6 | U1 DIN | 5 | 3.5 | 5.5 | ok |
| BACK_LEFT_SERVO_PWM | U7 PWM0 | M1 Signal | 5 | 2 | 6.8 | ok |
| BACK_RIGHT_SERVO_PWM | U8 PWM0 | M2 Signal | 5 | 2 | 6.8 | ok |
| FACEPLATE_LEFT_PWM | A1 D9 | M3 Signal | 5 | 2 | 6 | ok |
| FACEPLATE_RIGHT_PWM | A1 D10/SS | M4 Signal | 5 | 2 | 6 | ok |
| HELMET_LEFT_SERVO_PWM | U7 PWM1 | M5 Signal | 5 | 2 | 6 | ok |
| HELMET_RIGHT_SERVO_PWM | U8 PWM1 | M6 Signal | 5 | 2 | 6 | ok |
| I2C_SCL_LEFT | A1 A5/SCL | U7 SCL | 5 | 3.5 | 5.5 | ok |
| I2C_SCL_LEFT | A1 A5/SCL | U8 SCL | 5 | 3.5 | 5.5 | ok |
| I2C_SDA_LEFT | A1 A4/SDA | U7 SDA | 5 | 3.5 | 5.5 | ok |
| I2C_SDA_LEFT | A1 A4/SDA | U8 SDA | 5 | 3.5 | 5.5 | ok |
| I2C_SDA_LEFT | U7 SDA | A1 A4/SDA | 5 | 3 | 5.5 | ok |
| I2C_SDA_LEFT | U8 SDA | A1 A4/SDA | 5 | 3 | 5.5 | ok |
| LATCH_BACK_LEFT_0_SERVO_PWM | U7 PWM6 | M7 Signal | 5 | 2 | 6 | ok |
| LATCH_BACK_LEFT_1_SERVO_PWM | U7 PWM7 | M8 Signal | 5 | 2 | 6 | ok |
| LATCH_HELMET_LEFT_0_SERVO_PWM | U7 PWM8 | M9 Signal | 5 | 2 | 6 | ok |
| LATCH_LEFT_FOREARM_0_SERVO_PWM | U7 PWM10 | M10 Signal | 5 | 2 | 6 | ok |
| LATCH_LEFT_SHIN_0_SERVO_PWM | U7 PWM12 | M11 Signal | 5 | 2 | 6 | ok |
| LATCH_LEFT_THIGH_0_SERVO_PWM | U7 PWM11 | M12 Signal | 5 | 2 | 6 | ok |
| LATCH_LEFT_UPPER_ARM_0_SERVO_PWM | U7 PWM9 | M13 Signal | 5 | 2 | 6 | ok |
| LATCH_RIGHT_FOREARM_0_SERVO_PWM | U8 PWM7 | M14 Signal | 5 | 2 | 6 | ok |
| LATCH_RIGHT_SHIN_0_SERVO_PWM | U8 PWM9 | M15 Signal | 5 | 2 | 6 | ok |
| LATCH_RIGHT_THIGH_0_SERVO_PWM | U8 PWM8 | M16 Signal | 5 | 2 | 6 | ok |
| LATCH_RIGHT_UPPER_ARM_0_SERVO_PWM | U8 PWM6 | M17 Signal | 5 | 2 | 6 | ok |
| LEFT_FOREARM_SERVO_PWM | U7 PWM3 | M18 Signal | 5 | 2 | 7.2 | ok |
| LEFT_REPULSOR_DATA | A1 D7 | U2 DIN | 5 | 3.5 | 5.5 | ok |
| LEFT_SHIN_SERVO_PWM | U7 PWM5 | M19 Signal | 5 | 2 | 7.2 | ok |
| LEFT_THIGH_SERVO_PWM | U7 PWM4 | M20 Signal | 5 | 2 | 7.2 | ok |
| LEFT_UPPER_ARM_SERVO_PWM | U7 PWM2 | M21 Signal | 5 | 2 | 7.2 | ok |
| RIGHT_FOREARM_SERVO_PWM | U8 PWM3 | M22 Signal | 5 | 2 | 7.2 | ok |
| RIGHT_REPULSOR_DATA | A1 D8 | U6 DIN | 5 | 3.5 | 5.5 | ok |
| RIGHT_SHIN_SERVO_PWM | U8 PWM5 | M23 Signal | 5 | 2 | 7.2 | ok |
| RIGHT_THIGH_SERVO_PWM | U8 PWM4 | M24 Signal | 5 | 2 | 7.2 | ok |
| RIGHT_UPPER_ARM_SERVO_PWM | U8 PWM2 | M25 Signal | 5 | 2 | 7.2 | ok |

### Sources

| Input | Source |
|---|---|
| 2S 18650 pack: two 2500 mAh 20 A cells (Samsung 25R class) in a plain two-cell holder capacity and energy | [datasheet](https://lygte-info.dk/review/batteries2012/Samsung%20INR18650-25R%202500mAh%20(Green)%20UK.html) |
| LM2596S adjustable buck module (3 A, 43 x 21 mm) heat | estimated: 10 W out at about 80 %; TI: 73 % at 12 V in, 3 V out, 3 A |
| Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) heat | estimated: 27.5 W out at about 90 % (Pololu range 80-95 %) |
| Arduino Nano compatible board (ATmega328P, CH340, USB-C) logic levels | [datasheet](https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf): ATmega328P at VCC 5 V: VIH min 0.6 VCC = 3.0 V, pins to VCC + 0.5 V. Outputs swing to VCC at light load. |
| WS2812B RGB LED ring, 12 LEDs, 37 mm (NeoPixel-compatible) logic levels | [datasheet](https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf): DIN high level 0.7 VDD; at 5 V that is 3.5 V, above a 3.3 V host's output. |
| PCA9685 16-channel PWM servo driver board (generic, I2C) logic levels | [datasheet](https://cdn-shop.adafruit.com/datasheets/PCA9685.pdf): VIH 0.7 VDD on SCL/SDA; inputs are 5.5 V tolerant; LED outputs are totem pole to VDD. |
| DSSERVO DS3218 20 kg digital servo (metal gears) + round horn logic levels | estimated: Pulse input of a hobby servo: no threshold published; 2 V assumed. |
| TowerPro MG90S micro servo (metal gears) + cross horn logic levels | estimated: Pulse input of a hobby servo: no threshold published; 2 V assumed. |
| TowerPro MG996R standard servo (metal gears) + round horn logic levels | estimated: Pulse input of a hobby servo: no threshold published; 2 V assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 18 AWG silicone wire | 3 | m | 0.7 | 2.10 | 0.823 mm2, rated 8 A in a bundle; 2.69 m cut + 10 % waste | estimated |
| 20 AWG silicone wire | 17.2 | m | 0.5 | 8.60 | 0.519 mm2, rated 5.5 A in a bundle; 15.56 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 5.9 | m | 0.4 | 2.36 | 0.327 mm2, rated 3.5 A in a bundle; 5.31 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 57.9 | m | 0.35 | 20.26 | 0.205 mm2, rated 1.75 A in a bundle; 52.62 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 43.4 | m | 0.3 | 13.02 | 0.128 mm2, rated 1.1 A in a bundle; 39.38 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 102 | pc | 0.02 | 2.04 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 35 | pc | 0.02 | 0.70 | one per cable end | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Bootlace ferrule contacts | 4 | pc | 0.03 | 0.12 | rated 17.5 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 5.9 | m | 0.2 | 1.18 | 104 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 61 | pc | 0.02 | 1.22 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 9.5 mm panel hole, 4.8 mm bore | 6 | pc | 0.1 | 0.60 | 9.5 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 11.4 | m | 0.4 | 4.56 | over every cable where it crosses a joint | estimated |
| 4 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 3 | pc | 0.25 | 0.75 | plus spares | estimated |
| JST XH 2.5 mm inline plug and socket, 3 way | 38 | pc | 0.28 | 10.64 | one on each lead at the neck, the shoulders, the hips and the back door's hinge, so helmet, limbs and battery bay come off | estimated |
| 1000 uF 16 V electrolytic capacitor | 3 | pc | 0.2 | 0.60 | across 5 V and GND at each ring | estimated |
| 330 ohm resistor, 1/4 W | 3 | pc | 0.02 | 0.06 | in series with each ring's data line, at the Nano | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Arduino Nano compatible board | estimated | estimated | estimated | estimated |
| Pololu D36V50F5 5 V 5.5 A step-down regulator | [datasheet](https://www.pololu.com/product/4091/specs) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) | [datasheet](https://www.pololu.com/product/4091) |
| LM2596S adjustable buck module | [datasheet](https://cdn.shopify.com/s/files/1/1509/1638/files/AZ-LM2596S_datasheet.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/1509/1638/files/AZ-LM2596S_datasheet.pdf) | estimated | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| DSSERVO DS3218 20 kg digital servo | estimated | estimated | estimated | estimated |
| TowerPro MG90S micro servo | estimated | estimated | estimated | [datasheet](https://www.towerpro.com.tw/product/mg90s-3/) |
| TowerPro MG996R standard servo | [datasheet](https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/f2017/kmv48_rp625/kmv48_rp625/kmv48_rp625/MG996RTowerPro.pdf) | [datasheet](https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/f2017/kmv48_rp625/kmv48_rp625/kmv48_rp625/MG996RTowerPro.pdf) | estimated | [datasheet](https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/f2017/kmv48_rp625/kmv48_rp625/kmv48_rp625/MG996RTowerPro.pdf) |
| 5 mm white LED + 100 ohm resistor | [datasheet](https://www.adafruit.com/product/754) | [datasheet](https://www.adafruit.com/product/754) | estimated | estimated |
| 2S 18650 pack: two 2500 mAh 20 A cells | [datasheet](https://www.akkuman.de/shop/mediafiles/PDF/18650%20Lithium/samsung%20inr18650-25r%2036v%202550mah%208c%2020a.pdf) | [datasheet](https://www.akkuman.de/shop/mediafiles/PDF/18650%20Lithium/samsung%20inr18650-25r%2036v%202550mah%208c%2020a.pdf) | estimated | estimated |
| PCA9685 16-channel PWM servo driver board | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://cdn-shop.adafruit.com/datasheets/PCA9685.pdf) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) | [datasheet](https://learn.adafruit.com/16-channel-pwm-servo-driver/pinouts) |
| KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
| WS2812B RGB LED ring, 12 LEDs, 37 mm | [datasheet](https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf) | [datasheet](https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels) | [datasheet](https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf) | estimated |

## Notes

- No cable shows from outside: every lead leaves its compartment through its floor, through a port in the shell, and lies in the channels bonded inside the shells. Press the wires in one at a time past the snap lips.
- A door's cables cross its hinge in a service loop close to the hinge line, in braided sleeving, so opening the door rolls the loop and never pulls a wire: only the left back door carries cables, the limbs' leads stay on their fixed halves.
- Set both LM2596 outputs to 5.0 V with a meter before wiring anything to them.
- The cells have no protection board: charge them out of the suit at 4.2 V per cell, and stop at 3.2 V per cell (6.4 V at the pack): the regulators fall out of 5 V at about that point.
- The Nano runs from VIN, so USB and the pack can be connected together.
- Eye LEDs hang on D3 and D5 through the 100 ohm resistor of the part: 20 mA each is an AVR pin's stated limit, so run them under full PWM for long stretches.
- Set the right servo board to I2C address 0x41 (bridge A0); the left stays at 0x40. Fit 1000 uF across V+ and GND at each board.
- The sketch must lift the pawls, then move one left and right pair at a time: forearms, shins, upper arms, thighs, then right back door, left back door, right helmet door, left helmet door. Shut in reverse. The doors have no position or contact sensing, and no sketch is supplied yet.
- WS2812 data: fit a 330 ohm resistor in series at the Nano pin of each ring and a 1000 uF capacitor across 5 V and GND at each ring. The run to a palm is over a metre of unscreened data: test it on the bench before closing the shells.
- All three rings at full white load their LM2596 past its 2 A continuous rating (2.16 A; 3 A peak): limit brightness to 90 % in the sketch for anything longer than a burst.
- Run time from the 2.5 Ah pack at the typical 2.72 A: about 0.7 h, keeping 20 % back (estimate; lights and faceplate never all run like that for hours).
