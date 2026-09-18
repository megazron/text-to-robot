# Bill of Materials — iron_man_mark_suit

**Estimated total: $44679.96**  ·  tier: research  ·  budget: $60000 ✅ within budget

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Harmonic Drive CSD + frameless BLDC (150 N·m) _(joint trunk_flex)_ | 7 | 2400 | 16800 | wearable-robot joint module, absolute encoder (150 N·m) |
| Actuator | CubeMars AK80-64 _(joint left_ankle_flexion)_ | 8 | 700 | 5600 | exoskeleton-class QDD, 64:1, CAN (120 N·m) |
| Actuator | T-Motor AK80-9 (BLDC + driver) _(joint left_wrist_flexion)_ | 6 | 320 | 1920 | quasi-direct-drive, CAN (18 N·m) |
| Actuator | Dynamixel XM430-W350 _(joint faceplate_hinge)_ | 41 | 270 | 11070 | RS485 smart servo, encoder (4.1 N·m) |
| Sensor | Arducam IMX477 HQ _(hud_camera)_ | 1 | 50 | 50 | 12.3MP, C-mount |
| Sensor | Bosch BNO085 _(trunk_imu)_ | 1 | 20 | 20 | 9-axis fused AHRS |
| Sensor | Loadstar / Tekscan insole force sensor _(left_insole_force)_ | 2 | 350 | 700 | calibrated plantar force |
| Compute | NVIDIA Jetson Orin Nano | 1 | 499 | 499 | GPU SBC, perception + ROS 2 |
| Power | Li-ion 48V 20Ah pack | 1 | 320 | 320 | 960 Wh; est. load 731 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | Aluminium frame + brackets | 1 | 3216.36 | 3216.36 | ~107.21 kg material @ $30/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 4440.6 | 4440.6 | ~12% of electronics |

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
| faceplate_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_chest_plate_hinge | 4.8 | T-Motor AK80-9 (BLDC + driver) | 3.7x |
| left_back_door_hinge | 4.8 | T-Motor AK80-9 (BLDC + driver) | 3.7x |
| left_air_brake_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| right_chest_plate_hinge | 4.8 | T-Motor AK80-9 (BLDC + driver) | 3.7x |
| right_back_door_hinge | 4.8 | T-Motor AK80-9 (BLDC + driver) | 3.7x |
| right_air_brake_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| ab_plate_1_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| ab_plate_2_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| ab_plate_3_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| codpiece_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_pauldron_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_bicep_inner_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_elbow_cap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_gauntlet_inner_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_gauntlet_hatch_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| left_finger_1_hinge | 0.8 | Dynamixel XM430-W350 | 5.1x |
| left_finger_2_hinge | 0.8 | Dynamixel XM430-W350 | 5.1x |
| left_finger_3_hinge | 0.8 | Dynamixel XM430-W350 | 5.1x |
| left_finger_4_hinge | 0.8 | Dynamixel XM430-W350 | 5.1x |
| left_thumb_hinge | 0.8 | Dynamixel XM430-W350 | 5.1x |
| right_pauldron_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| right_bicep_inner_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| right_elbow_cap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| right_gauntlet_inner_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| right_gauntlet_hatch_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| right_finger_1_hinge | 0.8 | Dynamixel XM430-W350 | 5.1x |
| right_finger_2_hinge | 0.8 | Dynamixel XM430-W350 | 5.1x |
| right_finger_3_hinge | 0.8 | Dynamixel XM430-W350 | 5.1x |
| right_finger_4_hinge | 0.8 | Dynamixel XM430-W350 | 5.1x |
| right_thumb_hinge | 0.8 | Dynamixel XM430-W350 | 5.1x |
| left_hip_flap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_thigh_inner_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_knee_cap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_calf_shell_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_boot_shin_guard_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_thruster_cover_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| left_ankle_flap_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| right_hip_flap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| right_thigh_inner_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| right_knee_cap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| right_calf_shell_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| right_boot_shin_guard_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| right_thruster_cover_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| right_ankle_flap_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |

## Warnings
- ⚠️ joint left_hip_flexion needs ~120.00 N·m; strongest in research tier is Harmonic Drive CSD + frameless BLDC (150 N·m) (150 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_knee_flexion needs ~120.00 N·m; strongest in research tier is Harmonic Drive CSD + frameless BLDC (150 N·m) (150 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_hip_flexion needs ~120.00 N·m; strongest in research tier is Harmonic Drive CSD + frameless BLDC (150 N·m) (150 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_knee_flexion needs ~120.00 N·m; strongest in research tier is Harmonic Drive CSD + frameless BLDC (150 N·m) (150 N·m) — increase budget for a stronger actuator

## Notes
- Tier: research. Prices are planning estimates (USD), not quotes. Structure assumes machined aluminium.
