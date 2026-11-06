# Examples

Every example is regenerated from its prompt by `node scripts/build_examples.ts` and simulated by `scripts/simulate_examples.py`. Each robot is built from real, purchasable parts sized from its own loads; the GIF is recorded from its MuJoCo task tests under the real actuator limits.

| Example | Robot | Parts cost | Mass | Design checks | Simulation |
|---|---|--:|--:|--:|--:|
| [01_arm_2dof](01_arm_2dof/README.md)<br><img src="01_arm_2dof/simulation.gif" width="220"> | 2-DOF arm, 350 mm reach, 0.1 kg payload, Feetech STS serial-bus servos (12 V) | $145.15 | 0.55 kg | 29/29 | 4/4 |
| [02_arm_6dof](02_arm_6dof/README.md)<br><img src="02_arm_6dof/simulation.gif" width="220"> | 6-DOF arm, 455 mm reach, 0.1 kg payload, ROBOTIS DYNAMIXEL X-series (12 V) | $1168.42 | 0.948 kg | 41/41 | 4/4 |
| [03_arm_7dof](03_arm_7dof/README.md)<br><img src="03_arm_7dof/simulation.gif" width="220"> | 7-DOF arm, 500 mm reach, 0.1 kg payload, ROBOTIS DYNAMIXEL X-series (12 V) | $1216.73 | 1.053 kg | 44/44 | 4/4 |
| [04_scara](04_scara/README.md)<br><img src="04_scara/simulation.gif" width="220"> | SCARA arm: 0.30 m reach, 159 mm Z stroke, 0.5 kg payload; NEMA17 + 5.18:1 planetary on J1/J2, Tr8x8 lead-screw Z, Feetech STS3215 C047 12 V 30 kg.cm (1:345) wrist, parallel gripper | $359 | 4.985 kg | 56/56 | 2/2 |
| [05_diff_drive](05_diff_drive/README.md)<br><img src="05_diff_drive/simulation.gif" width="220"> | Differential-drive base: pololu_37d_30to1_64cpr gearmotors, 1.489 kg, 1.24 m/s, 1.8 h on 1 x lipo_3s_2200, rpi5 | $512.27 | 1.489 kg | 49/49 | 3/3 |
| [06_four_wheel](06_four_wheel/README.md)<br><img src="06_four_wheel/simulation.gif" width="220"> | Four-wheel skid-steer base: pololu_37d_30to1_64cpr gearmotors, 2.399 kg, 1.24 m/s, 1.47 h on 1 x lipo_3s_2200, rpi5 | $695.36 | 2.399 kg | 61/61 | 3/3 |
| [07_mecanum](07_mecanum/README.md)<br><img src="07_mecanum/simulation.gif" width="220"> | Mecanum holonomic base: pololu_37d_30to1_64cpr gearmotors, 2.92 kg, 1.33 m/s, 1.58 h on 1 x lipo_3s_2200, rpi5 | $816.77 | 2.92 kg | 50/50 | 2/2 |
| [08_humanoid](08_humanoid/README.md)<br><img src="08_humanoid/simulation.gif" width="220"> | Humanoid, 0.653 m, 3.60 kg, 24 DOF (4-DOF arms + grippers), 44 min, $4221 of parts | $4318.9 | 3.599 kg | 94/94 | 3/3 |
| [09_gripper](09_gripper/README.md)<br><img src="09_gripper/simulation.gif" width="220"> | Parallel gripper: 60 mm stroke, 47 N rated squeeze per finger, Feetech STS3215 C047 12 V 30 kg.cm (1:345) | $93.49 | 1.032 kg | 29/29 | 0/0 |
| [10_quadruped](10_quadruped/README.md)<br><img src="10_quadruped/simulation.gif" width="220"> | Servo quadruped, 1.41 kg, hip height 0.18 m, 12 DOF, 33 min runtime, $530 of parts | $578.75 | 1.409 kg | 62/62 | 2/2 |
| [11_spider_scout](11_spider_scout/README.md)<br><img src="11_spider_scout/simulation.gif" width="220"> | Hexapod, 18 x Feetech STS3250 C002 12 V 50 kg.cm (1:345), 2.43 kg, 207 mm body, camera + lidar + imu, 41 min, $1030 of parts | $1100.45 | 2.43 kg | 86/86 | 2/2 |
| [12_mars_rover](12_mars_rover/README.md)<br><img src="12_mars_rover/simulation.gif" width="220"> | 4-wheel rocker-bogie rover with a 6-DOF arm: 4.648 kg, 1.24 m/s, 1.53 h, jetson_orin_nano_super | $3859.12 | 4.648 kg | 74/74 | 2/3 |
| [13_battle_mech](13_battle_mech/README.md)<br><img src="13_battle_mech/simulation.gif" width="220"> | Battle mech, 1.182 m, 22.97 kg, 30 DOF (7-DOF arms + grippers), 170 min, $16183 of parts | $16644.04 | 22.968 kg | 132/132 | 3/3 |
| [14_iron_man_mark_43](14_iron_man_mark_43/README.md)<br><img src="14_iron_man_mark_43/simulation.gif" width="220"> | Iron Man Mark 43 (full wearable suit): 151 printed pieces, 8.5 kg filament, motorised faceplate, $322 incl. filament | $334.36 | 86.39 kg | 163/163 | 1/1 |
| [15_wall_e](15_wall_e/README.md)<br><img src="15_wall_e/simulation.gif" width="220"> | Arduino WALL-E: TPU tracks on 4 TT motors, pan/tilt binocular head, 2 servo arms, 0.95 kg, $73 of parts | $87.75 | 0.946 kg | 51/51 | 3/3 |
| [16_eva](16_eva/README.md)<br><img src="16_eva/simulation.gif" width="220"> | EVA-style companion robot: 3.368 kg, hidden diff-drive base, pan head with camera, two servo fins | $622.67 | 3.368 kg | 52/52 | 3/3 |
| [17_baymax](17_baymax/README.md)<br><img src="17_baymax/simulation.gif" width="220"> | Baymax-style service robot: 5.405 kg, 1.01 m tall, 4WD hidden base, two 4-servo arms, pan head with camera | $880.88 | 5.405 kg | 53/53 | 3/3 |
| [18_arduino_car](18_arduino_car/README.md)<br><img src="18_arduino_car/simulation.gif" width="220"> | Arduino car (stronger (4WD, ramps up to 10 deg)): 4WD on TT gear motors, 0.60 kg, 0.54 m/s, 99 min, $51 of parts | $58.13 | 0.605 kg | 36/36 | 3/3 |
| [19_arduino_arm](19_arduino_arm/README.md)<br><img src="19_arduino_arm/simulation.gif" width="220"> | Arduino desk arm: 3 DOF + claw, 280 mm reach, 20 g payload, 0.82 kg, $50 of parts | $63.54 | 0.817 kg | 40/40 | 3/3 |
