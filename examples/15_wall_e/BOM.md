# Bill of Materials — wall_e

**Estimated total: $4228.83**  ·  tier: prosumer

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint left_front_wheel_joint)_ | 4 | 12 | 48 | PWM, waterproof, metal gears (1.96 N·m) |
| Actuator | NEMA17 + lead screw _(joint neck_lift)_ | 5 | 26 | 130 | lead-screw linear stage (60 N·m) |
| Motor driver | TMC2209 driver | 5 | 10 | 50 | driver for NEMA17 + lead screw |
| Actuator | Unitree GO-M8010-6 _(joint head_tilt)_ | 7 | 400 | 2800 | integrated BLDC + planetary, RS485 (23 N·m) |
| Sensor | Raspberry Pi Camera Module 3 _(left_eye_camera)_ | 2 | 25 | 50 | 12MP, CSI |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 6S 10000mAh | 1 | 95 | 95 | 222 Wh; est. load 208 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 538.35 | 538.35 | ~24.47 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 393.48 | 393.48 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| left_front_wheel_joint | 0.09 | DS3218 20kg servo | 21.8x |
| left_rear_wheel_joint | 0.09 | DS3218 20kg servo | 21.8x |
| right_front_wheel_joint | 0.09 | DS3218 20kg servo | 21.8x |
| right_rear_wheel_joint | 0.09 | DS3218 20kg servo | 21.8x |
| neck_lift | 32 | NEMA17 + lead screw | 1.9x |
| head_tilt | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_1 | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_2 | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_3 | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| left_left_finger_joint | 32 | NEMA17 + lead screw | 1.9x |
| left_right_finger_joint | 32 | NEMA17 + lead screw | 1.9x |
| right_arm_joint_1 | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_2 | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_3 | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| right_left_finger_joint | 32 | NEMA17 + lead screw | 1.9x |
| right_right_finger_joint | 32 | NEMA17 + lead screw | 1.9x |

## Warnings
- ⚠️ joint head_tilt needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_1 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_2 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_3 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_1 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_2 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_3 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
