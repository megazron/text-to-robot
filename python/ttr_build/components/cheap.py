"""Cheap Arduino-ecosystem parts for the Arduino mode: clone boards, TT gear motor, motor drivers,
ultrasonic sensor, 2S 18650 pack, addressable LED ring.

Prices are typical single-unit marketplace prices for generic modules (late 2026); they vary by seller,
so every price here is listed as uncertain. Dimensions come from the cited product pages; values that
generic boards do not hold to are flagged uncertain as well.

Frames follow the rest of the library: boards as ``shapes.pcb`` (corner at the origin, bottom face
z = 0, holes axis -Z); motors with the output shaft along +Z from the output face at z = 0.
"""
from __future__ import annotations

import math

from .base import Component, Hole, box, cyl, rbox, rpm_to_rad_s, union
from .shapes import pcb, pcb_holes
from .arduino import UNO_HOLES, _uno_build, _uno_keepout, _nano_build, PCA_HOLES, _pca_build
from .motors import d_shaft

SEARCH = "https://www.aliexpress.com/w/wholesale-{}.html"


# ------------------------------------------------------------------------------- clone boards
UNO_CLONE = Component(
    key="arduino_uno_clone", name="Arduino Uno R3 compatible board (ATmega328P, CH340 USB)", category="compute",
    mass_g=25.0, price_usd=6.0, supplier_url=SEARCH.format("arduino-uno-r3-ch340"),
    datasheet_url="https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf",
    envelope_mm=(74.8, 53.3, 12.6), holes=pcb_holes(UNO_HOLES, 3.2, "M3"),
    specs={"voltage_v": 5.0, "input_v": (7, 12), "mcu": "ATmega328P", "pwm_pins": [3, 5, 6, 9, 10, 11],
           "i2c": "A4 SDA, A5 SCL", "usb": "USB-B (CH340 driver)", "fqbn": "arduino:avr:uno",
           "note": "same outline and holes as the Arduino Uno R3; needs the CH340 USB driver on some PCs",
           "uncertain": ["price_usd"]},
    build=_uno_build, build_keepout=_uno_keepout)

NANO_CLONE = Component(
    key="arduino_nano_clone", name="Arduino Nano compatible board (ATmega328P, CH340, USB-C)", category="compute",
    mass_g=7.0, price_usd=3.5, supplier_url=SEARCH.format("arduino-nano-type-c-ch340"),
    datasheet_url="https://docs.arduino.cc/resources/datasheets/A000005-datasheet.pdf",
    envelope_mm=(44.7, 17.8, 14.1), holes=[],
    specs={"voltage_v": 5.0, "input_v": (7, 12), "mcu": "ATmega328P", "pwm_pins": [3, 5, 6, 9, 10, 11],
           "i2c": "A4 SDA, A5 SCL", "usb": "USB-C (CH340)", "fqbn": "arduino:avr:nano:cpu=atmega328",
           "mount": "printed clip around the board edges (header pins below)", "no_mounting_holes": True,
           "uncertain": ["price_usd"]},
    build=_nano_build, build_keepout=lambda c: box(-25.0, -1.5 + 0.01, 4.0, 14.0, 0.0, 8.0))

PCA_CLONE = Component(
    key="pca9685_clone", name="PCA9685 16-channel PWM servo driver board (generic, I2C)", category="motor_driver",
    mass_g=9.0, price_usd=2.5, supplier_url=SEARCH.format("pca9685-16-channel-servo-driver"),
    datasheet_url="https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf",
    envelope_mm=(62.2, 25.4, 10.2), holes=pcb_holes(PCA_HOLES, 2.5, "M2.5"),
    specs={"voltage_v": 5.0, "logic_v": (3.3, 5.0), "servo_v_max": 6.0, "channels": 16, "pwm_bits": 12,
           "i2c_address": "0x40", "library": "Adafruit PWM Servo Driver Library",
           "power": "servo V+ via the screw terminal; add 470-1000 uF across V+/GND",
           "note": "clone of the Adafruit #815 layout", "uncertain": ["price_usd", "hole_positions"],
           "hole_positions": PCA_HOLES},
    build=_pca_build,
    build_keepout=lambda c: union(box(16.0, 46.0, -12.0, 10.0, 9.0, 24.0), box(24.0, 34.5, 17.0, 40.0, 1.57, 20.0)))


