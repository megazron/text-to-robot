"""Batteries, mains PSU and DC-DC converter.

LiPo frame: pack along +X from x = 0, centred on Y, bottom at z = 0; leads
leave the -X end.  Packs have no screw holes (strap or clamp them); the
keepout reserves lead/connector space and a 1 mm swelling allowance.
"""
from __future__ import annotations

from .base import Component, Hole, box, cyl, cyl_between, rbox, union
from .shapes import pcb, pcb_holes, pack


def _lipo(key, name, cells, mah, L, W, H, mass, price, c_rating, plug, supplier, datasheet, uncertain):
    def build(c):
        return pack(L, W, H)

    def keepout(c):
        return union(rbox(-0.5, L + 0.5, -W / 2 - 0.5, W / 2 + 0.5, -0.0, H + 1.0, 2.0),  # swelling allowance
                     box(-60.0, -12.0 + 0.01, -W / 2, W / 2, 0.0, H))                    # leads + plug
    specs = {"cells": cells, "capacity_mah": mah, "voltage_v": round(3.7 * cells, 1),
             "voltage_max_v": round(4.2 * cells, 1), "energy_wh": round(3.7 * cells * mah / 1000, 1),
             "c_rating": c_rating, "max_current_a": round(c_rating * mah / 1000, 1), "plug": plug,
             "mount": "hook-and-loop strap / printed cradle; never screw into a pack"}
    if uncertain:
        specs["uncertain"] = list(uncertain)
    return Component(key=key, name=name, category="battery", mass_g=mass, price_usd=price,
                     supplier_url=supplier, datasheet_url=datasheet, envelope_mm=(L + 12.0, W, H), holes=[],
                     specs=specs, build=build, build_keepout=keepout)


# ------------------------------------------------------------- Mean Well LRS-75-12 (12 V 6 A)
LRS_HOLES = ([Hole((x, 45.5, 0.0), (0.0, 0.0, -1.0), 2.5, "M3") for x in (20.5, 75.5)]
             + [Hole((10.0, 0.0, 15.0), (0.0, -1.0, 0.0), 2.5, "M3"),
                Hole((84.0, 0.0, 14.5), (0.0, -1.0, 0.0), 2.5, "M3")])


def _lrs_build(c):
    case = box(0.0, 99.0, 0.0, 97.0, 0.0, 30.0)
    case = case - box(-0.1, 10.5, 4.0, 60.0, 3.0, 30.1)              # terminal block recess
    term = union(*[box(0.5, 10.0, 6.0 + k * 9.5, 13.5 + k * 9.5, 3.0, 22.0) for k in range(5)])
    for x in range(30, 92, 8):                                      # top vent slots
        case = case - box(x, x + 3.0, 15.0, 80.0, 29.0, 30.1)
    for h in LRS_HOLES:
        p = h.pos
        if h.axis[2] < 0:
            case = case - cyl(2.5, -0.1, 3.0, p[0], p[1])
        else:
            case = case - cyl_between(2.5, (p[0], -0.1, p[2]), (p[0], 5.0, p[2]))
    return union(case, term)


def _lrs_keepout(c):
    return union(box(-30.0, 10.5 + 0.01, 4.0, 60.0, 3.0, 45.0),   # wiring + screwdriver access
                 box(25.0, 95.0, 10.0, 85.0, 30.0 - 0.01, 40.0))  # convection space above the vents


PSU = Component(
    key="psu_12v_lrs75", name="Mean Well LRS-75-12 enclosed PSU, 12 V 6 A (75 W)", category="misc",
    mass_g=230.0, price_usd=22.0, supplier_url="https://www.digikey.com/en/products/result?keywords=LRS-75-12",
    datasheet_url="https://www.meanwell.com/Upload/PDF/LRS-75/LRS-75-SPEC.PDF",
    envelope_mm=(99.0, 97.0, 30.0), holes=LRS_HOLES,
    specs={"voltage_v": 12.0, "current_a": 6.0, "power_w": 75.0, "input_vac": (85, 264),
           "terminals": "AC L, AC N, FG, -V, +V (9.5 mm pitch)", "bottom_screw_depth_max_mm": 3.0,
           "side_screw_depth_max_mm": 5.0,
           "note": "satisfies a 12 V / 5 A requirement with 20 % margin; Mean Well's 12 V 5 A frame is LRS-75",
           "uncertain": ["price_usd"]},
    build=_lrs_build, build_keepout=_lrs_keepout,
)

