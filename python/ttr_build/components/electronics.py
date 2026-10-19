"""Compute boards and sensors.

PCB frame: board corner at the origin, board in XY, bottom face at z = 0,
components on +Z; holes are on the bottom face with axis -Z (standoffs below).
Sensors with a body (lidars, D435i) use the frame noted on each part.
"""
from __future__ import annotations

from .base import Component, Hole, box, cyl, cyl_between, rbox, union
from .shapes import pcb, pcb_holes

# ------------------------------------------------------------------------ Raspberry Pi 5
PI5_HOLES = [(3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5)]
PI5_PARTS = [
    (6.7, 15.7, -1.2, 6.3, 3.3),     # USB-C power
    (22.05, 29.55, -1.0, 6.5, 3.6),  # micro-HDMI 0
    (35.45, 42.95, -1.0, 6.5, 3.6),  # micro-HDMI 1
    (66.0, 88.0, 2.2, 18.2, 13.5),   # Ethernet (overhangs 3 mm)
    (70.0, 88.0, 21.6, 36.6, 16.0),  # USB 2 stack
    (70.0, 88.0, 39.5, 54.5, 16.0),  # USB 3 stack
    (7.1, 57.9, 50.0, 55.0, 8.5),    # 40-pin GPIO header
    (22.0, 39.0, 22.0, 39.0, 2.4),   # BCM2712 SoC
    (45.0, 52.0, 10.0, 17.0, 1.2),   # RP1
]


def _pi5_build(c):
    return pcb(85.0, 56.0, 1.6, PI5_HOLES, 2.7, parts=PI5_PARTS,
               bottom=[(1.5, 13.5, 22.0, 34.0, 1.5)], r=3.0)  # microSD socket under the board


def _pi5_keepout(c):
    return union(box(88.0 - 0.01, 113.0, 2.2, 54.5, 1.6, 20.0),       # RJ45 / USB plugs
                 box(5.0, 45.0, -21.2, -1.2 + 0.01, 1.0, 6.0),           # USB-C / HDMI plugs
                 box(7.1, 57.9, 50.0, 55.0, 10.1 - 0.01, 22.0),          # GPIO ribbon / HAT connector
                 box(-15.0, 1.5 + 0.01, 22.0, 34.0, -1.5, 0.0))          # microSD card removal


RPI5 = Component(
    key="rpi5", name="Raspberry Pi 5 (4 GB)", category="compute", mass_g=46.0, price_usd=110.0,
    supplier_url="https://www.raspberrypi.com/products/raspberry-pi-5/",
    datasheet_url="https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-mechanical-drawing.pdf",
    envelope_mm=(88.0, 57.2, 19.1), holes=pcb_holes(PI5_HOLES, 2.7, "M2.5"),
    specs={"board_mm": (85.0, 56.0), "hole_pattern_mm": (58.0, 49.0), "hole_dia_mm": 2.7,
           "voltage_v": 5.0, "current_a": 5.0, "power": "USB-C PD 5 V / 5 A",
           "price_note": "Raspberry Pi product brief list price, 4 GB",
           "uncertain": ["mass_g", "usb_stack_height_mm"], "usb_stack_height_mm": 16.0},
    build=_pi5_build, build_keepout=_pi5_keepout,
)

# ----------------------------------------------------------- Jetson Orin Nano Super devkit
JON_HOLES = [(7.0, 10.5), (93.0, 10.5), (7.0, 68.5), (93.0, 68.5)]


def _jon_build(c):
    board = pcb(100.0, 79.0, 1.6, JON_HOLES, 3.0, parts=[
        (2.0, 16.0, -1.5, 14.0, 11.0),    # DC barrel jack
        (18.0, 36.0, -1.5, 14.0, 15.5),   # 2x USB-A stack
        (38.0, 56.0, -1.5, 14.0, 15.5),   # 2x USB-A stack
        (58.0, 75.0, -1.5, 20.0, 13.5),   # RJ45
        (77.0, 90.0, -1.5, 10.0, 7.0),    # DisplayPort
        (91.0, 99.0, -1.5, 8.0, 3.3),     # USB-C
        (2.0, 7.0, 25.0, 76.0, 8.5),      # 40-pin header
    ], r=2.0)
    feet = union(*[cyl(7.0, -3.0, 0.01, x, y) - cyl(3.0, -3.1, 0.1, x, y) for x, y in JON_HOLES])
    module = box(15.0, 85.0, 30.0, 90.5, 1.59, 7.0)                    # SO-DIMM module + carrier frame
    sink = box(17.0, 83.0, 32.0, 90.5, 6.99, 25.0)                     # finned heatsink (overhangs board edge)
    for k in range(9):
        x = 20.0 + k * 7.0
        sink = sink - box(x, x + 3.5, 31.0, 91.0, 12.0, 25.1)
    fan = cyl(50.0, 24.99, 31.77, 50.0, 61.0)
    return union(board, feet, module, sink, fan)


