# Bill of Materials — mecanum_robot

**Estimated total: $2047.37**  ·  tier: prosumer

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Unitree GO-M8010-6 _(joint front_left_wheel_joint; rating duty/source unverified; joint front_right_wheel_joint; rating duty/source unverified; joint rear_left_wheel_joint; rating duty/source unverified; joint rear_right_wheel_joint; rating duty/source unverified)_ | 4 | 400 | 1600 | integrated BLDC + planetary, RS485 (23 N·m) |
| Compute | Teensy 4.1 | 1 | 32 | 32 | 600MHz MCU, real-time control |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 98 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 127.61 | 127.61 | ~5.80 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 203.76 | 203.76 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| front_left_wheel_joint | 2 | N·m | Unitree GO-M8010-6 | 11.5x |
| front_right_wheel_joint | 2 | N·m | Unitree GO-M8010-6 | 11.5x |
| rear_left_wheel_joint | 2 | N·m | Unitree GO-M8010-6 | 11.5x |
| rear_right_wheel_joint | 2 | N·m | Unitree GO-M8010-6 | 11.5x |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
