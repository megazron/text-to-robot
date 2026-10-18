"""CubeMars AK-series quasi-direct-drive actuators.

Numbers from the CubeMars product pages and 2D drawings
(cubemars.com/data/cms/202602/<model>-robotic-actuator-2d-drawing.pdf).
Component frame: output hub face at z = 0 (+Z out), stator housing towards -Z,
back (driver) cover at the -Z end.  Hole groups:
  * output hub (rotating) — structure of the *next* link bolts here, axis +Z;
  * housing OUT ring (stationary, z = housing front face) — axis +Z;
  * housing BACK ring (stationary, z = housing back face) — axis -Z.
"""
from __future__ import annotations

from .base import Component, Hole, box, cyl, polar, rpm_to_rad_s, tube, union

DRAW = "https://www.cubemars.com/data/cms/202602/{}-robotic-actuator-2d-drawing.pdf"


def _holes(m):
    hub = [Hole((x, y, 0.0), (0.0, 0.0, 1.0), m["hub_tap"], m["hub_thread"])
           for x, y in polar(6, m["hub_pcd"], 0.0)]
    out = [Hole((x, y, m["z_front"]), (0.0, 0.0, 1.0), 2.5, "M3")
           for x, y in polar(m["ring_n"], m["out_pcd"], m.get("out_rot", 0.0))]
    back = [Hole((x, y, m["z_back"]), (0.0, 0.0, -1.0), 2.5, "M3")
            for x, y in polar(m["ring_n"], m["back_pcd"], m.get("back_rot", 0.0))]
    return hub, out, back


def _conn_angle(m):
    """Cable exit: centre of the gap between back-ring holes that is nearest 270 deg (straight down)."""
    n, rot = m["ring_n"], m.get("back_rot", 0.0)
    step = 360.0 / n
    gaps = [(rot + (i + 0.5) * step) % 360.0 for i in range(n)]
    return min(gaps, key=lambda a: abs(((a - 270.0) + 180.0) % 360.0 - 180.0))


def _conn_block(m, r_in, r_out, z0, z1, half_w):
    return box(r_in, r_out, -half_w, half_w, z0, z1).rotate(_ZAXIS(), _conn_angle(m))


def _ZAXIS():
    import build123d as bd
    return bd.Axis.Z


def _build(m):
    def build(c: Component):
        D, zf, zb, L = m["od"], m["z_front"], m["z_back"], m["length"]
        housing = cyl(D, zb, zf)
        # cooling / styling grooves around the stator
        for k in range(3):
            zg = zb + (zf - zb) * (k + 1) / 4
            housing = housing - tube(D + 1, D - 1.6, zg - 0.6, zg + 0.6)
        step = cyl(m["step_d"], zf - 0.01, zf + m["step_h"])
        hub = cyl(m["hub_d"], zf + m["step_h"] - 0.01, 0.0)
        if m.get("pilot_d"):
            hub = hub - cyl(m["pilot_d"], -m["pilot_depth"], 0.1)
        back = cyl(m["back_d"], -L, zb + 0.01)
        conn = _conn_block(m, m["back_d"] / 2 - 6, m["back_d"] / 2 + 6, -L + 1.0, zb + 0.01, 9.0)
        part = union(housing, step, hub, back, conn)
        hub_h, out_h, back_h = _holes(m)
        cut = None
        for h in hub_h:
            c_ = cyl(h.dia_mm, -m["hub_depth"], 0.1, h.pos[0], h.pos[1])
            cut = c_ if cut is None else cut + c_
        for h in out_h:
            cut = cut + cyl(h.dia_mm, zf - 6.0, zf + 0.1, h.pos[0], h.pos[1])
        for h in back_h:
            cut = cut + cyl(h.dia_mm, zb - 0.1, zb + 3.5, h.pos[0], h.pos[1])
        return part - cut
    return build


def _keepout(m):
    def ko(c: Component):
        # rotating output hub sweep (the step/hub ring rotates) + cable exit from the back cover
        r = m["back_d"] / 2
        return union(
            cyl(m["step_d"] + 1.0, m["z_front"] + 0.01, 0.0),
            _conn_block(m, r + 6 - 0.01, r + 25, -m["length"] + 1.0, m["z_back"] - 0.5, 10.0),
        )
    return ko


