"""Common hobby-kit parts: AA / 9 V / USB power, line and obstacle sensors, ESP32, Arduino Mega and
Raspberry Pi boards, small motor drivers, the MG995 servo, the 28BYJ-48 stepper with its ULN2003 board,
I2C sensors and displays, Bluetooth, PIR and a buzzer.

Prices are typical single-unit marketplace prices (late 2026) and are listed as uncertain. Generic
modules (sensor boards, drivers, breakouts) are made by many sellers: their outlines and hole positions
are typical values and are flagged uncertain as well.

Frames follow the rest of the library: boards as ``shapes.pcb`` (corner at the origin, bottom face
z = 0, holes axis -Z); battery holders lying on their floor (z = 0) with the leads leaving the -X end;
actuators with the output axis +Z through the origin and the body towards -Z.
"""
from __future__ import annotations

from .base import Component, Hole, box, cyl, cyl_between, rbox, rpm_to_rad_s, union
from .hobby import MG996R_G, _servo
from .shapes import pcb, pcb_holes

SEARCH = "https://www.aliexpress.com/w/wholesale-{}.html"
ENERGIZER_APP = "https://data.energizer.com/pdfs/alkaline_appman.pdf"
VISHAY_TCRT = "https://www.vishay.com/docs/83760/tcrt5000.pdf"


def _header_below(x0, y0, n, along="x", rows=1, h=8.5):
    """Male 2.54 mm header pins hanging below the board: plastic 2.5 mm + pins (one block)."""
    L = n * 2.54
    if along == "x":
        return box(x0, x0 + L, y0, y0 + rows * 2.54, -h, 0.01)
    return box(x0, x0 + rows * 2.54, y0, y0 + L, -h, 0.01)


def _right_angle_header(x_edge, y0, n, t=1.6, length=6.0):
    """Right-angle header on the top face at the -X board edge, pins pointing -X."""
    L = n * 2.54
    return union(box(x_edge, x_edge + 2.54, y0, y0 + L, t - 0.01, t + 2.54),
                 box(x_edge - length, x_edge + 0.01, y0 + 0.3, y0 + L - 0.3, t + 0.6, t + 1.9))


# ================================================================ batteries
AA_D, AA_L = 14.5, 50.5      # IEC LR6


def _aa_holder_build(n_cells):
    W = n_cells * (AA_D + 0.8) + 2.6
    L = 58.0

    def build(c):
        tray = rbox(0.0, L, -W / 2, W / 2, 0.0, 15.0, 2.0) - box(1.5, L - 1.5, -W / 2 + 1.3, W / 2 - 1.3, 1.5, 15.1)
        for h in c.holes:
            tray = tray - cyl(3.2, -0.1, 1.6, h.pos[0], h.pos[1])
        pitch = AA_D + 0.8
        ys = [(i - (n_cells - 1) / 2) * pitch for i in range(n_cells)]
        cells = union(*[cyl_between(AA_D, (3.5, y, 1.5 + AA_D / 2), (3.5 + AA_L, y, 1.5 + AA_D / 2)) for y in ys])
        springs = union(*[box(1.49, 3.6, y - 3.0, y + 3.0, 4.0, 12.0) for y in ys])
        return union(tray, cells, springs)
    return build, W, L


def _aa_holes(L):
    return [Hole((x, 0.0, 0.0), (0.0, 0.0, -1.0), 3.2, "M3") for x in (L * 0.3, L * 0.7)]


_aa4_build, AA4_W, AA_HOLDER_L = _aa_holder_build(4)
_aa6_build, AA6_W, _ = _aa_holder_build(6)
_LEADS_KO = lambda c: box(-15.0, 0.01, -8.0, 8.0, 3.0, 13.0)   # noqa: E731  leads + bend radius

HOLDER_4AA = Component(
    key="battery_holder_4aa", name="4 x AA battery holder, flat (one layer), flying leads: 6 V alkaline", category="battery",
    mass_g=105.0, price_usd=1.0, supplier_url=SEARCH.format("4-aa-battery-holder-flat"),
    datasheet_url=ENERGIZER_APP,
    envelope_mm=(58.0, round(AA4_W, 2), 16.0), holes=_aa_holes(AA_HOLDER_L),
    specs={"cells": 4, "chemistry": "alkaline Zn/MnO2 (AA / LR6)", "voltage_v": 6.0, "voltage_max_v": 6.4,
           "voltage_min_v": 4.0, "capacity_mah": 2000, "energy_wh": 10.0, "internal_resistance_ohm_per_cell": 0.2,
           "max_current_a": 2.0, "plug": "bare tinned leads (red +, black -)",
           "note": ("capacity and energy are effective values at a 0.5 A robot load: an AA gives about 2500 mAh at "
                    "0.1 A (Energizer) but closer to 2000 mAh at 0.5 A, at about 1.25 V average, so 4 x 1.25 V x 2.0 Ah "
                    "= 10 Wh. Swap in NiMH cells for 4.8 V / 2000 mAh rechargeable."),
           "mount": "two M3 countersunk screws through the holder floor, or hook-and-loop",
           "uncertain": ["price_usd", "mass_g", "holes", "capacity_mah", "energy_wh"]},
    build=_aa4_build, build_keepout=_LEADS_KO)

HOLDER_6AA = Component(
    key="battery_holder_6aa", name="6 x AA battery holder, flat (one layer), flying leads: 9 V alkaline", category="battery",
    mass_g=155.0, price_usd=1.3, supplier_url=SEARCH.format("6-aa-battery-holder-flat"),
    datasheet_url=ENERGIZER_APP,
    envelope_mm=(58.0, round(AA6_W, 2), 16.0), holes=_aa_holes(AA_HOLDER_L),
    specs={"cells": 6, "chemistry": "alkaline Zn/MnO2 (AA / LR6)", "voltage_v": 9.0, "voltage_max_v": 9.6,
           "voltage_min_v": 6.0, "capacity_mah": 2000, "energy_wh": 15.0, "internal_resistance_ohm_per_cell": 0.2,
           "max_current_a": 2.0, "plug": "bare tinned leads (red +, black -)",
           "note": ("effective capacity at a 0.5 A load (see battery_holder_4aa): 6 x 1.25 V x 2.0 Ah = 15 Wh. "
                    "9 V suits an Arduino VIN or an L298N; fit a buck for 5 V servos."),
           "mount": "two M3 countersunk screws through the holder floor, or hook-and-loop",
           "uncertain": ["price_usd", "mass_g", "holes", "capacity_mah", "energy_wh"]},
    build=_aa6_build, build_keepout=_LEADS_KO)