def _jon_keepout(c):
    return union(box(0.0, 100.0, -26.5, -1.5 + 0.01, 1.6, 17.0),     # rear I/O plugs
                 cyl(50.0, 31.77 - 0.01, 45.0, 50.0, 61.0))          # fan intake


JETSON = Component(
    key="jetson_orin_nano_super", name="NVIDIA Jetson Orin Nano Super Developer Kit", category="compute",
    mass_g=176.0, price_usd=249.0, supplier_url="https://developer.nvidia.com/buy-jetson?product=jetson_orin_nano",
    datasheet_url="https://www.electrokit.com/upload/quick/db/0e/bff7_datasheet.pdf",
    envelope_mm=(100.0, 92.0, 34.77), holes=[Hole((x, y, -3.0), (0.0, 0.0, -1.0), 3.0, "M3") for x, y in JON_HOLES],
    specs={"devkit_envelope_mm": (103.0, 90.5, 34.77), "carrier_mm": (100.0, 79.0), "voltage_v": 19.0,
           "power_w": (7, 25), "input": "DC barrel 5.5x2.5 mm, 9-20 V (19 V adapter supplied)",
           "hole_pattern_mm": (86.0, 58.0),
           "note": "carrier hole pattern assumed equal to the Jetson Nano B01 carrier (86 x 58 mm)",
           "uncertain": ["mass_g", "hole_pattern_mm", "carrier_mm", "voltage_v"]},
    build=_jon_build, build_keepout=_jon_keepout,
)

# ------------------------------------------------------------------- ESP32-S3-DevKitC-1


def _esp_build(c):
    L, W = 62.74, 25.4
    pins = union(*[box(0.0 + 2.6, 2.6 + 21 * 2.54 + 2.54, y - 1.27, y + 1.27, -2.5, 0.01)
                   for y in (1.27, W - 1.27)])  # header plastic below the board
    tips = union(*[box(2.6 + 0.94, 2.6 + 21 * 2.54 + 1.6, y - 0.32, y + 0.32, -8.5, -2.49)
                   for y in (1.27, W - 1.27)])
    board = pcb(L, W, 1.6, [], 0, parts=[
        (L - 18.0, L + 0.5, 3.75, 21.65, 3.2),  # ESP32-S3-WROOM-1 module (antenna end overhangs)
        (0.0 - 1.0, 8.0, 2.5, 11.5, 3.2),       # USB-C (UART)
        (0.0 - 1.0, 8.0, 13.9, 22.9, 3.2),      # USB-C (native USB)
        (12.0, 18.0, 9.0, 16.0, 1.8),           # LDO + buttons
    ], r=0.5)
    return union(board, pins, tips)


ESP32 = Component(
    key="esp32_s3_devkitc1", name="Espressif ESP32-S3-DevKitC-1 (N8R8)", category="compute",
    mass_g=10.0, price_usd=15.0, supplier_url="https://www.adafruit.com/product/5364",
    datasheet_url="https://dl.espressif.com/dl/PCB_ESP32-S3-DevKitC-1_V1_20210312CB.pdf",
    envelope_mm=(64.24, 25.4, 13.3), holes=[],
    specs={"board_mm": (62.74, 25.4), "header_rows": 2, "pins_per_row": 22, "pitch_mm": 2.54,
           "row_spacing_mm": 22.86, "voltage_v": 5.0, "no_mounting_holes": True,
           "mount": "no screw holes: plug into 2x22 female headers or a printed slot clamping the board edges",
           "uncertain": ["mass_g", "price_usd"]},
    build=_esp_build,
)

# --------------------------------------------------------------------- Slamtec RPLIDAR C1
C1_HOLES = [Hole((x, y, 0.0), (0.0, 0.0, -1.0), 2.05, "M2.5") for x in (21.5, -21.5) for y in (21.5, -21.5)]


def _c1_build(c):
    base = rbox(-27.8, 27.8, -27.8, 27.8, 0.0, 23.1, 6.0)
    for h in C1_HOLES:
        base = base - cyl(2.05, -0.1, 4.0, h.pos[0], h.pos[1])
    head = cyl(44.0, 23.09, 41.3) - (cyl(46.0, 27.3, 32.3) - cyl(41.0, 27.0, 32.6))  # optical window band
    cable = box(-4.0, 4.0, -31.8, -27.8 + 0.01, 3.0, 9.0)
    return union(base, head, cable)


def _c1_keepout(c):
    return union(cyl(160.0, 26.8, 32.8),                       # 360 deg scan plane (z = 29.8) +-3 mm
                 box(-6.0, 6.0, -50.0, -31.8 + 0.01, 2.0, 10.0))  # cable