# ------------------------------------------------------------------------------- TT gear motor
# Adafruit #3777 "DC Gearbox Motor - TT Motor - 200RPM - 3 to 6VDC": 70 x 22 x 18 mm, 1:48, 30.6 g,
# 0.8 kg.cm stall at 6 V, 200 rpm no-load at 6 V, 150 mA no-load.  Output shaft through the 18 mm
# thickness, double-D both sides; the motor can sits at one end of the gearbox, along +X here.
# through-holes parallel to the shaft; the screw enters from the bottom face (axis = outward, -Z)
TT_HOLES = [Hole((x, 0.0, -18.8), (0.0, 0.0, -1.0), 3.2, "M3") for x in (19.5, 33.0)]


def _tt_motor_build(c):
    gear = rbox(-11.0, 37.5, -11.25, 11.25, -18.8, 0.0, 1.5)
    can = rbox(37.49, 59.0, -10.0, 10.0, -16.9, -1.9, 4.0)          # flattened motor can
    for h in TT_HOLES:
        gear = gear - cyl(3.2, -19.0, 0.2, h.pos[0], h.pos[1])
    shaft_top = d_shaft(5.4, 0.0, 8.8, 3.7)
    shaft_bottom = d_shaft(5.4, -27.6, -18.8 + 0.01, 3.7)
    tabs = union(*[box(59.0 - 0.01, 61.0, y - 1.5, y + 1.5, -12.0, -7.0) for y in (-5.0, 5.0)])
    return union(gear, can, shaft_top, shaft_bottom, tabs)


TT_MOTOR = Component(
    key="tt_gearmotor_1to48", name="TT gear motor 3-6 V, 1:48, 200 rpm (yellow, double-D shaft)", category="actuator",
    mass_g=30.6, price_usd=1.5, supplier_url="https://www.adafruit.com/product/3777",
    datasheet_url="https://www.adafruit.com/product/3777",
    envelope_mm=(72.0, 22.5, 36.4), holes=TT_HOLES,
    specs={"voltage_v": 6.0, "voltage_range_v": (3.0, 6.0), "gear_ratio": 48,
           "stall_torque_kgcm": 0.8, "stall_torque_nm": round(0.8 * 0.0980665, 4),
           "rated_torque_nm": round(0.3 * 0.8 * 0.0980665, 4),
           "no_load_speed_rpm": 200, "no_load_speed_rad_s": rpm_to_rad_s(200),
           "no_load_current_a": 0.15, "stall_current_a": 1.5, "current_a": 1.5, "shaft": "double-D 5.4 x 3.7 mm, both sides",
           "shaft_d_mm": 5.4, "body_mm": {"min": [-11.0, -11.25, -18.8], "max": [61.0, 11.25, 0.0]},
           "driver": "TB6612FNG or L298N (DC motor, PWM + direction)",
           "note": "rated torque taken as 30 % of stall for continuous use; plastic gears",
           "uncertain": ["rated_torque_nm", "stall_current_a", "hole_positions", "price_usd"],
           "hole_positions": [(h.pos[0], h.pos[1]) for h in TT_HOLES]},
    output_frame=((0.0, 0.0, 0.0), (0.0, 0.0, 1.0)), build=_tt_motor_build,
    build_keepout=lambda c: union(cyl(36.0, 0.0, 30.0), box(59.0, 75.0, -8.0, 8.0, -14.0, -5.0)))   # wheel + motor leads


