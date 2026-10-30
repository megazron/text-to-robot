"""Hobby PWM servos (SG90, MG90S, MG996R, DS3218) with their stock horns.

Geometry is measured from open CAD (scripts/hardware/measure_step.py on files in
references/hardware/manifest.json):

* SG90   — FreeCAD-library ``Servo-sg90.step`` + ``SG90-4-arms-horn.step`` (CC-BY 3.0)
* MG90S  — Adafruit_CAD_Parts ``1143 Micro Servo High Torque Metal Gear.step`` (MIT)
* MG996R / DS3218 — no open STEP exists; the standard-size case and tab pattern come
  from FreeCAD-library ``Futaba3003.stp`` + round horn, resized to the published
  outlines (MG996R 40.7 x 19.7 x 42.9, DS3218 40 x 20 x 40.5).

Component frame (same rule as every actuator here): output axis +Z through the
origin, z = 0 is the face of the mounted horn that printed parts bolt to, the
servo body extends towards -Z. The case runs along X with the output near the +X
end; the cable leaves the -X end face low on the case. Tabs carry the case screws.

Hobby servos have no continuous-torque rating. ``rated_torque_nm`` is 30 % of stall
(the same convention used for Dynamixel here) so a design that holds poses within
it does not cook the motor; ``stall_torque_nm`` is the datasheet value at
``voltage_v``.
"""
from __future__ import annotations

import math

from .base import Component, Hole, box, cyl, kgcm_to_nm, rbox, union

FREECAD = "https://github.com/FreeCAD/FreeCAD-library/tree/master/Electrical%20Parts/Servos"
ADAFRUIT = "https://github.com/adafruit/Adafruit_CAD_Parts/tree/main/1143%20Micro%20Servo%20-%20High%20Torque%20Metal%20Gear"


def s_per_60_to_rad_s(t: float) -> float:
    return (math.pi / 3) / t


class _Geo:
    """Measured case + horn geometry of one servo (mm, see module docstring)."""

    def __init__(self, *, L, W, case_h, off, tab_z, tab_t, tab_span, hole_d, hole_dx, hole_dy,
                 dome_d, dome_h, spline_d, horn):
        self.__dict__.update(locals())
        del self.__dict__["self"]
        # heights measured from the case bottom; shift so the horn face is z = 0
        self.horn_face = case_h + dome_h + horn["below_face"]
        self.z0 = -self.horn_face

    def zc(self, h_from_bottom):
        return self.z0 + h_from_bottom


MICRO_HORN = dict(  # SG90 cross horn: long arms +-17.5 mm, short arms +-8.5 mm, 1.4 mm holes every 2 mm
    kind="cross", arm_t=2.0, below_face=2.0, long=17.5, short=8.5, arm_w=5.6, hub_d=8.0, hub_h=2.0,
    hole_d=1.4, holes_long=(5, 7, 9, 11, 13, 15, 17), holes_short=(5, 7), screw="M2 self-tapping (horn kit)",
    radius=17.5)
STD_HORN = dict(  # standard round disc horn: d35.5 x 2.6 mm, 8 holes d1.5 on r = 15 mm, hub d9 x 3.2 below
    kind="disc", disc_d=35.5, disc_t=2.6, below_face=3.2 + 2.6 + 0.3, hub_d=9.0, hub_h=3.2,
    hole_d=1.5, hole_r=15.0, n_holes=8, screw="M2 self-tapping (horn kit)", radius=17.75)

SG90_G = _Geo(L=22.8, W=11.8, case_h=22.7, off=5.2, tab_z=17.1, tab_t=2.5, tab_span=32.4, hole_d=2.0,
              hole_dx=26.9, hole_dy=0.0, dome_d=11.8, dome_h=4.0, spline_d=4.6, horn=MICRO_HORN)
MG90S_G = _Geo(L=22.8, W=12.0, case_h=22.7, off=5.1, tab_z=19.8, tab_t=2.0, tab_span=31.3, hole_d=1.7,
               hole_dx=29.6, hole_dy=0.0, dome_d=11.6, dome_h=4.0, spline_d=4.8, horn=MICRO_HORN)
