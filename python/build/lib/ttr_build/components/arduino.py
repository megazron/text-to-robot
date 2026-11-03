"""Electronics for hobby-servo arms: Arduino boards, the PCA9685 servo driver and servo power.

Board frame (as ``shapes.pcb``): board in the XY plane, corner at the origin, bottom
face z = 0, mounting holes on the bottom face with axis -Z (the structure is below).

Sources (measured with scripts/hardware/measure_step.py unless noted):
* PCA9685: Adafruit_CAD_Parts "815 Servo Driver 16 Channel.step" (MIT) — board 62.2 x 25.4,
  holes d2.5 at 55.8 x 19.0, servo headers ~8.5 mm tall, power terminal centred on the top edge.
* LM2596S module: FreeCAD-library LM2596S_Buck_Module_43x21.step (CC-BY 3.0).
* Arduino Uno R3: official board drawing hole coordinates (also in NopSCADlib ArduinoUno3).
* Arduino Nano: FreeCAD-library Nano-Rev3_0.step outline; the Nano is held by a printed clip.
"""
from __future__ import annotations

from .base import Component, box, cyl, union
from .shapes import pcb, pcb_holes
from .supplies import _psu

UNO_HOLES = [(13.97, 2.54), (15.24, 50.8), (66.04, 7.62), (66.04, 35.56)]


def _uno_build(c):
    board = pcb(68.58, 53.34, 1.6, UNO_HOLES, 3.2,
                parts=[(2.0, 66.0, 1.0, 52.0, 2.0),           # components
                       (26.0, 66.0, 50.0, 53.0, 8.5),         # digital header
                       (40.0, 66.0, 0.3, 3.0, 8.5),           # analog / power headers
                       (32.0, 46.0, 21.0, 30.0, 4.0)])        # ATmega328P DIP
    usb = box(-6.2, 10.0, 31.8, 43.8, 1.6, 12.6)              # USB-B overhangs the -X edge
    jack = box(-1.8, 12.0, 3.3, 12.3, 1.6, 12.6)              # 2.1 mm barrel jack
    return union(board, usb, jack)


def _uno_keepout(c):
    return union(box(-30.0, -6.2 + 0.01, 30.0, 45.5, 1.6, 14.0),   # USB-B plug + cable
                 box(-25.0, -1.8 + 0.01, 2.0, 13.5, 1.6, 14.0),    # barrel plug
                 box(24.0, 68.0, 48.0, 56.0, 10.0, 25.0),          # jumper wires into the headers
                 box(38.0, 68.0, -2.0, 6.0, 10.0, 25.0))


UNO_R3 = Component(
    key="arduino_uno_r3", name="Arduino Uno R3 (ATmega328P, 5 V, 16 MHz)", category="compute", mass_g=25.0, price_usd=27.6,
    supplier_url="https://store.arduino.cc/products/arduino-uno-rev3",
    datasheet_url="https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf",
    envelope_mm=(74.8, 53.3, 12.6), holes=pcb_holes(UNO_HOLES, 3.2, "M3"),
    specs={"voltage_v": 5.0, "input_v": (7, 12), "mcu": "ATmega328P", "pwm_pins": [3, 5, 6, 9, 10, 11],
           "i2c": "A4 SDA, A5 SCL", "usb": "USB-B", "fqbn": "arduino:avr:uno",
           "note": "Never power servos from the 5 V pin; feed them through the driver's V+ terminal and join grounds.",
           "hole_source": "Arduino UNO R3 drawing (NopSCADlib ArduinoUno3 agrees)"},
    build=_uno_build, build_keepout=_uno_keepout)


def _nano_build(c):
    board = pcb(43.18, 17.78, 1.6, [], 0.0, parts=[(1.0, 42.0, 1.0, 16.8, 2.0)],
                bottom=[(1.27, 41.9, 0.3, 2.84, 8.5), (1.27, 41.9, 14.94, 17.48, 8.5)])  # header pins below
    usb = box(-1.5, 7.5, 5.4, 12.4, 1.6, 5.6)
    return union(board, usb)


NANO = Component(
    key="arduino_nano_v3", name="Arduino Nano V3 (ATmega328P)", category="compute", mass_g=7.0, price_usd=24.9,
    supplier_url="https://store.arduino.cc/products/arduino-nano",
    datasheet_url="https://docs.arduino.cc/resources/datasheets/A000005-datasheet.pdf",
    envelope_mm=(44.7, 17.8, 14.1), holes=[],
    specs={"voltage_v": 5.0, "input_v": (7, 12), "mcu": "ATmega328P", "pwm_pins": [3, 5, 6, 9, 10, 11],
           "i2c": "A4 SDA, A5 SCL", "usb": "Mini-B (clones: Micro-B / USB-C)", "fqbn": "arduino:avr:nano",
           "mount": "printed clip around the board edges (header pins below)", "no_mounting_holes": True},
    build=_nano_build, build_keepout=lambda c: box(-25.0, -1.5 + 0.01, 4.0, 14.0, 0.0, 8.0))


PCA_HOLES = [(3.21, 3.18), (59.01, 3.18), (3.21, 22.18), (59.01, 22.18)]


