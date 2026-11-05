# Bill of Materials — battle_mech

**Estimated total: $16103.06**  ·  tier: research

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(IMU (pelvis) · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V regulator (sensors) · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Actuator | CubeMars AK60-6 V3.0 KV80 _(joint l_hip_yaw; joint r_hip_yaw · https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html)_ | 2 | 229.9 | 459.8 | 3 N·m rated / 9 N·m peak, 48 V |
| Actuator | CubeMars AK70-10 KV100 _(joint l_ankle_roll; joint r_ankle_roll; joint l_shoulder_pitch; joint l_shoulder_roll; … · https://www.cubemars.com/product/ak70-10-kv100-robotic-actuator.html)_ | 6 | 398.9 | 2393.4 | 8.3 N·m rated / 24.8 N·m peak, 48 V |
| Actuator | CubeMars AK80-64 KV80 _(joint l_hip_roll; joint l_hip_pitch; joint l_knee; joint l_ankle_pitch; … · https://www.cubemars.com/product/ak80-64-kv80-robotic-actuator.html)_ | 8 | 889.9 | 7119.2 | 48 N·m rated / 120 N·m peak, 48 V |
| Power | Mean Well SD-50C-12 enclosed DC-DC converter, 36-72 V in, 12 V 4.2 A (50 W) _(12 V for the DYNAMIXEL arms and the computer · https://www.digikey.com/en/products/detail/mean-well-usa-inc/SD-50C-12/7706533)_ | 1 | 45 | 45 | 12 V |
| Electronics | ROBOTIS U2D2 USB to TTL/RS-485 interface _(USB to the arm / neck DYNAMIXEL bus · https://www.generationrobots.com/en/400848-usb2dynamixel-robotis.html)_ | 1 | 32.1 | 32.1 | 5 V |
| Actuator | DYNAMIXEL XH540-W270-T(R) _(joint l_elbow; joint l_wrist_pitch; joint r_elbow; joint r_wrist_pitch · https://robotis.us/dynamixel-xh540-w270-t)_ | 4 | 539.9 | 2159.6 | 2.97 N·m rated / 9.9 N·m peak, 12 V |
| Actuator | DYNAMIXEL XL430-W250-T _(joint neck_pan · https://robotis.us/dynamixel-xl430-w250-t)_ | 1 | 44.9 | 44.9 | 0.42 N·m rated / 1.4 N·m peak, 11.1 V |
| Actuator | DYNAMIXEL XM430-W350-T(R) _(joint l_upper_arm_yaw; joint l_wrist_yaw; joint l_wrist_roll; gripper; … · https://www.robotshop.com/products/robotis-dynamixel-xm430-w350-t-smart-servo-actuator)_ | 9 | 310.39 | 2793.51 | 1.23 N·m rated / 4.1 N·m peak, 12 V |
| Compute | NVIDIA Jetson Orin Nano Super Developer Kit _(main computer · https://developer.nvidia.com/buy-jetson?product=jetson_orin_nano)_ | 1 | 249 | 249 | 19 V |
| Power | LiPo 6S 10000 mAh 30C, EC5 (Tattu) _(main battery (2 in series) · https://www.buddyrc.com/products/tattu-22-2v-30c-6s-10000mah-lipo-battery-pack-with-ec5-plug-for-uav-drone)_ | 2 | 216.99 | 433.98 | 22.2 V, 222 Wh |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(head camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Electronics | EYOU Robotics CANable PRO isolated USB-CAN adapter _(USB-CAN bus (left leg); USB-CAN bus (right leg) · https://www.robotshop.com/products/eyou-robotics-can-usb-adapter-canable-pro)_ | 2 | 42 | 84 | 5 V |
| Printed structure | PETG filament for 45 printed parts _(base_link, base_link_b, torso, torso_b, l_hip_yaw_link, l_hip_roll_link, l_hip_pitch_link, l_hip_pitch_link_b, l_knee_link, l_knee_link_b, l_ankle_pitch_link, l_ankle_roll_link, r_hip_yaw_link, r_hip_roll_link, r_hip_pitch_link, r_hip_pitch_link_b, r_knee_link, r_knee_link_b, r_ankle_pitch_link, r_ankle_roll_link, l_shoulder_pitch_link, l_shoulder_roll_link, l_upper_arm_yaw_link, l_elbow_link, l_wrist_yaw_link, l_wrist_pitch_link, l_wrist_roll_link, l_gripper_jaw, r_shoulder_pitch_link, r_shoulder_roll_link, r_upper_arm_yaw_link, r_elbow_link, r_wrist_yaw_link, r_wrist_pitch_link, r_wrist_roll_link, r_gripper_jaw, neck_pan_link, neck_tilt_link, torso_armour_front, l_hip_pitch_armour_front, l_knee_armour_front, l_shoulder_roll_armour_out, r_hip_pitch_armour_front, r_knee_armour_front, r_shoulder_roll_armour_out)_ | 1 | 155.24 | 155.24 | 6136 g of parts (+15 % supports/waste), about 559.2 h of printing |
| Fasteners | Screws, nuts and inserts | 324 | 0.12 | 38.88 | 36x M3 x 16 split-joint bolts + nuts; 4x M3 x 12 torso-to-pelvis bolts; 96x M3 x 8 housing screws; 112x horn / hub screws; 48x M2/M2.5 x 6 case screws; 28x M3 x 10 armour screws + printed standoffs |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| l_hip_yaw | 4.614 | N·m | CubeMars AK60-6 V3.0 KV80 | 1.95x |
| l_hip_roll | 49.081 | N·m | CubeMars AK80-64 KV80 | 2.44x |
| l_hip_pitch | 62.557 | N·m | CubeMars AK80-64 KV80 | 1.92x |
| l_knee | 59.867 | N·m | CubeMars AK80-64 KV80 | 2x |
| l_ankle_pitch | 30.914 | N·m | CubeMars AK80-64 KV80 | 3.88x |
| l_ankle_roll | 13.069 | N·m | CubeMars AK70-10 KV100 | 1.9x |
| r_hip_yaw | 4.614 | N·m | CubeMars AK60-6 V3.0 KV80 | 1.95x |
| r_hip_roll | 49.081 | N·m | CubeMars AK80-64 KV80 | 2.44x |
| r_hip_pitch | 62.557 | N·m | CubeMars AK80-64 KV80 | 1.92x |
| r_knee | 59.867 | N·m | CubeMars AK80-64 KV80 | 2x |
| r_ankle_pitch | 30.914 | N·m | CubeMars AK80-64 KV80 | 3.88x |
| r_ankle_roll | 13.069 | N·m | CubeMars AK70-10 KV100 | 1.9x |
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
- Battle mech, 1.182 m, 22.40 kg, 30 DOF (7-DOF arms + grippers), 174 min, $15909 of parts
- Joint limits trimmed to the collision-free range found by exact solid sweeps: l_hip_roll [-0.45, 0.45] -> [-0.07, 0.45]; l_hip_pitch [-1.60, 1.60] -> [-0.84, 1.60]; l_knee [-2.20, 2.20] -> [-2.04, 0.33]; r_hip_roll [-0.45, 0.45] -> [-0.45, 0.07]; r_hip_pitch [-1.60, 1.60] -> [-1.60, 0.84]; r_knee [-2.20, 2.20] -> [-0.33, 2.04]; l_shoulder_roll [-1.60, 1.60] -> [-0.04, 1.60]; l_elbow [-2.30, 2.30] -> [-2.30, 2.18]; l_wrist_pitch [-1.60, 1.60] -> [-1.60, 1.27]; r_shoulder_roll [-1.60, 1.60] -> [-1.60, 0.04]; r_elbow [-2.30, 2.30] -> [-2.18, 2.30]; r_wrist_pitch [-1.60, 1.60] -> [-1.27, 1.60]; neck_tilt [-0.70, 0.70] -> [-0.70, 0.57].
- Joint ranges are swept with the arms held 0.35 rad out to the side (the walking posture); with the arms hanging straight the hands touch the thighs when a leg abducts or a wrist turns.
- CubeMars actuators run on a 12S bus (two 6S packs in series, 44.4 V nominal) at their 48 V ratings; DYNAMIXEL arms and the computer run from the 12 V DC-DC converter.
- Zero joint angles are the standing pose (knees bent 0.25 rad, soles flat); the base origin is on the hip-yaw output plane.
- Leg loads are J^T F at the sole with the whole robot on one foot and the centre of pressure anywhere on the central 60 % of the sole, over squat / lean / step poses, ±10 % traction, x 1.3 dynamic factor; continuous duty checked at 71 % of the worst stance load (RMS over a gait cycle with half of it in stance).
- Soles carry a 2 mm rubber pad (silicone / neoprene sheet, glued) as the contact patch.
- Arm loads are exact gravity torques with the payload in each hand, arms stretched forward, sideways and rolled.
- Research-grade biped: it cannot walk, or even stand reliably, without a whole-body balance controller (torque-controlled QDD legs, IMU feedback, e.g. MPC or an RL policy). Armour panels are thin cosmetic shells with no structural role; their mass is counted.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
