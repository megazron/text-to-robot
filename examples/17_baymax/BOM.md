# Bill of Materials — baymax

**Estimated total: $10082.68**  ·  tier: prosumer

**Effort sizing: fails; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Unitree GO-M8010-6 _(joint neck_joint; rating duty/source unverified; joint left_arm_joint_1; rating duty/source unverified; joint left_arm_joint_2; rating duty/source unverified; joint left_arm_joint_3; rating duty/source unverified; joint left_arm_joint_4; rating duty/source unverified; joint right_arm_joint_1; rating duty/source unverified; joint right_arm_joint_2; rating duty/source unverified; joint right_arm_joint_3; rating duty/source unverified; joint right_arm_joint_4; rating duty/source unverified; joint left_hip_yaw; rating duty/source unverified; joint left_hip_roll; rating duty/source unverified; joint left_hip_joint; rating duty/source unverified; joint left_knee_joint; rating duty/source unverified; joint left_ankle_roll; rating duty/source unverified; joint left_ankle_joint; rating duty/source unverified; joint right_hip_yaw; rating duty/source unverified; joint right_hip_roll; rating duty/source unverified; joint right_hip_joint; rating duty/source unverified; joint right_knee_joint; rating duty/source unverified; joint right_ankle_roll; rating duty/source unverified; joint right_ankle_joint; rating duty/source unverified)_ | 21 | 400 | 8400 | integrated BLDC + planetary, RS485 (23 N·m) |
| Sensor | Raspberry Pi Camera Module 3 _(face_camera)_ | 1 | 25 | 25 | 12MP, CSI |
| Sensor | Bosch BNO085 _(chest_imu)_ | 1 | 20 | 20 | 9-axis fused AHRS |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 6S 10000mAh | 1 | 95 | 95 | 222 Wh; est. load 512 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 381.16 | 381.16 | ~17.33 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 1037.52 | 1037.52 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| neck_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_1 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_2 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_3 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_4 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_1 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_2 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_3 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_4 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_hip_yaw | 9.6 | N·m | Unitree GO-M8010-6 | 2.4x |
| left_hip_roll | 16 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_hip_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_knee_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_ankle_roll | 9.6 | N·m | Unitree GO-M8010-6 | 2.4x |
| left_ankle_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_hip_yaw | 9.6 | N·m | Unitree GO-M8010-6 | 2.4x |
| right_hip_roll | 16 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_hip_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_knee_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_ankle_roll | 9.6 | N·m | Unitree GO-M8010-6 | 2.4x |
| right_ankle_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.
- ⚠️ joint neck_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_1 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_2 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_3 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_4 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_1 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_2 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_3 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_4 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_hip_roll needs ~16.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_hip_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_knee_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_ankle_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_hip_roll needs ~16.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_hip_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_knee_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_ankle_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