MG996R_G = _Geo(L=40.7, W=19.7, case_h=36.4, off=9.4, tab_z=27.1, tab_t=2.6, tab_span=54.5, hole_d=4.4,
                hole_dx=49.5, hole_dy=10.0, dome_d=13.0, dome_h=1.6, spline_d=5.9, horn=STD_HORN)
DS3218_G = _Geo(L=40.0, W=20.0, case_h=34.0, off=9.4, tab_z=26.0, tab_t=2.6, tab_span=54.5, hole_d=4.4,
                hole_dx=49.5, hole_dy=10.0, dome_d=13.0, dome_h=1.6, spline_d=5.9, horn=STD_HORN)


def _tab_holes(g: _Geo):
    cx = -g.off
    z = g.zc(g.tab_z - g.tab_t / 2)   # tab underside rests on the printed structure
    ys = (0.0,) if g.hole_dy == 0 else (g.hole_dy / 2, -g.hole_dy / 2)
    thread = "M2" if g.hole_d < 2.5 else "M3"
    return [Hole((cx + sx * g.hole_dx / 2, y, z), (0.0, 0.0, -1.0), g.hole_d, thread) for sx in (1, -1) for y in ys]


def _horn_holes(g: _Geo):
    h = g.horn
    up = (0.0, 0.0, 1.0)
    if h["kind"] == "cross":
        pts = [(sx * r, 0.0) for r in h["holes_long"] for sx in (1, -1)]
        pts += [(0.0, sy * r) for r in h["holes_short"] for sy in (1, -1)]
    else:
        pts = [(h["hole_r"] * math.cos(k * 2 * math.pi / h["n_holes"]), h["hole_r"] * math.sin(k * 2 * math.pi / h["n_holes"]))
               for k in range(h["n_holes"])]
    return [Hole((round(x, 3), round(y, 3), 0.0), up, h["hole_d"], "M2") for x, y in pts]


def _horn_solid(g: _Geo):
    h = g.horn
    if h["kind"] == "cross":
        t = h["arm_t"]
        arms = union(rbox(-h["long"], h["long"], -h["arm_w"] / 2, h["arm_w"] / 2, -t, 0.0, h["arm_w"] / 2 - 0.1),
                     rbox(-h["arm_w"] / 2, h["arm_w"] / 2, -h["short"], h["short"], -t, 0.0, h["arm_w"] / 2 - 0.1))
        for hole in _horn_holes(g):
            arms = arms - cyl(h["hole_d"], -t - 0.1, 0.1, hole.pos[0], hole.pos[1])
        hub = cyl(h["hub_d"], -t, h["hub_h"]) - cyl(2.2, -t - 0.1, h["hub_h"] + 0.1)
        screw = cyl(4.0, h["hub_h"] - 1.0, h["hub_h"] + 0.8)
        return union(arms, hub, screw)
    disc = cyl(h["disc_d"], -h["disc_t"], 0.0)
    for hole in _horn_holes(g):
        disc = disc - cyl(h["hole_d"], -h["disc_t"] - 0.1, 0.1, hole.pos[0], hole.pos[1])
    disc = disc - cyl(6.0, -1.5, 0.1)                          # counterbore of the centre screw
    hub = cyl(h["hub_d"], -h["disc_t"] - h["hub_h"], -h["disc_t"] + 0.01)
    screw = cyl(5.5, -1.5, 0.5)                                # M3 centre-screw head, nearly flush
    return union(disc, hub, screw)


