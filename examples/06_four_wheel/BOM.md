# Bill of Materials — four_wheel_robot

**Estimated total: $406.18**  ·  tier: prosumer

**Torque sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint front_left_wheel_joint; rating duty/source unverified)_ | 4 | 12 | 48 | PWM, waterproof, metal gears (1.96 N·m) |
| Compute | Teensy 4.1 | 1 | 32 | 32 | 600MHz MCU, real-time control |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 10 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 224.66 | 224.66 | ~10.21 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 17.52 | 17.52 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| front_left_wheel_joint | 0.04 | DS3218 20kg servo | 49.1x |
| front_right_wheel_joint | 0.04 | DS3218 20kg servo | 49.1x |
| rear_left_wheel_joint | 0.04 | DS3218 20kg servo | 49.1x |
| rear_right_wheel_joint | 0.04 | DS3218 20kg servo | 49.1x |

## Warnings
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
