# Bill of Materials — hexapod

**Estimated total: $595.73**  ·  tier: hobby  ·  budget: $1500 ✅ within budget

**Torque sizing: fails; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint front_left_coxa_joint; rating duty/source unverified)_ | 18 | 12 | 216 | PWM, waterproof, metal gears (1.96 N·m) |
| Sensor | Slamtec RPLidar A1M8 _(lidar_1)_ | 1 | 99 | 99 | 2D, 12m, 8k samples/s |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 3S 2200mAh | 1 | 18 | 18 | 24 Wh; est. load 44 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 86.05 | 86.05 | ~3.91 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 52.68 | 52.68 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| front_left_coxa_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| front_left_femur_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| front_left_tibia_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| mid_left_coxa_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| mid_left_femur_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| mid_left_tibia_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| rear_left_coxa_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| rear_left_femur_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| rear_left_tibia_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| front_right_coxa_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| front_right_femur_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| front_right_tibia_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| mid_right_coxa_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| mid_right_femur_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| mid_right_tibia_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| rear_right_coxa_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| rear_right_femur_joint | 40 | DS3218 20kg servo | UNDERSIZED |
| rear_right_tibia_joint | 40 | DS3218 20kg servo | UNDERSIZED |

## Warnings
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.
- ⚠️ joint front_left_coxa_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_left_femur_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_left_tibia_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint mid_left_coxa_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint mid_left_femur_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint mid_left_tibia_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_left_coxa_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_left_femur_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_left_tibia_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_right_coxa_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_right_femur_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_right_tibia_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint mid_right_coxa_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint mid_right_femur_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint mid_right_tibia_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_right_coxa_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_right_femur_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_right_tibia_joint needs ~40.00 N·m; strongest in hobby tier is DS3218 20kg servo (1.96 N·m) — increase budget for a stronger actuator

## Notes
- Tier: hobby. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
