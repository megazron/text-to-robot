# Bill of materials: arduino_arm

**Estimated total: $65.55**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Compute | Arduino Uno R3 compatible board (ATmega328P, CH340 USB) _(controller (USB serial commands, I2C to the servo driver) · https://www.aliexpress.com/w/wholesale-arduino-uno-r3-ch340.html)_ | 1 | 6 | 6 | 5 V |
| Actuator | TowerPro MG996R standard servo (metal gears) + round horn _(shoulder servo; elbow servo · https://www.towerpro.com.tw/product/mg996r/)_ | 2 | 6 | 12 | 0.3236 N·m rated / 1.0787 N·m peak, 6 V |
| Actuator | TowerPro SG90 micro servo (nylon gears) + cross horn _(base yaw servo; claw servo · https://www.adafruit.com/product/169)_ | 2 | 2.5 | 5 | 0.0529 N·m rated / 0.1765 N·m peak, 4.8 V |
| Power | IEC C14 panel inlet with fuse drawer and rocker switch, 10 A _(fused, switched mains inlet · https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html)_ | 1 | 3 | 3 | https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html |
| Electronics | PCA9685 16-channel PWM servo driver board (generic, I2C) _(16-channel PWM servo driver (I2C) · https://www.aliexpress.com/w/wholesale-pca9685-16-channel-servo-driver.html)_ | 1 | 2.5 | 2.5 | 5 V |
| Power | Mean Well LRS-50-5 enclosed PSU, 5 V 10 A (50 W) _(5 V 10 A servo supply · https://www.digikey.com/en/products/result?keywords=LRS-50-5)_ | 1 | 13 | 13 | 5 V |
| Power | KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC _(servo power switch · https://www.aliexpress.com/w/wholesale-kcd1-rocker-switch.html)_ | 1 | 0.3 | 0.3 | https://www.aliexpress.com/w/wholesale-kcd1-rocker-switch.html |
| Printed structure | PETG filament for 9 printed parts _(base_link, turntable, upper_arm, forearm, claw_jaw, console, console_lid, supply_case, supply_case_lid)_ | 1 | 10.78 | 10.78 | 426 g of parts (+15 % supports/waste), about 38.8 h of printing |
| Fasteners | Screws, nuts and inserts | 34 | 0.12 | 4.08 | 8x M3 x 10 self-tapping (lid to compartment); 4x M3 x 12 self-tapping (compartment to its base, from below); 4x M3 x 6 self-tapping (Arduino Uno R3 compatible board to standoffs); 4x M2.5 x 6 self-tapping (PCA9685 16-channel PWM servo driver board to standoffs); 2x M3 x 6 self-tapping (Mean Well LRS-50-5 enclosed PSU, 5 V 10 A to standoffs); 8x M2 self-tapping (servo tabs, from the servo kits); 4x M4 screws or desk clamps (base) |
| Wiring | 18 AWG silicone wire _(price estimated)_ | 0.7 | 0.7 | 0.49 | 0.7 m: 0.823 mm2, rated 8 A in a bundle; 0.59 m cut + 10 % waste |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 0.8 | 0.5 | 0.4 | 0.8 m: 0.519 mm2, rated 5.5 A in a bundle; 0.71 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 1.2 | 0.4 | 0.48 | 1.2 m: 0.327 mm2, rated 3.5 A in a bundle; 1.08 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 4 | 0.35 | 1.4 | 4 m: 0.205 mm2, rated 1.75 A in a bundle; 3.59 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 2.6 | 0.3 | 0.78 | 2.6 m: 0.128 mm2, rated 1.1 A in a bundle; 2.31 m cut + 10 % waste |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 5 | 0.08 | 0.4 | 5 pc: rated 15 A per contact |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 7 | 0.03 | 0.21 | 7 pc: rated 17.5 A per contact |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 20 | 0.02 | 0.4 | 20 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 6 | 0.02 | 0.12 | 6 pc: one per cable end |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 0.9 | 0.2 | 0.18 | 0.9 m: 12 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 17 | 0.02 | 0.34 | 17 pc: at every clip, cable end and strain-relief anchor |
| Wiring | Rubber grommet, 7.9 mm panel hole, 4.8 mm bore _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: 8 mm panel hole |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 1 | 0.08 | 0.08 | 1 pc: 6.5 mm panel hole |
| Wiring | PG7 cable gland _(price estimated)_ | 1 | 2.97 | 2.97 | 1 pc: cable exit with strain relief |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 1.2 | 0.4 | 0.48 | 1.2 m: over every cable where it crosses a joint |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| shoulder | 0.3183 | N·m | TowerPro MG996R standard servo (metal gears) + round horn | 3.39x |
| elbow | 0.094 | N·m | TowerPro MG996R standard servo (metal gears) + round horn | 11.48x |

## Notes
- Arduino desk arm: 3 DOF + claw, 280 mm reach, 20 g payload, 0.87 kg, $51 of parts
- Sized for a 0.02 kg payload.
- Joint limits trimmed to the collision-free range found by exact solid sweeps: claw [-0.60, 0.35] -> [0.00, 0.29].
- each joint runs on its servo's own output bearing (no extra bearings), as in MeArm-class kits: links are kept short so the servo holds them continuously
- prices are typical single-unit marketplace prices and vary by seller
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
