"""Linear motion parts: T8 lead screw + brass nut, hardened 8 mm rods, LM8UU bushings,
the 5-to-8 mm motor coupler, and aluminium tube stock for struts.

Frames
* Lead screw / rod / tube: axis Z, z = 0 at the bottom end, the part extends to +Z.
* Lead nut: axis Z, flange mounting face at z = 0 facing +Z (the carriage sits
  above it), flange towards -Z, the nut body rises into a bore in the carriage (+Z).
* LM8UU: axis Z, centred on the origin, faces at z = +-12.
* Coupler: axis Z, motor (5 mm) bore from z = 0, screw (8 mm) bore from the z = 25 end.

Lead-screw efficiency: eta = tan(lambda) / tan(lambda + phi) with the lead angle
lambda = atan(lead / (pi * d_mean)) and phi = atan(mu); mu for a greased brass nut on
stainless steel is 0.1-0.2, so efficiency and friction are listed as uncertain.
"""
from __future__ import annotations

import math

from .base import Component, Hole, cyl, polar, tube, union

STEEL = 7.85e-3  # g/mm^3


def lead_efficiency(lead_mm: float, d_mean_mm: float, mu: float) -> tuple[float, float]:
    """(driving efficiency, back-driving efficiency) of a sliding-contact screw."""
    lam = math.atan(lead_mm / (math.pi * d_mean_mm))
    phi = math.atan(mu)
    fwd = math.tan(lam) / math.tan(lam + phi)
    back = math.tan(lam - phi) / math.tan(lam) if lam > phi else 0.0
    return round(fwd, 3), round(back, 3)


# --------------------------------------------------------------- T8 x 8 lead screw, 300 mm
def _t8_build(c: Component):
    L = c.specs["length_mm"]
    core = cyl(8.0, 0.6, L - 0.6)
    ends = union(cyl(7.0, 0.0, 0.61), cyl(7.0, L - 0.61, L))  # chamfered ends
    return union(core, ends)


ETA, ETA_BACK = lead_efficiency(8.0, 7.0, 0.15)

T8_SCREW = Component(
    key="leadscrew_t8x8_300", name="Lead screw Tr8x8 (P2, 4 starts) 300 mm, stainless steel",
    category="misc", mass_g=round(math.pi / 4 * 7.2 ** 2 * 300 * STEEL, 1), price_usd=9.0,
    supplier_url="https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut",
    datasheet_url="https://www.iso.org/standard/12719.html",
    envelope_mm=(8.0, 8.0, 300.0), holes=[],
    specs={"thread": "Tr8x8 (P2)", "lead_mm": 8.0, "pitch_mm": 2.0, "starts": 4, "length_mm": 300.0,
           "major_d_mm": 8.0, "mean_d_mm": 7.0, "friction_mu": 0.15, "efficiency": ETA,
           "backdrive_efficiency": ETA_BACK, "material": "SUS303/304",
           "no_mounting_holes": True,
           "mount": "bottom end in a 608 bearing, top end in a 5-to-8 mm coupler on the motor shaft",
           "note": "the common 3D-printer 'T8' screw; thread form per ISO 2904 trapezoidal; mass from a 7.2 mm"
                   " equivalent solid diameter",
           "uncertain": ["friction_mu", "efficiency", "backdrive_efficiency", "price_usd", "supplier_url"]},
    build=_t8_build,
)

# --------------------------------------------------------------- T8 brass flange nut
NUT_HOLES = [Hole((x, y, 0.0), (0.0, 0.0, 1.0), 3.5, None) for x, y in polar(4, 16.0, 45.0)]


def _nut_build(c: Component):
    flange = cyl(22.0, -3.5, 0.0)
    for h in NUT_HOLES:
        flange = flange - cyl(3.5, -3.6, 0.1, h.pos[0], h.pos[1])
    body = cyl(10.2, -0.01, 11.5)
    return union(flange, body) - cyl(8.2, -4.0, 12.0)  # threaded bore, modelled at the screw's major diameter


def _nut_keepout(c: Component):
    return cyl(9.0, -60.0, 70.0)  # the screw passing through


T8_NUT = Component(
    key="leadnut_t8_brass", name="Tr8x8 brass flange nut (22 mm flange, 4x M3 on PCD 16)", category="misc",
    mass_g=12.0, price_usd=2.5,
    supplier_url="https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut",
    datasheet_url="https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut",
    envelope_mm=(22.0, 22.0, 15.0), holes=NUT_HOLES + [Hole((0.0, 0.0, 11.5), (0.0, 0.0, 1.0), 8.2, None)],
    specs={"round_profile_mm": [[11.0, -3.5, 0.0], [5.1, 0.0, 11.5]], "lead_mm": 8.0, "flange_d_mm": 22.0, "flange_t_mm": 3.5, "body_d_mm": 10.2, "length_mm": 15.0,
           "hole_pcd_mm": 16.0, "hole_dia_mm": 3.5, "material": "brass",
           "carriage_bore_mm": 10.6, "uncertain": ["mass_g", "price_usd"]},
    build=_nut_build, build_keepout=_nut_keepout,
)


