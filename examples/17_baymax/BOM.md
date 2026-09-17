# Bill of Materials — baymax

**Estimated total: $796.1**  ·  tier: prosumer

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint neck_joint)_ | 15 | 12 | 180 | PWM, waterproof, metal gears (1.96 N·m) |
| Sensor | Raspberry Pi Camera Module 3 _(face_camera)_ | 1 | 25 | 25 | 12MP, CSI |
| Sensor | Bosch BNO085 _(chest_imu)_ | 1 | 20 | 20 | 9-axis fused AHRS |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 38 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 362.58 | 362.58 | ~16.48 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 44.52 | 44.52 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| neck_joint | 0.27 | DS3218 20kg servo | 7.3x |
| left_arm_joint_1 | 0.132 | DS3218 20kg servo | 14.8x |
| left_arm_joint_2 | 0.122 | DS3218 20kg servo | 16.0x |
| left_arm_joint_3 | 0.085 | DS3218 20kg servo | 23.1x |
| left_arm_joint_4 | 0.075 | DS3218 20kg servo | 26.2x |
| right_arm_joint_1 | 0.132 | DS3218 20kg servo | 14.8x |
| right_arm_joint_2 | 0.122 | DS3218 20kg servo | 16.0x |
| right_arm_joint_3 | 0.085 | DS3218 20kg servo | 23.1x |
| right_arm_joint_4 | 0.075 | DS3218 20kg servo | 26.2x |
| left_hip_joint | 0.638 | DS3218 20kg servo | 3.1x |
| left_knee_joint | 0.357 | DS3218 20kg servo | 5.5x |
| left_ankle_joint | 0.136 | DS3218 20kg servo | 14.5x |
| right_hip_joint | 0.638 | DS3218 20kg servo | 3.1x |
| right_knee_joint | 0.357 | DS3218 20kg servo | 5.5x |
| right_ankle_joint | 0.136 | DS3218 20kg servo | 14.5x |

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
