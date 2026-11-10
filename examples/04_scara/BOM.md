# Bill of materials: scara

**Estimated total: $359**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Mechanical | Ball bearing 608-2Z 8x22x7 mm _(lead screw bottom bearing · https://www.vxb.com/search?q=608-2Z)_ | 1 | 0.6 | 0.6 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-608-2Z |
| Mechanical | Ball bearing 61806-2Z (6806ZZ) 30x42x7 mm _(J2 output bearings · https://www.vxb.com/search?q=61806-2Z)_ | 2 | 2.5 | 5 | https://www.qualitybearingsonline.ca/61806-timken-thin-section-30x42x7mm/ |
| Mechanical | Ball bearing 61808-2RZ (6808 thin section) 40x52x7 mm _(J1 output bearings · https://www.vxb.com/search?q=61808-2RZ)_ | 2 | 3.5 | 7 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-61808-2RZ |
| Power | Aluminium flexible beam coupler 5 mm to 8 mm (D19 L25) _(motor to lead screw · https://www.robotdigg.com/product/27/Flexible-Coupler)_ | 1 | 2.5 | 2.5 | 1.5 N·m rated |
| Compute | Espressif ESP32-S3-DevKitC-1 (N8R8) _(ESP32-S3 motion controller · https://www.adafruit.com/product/5364)_ | 1 | 15 | 15 | 5 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(wrist roll; gripper pinion drive · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 2 | 22 | 44 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Power | IEC C14 panel inlet with fuse drawer and rocker switch, 10 A _(fused, switched mains inlet · https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html)_ | 1 | 3 | 3 | https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html |
| Power | Tr8x8 brass flange nut (22 mm flange, 4x M3 on PCD 16) _(Z lead nut · https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut)_ | 1 | 2.5 | 2.5 | https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut |
| Power | Lead screw Tr8x8 (P2, 4 starts) 300 mm, stainless steel _(Z lead screw · https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut)_ | 1 | 9 | 9 | https://www.iso.org/standard/12719.html |
| Mechanical | Linear ball bushing LM8UU (8 x 15 x 24 mm) _(Z carriage bushings; finger carriage bushings · https://www.aliexpress.com/w/wholesale-lm8uu.html)_ | 8 | 1.2 | 9.6 | https://www.samickthk.co.kr/en/ |
| Actuator | NEMA17 stepper 42x42x40 mm, 0.45 N.m (StepperOnline 17HS16-2004S1) _(Z drive · https://www.stepperonline.co.uk/nema-17-bipolar-45ncm-64oz-in-2a-42x42x40mm-4-wires-w-1m-cable-connector-17hs16-2004s1.html)_ | 1 | 9.5 | 9.5 | 0.3 N·m rated / 0.45 N·m peak, 24 V |
| Actuator | NEMA17 stepper + 5.18:1 planetary gearbox (StepperOnline 17HS19-1684S-PG5) _(J1 drive; J2 drive · https://www.stepperonline.co.uk/nema-17-stepper-motor-bipolar-l-48mm-w-gear-ratio-5-1-planetary-gearbox-17hs19-1684s-pg5.html)_ | 2 | 34.77 | 69.54 | 2 N·m rated / 4 N·m peak, 24 V |
| Power | Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W) _(12 V servo supply · https://www.digikey.com/en/products/result?keywords=LRS-75-12)_ | 1 | 22 | 22 | 12 V |
| Power | Mean Well LRS-150-24 enclosed PSU, 24 V 6.5 A (156 W) _(24 V stepper supply · https://www.digikey.com/en/products/result?keywords=LRS-150-24)_ | 1 | 29 | 29 | 24 V |
| Power | Hardened chromed linear rod 8 mm h6, 110 mm _(finger guide rods · https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/)_ | 2 | 4.32 | 8.64 | https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/ |
| Power | Hardened chromed linear rod 8 mm h6, 300 mm _(Z guide rods · https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/)_ | 2 | 6.6 | 13.2 | https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/ |
| Electronics | BigTreeTech TMC2209 V1.3 StepStick stepper driver (UART) _(stepper drivers (J1, J2, Z) · https://biqu.equipment/products/bigtreetech-tmc2209-stepper-motor-driver-for-3d-printer-board-vs-tmc2208)_ | 3 | 7 | 21 | 24 V |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 3 | 0.8 | 2.4 | 450 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(wrist + gripper servo bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 13 printed parts _(base_link, column, column_top, inner_arm, outer_arm, wrist_flange, gripper_body, pinion, finger_a, finger_b, controller_box, controller_deck, controller_lid)_ | 1 | 49.69 | 49.69 | 1964 g of parts (+15 % supports/waste), about 179.0 h of printing |
| Fasteners | Screws, nuts and inserts | 56 | 0.12 | 6.72 | 4x M5 x 16 socket head (base to bench); 16x M3 x 8 socket head (motor face); 4x M3 x 6 set screw (rod clamps); 4x M3 x 8 socket head + heat-set insert (lead nut); 0x M6 x 16 socket head (adapter to robot flange); 4x M4 x 10 socket head + M4 heat-set insert (housing to adapter, radial); 4x M3 x 6 set screw (rod retention); 4x servo case screws (M2 x 6); 4x horn screws; 4x M3 x 6 socket head (PSU bottom); 4x M3 x 10 self-tapping (controller lid); 4x M2 x 6 screw (bus adapter) |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 10.9 | 0.5 | 5.45 | 10.9 m: 0.519 mm2, rated 5.5 A in a bundle; 9.88 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 5.5 | 0.4 | 2.2 | 5.5 m: 0.327 mm2, rated 3.5 A in a bundle; 4.96 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 6.8 | 0.35 | 2.38 | 6.8 m: 0.205 mm2, rated 1.75 A in a bundle; 6.15 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 3.6 | 0.3 | 1.08 | 3.6 m: 0.128 mm2, rated 1.1 A in a bundle; 3.25 m cut + 10 % waste |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 6 | 0.08 | 0.48 | 6 pc: rated 15 A per contact |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 13 | 0.03 | 0.39 | 13 pc: rated 17.5 A per contact |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 48 | 0.02 | 0.96 | 48 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 13 | 0.02 | 0.26 | 13 pc: one per cable end |
| Wiring | Molex 5264 contacts _(price estimated)_ | 12 | 0.05 | 0.6 | 12 pc: rated 3 A per contact |
| Wiring | Molex 5264 housings _(price estimated)_ | 4 | 0.08 | 0.32 | 4 pc: one per cable end |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 1.3 | 0.2 | 0.26 | 1.3 m: 8 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 32 | 0.02 | 0.64 | 32 pc: at every clip, cable end and strain-relief anchor |
| Wiring | PG7 cable gland _(price estimated)_ | 1 | 2.97 | 2.97 | 1 pc: cable exit with strain relief |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 1.3 | 0.4 | 0.52 | 1.3 m: over every cable where it crosses a joint |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| j1 | 1.224 | N·m | NEMA17 stepper + 5.18:1 planetary gearbox (StepperOnline 17HS19-1684S-PG5) | 1.63x |
| j2 | 0.369 | N·m | NEMA17 stepper + 5.18:1 planetary gearbox (StepperOnline 17HS19-1684S-PG5) | 5.42x |
| z | 36.6 | N | NEMA17 stepper 42x42x40 mm, 0.45 N.m (StepperOnline 17HS16-2004S1) | 4.3x |
| wrist_roll | 0.047 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 20.88x |
| finger_a | 0.155 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 6.35x |

## Notes
- SCARA arm: 0.30 m reach, 159 mm Z stroke, 0.5 kg payload; NEMA17 + 5.18:1 planetary on J1/J2, Tr8x8 lead-screw Z, Feetech STS3215 C047 12 V 30 kg.cm (1:345) wrist, parallel gripper
- Sized for a 0.5 kg payload.
- J1: a direct-drive NEMA17 (0.3 N·m pull-out) would give only 0.27x margin, so the 5.18:1 planetary is used.
- J2: a direct-drive NEMA17 (0.3 N·m pull-out) would give only 0.88x margin, so the 5.18:1 planetary is used.
- Unpowered, the Z carriage slowly back-drives the 8 mm-lead screw and settles on its lower stop; a 2 mm-lead screw would self-lock at a quarter of the speed.
- Sizing targets: J1 8 rad/s², J2 12 rad/s², wrist 30 rad/s², Z 2 m/s² with 0.5 kg at full reach; steppers keep >= 1.5x margin on their usable torque so they do not lose steps.
- J1 and J2 are vertical axes: gravity loads their bearings, not their motors. Each output hub runs in two thin-section bearings that carry the overhung moment; the gearbox shaft only transmits torque.
- Planetary backlash (1° per joint) limits repeatability to about ±3.8 mm at the TCP; a GT2 belt reduction (as in the HowToMechatronics build) or a low-backlash gearbox improves it.
- Joint speed limits are configured below the gearmotor's 12.147 rad/s no-load speed (J1 3 rad/s, J2 4 rad/s): stepper pull-out torque falls with speed, and these limits keep the sized acceleration available.
- Z travel starts where the fingertips are 13 mm above the table/base plate; the controller box stands outside the swept radius.
- J2 is limited to ±127° so the gripper never swings into the column or base.
- Steppers run open loop with sensorless homing (TMC2209 StallGuard) or end-stop switches (not modelled); the ESP32-S3 runs the kinematics and talks to the drivers over STEP/DIR + UART and to the servos over the bus adapter.
- Controller box: printed case with a screwed lid and an electronics deck; mains come in through a fused, switched IEC inlet, earth wired first.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
