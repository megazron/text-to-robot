// Inventory prompts for "Build from my parts": starter kits, kit contents, servo packs, ESP32 and Raspberry Pi boxes,
// shopping lists and loose descriptions. `expect` is the kind of robot the best option must be, or "cannot" when the
// list builds nothing safe (the answer then says why and what to add).
export interface PartsPrompt { text: string; expect: string | string[]; }
export const PARTS_PROMPTS: PartsPrompt[] = [
  // the owner's own examples
  { text: "I have an Arduino Uno, 2 TT gear motors, an L298N, an HC-SR04, 4 AA batteries and a servo SG90", expect: ["scan_car", "obstacle_car"] },
  { text: "mere paas 2 motor aur ek Arduino hai", expect: "obstacle_car" },
  { text: "I have 2 small yellow motors, a cheap ultrasonic sensor and an Arduino Nano", expect: "obstacle_car" },
  // starter kits by name
  { text: "Elegoo smart robot car kit v3", expect: ["line_follower", "scan_car", "obstacle_car_4wd"] },
  { text: "I have the Elegoo Smart Robot Car Kit V4.0", expect: ["line_follower", "scan_car", "obstacle_car_4wd"] },
  { text: "Arduino starter kit", expect: "cannot" },
  { text: "Elegoo UNO R3 super starter kit", expect: "radar" },
  // kit contents pasted
  { text: "Kit contents:\n- UNO R3 board\n- L298N motor driver\n- 4x TT gear motor\n- 4x wheels\n- HC-SR04\n- SG90 servo\n- 2x18650 battery box\n- jumper wires", expect: ["scan_car", "obstacle_car_4wd", "obstacle_car"] },
  { text: "Parts: Arduino Nano, TB6612FNG, 2 TT motors, 2 wheels, 3-channel line tracking module, 2S 18650 holder", expect: "line_follower" },
  { text: "in the box: arduino uno, 2 x bo motor, l298n, 2 ir line sensors, 9v battery", expect: "line_follower" },
  // servo packs
  { text: "a pack of 10 SG90 servos, an Arduino Nano and a PCA9685", expect: "walker" },
  { text: "8 MG90S servos, Arduino Uno, PCA9685 servo driver, 2x 18650 holder", expect: "walker" },
  { text: "4 SG90 servos and an Arduino Uno", expect: "servo_arm" },
  { text: "I have 2 MG996R and 2 SG90 servos, an Arduino Uno and a 5V 4A power adapter", expect: "servo_arm" },
  { text: "5 servos, arduino nano, pca9685", expect: "servo_arm" },
  { text: "6x MG90S, ESP32, 4 AA batteries", expect: "servo_arm" },
  { text: "3 servos sg90 + an arduino + 4xAA holder", expect: "servo_arm" },
  // one servo and a sensor
  { text: "SG90, HC-SR04, Arduino Nano", expect: "radar" },
  { text: "a servo, an ultrasonic sensor and an Arduino Uno, plus 4 AA batteries", expect: "radar" },
  { text: "MG90S, VL53L0X, ESP32", expect: "radar" },
  // ESP32 and random sensors
  { text: "ESP32, an MPU6050, a buzzer, an OLED and a PIR sensor", expect: "cannot" },
  { text: "ESP32 devkit, 2 TT motors, DRV8833, HC-SR04, MPU6050, buzzer, 2x18650 holder", expect: "obstacle_car" },
  { text: "esp32 + l9110s + 2 yellow motors + vl53l0x + 6 AA batteries", expect: "obstacle_car" },
  { text: "ESP32-CAM, L298N, 2 TT motors, 2x18650 pack", expect: "camera_car" },
  // Raspberry Pi boxes
  { text: "Raspberry Pi 4, Pi camera, 2 TT motors, L298N, power bank", expect: "camera_car" },
  { text: "Raspberry Pi 4, camera module 3, 2 TT motors, TB6612, 2x18650 holder, LM2596 buck converter", expect: "camera_car" },
  { text: "pi zero 2 w, pi camera, drv8833, 2 TT motors, 2s 18650", expect: "camera_car" },
  { text: "Raspberry Pi 5, 2 TT motors, L298N, HC-SR04, 2x18650", expect: "obstacle_car" },
  // shopping lists with prices, counts and typos
  { text: "1 x Arduino Uno R3 - $23.00\n2 x SG90 Micro Servo (Pack of 4)\n1 x L298N Motor Driver\n4xAA battery holder\nHC-05 bluetooth", expect: "walker" },
  { text: "Order summary:\n2 pcs TT Gear Motor DC 3-6V  ₹120\n1 pc L298N  ₹150\n1 pc HC-SR04  ₹80\n1 pc Arduino Nano (CH340)  ₹350\n1 pc 2x18650 battery holder  ₹40", expect: "obstacle_car" },
  { text: "I have these components: ardiuno nano, 4x servoo, hcsr04, 2x18650 battery holder, jumper wires, make a robot for me", expect: ["servo_arm", "radar"] },
  { text: "ultrasonik sensr, 2 moters, l298, uno", expect: "obstacle_car" },
  { text: "i have: 4 tt motors, 4 wheels, 2 l298n, arduino mega, hc sr04, 6xAA", expect: ["obstacle_car_4wd", "obstacle_car"] },
  { text: "2 TT motors, 2 wheels, a ball caster, TB6612FNG, Arduino Uno, 2 FC-51 IR obstacle sensors, 2x18650", expect: "obstacle_car" },
  { text: "2 TT motors, L298N, Arduino Uno, HC-SR04, HC-05 bluetooth, buzzer, 2x18650", expect: "obstacle_car" },
  // Hinglish and Hindi
  { text: "mere paas ek arduino uno, do tt motor, ek l298n aur ek ultrasonic sensor hai", expect: "obstacle_car" },
  { text: "मेरे पास 2 मोटर और एक Arduino है", expect: "obstacle_car" },
  { text: "mere paas 4 servo motor aur arduino nano hai, robot banao", expect: "servo_arm" },
  { text: "mere kit me 2 peeli motor, l298n, arduino aur 2 line sensor hai", expect: "line_follower" },
  // too little to build anything
  { text: "an Arduino and some LEDs", expect: "cannot" },
  { text: "just a breadboard, resistors and jumper wires", expect: "cannot" },
  { text: "I have one TT motor and an Arduino Uno", expect: "obstacle_car" },
  { text: "two SG90 servos", expect: "cannot" },
  { text: "a flux capacitor and a hoverboard", expect: "cannot" },
  { text: "Raspberry Pi 4 and a camera", expect: "cannot" },
];
