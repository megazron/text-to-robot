# Bill of Materials — quadruped

**Estimated total: $5760.35**  ·  tier: prosumer

**Effort sizing: fails; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Unitree GO-M8010-6 _(joint front_left_hip_joint; rating duty/source unverified; joint front_left_thigh_joint; rating duty/source unverified; joint front_left_knee_joint; rating duty/source unverified; joint front_right_hip_joint; rating duty/source unverified; joint front_right_thigh_joint; rating duty/source unverified; joint front_right_knee_joint; rating duty/source unverified; joint rear_left_hip_joint; rating duty/source unverified; joint rear_left_thigh_joint; rating duty/source unverified; joint rear_left_knee_joint; rating duty/source unverified; joint rear_right_hip_joint; rating duty/source unverified; joint rear_right_thigh_joint; rating duty/source unverified; joint rear_right_knee_joint; rating duty/source unverified)_ | 12 | 400 | 4800 | integrated BLDC + planetary, RS485 (23 N·m) |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 6S 10000mAh | 1 | 95 | 95 | 222 Wh; est. load 296 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 141.23 | 141.23 | ~6.42 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 600.12 | 600.12 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| front_left_hip_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| front_left_thigh_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| front_left_knee_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| front_right_hip_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| front_right_thigh_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| front_right_knee_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| rear_left_hip_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| rear_left_thigh_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| rear_left_knee_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| rear_right_hip_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| rear_right_thigh_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |
| rear_right_knee_joint | 40 | N·m | Unitree GO-M8010-6 | UNDERSIZED |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.
- ⚠️ joint front_left_hip_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_left_thigh_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_left_knee_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_right_hip_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_right_thigh_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint front_right_knee_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_left_hip_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_left_thigh_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_left_knee_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_right_hip_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_right_thigh_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint rear_right_knee_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
