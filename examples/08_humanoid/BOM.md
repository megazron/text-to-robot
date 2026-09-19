# Bill of Materials — humanoid_robot

**Estimated total: $10240.98**  ·  tier: prosumer

**Effort sizing: fails; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Unitree GO-M8010-6 _(joint neck_joint; rating duty/source unverified; joint left_arm_joint_1; rating duty/source unverified; joint left_arm_joint_2; rating duty/source unverified; joint left_arm_joint_3; rating duty/source unverified; joint left_arm_joint_4; rating duty/source unverified; joint left_arm_joint_5; rating duty/source unverified; joint left_arm_joint_6; rating duty/source unverified; joint left_arm_joint_7; rating duty/source unverified; joint right_arm_joint_1; rating duty/source unverified; joint right_arm_joint_2; rating duty/source unverified; joint right_arm_joint_3; rating duty/source unverified; joint right_arm_joint_4; rating duty/source unverified; joint right_arm_joint_5; rating duty/source unverified; joint right_arm_joint_6; rating duty/source unverified; joint right_arm_joint_7; rating duty/source unverified; joint left_hip_joint; rating duty/source unverified; joint left_knee_joint; rating duty/source unverified; joint left_ankle_joint; rating duty/source unverified; joint right_hip_joint; rating duty/source unverified; joint right_knee_joint; rating duty/source unverified; joint right_ankle_joint; rating duty/source unverified)_ | 21 | 400 | 8400 | integrated BLDC + planetary, RS485 (23 N·m) |
| Actuator | NEMA17 + lead screw _(joint left_left_finger_joint; rating duty/source unverified; joint left_right_finger_joint; rating duty/source unverified; joint right_left_finger_joint; rating duty/source unverified; joint right_right_finger_joint; rating duty/source unverified)_ | 4 | 26 | 104 | lead-screw linear stage (60 N) |
| Motor driver | TMC2209 driver | 4 | 10 | 40 | driver for NEMA17 + lead screw |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 6S 10000mAh | 1 | 95 | 95 | 222 Wh; est. load 531 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 428.58 | 428.58 | ~19.48 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 1049.4 | 1049.4 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| neck_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_1 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_2 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_3 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_4 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_5 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_6 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_joint_7 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_left_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |
| left_right_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |
| right_arm_joint_1 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_2 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_3 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_4 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_5 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_6 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_joint_7 | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_left_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |
| right_right_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |
| left_hip_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_knee_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| left_ankle_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_hip_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_knee_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| right_ankle_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.
- ⚠️ joint neck_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_1 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_2 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_3 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_4 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_5 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_6 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_joint_7 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_1 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_2 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_3 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_4 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_5 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_6 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_joint_7 needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_hip_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_knee_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_ankle_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_hip_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_knee_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_ankle_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
