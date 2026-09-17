# Bill of Materials — iron_man_suit

**Estimated total: $992.62**  ·  tier: prosumer

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint neck_joint)_ | 21 | 12 | 252 | PWM, waterproof, metal gears (1.96 N·m) |
| Sensor | Raspberry Pi Camera Module 3 _(hud_camera)_ | 2 | 25 | 50 | 12MP, CSI |
| Sensor | Bosch BNO085 _(suit_imu)_ | 2 | 20 | 40 | 9-axis fused AHRS |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 50 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 428.06 | 428.06 | ~19.46 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 58.56 | 58.56 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| neck_joint | 0.276 | DS3218 20kg servo | 7.1x |
| left_arm_joint_1 | 0.977 | DS3218 20kg servo | 2.0x |
| left_arm_joint_2 | 0.947 | DS3218 20kg servo | 2.1x |
| left_arm_joint_3 | 0.536 | DS3218 20kg servo | 3.7x |
| left_arm_joint_4 | 0.505 | DS3218 20kg servo | 3.9x |
| left_arm_joint_5 | 0.094 | DS3218 20kg servo | 20.8x |
| left_arm_joint_6 | 0.064 | DS3218 20kg servo | 30.8x |
| left_arm_joint_7 | 0.033 | DS3218 20kg servo | 59.3x |
| right_arm_joint_1 | 0.977 | DS3218 20kg servo | 2.0x |
| right_arm_joint_2 | 0.947 | DS3218 20kg servo | 2.1x |
| right_arm_joint_3 | 0.536 | DS3218 20kg servo | 3.7x |
| right_arm_joint_4 | 0.505 | DS3218 20kg servo | 3.9x |
| right_arm_joint_5 | 0.094 | DS3218 20kg servo | 20.8x |
| right_arm_joint_6 | 0.064 | DS3218 20kg servo | 30.8x |
| right_arm_joint_7 | 0.033 | DS3218 20kg servo | 59.3x |
| left_hip_joint | 1.063 | DS3218 20kg servo | 1.8x |
| left_knee_joint | 0.501 | DS3218 20kg servo | 3.9x |
| left_ankle_joint | 0.058 | DS3218 20kg servo | 34.0x |
| right_hip_joint | 1.063 | DS3218 20kg servo | 1.8x |
| right_knee_joint | 0.501 | DS3218 20kg servo | 3.9x |
| right_ankle_joint | 0.058 | DS3218 20kg servo | 34.0x |

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
