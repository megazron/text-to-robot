# Bill of materials: underwater_rov

**Estimated total: $1820.43**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Power | 6061-T6 aluminium round tube 20 x 2 mm, 1 m _(frame tubes (1.62 m cut) · https://www.metalsupermarkets.com/metals/aluminum/)_ | 2 | 13 | 26 | https://asm.matweb.com/search/SpecificMaterial.asp?bassnum=ma6061t6 |
| Power | Stainless ballast weight 200 g (trim) _(trim ballast (bolted under the skid) · https://bluerobotics.com/store/rov/rov-accessories/ballast-weight/)_ | 5 | 8 | 40 | https://bluerobotics.com/store/rov/rov-accessories/ballast-weight/ |
| Electronics | Blue Robotics Basic ESC 30 A (7-26 V, PWM input) _(thruster ESC 1 (hangs under the tray); thruster ESC 2 (hangs under the tray); thruster ESC 3 (hangs under the tray); thruster ESC 4 (hangs under the tray) · https://bluerobotics.com/store/thrusters/speed-controllers/besc30-r3/)_ | 4 | 36 | 144 | 16 V |
| Sensor | Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754) _(IMU (attitude for stabilisation) · https://www.adafruit.com/product/4754)_ | 1 | 29.5 | 29.5 | 3.3 V |
| Power | Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091) _(5 V 5 A for the Pi · https://www.pololu.com/product/4091)_ | 1 | 39.95 | 39.95 | 5 V |
| Power | Subsea buoyancy foam block, R-3318 urethane, about 1 L (cut to shape) _(buoyancy foam (strapped to the top tubes) · https://bluerobotics.com/store/rov/rov-accessories/subsea-buoyancy-foam-r-3318-r1/)_ | 1 | 40 | 40 | https://bluerobotics.com/store/rov/rov-accessories/subsea-buoyancy-foam-r-3318-r1/ |
| Power | ANL fuse holder, 58 V class, 35-300 A _(fuse holders · https://www.bluesea.com/products/category/62/ANL_Fuses)_ | 1 | 9 | 9 | 58 V |
| Power | Inline ATM mini blade fuse holder, 30 A class (Littelfuse FHM) _(fuse holders · https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders)_ | 5 | 2.5 | 12.5 | 32 V |
| Power | LiPo 4S 5000 mAh 60C, XT90 (Gens Ace G-Tech) _(4S 5000 mAh pack (strapped to the tray) · https://www.unmannedtechshop.co.uk/de/products/gens-ace-g-tech-5000mah-14-8v-4s-60c-lipo-battery-pack-xt90)_ | 1 | 57 | 57 | 14.8 V, 74 Wh |
| Electronics | PCA9685 16-channel PWM servo driver board (generic, I2C) _(PCA9685: PWM to the four ESCs (hangs under the tray) · https://www.aliexpress.com/w/wholesale-pca9685-16-channel-servo-driver.html)_ | 1 | 2.5 | 2.5 | 5 V |
| Power | M10 cable penetrator for 6 mm cable, potted (Blue Robotics) _(four thruster cables, the tether and a vent plug through the rear end cap · https://bluerobotics.com/store/cables-connectors/penetrators/penetrator-vp/)_ | 6 | 4 | 24 | https://bluerobotics.com/store/cables-connectors/penetrators/penetrator-vp/ |
| Sensor | Raspberry Pi Camera Module 3 (standard lens) _(forward camera behind the clear end cap · https://www.raspberrypi.com/products/camera-module-3/)_ | 1 | 25 | 25 | 3.3 V |
| Compute | Raspberry Pi 5 (4 GB) _(Raspberry Pi 5 (vehicle computer, Ethernet to the surface) · https://www.raspberrypi.com/products/raspberry-pi-5/)_ | 1 | 110 | 110 | 5 V |
| Power | 50 mm hook-and-loop strap with D-ring buckle, 600 mm _(battery strap · https://www.aliexpress.com/w/wholesale-50mm-hook-and-loop-strap-d-ring.html)_ | 1 | 4.5 | 4.5 | https://www.velcro.com/business/products/ |
| Actuator | Blue Robotics T200 underwater thruster (7-20 V) _(thruster · https://bluerobotics.com/store/thrusters/t100-t200-thrusters/t200-thruster-r2-rp/)_ | 4 | 200 | 800 | 0.3 N·m rated / 0.6 N·m peak, 16 V |
| Power | Neutrally buoyant tether, 25 m, 2 twisted pairs (Fathom slim style) _(tether (coiled at the surface; its weight is carried there); tether to the surface laptop (Ethernet) · https://bluerobotics.com/store/cables-connectors/cables/fathom-slim-tether/)_ | 2 | 45 | 90 | https://bluerobotics.com/store/cables-connectors/cables/fathom-slim-tether/ |
| Power | WAGO 221-415 five-way lever splice _(rail splices, the star ground and bus hubs · https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415)_ | 6 | 0.8 | 4.8 | 450 V |
| Power | Blue Robotics 4 in watertight enclosure, 298 mm acrylic tube, aluminium end caps (rated 100 m) _(watertight electronics hull · https://bluerobotics.com/store/watertight-enclosures/4-series/wte4-asm-r1/)_ | 1 | 285 | 285 | https://bluerobotics.com/store/watertight-enclosures/4-series/wte4-asm-r1/ |
| Printed structure | PETG filament for 12 printed parts _(base_link, skid_fore, bow_frame, stern_frame, saddle_fore, saddle_aft, hull_tray_aft, hull_tray_fore, thruster_left_post, thruster_right_post, thruster_vert_left_post, thruster_vert_right_post)_ | 1 | 22.11 | 22.11 | 874 g of parts (+15 % supports/waste), about 79.7 h of printing |
| Fasteners | Screws, nuts and inserts | 44 | 0.12 | 5.28 | 2x M3 x 20 + nut (skid halves, through the joining lugs); 16x M4 x 25 + nyloc (tube sockets, through the tube); 2x M3 x 20 + nut (tray halves); 16x M2.5 x 6 self-tapping (boards to tray); 8x M3 x 12 (thruster foot to post) |
| Wiring | 4 AWG silicone wire _(price estimated)_ | 0.6 | 10 | 6 | 0.6 m: 21.2 mm2, rated 70 A in a bundle; 0.52 m cut + 10 % waste |
| Wiring | 14 AWG silicone wire _(price estimated)_ | 2.7 | 1.5 | 4.05 | 2.7 m: 2.082 mm2, rated 16 A in a bundle; 2.45 m cut + 10 % waste |
| Wiring | 16 AWG silicone wire _(price estimated)_ | 6.2 | 1 | 6.2 | 6.2 m: 1.308 mm2, rated 11 A in a bundle; 5.63 m cut + 10 % waste |
| Wiring | 22 AWG silicone wire _(price estimated)_ | 0.8 | 0.4 | 0.32 | 0.8 m: 0.327 mm2, rated 3.5 A in a bundle; 0.65 m cut + 10 % waste |
| Wiring | 24 AWG silicone wire _(price estimated)_ | 2 | 0.35 | 0.7 | 2 m: 0.205 mm2, rated 1.75 A in a bundle; 1.76 m cut + 10 % waste |
| Wiring | 26 AWG silicone wire _(price estimated)_ | 1.8 | 0.3 | 0.54 | 1.8 m: 0.128 mm2, rated 1.1 A in a bundle; 1.63 m cut + 10 % waste |
| Wiring | Dupont 2.54 mm contacts _(price estimated)_ | 28 | 0.02 | 0.56 | 28 pc: rated 3 A per contact |
| Wiring | Dupont 2.54 mm housings _(price estimated)_ | 14 | 0.02 | 0.28 | 14 pc: one per cable end |
| Wiring | XT90 contacts _(price estimated)_ | 2 | 1.6 | 3.2 | 2 pc: rated 45 A per contact |
| Wiring | Heat shrink 3 mm, 2:1 _(price estimated)_ | 2.6 | 0.2 | 0.52 | 2.6 m: 38 solder joints + a boot on each cable end |
| Wiring | Cable tie 100 x 2.5 mm _(price estimated)_ | 41 | 0.02 | 0.82 | 41 pc: at every clip, cable end and strain-relief anchor |
| Wiring | PG7 cable gland _(price estimated)_ | 5 | 2.97 | 14.85 | 5 pc: cable exit with strain relief |
| Wiring | camera FFC, 200 mm (Pi 5 22-pin to 15-pin) _(price estimated)_ | 1 | 4 | 4 | 1 pc: camera to controller |
| Wiring | 50 A ANL fuse _(price estimated)_ | 1 | 6 | 6 | 1 pc: plus spares |
| Wiring | 2 A ATM blade fuse _(price estimated)_ | 1 | 0.25 | 0.25 | 1 pc: plus spares |
| Wiring | 15 A ATM blade fuse _(price estimated)_ | 4 | 0.25 | 1 | 4 pc: plus spares |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|

## Notes
- Tethered ROV: 4 in sealed hull, 4 x T200 (surge, yaw, heave, roll), 6.1 kg, 239 g net lift, about 1.7 m/s, 18 min
- Seal the hull with fresh, greased O-rings and pull a vacuum through the vent plug (it must hold 10 minutes) before every dive; a flooded hull destroys the electronics.
- Thrust is the maker's bollard figure interpolated to 14.8 V; drag uses Cd 1.0 on a 25 x 25 cm frontal area (a guess for an open frame) and leaves out the tether's drag.
- Trim (foam and ballast) is computed for fresh water; in sea water it floats about 2.5 % more, so add one ballast weight.
- The printed frame parts flood: they carry no pressure. PETG is fine in water; avoid PLA, which slowly swells.
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
