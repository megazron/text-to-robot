"""ROBOTIS DYNAMIXEL X-series servos, the X430 horn and the U2D2 interface.

Performance numbers: ROBOTIS e-Manual spec tables (emanual.robotis.com/docs/en/dxl/x/<model>/).
Geometry: XL330 / XL430 case and HN11-I101 idler horn measured from ROBOTIS STEP models
(mirrored in github.com/jess-moss/koch-v1-1, hardware/follower/STEP); the
ROBOTIS drawing downloads were offline when this library was written, so case
side/end tap patterns are listed in ``specs['uncertain']``.

Component frame: output axis = Z through the origin, horn face at z = 0,
case height (H) along -X (output end at +X), width (W) along Y, depth (D) along -Z.
"""
from __future__ import annotations

from .base import Component, Hole, box, cyl, drill, polar, rbox, rpm_to_rad_s, union

EMANUAL = "https://emanual.robotis.com/docs/en/dxl/x/{}/"
KOCH_STEP = "https://github.com/jess-moss/koch-v1-1"


def _case_holes(g):
    """Case tap holes: 4 per side face, 2 on the far end face (M2.5 on X430, M3 on X540)."""
    x0, x1, hw, z0, z1 = g["x0"], g["x1"], g["w"] / 2, g["z0"], g["z1"]
    xc, zc = (x0 + x1) / 2, (z0 + z1) / 2
    sx, sz, se = g["side_pat"][0] / 2, g["side_pat"][1] / 2, g["end_pat"] / 2
    t, d = g["case_thread"], g["case_tap"]
    holes = []
    for side in (1, -1):
        holes += [Hole((xc + a * sx, side * hw, zc + b * sz), (0.0, float(side), 0.0), d, t)
                  for a in (1, -1) for b in (1, -1)]
    holes += [Hole((x0, s * se, zc), (-1.0, 0.0, 0.0), d, t) for s in (1, -1)]
    return holes


def _horn_holes(g):
    n = g.get("horn_n", 4)
    return [Hole((x, y, 0.0), (0.0, 0.0, 1.0), g["horn_tap"], g["horn_thread"])
            for x, y in polar(n, g["horn_pcd"], 0.0)]


def _build(g):
    def build(c: Component):
        x0, x1, hw, z0, z1 = g["x0"], g["x1"], g["w"] / 2, g["z0"], g["z1"]
        case = rbox(x0, x1, -hw, hw, z0, z1, 2.0)
        # parting grooves between the front, middle and back case shells
        for zg in (z1 - 3.0, z0 + 3.0):
            case = case - (rbox(x0 - 1, x1 + 1, -hw - 1, hw + 1, zg - 0.3, zg + 0.3, 1) -
                           rbox(x0 + 0.4, x1 - 0.4, -hw + 0.4, hw - 0.4, zg - 0.4, zg + 0.4, 1.6))
        case = drill(case, (_case_holes(g) if g.get("case_holes", True) else []) + g.get("extra_holes", []), depth=4.0)
        boss = cyl(g["boss_d"], z1 - 0.01, -g["horn_t"] + 0.01)
        horn = cyl(g["horn_d"], -g["horn_t"], 0.0) - cyl(g["horn_d"] * 0.25, -1.0, 0.1)
        horn = drill(horn, _horn_holes(g), depth=g["horn_t"] + 0.5)
        idler = cyl(g["idler_d"], z0 - g["idler_t"], z0 + 0.01) if g.get("idler_d") else None
        # JST EH sockets in the far end face, near the back shell (clear of the end-face taps)
        conn = box(x0 - 1.0, x0 + 0.01, -g["w"] * 0.32, g["w"] * 0.32, z0 + 1.5, z0 + 8.0)
        return union(case, boss, horn, idler, conn)
    return build


def _keepout(g):
    def ko(c: Component):
        out = union(
            cyl(g["horn_d"] + 1.5, g["z1"] + 0.01, 0.0),  # rotating horn
            box(g["x0"] - 16.0, g["x0"] - 1.0 + 0.01, -g["w"] * 0.4, g["w"] * 0.4, g["z0"] + 0.5, g["z0"] + 10.0),  # plugs
        )
        if g.get("idler_d"):
            out = out + cyl(g["idler_d"] + 1.5, g["z0"] - g["idler_t"] - 0.01, g["z0"])
        return out
    return ko


