# Bill of Materials — humanoid_robot

**Estimated total: $4234.18**  ·  tier: prosumer

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
| Power | LiPo 3S 5000 mAh 60C, XT60 (Gens Ace G-Tech) _(main battery · https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug)_ | 1 | 59.99 | 59.99 | 11.1 V, 55.5 Wh |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(head camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(main computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to leg servo bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 26 printed parts _(base_link, torso, l_hip_yaw_link, l_hip_roll_link, l_hip_pitch_link, l_knee_link, l_ankle_pitch_link, l_ankle_roll_link, r_hip_yaw_link, r_hip_roll_link, r_hip_pitch_link, r_knee_link, r_ankle_pitch_link, r_ankle_roll_link, l_shoulder_pitch_link, l_shoulder_roll_link, l_upper_arm_yaw_link, l_elbow_link, l_gripper_jaw, r_shoulder_pitch_link, r_shoulder_roll_link, r_upper_arm_yaw_link, r_elbow_link, r_gripper_jaw, neck_pan_link, neck_tilt_link)_ | 1 | 33.29 | 33.29 | 1316 g of parts (+15 % supports/waste), about 119.9 h of printing |
| Fasteners | Screws, nuts and inserts | 180 | 0.12 | 21.6 | 4x M3 x 12 torso-to-pelvis bolts; 88x M2/M2.5 x 6 case screws; 88x horn / hub screws |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| l_hip_yaw | 0.403 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 7.3x |
| l_hip_roll | 4.215 | N·m | DYNAMIXEL XH540-W270-T(R) | 2.35x |
| l_hip_pitch | 5.422 | N·m | DYNAMIXEL XH540-W270-T(R) | 1.83x |
| l_knee | 5.118 | N·m | DYNAMIXEL XH540-W270-T(R) | 1.93x |
| l_ankle_pitch | 2.786 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 1.76x |
| l_ankle_roll | 1.165 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.53x |
| r_hip_yaw | 0.403 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 7.3x |
| r_hip_roll | 4.215 | N·m | DYNAMIXEL XH540-W270-T(R) | 2.35x |
| r_hip_pitch | 5.422 | N·m | DYNAMIXEL XH540-W270-T(R) | 1.83x |
| r_knee | 5.118 | N·m | DYNAMIXEL XH540-W270-T(R) | 1.93x |
| r_ankle_pitch | 2.786 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 1.76x |
| r_ankle_roll | 1.165 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.53x |
| l_shoulder_pitch | 0.381 | N·m | DYNAMIXEL XL430-W250-T | 3.67x |
| l_shoulder_roll | 0.368 | N·m | DYNAMIXEL XL430-W250-T | 3.81x |
| l_upper_arm_yaw | 0.216 | N·m | DYNAMIXEL XL430-W250-T | 6.49x |
| l_elbow | 0.033 | N·m | DYNAMIXEL XL330-M288-T | 15.54x |
| l_gripper | 0.002 | N·m | DYNAMIXEL XL330-M288-T | 99x |
| r_shoulder_pitch | 0.384 | N·m | DYNAMIXEL XL430-W250-T | 3.65x |
| r_shoulder_roll | 0.37 | N·m | DYNAMIXEL XL430-W250-T | 3.79x |
| r_upper_arm_yaw | 0.216 | N·m | DYNAMIXEL XL430-W250-T | 6.49x |
| r_elbow | 0.033 | N·m | DYNAMIXEL XL330-M288-T | 15.54x |
| r_gripper | 0.002 | N·m | DYNAMIXEL XL330-M288-T | 99x |
| neck_pan | 0 | N·m | DYNAMIXEL XL330-M288-T | 99x |
| neck_tilt | 0.114 | N·m | DYNAMIXEL XL330-M288-T | 4.55x |

## Notes
- Humanoid, 0.653 m, 3.60 kg, 24 DOF (4-DOF arms + grippers), 44 min, $4179 of parts
- Joint limits trimmed to the collision-free range found by exact solid sweeps: l_hip_roll [-0.45, 0.45] -> [-0.13, 0.45]; l_knee [-2.20, 2.20] -> [-2.04, 2.20]; l_ankle_roll [-0.50, 0.50] -> [-0.50, 0.13]; r_hip_roll [-0.45, 0.45] -> [-0.45, 0.13]; r_knee [-2.20, 2.20] -> [-2.20, 2.04]; r_ankle_roll [-0.50, 0.50] -> [-0.13, 0.50]; l_shoulder_roll [-1.60, 1.60] -> [-0.15, 1.60]; r_shoulder_roll [-1.60, 1.60] -> [-1.60, 0.15]; neck_tilt [-0.70, 0.70] -> [-0.70, 0.38].
- Joint ranges are swept with the arms held 0.35 rad out to the side (the walking posture); with the arms hanging straight the hands touch the thighs when a leg abducts or a wrist turns.
- Zero joint angles are the standing pose (knees bent 0.25 rad, soles flat); the base origin is on the hip-yaw output plane.
- Leg loads are J^T F at the sole with the whole robot on one foot and the centre of pressure anywhere on the central 60 % of the sole, over squat / lean / step poses, ±10 % traction, x 1.3 dynamic factor; continuous duty checked at 71 % of the worst stance load (RMS over a gait cycle with half of it in stance).
- Soles carry a 2 mm rubber pad (silicone / neoprene sheet, glued) as the contact patch.
- Arm loads are exact gravity torques with the payload in each hand, arms stretched forward, sideways and rolled.
- Small humanoid: walking needs a balance controller using the pelvis IMU (ZMP preview / RL policy); position-controlled standing is passively stable only while the COM stays over the soles.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
