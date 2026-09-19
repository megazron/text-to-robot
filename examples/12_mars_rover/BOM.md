# Bill of Materials — rover_arm

**Estimated total: $1475.19**  ·  tier: prosumer  ·  budget: $4000 ✅ within budget

**Torque sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint front_left_wheel_joint; rating duty/source unverified)_ | 8 | 12 | 96 | PWM, waterproof, metal gears (1.96 N·m) |
| Actuator | Dynamixel XM430-W350 _(joint joint_1; rating duty/source unverified)_ | 2 | 270 | 540 | RS485 smart servo, encoder (4.1 N·m) |
| Actuator | NEMA17 + lead screw _(joint left_finger_joint; rating duty/source unverified)_ | 2 | 26 | 52 | lead-screw linear stage (60 N·m) |
| Motor driver | TMC2209 driver | 2 | 10 | 20 | driver for NEMA17 + lead screw |
| Sensor | OAK-D Lite _(depth_1)_ | 1 | 150 | 150 | stereo depth + AI |
| Sensor | Raspberry Pi Camera Module 3 _(camera_1)_ | 1 | 25 | 25 | 12MP, CSI |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 43 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 304.71 | 304.71 | ~13.85 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 123.48 | 123.48 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| front_left_wheel_joint | 0.04 | DS3218 20kg servo | 49.1x |
| front_right_wheel_joint | 0.04 | DS3218 20kg servo | 49.1x |
| rear_left_wheel_joint | 0.04 | DS3218 20kg servo | 49.1x |
| rear_right_wheel_joint | 0.04 | DS3218 20kg servo | 49.1x |
| joint_1 | 1.683 | Dynamixel XM430-W350 | 2.4x |
| joint_2 | 1.572 | Dynamixel XM430-W350 | 2.6x |
| joint_3 | 0.879 | DS3218 20kg servo | 2.2x |
| joint_4 | 0.185 | DS3218 20kg servo | 10.6x |
| joint_5 | 0.151 | DS3218 20kg servo | 13.0x |
| joint_6 | 0.099 | DS3218 20kg servo | 19.7x |
| left_finger_joint | 32 | NEMA17 + lead screw | 1.9x |
| right_finger_joint | 32 | NEMA17 + lead screw | 1.9x |

## Warnings
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
