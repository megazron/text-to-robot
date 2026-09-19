# Bill of Materials — arm_2dof

**Estimated total: $1159.51**  ·  tier: prosumer

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Unitree GO-M8010-6 _(joint joint_1; rating duty/source unverified; joint joint_2; rating duty/source unverified)_ | 2 | 400 | 800 | integrated BLDC + planetary, RS485 (23 N·m) |
| Actuator | NEMA17 + lead screw _(joint left_finger_joint; rating duty/source unverified; joint right_finger_joint; rating duty/source unverified)_ | 2 | 26 | 52 | lead-screw linear stage (60 N) |
| Motor driver | TMC2209 driver | 2 | 10 | 20 | driver for NEMA17 + lead screw |
| Compute | Teensy 4.1 | 1 | 32 | 32 | 600MHz MCU, real-time control |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 60 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 55.11 | 55.11 | ~2.50 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 116.4 | 116.4 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| joint_1 | 9.6 | N·m | Unitree GO-M8010-6 | 2.4x |
| joint_2 | 9.6 | N·m | Unitree GO-M8010-6 | 2.4x |
| left_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |
| right_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
