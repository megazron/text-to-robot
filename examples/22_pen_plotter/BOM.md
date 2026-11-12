# Bill of materials: cartesian_gantry

**Estimated total: $235.74**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Mechanical | Ball bearing 608-2Z 8x22x7 mm _(lead screw end bearing · https://www.vxb.com/search?q=608-2Z)_ | 3 | 0.6 | 1.8 | https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-608-2Z |
| Power | Aluminium flexible beam coupler 5 mm to 8 mm (D19 L25) _(motor to lead screw · https://www.robotdigg.com/product/27/Flexible-Coupler)_ | 3 | 2.5 | 7.5 | 1.5 N·m rated |
| Sensor | Mechanical end stop, microswitch on a small board, 3-pin _(y home switch; x home switch; z home switch · https://www.aliexpress.com/w/wholesale-mechanical-endstop-3d-printer.html)_ | 3 | 1 | 3 | 5 V |
| Compute | Espressif ESP32-S3-DevKitC-1 (N8R8) _(ESP32-S3 motion controller (runs the generated firmware) · https://www.adafruit.com/product/5364)_ | 1 | 15 | 15 | 5 V |
| Power | IEC C14 panel inlet with fuse drawer and rocker switch, 10 A _(fused, switched mains inlet · https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html)_ | 1 | 3 | 3 | https://www.aliexpress.com/w/wholesale-iec-c14-inlet-fuse-switch.html |
| Power | Tr8x8 brass flange nut (22 mm flange, 4x M3 on PCD 16) _(y lead nut; x lead nut; z lead nut · https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut)_ | 3 | 2.5 | 7.5 | https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut |
| Power | Lead screw Tr8x8 (P2, 4 starts) 150 mm, stainless steel _(z lead screw · https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut)_ | 1 | 7 | 7 | https://www.iso.org/standard/12719.html |
| Power | Lead screw Tr8x8 (P2, 4 starts) 300 mm, stainless steel _(y lead screw; x lead screw · https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut)_ | 2 | 9 | 18 | https://www.iso.org/standard/12719.html |
| Mechanical | Linear ball bushing LM8UU (8 x 15 x 24 mm) _(y carriage bushings; x carriage bushings; z carriage bushings · https://www.aliexpress.com/w/wholesale-lm8uu.html)_ | 10 | 1.2 | 12 | https://www.samickthk.co.kr/en/ |
| Actuator | NEMA17 stepper 42x42x40 mm, 0.45 N.m (StepperOnline 17HS16-2004S1) _(y axis motor; x axis motor; z axis motor · https://www.stepperonline.co.uk/nema-17-bipolar-45ncm-64oz-in-2a-42x42x40mm-4-wires-w-1m-cable-connector-17hs16-2004s1.html)_ | 3 | 9.5 | 28.5 | 0.3 N·m rated / 0.45 N·m peak, 24 V |
| Power | Mean Well LRS-150-24 enclosed PSU, 24 V 6.5 A (156 W) _(24 V stepper supply · https://www.digikey.com/en/products/result?keywords=LRS-150-24)_ | 1 | 29 | 29 | 24 V |
| Power | Hardened chromed linear rod 8 mm h6, 130 mm _(z guide rods · https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/)_ | 2 | 4.56 | 9.12 | https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/ |
| Power | Hardened chromed linear rod 8 mm h6, 300 mm _(y guide rods; x guide rods · https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/)_ | 4 | 6.6 | 26.4 | https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/ |
| Electronics | BigTreeTech TMC2209 V1.3 StepStick stepper driver (UART) _(X stepper driver; Y stepper driver; Z stepper driver · https://biqu.equipment/products/bigtreetech-tmc2209-stepper-motor-driver-for-3d-printer-board-vs-tmc2208)_ | 3 | 7 | 21 | 24 V |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 4 | 0.8 | 3.2 | 450 V |
| Printed structure | PETG filament for 14 printed parts _(y_module_end_a, y_module_end_b, y_module_carriage, x_adapter, x_module_end_a, x_module_end_b, x_module_carriage, z_bracket, z_module_end_a, z_module_end_b, z_module_carriage, pen_holder, control_case, control_case_lid)_ | 1 | 25.94 | 25.94 | 1025 g of parts (+15 % supports/waste), about 93.4 h of printing |
| Fasteners | Screws, nuts and inserts | 27 | 0.12 | 3.24 | 12x M3 x 12 self-tapping (lead nut); 4x M4 x 12 socket head (adapter to Y carriage); 4x M4 x 12 socket head (Z bracket to X carriage); 1x M3 x 10 thumb screw (pen clamp); 4x M3 x 10 self-tapping (lid to compartment); 2x M3 x 6 self-tapping (Mean Well LRS-150-24 enclosed PSU, 24 V 6.5 A to standoffs) |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 0.7 | 0.5 | 0.35 | 0.7 m: 0.519 mm2, rated 5.5 A in a bundle; 0.61 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 6.6 | 0.4 | 2.64 | 6.6 m: 0.327 mm2, rated 3.5 A in a bundle; 5.96 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 9.9 | 0.35 | 3.46 | 9.9 m: 0.205 mm2, rated 1.75 A in a bundle; 8.98 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 4.6 | 0.3 | 1.38 | 4.6 m: 0.128 mm2, rated 1.1 A in a bundle; 4.10 m cut + 10 % waste |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 3 | 0.08 | 0.24 | 3 pc: rated 15 A per contact |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 5 | 0.03 | 0.15 | 5 pc: rated 17.5 A per contact |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 61 | 0.02 | 1.22 | 61 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 19 | 0.02 | 0.38 | 19 pc: one per cable end |
| Wiring | JST XH 2.5 mm contacts _(price estimated)_ | 9 | 0.03 | 0.27 | 9 pc: rated 3 A per contact |
| Wiring | JST XH 2.5 mm housings _(price estimated)_ | 6 | 0.05 | 0.3 | 6 pc: one per cable end |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 1.2 | 0.2 | 0.24 | 1.2 m: 0 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 23 | 0.02 | 0.46 | 23 pc: at every clip, cable end and strain-relief anchor |
| Wiring | PG7 cable gland _(price estimated)_ | 1 | 2.97 | 2.97 | 1 pc: cable exit with strain relief |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 1.2 | 0.4 | 0.48 | 1.2 m: over every cable where it crosses a joint |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| x_axis | 4.2 | N | NEMA17 stepper 42x42x40 mm, 0.45 N.m (StepperOnline 17HS16-2004S1) | 37.19x |
| y_axis | 5.2 | N | NEMA17 stepper 42x42x40 mm, 0.45 N.m (StepperOnline 17HS16-2004S1) | 30.12x |
| z_axis | 6.5 | N | NEMA17 stepper 42x42x40 mm, 0.45 N.m (StepperOnline 17HS16-2004S1) | 24.19x |

## Notes
- Cartesian XYZ robot on three lead-screw modules: 183 x 183 x 23 mm, 158 N per axis, 80 mm/s, pen holder
- Sized for a 0.2 kg payload.
- The three modules are the same design at two lengths; the frame is screwed to a flat board (12 mm plywood or MDF, about 450 x 350 mm, not in the parts list).
- Lead screws are plain Tr8x8 with brass nuts: cheap and quiet, with some backlash; anti-backlash nuts are a drop-in upgrade.
- Clearance is checked with every rod, lead screw, bearing, bushing, coupler and lead nut as its round body with its bore, so each rod through its bushings and each screw through its nut is checked as built; no pair is left out.
- Speeds and thrust use the NEMA17's rated torque; at high step rates a stepper's torque falls, so the firmware limits speed to the checked value.
- The pen clamp takes pens and markers up to 12 mm; Z lifts the pen between strokes.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
