# Bill of Materials — wall_e

**Estimated total: $784.53**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Mechanical | Ball bearing 625-2Z 5x16x5 mm _(idler wheel bearings; neck: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch; left_arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch; right_arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch · https://www.vxb.com/search?q=625-2Z)_ | 14 | 0.55 | 7.7 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer / USB · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 1 | 21 | 21 | 12 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(neck: joint base_yaw, joint elbow_pitch; left_arm: joint shoulder_pitch, joint elbow_pitch, gripper; right_arm: joint shoulder_pitch, joint elbow_pitch, gripper · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 8 | 22 | 176 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Actuator | Feetech STS3250 C002 12 V 50 kg.cm (1:345) _(neck: joint shoulder_pitch · https://openelab.io/products/feetech-sts3250-c002-servo-12v)_ | 1 | 40 | 40 | 1.5691 N·m rated / 4.9033 N·m peak, 12 V |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Actuator | Pololu 70:1 Metal Gearmotor 37Dx70L 12 V with 64 CPR encoder (#4754) _(drive motor · https://www.pololu.com/product/4754)_ | 2 | 60.95 | 121.9 | 0.981 N·m rated / 2.648 N·m peak, 12 V |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 2 | 25 | 50 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(on-board computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(servo bus adapter; neck: USB to actuator bus; left_arm: USB to actuator bus; right_arm: USB to actuator bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 4 | 10.6 | 42.4 | 12 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(idler wheel; driven wheel · https://www.pololu.com/product/1435)_ | 6 | 11.22 | 67.32 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 29 printed parts _(base_link, left_track_frame, right_track_frame, body_left, body_right, body_back, body_front, body_top, battery_tray, motor_driver_1_tray, regulator_5v_tray, shelf, computer_tray, servo_bus_tray, neck_base_link, neck_upper_arm, neck_turret, neck_tool_link, head, left_arm_base_link, left_arm_upper_arm, left_arm_forearm, left_arm_gripper_jaw, left_arm_shoulder, right_arm_base_link, right_arm_upper_arm, right_arm_forearm, right_arm_gripper_jaw, right_arm_shoulder)_ | 1 | 63.02 | 63.02 | 2491 g of parts (+15 % supports/waste), about 227.0 h of printing |
| Fasteners | Screws, nuts and inserts | 152 | 0.12 | 18.24 | 4x M5 x 30 shoulder bolt (idler axle); 12x M3 x 8 socket head (motor face); 24x M3 x 10 + printed corner cleats (body panels); 1x 20 mm hook-and-loop battery strap; 10x M3 x 8 socket head (tray to deck); 15x M2.5 x 6 screws (board to standoffs); 4x M3 x 10 + printed cleats (shelf to side panels); 12x M5 x 12 socket head (base to bench); 28x M2 x 6 case screws; 36x horn screws; 6x M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| neck_shoulder_pitch | 1.285 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 3.82x |
| neck_base_yaw | 0.388 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 7.59x |
| neck_elbow_pitch | 0.891 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.3x |
| left_arm_shoulder_pitch | 0.83 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.54x |
| left_arm_elbow_pitch | 0.374 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 7.87x |
| right_arm_shoulder_pitch | 0.83 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.54x |
| right_arm_elbow_pitch | 0.374 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 7.87x |
| left_middle_wheel_joint | 0.073 | N·m | Pololu 70:1 Metal Gearmotor 37Dx70L 12 V with 64 CPR encoder (#4754) | 13.49x |
| right_middle_wheel_joint | 0.073 | N·m | Pololu 70:1 Metal Gearmotor 37Dx70L 12 V with 64 CPR encoder (#4754) | 13.49x |

## Notes
- WALL-E style tracked robot: 3.888 kg, 0.57 m/s, pan/tilt/lift head with stereo cameras, two servo arms
- WALL-E's tracks are represented by three 90 mm wheels per side: the middle wheel of each side is driven by a gearmotor, the front and rear are idlers on 625 bearings. A real build wraps a printed or rubber track (or a T5 timing belt) round the three wheels, so traction and drive sizing use the full weight.
- The film's telescoping neck is replaced by a servo-driven pitch neck (the 'lift') with pan and tilt servos above it; the binoculars are two printed eye barrels with a Raspberry Pi Camera Module 3 in each (stereo pair).
- Arms: a shoulder and an elbow servo plus a one-servo gripper hand per side, reusing the arm designer's brackets; they are sized as mounted (pointing forward) for the hand payload.
- The body is five printed PETG panels bolted with corner cleats on the deck; no compactor mechanism.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
