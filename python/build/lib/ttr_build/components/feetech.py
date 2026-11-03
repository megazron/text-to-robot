"""Feetech STS serial bus servos (SO-100 / SO-101 arms), their horn and bus adapters.

STS3215 geometry: measured from the SO-ARM100 project's STS3215 STEP model
(TheRobotStudio/SO-ARM100, STEP/SO100/STS3215_03a.step), which matches the
Feetech 45.2 x 24.7 x 35 mm outline.  Component frame: output axis = Z through
the origin, horn face at z = 0, case length along -X (output end at +X),
connectors on the bottom (-Z) face.
"""
from __future__ import annotations

from .base import Component, Hole, box, cyl, drill, kgcm_to_nm, rbox, rpm_to_rad_s, union
from .shapes import pcb, pcb_holes

FEETECH_URL = "https://www.feetechrc.com/2020-05-13_56655.html"
SOARM_URL = "https://github.com/TheRobotStudio/SO-ARM100"

# --- STS3215 case in the component frame (STEP origin shifted by x-12.5, z-18.7) ---
X0, X1 = -35.2, 10.2      # case length 45.4
Y = 12.4                  # case half width (24.8)
Z_TOPF, Z_BOTF = -2.8, -34.6   # top / bottom cover outer faces
Z_CASE0, Z_CASE1 = -33.1, -4.3  # main shell
HORN_D, HORN_T = 20.0, 2.5
HORN_PCD_OFF = 4.9        # 4 holes at (+-4.9, +-4.9) -> PCD 13.9


def _horn_holes(z, up=True, dia=2.5, thread="M3"):
    a = (0.0, 0.0, 1.0 if up else -1.0)
    return [Hole((sx * HORN_PCD_OFF, sy * HORN_PCD_OFF, z), a, dia, thread)
            for sx in (1, -1) for sy in (1, -1)]


STS_CASE_HOLES = (
    [Hole((x, y, Z_TOPF), (0.0, 0.0, 1.0), 1.5, "M2") for x in (-29.0, -8.3) for y in (10.25, -10.25)]
    + [Hole((x, y, Z_BOTF), (0.0, 0.0, -1.0), 1.5, "M2") for x in (-32.8, -8.3) for y in (10.25, -10.25)]
)
STS_HOLES = STS_CASE_HOLES + _horn_holes(0.0) + _horn_holes(-36.4, up=False)


def _sts_build(c: Component):
    shell = rbox(X0, X1, -Y, Y, Z_CASE0, Z_CASE1, 1.2)
    top = rbox(X0, X1, -Y, Y, Z_CASE1 - 0.01, Z_TOPF, 3.0)
    bot = rbox(X0, X1, -Y, Y, Z_BOTF, Z_CASE0 + 0.01, 3.0)
    body = union(shell, top, bot)
    # edge notches around the cover screws (d4.2 counterbores at y = +-12.2)
    for h in STS_CASE_HOLES:
        z0, z1 = (Z_CASE1 + 0.2, Z_TOPF + 0.1) if h.axis[2] > 0 else (Z_BOTF - 0.1, Z_CASE0 - 0.2)
        body = body - cyl(4.2, z0, z1, h.pos[0], 12.2 if h.pos[1] > 0 else -12.2)
    body = drill(body, STS_CASE_HOLES, depth=6)
    spline = cyl(5.9, Z_TOPF - 0.01, -HORN_T + 0.01)
    horn = cyl(HORN_D, -HORN_T, 0.0) - cyl(4.5, -1.0, 0.1)
    horn = drill(horn, _horn_holes(0.0), depth=HORN_T + 0.5)
    screw = cyl(4.3, -1.0, 1.5)  # horn screw head (top at z = +1.5)
    idler_boss = cyl(6.0, -37.0, Z_BOTF + 0.01)
    idler = drill(cyl(HORN_D, -36.4, -34.3), _horn_holes(-36.4, up=False), depth=2.5)
    conns = [box(-16.5, -11.5, s * 1.6, s * 8.8, -38.1, Z_BOTF + 0.01) for s in (1, -1)]
    return union(body, spline, horn, screw, idler_boss, idler, *conns)


def _sts_keepout(c: Component):
    return union(
        cyl(HORN_D + 1.5, Z_TOPF + 0.01, 0.0),             # rotating output horn
        cyl(HORN_D + 1.5, -37.0, Z_BOTF - 0.01),           # rotating idler horn
        box(-17.5, -10.5, -10.0, 10.0, -54.0, -38.1 + 0.01),  # 5264 plugs + cable bend
    )