def _pp3_build(c):
    body = rbox(0.0, 48.5, -13.25, 13.25, 0.0, 17.5, 2.0)
    snap = rbox(48.49, 56.0, -11.0, 11.0, 2.0, 15.5, 1.5)            # snap clip on the terminals
    lead = box(56.0 - 0.01, 60.0, -3.0, 3.0, 7.0, 10.5)
    return union(body, snap, lead)


BATTERY_9V = Component(
    key="battery_9v_pp3", name="9 V PP3 alkaline battery (Energizer 522 class) + snap clip with leads", category="battery",
    mass_g=48.0, price_usd=2.5, supplier_url=SEARCH.format("9v-battery-snap-clip"),
    datasheet_url="https://data.energizer.com/pdfs/522.pdf",
    envelope_mm=(60.0, 26.5, 17.5), holes=[],
    specs={"cells": 6, "chemistry": "alkaline Zn/MnO2 (6LR61)", "voltage_v": 9.0, "voltage_max_v": 9.6,
           "voltage_min_v": 4.8, "capacity_mah": 550, "energy_wh": 4.0, "internal_resistance_ohm": 1.7,
           "internal_resistance_ohm_per_cell": 0.28, "max_current_a": 0.5, "plug": "snap clip, bare leads",
           "note": ("high internal resistance and only about 550 mAh: fine for an Arduino and sensors, too weak for "
                    "motors or servos. Energy 550 mAh x 7.2 V average about 4 Wh."),
           "no_mounting_holes": True, "mount": "printed clip or hook-and-loop strap",
           "uncertain": ["price_usd", "internal_resistance_ohm", "internal_resistance_ohm_per_cell", "capacity_mah", "energy_wh"]},
    build=_pp3_build, build_keepout=lambda c: box(59.99, 75.0, -5.0, 5.0, 5.0, 12.5))


def _powerbank_build(c):
    body = rbox(0.0, 149.0, -34.0, 34.0, 0.0, 14.0, 6.0)
    return body - box(-0.1, 6.0, -6.6, 6.6, 5.0, 9.5)                # USB-A socket opening in the -X end


POWERBANK = Component(
    key="powerbank_5v_2a", name="USB power bank 10000 mAh, 5 V 2.1 A USB-A (Anker 313 / PowerCore 10K class)", category="battery",
    mass_g=213.0, price_usd=22.0, supplier_url="https://www.anker.com/products/a1229",
    datasheet_url="https://www.anker.com/products/a1229",
    envelope_mm=(149.0, 68.0, 14.0), holes=[],
    specs={"cells": 1, "chemistry": "Li-ion 3.6-3.7 V inside, boosted to USB 5 V", "voltage_v": 5.0,
           "voltage_max_v": 5.25, "voltage_min_v": 4.75, "capacity_mah": 10000, "cell_energy_wh": 37.0,
           "energy_wh": 31.0, "max_current_a": 2.1, "output": "USB-A 5 V, 2.1 A (Anker rates up to 2.4 A)",
           "note": ("energy_wh is the 5 V output energy: 10000 mAh x 3.7 V = 37 Wh in the cells, about 85 % reaches the "
                    "USB port. Many banks switch off below about 50-100 mA: a robot that idles needs a small dummy load "
                    "or a bank with an always-on mode."),
           "no_mounting_holes": True, "mount": "hook-and-loop strap or a printed cradle",
           "uncertain": ["price_usd", "energy_wh", "max_current_a"]},
    build=_powerbank_build, build_keepout=lambda c: box(-35.0, 0.01, -8.0, 8.0, 3.0, 11.5))


# ================================================================ line / obstacle sensors
TCRT_HOLES = [(14.0, 7.0)]


def _tcrt_build(c):
    board = pcb(32.0, 14.0, 1.6, TCRT_HOLES, 3.0, parts=[(4.5, 11.0, 3.0, 11.0, 4.5),     # trimmer
                                                         (17.5, 22.5, 3.0, 11.0, 1.6)],   # LM393
                bottom=[(22.0, 32.0, 4.1, 9.9, 7.0)])                                    # TCRT5000 under the far end
    return union(board, _right_angle_header(0.0, 1.92, 4))


TCRT5000 = Component(
    key="tcrt5000_module", name="TCRT5000 IR line-tracking module, LM393 comparator, 4-pin (VCC GND DO AO)", category="sensor",
    mass_g=2.5, price_usd=0.6, supplier_url=SEARCH.format("tcrt5000-line-tracking-module"),
    datasheet_url=VISHAY_TCRT,
    envelope_mm=(38.0, 14.0, 8.6), holes=pcb_holes(TCRT_HOLES, 3.0, "M3"),
    specs={"voltage_v": 5.0, "voltage_range_v": (3.3, 5.0), "current_ma": 20, "detect_mm": (1, 25), "best_mm": 2.5,
           "output": "DO low over a reflective surface (threshold set by the trimmer), AO analogue",
           "pins": "VCC, GND, DO, AO", "mount": "one M3 screw, sensor facing the floor 2-10 mm above it",
           "uncertain": ["price_usd", "hole_positions", "envelope_mm"], "hole_positions": TCRT_HOLES},
    build=_tcrt_build, build_keepout=lambda c: box(22.0, 32.0, 4.1, 9.9, -25.0, -6.99))

LINE3_HOLES = [(4.0, 16.0), (46.0, 16.0)]
LINE3_X = (12.0, 25.0, 38.0)


def _line3_build(c):
    board = pcb(50.0, 20.0, 1.6, LINE3_HOLES, 3.0, parts=[(19.0, 31.0, 13.0, 19.0, 1.6),       # LM339 / LM393s
                                                           (8.0, 12.0, 14.0, 18.0, 4.5)],       # trimmer
                bottom=[(x - 2.9, x + 2.9, 1.0, 11.2, 7.0) for x in LINE3_X])                  # three TCRT5000
    header = box(18.65, 31.35, 17.46, 20.0, 1.59, 10.1)                                         # 5-pin header up
    return union(board, header)


