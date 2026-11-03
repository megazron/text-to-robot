# Bill of Materials — arm_2dof

**Estimated total: $129.98**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Mechanical | Ball bearing 625-2Z 5x16x5 mm _(clevis bearing, joint shoulder_pitch; clevis bearing, joint elbow_pitch · https://www.vxb.com/search?q=625-2Z)_ | 2 | 0.55 | 1.1 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(joint elbow_pitch; gripper · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 2 | 22 | 44 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Actuator | Feetech STS3250 C002 12 V 50 kg.cm (1:345) _(joint shoulder_pitch · https://openelab.io/products/feetech-sts3250-c002-servo-12v)_ | 1 | 40 | 40 | 1.5691 N·m rated / 4.9033 N·m peak, 12 V |
| Power | Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) _(12 V actuator supply · https://www.digikey.com/en/products/result?keywords=LRS-75-12)_ | 1 | 22 | 22 | 12 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to actuator bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 4 printed parts _(base_link, upper_arm, forearm, gripper_jaw)_ | 1 | 9.16 | 9.16 | 362 g of parts (+15 % supports/waste), about 33.0 h of printing |
| Fasteners | Screws, nuts and inserts | 26 | 0.12 | 3.12 | 4x M5 x 12 socket head (base to bench); 8x M2 x 6 case screws; 12x horn screws; 2x M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| shoulder_pitch | 1.316 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 3.73x |
| elbow_pitch | 0.534 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 5.51x |

## Notes
- 2-DOF arm, 350 mm reach, 0.1 kg payload, Feetech STS serial-bus servos (12 V)
- Sized for a 0.1 kg payload.
- Arm clamps or bolts to the bench through the four M5 holes in the base; it is not free-standing at full reach.
- Links are cantilevered from one side of each horn (as on SO-101 / Koch arms); add an idler bearing on the far side for heavy use.
- Torques are exact static gravity loads of this geometry: the worst pose (stretched out with the payload) must be held within each actuator's rated continuous torque, peaks get +30 %, and each joint must still reach >= 1 rad/s loaded on its torque-speed line.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