def _ak(key, model, slug, m, *, mass, price, volt, rated, peak, rpm_noload, rpm_rated, i_rated, i_peak,
        ratio, enc, page, uncertain):
    hub, out, back = _holes(m)
    specs = {
        "model": model, "voltage_v": volt, "rated_torque_nm": rated, "stall_torque_nm": peak,
        "peak_torque_nm": peak, "no_load_speed_rpm": rpm_noload, "no_load_speed_rad_s": rpm_to_rad_s(rpm_noload),
        "rated_speed_rad_s": rpm_to_rad_s(rpm_rated), "current_a": i_rated, "peak_current_a": i_peak,
        "gear_ratio": ratio, "encoder": enc, "od_mm": m["od"], "length_mm": m["length"],
        "hub_hole_pcd_mm": m["hub_pcd"], "hub_thread": m["hub_thread"], "hub_thread_depth_mm": m["hub_depth"],
        "housing_out_pcd_mm": m["out_pcd"], "housing_back_pcd_mm": m["back_pcd"],
        "bus": "CAN 1 Mbps (MIT / servo mode) + UART", "connector": "XT30(2+2) power+CAN, 3-pin UART on back cover",
        "cable_exit_deg": round(_conn_angle(m), 1),
    }
    specs["uncertain"] = list(uncertain) + ["cable_exit_deg"]
    return Component(
        key=key, name=f"CubeMars {model}", category="actuator", mass_g=mass, price_usd=price,
        supplier_url=page, datasheet_url=DRAW.format(slug),
        envelope_mm=(m["od"], m["od"], m["length"]), holes=hub + out + back, specs=specs,
        output_frame=((0.0, 0.0, 0.0), (0.0, 0.0, 1.0)), build=_build(m), build_keepout=_keepout(m),
    )


AK60 = dict(od=79.0, length=43.0, z_front=-2.0, step_d=49.0, step_h=0.5, hub_d=25.0, back_d=57.0,
            hub_pcd=20.0, hub_tap=2.5, hub_thread="M3", hub_depth=6.0, ring_n=6, out_pcd=68.0,
            back_pcd=68.0, back_rot=0.0)  # holes 30 deg either side of vertical; cable notch at 270 deg
AK60["z_back"] = -2.0 - 31.0
AK70 = dict(od=89.0, length=50.25, z_front=-6.5, step_d=77.0, step_h=0.5, hub_d=30.0, back_d=71.0,
            hub_pcd=25.0, hub_tap=2.5, hub_thread="M3", hub_depth=7.0, ring_n=8, out_pcd=83.0,
            back_pcd=83.0, back_rot=7.0, pilot_d=20.0, pilot_depth=2.0)
AK70["z_back"] = -(50.25 - 11.2)
AK80_9 = dict(od=98.0, length=38.5, z_front=-4.3, step_d=48.0, step_h=1.3, hub_d=37.0, back_d=71.0,
              hub_pcd=28.0, hub_tap=3.3, hub_thread="M4", hub_depth=6.0, ring_n=8, out_pcd=85.0,
              back_pcd=85.0)
AK80_9["z_back"] = -(38.5 - 11.0)
AK80_64 = dict(od=98.0, length=61.9, z_front=-8.0, step_d=80.0, step_h=1.0, hub_d=35.0, back_d=71.0,
               hub_pcd=28.0, hub_tap=3.3, hub_thread="M4", hub_depth=8.0, ring_n=8, out_pcd=89.0,
               back_pcd=85.0, back_rot=15.0, pilot_d=21.0, pilot_depth=4.5)
AK80_64["z_back"] = -(61.9 - 11.2)

COMPONENTS = [
    _ak("cubemars_ak60_6", "AK60-6 V3.0 KV80", "ak60-6-v3-0", AK60, mass=380.0, price=229.9, volt=48.0,
        rated=3.0, peak=9.0, rpm_noload=640, rpm_rated=490, i_rated=3.8, i_peak=11.2, ratio=6, enc="21-bit",
        page="https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html",
        uncertain=["hub_thread_depth_mm"]),
    _ak("cubemars_ak70_10", "AK70-10 KV100", "ak70-10", AK70, mass=621.0, price=398.9, volt=48.0,
        rated=8.3, peak=24.8, rpm_noload=480, rpm_rated=310, i_rated=7.2, i_peak=23.2, ratio=10, enc="14-bit",
        page="https://www.cubemars.com/product/ak70-10-kv100-robotic-actuator.html", uncertain=[]),
    _ak("cubemars_ak80_9", "AK80-9 V3.0 KV100", "ak80-9-v3-0", AK80_9, mass=490.0, price=479.9, volt=48.0,
        rated=9.0, peak=22.0, rpm_noload=570, rpm_rated=390, i_rated=12.0, i_peak=28.0, ratio=9, enc="16-bit",
        page="https://www.cubemars.com/goods-982-AK80-9.html",
        uncertain=["hub_thread_depth_mm", "housing_back_pcd_mm", "price_usd"]),
    _ak("cubemars_ak80_64", "AK80-64 KV80", "ak80-64", AK80_64, mass=850.0, price=889.9, volt=48.0,
        rated=48.0, peak=120.0, rpm_noload=75, rpm_rated=48, i_rated=7.0, i_peak=19.0, ratio=64, enc="14-bit",
        page="https://www.cubemars.com/product/ak80-64-kv80-robotic-actuator.html", uncertain=[]),
]
