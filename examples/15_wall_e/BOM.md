# Bill of Materials — wall_e

**Estimated total: $1154.31**  ·  tier: prosumer

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint left_front_wheel_joint)_ | 11 | 12 | 132 | PWM, waterproof, metal gears (1.96 N·m) |
| Actuator | NEMA17 + lead screw _(joint neck_lift)_ | 5 | 26 | 130 | lead-screw linear stage (60 N·m) |
| Motor driver | TMC2209 driver | 5 | 10 | 50 | driver for NEMA17 + lead screw |
| Sensor | Raspberry Pi Camera Module 3 _(left_eye_camera)_ | 3 | 25 | 75 | 12MP, CSI |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 54 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 539.35 | 539.35 | ~24.52 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 63.96 | 63.96 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| left_front_wheel_joint | 0.09 | DS3218 20kg servo | 21.8x |
| left_rear_wheel_joint | 0.09 | DS3218 20kg servo | 21.8x |
| right_front_wheel_joint | 0.09 | DS3218 20kg servo | 21.8x |
| right_rear_wheel_joint | 0.09 | DS3218 20kg servo | 21.8x |
| neck_lift | 10.312 | NEMA17 + lead screw | 5.8x |
| head_tilt | 0.419 | DS3218 20kg servo | 4.7x |
| left_arm_joint_1 | 0.801 | DS3218 20kg servo | 2.4x |
| left_arm_joint_2 | 0.649 | DS3218 20kg servo | 3.0x |
| left_arm_joint_3 | 0.298 | DS3218 20kg servo | 6.6x |
| left_left_finger_joint | 0.196 | NEMA17 + lead screw | 305.9x |
| left_right_finger_joint | 0.196 | NEMA17 + lead screw | 305.9x |
| right_arm_joint_1 | 0.674 | DS3218 20kg servo | 2.9x |
| right_arm_joint_2 | 0.538 | DS3218 20kg servo | 3.6x |
| right_arm_joint_3 | 0.231 | DS3218 20kg servo | 8.5x |
| right_left_finger_joint | 0.196 | NEMA17 + lead screw | 305.9x |
| right_right_finger_joint | 0.196 | NEMA17 + lead screw | 305.9x |

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