# --------------------------------------------------------------- hardened 8 mm rods
def _rod(length: int) -> Component:
    def build(c: Component):
        return union(cyl(8.0, 0.5, length - 0.5), cyl(7.0, 0.0, 0.51), cyl(7.0, length - 0.51, length))
    return Component(
        key=f"rod_8mm_h8_{length}", name=f"Hardened chromed linear rod 8 mm h6, {length} mm", category="misc",
        mass_g=round(math.pi / 4 * 64 * length * STEEL, 1), price_usd=round(3.0 + length * 0.012, 2),
        supplier_url="https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/",
        datasheet_url="https://us.misumi-ec.com/vona2/mech/M0100000000/M0101000000/M0101010000/",
        envelope_mm=(8.0, 8.0, float(length)), holes=[],
        specs={"d_mm": 8.0, "length_mm": float(length), "tolerance": "h6", "hardness": "HRC 58-62 (induction)",
               "no_mounting_holes": True, "mount": "ends clamped in printed pockets (8.0 mm, set screw)",
               "uncertain": ["price_usd"]},
        build=build,
    )


# --------------------------------------------------------------- LM8UU linear ball bushing
def _lm8_build(c: Component):
    shell = tube(15.0, 11.0, -12.0, 12.0)
    for z in (-8.75, 8.75):  # retaining-ring grooves (B = 17.5 mm)
        shell = shell - tube(15.2, 14.3, z - 0.55, z + 0.55)
    balls = tube(11.2, 8.0, -12.0, 12.0)  # ball tracks, retainer and end seals
    return union(shell, balls)


def _lm8_keepout(c: Component):
    return cyl(8.2, -40.0, 40.0)  # the rod


LM8UU = Component(
    key="lm8uu", name="Linear ball bushing LM8UU (8 x 15 x 24 mm)", category="bearing", mass_g=16.0, price_usd=1.2,
    supplier_url="https://www.aliexpress.com/w/wholesale-lm8uu.html",
    datasheet_url="https://www.samickthk.co.kr/en/",
    envelope_mm=(15.0, 15.0, 24.0), holes=[Hole((0.0, 0.0, 12.0), (0.0, 0.0, 1.0), 8.0, None)],
    specs={"bore_mm": 8.0, "od_mm": 15.0, "length_mm": 24.0, "housing_bore_mm": 15.0,
           "dynamic_load_n": 274.0, "static_load_n": 392.0, "friction_coefficient": 0.003,
           "ring_groove_span_mm": 17.5, "uncertain": ["mass_g", "friction_coefficient", "supplier_url"]},
    build=_lm8_build, build_keepout=_lm8_keepout,
)


# --------------------------------------------------------------- 5 -> 8 mm flexible coupler
def _cpl_build(c: Component):
    body = cyl(19.0, 0.0, 25.0)
    for z in (6.0, 9.5, 13.0, 16.5):  # helical-beam slots (as rings)
        body = body - tube(19.2, 13.0, z, z + 1.2)
    body = body - cyl(5.2, -0.1, 11.0) - cyl(8.2, 14.0, 25.1)  # bores with slip clearance
    return body


COUPLER = Component(
    key="coupler_5x8", name="Aluminium flexible beam coupler 5 mm to 8 mm (D19 L25)", category="misc",
    mass_g=10.0, price_usd=2.5,
    supplier_url="https://www.robotdigg.com/product/27/Flexible-Coupler",
    datasheet_url="https://www.robotdigg.com/product/27/Flexible-Coupler",
    envelope_mm=(19.0, 19.0, 25.0),
    holes=[Hole((0.0, 0.0, 0.0), (0.0, 0.0, -1.0), 5.2, None), Hole((0.0, 0.0, 25.0), (0.0, 0.0, 1.0), 8.2, None)],
    specs={"bore_a_mm": 5.0, "bore_b_mm": 8.0, "od_mm": 19.0, "length_mm": 25.0, "rated_torque_nm": 1.5,
           "clamp": "2x M3 set screws per hub", "uncertain": ["rated_torque_nm", "mass_g", "price_usd"]},
    build=_cpl_build,
)


# --------------------------------------------------------------- 6061 aluminium tube stock
def _tube(od: float, wall: float, price: float) -> Component:
    L = 1000.0
    idia = od - 2 * wall
    mass = math.pi / 4 * (od ** 2 - idia ** 2) * L * 2.70e-3

    def build(c: Component):
        return tube(od, idia, 0.0, L)
    return Component(
        key=f"al_tube_{int(od)}x{int(wall)}_1m", name=f"6061-T6 aluminium round tube {od:g} x {wall:g} mm, 1 m",
        category="misc", mass_g=round(mass, 1), price_usd=price,
        supplier_url="https://www.metalsupermarkets.com/metals/aluminum/",
        datasheet_url="https://asm.matweb.com/search/SpecificMaterial.asp?bassnum=ma6061t6",
        envelope_mm=(od, od, L), holes=[],
        specs={"od_mm": od, "wall_mm": wall, "id_mm": idia, "length_mm": L, "alloy": "6061-T6",
               "yield_mpa": 276.0, "youngs_gpa": 68.9, "density_g_cm3": 2.70, "no_mounting_holes": True,
               "kg_per_m": round(mass / 1000.0, 4), "mount": "cut to length, clamped in printed split sockets",
               "uncertain": ["price_usd"]},
        build=build,
    )


COMPONENTS = [T8_SCREW, T8_NUT, _rod(110), _rod(130), _rod(300), LM8UU, COUPLER,
              _tube(25.0, 2.0, 16.0), _tube(20.0, 2.0, 13.0)]
