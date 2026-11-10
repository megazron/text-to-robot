# Bill of materials: robot_hand

**Estimated total: $87.6**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Compute | Arduino Nano compatible board (ATmega328P, CH340, USB-C) _(Arduino Nano (serial commands from the PC) · https://www.aliexpress.com/w/wholesale-arduino-nano-type-c-ch340.html)_ | 1 | 3.5 | 3.5 | 5 V |
| Actuator | TowerPro MG90S micro servo (metal gears) + cross horn _(thumb opposition (direct drive) · https://www.adafruit.com/product/1143)_ | 1 | 4 | 4 | 0.0647 N·m rated / 0.2157 N·m peak, 6 V |
| Actuator | TowerPro MG996R standard servo (metal gears) + round horn _(index flexion (pulls its tendon); middle flexion (pulls its tendon); ring flexion (pulls its tendon); little flexion (pulls its tendon); … · https://www.towerpro.com.tw/product/mg996r/)_ | 5 | 6 | 30 | 0.3236 N·m rated / 1.0787 N·m peak, 6 V |
| Power | IEC C14 panel inlet with fuse drawer and rocker switch, 10 A _(fused, switched mains inlet · https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html)_ | 1 | 3 | 3 | https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html |
| Electronics | PCA9685 16-channel PWM servo driver board (generic, I2C) _(16-channel PWM servo driver · https://www.aliexpress.com/w/wholesale-pca9685-16-channel-servo-driver.html)_ | 1 | 2.5 | 2.5 | 5 V |
| Power | Mean Well LRS-50-5 enclosed PSU, 5 V 10 A (50 W) _(5 V 10 A servo supply (V+ terminal of the PCA9685) · https://www.digikey.com/en/products/result?keywords=LRS-50-5)_ | 1 | 13 | 13 | 5 V |
| Printed structure | PETG filament for 25 printed parts _(base_link, forearm_lid, spool_1, spool_2, spool_3, spool_4, spool_5, palm, index_proximal, index_middle, index_distal, middle_proximal, middle_middle, middle_distal, ring_proximal, ring_middle, ring_distal, little_proximal, little_middle, little_distal, thumb_base, thumb_proximal, thumb_distal, control_case, control_case_lid)_ | 1 | 14.66 | 14.66 | 580 g of parts (+15 % supports/waste), about 52.8 h of printing |
| Fasteners | Screws, nuts and inserts | 55 | 0.12 | 6.6 | 20x M4 x 12 (servo ears); 1x braided fishing line 0.5 mm (40 kg), 2 m (tendons); 4x M3 x 8 (lid); 4x M3 x 12 (palm to forearm); 12x 2 mm steel pin, 18 mm (finger joints); 4x elastic cord (finger return), 0.3 m; 4x M3 x 10 self-tapping (lid to compartment); 2x M3 x 6 self-tapping (Mean Well LRS-50-5 enclosed PSU, 5 V 10 A to standoffs); 4x M2.5 x 6 self-tapping (PCA9685 16-channel PWM servo driver board to standoffs) |
| Wiring | 18 AWG silicone wire _(price estimated)_ | 0.4 | 0.7 | 0.28 | 0.4 m: 0.823 mm2, rated 8 A in a bundle; 0.34 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 7.3 | 0.4 | 2.92 | 7.3 m: 0.327 mm2, rated 3.5 A in a bundle; 6.63 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 2.8 | 0.35 | 0.98 | 2.8 m: 0.205 mm2, rated 1.75 A in a bundle; 2.52 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 5 | 0.3 | 1.5 | 5 m: 0.128 mm2, rated 1.1 A in a bundle; 4.47 m cut + 10 % waste |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 3 | 0.08 | 0.24 | 3 pc: rated 15 A per contact |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 7 | 0.03 | 0.21 | 7 pc: rated 17.5 A per contact |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 26 | 0.02 | 0.52 | 26 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 8 | 0.02 | 0.16 | 8 pc: one per cable end |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 1.1 | 0.2 | 0.22 | 1.1 m: 18 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 17 | 0.02 | 0.34 | 17 pc: at every clip, cable end and strain-relief anchor |
| Wiring | PG7 cable gland _(price estimated)_ | 1 | 2.97 | 2.97 | 1 pc: cable exit with strain relief |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| index_mcp | 0.216 | N·m | TowerPro MG996R standard servo (metal gears) + round horn | 2x |
| middle_mcp | 0.216 | N·m | TowerPro MG996R standard servo (metal gears) + round horn | 2x |
| ring_mcp | 0.216 | N·m | TowerPro MG996R standard servo (metal gears) + round horn | 2x |
| little_mcp | 0.216 | N·m | TowerPro MG996R standard servo (metal gears) + round horn | 2x |

## Notes
- Five-finger tendon hand: 5 MG996R flexion servos in the forearm, an MG90S thumb swing, 16 joints, squeezes about 10 N, holds about 1.17 kg
- Sized for a 1.17 kg payload.
- Each finger is underactuated: one tendon over three joints, elastic cord on the back to open it. The middle and end joints are modelled as following the base joint (mimic); a real tendon finger also wraps round an object's shape.
- Fingertip forces use the MG996R's rated torque (not its stall torque) through a 6 mm spool: a household-object hand (cups, fruit, small tools), not a crushing grip.
- Glue silicone pads (or print TPU caps) on the fingertips and palm: the grip numbers assume friction 0.6.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
