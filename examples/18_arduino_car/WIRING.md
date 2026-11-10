# Wiring: arduino_car

18 cables, 40 conductors, 6.83 m of wire, wiring parts $5.89.

Drawings: [schematic.svg](schematic.svg) (also [schematic.pdf](schematic.pdf)), [breadboard.svg](breadboard.svg) (every wire in its colour, pin to pin) and the cable diagram [wiring.svg](wiring.svg). Cable routes in 3D: `design.wiring.cables[].path_mm` in `robot.json`.

## Power budget

| Rail | Volts | Source | Source limit A (cont / peak) | Load A (typical / peak) | Margin (typical) | Fuse A | Worst wire drop V |
|---|--:|---|--:|--:|--:|--:|--:|
| VBAT | 7.2 | main_switch | 20 / 100 | 1.636 / 6.036 | 12.2x | 4 | 0.048 |
| 5V_LOGIC | 5 | controller | 0.2 / 0.4 | 0.019 / 0.019 | 10.5x | - | 0.001 |

**VBAT loads** (peak assumes two motors stalling at once, the rest running):

| Load | Typical A | Peak A |
|---|--:|--:|
| controller | 0.016 | 0.016 |
| motor_driver_1 | 0.81 | 3.01 |
| motor_driver_2 | 0.81 | 3.01 |

**5V_LOGIC loads** (peak assumes every load at its peak at once):

| Load | Typical A | Peak A |
|---|--:|--:|
| motor_driver_1 | 0.002 | 0.002 |
| motor_driver_2 | 0.002 | 0.002 |
| ultrasonic | 0.015 | 0.015 |

## Protection

- Main switch: **main_switch** breaks the positive feed after the fuse. Ground is never switched.
- Fuse **F1**: 4 A ATM blade fuse, inline holder, protects everything on VBAT (20 AWG).
- Fuse **F2**: 2 A ATM blade fuse, inline holder, protects branch controller (22 AWG).
- All grounds meet at one star point. Every signal has its return through that common ground.

## Pin-to-pin table

