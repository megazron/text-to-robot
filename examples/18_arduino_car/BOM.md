# Bill of Materials — arduino_car

**Estimated total: $40.88**  ·  tier: hobby

**Effort sizing: passes catalogue estimate; hardware verified: no.**

| Category | Component | Qty | Unit $ | Subtotal $ | Spec |
|---|---|--:|--:|--:|---|
| Compute | Arduino Nano compatible board (ATmega328P, CH340, USB-C) _(Arduino (runs the generated sketch) · https://www.aliexpress.com/w/wholesale-arduino-nano-type-c-ch340.html)_ | 1 | 3.5 | 3.5 | 5 V |
| Power | Half-size solderless breadboard, 400 points, adhesive back _(plug-in wiring for the board and driver · https://www.adafruit.com/product/64)_ | 1 | 2 | 2 | https://www.adafruit.com/product/64 |
| Sensor | HC-SR04 ultrasonic distance sensor (2-400 cm) _(HC-SR04 distance sensor · https://www.aliexpress.com/w/wholesale-hc-sr04.html)_ | 1 | 1 | 1 | 5 V |
| Power | 2S 18650 pack: two 2500 mAh 20 A cells (Samsung 25R class) in a holder with switch _(2S 18650 pack · https://www.aliexpress.com/w/wholesale-18650-2-slot-battery-holder-switch.html)_ | 1 | 12 | 12 | 7.4 V, 18.5 Wh |
| Electronics | TB6612FNG dual DC motor driver module (1.2 A per channel) _(TB6612FNG dual motor driver · https://www.aliexpress.com/w/wholesale-tb6612fng-motor-driver.html)_ | 2 | 2 | 4 | 7.4 V |
| Actuator | TT gear motor 3-6 V, 1:48, 200 rpm (yellow, double-D shaft) _(drive motor · https://www.adafruit.com/product/3777)_ | 4 | 1.5 | 6 | 0.0235 N·m rated / 0.0785 N·m peak, 6 V |
| Drive | 65 mm rubber wheel for TT gearmotors (double-D 5.3x3.7 bore) _(drive wheel · https://makerlab-electronics.com/products/65mm-yellow-wheel)_ | 4 | 2 | 8 | https://makerlab-electronics.com/products/65mm-yellow-wheel |
| Printed structure | PETG filament for 2 printed parts _(chassis, sensor_bracket)_ | 1 | 2.46 | 2.46 | 97 g of parts (+15 % supports/waste), about 8.9 h of printing |
| Fasteners | Screws, nuts and inserts | 16 | 0.12 | 1.92 | 8x M3x25 socket head + nut (motor through-bolt); 2x M3x8 countersunk + nut (pack); 2x M3x10 + nut (sensor bracket); 4x M2x6 self-tapping (sensor) |

## Actuator sizing

| Joint | Required effort | Unit | Chosen actuator | Margin |
|---|--:|---|---|--:|

## Notes
- Arduino car (stronger (4WD, ramps up to 10 deg)): 4WD on TT gear motors, 0.53 kg, 0.54 m/s, 99 min, $37 of parts
- TT motor continuous torque taken as 30 % of the 0.8 kg.cm stall (Adafruit #3777 data)
- prices are typical single-unit marketplace prices for generic modules and vary by seller
- Prices are list/street prices from the linked suppliers at the time the catalog was written; check before ordering.