LINE3 = Component(
    key="line_sensor_3ch", name="3-channel TCRT5000 line-tracking board (3-way tracking module, L / C / R)", category="sensor",
    mass_g=6.0, price_usd=2.5, supplier_url=SEARCH.format("3-channel-tcrt5000-line-tracking-module"),
    datasheet_url=VISHAY_TCRT,
    envelope_mm=(50.0, 20.0, 17.1), holes=pcb_holes(LINE3_HOLES, 3.0, "M3"),
    specs={"voltage_v": 5.0, "voltage_range_v": (3.3, 5.0), "current_ma": 60, "channels": 3, "sensor_pitch_mm": 13.0,
           "detect_mm": (1, 25), "output": "L, C, R digital, low over a reflective (white) surface",
           "pins": "VCC, GND, L, C, R", "mount": "two M3 screws, sensors facing the floor 2-10 mm above it",
           "uncertain": ["price_usd", "hole_positions", "envelope_mm", "sensor_pitch_mm"], "hole_positions": LINE3_HOLES},
    build=_line3_build,
    build_keepout=lambda c: union(*[box(x - 2.9, x + 2.9, 1.0, 11.2, -25.0, -6.99) for x in LINE3_X]))

FC51_HOLES = [(14.0, 7.0)]


def _fc51_build(c):
    board = pcb(31.0, 14.0, 1.6, FC51_HOLES, 3.0, parts=[(5.5, 11.5, 3.5, 10.5, 4.5),     # trimmer
                                                         (17.5, 22.5, 3.0, 11.0, 1.6)])   # LM393
    leds = union(*[cyl_between(5.0, (24.0, y, 4.3), (33.5, y, 4.3)) for y in (3.6, 10.4)])  # IR LED + photodiode, along +X
    legs = box(23.0, 26.0, 1.0, 13.0, 1.59, 4.0)
    return union(board, leds, legs, _right_angle_header(0.0, 3.19, 3))


FC51 = Component(
    key="ir_obstacle_fc51", name="FC-51 IR obstacle-avoidance sensor (2-30 cm, LM393, 3-pin)", category="sensor",
    mass_g=3.0, price_usd=0.6, supplier_url=SEARCH.format("fc-51-ir-obstacle-sensor"),
    datasheet_url="https://components101.com/sensors/ir-sensor-module",
    envelope_mm=(39.5, 14.0, 6.8), holes=pcb_holes(FC51_HOLES, 3.0, "M3"),
    specs={"voltage_v": 5.0, "voltage_range_v": (3.3, 5.0), "current_ma": 23, "range_cm": (2, 30), "beam_deg": 35,
           "output": "OUT low when an obstacle reflects the IR beam (range set by the trimmer)",
           "pins": "VCC, GND, OUT", "mount": "one M3 screw, LEDs looking out through a slot in the front wall",
           "note": "range depends on the colour of the obstacle: black absorbs IR and is seen late",
           "uncertain": ["price_usd", "hole_positions", "envelope_mm", "beam_deg"], "hole_positions": FC51_HOLES},
    build=_fc51_build, build_keepout=lambda c: box(33.49, 73.5, 0.0, 14.0, 0.5, 8.5))


# ================================================================ compute boards
def _esp32dk_build(c):
    L, W = 51.5, 28.3
    rows = union(*[_header_below(4.0, y, 15, h=8.5) for y in (W / 2 - 12.7 - 1.27, W / 2 + 12.7 - 1.27)])  # 25.4 mm rows
    board = pcb(L, W, 1.6, [], 0, parts=[
        (L - 18.0, L + 1.2, 4.15, 22.15, 3.1),   # ESP32-WROOM-32 module (antenna overhangs the far end)
        (-1.5, 4.5, 10.4, 17.9, 2.8),            # micro-USB
        (6.0, 11.0, 11.0, 17.0, 1.5),            # CP2102 USB-UART
        (12.0, 18.0, 3.0, 9.0, 1.8),             # AMS1117 regulator
        (6.0, 9.5, 2.5, 6.0, 1.5), (6.0, 9.5, 22.3, 25.8, 1.5),   # EN / BOOT buttons
    ], r=0.8)
    return union(board, rows)


