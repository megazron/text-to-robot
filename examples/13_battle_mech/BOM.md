# Bill of Materials — humanoid_robot

**Estimated total: $1106.02**  ·  tier: prosumer

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint neck_joint)_ | 21 | 12 | 252 | PWM, waterproof, metal gears (1.96 N·m) |
| Actuator | NEMA17 + lead screw _(joint left_left_finger_joint)_ | 4 | 26 | 104 | lead-screw linear stage (60 N·m) |
| Motor driver | TMC2209 driver | 4 | 10 | 40 | driver for NEMA17 + lead screw |
| Sensor | Raspberry Pi Camera Module 3 _(camera_1)_ | 1 | 25 | 25 | 12MP, CSI |
| Sensor | Bosch BNO085 _(imu_1)_ | 1 | 20 | 20 | 9-axis fused AHRS |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 69 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 430.58 | 430.58 | ~19.57 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 70.44 | 70.44 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| neck_joint | 0.276 | DS3218 20kg servo | 7.1x |
| left_arm_joint_1 | 1.003 | DS3218 20kg servo | 2.0x |
| left_arm_joint_2 | 0.973 | DS3218 20kg servo | 2.0x |
| left_arm_joint_3 | 0.562 | DS3218 20kg servo | 3.5x |
| left_arm_joint_4 | 0.531 | DS3218 20kg servo | 3.7x |
| left_arm_joint_5 | 0.12 | DS3218 20kg servo | 16.3x |
| left_arm_joint_6 | 0.09 | DS3218 20kg servo | 21.9x |
| left_arm_joint_7 | 0.059 | DS3218 20kg servo | 33.2x |
| left_left_finger_joint | 0.196 | NEMA17 + lead screw | 305.9x |
| left_right_finger_joint | 0.196 | NEMA17 + lead screw | 305.9x |
| right_arm_joint_1 | 1.003 | DS3218 20kg servo | 2.0x |
| right_arm_joint_2 | 0.973 | DS3218 20kg servo | 2.0x |
| right_arm_joint_3 | 0.562 | DS3218 20kg servo | 3.5x |
| right_arm_joint_4 | 0.531 | DS3218 20kg servo | 3.7x |
| right_arm_joint_5 | 0.12 | DS3218 20kg servo | 16.3x |
| right_arm_joint_6 | 0.09 | DS3218 20kg servo | 21.9x |
| right_arm_joint_7 | 0.059 | DS3218 20kg servo | 33.2x |
| right_left_finger_joint | 0.196 | NEMA17 + lead screw | 305.9x |
| right_right_finger_joint | 0.196 | NEMA17 + lead screw | 305.9x |
| left_hip_joint | 1.05 | DS3218 20kg servo | 1.9x |
| left_knee_joint | 0.489 | DS3218 20kg servo | 4.0x |
| left_ankle_joint | 0.045 | DS3218 20kg servo | 43.4x |
| right_hip_joint | 1.05 | DS3218 20kg servo | 1.9x |
| right_knee_joint | 0.489 | DS3218 20kg servo | 4.0x |
| right_ankle_joint | 0.045 | DS3218 20kg servo | 43.4x |

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
