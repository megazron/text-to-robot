# Bill of materials: humanoid_robot

**Estimated total: $4323.54**  ·  tier: prosumer

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(IMU (pelvis) · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V regulator (computer); 5 V regulator (arm / neck XL330 bus) · https://www.pololu.com/product/4091)_ | 2 | 39.95 | 79.9 | 5 V |
| Electronics | ROBOTIS U2D2 USB to TTL/RS-485 interface _(USB to the arm / neck DYNAMIXEL bus · https://www.generationrobots.com/en/400848-usb2dynamixel-robotis.html)_ | 1 | 32.1 | 32.1 | 5 V |
| Actuator | DYNAMIXEL XH540-W270-T(R) _(joint l_hip_roll; joint l_hip_pitch; joint l_knee; joint r_hip_roll; … · https://robotis.us/dynamixel-xh540-w270-t)_ | 6 | 539.9 | 3239.4 | 2.97 N·m rated / 9.9 N·m peak, 12 V |
| Actuator | DYNAMIXEL XL330-M288-T _(joint l_elbow; gripper; joint r_elbow; joint neck_pan; … · https://robotis.us/dynamixel-xl330-m288-t)_ | 6 | 25.9 | 155.4 | 0.156 N·m rated / 0.52 N·m peak, 5 V |
| Actuator | DYNAMIXEL XL430-W250-T _(joint l_shoulder_pitch; joint l_shoulder_roll; joint l_upper_arm_yaw; joint r_shoulder_pitch; … · https://robotis.us/dynamixel-xl430-w250-t)_ | 6 | 44.9 | 269.4 | 0.42 N·m rated / 1.4 N·m peak, 11.1 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(joint l_hip_yaw; joint l_ankle_roll; joint r_hip_yaw; joint r_ankle_roll · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 4 | 22 | 88 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Actuator | Feetech STS3250 C002 12 V 50 kg.cm (1:345) _(joint l_ankle_pitch; joint r_ankle_pitch · https://openelab.io/products/feetech-sts3250-c002-servo-12v)_ | 2 | 40 | 80 | 1.5691 N·m rated / 4.9033 N·m peak, 12 V |
| Power | Inline ATM mini blade fuse holder, 30 A class (Littelfuse FHM) _(fuse holders · https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders)_ | 12 | 2.5 | 30 | 32 V |
| Power | LiPo 3S 5000 mAh 60C, XT60 (Gens Ace G-Tech) _(main battery · https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug)_ | 1 | 59.99 | 59.99 | 11.1 V, 55.5 Wh |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(head camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(main computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Power | KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC _(main power switch · https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html)_ | 1 | 1 | 1 | https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 14 | 0.8 | 11.2 | 450 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to leg servo bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 30 printed parts _(base_link, torso, l_hip_yaw_link, l_hip_roll_link, l_hip_pitch_link, l_knee_link, l_ankle_pitch_link, l_ankle_roll_link, r_hip_yaw_link, r_hip_roll_link, r_hip_pitch_link, r_knee_link, r_ankle_pitch_link, r_ankle_roll_link, l_shoulder_pitch_link, l_shoulder_roll_link, l_upper_arm_yaw_link, l_elbow_link, l_gripper_jaw, r_shoulder_pitch_link, r_shoulder_roll_link, r_upper_arm_yaw_link, r_elbow_link, r_gripper_jaw, neck_pan_link, neck_tilt_link, side_panel_left, side_panel_right, chest_panel, imu_hood)_ | 1 | 34.23 | 34.23 | 1353 g of parts (+15 % supports/waste), about 123.4 h of printing |
| Fasteners | Screws, nuts and inserts | 196 | 0.12 | 23.52 | 4x M3 x 12 torso-to-pelvis bolts; 88x M2/M2.5 x 6 case screws; 88x horn / hub screws; 4x M3 x 8 self-tapping (side_panel_left); 4x M3 x 8 self-tapping (side_panel_right); 4x M3 x 8 self-tapping (chest_panel); 4x M3 x 12 self-tapping (hood to deck) |
| Wiring | 12 AWG silicone wire _(price estimated)_ | 0.9 | 2.2 | 1.98 | 0.9 m: 3.308 mm2, rated 20.5 A in a bundle; 0.80 m cut + 10 % waste |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 3.9 | 0.5 | 1.95 | 3.9 m: 0.519 mm2, rated 5.5 A in a bundle; 3.46 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 12.6 | 0.4 | 5.04 | 12.6 m: 0.327 mm2, rated 3.5 A in a bundle; 11.41 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 11.2 | 0.35 | 3.92 | 11.2 m: 0.205 mm2, rated 1.75 A in a bundle; 10.15 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 12.9 | 0.3 | 3.87 | 12.9 m: 0.128 mm2, rated 1.1 A in a bundle; 11.68 m cut + 10 % waste |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 10 | 0.02 | 0.2 | 10 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 3 | 0.02 | 0.06 | 3 pc: one per cable end |
| Wiring | Molex 5264 contacts _(price estimated)_ | 25 | 0.05 | 1.25 | 25 pc: rated 3 A per contact |
| Wiring | Molex 5264 housings _(price estimated)_ | 13 | 0.08 | 1.04 | 13 pc: one per cable end |
| Wiring | JST EH 2.5 mm contacts _(price estimated)_ | 90 | 0.03 | 2.7 | 90 pc: rated 3 A per contact |
| Wiring | JST EH 2.5 mm housings _(price estimated)_ | 39 | 0.05 | 1.95 | 39 pc: one per cable end |
| Wiring | XT60 contacts _(price estimated)_ | 2 | 0.9 | 1.8 | 2 pc: rated 35 A per contact |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: rated 15 A per contact |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 2 | 0.03 | 0.06 | 2 pc: rated 17.5 A per contact |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 3.5 | 0.2 | 0.7 | 3.5 m: 11 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 71 | 0.02 | 1.42 | 71 pc: at every clip, cable end and strain-relief anchor |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 1 | 0.08 | 0.08 | 1 pc: 12 mm panel hole |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 5 | 0.08 | 0.4 | 5 pc: 9.5 mm panel hole |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 9.3 | 0.4 | 3.72 | 9.3 m: over every cable where it crosses a joint |
| Wiring | FFC _(price estimated)_ | 1 | 3 | 3 | 1 pc: head_camera to computer |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: leg_bus to computer |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: arm_bus to computer |
| Wiring | 15 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |
| Wiring | 2 A ATM blade fuse _(price estimated)_ | 7 | 0.25 | 1.75 | 7 pc: plus spares |
| Wiring | 3 A ATM blade fuse _(price estimated)_ | 2 | 0.25 | 0.5 | 2 pc: plus spares |
| Wiring | 4 A ATM blade fuse _(price estimated)_ | 2 | 0.25 | 0.5 | 2 pc: plus spares |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| l_hip_yaw | 0.404 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 7.28x |
| l_hip_roll | 4.224 | N·m | DYNAMIXEL XH540-W270-T(R) | 2.34x |
| l_hip_pitch | 5.434 | N·m | DYNAMIXEL XH540-W270-T(R) | 1.82x |
| l_knee | 5.13 | N·m | DYNAMIXEL XH540-W270-T(R) | 1.93x |
| l_ankle_pitch | 2.792 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 1.76x |
| l_ankle_roll | 1.168 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.52x |
| r_hip_yaw | 0.404 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 7.28x |
| r_hip_roll | 4.224 | N·m | DYNAMIXEL XH540-W270-T(R) | 2.34x |
| r_hip_pitch | 5.434 | N·m | DYNAMIXEL XH540-W270-T(R) | 1.82x |
| r_knee | 5.13 | N·m | DYNAMIXEL XH540-W270-T(R) | 1.93x |
| r_ankle_pitch | 2.792 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 1.76x |
| r_ankle_roll | 1.168 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.52x |
| l_shoulder_pitch | 0.379 | N·m | DYNAMIXEL XL430-W250-T | 3.7x |
| l_shoulder_roll | 0.365 | N·m | DYNAMIXEL XL430-W250-T | 3.83x |
| l_upper_arm_yaw | 0.215 | N·m | DYNAMIXEL XL430-W250-T | 6.5x |
| l_elbow | 0.033 | N·m | DYNAMIXEL XL330-M288-T | 15.56x |
| l_gripper | 0.002 | N·m | DYNAMIXEL XL330-M288-T | 99x |
| r_shoulder_pitch | 0.381 | N·m | DYNAMIXEL XL430-W250-T | 3.67x |
| r_shoulder_roll | 0.368 | N·m | DYNAMIXEL XL430-W250-T | 3.81x |
| r_upper_arm_yaw | 0.215 | N·m | DYNAMIXEL XL430-W250-T | 6.5x |
| r_elbow | 0.033 | N·m | DYNAMIXEL XL330-M288-T | 15.56x |
| r_gripper | 0.002 | N·m | DYNAMIXEL XL330-M288-T | 99x |
| neck_pan | 0 | N·m | DYNAMIXEL XL330-M288-T | 99x |
| neck_tilt | 0.108 | N·m | DYNAMIXEL XL330-M288-T | 4.8x |

## Notes
- Humanoid, 0.687 m, 3.61 kg, 24 DOF (4-DOF arms + grippers), 44 min, $4221 of parts
- Joint limits trimmed to the collision-free range found by exact solid sweeps: l_hip_roll [-0.45, 0.45] -> [-0.13, 0.45]; l_knee [-2.20, 2.20] -> [-2.04, 2.20]; l_ankle_roll [-0.50, 0.50] -> [-0.50, 0.13]; r_hip_roll [-0.45, 0.45] -> [-0.45, 0.13]; r_knee [-2.20, 2.20] -> [-2.20, 2.04]; r_ankle_roll [-0.50, 0.50] -> [-0.13, 0.50]; l_shoulder_roll [-1.60, 1.60] -> [-0.12, 1.60]; r_shoulder_roll [-1.60, 1.60] -> [-1.60, 0.12]; neck_tilt [-0.70, 0.70] -> [-0.70, 0.38].
- Joint ranges are swept with the arms held 0.35 rad out to the side (the walking posture); with the arms hanging straight the hands touch the thighs when a leg abducts or a wrist turns.
- Zero joint angles are the standing pose (knees bent 0.25 rad, soles flat); the base origin is on the hip-yaw output plane.
- Leg loads are J^T F at the sole with the whole robot on one foot and the centre of pressure anywhere on the central 60 % of the sole, over squat / lean / step poses, ±10 % traction, x 1.3 dynamic factor; continuous duty checked at 71 % of the worst stance load (RMS over a gait cycle with half of it in stance).
- Soles carry a 2 mm rubber pad (silicone / neoprene sheet, glued) as the contact patch.
- Arm loads are exact gravity torques with the payload in each hand, arms stretched forward, sideways and rolled.
- Small humanoid: walking needs a balance controller using the pelvis IMU (ZMP preview / RL policy); position-controlled standing is passively stable only while the COM stays over the soles.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
