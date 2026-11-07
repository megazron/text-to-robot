# Bill of Materials — wall_e

**Estimated total: $117.27**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Compute | Arduino Nano compatible board (ATmega328P, CH340, USB-C) _(Arduino Nano (runs the generated sketch) · https://www.aliexpress.com/w/wholesale-arduino-nano-type-c-ch340.html)_ | 1 | 3.5 | 3.5 | 5 V |
| Power | Half-size solderless breadboard, 400 points, adhesive back _(plug-in wiring: Nano + two TB6612FNG · https://www.adafruit.com/product/64)_ | 1 | 2 | 2 | https://www.adafruit.com/product/64 |
| Power | LM2596S adjustable buck module (3 A, 43 x 21 mm) _(LM2596 set to 5.0 V for the neck and hand servos; LM2596 set to 5.0 V for the shoulder and elbow servos · https://www.amazon.com/s?k=LM2596S+buck+module)_ | 2 | 3 | 6 | 5 V |
| Power | Inline ATM mini blade fuse holder, 30 A class (Littelfuse FHM) _(fuse holders · https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders)_ | 4 | 2.5 | 10 | 32 V |
| Sensor | HC-SR04 ultrasonic distance sensor (2-400 cm) _(HC-SR04 distance sensor (obstacle avoidance) · https://www.aliexpress.com/w/wholesale-hc-sr04.html)_ | 1 | 1 | 1 | 5 V |
| Actuator | TowerPro MG90S micro servo (metal gears) + cross horn _(shoulder servo · https://www.adafruit.com/product/1143)_ | 2 | 4 | 8 | 0.0647 N·m rated / 0.2157 N·m peak, 6 V |
| Actuator | TowerPro SG90 micro servo (nylon gears) + cross horn _(neck pan servo; neck tilt servo; elbow servo; hand servo · https://www.adafruit.com/product/169)_ | 6 | 2.5 | 15 | 0.0529 N·m rated / 0.1765 N·m peak, 4.8 V |
| Power | 2S 18650 pack: two 2500 mAh 20 A cells (Samsung 25R class) in a plain two-cell holder _(2S 18650 pack · https://www.aliexpress.com/w/wholesale-18650-2-slot-battery-holder-switch.html)_ | 1 | 12 | 12 | 7.4 V, 18.5 Wh |
| Electronics | PCA9685 16-channel PWM servo driver board (generic, I2C) _(PCA9685 servo driver (I2C) · https://www.aliexpress.com/w/wholesale-pca9685-16-channel-servo-driver.html)_ | 1 | 2.5 | 2.5 | 5 V |
| Power | KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC _(main power switch · https://www.aliexpress.com/w/wholesale-kcd1-rocker-switch.html)_ | 1 | 0.3 | 0.3 | https://www.aliexpress.com/w/wholesale-kcd1-rocker-switch.html |
| Electronics | TB6612FNG dual DC motor driver module (1.2 A per channel) _(TB6612FNG dual motor driver · https://www.aliexpress.com/w/wholesale-tb6612fng-motor-driver.html)_ | 2 | 2 | 4 | 7.4 V |
| Actuator | TT gear motor 3-6 V, 1:48, 200 rpm (yellow, double-D shaft) _(drive motor · https://www.adafruit.com/product/3777)_ | 4 | 1.5 | 6 | 0.0235 N·m rated / 0.0785 N·m peak, 6 V |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 8 | 0.8 | 6.4 | 450 V |
| Drive | 65 mm rubber wheel for TT gearmotors (double-D 5.3x3.7 bore) _(track drive wheel · https://makerlab-electronics.com/products/65mm-yellow-wheel)_ | 4 | 2 | 8 | https://makerlab-electronics.com/products/65mm-yellow-wheel |
| Printed structure | PETG filament for 21 printed parts _(body, front_band, charge_gauge, name_plate, track_left, left_idler, track_right, right_idler, lid, neck, head, left_lens, right_lens, left_arm, left_forearm, left_arm_stripes, left_thumb, right_arm, right_forearm, right_arm_stripes, right_thumb)_ | 1 | 14.7 | 14.7 | 581 g of parts (+15 % supports/waste), about 53.0 h of printing |
| Fasteners | Screws, nuts and inserts | 42 | 0.12 | 5.04 | 8x M3x25 socket head + nut (motor through-bolt); 2x M4 x 45 shoulder bolt (idler pin); 4x M2x6 self-tapping (sensor); 2x M3x8 countersunk + nut (pack); 6x M2.5x6 + nut (PCA9685) / M3x6 (LM2596); 4x M3x10 self-tapping (lid); 16x M2 self-tapping (servo tabs, from the servo kits) |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 0.6 | 0.5 | 0.3 | 0.6 m: 0.519 mm2, rated 5.5 A in a bundle; 0.53 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 1.6 | 0.4 | 0.64 | 1.6 m: 0.327 mm2, rated 3.5 A in a bundle; 1.38 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 10.5 | 0.35 | 3.67 | 10.5 m: 0.205 mm2, rated 1.75 A in a bundle; 9.47 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 9 | 0.3 | 2.7 | 9 m: 0.128 mm2, rated 1.1 A in a bundle; 8.13 m cut + 10 % waste |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 74 | 0.02 | 1.48 | 74 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 28 | 0.02 | 0.56 | 28 pc: one per cable end |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: rated 15 A per contact |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 2 | 0.03 | 0.06 | 2 pc: rated 17.5 A per contact |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 3.6 | 0.2 | 0.72 | 3.6 m: 45 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 47 | 0.02 | 0.94 | 47 pc: at every clip, cable end and strain-relief anchor |
| Wiring | Rubber grommet, 7.9 mm panel hole, 4.8 mm bore _(price estimated)_ | 1 | 0.08 | 0.08 | 1 pc: 8 mm panel hole |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 1.3 | 0.4 | 0.52 | 1.3 m: over every cable where it crosses a joint |
| Wiring | 4 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |
| Wiring | 2 A ATM blade fuse _(price estimated)_ | 3 | 0.25 | 0.75 | 3 pc: plus spares |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| neck_pan | 0 | N·m | TowerPro SG90 micro servo (nylon gears) + cross horn | 176500x |
| neck_tilt | 0.0537 | N·m | TowerPro SG90 micro servo (nylon gears) + cross horn | 3.28x |
| left_arm_lift | 0.0689 | N·m | TowerPro MG90S micro servo (metal gears) + cross horn | 3.13x |
| right_arm_lift | 0.0689 | N·m | TowerPro MG90S micro servo (metal gears) + cross horn | 3.13x |
| left_elbow | 0.0308 | N·m | TowerPro SG90 micro servo (nylon gears) + cross horn | 5.72x |
| right_elbow | 0.0308 | N·m | TowerPro SG90 micro servo (nylon gears) + cross horn | 5.72x |
| left_hand | 0 | N·m | TowerPro SG90 micro servo (nylon gears) + cross horn | 176500x |
| right_hand | 0 | N·m | TowerPro SG90 micro servo (nylon gears) + cross horn | 176500x |

## Notes
- Arduino WALL-E: TPU tracks on 4 TT motors, pan/tilt binocular head, two-joint arms with gripping hands, 1.14 kg, $98 of parts
- Joint limits trimmed to the collision-free range found by exact solid sweeps: left_arm_lift [-1.00, 1.00] -> [-1.00, 0.48]; right_arm_lift [-1.00, 1.00] -> [-0.48, 1.00]; left_elbow [-1.50, 1.50] -> [-1.50, 1.27]; right_elbow [-1.50, 1.50] -> [-1.27, 1.50]; left_hand [-0.60, 0.60] -> [-0.01, 0.60]; right_hand [-0.60, 0.60] -> [-0.60, 0.01].
- tracks print in TPU 95A (flexible), everything else in PETG/PLA+; the body prints open side up without supports
- TT motor continuous torque taken as 30 % of the 0.8 kg.cm stall; a turn on the spot is a short transient above that (the tracks slide sideways), so spin in bursts on carpet or rubber floors
- prices are typical single-unit marketplace prices and vary by seller
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
