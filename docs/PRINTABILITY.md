# Printability

Every printed part of every designed example, audited by `scripts/print_audit.py` (`python -m ttr_build.dfm`): best orientation on a 250 x 210 x 220 mm bed, flat face down, support area (faces steeper than 45 deg), wall thickness (< 0.8 mm fails, 0.8-1.2 mm is a thin-wall warning), one connected watertight solid. Supports up to 8 % of the surface print without supports; up to 30 % (inside open shells) with removable supports.

| Example | Printable | With supports | Thin-wall warnings | Failing |
|---|--:|--:|--:|---|
| 01_arm_2dof | 3/4 | 0 | 0 | forearm: walls down to 0.21 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface |
| 02_arm_6dof | 8/8 | 0 | 1 | - |
| 03_arm_7dof | 9/9 | 0 | 0 | - |
| 04_scara | 12/12 | 4 | 0 | - |
| 05_diff_drive | 15/15 | 0 | 0 | - |
| 06_four_wheel | 19/19 | 0 | 0 | - |
| 07_mecanum | 15/15 | 0 | 0 | - |
| 08_humanoid | 23/26 | 5 | 1 | l_upper_arm_yaw_link: walls down to 0.79 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface; r_upper_arm_yaw_link: walls down to 0.70 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface; torso: walls down to 0.40 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface |
| 09_gripper | 5/5 | 3 | 1 | - |
| 10_quadruped | 14/14 | 0 | 0 | - |
| 11_spider_scout | 20/20 | 8 | 0 | - |
| 12_mars_rover | 20/20 | 0 | 2 | - |
| 13_battle_mech | 39/45 | 3 | 0 | l_ankle_pitch_link: mesh is not watertight (not a closed solid); l_hip_pitch_link_b: mesh is not watertight (not a closed solid); l_shoulder_roll_armour_out: walls down to 0.51 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface; r_ankle_pitch_link: mesh is not watertight (not a closed solid); r_shoulder_roll_armour_out: walls down to 0.35 mm (< 0.8 mm = 2 extrusion lines) on 2% of the surface; torso_b: walls down to 0.40 mm (< 0.8 mm = 2 extrusion lines) on 6% of the surface |
| 14_iron_man_mark_43 | 68/70 | 2 | 2 | helmet_cranium_1: walls down to 0.79 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface; helmet_cranium_3: walls down to 0.74 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface |
| 15_wall_e | 8/8 | 1 | 0 | - |
| 16_eva | 35/36 | 3 | 2 | skirt_left_front: walls down to 0.53 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface |
| 17_baymax | 28/29 | 5 | 5 | head_dome: needs supports under 232.5 cm^2 (30% of its surface) even in its best orientation |
| 18_arduino_car | 2/2 | 0 | 0 | - |
| 19_arduino_arm | 5/5 | 0 | 0 | - |
