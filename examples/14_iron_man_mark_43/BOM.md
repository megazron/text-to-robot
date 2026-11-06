# Bill of Materials — iron_man_mark_43

**Estimated total: $339.76**  ·  tier: hobby  ·  budget: $60000 ✅ within budget

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Compute | Arduino Nano compatible board (ATmega328P, CH340, USB-C) _(Arduino Nano · https://www.aliexpress.com/w/wholesale-arduino-nano-type-c-ch340.html)_ | 1 | 3.5 | 3.5 | 5 V |
| Power | LM2596S adjustable buck module (3 A, 43 x 21 mm) _(LM2596 5 V for servos and LEDs · https://www.amazon.com/s?k=LM2596S+buck+module)_ | 1 | 3 | 3 | 5 V |
| Actuator | TowerPro MG996R standard servo (metal gears) + round horn _(faceplate servo (left ear); faceplate servo (right ear, mirrored) · https://www.towerpro.com.tw/product/mg996r/)_ | 2 | 6 | 12 | 0.3236 N·m rated / 1.0787 N·m peak, 6 V |
| Power | 5 mm white LED + 100 ohm resistor (eye / accent light) _(eye light · https://www.aliexpress.com/w/wholesale-5mm-white-led.html)_ | 2 | 0.1 | 0.2 | 3.2 V |
| Power | 2S 18650 pack: two 2500 mAh 20 A cells (Samsung 25R class) in a holder with switch _(2S 18650 pack · https://www.aliexpress.com/w/wholesale-18650-2-slot-battery-holder-switch.html)_ | 1 | 12 | 12 | 7.4 V, 18.5 Wh |
| Power | 50 mm hook-and-loop strap with D-ring buckle, 600 mm _(webbing straps closing the shells round each limb · https://www.velcro.com/business/products/straps/)_ | 22 | 4.5 | 99 | https://www.velcro.com/business/products/straps/ |
| Power | WS2812B RGB LED ring, 12 LEDs, 37 mm (NeoPixel-compatible) _(arc reactor ring (12 LEDs); palm repulsor ring · https://www.adafruit.com/product/1643)_ | 3 | 2 | 6 | 5 V |
| Printed structure | PETG filament for 139 printed parts _(ear_pod_left, ear_pod_right, faceplate_arm_left, faceplate_arm_right, eye_lens_1, eye_lens_2, helmet_back, helmet_top, helmet_faceplate_shell, helmet_chin, torso_37, torso_46, torso_1, torso_2, torso_3, torso_4, torso_5, torso_6, torso_7, torso_8, torso_9, torso_10, torso_11, torso_12, torso_13, torso_14, torso_15, torso_16, torso_17, torso_18, torso_19, torso_20, torso_21, torso_22, torso_23, torso_24, torso_25, torso_26, torso_27, torso_28, torso_29, torso_30, torso_31, torso_32, torso_33, torso_34, torso_35, torso_36, torso_38, torso_39, torso_40, torso_41, torso_42, torso_43, torso_44, torso_45, left_upper_arm_1, left_upper_arm_2, left_upper_arm_3, left_upper_arm_4, left_upper_arm_5, left_upper_arm_6, left_upper_arm_7, left_upper_arm_8, left_upper_arm_9, left_upper_arm_10, left_upper_arm_11, left_upper_arm_12, left_upper_arm_13, left_upper_arm_14, left_upper_arm_15, right_upper_arm_1, right_upper_arm_2, right_upper_arm_3, right_upper_arm_4, right_upper_arm_5, right_upper_arm_6, right_upper_arm_7, right_upper_arm_8, right_upper_arm_9, right_upper_arm_10, right_upper_arm_11, right_upper_arm_12, right_upper_arm_13, right_upper_arm_14, right_upper_arm_15, left_thigh_1, left_thigh_2, left_thigh_3, left_thigh_4, left_thigh_5, left_thigh_6, left_thigh_7, left_thigh_8, left_thigh_9, right_thigh_1, right_thigh_2, right_thigh_3, right_thigh_4, right_thigh_5, right_thigh_6, right_thigh_7, right_thigh_8, right_thigh_9, left_forearm_1, left_forearm_2, left_forearm_3, left_forearm_4, left_forearm_5, right_forearm_1, right_forearm_2, right_forearm_3, right_forearm_4, right_forearm_5, left_shin_1, left_shin_2, left_shin_3, left_shin_4, left_shin_5, left_shin_6, right_shin_1, right_shin_2, right_shin_3, right_shin_4, right_shin_5, right_shin_6, left_foot_1, left_foot_2, right_foot_1, right_foot_2, left_hand_4, right_hand_5, left_hand_1, left_hand_2, left_hand_3, right_hand_1, right_hand_2, right_hand_3, electronics_box)_ | 1 | 203.58 | 203.58 | 8047 g of parts (+15 % supports/waste), about 733.4 h of printing |
| Fasteners | Screws, nuts and inserts | 4 | 0.12 | 0.48 | 4x M2 self-tapping (servo tabs, from the servo kits) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| faceplate | 0.7584 | N·m | TowerPro MG996R standard servo (metal gears) + round horn | 2.84x |

## Notes
- Iron Man Mark 43 (full wearable suit): 139 printed pieces, 8.7 kg filament, motorised faceplate, $327 incl. filament
- armour shape from: body: "Iron man armored suit" by octv h (Printables 1524711, CC0, provenance unverified); helmet: Iron Man wearable helmet Mark 42 by Manifold3D (Printables 449081, CC BY-SA); 3 mm walls, 2 mm faceplate, 15 % gyroid infill (shells are mostly walls)
- filament at $22/kg, 8 % waste
- the suit is worn armour over a black undersuit: the wearer moves every joint; nothing powers the limbs (hobby servos cannot move a person)
- the wearer is 89 cm chest at 1.75 m and the pieces scale evenly with height; check against your own measurements before printing
- gaps at the groin, armpits and elbows are cut on purpose so the joints move; the undersuit shows through them, as on real builds
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