ESP32_DEVKIT_V1 = Component(
    key="esp32_devkit_v1", name="ESP32 DevKit V1 30-pin (DOIT layout, ESP32-WROOM-32, CP2102, micro-USB)", category="compute",
    mass_g=9.0, price_usd=5.0, supplier_url=SEARCH.format("esp32-devkit-v1-30-pin"),
    datasheet_url="https://documentation.espressif.com/esp32-wroom-32_datasheet_en.pdf",
    envelope_mm=(54.2, 28.3, 13.2), holes=[],
    specs={"board_mm": (51.5, 28.3), "header_rows": 2, "pins_per_row": 15, "pitch_mm": 2.54, "row_spacing_mm": 25.4,
           "voltage_v": 3.3, "input_v": (4.5, 12), "mcu": "ESP32-D0WD (dual core 240 MHz, Wi-Fi + Bluetooth)",
           "pwm_pins": [2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
           "input_only_pins": [34, 35, 36, 39], "i2c": "GPIO21 SDA, GPIO22 SCL", "usb": "micro-USB (CP2102 or CH340)",
           "fqbn": "esp32:esp32:esp32doit-devkit-v1",
           "regulator": "AMS1117-3.3 from VIN: 4.5 V minimum (1.1 V dropout), 12 V is a sensible top (the regulator heats up)",
           "note": "3.3 V logic, not 5 V tolerant. 25.4 mm row spacing leaves no free breadboard row: use two breadboards or sockets.",
           "no_mounting_holes": True,
           "mount": "no screw holes: plug into 2x15 female headers or a printed slot clamping the board edges",
           "uncertain": ["mass_g", "price_usd", "board_mm"]},
    build=_esp32dk_build)

MEGA_HOLES = [(13.97, 2.54), (15.24, 50.8), (66.04, 7.62), (66.04, 35.56), (90.17, 50.8), (96.52, 2.54)]


def _mega_build(c):
    return pcb(101.6, 53.3, 1.6, MEGA_HOLES, 3.2, parts=[
        (-6.2, 9.8, 31.7, 43.7, 11.0),       # USB-B (overhangs the edge)
        (-1.8, 12.4, 3.3, 12.3, 11.0),       # DC jack
        (17.0, 63.0, 50.8, 53.3, 8.5),       # digital header (top edge)
        (27.0, 92.0, 0.0, 2.5, 8.5),         # power + analog headers (bottom edge)
        (93.4, 98.5, 6.0, 49.0, 8.5),        # 2x18 double header D22-D53
        (40.0, 54.0, 18.0, 32.0, 1.4),       # ATmega2560 TQFP
        (20.0, 26.0, 30.0, 36.0, 1.6),       # CH340
    ], r=0.5)


def _mega_keepout(c):
    return union(box(-30.0, -6.19, 31.7, 43.7, 1.6, 12.6),    # USB plug
                 box(-30.0, -1.79, 3.3, 12.3, 1.6, 12.6),     # barrel plug
                 box(17.0, 99.0, -2.0, 53.3, 10.09, 24.0))    # jumper wires / shield above the headers


MEGA_CLONE = Component(
    key="arduino_mega_clone", name="Arduino Mega 2560 R3 compatible board (ATmega2560, CH340 USB)", category="compute",
    mass_g=37.0, price_usd=14.0, supplier_url=SEARCH.format("arduino-mega-2560-r3-ch340"),
    datasheet_url="https://docs.arduino.cc/resources/datasheets/A000067-datasheet.pdf",
    envelope_mm=(107.8, 53.3, 12.6), holes=pcb_holes(MEGA_HOLES, 3.2, "M3"),
    specs={"board_mm": (101.6, 53.3), "voltage_v": 5.0, "input_v": (7, 12), "mcu": "ATmega2560",
           "pwm_pins": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 44, 45, 46], "analog_pins": 16,
           "i2c": "D20 SDA, D21 SCL (also the SDA/SCL pins by AREF)", "uarts": "D0/D1, D19/D18, D17/D16, D15/D14",
           "spi": "D50 MISO, D51 MOSI, D52 SCK, D53 SS", "usb": "USB-B (CH340 driver)", "fqbn": "arduino:avr:mega:cpu=atmega2560",
           "note": "same outline and holes as the Arduino Mega 2560 R3; the four Uno holes are shared, so Uno shields fit",
           "uncertain": ["price_usd", "mass_g", "hole_positions"], "hole_positions": MEGA_HOLES},
    build=_mega_build, build_keepout=_mega_keepout)

PI_HOLES = [(3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5)]
PI4_PARTS = [
    (7.6, 14.8, -1.2, 6.3, 3.3),     # USB-C power
    (22.25, 29.75, -1.0, 6.5, 3.6),  # micro-HDMI 0
    (35.75, 43.25, -1.0, 6.5, 3.6),  # micro-HDMI 1
    (50.5, 57.5, -2.5, 12.0, 6.0),   # 3.5 mm AV jack
    (69.0, 87.0, 1.5, 16.5, 16.0),   # USB 2 stack
    (69.0, 87.0, 19.5, 34.5, 16.0),  # USB 3 stack
    (64.0, 87.0, 37.75, 53.75, 13.5),  # Ethernet
    (7.1, 57.9, 50.0, 55.0, 8.5),    # 40-pin GPIO header
    (25.0, 40.0, 25.0, 40.0, 2.4),   # BCM2711 SoC
    (43.0, 48.0, 8.5, 26.5, 5.5),    # CSI camera connector
]


def _pi4_build(c):
    return pcb(85.0, 56.0, 1.6, PI_HOLES, 2.7, parts=PI4_PARTS, bottom=[(1.5, 13.5, 22.0, 34.0, 1.5)], r=3.0)


def _pi4_keepout(c):
    return union(box(87.0 - 0.01, 112.0, 1.5, 53.75, 1.6, 18.0),       # USB / RJ45 plugs
                 box(5.0, 58.0, -21.2, -1.2 + 0.01, 1.0, 7.5),          # USB-C / HDMI / audio plugs
                 box(7.1, 57.9, 50.0, 55.0, 10.1 - 0.01, 22.0),         # GPIO ribbon / HAT
                 box(43.0, 48.0, 8.5, 26.5, 7.09, 20.0),                # camera ribbon
                 box(-15.0, 1.5 + 0.01, 22.0, 34.0, -1.5, 0.0))         # microSD card removal


RPI4 = Component(
    key="rpi4_4gb", name="Raspberry Pi 4 Model B (4 GB)", category="compute", mass_g=46.0, price_usd=55.0,
    supplier_url="https://www.raspberrypi.com/products/raspberry-pi-4-model-b/",
    datasheet_url="https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-mechanical-drawing.pdf",
    envelope_mm=(87.0, 58.5, 19.1), holes=pcb_holes(PI_HOLES, 2.7, "M2.5"),
    specs={"board_mm": (85.0, 56.0), "hole_pattern_mm": (58.0, 49.0), "hole_dia_mm": 2.7,
           "voltage_v": 5.0, "current_a": 3.0, "power": "USB-C 5 V / 3 A",
           "price_note": "Raspberry Pi list price, 4 GB",
           "uncertain": ["mass_g", "usb_stack_height_mm"], "usb_stack_height_mm": 16.0},
    build=_pi4_build, build_keepout=_pi4_keepout)

PIZ_HOLES = [(3.5, 3.5), (61.5, 3.5), (3.5, 26.5), (61.5, 26.5)]


def _piz_build(c):
    return pcb(65.0, 30.0, 1.0, PIZ_HOLES, 2.75, parts=[
        (8.6, 19.8, -0.5, 7.0, 3.2),     # mini HDMI
        (37.7, 45.7, -1.0, 5.0, 2.6),    # micro-USB data (OTG)
        (50.4, 58.4, -1.0, 5.0, 2.6),    # micro-USB power
        (22.0, 36.0, 8.0, 22.0, 1.4),    # RP3A0 SiP
        (60.0, 65.5, 6.0, 24.0, 1.2),    # mini CSI connector
    ], bottom=[(1.0, 14.0, 9.0, 21.0, 1.4)], r=3.0)                    # microSD under the board