def _pca_build(c):
    board = pcb(62.23, 25.4, 1.57, PCA_HOLES, 2.5,
                parts=[(18.0, 44.0, 1.5, 9.5, 8.6),           # 16 x 3-pin servo headers (4 groups)
                       (26.0, 32.5, 18.5, 24.0, 8.0),          # V+ / GND screw terminal
                       (0.5, 3.0, 7.0, 18.5, 8.6), (59.2, 61.7, 7.0, 18.5, 8.6),  # I2C headers both ends
                       (22.0, 40.0, 12.0, 17.0, 1.5)])         # PCA9685 chip
    return board


PCA9685 = Component(
    key="pca9685_16ch", name="Adafruit PCA9685 16-channel 12-bit PWM/servo driver (#815)", category="motor_driver",
    mass_g=9.0, price_usd=14.95, supplier_url="https://www.adafruit.com/product/815",
    datasheet_url="https://learn.adafruit.com/16-channel-pwm-servo-driver",
    envelope_mm=(62.2, 25.4, 10.2), holes=pcb_holes(PCA_HOLES, 2.5, "M2.5"),
    specs={"voltage_v": 5.0, "logic_v": (3.3, 5.0), "servo_v_max": 6.0, "channels": 16, "pwm_bits": 12,
           "i2c_address": "0x40", "library": "Adafruit PWM Servo Driver Library",
           "power": "servo V+ via the screw terminal; add 470-1000 uF across V+/GND",
           "geometry_source": "Adafruit_CAD_Parts 815 (MIT)"},
    build=_pca_build,
    build_keepout=lambda c: union(box(16.0, 46.0, -12.0, 10.0, 9.0, 24.0),     # servo plugs + leads
                                  box(24.0, 34.5, 17.0, 40.0, 1.57, 20.0)))   # wires into the terminal


LM2596_HOLES = [(6.7, 18.6), (35.8, 2.3)]
LM2596 = Component(
    key="buck_lm2596", name="LM2596S adjustable buck module (3 A, 43 x 21 mm)", category="misc", mass_g=12.0, price_usd=3.0,
    supplier_url="https://www.amazon.com/s?k=LM2596S+buck+module",
    datasheet_url="https://www.ti.com/lit/ds/symlink/lm2596.pdf",
    envelope_mm=(43.2, 21.0, 12.6), holes=pcb_holes(LM2596_HOLES, 3.0, "M3"),
    specs={"input_v": (4.5, 40), "output_v": (1.25, 35), "current_a": 3.0, "voltage_v": 5.0,
           "note": "3 A continuous: enough for SG90/MG90S arms, too small for MG996R arms",
           "geometry_source": "FreeCAD-library LM2596S_Buck_Module_43x21.step (CC-BY 3.0)"},
    build=lambda c: pcb(43.2, 21.0, 1.6, LM2596_HOLES, 3.0,
                        parts=[(0.4, 8.4, 6.6, 14.6, 11.0), (34.6, 42.6, 6.1, 14.1, 11.0),   # capacitors
                               (20.0, 34.0, 1.0, 13.0, 6.5), (19.0, 25.0, 15.0, 20.0, 9.0)]),  # inductor, trimmer
    build_keepout=lambda c: box(17.0, 27.0, 13.0, 23.0, 9.0, 20.0))             # trimmer screwdriver access


def _jack_build(c):
    return union(cyl(11.0, -2.0, 0.0), cyl(7.6, -14.0, -1.99), box(-3.0, 3.0, -1.0, 1.0, -18.0, -13.0))


DC_JACK = Component(
    key="dc_jack_5521_panel", name="Panel-mount DC barrel jack 5.5 x 2.1 mm (M8 thread)", category="misc", mass_g=4.0,
    price_usd=1.0, supplier_url="https://www.adafruit.com/product/610",
    datasheet_url="https://www.adafruit.com/product/610", envelope_mm=(11.0, 11.0, 18.0),
    holes=[], specs={"panel_hole_mm": 8.0, "panel_max_mm": 4.0, "current_a": 5.0, "mount": "8 mm hole, nut behind a <=4 mm wall", "no_mounting_holes": True},
    build=_jack_build, build_keepout=lambda c: cyl(16.0, 0.0, 25.0))                # plug + cable in front

ADAPTER_5V4A = Component(
    key="psu_5v4a_adapter", name="5 V 4 A wall adapter, 5.5 x 2.1 mm plug (UL listed)", category="misc", mass_g=180.0,
    price_usd=12.0, supplier_url="https://www.adafruit.com/product/1466", datasheet_url="https://www.adafruit.com/product/1466",
    envelope_mm=(90.0, 50.0, 32.0), holes=[], specs={"voltage_v": 5.0, "current_a": 4.0, "mount": "off-board, cable to the panel jack", "no_mounting_holes": True},
    build=lambda c: box(0.0, 90.0, -25.0, 25.0, 0.0, 32.0), build_keepout=None)

PSU_5V_50 = _psu("psu_5v_lrs50", "Mean Well LRS-50-5 enclosed PSU, 5 V 10 A (50 W)", "LRS-50-5",
                 99.0, 82.0, 30.0, 5.0, 10.0, 230.0, 13.0, (12.0, 87.0), 41.0,
                 ["mass_g", "price_usd", "hole positions (from the LRS-50 outline, not the drawing)"])

COMPONENTS = [UNO_R3, NANO, PCA9685, LM2596, DC_JACK, ADAPTER_5V4A, PSU_5V_50]
