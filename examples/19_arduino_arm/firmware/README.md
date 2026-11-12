# Firmware: arduino_arm

`arduino_arm/arduino_arm.ino` is an Arduino sketch for this robot's Arduino Uno R3 compatible board (ATmega328P, CH340 USB). It runs a pose sequence, one joint at a time from home, inside the joint limits.

Every pin in it comes from this robot's wiring record (`WIRING.md`): change the wiring and generate the robot again, do not edit pin numbers by hand.
I compile the sketches of the example robots on every change. No sketch has run on a real robot yet, so treat the first power-up as a test.

## Flash it

With the Arduino IDE (2.x):

1. Open `arduino_arm/arduino_arm.ino`. Keep the file in its `arduino_arm` folder: the IDE wants the folder and the sketch to share a name.
2. Tools > Board > Arduino AVR Boards > **Arduino Uno**.
3. Tools > Manage Libraries: install **Adafruit PWM Servo Driver Library** (say yes to its dependency, Adafruit BusIO). Wire comes with the board package.
4. Plug the board in over USB and pick it under Tools > Port. This board talks through a CH340 chip: if no port appears, install the CH340 driver.
5. Upload, with the motor and servo power switched off.
6. Open the Serial Monitor at **115200 baud**. Send `s` to stop everything, `s` again to go on.

With arduino-cli:

```bash
arduino-cli core install arduino:avr
arduino-cli lib install "Adafruit PWM Servo Driver Library"
arduino-cli board list                      # find the port, for example /dev/ttyUSB0 or COM5
arduino-cli compile --fqbn arduino:avr:uno arduino_arm
arduino-cli upload -p <port> --fqbn arduino:avr:uno arduino_arm
arduino-cli monitor -p <port> -c baudrate=115200
```

## Pin map

| Board pin | Mode | Drives | Wire in WIRING.md |
|---|---|---|---|
| A4 | i2c | I2C SDA to servo_driver | W18 I2C_SDA |
| A5 | i2c | I2C SCL to servo_driver | W19 I2C_SCL |

## Servos

Angle 0 is the servo's centre and the joint's zero pose in `ASSEMBLY.md`. Pulse ranges are the catalog's; batches differ, so trim `minUs` / `maxUs` in the sketch if a joint misses its end angles.

| Servo | Output | Joint | Range in the sketch (deg) | Home (deg) | Pulse (us) |
|---|---|---|---|--:|---|
| yaw_servo (hobby_sg90) | servo_driver 0x40 channel 0 | yaw | -90 to 90 | 0 | 500 to 2400 over 180 deg |
| shoulder_servo (hobby_mg996r) | servo_driver 0x40 channel 1 | shoulder | -90 to 90 | 34.4 | 500 to 2500 over 180 deg |
| elbow_servo (hobby_mg996r) | servo_driver 0x40 channel 2 | elbow | -90 to 90 | 68.8 | 500 to 2500 over 180 deg |
| claw_servo (hobby_sg90) | servo_driver 0x40 channel 3 | claw | 0 to 16.6 | 0 | 500 to 2400 over 180 deg |

## First power-up

- Fit each servo horn with the servo at its centre and the joint at its zero pose. The servos jump to their home angles when the sketch starts: keep clear.
- A joint that turns the wrong way: change its `dir` in `JOINTS` from `+1` to `-1`.
- Power the board from USB alone first and read the serial monitor before you switch the motor or servo supply on.

## Not driven, or to check

- elbow: the robot allows -120 to 120 deg but the TowerPro MG996R standard servo turns 180 deg (-90 to 90 about its centre): the sketch stays inside -90 to 90 deg.
- shoulder: the pose sequence turns it to 62.2 deg, not 67.8: further and a link would go under the surface the robot stands on.
