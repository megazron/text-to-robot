# Bill of Materials — battle_mech

**Estimated total: $16644.04**  ·  tier: research

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(IMU (pelvis) · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V regulator (sensors) · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Actuator | CubeMars AK60-6 V3.0 KV80 _(joint l_hip_yaw; joint r_hip_yaw · https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html)_ | 2 | 229.9 | 459.8 | 3 N·m rated / 9 N·m peak, 48 V |
| Actuator | CubeMars AK70-10 KV100 _(joint l_ankle_roll; joint r_ankle_roll; joint l_shoulder_pitch; joint l_shoulder_roll; … · https://www.cubemars.com/product/ak70-10-kv100-robotic-actuator.html)_ | 6 | 398.9 | 2393.4 | 8.3 N·m rated / 24.8 N·m peak, 48 V |
| Actuator | CubeMars AK80-64 KV80 _(joint l_hip_roll; joint l_hip_pitch; joint l_knee; joint l_ankle_pitch; … · https://www.cubemars.com/product/ak80-64-kv80-robotic-actuator.html)_ | 8 | 889.9 | 7119.2 | 48 N·m rated / 120 N·m peak, 48 V |
| Power | Mean Well SD-50C-12 enclosed DC-DC converter, 36-72 V in, 12 V 4.2 A (50 W) _(12 V for the DYNAMIXEL arms and the computer · https://www.digikey.com/en/products/detail/mean-well-usa-inc/SD-50C-12/7706533)_ | 2 | 45 | 90 | 12 V |
| Electronics | ROBOTIS U2D2 USB to TTL/RS-485 interface _(USB to the arm / neck DYNAMIXEL bus · https://www.generationrobots.com/en/400848-usb2dynamixel-robotis.html)_ | 1 | 32.1 | 32.1 | 5 V |
| Actuator | DYNAMIXEL XH540-W270-T(R) _(joint l_elbow; joint l_wrist_pitch; joint r_elbow; joint r_wrist_pitch · https://robotis.us/dynamixel-xh540-w270-t)_ | 4 | 539.9 | 2159.6 | 2.97 N·m rated / 9.9 N·m peak, 12 V |
| Actuator | DYNAMIXEL XL430-W250-T _(joint neck_pan · https://robotis.us/dynamixel-xl430-w250-t)_ | 1 | 44.9 | 44.9 | 0.42 N·m rated / 1.4 N·m peak, 11.1 V |
| Actuator | DYNAMIXEL XM430-W350-T(R) _(joint l_upper_arm_yaw; joint l_wrist_yaw; joint l_wrist_roll; gripper; … · https://www.robotshop.com/products/robotis-dynamixel-xm430-w350-t-smart-servo-actuator)_ | 9 | 310.39 | 2793.51 | 1.23 N·m rated / 4.1 N·m peak, 12 V |
| Power | ANL fuse holder, 58 V class, 35-300 A _(fuse holders · https://www.bluesea.com/products/category/62/ANL_Fuses)_ | 19 | 9 | 171 | 58 V |
| Compute | NVIDIA Jetson Orin Nano Super Developer Kit _(main computer · https://developer.nvidia.com/buy-jetson?product=jetson_orin_nano)_ | 1 | 249 | 249 | 19 V |
| Power | LiPo 6S 10000 mAh 30C, EC5 (Tattu) _(main battery (2 in series) · https://www.buddyrc.com/products/tattu-22-2v-30c-6s-10000mah-lipo-battery-pack-with-ec5-plug-for-uav-drone)_ | 2 | 216.99 | 433.98 | 22.2 V, 222 Wh |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(head camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Power | Blue Sea 6006 m-Series battery switch, ON-OFF, 48 VDC _(main battery switch · https://www.bluesea.com/products/6006)_ | 1 | 35 | 35 | https://www.bluesea.com/products/6006 |
| Electronics | EYOU Robotics CANable PRO isolated USB-CAN adapter _(USB-CAN bus (left leg); USB-CAN bus (right leg) · https://www.robotshop.com/products/eyou-robotics-can-usb-adapter-canable-pro)_ | 2 | 42 | 84 | 5 V |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 29 | 0.8 | 23.2 | 450 V |
| Printed structure | PETG filament for 51 printed parts _(base_link, base_link_b, torso, torso_b, l_hip_yaw_link, l_hip_roll_link, l_hip_pitch_link, l_hip_pitch_link_b, l_knee_link, l_knee_link_b, l_ankle_pitch_link, l_ankle_roll_link, r_hip_yaw_link, r_hip_roll_link, r_hip_pitch_link, r_hip_pitch_link_b, r_knee_link, r_knee_link_b, r_ankle_pitch_link, r_ankle_roll_link, l_shoulder_pitch_link, l_shoulder_roll_link, l_upper_arm_yaw_link, l_elbow_link, l_wrist_yaw_link, l_wrist_pitch_link, l_wrist_roll_link, l_gripper_jaw, r_shoulder_pitch_link, r_shoulder_roll_link, r_upper_arm_yaw_link, r_elbow_link, r_wrist_yaw_link, r_wrist_pitch_link, r_wrist_roll_link, r_gripper_jaw, neck_pan_link, neck_tilt_link, torso_armour_front, l_hip_pitch_armour_front, l_knee_armour_front, l_shoulder_roll_armour_out, r_hip_pitch_armour_front, r_knee_armour_front, r_shoulder_roll_armour_out, side_panel_left, side_panel_right, chest_panel, backpack_hood, switch_case, imu_hood)_ | 1 | 162.66 | 162.66 | 6429 g of parts (+15 % supports/waste), about 585.9 h of printing |
| Fasteners | Screws, nuts and inserts | 348 | 0.12 | 41.76 | 36x M3 x 16 split-joint bolts + nuts; 4x M3 x 12 torso-to-pelvis bolts; 96x M3 x 8 housing screws; 112x horn / hub screws; 48x M2/M2.5 x 6 case screws; 28x M3 x 10 armour screws + printed standoffs; 4x M3 x 8 self-tapping (side_panel_left); 4x M3 x 8 self-tapping (side_panel_right); 4x M3 x 8 self-tapping (chest_panel); 12x M3 x 12 self-tapping (hood to deck) |
| Wiring | 4 AWG silicone wire _(price estimated)_ | 1 | 10 | 10 | 1 m: 21.2 mm2, rated 70 A in a bundle; 0.82 m cut + 10 % waste |
| Wiring | 8 AWG silicone wire _(price estimated)_ | 0.3 | 4.5 | 1.35 | 0.3 m: 8.37 mm2, rated 36.5 A in a bundle; 0.20 m cut + 10 % waste |
| Wiring | 10 AWG silicone wire _(price estimated)_ | 6.3 | 3.2 | 20.16 | 6.3 m: 5.261 mm2, rated 27.5 A in a bundle; 5.71 m cut + 10 % waste |
| Wiring | 12 AWG silicone wire _(price estimated)_ | 4.2 | 2.2 | 9.24 | 4.2 m: 3.308 mm2, rated 20.5 A in a bundle; 3.79 m cut + 10 % waste |
| Wiring | 14 AWG silicone wire _(price estimated)_ | 17.9 | 1.5 | 26.85 | 17.9 m: 2.082 mm2, rated 16 A in a bundle; 16.23 m cut + 10 % waste |
| Wiring | 18 AWG silicone wire _(price estimated)_ | 4.1 | 0.7 | 2.87 | 4.1 m: 0.823 mm2, rated 8 A in a bundle; 3.70 m cut + 10 % waste |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 0.3 | 0.5 | 0.15 | 0.3 m: 0.519 mm2, rated 5.5 A in a bundle; 0.20 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 7.7 | 0.4 | 3.08 | 7.7 m: 0.327 mm2, rated 3.5 A in a bundle; 6.98 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 9.4 | 0.35 | 3.29 | 9.4 m: 0.205 mm2, rated 1.75 A in a bundle; 8.51 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 31.3 | 0.3 | 9.39 | 31.3 m: 0.128 mm2, rated 1.1 A in a bundle; 28.45 m cut + 10 % waste |
| Wiring | EC5 contacts _(price estimated)_ | 4 | 1.5 | 6 | 4 pc: rated 120 A per contact |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 16 | 0.03 | 0.48 | 16 pc: rated 17.5 A per contact |
| Wiring | XT30 contacts _(price estimated)_ | 38 | 0.6 | 22.8 | 38 pc: rated 20 A per contact |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 36 | 0.02 | 0.72 | 36 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 16 | 0.02 | 0.32 | 16 pc: one per cable end |
| Wiring | JST EH 2.5 mm contacts _(price estimated)_ | 78 | 0.03 | 2.34 | 78 pc: rated 3 A per contact |
| Wiring | JST EH 2.5 mm housings _(price estimated)_ | 31 | 0.05 | 1.55 | 31 pc: one per cable end |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 4.8 | 0.2 | 0.96 | 4.8 m: 9 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 158 | 0.02 | 3.16 | 158 pc: at every clip, cable end and strain-relief anchor |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 1 | 0.08 | 0.08 | 1 pc: 12 mm panel hole |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 6 | 0.08 | 0.48 | 6 pc: 9.5 mm panel hole |
| Wiring | Rubber grommet, 5.0 mm panel hole, 3.0 mm bore _(price estimated)_ | 1 | 0.05 | 0.05 | 1 pc: 5 mm panel hole |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 12.9 | 0.4 | 5.16 | 12.9 m: over every cable where it crosses a joint |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: leg_bus to computer |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: leg_bus_2 to computer |
| Wiring | FFC _(price estimated)_ | 1 | 3 | 3 | 1 pc: head_camera to computer |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: arm_bus to computer |
| Wiring | 60 A ANL fuse _(price estimated)_ | 1 | 6 | 6 | 1 pc: plus spares |
| Wiring | 2 A ANL fuse _(price estimated)_ | 2 | 6 | 12 | 2 pc: plus spares |
| Wiring | 7.5 A ANL fuse _(price estimated)_ | 2 | 6 | 12 | 2 pc: plus spares |
| Wiring | 10 A ANL fuse _(price estimated)_ | 8 | 6 | 48 | 8 pc: plus spares |
| Wiring | 15 A ANL fuse _(price estimated)_ | 6 | 6 | 36 | 6 pc: plus spares |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| l_hip_yaw | 4.726 | N·m | CubeMars AK60-6 V3.0 KV80 | 1.9x |
| l_hip_roll | 50.272 | N·m | CubeMars AK80-64 KV80 | 2.39x |
| l_hip_pitch | 64.075 | N·m | CubeMars AK80-64 KV80 | 1.87x |
| l_knee | 61.32 | N·m | CubeMars AK80-64 KV80 | 1.96x |
| l_ankle_pitch | 31.664 | N·m | CubeMars AK80-64 KV80 | 3.79x |
| l_ankle_roll | 13.386 | N·m | CubeMars AK70-10 KV100 | 1.85x |
| r_hip_yaw | 4.726 | N·m | CubeMars AK60-6 V3.0 KV80 | 1.9x |
| r_hip_roll | 50.272 | N·m | CubeMars AK80-64 KV80 | 2.39x |
| r_hip_pitch | 64.075 | N·m | CubeMars AK80-64 KV80 | 1.87x |
| r_knee | 61.32 | N·m | CubeMars AK80-64 KV80 | 1.96x |
| r_ankle_pitch | 31.664 | N·m | CubeMars AK80-64 KV80 | 3.79x |
| r_ankle_roll | 13.386 | N·m | CubeMars AK70-10 KV100 | 1.85x |
| l_shoulder_pitch | 7.574 | N·m | CubeMars AK70-10 KV100 | 3.27x |
| l_shoulder_roll | 7.574 | N·m | CubeMars AK70-10 KV100 | 3.27x |
| l_upper_arm_yaw | 0.103 | N·m | DYNAMIXEL XM430-W350-T(R) | 39.75x |
| l_elbow | 3.487 | N·m | DYNAMIXEL XH540-W270-T(R) | 2.84x |
| l_wrist_yaw | 0.124 | N·m | DYNAMIXEL XM430-W350-T(R) | 32.97x |
| l_wrist_pitch | 1.879 | N·m | DYNAMIXEL XH540-W270-T(R) | 5.27x |
| l_wrist_roll | 0.146 | N·m | DYNAMIXEL XM430-W350-T(R) | 28.16x |
| l_gripper | 0.006 | N·m | DYNAMIXEL XM430-W350-T(R) | 99x |
| r_shoulder_pitch | 7.564 | N·m | CubeMars AK70-10 KV100 | 3.28x |
| r_shoulder_roll | 7.564 | N·m | CubeMars AK70-10 KV100 | 3.28x |
| r_upper_arm_yaw | 0.104 | N·m | DYNAMIXEL XM430-W350-T(R) | 39.37x |
| r_elbow | 3.484 | N·m | DYNAMIXEL XH540-W270-T(R) | 2.84x |
| r_wrist_yaw | 0.125 | N·m | DYNAMIXEL XM430-W350-T(R) | 32.84x |
| r_wrist_pitch | 1.878 | N·m | DYNAMIXEL XH540-W270-T(R) | 5.27x |
| r_wrist_roll | 0.146 | N·m | DYNAMIXEL XM430-W350-T(R) | 28.16x |
| r_gripper | 0.006 | N·m | DYNAMIXEL XM430-W350-T(R) | 99x |
| neck_pan | 0 | N·m | DYNAMIXEL XL430-W250-T | 99x |
| neck_tilt | 0.862 | N·m | DYNAMIXEL XM430-W350-T(R) | 4.76x |

## Notes
- Battle mech, 1.182 m, 22.97 kg, 30 DOF (7-DOF arms + grippers), 170 min, $16183 of parts
- Joint limits trimmed to the collision-free range found by exact solid sweeps: l_hip_roll [-0.45, 0.45] -> [-0.07, 0.45]; l_hip_pitch [-1.60, 1.60] -> [-0.84, 1.60]; l_knee [-2.20, 2.20] -> [-2.04, 0.33]; r_hip_roll [-0.45, 0.45] -> [-0.45, 0.07]; r_hip_pitch [-1.60, 1.60] -> [-1.60, 0.84]; r_knee [-2.20, 2.20] -> [-0.33, 2.04]; l_shoulder_roll [-1.60, 1.60] -> [-0.04, 1.60]; l_elbow [-2.30, 2.30] -> [-2.30, 2.18]; l_wrist_pitch [-1.60, 1.60] -> [-1.60, 1.27]; r_shoulder_roll [-1.60, 1.60] -> [-1.60, 0.04]; r_elbow [-2.30, 2.30] -> [-2.18, 2.30]; r_wrist_pitch [-1.60, 1.60] -> [-1.27, 1.60]; neck_tilt [-0.70, 0.70] -> [-0.70, 0.57].
- Joint ranges are swept with the arms held 0.35 rad out to the side (the walking posture); with the arms hanging straight the hands touch the thighs when a leg abducts or a wrist turns.
- CubeMars actuators run on a 12S bus (two 6S packs in series, 44.4 V nominal) at their 48 V ratings; DYNAMIXEL arms and the computer run from the 12 V DC-DC converter.
- Zero joint angles are the standing pose (knees bent 0.25 rad, soles flat); the base origin is on the hip-yaw output plane.
- Leg loads are J^T F at the sole with the whole robot on one foot and the centre of pressure anywhere on the central 60 % of the sole, over squat / lean / step poses, ±10 % traction, x 1.3 dynamic factor; continuous duty checked at 71 % of the worst stance load (RMS over a gait cycle with half of it in stance).
- Soles carry a 2 mm rubber pad (silicone / neoprene sheet, glued) as the contact patch.
- Arm loads are exact gravity torques with the payload in each hand, arms stretched forward, sideways and rolled.
- Research-grade biped: it cannot walk, or even stand reliably, without a whole-body balance controller (torque-controlled QDD legs, IMU feedback, e.g. MPC or an RL policy). Armour panels are thin cosmetic shells with no structural role; their mass is counted.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
