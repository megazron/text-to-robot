# Bill of Materials — arm_2dof

**Estimated total: $105.59**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(joint shoulder_pitch; joint elbow_pitch; gripper · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 3 | 22 | 66 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Power | Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) _(12 V actuator supply · https://www.digikey.com/en/products/result?keywords=LRS-75-12)_ | 1 | 22 | 22 | 12 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to actuator bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 4 printed parts _(base_link, upper_arm, forearm, gripper_jaw)_ | 1 | 4.11 | 4.11 | 163 g of parts (+15 % supports/waste), about 14.8 h of printing |
| Fasteners | Screws, nuts and inserts | 24 | 0.12 | 2.88 | 4x M5 x 12 socket head (base to bench); 8x M2 x 6 case screws; 12x horn screws |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| shoulder_pitch | 0.939 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 3.13x |
| elbow_pitch | 0.43 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 6.83x |

## Notes
- 2-DOF arm, 350 mm reach, 0.1 kg payload, Feetech STS serial-bus servos (12 V)
- Sized for a 0.1 kg payload.
- Arm clamps or bolts to the bench through the four M5 holes in the base; it is not free-standing at full reach.
- Links are cantilevered from one side of each horn (as on SO-101 / Koch arms); add an idler bearing on the far side for heavy use.
- Torques are exact static gravity loads of this geometry: the worst pose (stretched out with the payload) must be held within each actuator's rated continuous torque, peaks get +30 %, and each joint must still reach >= 1 rad/s loaded on its torque-speed line.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