RPLIDAR_C1 = Component(
    key="rplidar_c1", name="Slamtec RPLIDAR C1 (DTOF 360 deg, 12 m)", category="sensor", mass_g=110.0,
    price_usd=79.99, supplier_url="https://www.waveshare.com/rplidar-c1.htm",
    datasheet_url="https://cdn.shopify.com/s/files/1/0058/3145/8904/files/SLAMTEC_rplidar_datasheet_C1_v1.1_en.pdf",
    envelope_mm=(55.6, 59.6, 41.3), holes=C1_HOLES,
    specs={"scan_plane_z_mm": 29.8, "range_m": 12.0, "voltage_v": 5.0, "current_a": 0.23, "power_w": 1.15,
           "hole_pattern_mm": 43.0, "max_screw_depth_mm": 4.0, "interface": "UART 460800",
           "head_d_mm": 44.0, "uncertain": ["head_d_mm"]},
    build=_c1_build, build_keepout=_c1_keepout,
)

# ------------------------------------------------------------------- Slamtec RPLIDAR A1M8
A1_HOLES = [Hole((x, y, 0.0), (0.0, 0.0, -1.0), 2.05, "M2.5") for x in (20.0, -20.0) for y in (20.0, -20.0)]


def _a1_build(c):
    base = union(cyl(70.3, 0.0, 30.0), rbox(0.0, 61.65, -25.0, 25.0, 0.0, 22.0, 6.0))
    for h in A1_HOLES:
        base = base - cyl(2.05, -0.1, 4.0, h.pos[0], h.pos[1])
    head = cyl(66.0, 29.99, 55.0) - (cyl(68.0, 38.0, 46.0) - cyl(62.0, 37.0, 47.0))
    motor = cyl(20.0, 21.99, 26.0, 50.0, 0.0)
    return union(base, head, motor)


def _a1_keepout(c):
    return union(cyl(200.0, 39.0, 45.0),                            # scan plane band
                 cyl(70.0, 30.0, 55.0),                             # rotating head
                 box(61.65 - 0.01, 80.0, -6.0, 6.0, 2.0, 12.0))     # cable / adapter board


RPLIDAR_A1 = Component(
    key="rplidar_a1m8", name="Slamtec RPLIDAR A1M8 (360 deg, 12 m)", category="sensor", mass_g=170.0,
    price_usd=99.0, supplier_url="https://www.dfrobot.com/product-1125.html",
    datasheet_url="https://www.slamtec.com/en/lidar/a1spec",
    envelope_mm=(96.8, 70.3, 55.0), holes=A1_HOLES,
    specs={"voltage_v": 5.0, "current_a": 0.4, "range_m": 12.0, "scan_rate_hz": 5.5,
           "scan_plane_z_mm": 42.0, "hole_positions_mm": "4x M2.5 on 40 mm square under the head (assumed)",
           "uncertain": ["hole_positions_mm", "scan_plane_z_mm", "current_a", "price_usd"]},
    build=_a1_build, build_keepout=_a1_keepout,
)

# ------------------------------------------------------------------ Intel RealSense D435i
# Frame: body centred on the origin, length along X, lenses look along -Y, bottom at z = -12.5.
D435_HOLES = ([Hole((x, 12.5, 0.0), (0.0, 1.0, 0.0), 2.5, "M3") for x in (22.5, -22.5)]
              + [Hole((-7.5, 0.0, -12.5), (0.0, 0.0, -1.0), 5.1, "1/4-20")])


def _d435_build(c):
    body = union(box(-32.5, 32.5, -12.5, 12.5, -12.5, 12.5),
                 *[cyl_between(25.0, (x, -12.5, 0.0), (x, 12.5, 0.0)) for x in (-32.5, 32.5)])
    glass = box(-40.0, 40.0, -12.6, -12.0, -8.0, 8.0)
    body = body - glass + box(-40.0, 40.0, -12.4, -12.0, -8.0, 8.0)  # recessed front cover glass
    for x in (-25.0, -10.0, 15.0, 25.0):  # IR left, IR projector, RGB, IR right (approx.)
        body = body - cyl_between(4.0, (x, -12.6, 0.0), (x, -11.8, 0.0))
    for h in D435_HOLES:
        p, a = h.pos, h.axis
        body = body - cyl_between(h.dia_mm, tuple(v + 0.1 * w for v, w in zip(p, a)),
                                  tuple(v - (6.0 if h.thread == "1/4-20" else 3.0) * w for v, w in zip(p, a)))
    return body


def _d435_keepout(c):
    return union(box(-40.0, 40.0, -60.0, -12.5 + 0.01, -12.0, 12.0),  # optical field in front of the glass
                 box(45.0 - 0.5, 70.0, -5.0, 5.0, -4.0, 4.0))          # USB-C plug