# ------------------------------------------------------------------------------- motor drivers
L298N_HOLES = [(3.0, 3.0), (40.0, 3.0), (3.0, 40.0), (40.0, 40.0)]
L298N = Component(
    key="l298n_module", name="L298N dual H-bridge motor driver module (2 A per channel)", category="motor_driver",
    mass_g=30.0, price_usd=2.5, supplier_url=SEARCH.format("l298n-motor-driver-module"),
    datasheet_url="https://www.st.com/resource/en/datasheet/l298.pdf",
    envelope_mm=(43.0, 43.0, 27.0), holes=pcb_holes(L298N_HOLES, 3.2, "M3"),
    specs={"channels": 2, "current_a": 2.0, "voltage_v": 12.0, "input_v": (5.0, 35.0), "logic": "IN1-IN4 + ENA/ENB PWM, 5 V",
           "voltage_drop_v": 2.0, "regulator": "on-board 78M05 (5 V out when the jumper is fitted and Vin <= 12 V)",
           "note": "bipolar bridge drops about 2 V: a 2S pack (7.4 V) gives TT motors about 5.4 V",
           "uncertain": ["price_usd", "hole_positions", "mass_g"], "hole_positions": L298N_HOLES},
    build=lambda c: pcb(43.0, 43.0, 1.6, L298N_HOLES, 3.2, parts=[(12.0, 31.0, 22.0, 43.0, 25.4),      # heatsink
                                                                    (0.0, 8.0, 12.0, 31.0, 10.0),       # motor A terminal
                                                                    (35.0, 43.0, 12.0, 31.0, 10.0),     # motor B terminal
                                                                    (10.0, 33.0, 0.0, 8.0, 10.0)]),     # power + logic
    build_keepout=lambda c: union(box(-20.0, 0.01, 12.0, 31.0, 1.6, 12.0), box(42.99, 63.0, 12.0, 31.0, 1.6, 12.0),
                                  box(10.0, 33.0, -20.0, 0.01, 1.6, 12.0)))

TB6612 = Component(
    key="tb6612fng_module", name="TB6612FNG dual DC motor driver module (1.2 A per channel)", category="motor_driver",
    mass_g=3.0, price_usd=2.0, supplier_url=SEARCH.format("tb6612fng-motor-driver"),
    datasheet_url="https://toshiba.semicon-storage.com/info/TB6612FNG_datasheet_en_20141001.pdf",
    envelope_mm=(20.3, 20.3, 11.3), holes=[],
    specs={"channels": 2, "current_a": 1.2, "peak_current_a": 3.2, "voltage_v": 7.4, "input_v": (2.5, 13.5),
           "logic": "AIN1/AIN2/PWMA, BIN1/BIN2/PWMB, STBY; 2.7-5.5 V", "voltage_drop_v": 0.5,
           "mount": "plugs into a printed header cradle / breadboard (no screw holes)", "no_mounting_holes": True,
           "note": "MOSFET bridge: far less loss than an L298N; the default driver for TT-motor cars",
           "uncertain": ["price_usd", "envelope_mm"]},
    build=lambda c: pcb(20.3, 20.3, 1.6, [], 0.0, parts=[(6.0, 14.0, 6.0, 14.0, 1.2)],
                        bottom=[(1.0, 19.3, 0.3, 2.84, 8.5), (1.0, 19.3, 17.46, 20.0, 8.5)]))


# ------------------------------------------------------------------------------- sensors and LEDs
SR04_HOLES = [(1.8, 1.8), (43.2, 1.8), (1.8, 18.2), (43.2, 18.2)]


def _sr04_build(c):
    board = pcb(45.0, 20.0, 1.6, SR04_HOLES, 1.8, bottom=[(18.0, 27.0, 0.0, 2.5, 8.5)])   # 4-pin header at the bottom edge
    cans = union(*[cyl(16.0, 1.6 - 0.01, 13.6, x, 10.0) for x in (9.5, 35.5)])
    return union(board, cans)


HC_SR04 = Component(
    key="hc_sr04", name="HC-SR04 ultrasonic distance sensor (2-400 cm)", category="sensor",
    mass_g=8.5, price_usd=1.0, supplier_url=SEARCH.format("hc-sr04"),
    datasheet_url="https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf",
    envelope_mm=(45.0, 20.0, 22.1), holes=pcb_holes(SR04_HOLES, 1.8, "M1.6"),
    specs={"voltage_v": 5.0, "current_ma": 15, "range_cm": (2, 400), "beam_deg": 15, "pins": "VCC, TRIG, ECHO, GND",
           "transducer_d_mm": 16.0, "transducer_pitch_mm": 26.0,
           "mount": "two 16.5 mm holes in a front wall for the transducers, board held by its corner holes",
           "uncertain": ["hole_positions", "price_usd"], "hole_positions": SR04_HOLES},
    build=_sr04_build, build_keepout=lambda c: union(*[cyl(18.0, 13.6, 60.0, x, 10.0) for x in (9.5, 35.5)]))

def _ring_build():
    ring = cyl(37.0, 0.0, 1.6, 18.5, 18.5) - cyl(23.0, -0.1, 1.7, 18.5, 18.5)
    leds = [box(18.5 + 15.0 * math.cos(a) - 2.5, 18.5 + 15.0 * math.cos(a) + 2.5, 18.5 + 15.0 * math.sin(a) - 2.5,
                18.5 + 15.0 * math.sin(a) + 2.5, 1.59, 3.5) for a in (k * math.pi / 6 for k in range(12))]
    return union(ring, *leds)