def _sts(key, name, variant, *, voltage, ratio, stall_kgcm, rated_kgcm, rpm, stall_a, mass, price,
         supplier, datasheet, uncertain, note=""):
    specs = {
        "variant": variant, "voltage_v": voltage, "gear_ratio": ratio,
        "stall_torque_nm": kgcm_to_nm(stall_kgcm), "rated_torque_nm": kgcm_to_nm(rated_kgcm),
        "stall_torque_kgcm": stall_kgcm, "no_load_speed_rpm": rpm, "no_load_speed_rad_s": rpm_to_rad_s(rpm),
        "current_a": stall_a, "stall_current_a": stall_a, "resolution_counts": 4096, "range_deg": 360,
        "bus": "TTL half-duplex serial (SCS protocol), 1 Mbps", "connector": "2x Molex 5264 3-pin on bottom face",
        "spline": "25T", "horn_hole_pcd_mm": round(2 * 2 ** 0.5 * HORN_PCD_OFF, 2),
        "case_screw": "M2 self-tapping (d1.5 pilot), SO-ARM uses M2x6",
        "horn_screw": "M3 self-tapping into horn (d2.5)", "geometry_source": SOARM_URL + " STEP/SO100/STS3215_03a.step",
    }
    if note:
        specs["note"] = note
    if uncertain:
        specs["uncertain"] = list(uncertain)
    return Component(
        key=key, name=name, category="actuator", mass_g=mass, price_usd=price,
        supplier_url=supplier, datasheet_url=datasheet,
        envelope_mm=(45.4, 24.8, 39.6), holes=list(STS_HOLES), specs=specs,
        output_frame=((0.0, 0.0, 0.0), (0.0, 0.0, 1.0)),
        build=_sts_build, build_keepout=_sts_keepout,
    )


def _horn_build(c: Component):
    h = cyl(HORN_D, -HORN_T, 0.0) - cyl(4.5, -1.0, 0.1) - cyl(2.4, -HORN_T - 1, 1)
    h = h - cyl(5.9, -HORN_T - 0.1, -1.2)  # 25T spline socket (modelled round)
    return drill(h, _horn_holes(0.0), depth=HORN_T + 0.5)


STS_HORN = Component(
    key="horn_sts3215_25t", name="Feetech STS3215 standard horn (25T spline, d20)", category="horn",
    mass_g=1.5, price_usd=1.0, supplier_url=FEETECH_URL,
    datasheet_url=SOARM_URL,
    envelope_mm=(HORN_D, HORN_D, HORN_T), holes=_horn_holes(0.0),
    specs={"od_mm": HORN_D, "thickness_mm": HORN_T, "spline": "25T", "spline_od_mm": 5.9,
           "hole_pcd_mm": 13.86, "hole_count": 4, "hole_dia_mm": 2.5, "hole_thread": "M3 self-tapping",
           "center_counterbore_mm": 4.5, "material": "aluminium alloy", "note": "ships with every STS3215/STS3250",
           "geometry_source": SOARM_URL + " STEP/SO100/STS3215_03a.step",
           "uncertain": ["mass_g", "price_usd", "material"]},
    output_frame=None, build=_horn_build,
)


# --- bus adapters -------------------------------------------------------------------
def _urt_build(c: Component):
    L, W = 55.8, 36.6
    hx, hy = (L - 48.8) / 2, (W - 28.8) / 2
    holes = [(hx, hy), (L - hx, hy), (hx, W - hy), (L - hx, W - hy)]
    return pcb(L, W, 1.6, holes, 3.2, parts=[
        (0, 9, 12, 24, 7.0),           # USB connector at the -X edge
        (L - 8, L, 4, 32, 9.9),        # servo headers / power terminal at +X edge
        (16, 34, 10, 26, 3.0),         # USB-UART IC / MCU area
    ])


def _urt():
    L, W = 55.8, 36.6
    hx, hy = (L - 48.8) / 2, (W - 28.8) / 2
    return Component(
        key="feetech_fe_urt1", name="Feetech FE-URT-1 USB to TTL/RS485 bus servo adapter",
        category="motor_driver", mass_g=12.5, price_usd=12.0,
        supplier_url="https://uk.robotshop.com/products/fe-urt-1-usb-to-ttl-485-bus-programmer",
        datasheet_url=FEETECH_URL,
        envelope_mm=(L, W, 11.5),
        holes=pcb_holes([(hx, hy), (L - hx, hy), (hx, W - hy), (L - hx, W - hy)], 3.2, "M3"),
        specs={"interface": "USB to TTL + RS485 half-duplex", "voltage_v": 12.0, "board_mm": (L, W),
               "hole_pattern_mm": (48.8, 28.8), "hole_dia_mm": 3.2,
               "connectors": "USB, 2.54 mm UART header, 5264-3P (SCS/TTL), 5264-4P (SMS/RS485), 5.08 mm power terminal",
               "successor": "FE-URT-2 (same outline and holes, USB-C)",
               "uncertain": ["hole_dia_mm", "price_usd", "voltage_v"]},
        build=_urt_build,
    )


def _ws_build(c: Component):
    L, W = 42.0, 33.0
    holes = [(3.0, 3.0), (L - 3.0, 3.0), (3.0, W - 3.0), (L - 3.0, W - 3.0)]
    return pcb(L, W, 1.6, holes, 2.5, parts=[
        (0, 7.5, 11, 22, 3.5),          # USB-C at -X edge
        (L - 14.5, L, 2, 11, 11.0),     # DC5521 jack
        (L - 8, L, 14, 31, 8.4),        # screw terminal + servo headers
        (14, 24, 12, 20, 1.5),          # UART chip
    ])