def _piz_keepout(c):
    return union(box(8.0, 59.0, -21.0, -1.0 + 0.01, 0.0, 6.0),           # HDMI / USB plugs
                 box(65.49, 80.0, 6.0, 24.0, 1.0, 2.2),                 # camera ribbon
                 box(7.1, 57.9, 24.5, 29.5, 0.99, 12.0),                # 40-pin header area (fit a header)
                 box(-15.0, 1.0 + 0.01, 9.0, 21.0, -1.4, 0.0))          # microSD card removal


RPI_ZERO_2W = Component(
    key="rpi_zero_2w", name="Raspberry Pi Zero 2 W (RP3A0, 512 MB, Wi-Fi + Bluetooth)", category="compute",
    mass_g=11.0, price_usd=15.0, supplier_url="https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/",
    datasheet_url="https://datasheets.raspberrypi.com/rpizero2/raspberry-pi-zero-2-w-mechanical-drawing.pdf",
    envelope_mm=(65.5, 31.0, 4.0), holes=pcb_holes(PIZ_HOLES, 2.75, "M2.5"),
    specs={"board_mm": (65.0, 30.0), "hole_pattern_mm": (58.0, 23.0), "hole_dia_mm": 2.75,
           "voltage_v": 5.0, "current_a": 2.5, "power": "micro-USB 5 V / 2.5 A",
           "gpio_header": "40-pin footprint, header not fitted (solder one, or buy the Zero 2 WH)",
           "uncertain": ["mass_g"]},
    build=_piz_build, build_keepout=_piz_keepout)


def _esp32cam_build(c):
    L, W = 40.5, 27.0
    board = pcb(L, W, 1.0, [], 0, parts=[
        (2.0, 11.0, 5.0, 22.0, 2.6),         # microSD socket
        (17.0, 25.0, 9.5, 17.5, 5.0),        # OV2640 lens holder (on its flex)
        (30.0, 35.0, 1.0, 6.0, 1.0),         # flash LED
    ], bottom=[(4.0, 24.32, 0.0, 2.54, 8.5), (4.0, 24.32, W - 2.54, W, 8.5),   # 2 x 8 header pins
               (21.0, 39.5, 6.0, 21.0, 3.2)], r=0.5)                           # ESP32-S module + shield
    return board


ESP32_CAM = Component(
    key="esp32_cam", name="AI-Thinker ESP32-CAM (ESP32-S, OV2640 camera, microSD)", category="compute",
    mass_g=10.0, price_usd=7.0, supplier_url=SEARCH.format("esp32-cam-ov2640"),
    datasheet_url="https://docs.ai-thinker.com/en/esp32-cam",
    envelope_mm=(40.5, 27.0, 14.5), holes=[],
    specs={"board_mm": (40.5, 27.0), "voltage_v": 5.0, "input_v": (4.75, 5.25), "camera": "OV2640 2 MP",
           "fqbn": "esp32:esp32:esp32cam", "pwm_pins": [2, 4, 12, 13, 14, 15],
           "programming": "no USB: a 3.3 V USB-UART adapter (or the ESP32-CAM-MB board), GPIO0 to GND to flash",
           "note": "GPIO4 drives the flash LED; GPIO2/4/12-15 share the microSD bus (1-bit SD mode frees GPIO4, 12, 13)",
           "no_mounting_holes": True, "mount": "plug into 2x8 female headers or a printed slot; lens looks out of +Z",
           "uncertain": ["mass_g", "price_usd"]},
    build=_esp32cam_build, build_keepout=lambda c: box(17.0, 25.0, 9.5, 17.5, 5.99, 30.0))


# ================================================================ motor drivers
def _drv8833_build(c):
    return pcb(18.5, 16.5, 1.6, [], 0.0, parts=[(6.0, 12.5, 5.5, 11.0, 1.2)],
               bottom=[(1.5, 16.74, 0.3, 2.84, 8.5), (1.5, 16.74, 13.66, 16.2, 8.5)])


DRV8833 = Component(
    key="drv8833_module", name="DRV8833 dual H-bridge motor driver module (purple board, 1.5 A per channel)", category="motor_driver",
    mass_g=2.0, price_usd=1.5, supplier_url=SEARCH.format("drv8833-motor-driver-module"),
    datasheet_url="https://www.ti.com/lit/ds/symlink/drv8833.pdf",
    envelope_mm=(18.5, 16.5, 11.3), holes=[],
    specs={"channels": 2, "current_a": 1.5, "peak_current_a": 2.0, "voltage_v": 7.4, "input_v": (2.7, 10.8),
           "logic": "AIN1/AIN2, BIN1/BIN2 (PWM on either input), EEP = nSLEEP; 3.3 V or 5 V", "rds_on_ohm": 0.36,
           "voltage_drop_v": 0.36, "voltage_drop_note": "HS + LS Rds(on) 360 mOhm typical: 0.36 V at 1 A, 0.54 V at 1.5 A",
           "mount": "plugs into a printed header cradle / breadboard (no screw holes)", "no_mounting_holes": True,
           "note": "MOSFET bridge like the TB6612FNG but no separate PWM pin: drive IN1/IN2 with PWM. 10.8 V max: not for 3S packs.",
           "uncertain": ["price_usd", "envelope_mm", "mass_g"]},
    build=_drv8833_build)

L9110_HOLES = [(18.5, 2.5), (18.5, 20.5)]


def _l9110_build(c):
    return pcb(29.2, 23.0, 1.6, L9110_HOLES, 3.0, parts=[
        (22.0, 29.2, 1.5, 10.5, 10.0), (22.0, 29.2, 12.5, 21.5, 10.0),    # two 2-pin screw terminals
        (11.0, 16.0, 3.0, 9.0, 1.6), (11.0, 16.0, 14.0, 20.0, 1.6),       # two L9110 SOP8
    ], bottom=[(0.3, 2.84, 3.88, 19.12, 8.5)])                             # 6-pin header


