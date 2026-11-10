# Bill of materials: diff_drive_robot

**Estimated total: $512.23**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Drive | Pololu ball caster, 1" POM ball on ball bearings (#2692) _(ball caster · https://www.pololu.com/product/2692)_ | 2 | 9.95 | 19.9 | https://www.pololu.com/product/2692 |
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(9-DoF IMU · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer, USB and sensors · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 1 | 21 | 21 | 12 V |
| Power | Inline ATM mini blade fuse holder, 30 A class (Littelfuse FHM) _(fuse holders · https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders)_ | 2 | 2.5 | 5 | 32 V |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Actuator | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) _(drive motor · https://www.pololu.com/product/4752)_ | 2 | 60.95 | 121.9 | 0.686 N·m rated / 1.373 N·m peak, 12 V |
| Compute | Raspberry Pi 5 (4 GB) _(on-board computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Sensor | Slamtec RPLIDAR C1 (DTOF 360 deg, 12 m) _(2D lidar · https://www.waveshare.com/rplidar-c1.htm)_ | 1 | 79.99 | 79.99 | 5 V |
| Power | KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC _(main power switch · https://www.aliexpress.com/w/wholesale-kcd1-rocker-switch.html)_ | 1 | 0.3 | 0.3 | https://www.aliexpress.com/w/wholesale-kcd1-rocker-switch.html |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 2 | 0.8 | 1.6 | 450 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(driven wheel · https://www.pololu.com/product/1435)_ | 2 | 11.22 | 22.44 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 15 printed parts _(base_link, left_bracket, right_bracket, front_caster_post, rear_caster_post, computer_tray, motor_driver_1_tray, battery_tray, regulator_5v_tray, imu_tray, electronics_enclosure_front, electronics_enclosure_rear, electronics_lid_front, electronics_lid_rear, lidar_mast)_ | 1 | 14.3 | 14.3 | 565 g of parts (+15 % supports/waste), about 51.5 h of printing |
| Fasteners | Screws, nuts and inserts | 68 | 0.12 | 8.16 | 12x M3 x 8 socket head (motor face); 4x M3 x 10 socket head + nut (bracket to deck); 6x M3 x 6 socket head (caster); 15x M2.5 x 6 screws (board to standoffs); 10x M3 x 8 socket head (tray to deck); 1x 20 mm hook-and-loop battery strap; 8x M3 x 8 + nut (enclosure pieces lap joint); 4x M3 x 10 self-tapping (enclosure lid); 4x M3 x 8 + nut (enclosure tabs to deck; drill 3.4 mm through the deck at the tabs); 4x M2.5 x 6 (lidar) |
| Wiring | 16 AWG silicone wire _(price estimated)_ | 0.6 | 1 | 0.6 | 0.6 m: 1.308 mm2, rated 11 A in a bundle; 0.53 m cut + 10 % waste |
| Wiring | 18 AWG silicone wire _(price estimated)_ | 0.7 | 0.7 | 0.49 | 0.7 m: 0.823 mm2, rated 8 A in a bundle; 0.61 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 2.7 | 0.4 | 1.08 | 2.7 m: 0.327 mm2, rated 3.5 A in a bundle; 2.37 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 2.3 | 0.35 | 0.8 | 2.3 m: 0.205 mm2, rated 1.75 A in a bundle; 2.06 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 2.6 | 0.3 | 0.78 | 2.6 m: 0.128 mm2, rated 1.1 A in a bundle; 2.33 m cut + 10 % waste |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 28 | 0.02 | 0.56 | 28 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 7 | 0.02 | 0.14 | 7 pc: one per cable end |
| Wiring | Bootlace ferrule contacts _(price estimated)_ | 6 | 0.03 | 0.18 | 6 pc: rated 17.5 A per contact |
| Wiring | XT60 contacts _(price estimated)_ | 2 | 0.9 | 1.8 | 2 pc: rated 35 A per contact |
| Wiring | 6.3 mm spade contacts _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: rated 15 A per contact |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 1.5 | 0.2 | 0.3 | 1.5 m: 19 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 32 | 0.02 | 0.64 | 32 pc: at every clip, cable end and strain-relief anchor |
| Wiring | Rubber grommet, 6.4 mm panel hole, 3.2 mm bore _(price estimated)_ | 2 | 0.08 | 0.16 | 2 pc: 9.5 mm panel hole |
| Wiring | USB _(price estimated)_ | 1 | 3 | 3 | 1 pc: lidar to computer |
| Wiring | 7.5 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |
| Wiring | 2 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| left_wheel_joint | 0.14 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.92x |
| right_wheel_joint | 0.14 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 4.92x |

## Notes
- Differential-drive base: pololu_37d_30to1_64cpr gearmotors, 1.487 kg, 1.24 m/s, 1.8 h on 1 x lipo_3s_2200, rpi5
- Drive sized for the robot plus 1 kg cargo on a 10 deg slope accelerating at 0.5 m/s^2, rolling resistance 0.03; motors compared at their continuous (not stall) rating.
- All motors and servos are 12 V parts run straight from a 3S LiPo (9.9-12.6 V) through the main fuse and switch; see WIRING.md.
- Printed parts: PETG; brackets bolt to the deck with M3 screws and nuts; the motor face screws are the gearmotor's own six M3 holes.
- Two ball casters (front and rear) keep the deck level; on rough floors fit only one or add the Pololu spacer set so the drive wheels never lift.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
