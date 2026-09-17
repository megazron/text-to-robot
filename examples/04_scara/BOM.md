# Bill of Materials — scara

**Estimated total: $552.59**  ·  tier: prosumer

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Dynamixel XM430-W350 _(joint joint_1)_ | 1 | 270 | 270 | RS485 smart servo, encoder (4.1 N·m) |
| Actuator | DS3218 20kg servo _(joint joint_2)_ | 2 | 12 | 24 | PWM, waterproof, metal gears (1.96 N·m) |
| Actuator | NEMA17 + lead screw _(joint joint_3)_ | 1 | 26 | 26 | lead-screw linear stage (60 N·m) |
| Motor driver | TMC2209 driver | 1 | 10 | 10 | driver for NEMA17 + lead screw |
| Compute | Teensy 4.1 | 1 | 32 | 32 | 600MHz MCU, real-time control |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 16 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 55.23 | 55.23 | ~2.51 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 51.36 | 51.36 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| joint_1 | 1.835 | Dynamixel XM430-W350 | 2.2x |
| joint_2 | 0.465 | DS3218 20kg servo | 4.2x |
| joint_3 | 0.862 | NEMA17 + lead screw | 69.6x |
| joint_4 | 0.003 | DS3218 20kg servo | 666.2x |

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
