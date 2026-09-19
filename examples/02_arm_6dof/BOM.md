# Bill of Materials — arm_6dof

**Estimated total: $998.77**  ·  tier: prosumer

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Dynamixel XM430-W350 _(joint joint_1; rating duty/source unverified; joint joint_2; rating duty/source unverified)_ | 2 | 270 | 540 | RS485 smart servo, encoder (4.1 N·m) |
| Actuator | DS3218 20kg servo _(joint joint_3; rating duty/source unverified; joint joint_4; rating duty/source unverified; joint joint_5; rating duty/source unverified; joint joint_6; rating duty/source unverified)_ | 4 | 12 | 48 | PWM, waterproof, metal gears (1.96 N·m) |
| Actuator | NEMA17 + lead screw _(joint left_finger_joint; rating duty/source unverified; joint right_finger_joint; rating duty/source unverified)_ | 2 | 26 | 52 | lead-screw linear stage (60 N) |
| Motor driver | TMC2209 driver | 2 | 10 | 20 | driver for NEMA17 + lead screw |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 35 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 78.05 | 78.05 | ~3.55 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 96.72 | 96.72 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| joint_1 | 1.683 | N·m | Dynamixel XM430-W350 | 2.4x |
| joint_2 | 1.572 | N·m | Dynamixel XM430-W350 | 2.6x |
| joint_3 | 0.879 | N·m | DS3218 20kg servo | 2.2x |
| joint_4 | 0.185 | N·m | DS3218 20kg servo | 10.6x |
| joint_5 | 0.151 | N·m | DS3218 20kg servo | 13.0x |
| joint_6 | 0.099 | N·m | DS3218 20kg servo | 19.7x |
| left_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |
| right_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
