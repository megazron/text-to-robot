# Bill of Materials — wall_e

**Estimated total: $3970.49**  ·  tier: prosumer

**Effort sizing: fails; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | NEMA17 stepper _(joint left_front_wheel_joint; rating duty/source unverified; joint left_rear_wheel_joint; rating duty/source unverified; joint right_front_wheel_joint; rating duty/source unverified; joint right_rear_wheel_joint; rating duty/source unverified)_ | 4 | 14 | 56 | 1.8deg, needs driver (0.45 N·m) |
| Motor driver | TMC2209 driver | 9 | 10 | 90 | driver for NEMA17 stepper |
| Actuator | NEMA17 + lead screw _(joint neck_lift; rating duty/source unverified; joint left_left_finger_joint; rating duty/source unverified; joint left_right_finger_joint; rating duty/source unverified; joint right_left_finger_joint; rating duty/source unverified; joint right_right_finger_joint; rating duty/source unverified)_ | 5 | 26 | 130 | lead-screw linear stage (60 N) |
| Actuator | Unitree GO-M8010-6 _(joint head_tilt; rating duty/source unverified; joint left_arm_joint_1; rating duty/source unverified; joint left_arm_joint_2; rating duty/source unverified; joint left_arm_joint_3; rating duty/source unverified; joint right_arm_joint_1; rating duty/source unverified; joint right_arm_joint_2; rating duty/source unverified; joint right_arm_joint_3; rating duty/source unverified)_ | 7 | 400 | 2800 | integrated BLDC + planetary, RS485 (23 N·m) |
| Sensor | Raspberry Pi Camera Module 3 _(left_eye_camera; right_eye_camera)_ | 2 | 25 | 50 | 12MP, CSI |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 6S 10000mAh | 1 | 95 | 95 | 222 Wh; est. load 219 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 226.25 | 226.25 | ~10.28 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 399.24 | 399.24 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| left_front_wheel_joint | 0.09 | N·m | NEMA17 stepper | 5.0x |
| left_rear_wheel_joint | 0.09 | N·m | NEMA17 stepper | 5.0x |
| right_front_wheel_joint | 0.09 | N·m | NEMA17 stepper | 5.0x |
| right_rear_wheel_joint | 0.09 | N·m | NEMA17 stepper | 5.0x |
| neck_lift | 32 | N | NEMA17 + lead screw | 1.9x |
| head_tilt | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_1 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_2 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_3 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_left_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |
| left_right_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |
| right_arm_joint_1 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_2 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_3 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_left_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |
| right_right_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.
- ⚠️ joint head_tilt needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_1 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_2 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_3 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_1 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_2 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_3 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