L9110S = Component(
    key="l9110s_module", name="L9110S dual DC motor driver module (0.8 A per channel, 2.5-12 V)", category="motor_driver",
    mass_g=5.0, price_usd=1.0, supplier_url=SEARCH.format("l9110s-motor-driver-module"),
    datasheet_url="https://www.elecrow.com/download/datasheet-l9110.pdf",
    envelope_mm=(29.2, 23.0, 11.6), holes=pcb_holes(L9110_HOLES, 3.0, "M3"),
    specs={"channels": 2, "current_a": 0.8, "peak_current_a": 1.5, "voltage_v": 6.0, "input_v": (2.5, 12.0),
           "logic": "A-1A/A-1B, B-1A/B-1B: PWM one input, hold the other low (or high for reverse)",
           "voltage_drop_v": 1.85, "voltage_drop_note": "at 9 V / 750 mA the datasheet gives VHout 7.6 V and VLout 0.45 V: 1.85 V lost",
           "note": "cheap driver for TT motors on 4 x AA; drops more than a TB6612FNG or DRV8833",
           "uncertain": ["price_usd", "hole_positions", "envelope_mm", "mass_g"], "hole_positions": L9110_HOLES},
    build=_l9110_build,
    build_keepout=lambda c: box(29.19, 45.0, 1.5, 21.5, 1.6, 9.0))          # motor wires into the terminals

ULN_HOLES = [(2.75, 2.75), (32.25, 2.75), (2.75, 29.25), (32.25, 29.25)]


def _uln_build(c):
    return pcb(35.0, 32.0, 1.6, ULN_HOLES, 3.0, parts=[
        (8.0, 27.0, 11.0, 17.5, 4.5),         # ULN2003 DIP16
        (11.25, 23.75, 24.5, 30.3, 7.0),      # 5-pin JST XH motor socket
        (6.0, 26.0, 3.5, 7.0, 3.0),           # 4 LEDs A-D
        (0.5, 3.04, 10.0, 20.16, 8.5),        # IN1-IN4 header (up)
        (31.96, 34.5, 12.5, 17.58, 8.5),      # power header (- +) and jumper
    ])


ULN2003 = Component(
    key="uln2003_module", name="ULN2003 stepper driver board for 28BYJ-48 (5-pin socket, LEDs A-D)", category="motor_driver",
    mass_g=8.0, price_usd=1.0, supplier_url=SEARCH.format("uln2003-stepper-driver-board"),
    datasheet_url="https://www.ti.com/lit/ds/symlink/uln2003a.pdf",
    envelope_mm=(35.0, 32.0, 10.1), holes=pcb_holes(ULN_HOLES, 3.0, "M3"),
    specs={"channels": 4, "current_a": 0.5, "voltage_v": 5.0, "input_v": (5.0, 12.0),
           "logic": "IN1-IN4, high = coil on; 3.3 V and 5 V hosts", "voltage_drop_v": 0.9,
           "voltage_drop_note": "Darlington VCE(sat) about 0.9 V at 100 mA (TI)",
           "note": "unipolar driver: VCC goes to the motor's red COM wire, each output sinks one coil",
           "uncertain": ["price_usd", "hole_positions", "envelope_mm"], "hole_positions": ULN_HOLES},
    build=_uln_build, build_keepout=lambda c: box(11.25, 23.75, 24.5, 45.0, 8.59, 14.0))   # motor plug + cable


# ================================================================ actuators
MG995 = _servo(
    "hobby_mg995", "TowerPro MG995 standard servo (metal gears) + round horn", MG996R_G,
    volts=(4.8, 6.0), torque_kgcm={4.8: 8.5, 6.0: 10.0}, speed_s60={4.8: 0.20, 6.0: 0.16}, stall_a=1.5, idle_ma=10,
    mass=55.0, price=5.0, pulse=(500, 2500), range_deg=180, deadband_us=5, gears="metal", spline="25T, 5.9 mm",
    supplier="https://www.towerpro.com.tw/product/mg995-robot-servo-180-rotation/",
    datasheet="https://www.electronicoscaldas.com/datasheet/MG995_Tower-Pro.pdf",
    source="same case and tabs as hobby_mg996r (40.7 x 19.7 x 42.9 mm, identical outline)", case_screw="M3 (or M2.5) through tabs",
    uncertain=["stall_current_a (no primary source; 1.2-1.5 A is the commonly measured value)",
               "range_deg (the datasheet says about 120 deg at standard pulses; 500-2500 us gives about 180)",
               "output_offset_mm (from the Futaba S3003 model)"],
    note="Older sibling of the MG996R, same body: swap freely. TowerPro's current page lists 9.4 / 11 kg.cm (the MG996R figures).")

BYJ_HOLES = [Hole((-8.0, y, 0.0), (0.0, 0.0, 1.0), 4.2, "M4") for y in (17.5, -17.5)]


def _byj_build(c):
    body = cyl(28.0, -19.0, -0.99, -8.0, 0.0)
    ears = union(box(-11.5, -4.5, -17.5, 17.5, -1.0, 0.0), cyl(7.0, -1.0, 0.0, -8.0, 17.5), cyl(7.0, -1.0, 0.0, -8.0, -17.5),
                 cyl(28.0, -1.0, 0.0, -8.0, 0.0))
    for h in BYJ_HOLES:
        ears = ears - cyl(4.2, -1.1, 0.1, h.pos[0], h.pos[1])
    cover = box(-25.0, -18.0, -8.5, 8.5, -19.0, -2.5)                  # blue wire cover on the -X side
    boss = cyl(9.0, -0.01, 1.5)
    shaft = cyl(5.0, 1.49, 10.0) - box(1.5, 3.0, -3.0, 3.0, 4.0, 10.1) - box(-3.0, -1.5, -3.0, 3.0, 4.0, 10.1)  # two flats, 3 mm across
    lead = box(-29.0, -24.99, -3.0, 3.0, -12.0, -8.0)
    return union(body, ears, cover, boss, shaft, lead)


