# Bill of Materials — arm_2dof

**Estimated total: $281.7**  ·  tier: prosumer

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint joint_1)_ | 2 | 12 | 24 | PWM, waterproof, metal gears (1.96 N·m) |
| Actuator | NEMA17 + lead screw _(joint left_finger_joint)_ | 2 | 26 | 52 | lead-screw linear stage (60 N·m) |
| Motor driver | TMC2209 driver | 2 | 10 | 20 | driver for NEMA17 + lead screw |
| Compute | Teensy 4.1 | 1 | 32 | 32 | 600MHz MCU, real-time control |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 16 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 46.42 | 46.42 | ~2.11 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 23.28 | 23.28 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| joint_1 | 0.833 | DS3218 20kg servo | 2.4x |
| joint_2 | 0.722 | DS3218 20kg servo | 2.7x |
| left_finger_joint | 32 | NEMA17 + lead screw | 1.9x |
| right_finger_joint | 32 | NEMA17 + lead screw | 1.9x |

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
