# Bill of Materials — parallel_gripper

**Estimated total: $80.84**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(gripper pinion drive · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 1 | 22 | 22 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Mechanical | Linear ball bushing LM8UU (8 x 15 x 24 mm) _(finger carriage bushings · https://www.samick.co.kr/en/product/linear-bushing)_ | 4 | 1.2 | 4.8 | https://www.samickthk.co.kr/sub/product/linear-bushing/LM.php |
| Power | Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) _(12 V servo supply (off-board) · https://www.digikey.com/en/products/result?keywords=LRS-75-12)_ | 1 | 22 | 22 | 12 V |
| Power | Hardened chromed linear rod 8 mm h6, 130 mm _(finger guide rods · https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/)_ | 2 | 4.56 | 9.12 | https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/ |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to servo bus (off-board) · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 5 printed parts _(base_link, gripper_body, pinion, finger_a, finger_b)_ | 1 | 9.92 | 9.92 | 392 g of parts (+15 % supports/waste), about 35.7 h of printing |
| Fasteners | Screws, nuts and inserts | 20 | 0.12 | 2.4 | 4x M6 x 16 socket head (adapter to robot flange); 4x M4 x 10 socket head + M4 heat-set insert (housing to adapter, radial); 4x M3 x 6 set screw (rod retention); 4x servo case screws (M2 x 6); 4x horn screws |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| finger_a | 0.155 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 6.35x |

## Notes
- Parallel gripper: 60 mm stroke, 47 N rated squeeze per finger, Feetech STS3215 C047 12 V 30 kg.cm (1:345)
- Sized for a 0.5 kg payload.
- Grip force uses the servo's rated (continuous) torque 0.9807 N·m; stall torque 2.942 N·m gives 140 N per finger for short squeezes.
- Friction coefficient 0.5 between the printed pads (or TPU/rubber pads glued into the grooves) and the object; safety factor 1.5.
- The fingers are coupled by the rack-and-pinion: finger_a is the actuated prismatic joint (servo torque / pitch radius), finger_b and the pinion carry a URDF <mimic> of it (MuJoCo: joint equality constraints), so one actuator drives both fingers.
- Rack/pinion teeth are module 1.5 printed in PETG; grease them and expect backlash of a few tenths of a millimetre.
- Servo bus adapter and 12 V supply sit off the gripper (cable through the window under the servo).
- The adapter plate bolts to the robot first (heads sunk in the plate), then the housing slides over it and is fixed by four radial M4 screws.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