STEPPER_28BYJ48 = Component(
    key="stepper_28byj48", name="28BYJ-48 5 V unipolar geared stepper (1:64, 5-wire JST XH)", category="actuator",
    mass_g=30.0, price_usd=1.5, supplier_url=SEARCH.format("28byj-48-uln2003"),
    datasheet_url="https://components101.com/sites/default/files/component_datasheet/28byj48-step-motor-datasheet.pdf",
    envelope_mm=(35.0, 42.0, 29.0), holes=BYJ_HOLES,
    specs={"voltage_v": 5.0, "gear_ratio": 64, "gear_ratio_exact": 63.684, "phases": 4, "stride_angle_deg": 5.625 / 64,
           "steps_per_rev_half_step": 4096, "coil_resistance_ohm": 50.0,
           "stall_torque_nm": 0.0343, "peak_torque_nm": 0.0343, "rated_torque_nm": 0.0294,
           "no_load_speed_rpm": 15, "no_load_speed_rad_s": rpm_to_rad_s(15),
           "current_a": 0.24, "phase_current_a": 0.1, "shaft_d_mm": 5.0, "shaft_flats_mm": 3.0, "shaft_length_mm": 8.5,
           "shaft_offset_mm": 8.0, "hole_spacing_mm": 35.0,
           "body_mm": {"min": [-25.0, -21.0, -19.0], "max": [6.0, 21.0, 10.0]},
           "driver": "uln2003_module (IN1-IN4 from four GPIOs; Arduino Stepper library order IN1, IN3, IN2, IN4)",
           "connector": "5-pin JST XH: blue A, pink B, yellow C, orange D, red COM (+5 V)",
           "note": ("torque: self-positioning and in-traction torque > 34.3 mN.m, pull-in 300 gf.cm (0.029 N.m, used as "
                    "rated). Speed: about 15 rpm is the practical top at 5 V (1000 Hz half steps); the gear train has "
                    "about 1 deg of backlash."),
           "uncertain": ["no_load_speed_rad_s", "mass_g", "price_usd", "current_a"]},
    output_frame=((0.0, 0.0, 0.0), (0.0, 0.0, 1.0)), build=_byj_build,
    build_keepout=lambda c: union(cyl(14.0, 0.0, 12.0), box(-45.0, -28.99, -5.0, 5.0, -14.0, -6.0)))   # coupling + lead


# ================================================================ I2C sensors, display, radio, PIR, buzzer
GY521_HOLES = [(2.5, 13.5), (18.5, 13.5)]


def _gy521_build(c):
    return pcb(21.0, 16.0, 1.6, GY521_HOLES, 3.0, parts=[(8.0, 12.0, 6.0, 10.0, 0.9), (3.0, 6.0, 5.0, 8.0, 1.2)],
               bottom=[(0.34, 20.66, 0.0, 2.54, 8.5)])


MPU6050 = Component(
    key="mpu6050_gy521", name="GY-521 MPU-6050 6-axis IMU breakout (I2C, 3-5 V)", category="sensor",
    mass_g=2.0, price_usd=1.5, supplier_url=SEARCH.format("gy-521-mpu6050"),
    datasheet_url="https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Datasheet1.pdf",
    envelope_mm=(21.0, 16.0, 11.1), holes=pcb_holes(GY521_HOLES, 3.0, "M3"),
    specs={"voltage_v": 5.0, "voltage_range_v": (3.3, 5.0), "current_ma": 5, "interface": "I2C, 400 kHz",
           "i2c_address": "0x68 (AD0 low) / 0x69 (AD0 high)", "gyro_dps": 2000, "accel_g": 16,
           "pins": "VCC, GND, SCL, SDA, XDA, XCL, AD0, INT",
           "note": "on-board 3.3 V regulator and 4.7k pull-ups to 3.3 V; no magnetometer, so yaw drifts",
           "uncertain": ["price_usd", "hole_positions", "envelope_mm"], "hole_positions": GY521_HOLES},
    build=_gy521_build)

VL53_HOLES = [(2.5, 5.35), (22.5, 5.35)]


def _vl53_build(c):
    return pcb(25.0, 10.7, 1.6, VL53_HOLES, 2.2, parts=[(10.3, 14.7, 6.5, 8.9, 1.0), (6.0, 9.0, 6.0, 9.0, 1.0)],
               bottom=[(4.88, 20.12, 0.0, 2.54, 8.5)])


VL53L0X = Component(
    key="vl53l0x_breakout", name="VL53L0X time-of-flight distance breakout (GY-530, I2C, up to 2 m)", category="sensor",
    mass_g=1.5, price_usd=2.5, supplier_url=SEARCH.format("gy-530-vl53l0x"),
    datasheet_url="https://www.pololu.com/file/0J1187/VL53L0X.pdf",
    envelope_mm=(25.0, 10.7, 11.1), holes=pcb_holes(VL53_HOLES, 2.2, "M2"),
    specs={"voltage_v": 5.0, "voltage_range_v": (2.8, 5.0), "current_ma": 19, "range_mm": (30, 2000), "fov_deg": 25,
           "interface": "I2C, address 0x29 (changeable in software; hold the others in XSHUT to set each)",
           "pins": "VIN, GND, SCL, SDA, GPIO1, XSHUT",
           "mount": "two M2 screws, sensor looking out through a 6 mm window (no cover glass, or an IR-clear one)",
           "uncertain": ["price_usd", "hole_positions", "envelope_mm", "voltage_range_v"], "hole_positions": VL53_HOLES},
    build=_vl53_build, build_keepout=lambda c: union(box(10.3, 14.7, 6.5, 8.9, 2.59, 4.0), cyl(14.0, 3.99, 25.0, 12.5, 7.7)))

OLED_HOLES = [(2.0, 2.0), (25.3, 2.0), (2.0, 25.8), (25.3, 25.8)]


def _oled_build(c):
    return pcb(27.3, 27.8, 1.2, OLED_HOLES, 2.0, parts=[(0.3, 27.0, 5.0, 24.0, 1.5)],
               bottom=[(8.57, 18.73, 25.26, 27.8, 8.5)])


OLED = Component(
    key="oled_ssd1306_128x64", name="0.96 in OLED display 128x64 (SSD1306, I2C, 4-pin)", category="sensor",
    mass_g=3.0, price_usd=2.5, supplier_url=SEARCH.format("0.96-oled-128x64-i2c-ssd1306"),
    datasheet_url="https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf",
    envelope_mm=(27.3, 27.8, 11.2), holes=pcb_holes(OLED_HOLES, 2.0, "M2"),
    specs={"resolution": (128, 64), "active_area_mm": (21.7, 10.9), "voltage_v": 5.0, "voltage_range_v": (3.3, 5.0),
           "current_ma": 20, "interface": "I2C, address 0x3C (0x3D by a resistor)", "library": "Adafruit SSD1306 / U8g2",
           "role": "status display (face, eyes or readout)", "pins": "GND, VCC, SCL, SDA",
           "uncertain": ["mass_g", "hole_positions", "envelope_mm", "price_usd"], "hole_positions": OLED_HOLES},
    build=_oled_build, build_keepout=lambda c: box(2.0, 25.3, 7.0, 22.0, 2.69, 8.0))


