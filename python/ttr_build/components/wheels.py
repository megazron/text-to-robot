"""Wheels (with their shaft interface).

Frame: wheel axis = Z through the origin, the motor-side face of the hub at
z = 0, wheel towards +Z.  Hole: the shaft bore on the motor-side face (axis -Z,
pointing at the motor).  Keepout: the swept tyre envelope plus 2 mm.
"""
from __future__ import annotations

import math

from .base import Component, Hole, box, cyl, cyl_between, polar, tube, union


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



# ------------------------------------------- goBILDA 96 mm mecanum + 1309 6 mm D-bore sonic hub
MEC_HUB_T = 8.0     # sonic hub between the motor shaft and the wheel side plate
MEC_W = 38.0        # wheel width (roller envelope), see uncertain
MEC_N = 10          # rollers


def _mec_build(c):
    hub = cyl(16.0, 0.0, MEC_HUB_T) - cyl(6.0, -0.1, MEC_HUB_T + 0.1)
    hub = hub + (cyl(30.0, MEC_HUB_T - 3.0, MEC_HUB_T) - cyl(6.0, -0.1, MEC_HUB_T + 0.1))
    z0, z1 = MEC_HUB_T, MEC_HUB_T + MEC_W
    plates = [cyl(82.0, z, z + 2.0) - cyl(14.0, z - 0.1, z + 2.1) for z in (z0, z1 - 2.0)]
    core = tube(46.0, 14.0, z0, z1)
    rollers = []
    for k in range(MEC_N):
        a = 2 * math.pi * k / MEC_N
        # roller axis at 45 deg to the wheel axis, tangent to the wheel, centred on a 38 mm radius
        cx, cy = 38.0 * math.cos(a), 38.0 * math.sin(a)
        tx, ty = -math.sin(a), math.cos(a)
        h = (MEC_W - 6.0) / 2
        zc = (z0 + z1) / 2
        p0 = (cx - tx * h, cy - ty * h, zc - h)
        p1 = (cx + tx * h, cy + ty * h, zc + h)
        rollers.append(cyl_between(18.0, p0, p1))
    return union(hub, *plates, core, *rollers)


MEC96 = Component(
    key="mecanum_96mm_gobilda", name="goBILDA 96 mm mecanum wheel (3213-3606-0002, 70A rollers) + 1309 6 mm D-bore sonic hub",
    category="wheel", mass_g=207.0 + 9.6, price_usd=round(169.99 / 4 + 7.99, 2),
    supplier_url="https://www.gobilda.com/96mm-mecanum-wheel-set-70a-durometer-bearing-supported-rollers/",
    datasheet_url="https://servocity.com/96mm-mecanum-wheel-set-70a-durometer-bearing-supported-rollers",
    envelope_mm=(96.0, 96.0, MEC_HUB_T + MEC_W), holes=[Hole((0.0, 0.0, 0.0), (0.0, 0.0, -1.0), 6.0, None)],
    specs={"od_mm": 96.0, "width_mm": MEC_W, "bore_mm": 6.0, "bore": "6 mm D (goBILDA 1309-0016-1006 sonic hub)",
           "hub_mass_g": 9.6, "wheel_mass_g": 207.0, "rollers": MEC_N, "roller_durometer": "70A",
           "sold_as": "set of 4 (2 left-hand + 2 right-hand), $169.99 per set",
           "hub_offset_mm": MEC_HUB_T, "set_screw": "hub clamps the 6 mm D shaft (Pololu 37D)",
           "note": "rollers modelled as 45 deg cylinders; mount left/right-hand wheels in an X pattern seen from above",
           "uncertain": ["width_mm", "rollers", "hub_offset_mm", "price_usd"]},
    build=_mec_build, build_keepout=_keepout(96.0, MEC_HUB_T, MEC_HUB_T + MEC_W),
)

# ----------------------------------------- Pololu ball caster, 1" POM ball with ball bearings (#2692)
# Frame: top (mounting) face at z = 0, housing below, ball touching the floor at z = -29.
BC_H, BC_BALL = 29.0, 25.4
BC_HOLES = [Hole((15.0 * math.cos(math.radians(a)), 15.0 * math.sin(math.radians(a)), 0.0), (0.0, 0.0, 1.0), 3.2, None)
            for a in (90.0, 210.0, 330.0)]


def _bc_build(c):
    zc = -BC_H + BC_BALL / 2
    flange = cyl(38.0, -3.0, 0.0)
    for h in BC_HOLES:
        flange = flange - cyl(3.2, -3.1, 0.1, h.pos[0], h.pos[1])
    cup = cyl(30.0, zc, -2.99) - cyl(BC_BALL + 1.0, zc - 0.1, zc + 2.0)
    import build123d as bd
    ball = bd.Pos(0, 0, zc) * bd.Sphere(BC_BALL / 2)
    return union(flange, cup, ball)


BALL_CASTER = Component(
    key="ball_caster_pololu_2692", name="Pololu ball caster, 1\" POM ball on ball bearings (#2692)", category="wheel",
    mass_g=18.4, price_usd=9.95, supplier_url="https://www.pololu.com/product/2692",
    datasheet_url="https://www.pololu.com/product/2692",
    envelope_mm=(38.0, 38.0, BC_H), holes=BC_HOLES,
    specs={"ball_d_mm": BC_BALL, "height_mm": BC_H, "ball_center_z_mm": -BC_H + BC_BALL / 2,
           "max_robot_mass_kg": 4.5, "screws": "3x M3 / #4",
           "note": "rated by Pololu for differential-drive robots up to about ten pounds",
           "hole_positions_mm": "3 holes on a 30 mm circle (our reading; Pololu gives 0.48 in hole spacing)",
           "uncertain": ["hole_positions_mm", "housing_d_mm"], "housing_d_mm": 38.0},
    build=_bc_build,
)

COMPONENTS = [TT65, P90, MEC96, BALL_CASTER]
