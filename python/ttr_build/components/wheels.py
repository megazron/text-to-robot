"""Wheels (with their shaft interface).

Frame: wheel axis = Z through the origin, the motor-side face of the hub at
z = 0, wheel towards +Z.  Hole: the shaft bore on the motor-side face (axis -Z,
pointing at the motor).  Keepout: the swept tyre envelope plus 2 mm.
"""
from __future__ import annotations

import math

from .base import Component, Hole, box, cyl, polar, tube, union


def _tt_build(c):
    tyre = tube(65.0, 54.0, 0.0, 26.0)
    for k in range(24):  # tread blocks cut into the tyre
        a = 2 * math.pi * k / 24
        tread = box(-1.0, 1.0, 31.0, 33.0, 2.0, 24.0)
        tyre = tyre - tread.rotate(_z(), math.degrees(a))
    rim = tube(54.2, 46.0, 3.0, 23.0)
    web = cyl(46.2, 10.0, 13.0)
    for x, y in polar(6, 30.0, 0.0):
        web = web - cyl(11.0, 9.0, 14.0, x, y)
    hub = cyl(10.0, 0.0, 22.0) - (cyl(5.3, -0.1, 18.0) & box(-1.85, 1.85, -3.0, 3.0, -0.2, 18.1))
    hub = hub - cyl(2.4, 17.0, 22.1)  # self-tapping retaining screw
    return union(tyre, rim, web, hub)


def _z():
    import build123d as bd
    return bd.Axis.Z


def _p90_build(c):
    collar = cyl(12.0, 0.0, 4.2)
    flange = cyl(25.4, 4.2 - 0.01, 9.2)
    hub = (collar + flange) - cyl(6.0, -0.1, 9.3)
    for x, y in _p90_hub_holes():
        hub = hub - cyl(2.5, 4.1, 9.3, x, y)
    tyre = tube(90.0, 80.0, 9.2, 19.2)
    rim = tube(80.2, 74.0, 9.7, 18.7)
    disc = cyl(74.2, 12.2, 15.2) - cyl(6.5, 12.0, 16.0)
    for x, y in polar(6, 50.0, 30.0):
        disc = disc - cyl(16.0, 12.0, 16.0, x, y)
    boss = cyl(28.0, 9.19, 15.2) - cyl(6.5, 9.0, 16.0)
    return union(hub, tyre, rim, disc, boss)


def _p90_hub_holes():
    """6 holes on a 19 mm PCD: two diametric pairs (19.1 mm apart) + one pair 12.7 mm apart.

    The angular layout is our reading of the Pololu text (see specs['uncertain'])."""
    r = 9.5
    half = math.degrees(math.asin(12.7 / (2 * r)))
    angs = (0.0, 90.0, 180.0, 270.0, 180.0 - half, 180.0 + half)
    return [(r * math.cos(math.radians(t)), r * math.sin(math.radians(t))) for t in angs]


def _keepout(D, z0, z1):
    def ko(c):
        return cyl(D + 4.0, z0 - 2.0, z1 + 2.0) - cyl(D * 0.5, z0 - 2.1, z0)  # leave room for the motor face
    return ko


TT65 = Component(
    key="wheel_65mm_tt", name="65 mm rubber wheel for TT gearmotors (double-D 5.3x3.7 bore)", category="wheel",
    mass_g=36.3, price_usd=2.0, supplier_url="https://makerlab-electronics.com/products/65mm-yellow-wheel",
    datasheet_url="https://makerlab-electronics.com/products/65mm-yellow-wheel",
    envelope_mm=(65.0, 65.0, 26.0), holes=[Hole((0.0, 0.0, 0.0), (0.0, 0.0, -1.0), 5.3, None)],
    specs={"od_mm": 65.0, "width_mm": 26.0, "bore": "double-D 5.3 x 3.7 mm (TT gearmotor)",
           "retaining_screw": "M2.5 self-tapping into shaft end", "material": "ABS rim, rubber tyre",
           "uncertain": ["bore", "price_usd"]},
    build=_tt_build, build_keepout=_keepout(65.0, 0.0, 26.0),
)

P90 = Component(
    key="wheel_90mm_37d", name="Pololu 90x10 mm wheel + 6 mm universal aluminium hub (for 37D gearmotors)",
    category="wheel", mass_g=31.3, price_usd=11.22, supplier_url="https://www.pololu.com/product/1435",
    datasheet_url="https://www.pololu.com/file/0J161/1083-6mm-4-40-hub-dimensions.pdf",
    envelope_mm=(90.0, 90.0, 19.2), holes=[Hole((0.0, 0.0, 0.0), (0.0, 0.0, -1.0), 6.0, None)],
    specs={"od_mm": 90.0, "width_mm": 10.0, "bore_mm": 6.0, "hub": "Pololu #1999 (M3) / #1083 (#4-40)",
           "hub_flange_d_mm": 25.4, "hub_holes": "6 on 19 mm PCD, pairs 12.7 / 19.1 mm apart",
           "set_screws": 2, "parts": {"wheel_1435_each_g": 23.0, "hub_g": 6.8, "screws_g": 1.5},
           "note": "Pololu sells no 100 mm wheel for the 6 mm hub; 90 mm is the closest catalogue size",
           "hub_hole_angles_deg": "0/90/180/270 + 180+-41.9",
           "uncertain": ["mass_g", "hub_hole_angles_deg"]},
    build=_p90_build, build_keepout=_keepout(90.0, 0.0, 19.2),
)

COMPONENTS = [TT65, P90]