D435I = Component(
    key="realsense_d435i", name="Intel RealSense D435i depth camera + IMU", category="sensor",
    mass_g=75.0, price_usd=399.0, supplier_url="https://www.realsenseai.com/products/depth-camera-d435i/",
    datasheet_url="https://www.realsenseai.com/download/21345/",
    envelope_mm=(90.0, 25.0, 25.0), holes=D435_HOLES,
    specs={"baseline_mm": 50.0, "back_holes": "2x M3, 45 mm apart, max insertion 3 mm, 0.4 N.m",
           "tripod": "1/4-20 UNC on bottom", "voltage_v": 5.0, "power_w": 3.4, "interface": "USB-C 3.1",
           "tripod_x_mm": -7.5, "lens_positions_mm": "approximate",
           "uncertain": ["tripod_x_mm", "lens_positions_mm"]},
    build=_d435_build, build_keepout=_d435_keepout,
)

# ------------------------------------------------------------ Raspberry Pi Camera Module 3
CAM_HOLES = [(2.0, 2.0), (23.0, 2.0), (2.0, 14.5), (23.0, 14.5)]
LENS = (12.5, 14.4)


def _cam_build(c):
    b = pcb(25.0, 23.862, 1.12, CAM_HOLES, 2.2, parts=[], bottom=[(4.0, 21.0, 0.0, 5.5, 2.2)], r=1.0)
    housing = box(LENS[0] - 4.3, LENS[0] + 4.3, LENS[1] - 4.3, LENS[1] + 4.3, 1.11, 6.5)
    barrel = cyl(5.75, 6.49, 9.1, *LENS)
    return union(b, housing, barrel)


def _cam_keepout(c):
    # field of view (66 x 41 deg) approximated by three stepped boxes over 24 mm
    parts = []
    for z0, z1 in ((9.1, 15.0), (15.0, 23.0), (23.0, 33.0)):
        hw, hh = 2.9 + 0.65 * (z1 - 9.1), 2.9 + 0.374 * (z1 - 9.1)
        parts.append(box(LENS[0] - hw, LENS[0] + hw, LENS[1] - hh, LENS[1] + hh, z0 - 0.01, z1))
    parts.append(box(4.0, 21.0, -15.0, 0.0, -2.2, 0.0))  # FFC exits the bottom edge
    return union(*parts)


CAM3 = Component(
    key="rpi_camera_module_3", name="Raspberry Pi Camera Module 3 (standard lens)", category="sensor",
    mass_g=4.0, price_usd=25.0, supplier_url="https://www.raspberrypi.com/products/camera-module-3/",
    datasheet_url="https://datasheets.raspberrypi.com/camera/camera-module-3-standard-mechanical-drawing.pdf",
    envelope_mm=(25.0, 23.862, 11.3), holes=pcb_holes(CAM_HOLES, 2.2, "M2"),
    specs={"lens_xy_mm": LENS, "fov_deg": (66, 41), "hole_pattern_mm": (21.0, 12.5), "pcb_t_mm": 1.12,
           "voltage_v": 3.3, "interface": "15-pin 1 mm FFC (CSI-2)", "uncertain": ["mass_g"]},
    build=_cam_build, build_keepout=_cam_keepout,
)

# -------------------------------------------------------------- Adafruit BNO085 (#4754)
BNO_HOLES = [(2.54, 2.54), (23.06, 2.54), (2.54, 20.16), (23.06, 20.16)]


def _bno_build(c):
    return pcb(25.6, 22.7, 1.6, BNO_HOLES, 2.5, parts=[
        (0.0, 3.0, 8.35, 14.35, 3.0),    # STEMMA QT left
        (22.6, 25.6, 8.35, 14.35, 3.0),  # STEMMA QT right
        (10.2, 15.4, 9.45, 13.25, 1.1),  # BNO085 LGA
        (5.0, 20.6, 0.4, 2.8, 0.6),      # header pads / passives
    ], r=2.0)


BNO085 = Component(
    key="bno085_breakout", name="Adafruit BNO085 9-DoF IMU breakout (STEMMA QT, #4754)", category="sensor",
    mass_g=2.5, price_usd=29.5, supplier_url="https://www.adafruit.com/product/4754",
    datasheet_url="https://learn.adafruit.com/adafruit-9-dof-orientation-imu-fusion-breakout-bno085/downloads",
    envelope_mm=(25.6, 22.7, 4.6), holes=pcb_holes(BNO_HOLES, 2.5, "M2"),
    specs={"voltage_v": 3.3, "vin_range_v": (3.3, 5.0), "interface": "I2C / UART / SPI, STEMMA QT",
           "hole_positions_mm": BNO_HOLES, "uncertain": ["hole_positions_mm"]},
    build=_bno_build,
)

COMPONENTS = [RPI5, JETSON, ESP32, RPLIDAR_C1, RPLIDAR_A1, D435I, CAM3, BNO085]
