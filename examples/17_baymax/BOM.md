# Bill of materials: baymax

**Estimated total: $919.89**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Mechanical | Ball bearing 625-2Z 5x16x5 mm _(left_arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch, clevis bearing, joint wrist_pitch; right_arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch, clevis bearing, joint wrist_pitch · https://www.vxb.com/search?q=625-2Z)_ | 6 | 0.55 | 3.3 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z |
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(9-DoF IMU · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer, USB and sensors · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 2 | 21 | 42 | 12 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(left_arm: joint base_yaw, joint elbow_pitch, joint wrist_pitch; right_arm: joint base_yaw, joint elbow_pitch, joint wrist_pitch; head pan · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 7 | 22 | 154 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Actuator | Feetech STS3250 C002 12 V 50 kg.cm (1:345) _(left_arm: joint shoulder_pitch; right_arm: joint shoulder_pitch · https://openelab.io/products/feetech-sts3250-c002-servo-12v)_ | 2 | 40 | 80 | 1.5691 N·m rated / 4.9033 N·m peak, 12 V |
| Power | Inline ATM mini blade fuse holder, 30 A class (Littelfuse FHM) _(fuse holders · https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders)_ | 6 | 2.5 | 15 | 32 V |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Actuator | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) _(drive motor · https://www.pololu.com/product/4752)_ | 4 | 60.95 | 243.8 | 0.686 N·m rated / 1.373 N·m peak, 12 V |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(on-board computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Power | KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC _(main power switch · https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html)_ | 1 | 1 | 1 | https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 6 | 0.8 | 4.8 | 450 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(servo bus adapter · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(driven wheel · https://www.pololu.com/product/1435)_ | 4 | 11.22 | 44.88 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 33 printed parts _(left_front_bracket, left_rear_bracket, right_front_bracket, right_rear_bracket, battery_tray, computer_tray, motor_driver_1_tray, motor_driver_2_tray, servo_bus_tray, imu_tray, regulator_5v_tray, electronics_enclosure_front, electronics_enclosure_rear, electronics_lid_front, electronics_lid_rear, spine_foot, left_arm_shoulder_wedge, left_arm_base_link, left_arm_turret, left_arm_upper_arm, left_arm_forearm, left_arm_tool_link, right_arm_shoulder_wedge, right_arm_base_link, right_arm_turret, right_arm_upper_arm, right_arm_forearm, right_arm_tool_link, neck_mount, head, head_dome, eyes, camera_bracket)_ | 1 | 34.92 | 34.92 | 1380 g of parts (+15 % supports/waste), about 125.8 h of printing |
| Fasteners | Screws, nuts and inserts | 172 | 0.12 | 20.64 | 24x M3 x 8 socket head (motor face); 8x M3 x 10 socket head + nut (bracket to deck); 1x 20 mm hook-and-loop battery strap; 14x M3 x 8 socket head (tray to deck); 23x M2.5 x 6 screws (board to standoffs); 8x M3 x 8 + nut (enclosure pieces lap joint); 4x M3 x 10 self-tapping (enclosure lid); 4x M3 x 8 + nut (enclosure tabs to deck; drill 3.4 mm through the deck at the tabs); 8x M5 x 12 socket head (base to bench); 32x M2 x 6 case screws; 36x horn screws; 6x M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle); 4x M3 x 10 (head dome to head) |
| Wiring | 12 AWG silicone wire _(price estimated)_ | 0.8 | 2.2 | 1.76 | 0.8 m: 3.308 mm2, rated 20.5 A in a bundle; 0.69 m cut + 10 % waste |
| Wiring | 18 AWG silicone wire _(price estimated)_ | 5.3 | 0.7 | 3.71 | 5.3 m: 0.823 mm2, rated 8 A in a bundle; 4.74 m cut + 10 % waste |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 3.1 | 0.5 | 1.55 | 3.1 m: 0.519 mm2, rated 5.5 A in a bundle; 2.81 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 7.6 | 0.4 | 3.04 | 7.6 m: 0.327 mm2, rated 3.5 A in a bundle; 6.90 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 7.1 | 0.35 | 2.48 | 7.1 m: 0.205 mm2, rated 1.75 A in a bundle; 6.39 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 12.2 | 0.3 | 3.66 | 12.2 m: 0.128 mm2, rated 1.1 A in a bundle; 11.06 m cut + 10 % waste |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 46 | 0.02 | 0.92 | 46 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 11 | 0.02 | 0.22 | 11 pc: one per cable end |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 14 | 0.03 | 0.42 | 14 pc: rated 17.5 A per contact |
| Wiring | Molex 5264 contacts _(price estimated)_ | 46 | 0.05 | 2.3 | 46 pc: rated 3 A per contact |
| Wiring | Molex 5264 housings _(price estimated)_ | 19 | 0.08 | 1.52 | 19 pc: one per cable end |
| Wiring | XT60 contacts _(price estimated)_ | 2 | 0.9 | 1.8 | 2 pc: rated 35 A per contact |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: rated 15 A per contact |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 3.1 | 0.2 | 0.62 | 3.1 m: 31 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 66 | 0.02 | 1.32 | 66 pc: at every clip, cable end and strain-relief anchor |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 1 | 0.08 | 0.08 | 1 pc: 9.5 mm panel hole |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 1.1 | 0.4 | 0.44 | 1.1 m: over every cable where it crosses a joint |
| Wiring | FFC _(price estimated)_ | 1 | 3 | 3 | 1 pc: head_camera to computer |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: servo_bus to computer |
| Wiring | 15 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |
| Wiring | 2 A ATM blade fuse _(price estimated)_ | 3 | 0.25 | 0.75 | 3 pc: plus spares |
| Wiring | 3 A ATM blade fuse _(price estimated)_ | 2 | 0.25 | 0.5 | 2 pc: plus spares |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| left_arm_base_yaw | 0.92 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.2x |
| left_arm_shoulder_pitch | 1.972 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.49x |
| left_arm_elbow_pitch | 0.839 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.51x |
| left_arm_wrist_pitch | 0.169 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 17.39x |
| right_arm_base_yaw | 0.92 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.2x |
| right_arm_shoulder_pitch | 1.972 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.49x |
| right_arm_elbow_pitch | 0.839 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.51x |
| right_arm_wrist_pitch | 0.169 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 17.39x |
| left_front_wheel_joint | 0.156 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.39x |
| left_rear_wheel_joint | 0.156 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.39x |
| right_front_wheel_joint | 0.156 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.39x |
| right_rear_wheel_joint | 0.156 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.39x |

## Notes
- Baymax-style service robot: 5.571 kg, 1.01 m tall, 4WD hidden base, two 4-servo arms, pan head with camera
- Joint limits trimmed to the collision-free range found by exact solid sweeps: left_arm_shoulder_pitch [-1.75, 1.75] -> [-1.11, 1.23]; left_arm_elbow_pitch [-2.10, 2.30] -> [-0.24, 0.25]; left_arm_wrist_pitch [-1.70, 2.30] -> [-0.96, 0.97]; right_arm_shoulder_pitch [-1.75, 1.75] -> [-1.11, 1.23]; right_arm_elbow_pitch [-2.10, 2.30] -> [-0.24, 0.25]; right_arm_wrist_pitch [-1.70, 2.30] -> [-0.96, 0.97].
- Baymax's inflatable vinyl body is a sewn ripstop cover with a foam-lined zip, bought or sewn, with negligible structural role; it hangs on the shoulder yoke and hides a 4WD skid-steer base. It is not inflated, so it does not cushion like the film's.
- Structure: 2020 aluminium extrusion spine and a 6 mm aluminium shoulder yoke; arms are four servos each (shoulder yaw, shoulder pitch, elbow, wrist) splayed 25 deg so they clear the belly; the hands are printed mittens covered with the same fabric.
- Each arm is sized as mounted to lift 0.1 kg in the mitten at full reach; the tipping check includes both arms stretched forward with that payload.
- The head turns on one pan servo; a camera looks out between the eyes through a 12 mm hole.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