X430 = dict(x0=-35.25, x1=11.25, w=28.5, z0=-37.9, z1=-3.9, horn_d=20.5, horn_t=3.3, boss_d=10.0,
            horn_pcd=16.0, horn_tap=1.6, horn_thread="M2", horn_n=8, case_thread="M2.5", case_tap=2.05,
            side_pat=(24.0, 12.0), end_pat=16.0)
X540 = dict(x0=-45.0, x1=13.5, w=33.5, z0=-48.0, z1=-4.0, horn_d=25.0, horn_t=3.5, boss_d=12.0,
            horn_pcd=20.0, horn_tap=2.5, horn_thread="M3", case_thread="M3", case_tap=2.5,
            side_pat=(28.0, 16.0), end_pat=20.0)


def _dxl(key, model, g, *, mass, volt, stall, stall_a, rpm, ratio, price, rated=None, supplier, extra_unc=()):
    holes = _horn_holes(g) + (_case_holes(g) if g.get("case_holes", True) else []) + g.get("extra_holes", [])
    env = (round(g["x1"] - g["x0"] + 1.0, 3), g["w"], round(-(g["z0"] - g.get("idler_t", 0.0)), 3))
    specs = {
        "model": model, "voltage_v": volt, "stall_torque_nm": stall, "stall_current_a": stall_a, "current_a": stall_a,
        "rated_torque_nm": rated if rated is not None else round(stall * 0.3, 3),
        "no_load_speed_rpm": rpm, "no_load_speed_rad_s": rpm_to_rad_s(rpm), "gear_ratio": ratio,
        "resolution_counts": 4096, "horn_hole_pcd_mm": g["horn_pcd"], "horn_thread": g["horn_thread"],
        "case_thread": g["case_thread"], "side_hole_pattern_mm": g["side_pat"], "end_hole_spacing_mm": g["end_pat"],
        "geometry_source": KOCH_STEP + " (ROBOTIS STEP)",
    }
    unc = ["rated_torque_nm", "side_hole_pattern_mm", "end_hole_spacing_mm"] + list(extra_unc)
    specs["note"] = "rated_torque_nm = 30% of stall (ROBOTIS publishes stall torque only)"
    specs["uncertain"] = unc
    return Component(
        key=key, name=f"DYNAMIXEL {model}", category="actuator", mass_g=mass, price_usd=price,
        supplier_url=supplier, datasheet_url=EMANUAL.format(model.lower().replace("-t", "").replace("(r)", "")),
        envelope_mm=env, holes=holes, specs=specs, output_frame=((0.0, 0.0, 0.0), (0.0, 0.0, 1.0)),
        build=_build(g), build_keepout=_keepout(g),
    )


# XL330: 20 W x 34 H x 26 D, integrated horn; case screw bosses from the ROBOTIS STEP.
XL330 = dict(x0=-24.5, x1=9.5, w=20.0, z0=-26.0, z1=-1.0, horn_d=16.0, horn_t=1.0, boss_d=6.0,
             horn_pcd=12.0, horn_tap=1.6, horn_thread="M2", case_thread="M2", case_tap=1.6,
             side_pat=(16.0, 10.0), end_pat=10.0, case_holes=False,
             extra_holes=[Hole((x, y, -26.0), (0.0, 0.0, -1.0), 1.6, "M2")
                          for x, y in ((4.55, 8.4), (4.55, -8.4), (-19.35, 8.4), (-22.85, -4.9))])

