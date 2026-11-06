# Parts data

Every electrical part has dimensions and an electrical record in `packages/parts/data/electrical.json`: ports with pin names, connector, voltage, typical and peak current, signal types. Each value says where it comes from: `datasheet` with a URL, or `estimated` with the reason. `tests/parts-electrical.test.ts` fails if a part or a mark is missing. A value seen only in a search snippet or remembered is `estimated`.

506 of 1056 values are from a datasheet or a manufacturer or reputable vendor page; the rest are estimated. Treat estimated pinouts as a reason to check the part in your hand before powering it.

| Part | Values from a datasheet | Voltage | Current | Pins | Connector | Body size | Holes |
|---|--:|---|---|---|---|---|---|
| arduino_nano_clone | 0/17 | estimated | estimated | estimated | estimated | estimated | estimated |
| arduino_nano_v3 | 3/17 | datasheet | estimated | estimated | datasheet | datasheet | estimated |
| arduino_uno_clone | 2/20 | estimated | estimated | estimated | estimated | estimated | estimated |
| arduino_uno_r3 | 7/20 | datasheet | estimated | estimated | datasheet | datasheet | estimated |
| bno085_breakout | 9/14 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| breadboard_400 | 5/11 | estimated | estimated | estimated | estimated | datasheet | datasheet |
| buck_5v_5a | 6/9 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| buck_lm2596 | 4/12 | datasheet | datasheet | estimated | estimated | datasheet | estimated |
| canable2_usb_can | 1/11 | estimated | estimated | estimated | estimated | estimated | estimated |
| cubemars_ak60_6 | 9/11 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| cubemars_ak70_10 | 11/14 | estimated | datasheet | datasheet | datasheet | datasheet | estimated |
| cubemars_ak80_64 | 11/14 | estimated | datasheet | datasheet | datasheet | datasheet | estimated |
| cubemars_ak80_9 | 9/11 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| cytron_mdd10a | 0/18 | estimated | estimated | estimated | estimated | estimated | estimated |
| dc_jack_5521_panel | 3/11 | estimated | estimated | estimated | datasheet | estimated | estimated |
| dcdc_48v_12v_sd50c12 | 9/12 | datasheet | datasheet | datasheet | datasheet | datasheet | datasheet |
| dxl_u2d2 | 9/17 | estimated | estimated | estimated | datasheet | datasheet | estimated |
| dxl_xh540_w270 | 8/11 | datasheet | estimated | datasheet | datasheet | datasheet | estimated |
| dxl_xl330_m288 | 8/11 | datasheet | estimated | datasheet | datasheet | datasheet | estimated |
| dxl_xl430_w250 | 8/11 | datasheet | estimated | datasheet | datasheet | datasheet | estimated |
| dxl_xm430_w350 | 8/11 | datasheet | estimated | datasheet | datasheet | datasheet | estimated |
| esp32_s3_devkitc1 | 9/17 | estimated | datasheet | estimated | datasheet | datasheet | datasheet |
| estop_22mm_nc | 6/8 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| feetech_fe_urt1 | 22/29 | datasheet | datasheet | estimated | datasheet | datasheet | estimated |
| feetech_sts3215_c001 | 6/11 | datasheet | estimated | datasheet | datasheet | datasheet | estimated |
| feetech_sts3215_c018 | 7/11 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| feetech_sts3215_c044 | 6/11 | datasheet | estimated | datasheet | datasheet | datasheet | estimated |
| feetech_sts3215_c046 | 7/11 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| feetech_sts3215_c047 | 4/11 | datasheet | estimated | datasheet | estimated | datasheet | estimated |
| feetech_sts3250 | 4/11 | datasheet | estimated | datasheet | estimated | datasheet | estimated |
| fuse_holder_anl | 0/8 | estimated | estimated | estimated | estimated | estimated | estimated |
| fuse_holder_atm_inline | 2/8 | datasheet | datasheet | estimated | estimated | estimated | estimated |
| hc_sr04 | 4/8 | datasheet | datasheet | datasheet | estimated | datasheet | estimated |
| hobby_ds3218 | 0/8 | estimated | estimated | estimated | estimated | estimated | estimated |
| hobby_mg90s | 2/8 | estimated | estimated | estimated | datasheet | datasheet | estimated |
| hobby_mg996r | 4/8 | datasheet | datasheet | estimated | datasheet | datasheet | estimated |
| hobby_sg90 | 4/8 | datasheet | estimated | datasheet | datasheet | datasheet | estimated |
| iec_c14_fused_switched | 0/11 | estimated | estimated | estimated | estimated | estimated | estimated |
| jetson_orin_nano_super | 19/38 | datasheet | estimated | datasheet | datasheet | datasheet | estimated |
| l298n_module | 15/21 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| lcd_2in_st7789 | 6/8 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| led_5mm_white | 3/8 | datasheet | datasheet | estimated | estimated | estimated | datasheet |
| lipo_3s_2200 | 0/12 | estimated | estimated | estimated | estimated | estimated | estimated |
| lipo_3s_5000 | 3/12 | estimated | datasheet | estimated | datasheet | datasheet | estimated |
| lipo_4s_5000 | 4/12 | estimated | datasheet | estimated | datasheet | datasheet | estimated |
| lipo_6s_10000 | 4/12 | estimated | datasheet | estimated | datasheet | datasheet | estimated |
| n20_gearmotor_100to1 | 1/8 | estimated | estimated | estimated | datasheet | estimated | estimated |
| nema17_42x40 | 4/8 | estimated | datasheet | datasheet | datasheet | datasheet | estimated |
| nema17_42x40_pg5 | 4/8 | estimated | datasheet | datasheet | datasheet | datasheet | estimated |
| pack_2s_18650 | 3/9 | datasheet | datasheet | estimated | estimated | estimated | estimated |
| pca9685_16ch | 42/63 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| pca9685_clone | 41/63 | datasheet | datasheet | datasheet | datasheet | estimated | estimated |
| pololu_37d_30to1_64cpr | 3/8 | estimated | estimated | datasheet | datasheet | datasheet | estimated |
| pololu_37d_50to1_64cpr | 3/8 | estimated | estimated | datasheet | datasheet | datasheet | estimated |
| pololu_37d_70to1_64cpr | 3/8 | estimated | estimated | datasheet | datasheet | datasheet | estimated |
| psu_12v_lrs150 | 9/12 | datasheet | datasheet | datasheet | datasheet | datasheet | datasheet |
| psu_12v_lrs75 | 9/12 | datasheet | datasheet | datasheet | datasheet | datasheet | datasheet |
| psu_24v_lrs150 | 9/12 | datasheet | datasheet | datasheet | datasheet | datasheet | datasheet |
| psu_48v_lrs350 | 9/12 | datasheet | datasheet | datasheet | datasheet | datasheet | datasheet |
| psu_5v4a_adapter | 8/12 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| psu_5v_lrs50 | 9/12 | datasheet | datasheet | datasheet | datasheet | datasheet | datasheet |
| realsense_d435i | 5/11 | estimated | datasheet | estimated | datasheet | datasheet | estimated |
| rpi5 | 14/41 | estimated | datasheet | estimated | datasheet | datasheet | datasheet |
| rpi_camera_module_3 | 6/11 | datasheet | estimated | datasheet | estimated | datasheet | datasheet |
| rplidar_a1m8 | 10/14 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| rplidar_c1 | 5/8 | datasheet | datasheet | datasheet | datasheet | datasheet | estimated |
| switch_battery_6006 | 0/8 | estimated | estimated | estimated | estimated | estimated | estimated |
| switch_kcd1 | 1/8 | estimated | estimated | estimated | estimated | datasheet | estimated |
| switch_kcd4 | 0/8 | estimated | estimated | estimated | estimated | estimated | estimated |
| tb6612fng_module | 11/18 | datasheet | datasheet | datasheet | datasheet | estimated | estimated |
| tmc2209_stepstick | 7/15 | datasheet | estimated | datasheet | datasheet | estimated | estimated |
| tt_gearmotor_1to48 | 4/8 | datasheet | estimated | estimated | datasheet | datasheet | estimated |
| usb_can_adapter | 3/11 | estimated | estimated | estimated | datasheet | estimated | estimated |
| usb_can_canable2 | 1/11 | estimated | estimated | estimated | estimated | estimated | estimated |
| wago_221_415 | 0/8 | estimated | estimated | estimated | estimated | estimated | estimated |
| waveshare_bus_servo_adapter | 7/20 | datasheet | estimated | estimated | datasheet | estimated | datasheet |
| ws2812_ring_12 | 4/8 | datasheet | datasheet | datasheet | estimated | datasheet | estimated |