def _build(g: _Geo):
    def build(c):
        cx = -g.off
        case = rbox(cx - g.L / 2, cx + g.L / 2, -g.W / 2, g.W / 2, g.z0, g.zc(g.case_h), 1.0)
        tabs = box(cx - g.tab_span / 2, cx + g.tab_span / 2, -g.W / 2, g.W / 2,
                   g.zc(g.tab_z - g.tab_t / 2), g.zc(g.tab_z + g.tab_t / 2))
        for hole in _tab_holes(g):
            tabs = tabs - cyl(g.hole_d, hole.pos[2] - 0.1, hole.pos[2] + g.tab_t + 0.1, hole.pos[0], hole.pos[1])
        dome = cyl(g.dome_d, g.zc(g.case_h) - 0.01, g.zc(g.case_h + g.dome_h))
        spline = cyl(g.spline_d, g.zc(g.case_h + g.dome_h) - 0.01, -1.0)
        cable = box(cx - g.L / 2 - 4.0, cx - g.L / 2 + 0.01, -2.0, 2.0, g.z0 + 2.0, g.z0 + 5.0)  # strain relief
        return union(case, tabs, dome, spline, cable, _horn_solid(g))
    return build


def _keepout(g: _Geo):
    def keepout(c):
        h = g.horn
        cx = -g.off
        below = h["arm_t"] if h["kind"] == "cross" else h["disc_t"]
        sweep = cyl(2 * h["radius"] + 2.0, -below - 0.5, 0.0)                  # the turning horn
        hub = cyl(h["hub_d"] + 2.0, 0.0, (h["hub_h"] if h["kind"] == "cross" else 0.5) + 1.2)  # hub + screw
        cable = box(cx - g.L / 2 - 16.0, cx - g.L / 2 + 0.01, -4.0, 4.0, g.z0, g.z0 + 7.0)    # lead + bend radius
        return union(sweep, hub, cable)
    return keepout


def _servo(key, name, g: _Geo, *, volts, torque_kgcm, speed_s60, stall_a, idle_ma, mass, price, pulse, range_deg,
           deadband_us, gears, supplier, datasheet, source, uncertain, spline, case_screw, note=""):
    v_nom = max(torque_kgcm)                                     # use the highest rated voltage as nominal
    stall = kgcm_to_nm(torque_kgcm[v_nom])
    specs = {
        "voltage_v": v_nom, "voltage_range_v": (min(torque_kgcm), max(torque_kgcm)),
        "stall_torque_nm": round(stall, 4), "rated_torque_nm": round(0.3 * stall, 4),
        "stall_torque_kgcm_at_v": {str(v): t for v, t in torque_kgcm.items()},
        "no_load_speed_s_per_60_at_v": {str(v): t for v, t in speed_s60.items()},
        "no_load_speed_rad_s": round(s_per_60_to_rad_s(speed_s60[v_nom]), 3),
        "stall_current_a": stall_a, "current_a": stall_a, "idle_current_ma": idle_ma,
        "control": f"PWM 50 Hz, {pulse[0]}-{pulse[1]} us for {range_deg} deg", "pulse_us": list(pulse),
        "range_deg": range_deg, "deadband_us": deadband_us, "feedback": "none (open-loop position servo)",
        "gears": gears, "spline": spline, "horn": g.horn["kind"], "horn_radius_mm": g.horn["radius"],
        "horn_screw": g.horn["screw"], "case_screw": case_screw,
        "connector": "3-pin 2.54 mm: brown GND, red V+, orange signal",
        "case_mm": (g.L, g.W, g.case_h), "output_offset_mm": g.off, "tab_hole_spacing_mm": (g.hole_dx, g.hole_dy),
        "geometry_source": source,
    }
    if note:
        specs["note"] = note
    if uncertain:
        specs["uncertain"] = [u.split(" (")[0] for u in uncertain]
        specs["uncertain_notes"] = list(uncertain)
    holes = _tab_holes(g) + _horn_holes(g)
    c = Component(
        key=key, name=name, category="actuator", mass_g=mass, price_usd=price, supplier_url=supplier,
        datasheet_url=datasheet, envelope_mm=(1.0, 1.0, 1.0), holes=holes, specs=specs,
        output_frame=((0.0, 0.0, 0.0), (0.0, 0.0, 1.0)), build=_build(g), build_keepout=_keepout(g))
    lo, hi = c.bbox()
    c.envelope_mm = tuple(round(b - a, 2) for a, b in zip(lo, hi))
    return c