COMPONENTS = [
    _dxl("dxl_xl330_m288", "XL330-M288-T", XL330, mass=18.0, volt=5.0, stall=0.52, stall_a=1.47, rpm=103,
         ratio=288.4, price=25.9, supplier="https://robotis.us/dynamixel-xl330-m288-t",
         extra_unc=["price_usd"]),
    _dxl("dxl_xl430_w250", "XL430-W250-T", X430, mass=57.2, volt=11.1, stall=1.4, stall_a=1.3, rpm=57,
         ratio=258.5, price=44.9, supplier="https://robotis.us/dynamixel-xl430-w250-t"),
    _dxl("dxl_xm430_w350", "XM430-W350-T(R)", X430, mass=82.0, volt=12.0, stall=4.1, stall_a=2.3, rpm=46,
         ratio=353.5, price=310.39,
         supplier="https://www.robotshop.com/products/robotis-dynamixel-xm430-w350-t-smart-servo-actuator"),
    _dxl("dxl_xh540_w270", "XH540-W270-T(R)", X540, mass=165.0, volt=12.0, stall=9.9, stall_a=4.9, rpm=39,
         ratio=272.5, price=539.9, supplier="https://robotis.us/dynamixel-xh540-w270-t",
         extra_unc=["horn_hole_pcd_mm", "horn_thread", "case_thread", "output_axis_offset_mm"]),
]
COMPONENTS[-1].specs["output_axis_offset_mm"] = 13.5  # from the top end, scaled from X430


def _hn12_build(c: Component):
    horn = cyl(20.5, -3.3, 0.0) + cyl(10.0, -4.5, -3.29)          # disc + spline hub
    horn = horn - cyl(5.5, -4.6, -2.0) - cyl(3.0, -3.0, 0.1)        # spline socket + centre bolt
    return drill(horn, _horn_holes(X430), depth=3.8)


HN12 = Component(
    key="horn_dxl_hn12_n101", name="ROBOTIS HN12-N101 X430 output horn (8x M2 on PCD 16)", category="horn",
    mass_g=2.6, price_usd=10.0, supplier_url="https://robotis.us/hn12-n101-set/",
    datasheet_url=EMANUAL.format("xm430-w350"),
    envelope_mm=(20.5, 20.5, 4.5), holes=_horn_holes(X430),
    specs={"od_mm": 20.5, "thickness_mm": 3.3, "hole_pcd_mm": 16.0, "hole_count": 8, "hole_thread": "M2",
           "fits": ["dxl_xm430_w350"], "frames": "FR12-H101K / FR12-S101K (M2x3 wrench bolts)",
           "note": "geometry measured from the ROBOTIS HN11-I101 (XL430 idler) STEP, which shares the"
                   " 8-hole PCD 16 frame pattern; HN12-N101 is not for XL430 (XL430 ships with its own horn)",
           "material": "aluminium", "geometry_source": KOCH_STEP + " Robotis_HN11_I101.step",
           "uncertain": ["mass_g", "price_usd", "hole_thread", "thickness_mm"]},
    build=_hn12_build,
)


def _u2d2_build(c: Component):
    body = rbox(0, 48, -9, 9, 0, 14.9, 2.0)
    usb = box(-1.5, 0.01, -4.5, 4.5, 4.5, 8.0)
    ports = box(47.99, 49.0, -7.5, 7.5, 3.0, 11.0)
    return drill(union(body, usb, ports), c.holes, depth=4.7)


U2D2 = Component(
    key="dxl_u2d2", name="ROBOTIS U2D2 USB to TTL/RS-485 interface", category="motor_driver",
    mass_g=9.0, price_usd=32.1, supplier_url="https://www.generationrobots.com/en/400848-usb2dynamixel-robotis.html",
    datasheet_url="https://emanual.robotis.com/docs/en/parts/interface/u2d2/",
    envelope_mm=(50.5, 18.0, 14.9),
    holes=[Hole((24.0, 0.0, 0.0), (0.0, 0.0, -1.0), 1.6, "M2")],
    specs={"interface": "USB-C to TTL (JST EH 3P) / RS-485 (JST EH 4P) / UART", "voltage_v": 5.0,
           "mount": "M2 tap, valid depth 4.7 mm", "hole_position": "bottom centre (assumed)",
           "uncertain": ["hole_position"]},
    build=_u2d2_build,
)

COMPONENTS += [HN12, U2D2]
