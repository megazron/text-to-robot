# Bill of Materials — quadruped

**Estimated total: $484.03**  ·  tier: prosumer

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint front_left_hip_joint)_ | 12 | 12 | 144 | PWM, waterproof, metal gears (1.96 N·m) |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 32 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 141.23 | 141.23 | ~6.42 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 34.8 | 34.8 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| front_left_hip_joint | 0.159 | DS3218 20kg servo | 12.3x |
| front_left_thigh_joint | 0.143 | DS3218 20kg servo | 13.7x |
| front_left_knee_joint | 0.057 | DS3218 20kg servo | 34.1x |
| front_right_hip_joint | 0.159 | DS3218 20kg servo | 12.3x |
| front_right_thigh_joint | 0.143 | DS3218 20kg servo | 13.7x |
| front_right_knee_joint | 0.057 | DS3218 20kg servo | 34.1x |
| rear_left_hip_joint | 0.159 | DS3218 20kg servo | 12.3x |
| rear_left_thigh_joint | 0.143 | DS3218 20kg servo | 13.7x |
| rear_left_knee_joint | 0.057 | DS3218 20kg servo | 34.1x |
| rear_right_hip_joint | 0.159 | DS3218 20kg servo | 12.3x |
| rear_right_thigh_joint | 0.143 | DS3218 20kg servo | 13.7x |
| rear_right_knee_joint | 0.057 | DS3218 20kg servo | 34.1x |

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
