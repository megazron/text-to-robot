# Bill of materials: eva

**Estimated total: $651.2**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Drive | Pololu ball caster, 1" POM ball on ball bearings (#2692) _(ball caster · https://www.pololu.com/product/2692)_ | 2 | 9.95 | 19.9 | https://www.pololu.com/product/2692 |
| Mechanical | Ball bearing 625-2Z 5x16x5 mm _(left_arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch; right_arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch · https://www.vxb.com/search?q=625-2Z)_ | 4 | 0.55 | 2.2 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z |
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(9-DoF IMU · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer, USB and sensors · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 1 | 21 | 21 | 12 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(head pan; left_arm: joint shoulder_pitch, joint elbow_pitch; right_arm: joint shoulder_pitch, joint elbow_pitch · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 5 | 22 | 110 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Power | Inline ATM mini blade fuse holder, 30 A class (Littelfuse FHM) _(fuse holders · https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders)_ | 6 | 2.5 | 15 | 32 V |
| Fasteners | Heat-set insert M3x5.7 (ruthex) _(shell to ribs · https://www.3djake.com/ruthex/threaded-insert-m3-100-pieces)_ | 16 | 0.12 | 1.92 | https://www.3djake.com/ruthex/threaded-insert-m3-100-pieces |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Actuator | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) _(drive motor · https://www.pololu.com/product/4752)_ | 2 | 60.95 | 121.9 | 0.686 N·m rated / 1.373 N·m peak, 12 V |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(on-board computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Power | KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC _(main power switch · https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html)_ | 1 | 1 | 1 | https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 6 | 0.8 | 4.8 | 450 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(servo bus adapter · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(driven wheel · https://www.pololu.com/product/1435)_ | 2 | 11.22 | 22.44 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 38 printed parts _(left_bracket, right_bracket, front_caster_post, rear_caster_post, skirt_left_front, skirt_left_rear, skirt_right_front, skirt_right_rear, battery_tray, servo_bus_tray, imu_tray, regulator_5v_tray, electronics_enclosure, electronics_lid, spine_foot, rib_mid_left, rib_mid_right, rib_top_left, rib_top_right, computer_tray, motor_driver_1_tray, shell_lower_left, shell_lower_right, shell_upper_left, shell_upper_right, neck_mount, head, left_eye, right_eye, camera_bracket, left_arm_base_link, left_arm_upper_arm, left_arm_tool_link, left_arm_shoulder, right_arm_base_link, right_arm_upper_arm, right_arm_tool_link, right_arm_shoulder)_ | 1 | 47.38 | 47.38 | 1873 g of parts (+15 % supports/waste), about 170.7 h of printing |
| Fasteners | Screws, nuts and inserts | 134 | 0.12 | 16.08 | 12x M3 x 8 socket head (motor face); 4x M3 x 10 socket head + nut (bracket to deck); 6x M3 x 6 socket head (caster); 8x M3 x 8 (skirt arcs to the deck edge); 1x 20 mm hook-and-loop battery strap; 12x M3 x 8 socket head (tray to deck); 19x M2.5 x 6 screws (board to standoffs); 4x M3 x 10 self-tapping (enclosure lid); 4x M3 x 8 + nut (enclosure tabs to deck; drill 3.4 mm through the deck at the tabs); 16x M3 x 8 + heat-set inserts (shell to ribs); 20x horn screws; 8x M5 x 12 socket head (base to bench); 16x M2 x 6 case screws; 4x M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle) |
| Wiring | 16 AWG silicone wire _(price estimated)_ | 1.5 | 1 | 1.5 | 1.5 m: 1.308 mm2, rated 11 A in a bundle; 1.33 m cut + 10 % waste |
| Wiring | 18 AWG silicone wire _(price estimated)_ | 2.3 | 0.7 | 1.61 | 2.3 m: 0.823 mm2, rated 8 A in a bundle; 2.05 m cut + 10 % waste |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 2.8 | 0.5 | 1.4 | 2.8 m: 0.519 mm2, rated 5.5 A in a bundle; 2.51 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 5 | 0.4 | 2 | 5 m: 0.327 mm2, rated 3.5 A in a bundle; 4.53 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 6.6 | 0.35 | 2.31 | 6.6 m: 0.205 mm2, rated 1.75 A in a bundle; 5.92 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 8.3 | 0.3 | 2.49 | 8.3 m: 0.128 mm2, rated 1.1 A in a bundle; 7.49 m cut + 10 % waste |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 28 | 0.02 | 0.56 | 28 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 7 | 0.02 | 0.14 | 7 pc: one per cable end |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 8 | 0.03 | 0.24 | 8 pc: rated 17.5 A per contact |
| Wiring | Molex 5264 contacts _(price estimated)_ | 22 | 0.05 | 1.1 | 22 pc: rated 3 A per contact |
| Wiring | Molex 5264 housings _(price estimated)_ | 11 | 0.08 | 0.88 | 11 pc: one per cable end |
| Wiring | XT60 contacts _(price estimated)_ | 2 | 0.9 | 1.8 | 2 pc: rated 35 A per contact |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: rated 15 A per contact |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 2.2 | 0.2 | 0.44 | 2.2 m: 19 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 42 | 0.02 | 0.84 | 42 pc: at every clip, cable end and strain-relief anchor |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: 9.5 mm panel hole |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: 12 mm panel hole |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 0.6 | 0.4 | 0.24 | 0.6 m: over every cable where it crosses a joint |
| Wiring | FFC _(price estimated)_ | 1 | 3 | 3 | 1 pc: head_camera to computer |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: servo_bus to computer |
| Wiring | 10 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |
| Wiring | 2 A ATM blade fuse _(price estimated)_ | 5 | 0.25 | 1.25 | 5 pc: plus spares |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| left_arm_shoulder_pitch | 0.252 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 11.66x |
| left_arm_elbow_pitch | 0.083 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 35.25x |
| right_arm_shoulder_pitch | 0.252 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 11.66x |
| right_arm_elbow_pitch | 0.083 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 35.25x |
| left_wheel_joint | 0.195 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 3.52x |
| right_wheel_joint | 0.195 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 3.52x |

## Notes
- EVA-style companion robot: 3.471 kg, hidden diff-drive base, pan head with camera, two servo fins
- EVA cannot hover: this EVA rolls on a hidden differential-drive base (two 37D gearmotors, two ball casters) under a dark skirt; the egg rides on a 20 mm aluminium spine above it, so the gap reads as the film's hover.
- The egg body is four printed PETG shell segments (two bands, two halves) screwed to two printed ribs on the spine; the head is one print (230 x 200 x 150 mm) with a dark visor band and two LED eye diffusers.
- The head turns on a single pan servo; the film's free-floating head tilt is not reproduced. The arms are two-servo fins hanging beside the egg (they cannot fold flush into the body like the film's).
- The camera looks out through a 12 mm hole in the visor centre.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
