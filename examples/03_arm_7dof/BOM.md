# Bill of Materials — arm_7dof

**Estimated total: $240.61**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(joint base_yaw; joint upper_arm_roll; joint elbow_pitch; joint forearm_roll; … · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 7 | 22 | 154 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Actuator | Feetech STS3250 C002 12 V 50 kg.cm (1:345) _(joint shoulder_pitch · https://openelab.io/products/feetech-sts3250-c002-servo-12v)_ | 1 | 40 | 40 | 1.5691 N·m rated / 4.9033 N·m peak, 12 V |
| Power | Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) _(12 V actuator supply · https://www.digikey.com/en/products/result?keywords=LRS-75-12)_ | 1 | 22 | 22 | 12 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to actuator bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 9 printed parts _(base_link, turret, upper_arm, upper_arm_rotator, forearm, forearm_rotator, wrist, wrist_rotator, gripper_jaw)_ | 1 | 6.33 | 6.33 | 250 g of parts (+15 % supports/waste), about 22.8 h of printing |
| Fasteners | Screws, nuts and inserts | 64 | 0.12 | 7.68 | 4x M5 x 12 socket head (base to bench); 28x M2 x 6 case screws; 32x horn screws |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| base_yaw | 0 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 99x |
| shoulder_pitch | 1.937 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.53x |
| upper_arm_roll | 0.006 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 99x |
| elbow_pitch | 1.056 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.79x |
| forearm_roll | 0.002 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 99x |
| wrist_pitch | 0.435 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 6.76x |
| wrist_roll | 0.001 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 99x |

## Notes
- 7-DOF arm, 450 mm reach, 0.1 kg payload, Feetech STS serial-bus servos (12 V)
- Sized for a 0.1 kg payload.
- Arm clamps or bolts to the bench through the four M5 holes in the base; it is not free-standing at full reach.
- Links are cantilevered from one side of each horn (as on SO-101 / Koch arms); add an idler bearing on the far side for heavy use.
- Torques are exact static gravity loads of this geometry: the worst pose (stretched out with the payload) must be held within each actuator's rated continuous torque, peaks get +30 %, and each joint must still reach >= 1 rad/s loaded on its torque-speed line.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
