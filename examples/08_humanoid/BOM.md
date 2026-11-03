# Bill of Materials — humanoid_robot

**Estimated total: $12629.25**  ·  tier: prosumer

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Unitree GO-M8010-6 _(joint neck_joint; rating duty/source unverified; joint left_arm_joint_1; rating duty/source unverified; joint left_arm_joint_2; rating duty/source unverified; joint left_arm_joint_3; rating duty/source unverified; joint left_arm_joint_4; rating duty/source unverified; joint left_arm_joint_5; rating duty/source unverified; joint left_arm_joint_6; rating duty/source unverified; joint left_arm_joint_7; rating duty/source unverified; joint right_arm_joint_1; rating duty/source unverified; joint right_arm_joint_2; rating duty/source unverified; joint right_arm_joint_3; rating duty/source unverified; joint right_arm_joint_4; rating duty/source unverified; joint right_arm_joint_5; rating duty/source unverified; joint right_arm_joint_6; rating duty/source unverified; joint right_arm_joint_7; rating duty/source unverified; joint left_hip_yaw; rating duty/source unverified; joint left_hip_roll; rating duty/source unverified; joint left_hip_joint; rating duty/source unverified; joint left_knee_joint; rating duty/source unverified; joint left_ankle_roll; rating duty/source unverified; joint left_ankle_joint; rating duty/source unverified; joint right_hip_yaw; rating duty/source unverified; joint right_hip_roll; rating duty/source unverified; joint right_hip_joint; rating duty/source unverified; joint right_knee_joint; rating duty/source unverified; joint right_ankle_roll; rating duty/source unverified; joint right_ankle_joint; rating duty/source unverified)_ | 27 | 400 | 10800 | integrated BLDC + planetary, RS485 (23 N·m) |
| Actuator | NEMA17 + lead screw _(joint left_left_finger_joint; rating duty/source unverified; joint left_right_finger_joint; rating duty/source unverified; joint right_left_finger_joint; rating duty/source unverified; joint right_right_finger_joint; rating duty/source unverified)_ | 4 | 26 | 104 | lead-screw linear stage (60 N) |
| Motor driver | TMC2209 driver | 4 | 10 | 40 | driver for NEMA17 + lead screw |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 6S 10000mAh | 1 | 95 | 95 | 222 Wh; est. load 675 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 128.85 | 128.85 | ~5.86 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 1337.4 | 1337.4 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| neck_joint | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| left_arm_joint_1 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| left_arm_joint_2 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| left_arm_joint_3 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| left_arm_joint_4 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| left_arm_joint_5 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| left_arm_joint_6 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| left_arm_joint_7 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| left_left_finger_joint | 10.125 | N | NEMA17 + lead screw | 5.9x |
| left_right_finger_joint | 10.125 | N | NEMA17 + lead screw | 5.9x |
| right_arm_joint_1 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| right_arm_joint_2 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| right_arm_joint_3 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| right_arm_joint_4 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| right_arm_joint_5 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| right_arm_joint_6 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| right_arm_joint_7 | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| right_left_finger_joint | 10.125 | N | NEMA17 + lead screw | 5.9x |
| right_right_finger_joint | 10.125 | N | NEMA17 + lead screw | 5.9x |
| left_hip_yaw | 3.038 | N·m | Unitree GO-M8010-6 | 7.6x |
| left_hip_roll | 5.063 | N·m | Unitree GO-M8010-6 | 4.5x |
| left_hip_joint | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| left_knee_joint | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| left_ankle_roll | 3.038 | N·m | Unitree GO-M8010-6 | 7.6x |
| left_ankle_joint | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| right_hip_yaw | 3.038 | N·m | Unitree GO-M8010-6 | 7.6x |
| right_hip_roll | 5.063 | N·m | Unitree GO-M8010-6 | 4.5x |
| right_hip_joint | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| right_knee_joint | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |
| right_ankle_roll | 3.038 | N·m | Unitree GO-M8010-6 | 7.6x |
| right_ankle_joint | 12.656 | N·m | Unitree GO-M8010-6 | 1.8x |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
