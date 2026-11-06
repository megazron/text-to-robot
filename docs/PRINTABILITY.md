# Printability

Every printed part of every designed example, audited by `scripts/print_audit.py` (`python -m ttr_build.dfm`): best orientation on a 250 x 210 x 220 mm bed, flat face down, support area (faces steeper than 45 deg), wall thickness (< 0.8 mm fails, 0.8-1.2 mm is a thin-wall warning), one connected watertight solid. Supports up to 8 % of the surface print without supports; up to 30 % (inside open shells) with removable supports.

| Example | Printable | With supports | Thin-wall warnings | Failing |
|---|--:|--:|--:|---|
| 01_arm_2dof | 5/6 | 0 | 0 | forearm: walls down to 0.19 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface |
| 02_arm_6dof | 10/10 | 0 | 1 | - |
| 03_arm_7dof | 11/11 | 0 | 0 | - |
| 04_scara | 13/13 | 5 | 0 | - |
| 05_diff_drive | 15/15 | 0 | 1 | - |
| 06_four_wheel | 21/21 | 0 | 0 | - |
| 07_mecanum | 15/15 | 0 | 0 | - |
| 08_humanoid | 27/30 | 5 | 1 | l_upper_arm_yaw_link: walls down to 0.79 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface; r_upper_arm_yaw_link: walls down to 0.70 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface; torso: walls down to 0.40 mm (< 0.8 mm = 2 extrusion lines) on 2% of the surface |
| 09_gripper | 7/7 | 3 | 1 | - |
| 10_quadruped | 15/15 | 0 | 0 | - |
| 11_spider_scout | 26/26 | 10 | 0 | - |
| 12_mars_rover | 21/21 | 0 | 3 | - |
| 13_battle_mech | 47/51 | 4 | 1 | l_shoulder_roll_armour_out: walls down to 0.51 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface; r_shoulder_roll_armour_out: walls down to 0.35 mm (< 0.8 mm = 2 extrusion lines) on 2% of the surface; torso: walls down to 0.60 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface; torso_b: walls down to 0.40 mm (< 0.8 mm = 2 extrusion lines) on 5% of the surface |
| 14_iron_man_mark_43 | 113/139 | 44 | 2 | eye_lens_2: walls down to 0.30 mm (< 0.8 mm = 2 extrusion lines) on 4% of the surface; helmet_back: needs supports under 332.3 cm^2 (31% of its surface) even in its best orientation; helmet_chin: walls down to 0.17 mm (< 0.8 mm = 2 extrusion lines) on 2% of the surface; helmet_faceplate_shell: walls down to 0.35 mm (< 0.8 mm = 2 extrusion lines) on 3% of the surface; helmet_top: walls down to 0.26 mm (< 0.8 mm = 2 extrusion lines) on 3% of the surface; left_hand_4: no flat face to stand on the bed; left_shin_1: walls down to 0.70 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface; left_thigh_9: needs supports under 28.6 cm^2 (38% of its surface) even in its best orientation; left_upper_arm_11: no flat face to stand on the bed; left_upper_arm_7: no flat face to stand on the bed; right_hand_5: no flat face to stand on the bed; right_upper_arm_14: no flat face to stand on the bed; right_upper_arm_15: no flat face to stand on the bed; right_upper_arm_8: no flat face to stand on the bed; torso_1: needs supports under 26.5 cm^2 (37% of its surface) even in its best orientation; torso_13: needs supports under 25.7 cm^2 (39% of its surface) even in its best orientation; torso_15: no flat face to stand on the bed; torso_16: walls down to 0.74 mm (< 0.8 mm = 2 extrusion lines) on 4% of the surface; torso_22: walls down to 0.34 mm (< 0.8 mm = 2 extrusion lines) on 5% of the surface; torso_28: needs supports under 58.7 cm^2 (35% of its surface) even in its best orientation; torso_30: needs supports under 38.2 cm^2 (30% of its surface) even in its best orientation; torso_36: walls down to 0.36 mm (< 0.8 mm = 2 extrusion lines) on 3% of the surface; torso_37: walls down to 0.33 mm (< 0.8 mm = 2 extrusion lines) on 2% of the surface; torso_39: needs supports under 43.4 cm^2 (31% of its surface) even in its best orientation; torso_45: walls down to 0.21 mm (< 0.8 mm = 2 extrusion lines) on 4% of the surface; torso_46: walls down to 0.42 mm (< 0.8 mm = 2 extrusion lines) on 2% of the surface |
| 15_wall_e | 8/8 | 1 | 0 | - |
| 16_eva | 35/36 | 3 | 2 | skirt_left_front: walls down to 0.53 mm (< 0.8 mm = 2 extrusion lines) on 1% of the surface |
| 17_baymax | 28/29 | 5 | 5 | head_dome: needs supports under 232.5 cm^2 (30% of its surface) even in its best orientation |
| 18_arduino_car | 4/4 | 0 | 0 | - |
| 19_arduino_arm | 9/9 | 0 | 0 | - |
