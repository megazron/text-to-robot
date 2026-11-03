# Bill of Materials — baymax

**Estimated total: $863.75**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(9-DoF IMU · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer / USB · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 2 | 21 | 42 | 12 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(left_arm: joint base_yaw, joint elbow_pitch, joint wrist_pitch; right_arm: joint base_yaw, joint elbow_pitch, joint wrist_pitch; head pan · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 7 | 22 | 154 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Actuator | Feetech STS3250 C002 12 V 50 kg.cm (1:345) _(left_arm: joint shoulder_pitch; right_arm: joint shoulder_pitch · https://openelab.io/products/feetech-sts3250-c002-servo-12v)_ | 2 | 40 | 80 | 1.5691 N·m rated / 4.9033 N·m peak, 12 V |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Actuator | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) _(drive motor · https://www.pololu.com/product/4752)_ | 4 | 60.95 | 243.8 | 0.686 N·m rated / 1.373 N·m peak, 12 V |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(on-board computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(servo bus adapter; left_arm: USB to actuator bus; right_arm: USB to actuator bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 3 | 10.6 | 31.8 | 12 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(driven wheel · https://www.pololu.com/product/1435)_ | 4 | 11.22 | 44.88 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 28 printed parts _(left_front_bracket, left_rear_bracket, right_front_bracket, right_rear_bracket, battery_tray, computer_tray, motor_driver_1_tray, motor_driver_2_tray, servo_bus_tray, imu_tray, regulator_5v_tray, spine_foot, left_arm_shoulder_wedge, left_arm_base_link, left_arm_turret, left_arm_upper_arm, left_arm_forearm, left_arm_tool_link, right_arm_shoulder_wedge, right_arm_base_link, right_arm_turret, right_arm_upper_arm, right_arm_forearm, right_arm_tool_link, neck_mount, head, eyes, camera_bracket)_ | 1 | 18.3 | 18.3 | 723 g of parts (+15 % supports/waste), about 65.9 h of printing |
| Fasteners | Screws, nuts and inserts | 146 | 0.12 | 17.52 | 24x M3 x 8 socket head (motor face); 8x M3 x 10 socket head + nut (bracket to deck); 1x 20 mm hook-and-loop battery strap; 14x M3 x 8 socket head (tray to deck); 23x M2.5 x 6 screws (board to standoffs); 8x M5 x 12 socket head (base to bench); 32x M2 x 6 case screws; 36x horn screws |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| left_arm_base_yaw | 0.949 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.1x |
| left_arm_shoulder_pitch | 2.034 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.41x |
| left_arm_elbow_pitch | 1.023 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.88x |
| left_arm_wrist_pitch | 0.262 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 11.25x |
| right_arm_base_yaw | 0.949 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.1x |
| right_arm_shoulder_pitch | 2.034 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.41x |
| right_arm_elbow_pitch | 1.023 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.88x |
| right_arm_wrist_pitch | 0.262 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 11.25x |
| left_front_wheel_joint | 0.138 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.98x |
| left_rear_wheel_joint | 0.138 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.98x |
| right_front_wheel_joint | 0.138 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.98x |
| right_rear_wheel_joint | 0.138 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.98x |

## Notes
- Baymax-style service robot: 4.907 kg, 1.01 m tall, 4WD hidden base, two 4-servo arms, pan head with camera
- Baymax's inflatable vinyl body is a sewn ripstop cover with a foam-lined zip, bought or sewn, with negligible structural role; it hangs on the shoulder yoke and hides a 4WD skid-steer base. It is not inflated, so it does not cushion like the film's.
- Structure: 2020 aluminium extrusion spine and a 6 mm aluminium shoulder yoke; arms are four servos each (shoulder yaw, shoulder pitch, elbow, wrist) splayed 25 deg so they clear the belly; the hands are printed mittens covered with the same fabric.
- Each arm is sized as mounted to lift 0.2 kg in the mitten at full reach; the tipping check includes both arms stretched forward with that payload.
- The head turns on one pan servo; a camera looks out between the eyes through a 12 mm hole.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
