# Arduino firmware

A robot designed around an Arduino Uno or Nano comes with a sketch. I write it from the robot's wiring record, so the pins in the sketch are the pins in `WIRING.md`, the schematic and the breadboard view: one source, no second pin table to keep in step.

## What you get

| File | What |
|---|---|
| `firmware/<robot>/<robot>.ino` | The sketch, in a folder of its own name as the Arduino IDE wants. Its header lists the pin map with the wire behind each pin. |
| `firmware/README.md` | Flashing steps for this board, the pin map, the servo and motor tables and what to check on the first power-up. |

They are in the build package (`cad/firmware/` in the CAD download), in the website's **Arduino sketch** download, in the example folders, and from the engine API as `engine.firmware(robot)`.

## What the sketch does

- **Drive motors** through an H-bridge board (TB6612FNG or L298N): two direction pins and a PWM speed pin per motor, found by following the wires from the board to the driver and from the driver's outputs to each motor. Motors rated below the battery get a duty cap: 6 V motors on a 2S pack that reaches 8.4 V are never given more than 182/255.
- **Hobby servos** on a PCA9685 (Adafruit PWM Servo Driver library over I2C) or straight on board pins (Servo library). Pulse range and travel come from the servo's catalog record. Angle 0 is the servo's centre and the joint's zero pose; each joint stays inside the robot's own limits, cut to what the servo can reach.
- **HC-SR04** range sensor: a ping every 60 ms, echo time / 58 = cm.
- **Behaviour**: a car with a range sensor drives forwards, and when something is closer than 20 cm it stops, backs off, turns a quarter and looks again. Without a sensor it drives a square by time. Servo joints run a pose sequence: home, then one joint at a time up to 60 % of the way to each limit and back. A move that would put a link under the table is shortened or left out, and the sketch says which.
- **Serial** at 115200 baud: what it is doing, a status line every second, and `s` to stop everything or go on.
- The loop keeps time with `millis()`; its one blocking call is the range ping (under 12 ms).

## What it does not do

- It has no feedback: hobby servos and TT motors have no encoders, so turns are by time and joint angles are commanded, not measured.
- Parts I have no driver code for inside the Servo, Wire and Adafruit PWM Servo Driver libraries (WS2812 rings, for one) are listed as not driven, in the notes and at the top of the sketch.
- The wearable Mark 43 gets no sketch: its doors close on a person in a fixed order with pawls to lift first, and I have not written that sequence.
- Robots on a Raspberry Pi, Jetson or ESP32 get none either; this generator is for Arduino-class AVR boards.
- I compile every example's sketch in CI. None has run on a real robot yet, and a design that is not an example has not been compiled at all. Lift the wheels and keep clear of the joints on the first run.

## Flash it

Each `firmware/README.md` has the exact steps for its board. In short:

```bash
arduino-cli core install arduino:avr
arduino-cli lib install "Adafruit PWM Servo Driver Library"   # only for robots with a PCA9685
arduino-cli board list                                         # find the port
arduino-cli compile --fqbn arduino:avr:nano:cpu=atmega328 arduino_car
arduino-cli upload -p <port> --fqbn arduino:avr:nano:cpu=atmega328 arduino_car
arduino-cli monitor -p <port> -c baudrate=115200
```

In the Arduino IDE: open the `.ino`, pick the board (Arduino Nano with processor ATmega328P, or Arduino Uno), install the libraries the README names, pick the port, upload. A Nano clone that answers `not in sync` wants the processor **ATmega328P (Old Bootloader)**.

## Checks

- `tests/firmware.test.ts`: every pin in the pin map is a wire of the record that ends on the board, no pin does two jobs, PWM outputs are on PWM pins, servo pulses are the catalog's, the pose sequence stays inside the limits and clear of the robot and the table (exact solids), the shipped files are what the generator writes, and wiring it cannot drive is reported.
- `python3 scripts/compile_firmware.py --variants`: every example's sketch, and four rewired variants (no sensor, L298N with a speed wire on a pin without PWM, servos on board pins, PCA9685 and a pin servo together), compiled with arduino-cli. CI runs it with arduino-cli 1.5.1, arduino:avr 1.8.8, Servo 1.3.0, Adafruit BusIO 1.17.4 and Adafruit PWM Servo Driver Library 3.0.3. `--hex <dir>` also writes the `.hex` files.

| Example | Board | Flash | RAM |
|---|---|--:|--:|
| `18_arduino_car` | Nano (ATmega328P) | 4136 bytes (13 %) | 305 bytes (15 %) |
| `19_arduino_arm` | Uno | 9484 bytes (29 %) | 570 bytes (28 %) |
| `15_wall_e` | Nano (ATmega328P) | 11508 bytes (37 %) | 850 bytes (42 %) |
| `23_robot_hand` | Nano (ATmega328P) | 9470 bytes (31 %) | 670 bytes (33 %) |

The robot hand's five flexion servos pull tendons over spools. The sketch does not yet turn a finger joint angle into a servo angle through the spool radius and the moment arms, so it holds those five servos at their centres (its notes say so) and its pose sequence moves only the thumb swing.

## Regenerate

`node scripts/export_firmware.ts` writes the sketches of the examples from their shipped `robot.json` (and into their `robot.cad.zip`); `scripts/build_examples.ts` writes the same files in a full rebuild. The generator is `packages/design/src/firmware/`: `plan.ts` reads the wiring record, `sketch.ts` writes the code.
