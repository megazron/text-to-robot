# Bill of Materials — iron_man_mark_43

**Estimated total: $38708.7**  ·  tier: research  ·  budget: $60000 ✅ within budget

**Torque sizing: fails; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | CubeMars AK80-64 _(joint trunk_flex; rating source: https://www.cubemars.com/goods.php?id=1143)_ | 15 | 700 | 10500 | AK80-64 KV80: 64:1, 48 N m rated / 120 N m peak, 98 x 61.9 mm, 850 g; mounting interfaces require vendor drawing (48 N·m) |
| Actuator | T-Motor AK80-9 (BLDC + driver) _(joint left_wrist_flexion; rating duty/source unverified)_ | 4 | 320 | 1280 | quasi-direct-drive, CAN (18 N·m) |
| Actuator | Dynamixel XM430-W350 _(joint helmet_crown_panel_hinge; rating duty/source unverified)_ | 63 | 270 | 17010 | RS485 smart servo, encoder (4.1 N·m) |
| Actuator | Dynamixel MX-64AR _(joint neck_yaw; rating duty/source unverified)_ | 4 | 300 | 1200 | RS485 smart servo (6 N·m) |
| Sensor | Arducam IMX477 HQ _(hud_camera)_ | 1 | 50 | 50 | 12.3MP, C-mount |
| Sensor | Bosch BNO085 _(trunk_imu)_ | 1 | 20 | 20 | 9-axis fused AHRS |
| Sensor | Loadstar / Tekscan insole force sensor _(left_insole_force)_ | 2 | 350 | 700 | calibrated plantar force |
| Compute | NVIDIA Jetson Orin Nano | 1 | 499 | 499 | GPU SBC, perception + ROS 2 |
| Power | Li-ion 48V 20Ah pack | 1 | 320 | 320 | 960 Wh; est. load 808 W |
| Power | DC-DC buck regulator (5V/10A) | 1 | 12 | 12 | logic + servo rail |
| Power | Power distribution board + fuse + switch | 1 | 14 | 14 | wiring harness backbone |
| Structure | Aluminium frame + brackets | 1 | 3293.1 | 3293.1 | ~109.77 kg material @ $30/kg |
| Structure | Fastener + bearing kit | 1 | 18 | 18 | M3 screws, heat inserts, 608 bearings |
| Wiring & misc | Wiring, connectors, JST/Dupont, sleeving | 1 | 3792.6 | 3792.6 | ~12% of electronics |

## Actuator sizing

| Joint | Required torque (N·m) | Chosen actuator | Margin |
|---|--:|---|--:|
| trunk_flex | 96 | CubeMars AK80-64 | UNDERSIZED |
| left_hip_abduction | 96 | CubeMars AK80-64 | UNDERSIZED |
| left_hip_flexion | 120 | CubeMars AK80-64 | UNDERSIZED |
| left_knee_flexion | 120 | CubeMars AK80-64 | UNDERSIZED |
| left_ankle_flexion | 80 | CubeMars AK80-64 | UNDERSIZED |
| right_hip_abduction | 96 | CubeMars AK80-64 | UNDERSIZED |
| right_hip_flexion | 120 | CubeMars AK80-64 | UNDERSIZED |
| right_knee_flexion | 120 | CubeMars AK80-64 | UNDERSIZED |
| right_ankle_flexion | 80 | CubeMars AK80-64 | UNDERSIZED |
| left_shoulder_abduction | 48 | CubeMars AK80-64 | UNDERSIZED |
| left_shoulder_flexion | 48 | CubeMars AK80-64 | UNDERSIZED |
| left_elbow_flexion | 32 | CubeMars AK80-64 | 1.5x |
| left_wrist_flexion | 12 | T-Motor AK80-9 (BLDC + driver) | 1.5x |
| right_shoulder_abduction | 48 | CubeMars AK80-64 | UNDERSIZED |
| right_shoulder_flexion | 48 | CubeMars AK80-64 | UNDERSIZED |
| right_elbow_flexion | 32 | CubeMars AK80-64 | 1.5x |
| right_wrist_flexion | 12 | T-Motor AK80-9 (BLDC + driver) | 1.5x |
| helmet_crown_panel_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| faceplate_hinge | 2 | Dynamixel XM430-W350 | 2.0x |
| left_cheek_panel_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| right_cheek_panel_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| chin_guard_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| neck_yaw | 3.2 | Dynamixel MX-64AR | 1.9x |
| neck_pitch | 3.2 | Dynamixel MX-64AR | 1.9x |
| left_chest_door_hinge | 4.8 | T-Motor AK80-9 (BLDC + driver) | 3.7x |
| right_chest_door_hinge | 4.8 | T-Motor AK80-9 (BLDC + driver) | 3.7x |
| ab_plate_1_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| ab_plate_2_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| ab_plate_3_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_lat_plate_hinge | 3.2 | Dynamixel MX-64AR | 1.9x |
| right_lat_plate_hinge | 3.2 | Dynamixel MX-64AR | 1.9x |
| left_flight_flap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| right_flight_flap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| codpiece_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_pauldron_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_bicep_clamshell_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_elbow_cap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_gauntlet_clamshell_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_gauntlet_hatch_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| left_finger_1_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_1_middle_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_1_distal_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_2_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_2_middle_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_2_distal_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_3_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_3_middle_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_3_distal_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_4_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_4_middle_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_finger_4_distal_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| left_thumb_hinge | 0.32 | Dynamixel XM430-W350 | 12.8x |
| left_thumb_distal_hinge | 0.24 | Dynamixel XM430-W350 | 17.1x |
| right_pauldron_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| right_bicep_clamshell_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| right_elbow_cap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| right_gauntlet_clamshell_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| right_gauntlet_hatch_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| right_finger_1_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_1_middle_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_1_distal_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_2_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_2_middle_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_2_distal_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_3_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_3_middle_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_3_distal_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_4_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_4_middle_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_finger_4_distal_hinge | 0.28 | Dynamixel XM430-W350 | 14.6x |
| right_thumb_hinge | 0.32 | Dynamixel XM430-W350 | 12.8x |
| right_thumb_distal_hinge | 0.24 | Dynamixel XM430-W350 | 17.1x |
| left_hip_flap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_thigh_clamshell_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_knee_cap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_calf_clamshell_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| left_shin_guard_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| left_thruster_cover_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| left_ankle_flap_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| right_hip_flap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| right_thigh_clamshell_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| right_knee_cap_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| right_calf_clamshell_hinge | 2.4 | Dynamixel XM430-W350 | 1.7x |
| right_shin_guard_hinge | 1.6 | Dynamixel XM430-W350 | 2.6x |
| right_thruster_cover_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |
| right_ankle_flap_hinge | 1.2 | Dynamixel XM430-W350 | 3.4x |

## Warnings
- ⚠️ Catalog values are planning estimates. Except explicitly sourced rated values, torque entries may be stall/peak ratings; continuous duty, fit and complete assemblies are unverified.
- ⚠️ joint trunk_flex needs ~96.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_hip_abduction needs ~96.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_hip_flexion needs ~120.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_knee_flexion needs ~120.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_ankle_flexion needs ~80.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_hip_abduction needs ~96.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_hip_flexion needs ~120.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_knee_flexion needs ~120.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_ankle_flexion needs ~80.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_shoulder_abduction needs ~48.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint left_shoulder_flexion needs ~48.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_shoulder_abduction needs ~48.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator
- ⚠️ joint right_shoulder_flexion needs ~48.00 N·m; strongest in research tier is CubeMars AK80-64 (48 N·m) — increase budget for a stronger actuator

## Notes
- Tier: research. Prices are planning estimates (USD), not quotes. Structure assumes machined aluminium.
