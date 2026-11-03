# Bill of Materials — four_wheel_robot

**Estimated total: $663.39**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(9-DoF IMU · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V rail for the computer / USB · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Electronics | Cytron MDD10A dual-channel 10 A DC motor driver (5-30 V) _(dual DC motor driver · https://www.cytron.io/p-10amp-5v-30v-dc-motor-driver-2-channels)_ | 2 | 21 | 42 | 12 V |
| Power | LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech) _(main battery · https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug)_ | 1 | 27 | 27 | 11.1 V, 24.4 Wh |
| Actuator | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) _(drive motor · https://www.pololu.com/product/4752)_ | 4 | 60.95 | 243.8 | 0.686 N·m rated / 1.373 N·m peak, 12 V |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(camera · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(on-board computer · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Sensor | Slamtec RPLIDAR C1 (DTOF 360 deg, 12 m) _(2D lidar · https://www.waveshare.com/rplidar-c1.htm)_ | 1 | 79.99 | 79.99 | 5 V |
| Drive | Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors) _(driven wheel · https://www.pololu.com/product/1435)_ | 4 | 11.22 | 44.88 | https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf |
| Printed structure | PETG filament for 19 printed parts _(front_left_bracket, front_right_bracket, rear_left_bracket, rear_right_bracket, battery_tray, motor_driver_1_tray, motor_driver_2_tray, upper_deck, pillar_1, pillar_2, pillar_3, pillar_4, computer_tray, imu_tray, regulator_5v_tray, electronics_enclosure, electronics_lid, lidar_mast, front_camera_bracket)_ | 1 | 11.19 | 11.19 | 442 g of parts (+15 % supports/waste), about 40.3 h of printing |
| Fasteners | Screws, nuts and inserts | 84 | 0.12 | 10.08 | 24x M3 x 8 socket head (motor face); 8x M3 x 10 socket head + nut (bracket to deck); 1x 20 mm hook-and-loop battery strap; 12x M3 x 8 socket head (tray to deck); 19x M2.5 x 6 screws (board to standoffs); 8x M3 x 10 (pillars); 4x M3 x 10 self-tapping (enclosure lid); 4x M3 x 8 + nut (enclosure tabs to deck; drill 3.4 mm through the deck at the tabs); 4x M2.5 x 6 (lidar) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|
| front_left_wheel_joint | 0.12 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.7x |
| front_right_wheel_joint | 0.12 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.7x |
| rear_left_wheel_joint | 0.12 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.7x |
| rear_right_wheel_joint | 0.12 | N·m | Pololu 30:1 Metal Gearmotor 37Dx68L 12 V with 64 CPR encoder (#4752) | 5.7x |

## Notes
- Four-wheel skid-steer base: pololu_37d_30to1_64cpr gearmotors, 2.292 kg, 1.24 m/s, 1.47 h on 1 x lipo_3s_2200, rpi5
- Drive sized for the robot plus 2 kg cargo on a 10 deg slope accelerating at 0.5 m/s^2, rolling resistance 0.03; motors compared at their continuous (not stall) rating.
- All motors and servos are 12 V parts run straight from a 3S LiPo (9.9-12.6 V); a power switch, 15 A blade fuse and XT60 wiring are budgeted as a lump sum.
- Printed parts: PETG; brackets bolt to the deck with M3 screws and nuts; the motor face screws are the gearmotor's own six M3 holes.
- Skid steering: both wheels on a side get the same command; turning on the spot scrubs the tyres sideways (checked as a short-transient torque).
- The deck is larger than a 250 x 210 mm bed, so it is a laser-cut 3 mm aluminium plate (send-cut-send style service) rather than a print.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
