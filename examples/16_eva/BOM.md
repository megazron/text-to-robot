# Bill of Materials — eva

**Estimated total: $3342.17**  ·  tier: prosumer

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Unitree GO-M8010-6 _(joint neck_joint)_ | 5 | 400 | 2000 | integrated BLDC + planetary, RS485 (23 N·m) |
| Sensor | Raspberry Pi Camera Module 3 _(visor_camera)_ | 1 | 25 | 25 | 12MP, CSI |
| Sensor | Bosch BNO085 _(flight_imu)_ | 1 | 20 | 20 | 9-axis fused AHRS |
| Compute | Raspberry Pi 5 (8GB) | 1 | 80 | 80 | SBC, runs ROS 2 |
| Power | LiPo 4S 5000mAh | 1 | 40 | 40 | 74 Wh; est. load 128 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | 3D-printed frame (PLA/PETG) | 1 | 870.25 | 870.25 | ~39.56 kg material @ $22/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 262.92 | 262.92 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| neck_joint | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| left_shoulder_joint | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| left_arm_roll | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| right_shoulder_joint | 40 | Unitree GO-M8010-6 | UNDERSIZED |
| right_arm_roll | 40 | Unitree GO-M8010-6 | UNDERSIZED |

## Warnings
- ⚠️ joint neck_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_shoulder_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_arm_roll needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_shoulder_joint needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_arm_roll needs ~40.00 N·m; strongest in prosumer tier is Unitree GO-M8010-6 (23 N·m) — increase budget for a stronger actuator

## Notes
- Tier: prosumer. Prices are planning estimates (USD), not quotes. Structure assumes FDM 3D printing.