| Cable | Wire | Net | From | To | AWG | Colour | Typical A | Peak A |
|---|---|---|---|---|--:|---|--:|--:|
| C1 | W1 | CONTROLLER_D5 | controller.D5 | motor_driver_1.PWMA | 26 | yellow | 0.02 | 0.02 |
| C1 | W2 | CONTROLLER_D7 | controller.D7 | motor_driver_1.AIN1 | 26 | blue | 0.02 | 0.02 |
| C1 | W3 | CONTROLLER_D8 | controller.D8 | motor_driver_1.AIN2 | 26 | blue | 0.02 | 0.02 |
| C1 | W4 | CONTROLLER_D6 | controller.D6 | motor_driver_1.PWMB | 26 | yellow | 0.02 | 0.02 |
| C1 | W5 | CONTROLLER_D4 | controller.D4 | motor_driver_1.BIN1 | 26 | blue | 0.02 | 0.02 |
| C1 | W6 | CONTROLLER_A0 | controller.A0 | motor_driver_1.BIN2 | 26 | white | 0.02 | 0.02 |
| C1 | W7 | MOTOR_DRIVER_1_STBY | controller.5V | motor_driver_1.STBY | 26 | red | 0.02 | 0.02 |
| C2 | W8 | FRONT_LEFT_MOTOR_PHASE_1 | motor_driver_1.AO1 | front_left_motor.M+ | 26 | orange | 0.4 | 1.5 |
| C2 | W9 | FRONT_LEFT_MOTOR_PHASE_2 | motor_driver_1.AO2 | front_left_motor.M- | 26 | orange | 0.4 | 1.5 |
| C3 | W10 | FRONT_RIGHT_MOTOR_PHASE_1 | motor_driver_1.BO1 | front_right_motor.M+ | 26 | orange | 0.4 | 1.5 |
| C3 | W11 | FRONT_RIGHT_MOTOR_PHASE_2 | motor_driver_1.BO2 | front_right_motor.M- | 26 | orange | 0.4 | 1.5 |
| C4 | W12 | CONTROLLER_D9 | controller.D9 | motor_driver_2.PWMA | 26 | yellow | 0.02 | 0.02 |
| C4 | W13 | CONTROLLER_A1 | controller.A1 | motor_driver_2.AIN1 | 26 | white | 0.02 | 0.02 |
| C4 | W14 | CONTROLLER_A2 | controller.A2 | motor_driver_2.AIN2 | 26 | white | 0.02 | 0.02 |
| C4 | W15 | CONTROLLER_D10 | controller.D10/SS | motor_driver_2.PWMB | 26 | violet | 0.02 | 0.02 |
| C4 | W16 | CONTROLLER_A3 | controller.A3 | motor_driver_2.BIN1 | 26 | white | 0.02 | 0.02 |
| C4 | W17 | CONTROLLER_D2 | controller.D2 | motor_driver_2.BIN2 | 26 | blue | 0.02 | 0.02 |
| C4 | W18 | MOTOR_DRIVER_2_STBY | controller.5V | motor_driver_2.STBY | 26 | red | 0.02 | 0.02 |
| C5 | W19 | REAR_LEFT_MOTOR_PHASE_1 | motor_driver_2.AO1 | rear_left_motor.M+ | 26 | orange | 0.4 | 1.5 |
| C5 | W20 | REAR_LEFT_MOTOR_PHASE_2 | motor_driver_2.AO2 | rear_left_motor.M- | 26 | orange | 0.4 | 1.5 |
| C6 | W21 | REAR_RIGHT_MOTOR_PHASE_1 | motor_driver_2.BO1 | rear_right_motor.M+ | 26 | orange | 0.4 | 1.5 |
| C6 | W22 | REAR_RIGHT_MOTOR_PHASE_2 | motor_driver_2.BO2 | rear_right_motor.M- | 26 | orange | 0.4 | 1.5 |
| C7 | W23 | CONTROLLER_D11 | controller.D11/MOSI | ultrasonic.Trig | 26 | violet | 0.02 | 0.02 |
| C7 | W24 | CONTROLLER_D12 | controller.D12/MISO | ultrasonic.Echo | 26 | violet | 0.02 | 0.02 |
| C8 | W25 | VBAT | battery.BAT+ | main_fuse.IN | 20 | red | 1.636 | 6.036 |
| C9 | W26 | VBAT | main_fuse.OUT | main_switch.IN | 20 | red | 1.636 | 6.036 |
| C10 | W27 | GND | battery.BAT- | star_ground.P1 | 20 | black | 1.636 | 6.036 |
| C11 | W28 | VBAT | main_switch.OUT | splice_vbat.P1 | 20 | red | 1.636 | 6.036 |
| C12 | W29 | VBAT | splice_vbat.P2 | controller.VIN | 22 | red | 0.016 | 0.016 |
| C12 | W30 | GND | star_ground.P2 | controller.GND | 24 | black | 0.016 | 0.016 |
| C13 | W31 | VBAT | splice_vbat.P2 | motor_driver_1.VM | 22 | red | 0.81 | 3.01 |
| C13 | W32 | GND | star_ground.P2 | motor_driver_1.GND | 22 | black | 0.81 | 3.01 |
| C14 | W33 | VBAT | splice_vbat.P2 | motor_driver_2.VM | 22 | red | 0.81 | 3.01 |
| C14 | W34 | GND | star_ground.P2 | motor_driver_2.GND | 22 | black | 0.81 | 3.01 |
| C15 | W35 | 5V_LOGIC | controller.5V | splice_5v_logic.P1 | 24 | red | 0.019 | 0.019 |
| C15 | W36 | GND | controller.GND | star_ground.P2 | 24 | black | 0.019 | 0.019 |
| C16 | W37 | 5V_LOGIC | splice_5v_logic.P2 | motor_driver_1.VCC | 24 | red | 0.002 | 0.002 |
| C17 | W38 | 5V_LOGIC | splice_5v_logic.P2 | motor_driver_2.VCC | 24 | red | 0.002 | 0.002 |
| C18 | W39 | 5V_LOGIC | splice_5v_logic.P2 | ultrasonic.Vcc | 24 | red | 0.015 | 0.015 |
| C18 | W40 | GND | star_ground.P2 | ultrasonic.GND | 24 | black | 0.015 | 0.015 |

