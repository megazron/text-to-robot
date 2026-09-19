# Bill of Materials — arm_6dof

**Estimated total: $2731.52**  ·  tier: prosumer

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Unitree GO-M8010-6 _(joint joint_1; rating duty/source unverified; joint joint_2; rating duty/source unverified; joint joint_3; rating duty/source unverified; joint joint_4; rating duty/source unverified)_ | 4 | 400 | 1600 | integrated BLDC + planetary, RS485 (23 N·m) |
| Actuator | Dynamixel XM430-W350 _(joint joint_5; rating duty/source unverified; joint joint_6; rating duty/source unverified)_ | 2 | 270 | 540 | RS485 smart servo, encoder (4.1 N·m) |
| Actuator | NEMA17 + lead screw _(joint left_finger_joint; rating duty/source unverified; joint right_finger_joint; rating duty/source unverified)_ | 2 | 26 | 52 | lead-screw linear stage (60 N) |
| Motor driver | TMC2209 driver | 2 | 10 | 20 | driver for NEMA17 + lead screw |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 123 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 72.56 | 72.56 | ~3.30 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 282.96 | 282.96 | ~12% of electronics |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| joint_1 | 9.6 | N·m | Unitree GO-M8010-6 | 2.4x |
| joint_2 | 9.6 | N·m | Unitree GO-M8010-6 | 2.4x |
| joint_3 | 6.4 | N·m | Unitree GO-M8010-6 | 3.6x |
| joint_4 | 3.2 | N·m | Unitree GO-M8010-6 | 7.2x |
| joint_5 | 2.4 | N·m | Dynamixel XM430-W350 | 1.7x |
| joint_6 | 1.6 | N·m | Dynamixel XM430-W350 | 2.6x |
| left_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |
| right_finger_joint | 32 | N | NEMA17 + lead screw | 1.9x |

## Warnings
- ⚠️ Sizing uses a neutral-pose gravity proxy and declared joint effort, not a worst-case workspace or dynamic load analysis. Selection checks only approximate effort and broad motion type. Speed/torque curves, travel, voltage, feedback, mounting, thermal duty and wiring are not qualified.
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
