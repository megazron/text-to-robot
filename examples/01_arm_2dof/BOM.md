# Bill of materials: arm_2dof

**Estimated total: $146.52**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Mechanical | Ball bearing 625-2Z 5x16x5 mm _(clevis bearing, joint shoulder_pitch; clevis bearing, joint elbow_pitch · https://www.vxb.com/search?q=625-2Z)_ | 2 | 0.55 | 1.1 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(joint elbow_pitch; gripper · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 2 | 22 | 44 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Actuator | Feetech STS3250 C002 12 V 50 kg.cm (1:345) _(joint shoulder_pitch · https://openelab.io/products/feetech-sts3250-c002-servo-12v)_ | 1 | 40 | 40 | 1.5691 N·m rated / 4.9033 N·m peak, 12 V |
| Power | IEC C14 panel inlet with fuse drawer and rocker switch, 10 A _(fused, switched mains inlet · https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html)_ | 1 | 3 | 3 | https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html |
| Power | Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) _(12 V actuator supply · https://www.digikey.com/en/products/result?keywords=LRS-75-12)_ | 1 | 22 | 22 | 12 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to actuator bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 6 printed parts _(base_link, upper_arm, forearm, gripper_jaw, control_case, control_case_lid)_ | 1 | 13.66 | 13.66 | 540 g of parts (+15 % supports/waste), about 49.2 h of printing |
| Fasteners | Screws, nuts and inserts | 36 | 0.12 | 4.32 | 4x M5 x 12 socket head (base to bench); 8x M2 x 6 case screws; 12x horn screws; 2x M5 x 16 socket head + M5 washer + M5 heat-set insert (clevis bearing axle); 4x M3 x 10 self-tapping (lid to compartment); 2x M3 x 6 self-tapping (Mean Well LRS-75-12 enclosed PSU, 12 V 6 A to standoffs); 4x M2 x 6 self-tapping (Waveshare Bus Servo Adapter to standoffs) |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 0.6 | 0.5 | 0.3 | 0.6 m: 0.519 mm2, rated 5.5 A in a bundle; 0.51 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 2.4 | 0.4 | 0.96 | 2.4 m: 0.327 mm2, rated 3.5 A in a bundle; 2.15 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 2.4 | 0.35 | 0.84 | 2.4 m: 0.205 mm2, rated 1.75 A in a bundle; 2.12 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 1.8 | 0.3 | 0.54 | 1.8 m: 0.128 mm2, rated 1.1 A in a bundle; 1.61 m cut + 10 % waste |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 3 | 0.08 | 0.24 | 3 pc: rated 15 A per contact |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 7 | 0.03 | 0.21 | 7 pc: rated 17.5 A per contact |
| Wiring | Molex 5264 contacts _(price estimated)_ | 18 | 0.05 | 0.9 | 18 pc: rated 3 A per contact |
| Wiring | Molex 5264 housings _(price estimated)_ | 6 | 0.08 | 0.48 | 6 pc: one per cable end |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 0.3 | 0.2 | 0.06 | 0.3 m: 0 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 7 | 0.02 | 0.14 | 7 pc: at every clip, cable end and strain-relief anchor |
| Wiring | PG7 cable gland _(price estimated)_ | 1 | 2.97 | 2.97 | 1 pc: cable exit with strain relief |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 0.5 | 0.4 | 0.2 | 0.5 m: over every cable where it crosses a joint |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| shoulder_pitch | 1.329 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 3.69x |
| elbow_pitch | 0.542 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 5.43x |

## Notes
- 2-DOF arm, 350 mm reach, 0.1 kg payload, Feetech STS serial-bus servos (12 V)
- Sized for a 0.1 kg payload.
- Arm clamps or bolts to the bench through the four M5 holes in the base; it is not free-standing at full reach.
- Every pitch joint is a clevis: one cheek bolts to the servo horn, the other turns on a 625ZZ bearing on an M5 bolt screwed into a heat-set insert in a boss on the back of the servo's cradle, so the servo's own bearing carries no bending moment. An M5 washer sits between the boss and the bearing's inner race.
- Print the links in PETG or PLA+ with 4 perimeters and 30 % gyroid infill, cradle opening up; press the 625ZZ bearings into their seats (16.15 mm) and set the M5 inserts with a soldering iron.
- Torques are exact static gravity loads of this geometry: the worst pose (stretched out with the payload) must be held within each actuator's rated continuous torque, peaks get +30 %, and each joint must still reach >= 1 rad/s loaded on its torque-speed line.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