## Cut list

Length is route + service loop + joint slack + termination, rounded up to 5 mm; cut every conductor of a cable to it.

| Cable | What | Conductors | Length mm | Route | Service | Joint slack | Ends | Connectors | Exit |
|---|---|--:|--:|--:|--:|--:|--:|---|---|
| C1 | controller to motor_driver_1 | 7 | 135 | 30.7 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 0.1 in header | - |
| C2 | motor_driver_1 to front_left_motor | 2 | 250 | 146 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | electronics_bay.motor_leads_1_l |
| C3 | motor_driver_1 to front_right_motor | 2 | 215 | 112 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | electronics_bay.motor_leads_1_r |
| C4 | controller to motor_driver_2 | 7 | 135 | 31.9 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 0.1 in header | - |
| C5 | motor_driver_2 to rear_left_motor | 2 | 240 | 136.3 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | electronics_bay.motor_leads_0_l |
| C6 | motor_driver_2 to rear_right_motor | 2 | 235 | 132.7 | 40 | 0 | 60 | 0.1 in header / Two factory-soldered 28 AWG leads | electronics_bay.motor_leads_0_r |
| C7 | controller to ultrasonic | 2 | 180 | 75.1 | 40 | 0 | 60 | 15-pin 2.54 mm male header / 4-pin 2.54 mm right-angle male header | electronics_bay.sensor |
| C8 | battery positive to main fuse | 1 | 100 | 0 | 40 | 0 | 60 | flying leads / soldered leads | - |
| C9 | main fuse to main switch | 1 | 150 | 48.5 | 40 | 0 | 60 | soldered leads / 4.8 mm quick-connect tabs | - |
| C10 | battery negative to star ground | 1 | 100 | 0 | 40 | 0 | 60 | flying leads / lever clamp | - |
| C11 | main_switch to the VBAT splice | 1 | 100 | 0 | 40 | 0 | 60 | 4.8 mm quick-connect tabs / lever clamp | - |
| C12 | VBAT to controller | 2 | 220 | 119.2 | 40 | 0 | 60 | lever clamp / 15-pin 2.54 mm male header | - |
| C13 | VBAT to motor_driver_1 | 2 | 250 | 149.2 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C14 | VBAT to motor_driver_2 | 2 | 240 | 137.9 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C15 | controller to the 5V_LOGIC splice | 2 | 100 | 0 | 40 | 0 | 60 | 15-pin 2.54 mm male header / lever clamp | - |
| C16 | 5V_LOGIC to motor_driver_1 | 1 | 135 | 30.7 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C17 | 5V_LOGIC to motor_driver_2 | 1 | 135 | 31.9 | 40 | 0 | 60 | lever clamp / 0.1 in header | - |
| C18 | 5V_LOGIC to ultrasonic | 2 | 180 | 75.1 | 40 | 0 | 60 | lever clamp / 4-pin 2.54 mm right-angle male header | electronics_bay.sensor |

## Electrical calculations

Computed from the power budget above and the parts' catalog and electrical records. Sources are listed at the end of this section.

### Battery runtime

Usable energy is 80 % of the pack's rated energy (stop at about 3.5 V a cell under load). Runtime = usable Wh / (rail volts x current).

