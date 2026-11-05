# Bill of Materials — eva

**Estimated total: $622.68**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Drive | Pololu ball caster, 1" POM ball on ball bearings (#2692) _(ball caster · https://www.pololu.com/product/2692)_ | 2 | 9.95 | 19.9 | https://www.pololu.com/product/2692 |
| Mechanical | Ball bearing 625-2Z 5x16x5 mm _(left_arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch; right_arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch · https://www.vxb.com/search?q=625-2Z)_ | 4 | 0.55 | 2.2 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z |
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(9-DoF IMU · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer / USB · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 1 | 21 | 21 | 12 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(head pan; left_arm: joint shoulder_pitch, joint elbow_pitch; right_arm: joint shoulder_pitch, joint elbow_pitch · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 5 | 22 | 110 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Fasteners | Heat-set insert M3x5.7 (ruthex) _(shell to ribs · https://www.3djake.com/ruthex/threaded-insert-m3-100-pieces)_ | 16 | 0.12 | 1.92 | https://www.3djake.com/ruthex/threaded-insert-m3-100-pieces |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Actuator | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) _(drive motor · https://www.pololu.com/product/4752)_ | 2 | 60.95 | 121.9 | 0.686 N·m rated / 1.373 N·m peak, 12 V |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(on-board computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(servo bus adapter; left_arm: USB to actuator bus; right_arm: USB to actuator bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 3 | 10.6 | 31.8 | 12 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(driven wheel · https://www.pololu.com/product/1435)_ | 2 | 11.22 | 22.44 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 36 printed parts _(left_bracket, right_bracket, front_caster_post, rear_caster_post, skirt_left_front, skirt_left_rear, skirt_right_front, skirt_right_rear, battery_tray, servo_bus_tray, imu_tray, regulator_5v_tray, spine_foot, rib_mid_left, rib_mid_right, rib_top_left, rib_top_right, computer_tray, motor_driver_1_tray, shell_lower_left, shell_lower_right, shell_upper_left, shell_upper_right, neck_mount, head, left_eye, right_eye, camera_bracket, left_arm_base_link, left_arm_upper_arm, left_arm_tool_link, left_arm_shoulder, right_arm_base_link, right_arm_upper_arm, right_arm_tool_link, right_arm_shoulder)_ | 1 | 44.95 | 44.95 | 1777 g of parts (+15 % supports/waste), about 161.9 h of printing |
| Fasteners | Screws, nuts and inserts | 126 | 0.12 | 15.12 | 12x M3 x 8 socket head (motor face); 4x M3 x 10 socket head + nut (bracket to deck); 6x M3 x 6 socket head (caster); 8x M3 x 8 (skirt arcs to the deck edge); 1x 20 mm hook-and-loop battery strap; 12x M3 x 8 socket head (tray to deck); 19x M2.5 x 6 screws (board to standoffs); 16x M3 x 8 + heat-set inserts (shell to ribs); 20x horn screws; 8x M5 x 12 socket head (base to bench); 16x M2 x 6 case screws; 4x M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| left_arm_shoulder_pitch | 0.253 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 11.62x |
| left_arm_elbow_pitch | 0.083 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 35.25x |
| right_arm_shoulder_pitch | 0.253 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 11.62x |
| right_arm_elbow_pitch | 0.083 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 35.25x |
| left_wheel_joint | 0.189 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 3.63x |
| right_wheel_joint | 0.189 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 3.63x |

## Notes
- EVA-style companion robot: 3.369 kg, hidden diff-drive base, pan head with camera, two servo fins
- EVA cannot hover: this EVA rolls on a hidden differential-drive base (two 37D gearmotors, two ball casters) under a dark skirt; the egg rides on a 20 mm aluminium spine above it, so the gap reads as the film's hover.
- The egg body is four printed PETG shell segments (two bands, two halves) screwed to two printed ribs on the spine; the head is one print (230 x 200 x 150 mm) with a dark visor band and two LED eye diffusers.
- The head turns on a single pan servo; the film's free-floating head tilt is not reproduced. The arms are two-servo fins hanging beside the egg (they cannot fold flush into the body like the film's).
- The camera looks out through a 12 mm hole in the visor centre.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