def _ws():
    L, W = 42.0, 33.0
    holes = [(3.0, 3.0), (L - 3.0, 3.0), (3.0, W - 3.0), (L - 3.0, W - 3.0)]
    return Component(
        key="waveshare_bus_servo_adapter", name="Waveshare Bus Servo Adapter (A)", category="motor_driver",
        mass_g=10.0, price_usd=10.6, supplier_url="https://www.waveshare.com/bus-servo-adapter-a.htm",
        datasheet_url="https://www.waveshare.com/wiki/Bus_Servo_Adapter_(A)",
        envelope_mm=(L, W, 12.6), holes=pcb_holes(holes, 2.5, "M2"),
        specs={"interface": "USB/UART to TTL bus servo", "voltage_v": 12.0, "input_v_range": (9.0, 12.6),
               "board_mm": (L, W), "hole_dia_mm": 2.5,
               "uncertain": ["mass_g", "hole_positions", "envelope_mm"], "hole_positions": "3 mm from each corner (assumed)"},
        build=_ws_build,
    )


COMPONENTS = [
    _sts("feetech_sts3215_c001", "Feetech STS3215 C001 7.4 V 19.5 kg.cm (1:345)", "C001",
         voltage=7.4, ratio=345, stall_kgcm=19.5, rated_kgcm=5.0, rpm=52, stall_a=2.5, mass=55.0, price=13.89,
         supplier="https://openelab.io/products/feetech-sts3215-c001-servo", datasheet=FEETECH_URL,
         uncertain=["rated_torque_nm", "stall_current_a", "current_a"],
         note="SO-100/SO-101 follower arm servo (7.4 V)"),
    _sts("feetech_sts3215_c018", "Feetech STS3215 C018 12 V 30 kg.cm (1:345)", "C018",
         voltage=12.0, ratio=345, stall_kgcm=30.0, rated_kgcm=10.0, rpm=45, stall_a=2.7, mass=55.0, price=22.0,
         supplier="https://www.robotshop.com/products/feetech-12v-30kgcm-magnetic-encoding-servo-sts3215",
         datasheet="https://www.waveshare.com/wiki/ST3215_Servo",
         uncertain=["rated_torque_nm", "mass_g", "price_usd"],
         note="SO-100/SO-101 follower arm, 12 V build"),
    _sts("feetech_sts3215_c047", "Feetech STS3215 C047 12 V 30 kg.cm (1:345)", "C047",
         voltage=12.0, ratio=345, stall_kgcm=30.0, rated_kgcm=10.0, rpm=45, stall_a=2.7, mass=55.0, price=22.0,
         supplier="https://www.seeedstudio.com/STS3215-30KG-Serial-Servo-p-6340.html",
         datasheet="https://files.seeedstudio.com/Bazaar/product_pdf/108090003.pdf",
         uncertain=["rated_torque_nm", "stall_current_a", "current_a", "no_load_speed_rad_s", "mass_g"],
         note="12 V / 1:345 variant sold for SO-101 kits (not 1:147)"),
    _sts("feetech_sts3215_c044", "Feetech STS3215 C044 7.4 V (1:191, SO-101 leader j1/j3)", "C044",
         voltage=7.4, ratio=191, stall_kgcm=10.8, rated_kgcm=3.6, rpm=94, stall_a=2.5, mass=55.0, price=13.89,
         supplier="https://openelab.io/products/feetech-sts3215-c044-servo", datasheet=SOARM_URL,
         uncertain=["stall_torque_nm", "rated_torque_nm", "no_load_speed_rad_s", "stall_current_a", "current_a"],
         note="leader-arm gearing; torque/speed scaled from C001 by gear ratio"),
    _sts("feetech_sts3215_c046", "Feetech STS3215 C046 7.4 V (1:147, SO-101 leader j4-j6)", "C046",
         voltage=7.4, ratio=147, stall_kgcm=14.4, rated_kgcm=4.8, rpm=122, stall_a=2.5, mass=55.0, price=13.89,
         supplier="https://openelab.io/products/feetech-sts3215-c046-servo", datasheet=SOARM_URL,
         uncertain=["stall_torque_nm", "rated_torque_nm", "no_load_speed_rad_s", "stall_current_a", "current_a"],
         note="leader-arm gearing"),
    _sts("feetech_sts3250", "Feetech STS3250 C002 12 V 50 kg.cm (1:345)", "STS3250-C002",
         voltage=12.0, ratio=345, stall_kgcm=50.0, rated_kgcm=16.0, rpm=75, stall_a=4.2, mass=74.5, price=40.0,
         supplier="https://openelab.io/products/feetech-sts3250-c002-servo-12v",
         datasheet="https://www.evelta.com/sts3250-12v-50kg-360deg-magnetic-encoder-double-shaft-ttl-servo/",
         uncertain=["stall_torque_nm", "rated_torque_nm", "no_load_speed_rad_s", "mass_g", "price_usd"],
         note="same 45.2x24.7x35 case as STS3215"),
    STS_HORN,
    _urt(),
    _ws(),
]
