# Bill of Materials — eva

**Estimated total: $1169.37**  ·  tier: prosumer

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | DS3218 20kg servo _(joint neck_joint)_ | 5 | 12 | 60 | PWM, waterproof, metal gears (1.96 N·m) |
| Sensor | Raspberry Pi Camera Module 3 _(visor_camera)_ | 1 | 25 | 25 | 12MP, CSI |
| Sensor | Bosch BNO085 _(flight_imu)_ | 1 | 20 | 20 | 9-axis fused AHRS |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 18 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 870.25 | 870.25 | ~39.56 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 30.12 | 30.12 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| neck_joint | 0.917 | DS3218 20kg servo | 2.1x |
| left_shoulder_joint | 0.486 | DS3218 20kg servo | 4.0x |
| left_arm_roll | 0.127 | DS3218 20kg servo | 15.5x |
| right_shoulder_joint | 0.486 | DS3218 20kg servo | 4.0x |
| right_arm_roll | 0.127 | DS3218 20kg servo | 15.5x |

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
