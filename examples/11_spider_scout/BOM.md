# Bill of Materials — hexapod

**Estimated total: $1032.62**  ·  tier: hobby  ·  budget: $1500 ✅ within budget

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(IMU (body attitude, at the centre) · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V regulator (sensors) · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Actuator | Feetech STS3215 C047 12 V 30 kg.cm (1:345) _(joint lf_coxa; joint lf_tibia; joint lm_coxa; joint lm_tibia; … · https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html)_ | 12 | 22 | 264 | 0.9807 N·m rated / 2.942 N·m peak, 12 V |
| Actuator | Feetech STS3250 C002 12 V 50 kg.cm (1:345) _(joint lf_femur; joint lm_femur; joint lr_femur; joint rr_femur; … · https://openelab.io/products/feetech-sts3250-c002-servo-12v)_ | 6 | 40 | 240 | 1.5691 N·m rated / 4.9033 N·m peak, 12 V |
| Compute | NVIDIA Jetson Orin Nano Super Developer Kit _(main computer · https://developer.nvidia.com/buy-jetson?product=jetson_orin_nano)_ | 1 | 249 | 249 | 19 V |
| Power | LiPo 3S 5000 mAh 60C, XT60 (Gens Ace G-Tech) _(main battery (strapped under the body plate) · https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug)_ | 1 | 59.99 | 59.99 | 11.1 V, 55.5 Wh |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(forward camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Sensor | Slamtec RPLIDAR C1 (DTOF 360 deg, 12 m) _(360 deg LiDAR turret · https://www.waveshare.com/rplidar-c1.htm)_ | 1 | 79.99 | 79.99 | 5 V |
| Electronics | Waveshare Bus Servo Adapter (A) _(USB to servo bus · https://www.waveshare.com/bus-servo-adapter-a.htm)_ | 1 | 10.6 | 10.6 | 12 V |
| Printed structure | PETG filament for 20 printed parts _(base_link, top_deck, lf_coxa_link, lf_femur_link, lf_tibia_link, lm_coxa_link, lm_femur_link, lm_tibia_link, lr_coxa_link, lr_femur_link, lr_tibia_link, rr_coxa_link, rr_femur_link, rr_tibia_link, rm_coxa_link, rm_femur_link, rm_tibia_link, rf_coxa_link, rf_femur_link, rf_tibia_link)_ | 1 | 16.95 | 16.95 | 670 g of parts (+15 % supports/waste), about 61.1 h of printing |
| Fasteners | Screws, nuts and inserts | 147 | 0.12 | 17.64 | 3x M3 x 12 deck pillar screws; 72x M2 x 6 case screws; 72x horn screws |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| lf_coxa | 0.346 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 8.51x |
| lf_femur | 2.178 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.25x |
| lf_tibia | 1.496 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.97x |
| lm_coxa | 0.346 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 8.5x |
| lm_femur | 2.18 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.25x |
| lm_tibia | 1.501 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.96x |
| lr_coxa | 0.329 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 8.94x |
| lr_femur | 2.178 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.25x |
| lr_tibia | 1.496 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.97x |
| rr_coxa | 0.346 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 8.51x |
| rr_femur | 2.178 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.25x |
| rr_tibia | 1.496 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.97x |
| rm_coxa | 0.346 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 8.5x |
| rm_femur | 2.18 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.25x |
| rm_tibia | 1.501 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.96x |
| rf_coxa | 0.329 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 8.94x |
| rf_femur | 2.178 | N·m | Feetech STS3250 C002 12 V 50 kg.cm (1:345) | 2.25x |
| rf_tibia | 1.496 | N·m | Feetech STS3215 C047 12 V 30 kg.cm (1:345) | 1.97x |

## Notes
- Hexapod, 18 x Feetech STS3250 C002 12 V 50 kg.cm (1:345), 2.47 kg, 207 mm body, camera + lidar + imu, 40 min, $998 of parts
- Sized for a 0.2 kg payload.
- Joint limits trimmed to the collision-free range found by exact solid sweeps: lf_tibia [-1.20, 1.20] -> [-0.86, 1.20]; lm_tibia [-1.20, 1.20] -> [-0.90, 1.20]; lr_tibia [-1.20, 1.20] -> [-0.90, 1.20]; rr_tibia [-1.20, 1.20] -> [-0.86, 1.20]; rm_tibia [-1.20, 1.20] -> [-0.90, 1.20]; rf_tibia [-1.20, 1.20] -> [-0.90, 1.20].
- Zero joint angles are the standing pose (femurs raised 20 deg, tibias near vertical); the base origin is on the coxa horn plane.
- Servo loads are J^T F at the stance feet of a tripod gait (three feet carry robot + payload), ±15 % traction, over a gait envelope, x 1.3 dynamic factor; continuous duty checked at 71 % of the worst stance load (RMS over a gait cycle with half of it in stance).
- Tripod gait keeps three feet down at all times: statically stable walking with open-loop position control.
- Feet are moulded / TPU-printed rubber spheres pushed over the tibia tips.
- The battery rides in a strapped cradle under the body plate (a 3S 5000 mAh pack is longer than the space between the coxa servos).
- The body plate and the top deck each print in one piece on a 250 x 210 mm bed; the deck stands on three printed pillars screwed into the plate.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
