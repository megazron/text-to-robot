# Bill of Materials — baymax

**Estimated total: $3657.01**  ·  tier: prosumer

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Mechanical | Ball bearing 625-2Z 5x16x5 mm _(left_arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch, clevis bearing, joint wrist_pitch; right_arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch, clevis bearing, joint wrist_pitch · https://www.vxb.com/search?q=625-2Z)_ | 6 | 0.55 | 3.3 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z |
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(9-DoF IMU · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer / USB · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 2 | 21 | 42 | 12 V |
| Electronics | ROBOTIS U2D2 USB to TTL/RS-485 interface _(left_arm: USB to actuator bus; right_arm: USB to actuator bus · https://www.generationrobots.com/en/400848-usb2dynamixel-robotis.html)_ | 2 | 32.1 | 64.2 | 5 V |
| Actuator | DYNAMIXEL XH540-W270-T(R) _(left_arm: joint shoulder_pitch; right_arm: joint shoulder_pitch · https://robotis.us/dynamixel-xh540-w270-t)_ | 2 | 539.9 | 1079.8 | 2.97 N·m rated / 9.9 N·m peak, 12 V |
| Actuator | DYNAMIXEL XM430-W350-T(R) _(left_arm: joint base_yaw, joint elbow_pitch, joint wrist_pitch; right_arm: joint base_yaw, joint elbow_pitch, joint wrist_pitch · https://www.robotshop.com/products/robotis-dynamixel-xm430-w350-t-smart-servo-actuator)_ | 6 | 310.39 | 1862.34 | 1.23 N·m rated / 4.1 N·m peak, 12 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(head pan · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 1 | 22 | 22 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Actuator | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) _(drive motor · https://www.pololu.com/product/4752)_ | 4 | 60.95 | 243.8 | 0.686 N·m rated / 1.373 N·m peak, 12 V |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(on-board computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(servo bus adapter · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(driven wheel · https://www.pololu.com/product/1435)_ | 4 | 11.22 | 44.88 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 28 printed parts _(left_front_bracket, left_rear_bracket, right_front_bracket, right_rear_bracket, battery_tray, computer_tray, motor_driver_1_tray, motor_driver_2_tray, servo_bus_tray, imu_tray, regulator_5v_tray, spine_foot, left_arm_shoulder_wedge, left_arm_base_link, left_arm_turret, left_arm_upper_arm, left_arm_forearm, left_arm_tool_link, right_arm_shoulder_wedge, right_arm_base_link, right_arm_turret, right_arm_upper_arm, right_arm_forearm, right_arm_tool_link, neck_mount, head, eyes, camera_bracket)_ | 1 | 31.52 | 31.52 | 1246 g of parts (+15 % supports/waste), about 113.5 h of printing |
| Fasteners | Screws, nuts and inserts | 176 | 0.12 | 21.12 | 24x M3 x 8 socket head (motor face); 8x M3 x 10 socket head + nut (bracket to deck); 1x 20 mm hook-and-loop battery strap; 14x M3 x 8 socket head (tray to deck); 23x M2.5 x 6 screws (board to standoffs); 8x M5 x 12 socket head (base to bench); 32x M2.5 x 6 case screws; 60x horn screws; 6x M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| left_arm_base_yaw | 1.231 | N·m | DYNAMIXEL XM430-W350-T(R) | 3.33x |
| left_arm_shoulder_pitch | 2.64 | N·m | DYNAMIXEL XH540-W270-T(R) | 3.75x |
| left_arm_elbow_pitch | 1.182 | N·m | DYNAMIXEL XM430-W350-T(R) | 3.47x |
| left_arm_wrist_pitch | 0.262 | N·m | DYNAMIXEL XM430-W350-T(R) | 15.67x |
| right_arm_base_yaw | 1.231 | N·m | DYNAMIXEL XM430-W350-T(R) | 3.33x |
| right_arm_shoulder_pitch | 2.64 | N·m | DYNAMIXEL XH540-W270-T(R) | 3.75x |
| right_arm_elbow_pitch | 1.182 | N·m | DYNAMIXEL XM430-W350-T(R) | 3.47x |
| right_arm_wrist_pitch | 0.262 | N·m | DYNAMIXEL XM430-W350-T(R) | 15.67x |
| left_front_wheel_joint | 0.162 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.24x |
| left_rear_wheel_joint | 0.162 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.24x |
| right_front_wheel_joint | 0.162 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.24x |
| right_rear_wheel_joint | 0.162 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.24x |

## Notes
- Baymax-style service robot: 5.773 kg, 1.01 m tall, 4WD hidden base, two 4-servo arms, pan head with camera
- Baymax's inflatable vinyl body is a sewn ripstop cover with a foam-lined zip, bought or sewn, with negligible structural role; it hangs on the shoulder yoke and hides a 4WD skid-steer base. It is not inflated, so it does not cushion like the film's.
- Structure: 2020 aluminium extrusion spine and a 6 mm aluminium shoulder yoke; arms are four servos each (shoulder yaw, shoulder pitch, elbow, wrist) splayed 25 deg so they clear the belly; the hands are printed mittens covered with the same fabric.
- Each arm is sized as mounted to lift 0.2 kg in the mitten at full reach; the tipping check includes both arms stretched forward with that payload.
- The head turns on one pan servo; a camera looks out between the eyes through a 12 mm hole.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
