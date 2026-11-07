# Bill of Materials — rover_arm

**Estimated total: $3859.84**  ·  tier: prosumer  ·  budget: $4000 ✅ within budget

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Mechanical | Ball bearing 608-2Z 8x22x7 mm _(rocker pivot · https://www.vxb.com/search?q=608-2Z)_ | 2 | 0.6 | 1.2 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-608-2Z |
| Mechanical | Ball bearing 625-2Z 5x16x5 mm _(arm: clevis bearing, joint shoulder_pitch, clevis bearing, joint elbow_pitch, clevis bearing, joint wrist_pitch · https://www.vxb.com/search?q=625-2Z)_ | 3 | 0.55 | 1.65 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer, USB and sensors · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 2 | 21 | 42 | 12 V |
| Actuator | DYNAMIXEL XH540-W270-T(R) _(arm: joint shoulder_pitch, joint elbow_pitch · https://robotis.us/dynamixel-xh540-w270-t)_ | 2 | 539.9 | 1079.8 | 2.97 N·m rated / 9.9 N·m peak, 12 V |
| Actuator | DYNAMIXEL XM430-W350-T(R) _(arm: joint base_yaw, joint forearm_roll, joint wrist_pitch, joint wrist_roll, gripper · https://www.robotshop.com/products/robotis-dynamixel-xm430-w350-t-smart-servo-actuator)_ | 5 | 310.39 | 1551.95 | 1.23 N·m rated / 4.1 N·m peak, 12 V |
| Compute | Espressif ESP32-S3-DevKitC-1 (N8R8) _(motor and encoder I/O for the computer · https://www.adafruit.com/product/5364)_ | 1 | 15 | 15 | 5 V |
| Power | Inline ATM mini blade fuse holder, 30 A class (Littelfuse FHM) _(fuse holders · https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders)_ | 6 | 2.5 | 15 | 32 V |
| Compute | NVIDIA Jetson Orin Nano Super Developer Kit _(on-board computer · https://developer.nvidia.com/buy-jetson?product=jetson_orin_nano)_ | 1 | 249 | 249 | 19 V |
| Power | LiPo 3S 5000 mAh 60C, XT60 (Gens Ace G-Tech) _(main battery · https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug)_ | 1 | 59.99 | 59.99 | 11.1 V, 55.5 Wh |
| Actuator | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) _(drive motor · https://www.pololu.com/product/4752)_ | 4 | 60.95 | 243.8 | 0.686 N·m rated / 1.373 N·m peak, 12 V |
| Sensor | Intel RealSense D435i depth camera + IMU _(RGB-D camera · https://www.realsenseai.com/products/depth-camera-d435i/)_ | 1 | 399 | 399 | 5 V |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Power | KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC _(main power switch · https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html)_ | 1 | 1 | 1 | https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 6 | 0.8 | 4.8 | 450 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(servo bus adapter · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(driven wheel · https://www.pololu.com/product/1435)_ | 4 | 11.22 | 44.88 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 21 printed parts _(left_rocker_rear_arm, left_rocker_frame, right_rocker_rear_arm, right_rocker_frame, battery_tray, computer_tray, motor_driver_1_tray, motor_driver_2_tray, io_controller_tray, servo_bus_tray, regulator_5v_tray, depth_camera_bracket, camera_mast, arm_base_link, arm_turret, arm_upper_arm, arm_forearm, arm_forearm_rotator, arm_wrist, arm_wrist_rotator, arm_gripper_jaw)_ | 1 | 21.04 | 21.04 | 832 g of parts (+15 % supports/waste), about 75.8 h of printing |
| Fasteners | Screws, nuts and inserts | 153 | 0.12 | 18.36 | 24x M3 x 8 socket head (motor face); 2x M8 x 40 shoulder bolt + spacer (rocker pivot); 4x M4 x 20 + nut (rocker rear arm to hub); 1x 20 mm hook-and-loop battery strap; 14x M3 x 8 socket head (tray to deck); 19x M2.5 x 6 screws (board to standoffs); 8x M3 x 8 countersunk (body lid); 2x M3 x 6 (camera back); 4x M5 x 12 socket head (base to bench); 24x M2.5 x 6 case screws; 48x horn screws; 3x M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle) |
| Wiring | 12 AWG silicone wire _(price estimated)_ | 0.8 | 2.2 | 1.76 | 0.8 m: 3.308 mm2, rated 20.5 A in a bundle; 0.72 m cut + 10 % waste |
| Wiring | 18 AWG silicone wire _(price estimated)_ | 1.6 | 0.7 | 1.12 | 1.6 m: 0.823 mm2, rated 8 A in a bundle; 1.43 m cut + 10 % waste |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 7.4 | 0.5 | 3.7 | 7.4 m: 0.519 mm2, rated 5.5 A in a bundle; 6.67 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 3.6 | 0.4 | 1.44 | 3.6 m: 0.327 mm2, rated 3.5 A in a bundle; 3.25 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 8.3 | 0.35 | 2.91 | 8.3 m: 0.205 mm2, rated 1.75 A in a bundle; 7.47 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 8.8 | 0.3 | 2.64 | 8.8 m: 0.128 mm2, rated 1.1 A in a bundle; 7.95 m cut + 10 % waste |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 38 | 0.02 | 0.76 | 38 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 9 | 0.02 | 0.18 | 9 pc: one per cable end |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 14 | 0.03 | 0.42 | 14 pc: rated 17.5 A per contact |
| Wiring | Molex 5264 contacts _(price estimated)_ | 1 | 0.05 | 0.05 | 1 pc: rated 3 A per contact |
| Wiring | Molex 5264 housings _(price estimated)_ | 1 | 0.08 | 0.08 | 1 pc: one per cable end |
| Wiring | JST EH 2.5 mm contacts _(price estimated)_ | 37 | 0.03 | 1.11 | 37 pc: rated 3 A per contact |
| Wiring | JST EH 2.5 mm housings _(price estimated)_ | 15 | 0.05 | 0.75 | 15 pc: one per cable end |
| Wiring | XT60 contacts _(price estimated)_ | 2 | 0.9 | 1.8 | 2 pc: rated 35 A per contact |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: rated 15 A per contact |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 3.1 | 0.2 | 0.62 | 3.1 m: 33 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 67 | 0.02 | 1.34 | 67 pc: at every clip, cable end and strain-relief anchor |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 3 | 0.08 | 0.24 | 3 pc: 9.5 mm panel hole |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 3.1 | 0.4 | 1.24 | 3.1 m: over every cable where it crosses a joint |
| Wiring | USB-C _(price estimated)_ | 1 | 3 | 3 | 1 pc: depth_camera to computer |
| Wiring | FFC _(price estimated)_ | 1 | 3 | 3 | 1 pc: mast_camera to computer |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: io_controller to computer |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: servo_bus to computer |
| Wiring | 15 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |
| Wiring | 2 A ATM blade fuse _(price estimated)_ | 3 | 0.25 | 0.75 | 3 pc: plus spares |
| Wiring | 3 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |
| Wiring | 4 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| arm_base_yaw | 0 | N·m | DYNAMIXEL XM430-W350-T(R) | 99x |
| arm_shoulder_pitch | 3.626 | N·m | DYNAMIXEL XH540-W270-T(R) | 2.73x |
| arm_elbow_pitch | 2.116 | N·m | DYNAMIXEL XH540-W270-T(R) | 4.68x |
| arm_forearm_roll | 0.79 | N·m | DYNAMIXEL XM430-W350-T(R) | 5.19x |
| arm_wrist_pitch | 0.79 | N·m | DYNAMIXEL XM430-W350-T(R) | 5.19x |
| arm_wrist_roll | 0.058 | N·m | DYNAMIXEL XM430-W350-T(R) | 70.64x |
| left_front_wheel_joint | 0.13 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.26x |
| left_rear_wheel_joint | 0.13 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.26x |
| right_front_wheel_joint | 0.13 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.26x |
| right_rear_wheel_joint | 0.13 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.26x |

## Notes
- 4-wheel rocker-bogie rover with a 6-DOF arm: 4.648 kg, 1.24 m/s, 1.53 h, jetson_orin_nano_super
- Rocker-bogie after the JPL Open Source Rover, 4 driven wheels, skid steering (the OSR's four corner-steering servos are left out; add them for less tyre scrub).
- The differential bar linking the two rockers through the body is modelled as a URDF mimic between the rocker pivots: a passive bar has no motor, and the model's rockers turn equally and opposite.
- Rockers and bogies are printed in PETG; for outdoor use print them in 6 bolt-on sections from aluminium channel instead (as the OSR does).
- Body: folded 2 mm aluminium box with a 3 mm lid; electronics on printed standoff plates on its floor.
- All motors and servos are 12 V parts run straight from a 3S LiPo; arm servos share the pack through the bus adapter.
- Arm: 6 DOF bolted to the lid front, sized as mounted for a 0.2 kg sample at full reach; the rover's tipping check includes the arm stretched forward, sideways and back with the sample.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
