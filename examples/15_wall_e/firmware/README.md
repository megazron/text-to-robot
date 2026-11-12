# Firmware: wall_e

`wall_e/wall_e.ino` is an Arduino sketch for this robot's Arduino Nano compatible board (ATmega328P, CH340, USB-C). It drives forwards and steers away from anything the ultrasonic sensor sees closer than 20 cm; runs a pose sequence, one joint at a time from home, inside the joint limits.

Every pin in it comes from this robot's wiring record (`WIRING.md`): change the wiring and generate the robot again, do not edit pin numbers by hand.
I compile the sketches of the example robots on every change. No sketch has run on a real robot yet, so treat the first power-up as a test.

## Flash it

With the Arduino IDE (2.x):

1. Open `wall_e/wall_e.ino`. Keep the file in its `wall_e` folder: the IDE wants the folder and the sketch to share a name.
2. Tools > Board > Arduino AVR Boards > **Arduino Nano**. Tools > Processor > **ATmega328P**; if the upload fails with `not in sync`, pick **ATmega328P (Old Bootloader)**, which many Nano clones carry.
3. Tools > Manage Libraries: install **Adafruit PWM Servo Driver Library** (say yes to its dependency, Adafruit BusIO). Wire comes with the board package.
4. Plug the board in over USB and pick it under Tools > Port. This board talks through a CH340 chip: if no port appears, install the CH340 driver.
5. Upload, with the motor and servo power switched off.
6. Open the Serial Monitor at **115200 baud**. Send `s` to stop everything, `s` again to go on.

With arduino-cli:

```bash
arduino-cli core install arduino:avr
arduino-cli lib install "Adafruit PWM Servo Driver Library"
arduino-cli board list                      # find the port, for example /dev/ttyUSB0 or COM5
arduino-cli compile --fqbn arduino:avr:nano:cpu=atmega328 wall_e
arduino-cli upload -p <port> --fqbn arduino:avr:nano:cpu=atmega328 wall_e
arduino-cli monitor -p <port> -c baudrate=115200
```

A Nano clone with the old bootloader takes `--fqbn arduino:avr:nano:cpu=atmega328old` for the upload.

## Pin map

| Board pin | Mode | Drives | Wire in WIRING.md |
|---|---|---|---|
| D2 | output | motor_driver_2 BIN2: direction of rear_right_motor | W17 CONTROLLER_D2 |
| D4 | output | motor_driver_1 BIN1: direction of front_right_motor | W5 CONTROLLER_D4 |
| D5 | pwm | motor_driver_1 PWMA: speed of front_left_motor | W1 CONTROLLER_D5 |
| D6 | pwm | motor_driver_1 PWMB: speed of front_right_motor | W4 CONTROLLER_D6 |
| D7 | output | motor_driver_1 AIN1: direction of front_left_motor | W2 CONTROLLER_D7 |
| D8 | output | motor_driver_1 AIN2: direction of front_left_motor | W3 CONTROLLER_D8 |
| D9 | pwm | motor_driver_2 PWMA: speed of rear_left_motor | W12 CONTROLLER_D9 |
| D10 | pwm | motor_driver_2 PWMB: speed of rear_right_motor | W15 CONTROLLER_D10 |
| D11 | output | ultrasonic Trig | W41 CONTROLLER_D11 |
| D12 | input | ultrasonic Echo | W42 CONTROLLER_D12 |
| A0 | output | motor_driver_1 BIN2: direction of front_right_motor | W6 CONTROLLER_A0 |
| A1 | output | motor_driver_2 AIN1: direction of rear_left_motor | W13 CONTROLLER_A1 |
| A2 | output | motor_driver_2 AIN2: direction of rear_left_motor | W14 CONTROLLER_A2 |
| A3 | output | motor_driver_2 BIN1: direction of rear_right_motor | W16 CONTROLLER_A3 |
| A4 | i2c | I2C SDA to servo_driver | W39 I2C_SDA |
| A5 | i2c | I2C SCL to servo_driver | W40 I2C_SCL |

## Servos

Angle 0 is the servo's centre and the joint's zero pose in `ASSEMBLY.md`. Pulse ranges are the catalog's; batches differ, so trim `minUs` / `maxUs` in the sketch if a joint misses its end angles.

| Servo | Output | Joint | Range in the sketch (deg) | Home (deg) | Pulse (us) |
|---|---|---|---|--:|---|
| neck_pan_servo (hobby_sg90) | servo_driver 0x40 channel 0 | neck_pan | -80.2 to 80.2 | 0 | 500 to 2400 over 180 deg |
| neck_tilt_servo (hobby_sg90) | servo_driver 0x40 channel 1 | neck_tilt | -40.1 to 40.1 | 0 | 500 to 2400 over 180 deg |
| left_hand_servo (hobby_sg90) | servo_driver 0x40 channel 2 | left_hand | -0.8 to 34.3 | 0 | 500 to 2400 over 180 deg |
| right_hand_servo (hobby_sg90) | servo_driver 0x40 channel 3 | right_hand | -34.3 to 0.8 | 0 | 500 to 2400 over 180 deg |
| left_arm_servo (hobby_mg90s) | servo_driver 0x40 channel 4 | left_arm_lift | -57.2 to 28.3 | 0 | 500 to 2400 over 180 deg |
| right_arm_servo (hobby_mg90s) | servo_driver 0x40 channel 5 | right_arm_lift | -28.3 to 57.2 | 0 | 500 to 2400 over 180 deg |
| left_elbow_servo (hobby_sg90) | servo_driver 0x40 channel 6 | left_elbow | -85.9 to 71.7 | 0 | 500 to 2400 over 180 deg |
| right_elbow_servo (hobby_sg90) | servo_driver 0x40 channel 7 | right_elbow | -71.7 to 85.9 | 0 | 500 to 2400 over 180 deg |

## Motors

The sketch never writes more than 182/255 to a speed pin (6 V motors on a supply that reaches 8.4 V: 6 / 8.4 x 255).

| Motor | Driver | Speed pin | Direction pins | Side |
|---|---|---|---|---|
| front_left_motor | motor_driver_1 channel A | D5 | D7, D8 | left |
| front_right_motor | motor_driver_1 channel B | D6 | D4, A0 | right |
| rear_left_motor | motor_driver_2 channel A | D9 | A1, A2 | left |
| rear_right_motor | motor_driver_2 channel B | D10 | A3, D2 | right |

## First power-up

- Lift the wheels off the ground. During `drive: forward` every wheel must turn forwards; for one that does not, change its last number in `MOTORS` from `+1` to `-1`, or swap its two leads.
- Fit each servo horn with the servo at its centre and the joint at its zero pose. The servos jump to their home angles when the sketch starts: keep clear.
- A joint that turns the wrong way: change its `dir` in `JOINTS` from `+1` to `-1`.
- Hold a hand in front of the range sensor: the serial monitor shows the distance, and under 20 cm the robot stops, backs off and turns.
- Power the board from USB alone first and read the serial monitor before you switch the motor or servo supply on.
