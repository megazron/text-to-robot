# Bill of Materials — wall_e

**Estimated total: $67.43**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Compute | Arduino Nano compatible board (ATmega328P, CH340, USB-C) _(Arduino Nano (runs the generated sketch) · https://www.aliexpress.com/w/wholesale-arduino-nano-type-c-ch340.html)_ | 1 | 3.5 | 3.5 | 5 V |
| Power | Half-size solderless breadboard, 400 points, adhesive back _(plug-in wiring: Nano + two TB6612FNG · https://www.adafruit.com/product/64)_ | 1 | 2 | 2 | https://www.adafruit.com/product/64 |
| Power | LM2596S adjustable buck module (3 A, 43 x 21 mm) _(LM2596 set to 5.0 V for the servos · https://www.amazon.com/s?k=LM2596S+buck+module)_ | 1 | 3 | 3 | 5 V |
| Sensor | HC-SR04 ultrasonic distance sensor (2-400 cm) _(HC-SR04 distance sensor (obstacle avoidance) · https://www.aliexpress.com/w/wholesale-hc-sr04.html)_ | 1 | 1 | 1 | 5 V |
| Actuator | TowerPro SG90 micro servo (nylon gears) + cross horn _(neck pan servo; neck tilt servo; arm servo · https://www.adafruit.com/product/169)_ | 4 | 2.5 | 10 | 0.0529 N·m rated / 0.1765 N·m peak, 4.8 V |
| Power | 2S 18650 pack: two 2500 mAh 20 A cells (Samsung 25R class) in a holder with switch _(2S 18650 pack · https://www.aliexpress.com/w/wholesale-18650-2-slot-battery-holder-switch.html)_ | 1 | 12 | 12 | 7.4 V, 18.5 Wh |
| Electronics | PCA9685 16-channel PWM servo driver board (generic, I2C) _(PCA9685 servo driver (I2C) · https://www.aliexpress.com/w/wholesale-pca9685-16-channel-servo-driver.html)_ | 1 | 2.5 | 2.5 | 5 V |
| Electronics | TB6612FNG dual DC motor driver module (1.2 A per channel) _(TB6612FNG dual motor driver · https://www.aliexpress.com/w/wholesale-tb6612fng-motor-driver.html)_ | 2 | 2 | 4 | 7.4 V |
| Actuator | TT gear motor 3-6 V, 1:48, 200 rpm (yellow, double-D shaft) _(drive motor · https://www.adafruit.com/product/3777)_ | 4 | 1.5 | 6 | 0.0235 N·m rated / 0.0785 N·m peak, 6 V |
| Drive | 65 mm rubber wheel for TT gearmotors (double-D 5.3x3.7 bore) _(track drive wheel · https://makerlab-electronics.com/products/65mm-yellow-wheel)_ | 4 | 2 | 8 | https://makerlab-electronics.com/products/65mm-yellow-wheel |
| Printed structure | PETG filament for 8 printed parts _(body, track_left, track_right, lid, neck, head, left_arm, right_arm)_ | 1 | 11.59 | 11.59 | 458 g of parts (+15 % supports/waste), about 41.8 h of printing |
| Fasteners | Screws, nuts and inserts | 32 | 0.12 | 3.84 | 8x M3x25 socket head + nut (motor through-bolt); 4x M2x6 self-tapping (sensor); 2x M3x8 countersunk + nut (pack); 6x M2.5x6 + nut (PCA9685) / M3x6 (LM2596); 4x M3x10 self-tapping (lid); 8x M2 self-tapping (servo tabs, from the servo kits) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| neck_pan | 0 | N·m | TowerPro SG90 micro servo (nylon gears) + cross horn | 176500x |
| neck_tilt | 0.039 | N·m | TowerPro SG90 micro servo (nylon gears) + cross horn | 4.53x |
| left_arm_lift | 0.0027 | N·m | TowerPro SG90 micro servo (nylon gears) + cross horn | 65.2x |
| right_arm_lift | 0.0027 | N·m | TowerPro SG90 micro servo (nylon gears) + cross horn | 65.2x |

## Notes
- Arduino WALL-E: TPU tracks on 4 TT motors, pan/tilt binocular head, 2 servo arms, 0.95 kg, $52 of parts
- Joint limits trimmed to the collision-free range found by exact solid sweeps: left_arm_lift [-1.00, 1.00] -> [-1.00, 0.35]; right_arm_lift [-1.00, 1.00] -> [-0.35, 1.00].
- tracks print in TPU 95A (flexible), everything else in PETG/PLA+; the body prints open side up without supports
- TT motor continuous torque taken as 30 % of the 0.8 kg.cm stall
- prices are typical single-unit marketplace prices and vary by seller
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