def _hc05_build(c):
    board = pcb(37.3, 15.5, 1.6, [], 0.0, parts=[(8.0, 35.0, 1.25, 14.25, 2.2), (2.0, 6.0, 5.0, 10.0, 1.5)])
    header = box(-6.0, 0.01, 0.13, 15.37, 0.2, 2.6)                     # 6 straight pins out of the short edge
    return union(board, header)


HC05 = Component(
    key="hc05_bluetooth", name="HC-05 Bluetooth 2.0 serial module on a ZS-040 breakout (6-pin)", category="sensor",
    mass_g=3.5, price_usd=3.5, supplier_url=SEARCH.format("hc-05-bluetooth-module"),
    datasheet_url="https://components101.com/sites/default/files/component_datasheet/HC-05%20Datasheet.pdf",
    envelope_mm=(43.3, 15.5, 3.8), holes=[],
    specs={"voltage_v": 5.0, "voltage_range_v": (3.6, 6.0), "current_ma": 30, "interface": "UART, 9600 baud in data mode",
           "role": "radio (Bluetooth SPP link to a phone or PC)", "range_m": 10,
           "pins": "STATE, RXD, TXD, GND, VCC, EN",
           "note": "RXD is 3.3 V logic: from a 5 V board use a divider (1k / 2k) on the board's TX line. AT mode (38400 baud) with EN high.",
           "no_mounting_holes": True, "mount": "heat-shrink or a printed clip; keep metal and wires off the antenna end",
           "uncertain": ["price_usd", "envelope_mm", "mass_g"]},
    build=_hc05_build, build_keepout=lambda c: box(26.0, 37.3, 0.0, 15.5, 3.79, 10.0))

PIR_HOLES = [(2.1, 12.15), (30.1, 12.15)]


def _pir_build(c):
    board = pcb(32.2, 24.3, 1.6, PIR_HOLES, 2.0, parts=[], bottom=[(10.0, 22.0, 3.0, 9.0, 3.0), (5.0, 10.0, 15.0, 21.0, 6.0),
                                                                  (22.0, 27.0, 15.0, 21.0, 6.0), (12.29, 19.91, 19.0, 21.54, 8.5)])
    lens_base = box(4.6, 27.6, 0.65, 23.65, 1.59, 4.0)
    dome = cyl(23.0, 3.99, 13.5, 16.1, 12.15)
    return union(board, lens_base, dome)


PIR = Component(
    key="pir_hc_sr501", name="HC-SR501 PIR motion sensor (4.5-20 V, 3.3 V output, Fresnel dome)", category="sensor",
    mass_g=7.0, price_usd=1.2, supplier_url=SEARCH.format("hc-sr501-pir"),
    datasheet_url="https://cdn-learn.adafruit.com/downloads/pdf/pir-passive-infrared-proximity-motion-sensor.pdf",
    envelope_mm=(32.2, 24.3, 22.0), holes=pcb_holes(PIR_HOLES, 2.0, "M2"),
    specs={"voltage_v": 5.0, "voltage_range_v": (4.5, 20.0), "current_ma": 0.065, "range_m": 7, "fov_deg": 110,
           "output": "OUT 3.3 V high for 0.5-200 s (delay trimmer) after motion; jumper H = retrigger",
           "pins": "VCC, OUT, GND", "warmup_s": 60,
           "mount": "two M2 screws, dome through a 23 mm hole in the shell",
           "uncertain": ["price_usd", "hole_positions", "current_ma", "fov_deg"], "hole_positions": PIR_HOLES},
    build=_pir_build, build_keepout=lambda c: cyl(40.0, 13.49, 40.0, 16.1, 12.15))

BUZZER_HOLES = [(8.5, 6.5)]


def _buzzer_build(c):
    board = pcb(32.0, 13.0, 1.6, BUZZER_HOLES, 3.0, parts=[(13.0, 17.0, 3.0, 10.0, 1.5)])
    can = cyl(12.0, 1.59, 11.1, 23.5, 6.5)
    return union(board, can, _right_angle_header(0.0, 2.69, 3))


BUZZER = Component(
    key="buzzer_active_5v", name="Active buzzer module 5 V (3-pin VCC I/O GND, transistor driver)", category="misc",
    mass_g=3.0, price_usd=0.6, supplier_url=SEARCH.format("active-buzzer-module-3-pin"),
    datasheet_url="https://components101.com/misc/buzzer-pinout-working-datasheet",
    envelope_mm=(38.0, 13.0, 11.1), holes=pcb_holes(BUZZER_HOLES, 3.0, "M3"),
    specs={"voltage_v": 5.0, "voltage_range_v": (3.3, 5.0), "current_ma": 30, "tone_hz": 2300, "sound_db": 85,
           "control": "I/O low = sound on most boards (PNP S8550 driver); some are active high",
           "pins": "VCC, I/O, GND", "mount": "one M3 screw, sound hole behind a few 2 mm holes in the shell",
           "uncertain": ["price_usd", "hole_positions", "tone_hz", "sound_db"], "hole_positions": BUZZER_HOLES},
    build=_buzzer_build)

def _fit(c):
    lo, hi = c.bbox()
    c.envelope_mm = tuple(round(b - a, 2) for a, b in zip(lo, hi))
    return c


COMPONENTS = [HOLDER_4AA, HOLDER_6AA, BATTERY_9V, POWERBANK, TCRT5000, LINE3, FC51, ESP32_DEVKIT_V1, MEGA_CLONE, RPI4,
              RPI_ZERO_2W, ESP32_CAM, DRV8833, L9110S, ULN2003, MG995, STEPPER_28BYJ48, MPU6050, VL53L0X, OLED, HC05, PIR,
              BUZZER]
for _c in COMPONENTS:
    _fit(_c)
