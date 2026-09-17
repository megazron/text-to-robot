# Bill of Materials — hexapod

**Estimated total: $620.37**  ·  tier: prosumer  ·  budget: $1500 ✅ within budget

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint front_left_coxa_joint)_ | 18 | 12 | 216 | PWM, waterproof, metal gears (1.96 N·m) |
| Sensor | Slamtec RPLidar A1M8 _(lidar_1)_ | 1 | 99 | 99 | 2D, 12m, 8k samples/s |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 44 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 86.05 | 86.05 | ~3.91 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 55.32 | 55.32 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| front_left_coxa_joint | 0.101 | DS3218 20kg servo | 19.3x |
| front_left_femur_joint | 0.063 | DS3218 20kg servo | 31.2x |
| front_left_tibia_joint | 0.017 | DS3218 20kg servo | 116.2x |
| mid_left_coxa_joint | 0.101 | DS3218 20kg servo | 19.3x |
| mid_left_femur_joint | 0.063 | DS3218 20kg servo | 31.2x |
| mid_left_tibia_joint | 0.017 | DS3218 20kg servo | 116.2x |
| rear_left_coxa_joint | 0.101 | DS3218 20kg servo | 19.3x |
| rear_left_femur_joint | 0.063 | DS3218 20kg servo | 31.2x |
| rear_left_tibia_joint | 0.017 | DS3218 20kg servo | 116.2x |
| front_right_coxa_joint | 0.101 | DS3218 20kg servo | 19.3x |
| front_right_femur_joint | 0.063 | DS3218 20kg servo | 31.2x |
| front_right_tibia_joint | 0.017 | DS3218 20kg servo | 116.2x |
| mid_right_coxa_joint | 0.101 | DS3218 20kg servo | 19.3x |
| mid_right_femur_joint | 0.063 | DS3218 20kg servo | 31.2x |
| mid_right_tibia_joint | 0.017 | DS3218 20kg servo | 116.2x |
| rear_right_coxa_joint | 0.101 | DS3218 20kg servo | 19.3x |
| rear_right_femur_joint | 0.063 | DS3218 20kg servo | 31.2x |
| rear_right_tibia_joint | 0.017 | DS3218 20kg servo | 116.2x |

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
