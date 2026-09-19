# Example gallery and validation

All 17 examples were exported and tested with self-collision enabled. Zero initial contacts is an initial-pose check, not full-range clearance or hardware qualification.

| Example | MuJoCo checks | Initial penetrations | Remaining failed checks |
|---|---|---|---|
| [01_arm_2dof](01_arm_2dof/) | 5/5 | 0 | none in this smoke battery |
| [02_arm_6dof](02_arm_6dof/) | 4/5 | 0 | actuator_sweep |
| [03_arm_7dof](03_arm_7dof/) | 4/5 | 0 | actuator_sweep |
| [04_scara](04_scara/) | 4/5 | 0 | actuator_sweep |
| [05_diff_drive](05_diff_drive/) | 6/6 | 0 | none in this smoke battery |
| [06_four_wheel](06_four_wheel/) | 6/6 | 0 | none in this smoke battery |
| [07_mecanum](07_mecanum/) | 6/6 | 0 | none in this smoke battery |
| [08_humanoid](08_humanoid/) | 4/6 | 0 | actuator_sweep, disturbance_recovery |
| [09_gripper](09_gripper/) | 5/5 | 0 | none in this smoke battery |
| [10_quadruped](10_quadruped/) | 5/6 | 0 | actuator_sweep |
| [11_spider_scout](11_spider_scout/) | 6/6 | 0 | none in this smoke battery |
| [12_mars_rover](12_mars_rover/) | 5/6 | 0 | actuator_sweep |
| [13_battle_mech](13_battle_mech/) | 3/6 | 0 | settle_under_gravity, actuator_sweep, disturbance_recovery |
| [14_iron_man_mark_43](14_iron_man_mark_43/) | 2/6 | 227 | initial_clearance, settle_under_gravity, hold_pose, actuator_sweep |
| [15_wall_e](15_wall_e/) | 5/6 | 0 | actuator_sweep |
| [16_eva](16_eva/) | 5/6 | 0 | disturbance_recovery |
| [17_baymax](17_baymax/) | 4/6 | 0 | actuator_sweep, disturbance_recovery |
