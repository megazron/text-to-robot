# Wiring: quadcopter

12 cables, 25 conductors, 4.46 m of wire, wiring parts $15.02.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 14.8 | battery | 60 / 150 | 14.433 / 60.1 | 4.2x | - | 0.024 |
| 5V_FC | 5 | controller | 2 / 2 | 0.05 / 0.1 | 40.0x | - | 0.001 |
| VCAM | 9 | controller | 2 / 2 | 0.15 / 0.2 | 13.3x | - | 0.005 |

**VBAT loads** (peak assumes four motors at the 60 A current limit in a punch-out):

| Load | Typical A | Peak A |
|---|--:|--:|
| esc | 14.433 | 60.1 |

**5V_FC loads** (peak assumes every load at its peak at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| receiver | 0.05 | 0.1 |

**VCAM loads** (peak assumes every load at its peak at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| fpv_camera | 0.15 | 0.2 |

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | FRONT_LEFT_MOTOR_A | esc.M1A | front_left_motor.A | 18 | orange | 2.937 | 12.295 |
| C1 | W2 | FRONT_LEFT_MOTOR_B | esc.M1B | front_left_motor.B | 18 | orange | 2.937 | 12.295 |
| C1 | W3 | FRONT_LEFT_MOTOR_C | esc.M1C | front_left_motor.C | 18 | orange | 2.937 | 12.295 |
| C2 | W4 | REAR_LEFT_MOTOR_A | esc.M2A | rear_left_motor.A | 18 | orange | 2.937 | 12.295 |
| C2 | W5 | REAR_LEFT_MOTOR_B | esc.M2B | rear_left_motor.B | 18 | orange | 2.937 | 12.295 |
| C2 | W6 | REAR_LEFT_MOTOR_C | esc.M2C | rear_left_motor.C | 18 | orange | 2.937 | 12.295 |
| C3 | W7 | REAR_RIGHT_MOTOR_A | esc.M3A | rear_right_motor.A | 18 | orange | 2.937 | 12.295 |
| C3 | W8 | REAR_RIGHT_MOTOR_B | esc.M3B | rear_right_motor.B | 18 | orange | 2.937 | 12.295 |
| C3 | W9 | REAR_RIGHT_MOTOR_C | esc.M3C | rear_right_motor.C | 18 | orange | 2.937 | 12.295 |
| C4 | W10 | FRONT_RIGHT_MOTOR_A | esc.M4A | front_right_motor.A | 18 | orange | 2.937 | 12.295 |
| C4 | W11 | FRONT_RIGHT_MOTOR_B | esc.M4B | front_right_motor.B | 18 | orange | 2.937 | 12.295 |
| C4 | W12 | FRONT_RIGHT_MOTOR_C | esc.M4C | front_right_motor.C | 18 | orange | 2.937 | 12.295 |
| C5 | W13 | ESC_CONTROLLER_LINK | esc.VBAT | controller.VBAT | made | red | 0.4 | 0.8 |
| C6 | W14 | CONTROLLER_TX2 | controller.TX2 | receiver.RX | 26 | green | 0.02 | 0.02 |
| C6 | W15 | CONTROLLER_RX2 | controller.RX2 | receiver.TX | 26 | white | 0.02 | 0.02 |
| C7 | W16 | FPV_CAMERA_VIDEO | fpv_camera.VIDEO | controller.VIDEO_IN | 26 | white | 0.02 | 0.02 |
| C8 | W17 | GND | battery.BAT- | star_ground.P1 | 8 | black | 14.433 | 60.1 |
| C9 | W18 | VBAT | battery.BAT+ | esc.VBAT+ | 8 | red | 14.433 | 60.1 |
| C9 | W19 | GND | star_ground.P2 | esc.GND | 8 | black | 14.433 | 60.1 |
| C10 | W20 | GND | controller.GND_RX | star_ground.P2 | 24 | black | 0.05 | 0.1 |
| C10 | W21 | GND | controller.GND_CAM | star_ground.P2 | 24 | black | 0.15 | 0.2 |
| C11 | W22 | 5V_FC | controller.5V | receiver.5V | 24 | red | 0.05 | 0.1 |
| C11 | W23 | GND | star_ground.P2 | receiver.GND | 24 | black | 0.05 | 0.1 |
| C12 | W24 | VCAM | controller.VCAM | fpv_camera.VIN | 24 | red | 0.15 | 0.2 |
| C12 | W25 | GND | star_ground.P2 | fpv_camera.GND | 24 | black | 0.15 | 0.2 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | esc to front_left_motor | 3 | 235 | 132.2 | 40 | 0 | 60 | Motor solder pads / Three 20 AWG motor leads | canopy.leads_fl |
| C2 | esc to rear_left_motor | 3 | 235 | 132.2 | 40 | 0 | 60 | Motor solder pads / Three 20 AWG motor leads | canopy.leads_rl |
| C3 | esc to rear_right_motor | 3 | 235 | 132.2 | 40 | 0 | 60 | Motor solder pads / Three 20 AWG motor leads | canopy.leads_rr |
| C4 | esc to front_right_motor | 3 | 235 | 132.2 | 40 | 0 | 60 | Motor solder pads / Three 20 AWG motor leads | canopy.leads_fr |
| C5 | esc to controller | 1 | 20 | 15.7 | 0 | 0 | 0 | 8-pin JST-SH stack cable (supplied with the ESC) | - |
| C6 | controller to receiver | 2 | 110 | 5.5 | 40 | 0 | 60 | Solder pads (UART2 / 4 solder pads | - |
| C7 | fpv_camera to controller | 1 | 155 | 54 | 40 | 0 | 60 | 3-pin JST-SH 1.0 mm lead (supplied) / Solder pads (camera) | canopy.camera |
| C8 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | XT60 / lever clamp | - |
| C9 | VBAT to esc | 2 | 165 | 63 | 40 | 0 | 60 | XT60 / Battery solder pads | canopy.antenna |
| C10 | controller to star_ground | 2 | 155 | 52.1 | 40 | 0 | 60 | Solder pads (UART2 / lever clamp | canopy.antenna |
| C11 | 5V_FC to receiver | 2 | 110 | 5.5 | 40 | 0 | 60 | Solder pads (UART2 / 4 solder pads | - |
| C12 | VCAM to fpv_camera | 2 | 155 | 54 | 40 | 0 | 60 | Solder pads (camera) / 3-pin JST-SH 1.0 mm lead (supplied) | canopy.camera |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (LiPo 4S 1500 mAh 100C, XT60) | 22.2 | 1500 | VBAT 14.8 V | 14.433 | 5 min | 60.1 | 1 min | 40.07 C | 150 |

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| CONTROLLER_RX2 | U3 TX | A1 RX2 | - | - | - | not checked: no published logic levels for one side |
| CONTROLLER_TX2 | A1 TX2 | U3 RX | - | - | - | not checked: no published logic levels for one side |
| FPV_CAMERA_VIDEO | U2 VIDEO | A1 VIDEO_IN | - | - | - | not checked: no published logic levels for one side |

Not checked (no logic levels in the parts data): ExpressLRS 2.4 GHz nano receiver with T antenna (e.g. RadioMaster RP1), F405 flight controller, BMI270 IMU, OSD, barometer, 30.5 mm mount (e.g. SpeedyBee F405 V4), Micro analog FPV camera, 19 mm, 1/1.8 in sensor (e.g. Caddx Ratel 2).

### Sources

| Input | Source |
|---|---|
| LiPo 4S 1500 mAh 100C, XT60 (e.g. CNHL Black Series) capacity and energy | [datasheet](https://chinahobbyline.com/products/cnhl-black-series-1500mah-14-8v-4s-100c-lipo-battery-with-xt60-plug) |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 8 AWG silicone wire | 0.5 | m | 4.5 | 2.25 | 8.37 mm2, rated 36.5 A in a bundle; 0.43 m cut + 10 % waste | estimated |
| 18 AWG silicone wire | 3.2 | m | 0.7 | 2.24 | 0.823 mm2, rated 8 A in a bundle; 2.82 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 1 | m | 0.35 | 0.35 | 0.205 mm2, rated 1.75 A in a bundle; 0.84 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 0.5 | m | 0.3 | 0.15 | 0.128 mm2, rated 1.1 A in a bundle; 0.38 m cut + 10 % waste | estimated |
| XT60 contacts | 5 | pc | 0.9 | 4.50 | rated 35 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 2 | m | 0.2 | 0.40 | 40 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 30 | pc | 0.02 | 0.60 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 4 | pc | 0.08 | 0.32 | 6.5 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 8.5 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 4 mm panel hole | estimated |
| Rubber grommet, 5.0 mm panel hole, 3.0 mm bore | 1 | pc | 0.05 | 0.05 | 5 mm panel hole | estimated |
| 8-pin JST-SH stack cable (supplied with the ESC) | 1 | pc | 4 | 4.00 | esc to controller | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| 2207 brushless motor 1750 KV for 5 in props, 4S | [datasheet](https://shop.iflight.com/xing2-2207-unibell-fpv-motor-pro1504) | estimated | estimated | estimated |
| ExpressLRS 2.4 GHz nano receiver with T antenna | [datasheet](https://www.radiomasterrc.com/products/rp1-expresslrs-2-4ghz-nano-receiver) | estimated | estimated | estimated |
| 4-in-1 BLHeli_S ESC 45 A per motor, 3-6S, 30.5 mm mount | [datasheet](https://www.speedybee.com/speedybee-bls-50a-30x30-4-in-1-esc/) | [datasheet](https://www.speedybee.com/speedybee-bls-50a-30x30-4-in-1-esc/) | estimated | estimated |
| F405 flight controller, BMI270 IMU, OSD, barometer, 30.5 mm mount | [datasheet](https://www.speedybee.com/speedybee-f405-v4-bls-55a-30x30-fc-esc-stack/) | estimated | estimated | estimated |
| Micro analog FPV camera, 19 mm, 1/1.8 in sensor | [datasheet](https://caddxfpv.com/products/caddxfpv-ratel-2-starlight-hdr-fpv-camera) | estimated | estimated | estimated |
| LiPo 4S 1500 mAh 100C, XT60 | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |

## Notes

- Motor leads are cut to length and soldered straight to the ESC pads; the XT60 pigtail carries a 470 uF low-ESR capacitor across the pads.