# --------------------------------------------------------------- Pololu D36V50F5 5 V 5.5 A
BUCK_HOLES = [(2.54, 2.54), (22.86, 2.54), (22.86, 22.86)]


def _buck_build(c):
    return pcb(25.4, 25.4, 1.6, BUCK_HOLES, 2.18, parts=[
        (6.0, 19.0, 6.0, 19.0, 7.9),    # shielded inductor (tallest part)
        (2.0, 6.0, 8.0, 20.0, 3.0),     # input caps
        (19.5, 24.0, 6.0, 18.0, 2.5),   # output caps / regulator
    ], r=0.8)


BUCK = Component(
    key="buck_5v_5a", name="Pololu D36V50F5 5 V 5.5 A step-down regulator (#4091)", category="misc",
    mass_g=7.0, price_usd=39.95, supplier_url="https://www.pololu.com/product/4091",
    datasheet_url="https://www.pololu.com/product/4091",
    envelope_mm=(25.4, 25.4, 9.5), holes=pcb_holes(BUCK_HOLES, 2.18, "M2"),
    specs={"voltage_v": 5.0, "current_a": 5.5, "input_v": (5.5, 50.0), "hole_dia_mm": 2.18,
           "hole_positions_mm": BUCK_HOLES, "uncertain": ["hole_positions_mm"]},
    build=_buck_build,
)

COMPONENTS = [
    _lipo("lipo_3s_2200", "LiPo 3S 2200 mAh 25C, XT60 (Gens Ace G-Tech)", 3, 2200, 107.0, 33.5, 22.0, 173.5,
          27.0, 25, "XT60",
          "https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug",
          "https://www.buddyrc.com/products/gens-ace-25c-2200mah-11-1v-3s-lipo-battery-pack-with-xt60-plug",
          ["price_usd"]),
    _lipo("lipo_3s_5000", "LiPo 3S 5000 mAh 60C, XT60 (Gens Ace G-Tech)", 3, 5000, 154.0, 42.5, 24.7, 355.0,
          59.99, 60, "XT60",
          "https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug",
          "https://classicrcshop.com/products/gens-ace-5000mah-3s-60c-11-1v-g-tech-lipo-battery-pack-with-xt60-plug",
          ["price_usd", "envelope_mm"]),
    _lipo("lipo_4s_5000", "LiPo 4S 5000 mAh 60C, XT90 (Gens Ace G-Tech)", 4, 5000, 137.0, 43.0, 34.0, 436.0,
          57.0, 60, "XT90",
          "https://www.unmannedtechshop.co.uk/de/products/gens-ace-g-tech-5000mah-14-8v-4s-60c-lipo-battery-pack-xt90",
          "https://www.unmannedtechshop.co.uk/de/products/gens-ace-g-tech-5000mah-14-8v-4s-60c-lipo-battery-pack-xt90",
          ["price_usd"]),
    _lipo("lipo_6s_10000", "LiPo 6S 10000 mAh 30C, EC5 (Tattu)", 6, 10000, 176.0, 66.0, 58.0, 1350.0, 216.99, 30,
          "EC5", "https://www.buddyrc.com/products/tattu-22-2v-30c-6s-10000mah-lipo-battery-pack-with-ec5-plug-for-uav-drone",
          "https://www.buddyrc.com/products/tattu-22-2v-30c-6s-10000mah-lipo-battery-pack-with-ec5-plug-for-uav-drone",
          []),
    PSU,
    BUCK,
]
