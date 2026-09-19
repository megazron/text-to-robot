# Bill of Materials — rover_arm

**Estimated total: $843.08**  ·  tier: hobby  ·  budget: $4000 ✅ within budget

**Effort sizing: fails; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | NEMA17 stepper _(joint front_left_wheel_joint; rating duty/source unverified; joint front_right_wheel_joint; rating duty/source unverified; joint rear_left_wheel_joint; rating duty/source unverified; joint rear_right_wheel_joint; rating duty/source unverified)_ | 4 | 14 | 56 | 1.8deg, needs driver (0.45 N·m) |
| Motor driver | TMC2209 driver | 4 | 10 | 40 | driver for NEMA17 stepper |
| Actuator | DS3218 20kg servo _(joint joint_1; rating duty/source unverified; joint joint_2; rating duty/source unverified; joint joint_3; rating duty/source unverified; joint joint_4; rating duty/source unverified; joint joint_5; rating duty/source unverified; joint joint_6; rating duty/source unverified)_ | 6 | 12 | 72 | PWM, waterproof, metal gears (1.96 N·m) |
| Actuator | Linear actuator 100N _(joint left_finger_joint; rating duty/source unverified; joint right_finger_joint; rating duty/source unverified)_ | 2 | 35 | 70 | 12V, 100mm stroke (prismatic) (100 N) |
| Sensor | OAK-D Lite _(depth_1)_ | 1 | 150 | 150 | stereo depth + AI |
| Sensor | Raspberry Pi Camera Module 3 _(camera_1)_ | 1 | 25 | 25 | 12MP, CSI |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 49 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 199 | 199 | ~9.05 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 67.08 | 67.08 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| front_left_wheel_joint | 2 | N·m | NEMA17 stepper | UNDERSIZED |
| front_right_wheel_joint | 2 | N·m | NEMA17 stepper | UNDERSIZED |
| rear_left_wheel_joint | 2 | N·m | NEMA17 stepper | UNDERSIZED |
| rear_right_wheel_joint | 2 | N·m | NEMA17 stepper | UNDERSIZED |
| joint_1 | 9.6 | N·m | DS3218 20kg servo | UNDERSIZED |
| joint_2 | 9.6 | N·m | DS3218 20kg servo | UNDERSIZED |
| joint_3 | 6.4 | N·m | DS3218 20kg servo | UNDERSIZED |
| joint_4 | 3.2 | N·m | DS3218 20kg servo | UNDERSIZED |
| joint_5 | 2.4 | N·m | DS3218 20kg servo | UNDERSIZED |
| joint_6 | 1.6 | N·m | DS3218 20kg servo | UNDERSIZED |
| left_finger_joint | 32 | N | Linear actuator 100N | 3.1x |
| right_finger_joint | 32 | N | Linear actuator 100N | 3.1x |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.
- ⚠️ joint front_left_wheel_joint needs ~2.00 N·m; strongest in hobby tier is NEMA17 stepper (0.45 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_right_wheel_joint needs ~2.00 N·m; strongest in hobby tier is NEMA17 stepper (0.45 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_left_wheel_joint needs ~2.00 N·m; strongest in hobby tier is NEMA17 stepper (0.45 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_right_wheel_joint needs ~2.00 N·m; strongest in hobby tier is NEMA17 stepper (0.45 N·m) — increase budget for a stronger actuator
- ⚠️ joint joint_1 needs ~9.60 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint joint_2 needs ~9.60 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint joint_3 needs ~6.40 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint joint_4 needs ~3.20 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint joint_5 needs ~2.40 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint joint_6 needs ~1.60 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator

## Notes
- Tier: hobby. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