| Battery | Rated Wh | mAh | Rail | Typical A | Runtime at typical | Peak A | Runtime at peak | Peak C-rate | Pack limit A |
|---|--:|--:|---|--:|--:|--:|--:|--:|--:|
| battery (2S 18650 pack: two 2500 mAh 20 A cells) | 18.5 | 2500 | VBAT 7.2 V | 1.636 | 75 min | 6.036 | 20 min | 2.35 C | 20 |

### Regulator heat

Heat = power in - power out. A switching converter's input comes from the budget above; an on-board linear regulator drops the difference in volts times the load current.

| Regulator | Type | In | Out | Load A (typical / peak) | Power in W | Power out W | Heat W (typical / peak) | Efficiency | Rated heat W | OK |
|---|---|---|---|--:|--:|--:|--:|--:|--:|:-:|
| controller | linear | VBAT 7.2 V | 5V_LOGIC 5 V | 0.019 / 0.019 | 0.137 | 0.095 | 0.042 / 0.042 | 69 % | 0.13 | yes |
- controller: on-board linear regulator: (Vin - Vout) x Iout.

### Logic levels

Every checked signal is read correctly by the pin it drives.

A driver's high level is its I/O supply; the receiver needs it above its input threshold and below its input limit.

| Net | Driver | Receiver | High V | Threshold V | Input limit V | Result |
|---|---|---|--:|--:|--:|---|
| CONTROLLER_D10 | A1 D10/SS | U2 PWMB | 5 | 2 | 5.7 | ok |
| CONTROLLER_D11 | A1 D11/MOSI | U3 Trig | 5 | 2 | 5.5 | ok |
| CONTROLLER_D12 | U3 Echo | A1 D12/MISO | 5 | 3 | 5.5 | ok |
| CONTROLLER_D2 | A1 D2 | U2 BIN2 | 5 | 2 | 5.7 | ok |
| CONTROLLER_D4 | A1 D4 | U1 BIN1 | 5 | 2 | 5.7 | ok |
| CONTROLLER_D5 | A1 D5 | U1 PWMA | 5 | 2 | 5.7 | ok |
| CONTROLLER_D6 | A1 D6 | U1 PWMB | 5 | 2 | 5.7 | ok |
| CONTROLLER_D7 | A1 D7 | U1 AIN1 | 5 | 2 | 5.7 | ok |
| CONTROLLER_D8 | A1 D8 | U1 AIN2 | 5 | 2 | 5.7 | ok |
| CONTROLLER_D9 | A1 D9 | U2 PWMA | 5 | 2 | 5.7 | ok |

### Sources