SG90 = _servo(
    "hobby_sg90", "TowerPro SG90 micro servo (nylon gears) + cross horn", SG90_G,
    volts=(4.8,), torque_kgcm={4.8: 1.8}, speed_s60={4.8: 0.10}, stall_a=0.65, idle_ma=10, mass=9.0, price=2.5,
    pulse=(500, 2400), range_deg=180, deadband_us=10, gears="nylon", spline="21T, 4.8 mm",
    supplier="https://www.adafruit.com/product/169", datasheet="https://docs.m5stack.com/en/accessory/SG90_Servo",
    source=FREECAD + " Servo-sg90.step + SG90-4-arms-horn.step (CC-BY 3.0)", case_screw="M2 self-tapping (kit screws)",
    uncertain=["stall_current_a (no primary source; 0.65 A is the commonly measured value)", "pulse_us (varies by batch)"],
    note="Nylon gears strip under shock loads; fine for grippers and light wrists.")
MG90S = _servo(
    "hobby_mg90s", "TowerPro MG90S micro servo (metal gears) + cross horn", MG90S_G,
    volts=(4.8, 6.0), torque_kgcm={4.8: 1.8, 6.0: 2.2}, speed_s60={4.8: 0.10, 6.0: 0.08}, stall_a=0.70, idle_ma=10,
    mass=13.4, price=4.0, pulse=(500, 2400), range_deg=180, deadband_us=5, gears="metal", spline="21T, 4.8 mm",
    supplier="https://www.adafruit.com/product/1143", datasheet="https://components101.com/motors/mg90s-metal-gear-servo-motor",
    source=ADAFRUIT + " (MIT)", case_screw="M2 self-tapping (kit screws)",
    uncertain=["stall_current_a", "tab_hole_spacing_mm (from the Adafruit 1143 model; MG90S clones vary +-1 mm)"])
MG996R = _servo(
    "hobby_mg996r", "TowerPro MG996R standard servo (metal gears) + round horn", MG996R_G,
    volts=(4.8, 6.0), torque_kgcm={4.8: 9.4, 6.0: 11.0}, speed_s60={4.8: 0.17, 6.0: 0.14}, stall_a=2.5, idle_ma=10,
    mass=55.0, price=6.0, pulse=(500, 2500), range_deg=180, deadband_us=5, gears="metal", spline="25T, 5.9 mm",
    supplier="https://www.towerpro.com.tw/product/mg996r/",
    datasheet="https://people.ece.cornell.edu/land/courses/ece4760/FinalProjects/f2017/kmv48_rp625/kmv48_rp625/kmv48_rp625/MG996RTowerPro.pdf",
    source=FREECAD + " Futaba3003.stp + big rounded horn (CC-BY 3.0), resized to the MG996R outline", case_screw="M3 (or M2.5) through tabs",
    uncertain=["output_offset_mm (from the Futaba S3003 model)", "range_deg (travel is 120-180 deg depending on batch)"],
    note="Stall current 2.5 A at 6 V: budget the supply for two stalled servos at once.")
DS3218 = _servo(
    "hobby_ds3218", "DSSERVO DS3218 20 kg digital servo (metal gears) + round horn", DS3218_G,
    volts=(5.0, 6.8), torque_kgcm={5.0: 19.0, 6.8: 21.5}, speed_s60={5.0: 0.16, 6.8: 0.14}, stall_a=2.7, idle_ma=10,
    mass=60.0, price=14.0, pulse=(500, 2500), range_deg=180, deadband_us=3, gears="metal (copper/aluminium)",
    spline="25T, 5.9 mm", supplier="https://www.amazon.com/s?k=DS3218", datasheet="https://servodatabase.com/servo/dsservo/ds3218-pro",
    source=FREECAD + " Futaba3003.stp tab pattern, resized to the DS3218 40 x 20 x 40.5 outline", case_screw="M3 through tabs",
    uncertain=["stall_current_a (servodatabase: 2.1-2.9 A)", "output_offset_mm", "case_mm (height split estimated)", "horn (stock horn is aluminium; modelled with the round horn outline)"])

COMPONENTS = [SG90, MG90S, MG996R, DS3218]
