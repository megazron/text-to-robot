# Bill of Materials — parallel_gripper

**Estimated total: $93.49**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(gripper pinion drive · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 1 | 22 | 22 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Power | IEC C14 panel inlet with fuse drawer and rocker switch, 10 A _(fused, switched mains inlet · https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html)_ | 1 | 3 | 3 | https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html |
| Mechanical | Linear ball bushing LM8UU (8 x 15 x 24 mm) _(finger carriage bushings · https://www.samick.co.kr/en/product/linear-bushing)_ | 4 | 1.2 | 4.8 | https://www.samickthk.co.kr/sub/product/linear-bushing/LM.php |
| Power | Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) _(12 V servo supply · https://www.digikey.com/en/products/result?keywords=LRS-75-12)_ | 1 | 22 | 22 | 12 V |
| Power | Hardened chromed linear rod 8 mm h6, 130 mm _(finger guide rods · https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/)_ | 2 | 4.56 | 9.12 | https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/ |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to servo bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 7 printed parts _(base_link, gripper_body, pinion, finger_a, finger_b, control_case, control_case_lid)_ | 1 | 13.42 | 13.42 | 530 g of parts (+15 % supports/waste), about 48.3 h of printing |
| Fasteners | Screws, nuts and inserts | 30 | 0.12 | 3.6 | 4x M6 x 16 socket head (adapter to robot flange); 4x M4 x 10 socket head + M4 heat-set insert (housing to adapter, radial); 4x M3 x 6 set screw (rod retention); 4x servo case screws (M2 x 6); 4x horn screws; 4x M3 x 10 self-tapping (lid to compartment); 2x M3 x 6 self-tapping (Mean Well LRS-75-12 enclosed PSU, 12 V 6 A to standoffs); 4x M2 x 6 self-tapping (Waveshare Bus Servo Adapter to standoffs) |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 2.1 | 0.35 | 0.73 | 2.1 m: 0.205 mm2, rated 1.75 A in a bundle; 1.89 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 0.6 | 0.3 | 0.18 | 0.6 m: 0.128 mm2, rated 1.1 A in a bundle; 0.47 m cut + 10 % waste |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 3 | 0.08 | 0.24 | 3 pc: rated 15 A per contact |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 7 | 0.03 | 0.21 | 7 pc: rated 17.5 A per contact |
| Wiring | Molex 5264 contacts _(price estimated)_ | 6 | 0.05 | 0.3 | 6 pc: rated 3 A per contact |
| Wiring | Molex 5264 housings _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: one per cable end |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 0.2 | 0.2 | 0.04 | 0.2 m: 0 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 6 | 0.02 | 0.12 | 6 pc: at every clip, cable end and strain-relief anchor |
| Wiring | PG7 cable gland _(price estimated)_ | 1 | 2.97 | 2.97 | 1 pc: cable exit with strain relief |

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
- Servo bus adapter and 12 V supply sit in a bench control case off the gripper (cable through the window under the servo).
- The adapter plate bolts to the robot first (heads sunk in the plate), then the housing slides over it and is fixed by four radial M4 screws.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
