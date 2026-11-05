# Bill of Materials — iron_man_mark_43

**Estimated total: $262.98**  ·  tier: hobby  ·  budget: $60000 ✅ within budget

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Compute | Arduino Nano compatible board (ATmega328P, CH340, USB-C) _(Arduino Nano · https://www.aliexpress.com/w/wholesale-arduino-nano-type-c-ch340.html)_ | 1 | 3.5 | 3.5 | 5 V |
| Power | LM2596S adjustable buck module (3 A, 43 x 21 mm) _(LM2596 5 V for servos and LEDs · https://www.amazon.com/s?k=LM2596S+buck+module)_ | 1 | 3 | 3 | 5 V |
| Actuator | TowerPro MG90S micro servo (metal gears) + cross horn _(faceplate servo (left ear); faceplate servo (right ear, mirrored) · https://www.adafruit.com/product/1143)_ | 2 | 4 | 8 | 0.0647 N·m rated / 0.2157 N·m peak, 6 V |
| Power | 5 mm white LED + 100 ohm resistor (eye / accent light) _(eye light · https://www.aliexpress.com/w/wholesale-5mm-white-led.html)_ | 2 | 0.1 | 0.2 | 3.2 V |
| Power | 2S 18650 pack: two 2500 mAh 20 A cells (Samsung 25R class) in a holder with switch _(2S 18650 pack · https://www.aliexpress.com/w/wholesale-18650-2-slot-battery-holder-switch.html)_ | 1 | 12 | 12 | 7.4 V, 18.5 Wh |
| Power | 50 mm hook-and-loop strap with D-ring buckle, 600 mm _(webbing straps closing the split shells · https://www.velcro.com/business/products/straps/)_ | 30 | 4.5 | 135 | https://www.velcro.com/business/products/straps/ |
| Power | WS2812B RGB LED ring, 12 LEDs, 37 mm (NeoPixel-compatible) _(arc reactor ring (12 LEDs); palm repulsor ring · https://www.adafruit.com/product/1643)_ | 3 | 2 | 6 | 5 V |
| Printed structure | PETG filament for 70 printed parts _(helmet_faceplate, helmet_cranium_1, helmet_cranium_2, helmet_cranium_3, helmet_cranium_4, helmet_cranium_5, helmet_cranium_6, helmet_cranium_7, helmet_cranium_8, chest_1, chest_2, chest_3, chest_4, chest_5, chest_6, chest_7, chest_8, chest_9, chest_10, chest_11, chest_12, chest_13, chest_14, chest_15, chest_16, chest_17, chest_18, electronics_box, left_shoulder_bell_1, left_shoulder_bell_2, left_bicep_1, left_bicep_2, left_gauntlet_1, left_gauntlet_2, left_hand_armour_1, left_hand_armour_2, left_thigh_armour_1, left_thigh_armour_2, left_thigh_armour_3, left_thigh_armour_4, left_shin_armour_1, left_shin_armour_2, left_shin_armour_3, left_shin_armour_4, left_boot_1, left_boot_2, left_boot_3, left_boot_4, right_shoulder_bell_1, right_shoulder_bell_2, right_bicep_1, right_bicep_2, right_gauntlet_1, right_gauntlet_2, right_hand_armour_1, right_hand_armour_2, right_thigh_armour_1, right_thigh_armour_2, right_thigh_armour_3, right_thigh_armour_4, right_shin_armour_1, right_shin_armour_2, right_shin_armour_3, right_shin_armour_4, right_boot_1, right_boot_2, right_boot_3, right_boot_4, belt_1, belt_2)_ | 1 | 94.8 | 94.8 | 3747 g of parts (+15 % supports/waste), about 341.5 h of printing |
| Fasteners | Screws, nuts and inserts | 4 | 0.12 | 0.48 | 4x M2 self-tapping (servo tabs, from the servo kits) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| faceplate | 0.1375 | N·m | TowerPro MG90S micro servo (metal gears) + cross horn | 3.14x |

## Notes
- Iron Man Mark 43 (full wearable suit): 70 printed pieces, 4.0 kg filament, motorised faceplate, $257 incl. filament
- Joint limits trimmed to the collision-free range found by exact solid sweeps: left_elbow [-2.40, 0.00] -> [-1.82, 0.00]; left_hip [-1.90, 0.40] -> [-1.53, 0.40]; left_knee [0.00, 2.20] -> [0.00, 1.86]; right_elbow [-2.40, 0.00] -> [-1.82, 0.00]; right_hip [-1.90, 0.40] -> [-1.53, 0.40]; right_knee [0.00, 2.20] -> [0.00, 1.86].
- padding gap 14 mm, PLA/PETG walls 3 mm, 15 % gyroid infill (shells are mostly walls)
- filament at $22/kg, 8 % waste
- the suit is worn armour: the wearer moves every joint; nothing powers the limbs (hobby servos cannot move a person)
- wearer proportions from standard segment ratios scaled to the stated height; check against your own measurements before printing
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
