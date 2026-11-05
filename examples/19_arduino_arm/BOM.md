# Bill of Materials — arduino_arm

**Estimated total: $43.54**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Compute | Arduino Uno R3 compatible board (ATmega328P, CH340 USB) _(controller (USB serial commands, I2C to the servo driver) · https://www.aliexpress.com/w/wholesale-arduino-uno-r3-ch340.html)_ | 1 | 6 | 6 | 5 V |
| Actuator | TowerPro MG996R standard servo (metal gears) + round horn _(shoulder servo; elbow servo · https://www.towerpro.com.tw/product/mg996r/)_ | 2 | 6 | 12 | 0.3236 N·m rated / 1.0787 N·m peak, 6 V |
| Actuator | TowerPro SG90 micro servo (nylon gears) + cross horn _(base yaw servo; claw servo · https://www.adafruit.com/product/169)_ | 2 | 2.5 | 5 | 0.0529 N·m rated / 0.1765 N·m peak, 4.8 V |
| Electronics | PCA9685 16-channel PWM servo driver board (generic, I2C) _(16-channel PWM servo driver (I2C) · https://www.aliexpress.com/w/wholesale-pca9685-16-channel-servo-driver.html)_ | 1 | 2.5 | 2.5 | 5 V |
| Power | Mean Well LRS-50-5 enclosed PSU, 5 V 10 A (50 W) _(5 V 10 A servo supply · https://www.digikey.com/en/products/result?keywords=LRS-50-5)_ | 1 | 13 | 13 | 5 V |
| Printed structure | PETG filament for 5 printed parts _(base_link, turntable, upper_arm, forearm, claw_jaw)_ | 1 | 3.6 | 3.6 | 142 g of parts (+15 % supports/waste), about 13.0 h of printing |
| Fasteners | Screws, nuts and inserts | 12 | 0.12 | 1.44 | 8x M2 self-tapping (servo tabs, from the servo kits); 4x M4 screws or desk clamps (base) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| shoulder | 0.3183 | N·m | TowerPro MG996R standard servo (metal gears) + round horn | 3.39x |
| elbow | 0.094 | N·m | TowerPro MG996R standard servo (metal gears) + round horn | 11.48x |

## Notes
- Arduino desk arm: 3 DOF + claw, 280 mm reach, 20 g payload, 0.27 kg, $39 of parts
- Sized for a 0.02 kg payload.
- Every joint's limits are inside its collision-free range (exact solid sweeps).
- each joint runs on its servo's own output bearing (no extra bearings), as in MeArm-class kits: links are kept short so the servo holds them continuously
- prices are typical single-unit marketplace prices and vary by seller
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