## Where the sources disagree with the catalog

Found while collecting the data. Those not fixed in `python/ttr_build/components` are open.

- feetech_sts3215_c001: catalog envelope height 39.6 mm vs published 45.2 x 24.7 x 35 mm case (+4.6 mm; the catalog probably counts horn and rear boss).
- feetech_sts3215_c018: catalog envelope height 39.6 mm vs published 45.2 x 24.7 x 35 mm case (+4.6 mm; the catalog probably counts horn and rear boss).
- feetech_sts3215_c044: catalog envelope height 39.6 mm vs published 45.2 x 24.7 x 35 mm case (+4.6 mm; the catalog probably counts horn and rear boss).
- feetech_sts3215_c046: catalog envelope height 39.6 mm vs published 45.2 x 24.7 x 35 mm case (+4.6 mm; the catalog probably counts horn and rear boss).
- feetech_sts3215_c047: catalog envelope height 39.6 mm vs published 45.2 x 24.7 x 35 mm case (+4.6 mm; the catalog probably counts horn and rear boss).
- feetech_sts3250: catalog envelope height 39.6 mm vs published 35 mm case (+4.6 mm; the catalog's own note says 35).
- feetech_sts3215_c044: catalog stall torque 10.8 kg.cm (scaled by gear ratio) vs OpenELAB 27.4 kg.cm at 7.4 V, though that figure is oddly high beside C046 (14.4 kg.cm at 1:147). Verify before trusting either.
- feetech_sts3215_c044: catalog stall current 2.5 A vs OpenELAB 3.8 A at 7.4 V.
- feetech_sts3215_c046: catalog stall current 2.5 A vs OpenELAB 3.3 A at 7.4 V.
- feetech_sts3215_c018, c047, sts3250, c001, c044, c046: catalog current_a equals stall, whereas published rated current is 0.9 A (C018) and 1.1 A (C046). The same holds for all Dynamixel, hobby servo and gearmotor entries: catalog current_a is a stall figure, not a typical one.
- cubemars_ak70_10: catalog connector 'XT30(2+2) power+CAN' vs product page and manual V1.0.14: XT30PW-M power only, separate A1257WR-S-4P CAN, A1257WR-S-3P UART.
- cubemars_ak80_64: catalog connector 'XT30(2+2) power+CAN' vs product page and manual V1.0.14: XT30PW-M power only, separate A1257WR-S-4P CAN, A1257WR-S-3P UART.
- cubemars_ak80_9: catalog encoder 16-bit vs V3 driver manual 21-bit inner loop (the manual is generic to the V3 driver). Catalog bus 'CAN 1 Mbps' vs product page 'Support CAN FD'.
- dxl_xh540_w270: catalog envelope depth 48.0 mm vs published 44 mm (+4 mm, probably the horn).
- dxl_xl430_w250: catalog envelope depth 37.9 mm vs published 34 mm (+3.9 mm, probably the horn).
- dxl_xm430_w350: catalog envelope depth 37.9 mm vs published 34 mm (+3.9 mm, probably the horn).
- pololu_37d_30to1_64cpr: catalog body 71.1 mm / envelope 93.1 mm vs Pololu drawing 67.6 / 89.6 mm (+3.5 mm).
- pololu_37d_50to1_64cpr: catalog body 73.1 mm / envelope 95.1 mm vs Pololu drawing 70.1 / 92.1 mm (+3.0 mm).
- pololu_37d_70to1_64cpr: catalog body 73.1 mm / envelope 95.1 mm vs Pololu drawing 70.1 / 92.1 mm (+3.0 mm).
- pololu_37d_30to1_64cpr: catalog max_power_w 10 vs Pololu category table 12 W.
- nema17_42x40_pg5: catalog envelope length 97.3 mm vs drawing 95.3 mm (shaft modelled 22 vs 20 +-1 mm; the catalog note admits this). Key says 42x40, but the motor is 48 mm long.
- tt_gearmotor_1to48: catalog body 72 x 22.5 x 18.8 mm vs Adafruit 70 x 22 x 18 mm (+2 mm length).
- tt_gearmotor_1to48: catalog no_load_speed 200 rpm vs Adafruit measured 250 rpm at 6 V (200 rpm is its minimum spec).
- hobby_mg996r: catalog voltage range 4.8-6.0 V vs cited PDF 4.8-7.2 V and TowerPro page 4.8-6.6 V.
- hobby_mg996r: catalog stall 2.5 A matches the cited PDF, but TowerPro's own page says 1.4 A; catalog running figures not given, published 500-900 mA vs TowerPro 170 mA.
- hobby_mg996r: catalog envelope 54.5 x 35.5 x 44.6 mm vs published body 40.7 x 19.7 x 42.9 mm (catalog includes tabs and horn). Catalog case height 36.4 vs 42.9 mm.
- hobby_ds3218: catalog envelope 54.5 x 35.5 x 42.2 mm vs published body 39.9 x 20.1 x 40.4 mm (catalog includes tabs and horn).
- hobby_ds3218: catalog torque 19 / 21.5 kg.cm vs servodatabase (PRO) 21 / 23.5 kg.cm. Catalog idle 10 mA vs 5 mA. Catalog lower voltage 5.0 vs 4.8 V is within tolerance.
- hobby_ds3218: catalog wire colours brown/red/orange vs a manual snippet (not fetched) of black/red/white.
- hobby_mg90s: catalog supplier_url adafruit.com/product/1143 is an MG90D, not an MG90S.
- hobby_mg90s: catalog envelope 38.22 x 17 x 31.5 mm vs published body 22.8 x 12.2 x 28.5 mm (catalog includes tabs and horn). Catalog case height 22.7 vs 28.5 mm.
- hobby_sg90: catalog supplier_url adafruit.com/product/169 is an SG92R, not an SG90.
- hobby_sg90: catalog voltage range 4.8-4.8 V vs M5Stack 4.8-6.0 V.
- hobby_sg90: catalog envelope 38.87 x 17 x 31.5 mm vs published body 23 x 12.2 x 29 mm (catalog includes tabs and horn). Catalog case height 22.7 vs 29 mm.
- jetson_orin_nano_super: envelope_mm [100, 92, 34.77] vs NVIDIA 103 x 90.5 x 34.77 kit (3 mm and 1.5 mm off). Catalog specs.devkit_envelope_mm already has the right value.
- arduino_nano_v3: holes [] and specs.no_mounting_holes true, but the board has 4 corner holes (d 1.85, 40.64 x 15.24 pitch, NopSCADlib; not a manufacturer value).
- arduino_nano_clone: same as nano_v3, holes [] and no_mounting_holes true; corner holes assumed present, varies per seller.
- arduino_uno_r3: specs.input_v [7, 12] is the recommended range; Arduino datasheet VIN limits are 6-20 V. Both valid, label which one is meant.
- arduino_uno_clone: specs.input_v as for uno_r3; keep 7-12 V on a clone, its regulator may not take 20 V.
- arduino_nano_v3: specs.input_v [7, 12] matches store tech specs, but the same page's FAQ says 6-20 V.
- arduino_uno_r3: envelope_mm length 74.8 vs published PCB 68.6. Not an error: catalog includes the USB-B overhang (bbox -6.2).
- arduino_uno_clone: envelope_mm length 74.8 vs Uno R3 PCB 68.6, same reason.
- rpi5: envelope_mm [88, 57.2, 19.1] vs drawing PCB 85 x 56. Not an error: catalog includes connector overhang.
- esp32_s3_devkitc1: envelope_mm length 64.24 vs drawing PCB 62.74 (1.5 mm). Not an error: specs.board_mm is 62.74.
- hc_sr04: envelope_mm height 22.1 vs datasheet 15. Not an error if header pins are meant to count (bbox -8.5 to 13.6).
- rplidar_c1: envelope_mm width 59.6 vs Waveshare 55.6 (4 mm). Possibly the cable exit (bbox y -31.8 to 27.8); Slamtec Figure 4-1 could not be read to settle it.
- ws2812_ring_12: envelope_mm height 3.5 vs Adafruit product page 6.7, but Adafruit's guide says 3.6, which agrees with the catalog. Product page looks wrong.
- breadboard_400: mass_g 30 vs Adafruit 38 (27 %), catalog marks it uncertain; the 2022 version has a metal plate.
- canable2_usb_can / usb_can_canable2: same product under two keys with different geometry (48 x 18 x 9.1 mm, 6 g vs 56 x 20 x 9 mm, 10 g); no published size found. Merge them.
- dxl_u2d2: catalog length 50.5 mm vs ROBOTIS 48 mm (2.5 mm).
- usb_can_adapter: catalog envelope length 56 mm vs EYOU 54 mm overall (2 mm); catalog board_mm 54 agrees.
- cytron_mdd10a: catalog height 12.6 mm vs retailer 25 mm quoted in the catalog's own note (no Cytron page reached). Length 85 vs 84.5 is in tolerance.
- waveshare_bus_servo_adapter: catalog holes 3 mm in from corners (36 x 27 mm spacing) vs Waveshare 37 x 28 mm spacing (1 mm); catalog thread M2 on a 2.5 mm hole is not a thread, it is a clearance hole.
- feetech_fe_urt1: catalog voltage_v 12 and one power terminal vs manual: two terminals, SMS and SCS, silk DC8V-16V and DC6V-9V; 6 A port limit missing.
- tb6612fng_module: catalog current_a 1.2 is the absolute maximum; Toshiba recommended maximum is 1.0 A per channel (20 %). 20.3 x 20.3 mm outline differs from Pololu 15.2 x 20.3 and Adafruit 27 x 19 (per-seller).
- pca9685_16ch / pca9685_clone: catalog servo_v_max 6 is the recommended limit; Adafruit allows V+ up to 12 V.
- buck_lm2596: catalog current_a 3.0 continuous vs AZ-Delivery module sheet 2 A (3 A peak), 33 %.
- dc_jack_5521_panel: catalog panel_max_mm 4 vs Adafruit 8 mm. Catalog current_a 5.0 vs Arrow listing 0.5 A for #610 (search snippet, unverified).
- psu_5v4a_adapter: catalog 90 x 50 x 32 mm vs Adafruit 91.5 x 45.5 x 30.2 mm (width 4.5 mm, length 1.5, height 1.8).
- estop_22mm_nc: catalog envelope 40 x 40 x 70 mm vs Schneider XB5AS8442 40 x 43 x 82 mm (depth 12 mm). Contact 10 A is Ith only; DC-13 operational is 0.55 A at 125 V.
- dcdc_48v_12v_sd50c12: catalog no_mounting_holes true vs Mean Well 2 x M3 bottom, 3 x M3 side plus flange slots. Mass 487.5 g vs 430 g (13 %).
- psu_24v_lrs150: bottom holes (32, 50) and (132, 50) vs Mean Well (24, 32) and (102, 32); side holes x 32/132 z 15 vs Mean Well x 22 z 15, x 139 z 6 and z 24. Mass 530 g vs 420 g (26 %).
