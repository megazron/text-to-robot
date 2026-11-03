# Bill of Materials — arm_7dof

**Estimated total: $1197.03**  ·  tier: prosumer

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Mechanical | Ball bearing 625-2Z 5x16x5 mm _(clevis bearing, joint shoulder_pitch; clevis bearing, joint elbow_pitch; clevis bearing, joint wrist_pitch · https://www.vxb.com/search?q=625-2Z)_ | 3 | 0.55 | 1.65 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z |
| Electronics | ROBOTIS U2D2 USB to TTL/RS-485 interface _(USB to actuator bus · https://www.generationrobots.com/en/400848-usb2dynamixel-robotis.html)_ | 1 | 32.1 | 32.1 | 5 V |
| Actuator | DYNAMIXEL XH540-W270-T(R) _(joint shoulder_pitch · https://robotis.us/dynamixel-xh540-w270-t)_ | 1 | 539.9 | 539.9 | 2.97 N·m rated / 9.9 N·m peak, 12 V |
| Actuator | DYNAMIXEL XL430-W250-T _(joint base_yaw; joint upper_arm_roll; joint forearm_roll; joint wrist_pitch; … · https://robotis.us/dynamixel-xl430-w250-t)_ | 6 | 44.9 | 269.4 | 0.42 N·m rated / 1.4 N·m peak, 11.1 V |
| Actuator | DYNAMIXEL XM430-W350-T(R) _(joint elbow_pitch · https://www.robotshop.com/products/robotis-dynamixel-xm430-w350-t-smart-servo-actuator)_ | 1 | 310.39 | 310.39 | 1.23 N·m rated / 4.1 N·m peak, 12 V |
| Power | Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) _(12 V actuator supply · https://www.digikey.com/en/products/result?keywords=LRS-75-12)_ | 1 | 22 | 22 | 12 V |
| Printed structure | PETG filament for 9 printed parts _(base_link, turret, upper_arm, upper_arm_rotator, forearm, forearm_rotator, wrist, wrist_rotator, gripper_jaw)_ | 1 | 10.19 | 10.19 | 403 g of parts (+15 % supports/waste), about 36.7 h of printing |
| Fasteners | Screws, nuts and inserts | 95 | 0.12 | 11.4 | 4x M5 x 12 socket head (base to bench); 28x M2.5 x 6 case screws; 60x horn screws; 3x M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| base_yaw | 0 | N·m | DYNAMIXEL XL430-W250-T | 99x |
| shoulder_pitch | 2.418 | N·m | DYNAMIXEL XH540-W270-T(R) | 4.09x |
| upper_arm_roll | 0.017 | N·m | DYNAMIXEL XL430-W250-T | 82.8x |
| elbow_pitch | 1.215 | N·m | DYNAMIXEL XM430-W350-T(R) | 3.38x |
| forearm_roll | 0.009 | N·m | DYNAMIXEL XL430-W250-T | 99x |
| wrist_pitch | 0.483 | N·m | DYNAMIXEL XL430-W250-T | 2.9x |
| wrist_roll | 0.001 | N·m | DYNAMIXEL XL430-W250-T | 99x |

## Notes
- 7-DOF arm, 464 mm reach, 0.1 kg payload, ROBOTIS DYNAMIXEL X-series (12 V)
- Sized for a 0.1 kg payload.
- Arm clamps or bolts to the bench through the four M5 holes in the base; it is not free-standing at full reach.
- Links are cantilevered from one side of each horn (as on SO-101 / Koch arms); add an idler bearing on the far side for heavy use.
- Torques are exact static gravity loads of this geometry: the worst pose (stretched out with the payload) must be held within each actuator's rated continuous torque, peaks get +30 %, and each joint must still reach >= 1 rad/s loaded on its torque-speed line.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
