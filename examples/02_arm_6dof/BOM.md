# Bill of Materials — arm_6dof

**Estimated total: $222.28**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Mechanical | Ball bearing 625-2Z 5x16x5 mm _(clevis bearing, joint shoulder_pitch; clevis bearing, joint elbow_pitch; clevis bearing, joint wrist_pitch · https://www.vxb.com/search?q=625-2Z)_ | 3 | 0.55 | 1.65 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(joint base_yaw; joint elbow_pitch; joint forearm_roll; joint wrist_pitch; … · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 6 | 22 | 132 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Actuator | Feetech STS3250 C002 12 V 50 kg.cm (1:345) _(joint shoulder_pitch · https://openelab.io/products/feetech-sts3250-c002-servo-12v)_ | 1 | 40 | 40 | 1.5691 N·m rated / 4.9033 N·m peak, 12 V |
| Power | Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) _(12 V actuator supply · https://www.digikey.com/en/products/result?keywords=LRS-75-12)_ | 1 | 22 | 22 | 12 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to actuator bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 8 printed parts _(base_link, turret, upper_arm, forearm, forearm_rotator, wrist, wrist_rotator, gripper_jaw)_ | 1 | 8.95 | 8.95 | 354 g of parts (+15 % supports/waste), about 32.3 h of printing |
| Fasteners | Screws, nuts and inserts | 59 | 0.12 | 7.08 | 4x M5 x 12 socket head (base to bench); 24x M2 x 6 case screws; 28x horn screws; 3x M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| base_yaw | 0 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 99x |
| shoulder_pitch | 1.944 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.52x |
| elbow_pitch | 1.238 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 2.38x |
| forearm_roll | 0.007 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 99x |
| wrist_pitch | 0.473 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 6.23x |
| wrist_roll | 0.001 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 99x |

## Notes
- 6-DOF arm, 420 mm reach, 0.1 kg payload, Feetech STS serial-bus servos (12 V)
- Sized for a 0.1 kg payload.
- Arm clamps or bolts to the bench through the four M5 holes in the base; it is not free-standing at full reach.
- Every pitch joint is a clevis: one cheek bolts to the servo horn, the other turns on a 625ZZ bearing on an M5 bolt screwed into a heat-set insert in a boss on the back of the servo's cradle, so the servo's own bearing carries no bending moment. An M5 washer sits between the boss and the bearing's inner race.
- Print the links in PETG or PLA+ with 4 perimeters and 30 % gyroid infill, cradle opening up; press the 625ZZ bearings into their seats (16.15 mm) and set the M5 inserts with a soldering iron.
- Torques are exact static gravity loads of this geometry: the worst pose (stretched out with the payload) must be held within each actuator's rated continuous torque, peaks get +30 %, and each joint must still reach >= 1 rad/s loaded on its torque-speed line.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
