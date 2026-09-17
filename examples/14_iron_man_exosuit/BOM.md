# Bill of Materials — iron_man_exosuit

**Estimated total: $29614**  ·  tier: research  ·  budget: $40000 ✅ within budget

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Harmonic Drive CSD + frameless BLDC (150 N·m) _(joint trunk_flex)_ | 7 | 2400 | 16800 | wearable-robot joint module, absolute encoder (150 N·m) |
| Actuator | CubeMars AK80-64 _(joint left_ankle_flexion)_ | 8 | 700 | 5600 | exoskeleton-class QDD, 64:1, CAN (120 N·m) |
| Actuator | T-Motor AK80-9 (BLDC + driver) _(joint left_wrist_flexion)_ | 2 | 320 | 640 | quasi-direct-drive, CAN (18 N·m) |
| Sensor | Arducam IMX477 HQ _(hud_camera)_ | 1 | 50 | 50 | 12.3MP, C-mount |
| Sensor | Bosch BNO085 _(trunk_imu)_ | 1 | 20 | 20 | 9-axis fused AHRS |
| Sensor | Loadstar / Tekscan insole force sensor _(left_insole_force)_ | 2 | 350 | 700 | calibrated plantar force |
| Compute | NVIDIA Jetson Orin Nano | 1 | 499 | 499 | GPU SBC, perception + ROS 2 |
| Power | LiPo 6S 10000mAh | 1 | 95 | 95 | 222 Wh; est. load 438 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | Aluminium frame + brackets | 1 | 2234.4 | 2234.4 | ~74.48 kg material @ $30/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 2931.6 | 2931.6 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| trunk_flex | 96 | Harmonic Drive CSD + frameless BLDC (150 N·m) | 1.6x |
| left_hip_abduction | 96 | Harmonic Drive CSD + frameless BLDC (150 N·m) | 1.6x |
| left_hip_flexion | 120 | Harmonic Drive CSD + frameless BLDC (150 N·m) | UNDERSIZED |
| left_knee_flexion | 120 | Harmonic Drive CSD + frameless BLDC (150 N·m) | UNDERSIZED |
| left_ankle_flexion | 80 | CubeMars AK80-64 | 1.5x |
| right_hip_abduction | 96 | Harmonic Drive CSD + frameless BLDC (150 N·m) | 1.6x |
| right_hip_flexion | 120 | Harmonic Drive CSD + frameless BLDC (150 N·m) | UNDERSIZED |
| right_knee_flexion | 120 | Harmonic Drive CSD + frameless BLDC (150 N·m) | UNDERSIZED |
| right_ankle_flexion | 80 | CubeMars AK80-64 | 1.5x |
| left_shoulder_abduction | 48 | CubeMars AK80-64 | 2.5x |
| left_shoulder_flexion | 48 | CubeMars AK80-64 | 2.5x |
| left_elbow_flexion | 32 | CubeMars AK80-64 | 3.8x |
| left_wrist_flexion | 12 | T-Motor AK80-9 (BLDC + driver) | 1.5x |
| right_shoulder_abduction | 48 | CubeMars AK80-64 | 2.5x |
| right_shoulder_flexion | 48 | CubeMars AK80-64 | 2.5x |
| right_elbow_flexion | 32 | CubeMars AK80-64 | 3.8x |
| right_wrist_flexion | 12 | T-Motor AK80-9 (BLDC + driver) | 1.5x |

## Warnings
- ⚠️ joint left_hip_flexion needs ~120.00 N·m; strongest in research tier is Harmonic Drive CSD + frameless BLDC (150 N·m) (150 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_knee_flexion needs ~120.00 N·m; strongest in research tier is Harmonic Drive CSD + frameless BLDC (150 N·m) (150 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_hip_flexion needs ~120.00 N·m; strongest in research tier is Harmonic Drive CSD + frameless BLDC (150 N·m) (150 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_knee_flexion needs ~120.00 N·m; strongest in research tier is Harmonic Drive CSD + frameless BLDC (150 N·m) (150 N·m) — increase budget for a stronger actuator

## Notes
- Tier: research. Prices are planning estimates (USD), not quotes. Structure assumes machined aluminium.
