# Bill of Materials — hexapod

**Estimated total: $1100.45**  ·  tier: hobby  ·  budget: $1500 ✅ within budget

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(IMU (body attitude, at the centre) · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V regulator (sensors) · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(joint lf_coxa; joint lf_tibia; joint lm_coxa; joint lm_tibia; … · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 12 | 22 | 264 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Actuator | Feetech STS3250 C002 12 V 50 kg.cm (1:345) _(joint lf_femur; joint lm_femur; joint lr_femur; joint rr_femur; … · https://openelab.io/products/feetech-sts3250-c002-servo-12v)_ | 6 | 40 | 240 | 1.5691 N·m rated / 4.9033 N·m peak, 12 V |
| Power | Inline ATM mini blade fuse holder, 30 A class (Littelfuse FHM) _(fuse holders · https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders)_ | 10 | 2.5 | 25 | 32 V |
| Compute | NVIDIA Jetson Orin Nano Super Developer Kit _(main computer · https://developer.nvidia.com/buy-jetson?product=jetson_orin_nano)_ | 1 | 249 | 249 | 19 V |
| Power | LiPo 3S 5000 mAh 60C, XT60 (Gens Ace G-Tech) _(main battery (strapped under the body plate) · https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug)_ | 1 | 59.99 | 59.99 | 11.1 V, 55.5 Wh |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(forward camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Sensor | Slamtec RPLIDAR C1 (DTOF 360 deg, 12 m) _(360 deg LiDAR turret · https://www.waveshare.com/rplidar-c1.htm)_ | 1 | 79.99 | 79.99 | 5 V |
| Power | KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC _(main power switch · https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html)_ | 1 | 1 | 1 | https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 8 | 0.8 | 6.4 | 450 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to servo bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 26 printed parts _(base_link, deck_pillar_1, deck_pillar_2, deck_pillar_3, top_deck, lf_coxa_link, lf_femur_link, lf_tibia_link, lm_coxa_link, lm_femur_link, lm_tibia_link, lr_coxa_link, lr_femur_link, lr_tibia_link, rr_coxa_link, rr_femur_link, rr_tibia_link, rm_coxa_link, rm_femur_link, rm_tibia_link, rf_coxa_link, rf_femur_link, rf_tibia_link, computer_hood, board_hood, battery_tray)_ | 1 | 19.74 | 19.74 | 780 g of parts (+15 % supports/waste), about 71.1 h of printing |
| Fasteners | Screws, nuts and inserts | 159 | 0.12 | 19.08 | 3x M3 x 12 deck pillar screws; 72x M2 x 6 case screws; 72x horn screws; 12x M3 x 12 self-tapping (hood to deck) |
| Wiring | 12 AWG silicone wire _(price estimated)_ | 0.6 | 2.2 | 1.32 | 0.6 m: 3.308 mm2, rated 20.5 A in a bundle; 0.54 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 6.6 | 0.4 | 2.64 | 6.6 m: 0.327 mm2, rated 3.5 A in a bundle; 5.92 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 5 | 0.35 | 1.75 | 5 m: 0.205 mm2, rated 1.75 A in a bundle; 4.55 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 5.6 | 0.3 | 1.68 | 5.6 m: 0.128 mm2, rated 1.1 A in a bundle; 5.03 m cut + 10 % waste |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 8 | 0.02 | 0.16 | 8 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 2 | 0.02 | 0.04 | 2 pc: one per cable end |
| Wiring | Molex 5264 contacts _(price estimated)_ | 91 | 0.05 | 4.55 | 91 pc: rated 3 A per contact |
| Wiring | Molex 5264 housings _(price estimated)_ | 37 | 0.08 | 2.96 | 37 pc: one per cable end |
| Wiring | XT60 contacts _(price estimated)_ | 2 | 0.9 | 1.8 | 2 pc: rated 35 A per contact |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: rated 15 A per contact |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 2 | 0.03 | 0.06 | 2 pc: rated 17.5 A per contact |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 2.5 | 0.2 | 0.5 | 2.5 m: 7 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 56 | 0.02 | 1.12 | 56 pc: at every clip, cable end and strain-relief anchor |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 3 | 0.08 | 0.24 | 3 pc: 9.5 mm panel hole |
| Wiring | Nylon braided sleeving 6 mm _(price estimated)_ | 1.8 | 0.4 | 0.72 | 1.8 m: over every cable where it crosses a joint |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: lidar to computer |
| Wiring | FFC _(price estimated)_ | 1 | 3 | 3 | 1 pc: camera to computer |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: actuator_bus to computer |
| Wiring | 20 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |
| Wiring | 2 A ATM blade fuse _(price estimated)_ | 3 | 0.25 | 0.75 | 3 pc: plus spares |
| Wiring | 3 A ATM blade fuse _(price estimated)_ | 6 | 0.25 | 1.5 | 6 pc: plus spares |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| lf_coxa | 0.341 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 8.63x |
| lf_femur | 2.149 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.28x |
| lf_tibia | 1.476 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.99x |
| lm_coxa | 0.341 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 8.62x |
| lm_femur | 2.151 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.28x |
| lm_tibia | 1.481 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.99x |
| lr_coxa | 0.325 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 9.06x |
| lr_femur | 2.149 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.28x |
| lr_tibia | 1.476 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.99x |
| rr_coxa | 0.341 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 8.63x |
| rr_femur | 2.149 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.28x |
| rr_tibia | 1.476 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.99x |
| rm_coxa | 0.341 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 8.62x |
| rm_femur | 2.151 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.28x |
| rm_tibia | 1.481 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.99x |
| rf_coxa | 0.325 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 9.06x |
| rf_femur | 2.149 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.28x |
| rf_tibia | 1.476 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.99x |

## Notes
- Hexapod, 18 x Feetech STS3250 C002 12 V 50 kg.cm (1:345), 2.43 kg, 207 mm body, camera + lidar + imu, 41 min, $1030 of parts
- Sized for a 0.2 kg payload.
- Joint limits trimmed to the collision-free range found by exact solid sweeps: lf_tibia [-1.20, 1.20] -> [-0.80, 1.20]; lm_tibia [-1.20, 1.20] -> [-0.90, 1.20]; lr_tibia [-1.20, 1.20] -> [-0.90, 1.20]; rr_tibia [-1.20, 1.20] -> [-0.80, 1.20]; rm_tibia [-1.20, 1.20] -> [-0.90, 1.20]; rf_tibia [-1.20, 1.20] -> [-0.90, 1.20].
- Zero joint angles are the standing pose (femurs raised 20 deg, tibias near vertical); the base origin is on the coxa horn plane.
- Servo loads are J^T F at the stance feet of a tripod gait (three feet carry robot + payload), ±15 % traction, over a gait envelope, x 1.3 dynamic factor; continuous duty checked at 71 % of the worst stance load (RMS over a gait cycle with half of it in stance).
- Tripod gait keeps three feet down at all times: statically stable walking with open-loop position control.
- Feet are moulded / TPU-printed rubber spheres pushed over the tibia tips.
- The battery rides in a strapped cradle under the body plate (a 3S 5000 mAh pack is longer than the space between the coxa servos).
- The body plate and the top deck each print in one piece on a 250 x 210 mm bed; the deck stands on three printed pillars screwed into the plate.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
