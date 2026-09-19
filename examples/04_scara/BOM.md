# Bill of Materials — scara

**Estimated total: $574.98**  ·  tier: prosumer

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Dynamixel XM430-W350 _(joint joint_1; rating duty/source unverified)_ | 1 | 270 | 270 | RS485 smart servo, encoder (4.1 N·m) |
| Actuator | DS3218 20kg servo _(joint joint_2; rating duty/source unverified; joint joint_4; rating duty/source unverified)_ | 2 | 12 | 24 | PWM, waterproof, metal gears (1.96 N·m) |
| Actuator | Linear actuator 100N _(joint joint_3; rating duty/source unverified)_ | 1 | 35 | 35 | 12V, 100mm stroke (prismatic) (100 N) |
| Compute | Teensy 4.1 | 1 | 32 | 32 | 600MHz MCU, real-time control |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 16 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 78.74 | 78.74 | ~3.58 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 51.24 | 51.24 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| joint_1 | 1.835 | N·m | Dynamixel XM430-W350 | 2.2x |
| joint_2 | 0.465 | N·m | DS3218 20kg servo | 4.2x |
| joint_3 | 64 | N | Linear actuator 100N | 1.6x |
| joint_4 | 0.003 | N·m | DS3218 20kg servo | 666.2x |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
