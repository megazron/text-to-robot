# Export check

`python scripts/check_exports.py --designs --ros --moveit --rviz` on 2026-11-19: every export of every robot opened, built, loaded or run with the tool it is made for. ✓ passed, ✗ failed (the details follow the table), blank: the robot has no such export.

| Robot | urdf | xacro | rsp | colcon | launch | moveit | rviz | mujoco | stl | step | bom | firmware | wiring |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01_arm_2dof | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 02_arm_6dof | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 03_arm_7dof | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 04_scara | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 05_diff_drive | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 06_four_wheel | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 07_mecanum | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 08_humanoid | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 09_gripper | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 10_quadruped | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 11_spider_scout | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 12_mars_rover | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 13_battle_mech | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 14_iron_man_mark_43 | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| 15_wall_e | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 16_eva | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 17_baymax | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 18_arduino_car | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 19_arduino_arm | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 20_quadcopter | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 21_underwater_rov | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 22_pen_plotter | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| 23_robot_hand | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |
| 24_plant_waterer | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| two_6_dof_robot_arms_on_a_table | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| three_5_dof_robot_arms_on_a_table | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| four_4_dof_robot_arms_on_a_table | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_dual_arm_humanoid_torso | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_rover_with_two_6_dof_arms | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_mobile_robot_with_2_robot_arms | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_4_wheel_rover_with_a_6_dof_arm | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_quadruped_with_an_arm_on_its_back | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_3_wheel_robot | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_tricycle_robot_with_a_camera | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_four_wheel_robot_with_a_lidar | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_mecanum_robot | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_six_wheel_rover | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_heart_emoji_robot | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_shoe_shaped_robot | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_cartoon_robot | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_robot_that_looks_like_a_teapot | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| unicorn_emoji_robot | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_robot_shaped_like_a_banana | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_heart_shaped_robot_arm | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_cartoon_robot_dog | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_star_shaped_hexapod | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_heart_shaped_drone | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_heart_shaped_humanoid | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_2_dof_robot_arm | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_5_dof_robot_arm_with_a_camera | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_7_dof_robot_arm | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| an_arduino_robot_arm_with_sg90_servos | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| a_cheap_arduino_car | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| a_quadruped | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_hexapod | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_humanoid_robot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_quadcopter_drone_with_a_camera | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_robot_that_waters_my_plants | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_robot_that_delivers_packages | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_sci_fi_robot | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_rugged_four_wheel_robot | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_red_6_dof_robot_arm | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| a_6_wheel_rover_then_change_to_red_colour_and_only_4_wheels | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| three_6_dof_robot_arms_on_a_table_then_remove_one_arm_then_m | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |  | ✓ |
| build_a_robot_from_my_parts_arduino_uno_l298n_motor_driver_2 | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Failures

None.

## What was broken, and fixed in the generator

| Export | Problem | Fix |
|---|---|---|
| CAD package | `cad/<robot>_assembly.stl` was in metres beside print STLs in millimetres | written in mm (tests/exports.test.ts) |
| MoveIt (SCARA) | the SRDF checked the gripper's pinion against the racks it drives; they mesh at home, so move_group refused every plan (start state in collision) | a pinion and its racks are left out of the collision matrix; two sliding fingers stay checked (tests/exports.test.ts) |
| Wiring (rover with two arms) | 16.9 A through the 16 A rocker when no wall had room for the battery switch | the battery switch stands in the lid (tests/qa-regressions.test.ts) |

Known, noted rather than failed: examples/print_known_issues.json and examples/export_known_issues.json (EVA's camera bracket edge contact), the MG90S reference model (a picture of the part, never printed), zero-volume slivers in shell STLs, and KDL's warning that the root link has an inertia.

## Where it runs

CI runs the checks that need no ROS (URDF parse, mesh paths, inertias, limits, MuJoCo 10 s, STL, STEP, BOM, firmware, wiring) on every push. ROS 2 Jazzy, colcon, robot_state_publisher, the launch files, MoveIt and RViz need a ROS install, so `--ros --moveit --rviz` is run locally; this table is from such a run.
