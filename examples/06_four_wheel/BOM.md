# Bill of materials: four_wheel_robot

**Estimated total: $695.1**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(9-DoF IMU · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer, USB and sensors · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 2 | 21 | 42 | 12 V |
| Power | Inline ATM mini blade fuse holder, 30 A class (Littelfuse FHM) _(fuse holders · https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders)_ | 2 | 2.5 | 5 | 32 V |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Actuator | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) _(drive motor · https://www.pololu.com/product/4752)_ | 4 | 60.95 | 243.8 | 0.686 N·m rated / 1.373 N·m peak, 12 V |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(on-board computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Sensor | Slamtec RPLIDAR C1 (DTOF 360 deg, 12 m) _(2D lidar · https://www.waveshare.com/rplidar-c1.htm)_ | 1 | 79.99 | 79.99 | 5 V |
| Power | KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC _(main power switch · https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html)_ | 1 | 1 | 1 | https://www.aliexpress.com/w/wholesale-kcd4-rocker-switch.html |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 3 | 0.8 | 2.4 | 450 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(driven wheel · https://www.pololu.com/product/1435)_ | 4 | 11.22 | 44.88 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 21 printed parts _(front_left_bracket, front_right_bracket, rear_left_bracket, rear_right_bracket, battery_tray, motor_driver_1_tray, motor_driver_2_tray, power_bay, power_bay_lid, upper_deck, pillar_1, pillar_2, pillar_3, pillar_4, computer_tray, imu_tray, regulator_5v_tray, electronics_enclosure, electronics_lid, lidar_mast, front_camera_bracket)_ | 1 | 13.63 | 13.63 | 539 g of parts (+15 % supports/waste), about 49.1 h of printing |
| Fasteners | Screws, nuts and inserts | 92 | 0.12 | 11.04 | 24x M3 x 8 socket head (motor face); 8x M3 x 10 socket head + nut (bracket to deck); 1x 20 mm hook-and-loop battery strap; 12x M3 x 8 socket head (tray to deck); 19x M2.5 x 6 screws (board to standoffs); 8x M3 x 10 self-tapping (enclosure lid); 8x M3 x 8 + nut (enclosure tabs to deck; drill 3.4 mm through the deck at the tabs); 8x M3 x 10 (pillars); 4x M2.5 x 6 (lidar) |
| Wiring | 14 AWG silicone wire _(price estimated)_ | 0.9 | 1.5 | 1.35 | 0.9 m: 2.082 mm2, rated 16 A in a bundle; 0.73 m cut + 10 % waste |
| Wiring | 18 AWG silicone wire _(price estimated)_ | 1.8 | 0.7 | 1.26 | 1.8 m: 0.823 mm2, rated 8 A in a bundle; 1.63 m cut + 10 % waste |
| Wiring | 20 AWG silicone wire _(price estimated)_ | 2 | 0.5 | 1 | 2 m: 0.519 mm2, rated 5.5 A in a bundle; 1.77 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 2.6 | 0.4 | 1.04 | 2.6 m: 0.327 mm2, rated 3.5 A in a bundle; 2.35 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 4.5 | 0.35 | 1.57 | 4.5 m: 0.205 mm2, rated 1.75 A in a bundle; 4.06 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 7.3 | 0.3 | 2.19 | 7.3 m: 0.128 mm2, rated 1.1 A in a bundle; 6.58 m cut + 10 % waste |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 46 | 0.02 | 0.92 | 46 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 11 | 0.02 | 0.22 | 11 pc: one per cable end |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 12 | 0.03 | 0.36 | 12 pc: rated 17.5 A per contact |
| Wiring | XT60 contacts _(price estimated)_ | 2 | 0.9 | 1.8 | 2 pc: rated 35 A per contact |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: rated 15 A per contact |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 2.3 | 0.2 | 0.46 | 2.3 m: 31 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 42 | 0.02 | 0.84 | 42 pc: at every clip, cable end and strain-relief anchor |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 3 | 0.08 | 0.24 | 3 pc: 9.5 mm panel hole |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: lidar to computer |
| Wiring | FFC _(price estimated)_ | 1 | 3 | 3 | 1 pc: front_camera to computer |
| Wiring | 15 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |
| Wiring | 2 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| front_left_wheel_joint | 0.123 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.56x |
| front_right_wheel_joint | 0.123 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.56x |
| rear_left_wheel_joint | 0.123 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.56x |
| rear_right_wheel_joint | 0.123 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.56x |

## Notes
- Four-wheel skid-steer base: pololu_37d_30to1_64cpr gearmotors, 2.396 kg, 1.24 m/s, 1.47 h on 1 x lipo_3s_2200, rpi5
- Drive sized for the robot plus 2 kg cargo on a 10 deg slope accelerating at 0.5 m/s^2, rolling resistance 0.03; motors compared at their continuous (not stall) rating.
- All motors and servos are 12 V parts run straight from a 3S LiPo (9.9-12.6 V) through the main fuse and switch; see WIRING.md.
- Printed parts: PETG; brackets bolt to the deck with M3 screws and nuts; the motor face screws are the gearmotor's own six M3 holes.
- Skid steering: both wheels on a side get the same command; turning on the spot scrubs the tyres sideways (checked as a short-transient torque).
- The deck is larger than a 250 x 210 mm bed, so it is a laser-cut 3 mm aluminium plate (send-cut-send style service) rather than a print.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