| Input | Source |
|---|---|
| 2S 18650 pack: two 2500 mAh 20 A cells (Samsung 25R class) in a plain two-cell holder capacity and energy | [datasheet](https://lygte-info.dk/review/batteries2012/Samsung%20INR18650-25R%202500mAh%20(Green)%20UK.html) |
| Arduino Nano compatible board (ATmega328P, CH340, USB-C) heat | estimated: 5 V x 25 mA typical; more when fed from VIN |
| Arduino Nano compatible board (ATmega328P, CH340, USB-C) logic levels | [datasheet](https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf): ATmega328P at VCC 5 V: VIH min 0.6 VCC = 3.0 V, pins to VCC + 0.5 V. Outputs swing to VCC at light load. |
| TB6612FNG dual DC motor driver module (1.2 A per channel) logic levels | [datasheet](https://cdn-shop.adafruit.com/datasheets/TB6612FNG_datasheet_en_20121101.pdf): Control inputs: VIH 2 V min, up to VCC + 0.2 V (Toshiba electrical characteristics); 3.3 V and 5 V hosts both drive it. |
| HC-SR04 ultrasonic distance sensor (2-400 cm) logic levels | [estimated](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf): 5 V TTL module: Echo drives 5 V. The trigger threshold is not published; TTL 2 V assumed. |

## Wiring parts to buy

| Item | Qty | Unit | Unit $ | Subtotal $ | Spec | Price source |
|---|--:|---|--:|--:|---|---|
| 20 AWG silicone wire | 0.5 | m | 0.5 | 0.25 | 0.519 mm2, rated 5.5 A in a bundle; 0.45 m cut + 10 % waste | estimated |
| 22 AWG silicone wire | 1.4 | m | 0.4 | 0.56 | 0.327 mm2, rated 3.5 A in a bundle; 1.20 m cut + 10 % waste | estimated |
| 24 AWG silicone wire | 1.2 | m | 0.35 | 0.42 | 0.205 mm2, rated 1.75 A in a bundle; 1.05 m cut + 10 % waste | estimated |
| 26 AWG silicone wire | 4.6 | m | 0.3 | 1.38 | 0.128 mm2, rated 1.1 A in a bundle; 4.13 m cut + 10 % waste | estimated |
| Dupont 2.54 mm contacts | 52 | pc | 0.02 | 1.04 | rated 3 A per contact | estimated |
| Dupont 2.54 mm housings | 17 | pc | 0.02 | 0.34 | one per cable end | estimated |
| 6.3 mm spade contacts | 2 | pc | 0.08 | 0.16 | rated 15 A per contact | estimated |
| Heat shrink 3 mm, 2:1 | 1.5 | m | 0.2 | 0.30 | 12 solder joints + a boot on each cable end | estimated |
| Cable tie 100 x 2.5 mm | 33 | pc | 0.02 | 0.66 | at every clip, cable end and strain-relief anchor | estimated |
| Rubber grommet, 5.0 mm panel hole, 3.0 mm bore | 4 | pc | 0.05 | 0.20 | 5 mm panel hole | estimated |
| Rubber grommet, 6.4 mm panel hole, 3.2 mm bore | 1 | pc | 0.08 | 0.08 | 6.5 mm panel hole | estimated |
| 4 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |
| 2 A ATM blade fuse | 1 | pc | 0.25 | 0.25 | plus spares | estimated |

## Data sources

| Part | Voltage | Current | Pins | Connector |
|---|---|---|---|---|
| Arduino Nano compatible board | estimated | estimated | estimated | estimated |
| Half-size solderless breadboard, 400 points, adhesive back | estimated | estimated | estimated | estimated |
| Inline ATM mini blade fuse holder, 30 A class | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | [datasheet](https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders) | estimated | estimated |
| HC-SR04 ultrasonic distance sensor | [datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf) | [datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf) | [datasheet](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf) | estimated |
| 2S 18650 pack: two 2500 mAh 20 A cells | [datasheet](https://www.akkuman.de/shop/mediafiles/PDF/18650%20Lithium/samsung%20inr18650-25r%2036v%202550mah%208c%2020a.pdf) | [datasheet](https://www.akkuman.de/shop/mediafiles/PDF/18650%20Lithium/samsung%20inr18650-25r%2036v%202550mah%208c%2020a.pdf) | estimated | estimated |
| KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC | estimated | estimated | estimated | estimated |
| TB6612FNG dual DC motor driver module | [datasheet](https://cdn-shop.adafruit.com/datasheets/TB6612FNG_datasheet_en_20121101.pdf) | [datasheet](https://cdn-shop.adafruit.com/datasheets/TB6612FNG_datasheet_en_20121101.pdf) | [datasheet](https://learn.sparkfun.com/tutorials/tb6612fng-hookup-guide/all) | [datasheet](https://learn.sparkfun.com/tutorials/tb6612fng-hookup-guide/all) |
| TT gear motor 3-6 V, 1:48, 200 rpm | [datasheet](https://www.adafruit.com/product/3777) | estimated | estimated | [datasheet](https://www.adafruit.com/product/3777) |
| WAGO 221-415 five-way lever splice | estimated | estimated | estimated | estimated |

## Notes

- Board to board wires on the breadboard are jumper wires in the rows of the two pins; the cut list length is the most a jumper needs.
