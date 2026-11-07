# Wiring: iron_man_mark_43

16 cables, 33 conductors, 26.89 m of wire, wiring parts $15.80.

Diagram: [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 7.2 | main_switch | 4 / 5 | 1.062 / 3.008 | 3.8x | 2 | 0.035 |
| 5V_SERVO | 5 | regulator | 2 / 3 | 0.5 / 1.4 | 4.0x | - | 0.067 |
| 5V_LIGHTS | 5 | regulator_lights | 2 / 3 | 0.72 / 2.16 | 2.8x | - | 0.14 |

**VBAT loads** (peak assumes every load on the 5 V rails at its peak, through the regulators):

| Load | Typical A | Peak A |
|---|--:|--:|
| regulator | 0.408 | 1.144 |
| controller | 0.065 | 0.1 |
| regulator_lights | 0.588 | 1.765 |

**5V_SERVO loads** (peak assumes both faceplate servos stalled):

| Load | Typical A | Peak A |
|---|--:|--:|
| faceplate_servo_left | 0.25 | 0.7 |
| faceplate_servo_right | 0.25 | 0.7 |

**5V_LIGHTS loads** (peak assumes all three rings at full white):

| Load | Typical A | Peak A |
|---|--:|--:|
| arc_reactor | 0.24 | 0.72 |
| left_repulsor | 0.24 | 0.72 |
| right_repulsor | 0.24 | 0.72 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 2 A ATM blade fuse, inline holder, protects everything on VBAT (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | FACEPLATE_LEFT_PWM | controller.D9 | faceplate_servo_left.Signal (orange) | 26 | yellow | 0.02 | 0.02 |
| C1 | W2 | 5V_SERVO | splice_5v_servo.P2 | faceplate_servo_left.V+ (red) | 24 | red | 0.25 | 0.7 |
| C1 | W3 | GND | star_ground.P2 | faceplate_servo_left.GND (brown) | 24 | black | 0.25 | 0.7 |
| C2 | W4 | FACEPLATE_RIGHT_PWM | controller.D10/SS | faceplate_servo_right.Signal (orange) | 26 | violet | 0.02 | 0.02 |
| C2 | W5 | 5V_SERVO | splice_5v_servo.P2 | faceplate_servo_right.V+ (red) | 24 | red | 0.25 | 0.7 |
| C2 | W6 | GND | star_ground.P2 | faceplate_servo_right.GND (brown) | 24 | black | 0.25 | 0.7 |
| C3 | W7 | EYE_LED_LEFT | controller.D3 | eye_led_left.ANODE | 26 | yellow | 0.02 | 0.02 |
| C3 | W8 | GND | controller.GND | eye_led_left.CATHODE | 24 | black | 0.02 | 0.02 |
| C4 | W9 | EYE_LED_RIGHT | controller.D5 | eye_led_right.ANODE | 26 | yellow | 0.02 | 0.02 |
| C4 | W10 | GND | controller.GND | eye_led_right.CATHODE | 24 | black | 0.02 | 0.02 |
| C5 | W11 | ARC_REACTOR_DATA | controller.D6 | arc_reactor.DIN | 26 | yellow | 0.02 | 0.02 |
| C5 | W12 | 5V_LIGHTS | splice_5v_lights.P2 | arc_reactor.5V | 24 | red | 0.24 | 0.72 |
| C5 | W13 | GND | star_ground.P2 | arc_reactor.GND | 24 | black | 0.24 | 0.72 |
| C6 | W14 | LEFT_REPULSOR_DATA | controller.D7 | left_repulsor.DIN | 26 | blue | 0.02 | 0.02 |
| C6 | W15 | 5V_LIGHTS | splice_5v_lights.P2 | left_repulsor.5V | 24 | red | 0.24 | 0.72 |
| C6 | W16 | GND | star_ground.P2 | left_repulsor.GND | 24 | black | 0.24 | 0.72 |
| C7 | W17 | RIGHT_REPULSOR_DATA | controller.D8 | right_repulsor.DIN | 26 | blue | 0.02 | 0.02 |
| C7 | W18 | 5V_LIGHTS | splice_5v_lights.P2 | right_repulsor.5V | 24 | red | 0.24 | 0.72 |
| C7 | W19 | GND | star_ground.P2 | right_repulsor.GND | 24 | black | 0.24 | 0.72 |
| C8 | W20 | VBAT | battery.BAT+ | main_fuse.IN | 22 | red | 1.062 | 3.008 |
| C9 | W21 | VBAT | main_fuse.OUT | main_switch.IN | 22 | red | 1.062 | 3.008 |
| C10 | W22 | GND | battery.BAT- | star_ground.P1 | 22 | black | 1.062 | 3.008 |
| C11 | W23 | VBAT | main_switch.OUT | splice_vbat.P1 | 22 | red | 1.062 | 3.008 |
| C12 | W24 | VBAT | splice_vbat.P2 | regulator.IN+ | 24 | red | 0.408 | 1.144 |
| C12 | W25 | GND | star_ground.P2 | regulator.IN- | 24 | black | 0.408 | 1.144 |
| C13 | W26 | VBAT | splice_vbat.P2 | controller.VIN | 24 | red | 0.065 | 0.1 |
| C13 | W27 | GND | star_ground.P2 | controller.GND | 24 | black | 0.065 | 0.1 |
| C14 | W28 | VBAT | splice_vbat.P2 | regulator_lights.IN+ | 24 | red | 0.588 | 1.765 |
| C14 | W29 | GND | star_ground.P2 | regulator_lights.IN- | 24 | black | 0.588 | 1.765 |
| C15 | W30 | 5V_SERVO | regulator.OUT+ | splice_5v_servo.P1 | 24 | red | 0.5 | 1.4 |
| C15 | W31 | GND | regulator.OUT- | star_ground.P2 | 24 | black | 0.5 | 1.4 |
| C16 | W32 | 5V_LIGHTS | regulator_lights.OUT+ | splice_5v_lights.P1 | 24 | red | 0.72 | 2.16 |
| C16 | W33 | GND | regulator_lights.OUT- | star_ground.P2 | 24 | black | 0.72 | 2.16 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | 5V_SERVO to faceplate_servo_left | 3 | 915 | 711.2 | 40 | 100 | 60 | 15-pin 2.54 mm male header / JR plug | back_bay.leads_1 |
| C2 | 5V_SERVO to faceplate_servo_right | 3 | 955 | 753.4 | 40 | 100 | 60 | 15-pin 2.54 mm male header / JR plug | back_bay.leads_2 |
| C3 | controller to eye_led_left | 2 | 1090 | 822.6 | 40 | 165 | 60 | 15-pin 2.54 mm male header / 2 axial leads | back_bay.leads_1 |
| C4 | controller to eye_led_right | 2 | 1235 | 965.4 | 40 | 165 | 60 | 15-pin 2.54 mm male header / 2 axial leads | back_bay.leads_2 |
| C5 | 5V_LIGHTS to arc_reactor | 3 | 1045 | 944 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 4 solder pads on the back | back_bay.leads_3 |
| C6 | 5V_LIGHTS to left_repulsor | 3 | 1880 | 1298.1 | 40 | 480 | 60 | 15-pin 2.54 mm male header / 4 solder pads on the back | back_bay.leads_3 |
| C7 | 5V_LIGHTS to right_repulsor | 3 | 1920 | 1338.7 | 40 | 480 | 60 | 15-pin 2.54 mm male header / 4 solder pads on the back | back_bay.leads_4 |
| C8 | battery positive to main fuse | 1 | 170 | 69.8 | 40 | 0 | 60 | flying leads / soldered leads | - |
| C9 | main fuse to main switch | 1 | 185 | 82.8 | 40 | 0 | 60 | soldered leads / 4.8 mm quick-connect tabs | - |
| C10 | battery negative to star ground | 1 | 170 | 69.8 | 40 | 0 | 60 | flying leads / lever clamp | - |
| C11 | main_switch to the VBAT splice | 1 | 185 | 82.8 | 40 | 0 | 60 | 4.8 mm quick-connect tabs / lever clamp | - |
| C12 | VBAT to regulator | 2 | 165 | 63.8 | 40 | 0 | 60 | lever clamp / solder pads | - |
| C13 | VBAT to controller | 2 | 100 | 0 | 40 | 0 | 60 | lever clamp / 15-pin 2.54 mm male header | - |
| C14 | VBAT to regulator_lights | 2 | 130 | 25.4 | 40 | 0 | 60 | lever clamp / solder pads | - |
| C15 | regulator to the 5V_SERVO splice | 2 | 165 | 63.8 | 40 | 0 | 60 | solder pads / lever clamp | - |
| C16 | regulator_lights to the 5V_LIGHTS splice | 2 | 130 | 25.4 | 40 | 0 | 60 | solder pads / lever clamp | - |

## Slack at the joints

Each loop is at least the extra length the joint needs at the far end of its travel, swept over its real limits.

| Cable | Joint | Travel rad | Length at home mm | Length at full travel mm | Slack loop mm |
|---|---|---|--:|--:|--:|
| C1 | neck | -0.25 to 0.25 | 71.1 | 75.5 | 100 |
| C2 | neck | -0.25 to 0.25 | 71.1 | 75.5 | 100 |
| C3 | neck | -0.25 to 0.25 | 71.1 | 75.5 | 95 |
| C3 | faceplate | -1 to 0 | 114.1 | 150 | 70 |
| C4 | neck | -0.25 to 0.25 | 71.1 | 75.5 | 95 |
| C4 | faceplate | -1 to 0 | 114.1 | 150 | 70 |
| C6 | left_shoulder | -1 to 0.2 | 152.6 | 253.1 | 250 |
| C6 | left_elbow | -1.9 to 0 | 147.5 | 282.2 | 190 |
| C7 | right_shoulder | -1 to 0.2 | 152.9 | 253.4 | 250 |
| C7 | right_elbow | -1.9 to 0 | 147.4 | 282 | 190 |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 22 AWG silicone wire | 0.8 | m | 0.4 | 0.32 | 0.327 mm2, rated 3.5 A in a bundle; 0.71 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 18.9 | m | 0.35 | 6.61 | 0.205 mm2, rated 1.75 A in a bundle; 17.13 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 10 | m | 0.3 | 3.00 | 0.128 mm2, rated 1.1 A in a bundle; 9.04 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 21 | pc | 0.02 | 0.42 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 8 | pc | 0.02 | 0.16 | one per cable end | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 1.9 | m | 0.2 | 0.38 | 31 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 24 | pc | 0.02 | 0.48 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 9.5 mm panel hole, 4.8 mm bore | 4 | pc | 0.1 | 0.40 | 9.5 mm panel hole | estimated |
| Nylon braided sleeving 6 mm | 2.5 | m | 0.4 | 1.00 | over every cable where it crosses a joint | estimated |
| 2 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| JST XH 2.5 mm inline plug and socket, 3 way | 7 | pc | 0.28 | 1.96 | one on each lead at the neck, the shoulders and the chest seam, so helmet, arms and chest come off | estimated |
| 1000 uF 16 V electrolytic capacitor | 3 | pc | 0.2 | 0.60 | across 5 V and GND at each ring | estimated |
| 330 ohm resistor, 1/4 W | 3 | pc | 0.02 | 0.06 | in series with each ring's data line, at the Nano | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Arduino Nano compatible board | estimated | estimated | estimated | estimated |
| LM2596S adjustable buck module | [datasheet](https://cdn.shopify.com/s/files/1/1509/1638/files/AZ-LM2596S_datasheet.pdf) | [datasheet](https://cdn.shopify.com/s/files/1/1509/1638/files/AZ-LM2596S_datasheet.pdf) | estimated | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| TowerPro MG90S micro servo | estimated | estimated | estimated | [datasheet](https://www.towerpro.com.tw/product/mg90s-3/) |
| 5 mm white LED + 100 ohm resistor | [datasheet](https://www.adafruit.com/product/754) | [datasheet](https://www.adafruit.com/product/754) | estimated | estimated |
| 2S 18650 pack: two 2500 mAh 20 A cells | [datasheet](https://www.akkuman.de/shop/mediafiles/PDF/18650%20Lithium/samsung%20inr18650-25r%2036v%202550mah%208c%2020a.pdf) | [datasheet](https://www.akkuman.de/shop/mediafiles/PDF/18650%20Lithium/samsung%20inr18650-25r%2036v%202550mah%208c%2020a.pdf) | estimated | estimated |
| KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC | estimated | estimated | estimated | estimated |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |
| WS2812B RGB LED ring, 12 LEDs, 37 mm | [datasheet](https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf) | [datasheet](https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels) | [datasheet](https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf) | estimated |

## Notes

- No cable shows from outside: every lead leaves the compartment through its floor, through a port in the back shell, and lies in the channels bonded inside the shells. Press the wires in one at a time past the snap lips.
- Set both LM2596 outputs to 5.0 V with a meter before wiring anything to them.
- The cells have no protection board: charge them out of the suit at 4.2 V per cell, and stop at 3.2 V per cell (6.4 V at the pack): the regulators fall out of 5 V at about that point.
- The Nano runs from VIN, so USB and the pack can be connected together.
- Eye LEDs hang on D3 and D5 through the 100 ohm resistor of the part: 20 mA each is an AVR pin's stated limit, so run them under full PWM for long stretches.
- WS2812 data: fit a 330 ohm resistor in series at the Nano pin of each ring and a 1000 uF capacitor across 5 V and GND at each ring. The run to a palm is over a metre of unscreened data: test it on the bench before closing the shells.
- All three rings at full white load their LM2596 past its 2 A continuous rating (2.16 A; 3 A peak): limit brightness to 90 % in the sketch for anything longer than a burst.
- Run time from the 2.5 Ah pack at the typical 1.062 A: about 1.9 h, keeping 20 % back (estimate; lights and faceplate never all run like that for hours).
