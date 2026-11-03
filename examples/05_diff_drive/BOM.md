# Bill of Materials — diff_drive_robot

**Estimated total: $488.38**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Drive | Pololu ball caster, 1" POM ball on ball bearings (#2692) _(ball caster · https://www.pololu.com/product/2692)_ | 2 | 9.95 | 19.9 | https://www.pololu.com/product/2692 |
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(9-DoF IMU · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer / USB · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 1 | 21 | 21 | 12 V |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Actuator | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) _(drive motor · https://www.pololu.com/product/4752)_ | 2 | 60.95 | 121.9 | 0.686 N·m rated / 1.373 N·m peak, 12 V |
| Compute | Raspberry Pi 5 (4 GB) _(on-board computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Sensor | Slamtec RPLIDAR C1 (DTOF 360 deg, 12 m) _(2D lidar · https://www.waveshare.com/rplidar-c1.htm)_ | 1 | 79.99 | 79.99 | 5 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(driven wheel · https://www.pololu.com/product/1435)_ | 2 | 11.22 | 22.44 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 11 printed parts _(base_link, left_bracket, right_bracket, front_caster_post, rear_caster_post, battery_tray, computer_tray, motor_driver_1_tray, imu_tray, regulator_5v_tray, lidar_mast)_ | 1 | 10.46 | 10.46 | 413 g of parts (+15 % supports/waste), about 37.7 h of printing |
| Fasteners | Screws, nuts and inserts | 52 | 0.12 | 6.24 | 12x M3 x 8 socket head (motor face); 4x M3 x 10 socket head + nut (bracket to deck); 6x M3 x 6 socket head (caster); 1x 20 mm hook-and-loop battery strap; 10x M3 x 8 socket head (tray to deck); 15x M2.5 x 6 screws (board to standoffs); 4x M2.5 x 6 (lidar) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| left_wheel_joint | 0.131 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.25x |
| right_wheel_joint | 0.131 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.25x |

## Notes
- Differential-drive base: pololu_37d_30to1_64cpr gearmotors, 1.329 kg, 1.24 m/s, 1.8 h on 1 x lipo_3s_2200, rpi5
- Drive sized for the robot plus 1 kg cargo on a 10 deg slope accelerating at 0.5 m/s^2, rolling resistance 0.03; motors compared at their continuous (not stall) rating.
- All motors and servos are 12 V parts run straight from a 3S LiPo (9.9-12.6 V); a power switch, 15 A blade fuse and XT60 wiring are budgeted as a lump sum.
- Printed parts: PETG; brackets bolt to the deck with M3 screws and nuts; the motor face screws are the gearmotor's own six M3 holes.
- Two ball casters (front and rear) keep the deck level; on rough floors fit only one or add the Pololu spacer set so the drive wheels never lift.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