RING12 = Component(
    key="ws2812_ring_12", name="WS2812B RGB LED ring, 12 LEDs, 37 mm (NeoPixel-compatible)", category="misc",
    mass_g=3.0, price_usd=2.0, supplier_url="https://www.adafruit.com/product/1643",
    datasheet_url="https://cdn-shop.adafruit.com/datasheets/WS2812B.pdf",
    envelope_mm=(37.0, 37.0, 3.5), holes=[],
    specs={"voltage_v": 5.0, "leds": 12, "current_ma_max": 720, "od_mm": 37.0, "id_mm": 23.0, "data": "1 pin, NeoPixel library",
           "mount": "glued or clipped behind a diffuser", "no_mounting_holes": True, "uncertain": ["price_usd"]},
    build=lambda c: _ring_build())


# ------------------------------------------------------------------------------- 2S 18650 pack
def _pack_build(c):
    holder = rbox(0.0, 77.0, -20.5, 20.5, 0.0, 12.0, 2.0) - box(2.0, 75.0, -19.5, 19.5, 1.5, 12.1)   # open-top tray
    for h in c.holes:
        holder = holder - cyl(3.2, -0.1, 1.6, h.pos[0], h.pos[1])
    cells = union(*[box(3.0, 74.0, y - 9.2, y + 9.2, 1.0, 19.4) for y in (-10.0, 10.0)])  # two cells lying in it
    return union(holder, cells)


PACK_2S = Component(
    key="pack_2s_18650", name="2S 18650 pack: two 2500 mAh 20 A cells (Samsung 25R class) in a holder with switch",
    category="battery", mass_g=115.0, price_usd=12.0, supplier_url=SEARCH.format("18650-2-slot-battery-holder-switch"),
    datasheet_url="https://www.dnkpower.com/wp-content/uploads/2019/02/SAMSUNG-INR18650-25R-Datasheet.pdf",
    envelope_mm=(77.0, 41.0, 19.4), holes=[Hole((20.0, 0.0, 0.0), (0.0, 0.0, -1.0), 3.2, "M3"), Hole((57.0, 0.0, 0.0), (0.0, 0.0, -1.0), 3.2, "M3")],
    specs={"cells": 2, "capacity_mah": 2500, "voltage_v": 7.4, "voltage_max_v": 8.4, "energy_wh": 18.5,
           "max_current_a": 20.0, "c_rating": 8, "plug": "JST / bare leads",
           "charge": "remove cells to a 18650 charger, or a 2S balance board",
           "mount": "two M3 countersunk screws through the holder floor",
           "uncertain": ["price_usd", "mass_g", "holes"]},
    build=_pack_build, build_keepout=lambda c: box(-15.0, 0.01, -8.0, 8.0, 4.0, 16.0))


def _breadboard_build(c):
    bb = rbox(0.0, 82.5, 0.0, 54.5, 0.0, 8.5, 1.0)
    for y0 in (6.5, 29.5):                                     # two banks of 5-hole columns
        bb = bb - box(4.0, 78.5, y0, y0 + 18.5, 7.5, 8.6)
    return bb - box(4.0, 78.5, 26.0, 28.5, 4.0, 8.6)           # centre channel (DIP gap)


BREADBOARD = Component(
    key="breadboard_400", name="Half-size solderless breadboard, 400 points, adhesive back", category="misc",
    mass_g=30.0, price_usd=2.0, supplier_url="https://www.adafruit.com/product/64", datasheet_url="https://www.adafruit.com/product/64",
    envelope_mm=(82.5, 54.5, 8.5), holes=[],
    specs={"points": 400, "columns": 30, "mount": "self-adhesive foam back on a flat deck", "no_mounting_holes": True,
           "note": "holds an Arduino Nano and a TB6612FNG module side by side with jumper wires: no soldering",
           "uncertain": ["price_usd", "mass_g"]},
    build=_breadboard_build)

COMPONENTS = [BREADBOARD, UNO_CLONE, NANO_CLONE, PCA_CLONE, TT_MOTOR, L298N, TB6612, HC_SR04, RING12, PACK_2S]
