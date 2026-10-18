"""Deep-groove ball bearings (ISO 15 boundary dimensions).

Frame: bearing axis = Z, centred on the origin, faces at z = ±width/2.
Holes: the bore (shaft seat) on the +Z face.  ``specs['housing_bore_mm']`` is
the OD the printed housing must hold.
"""
from __future__ import annotations

from .base import Component, Hole, cyl, tube, union

# key, ISO designation, d, D, B, mass g, C kN, C0 kN, price USD, uncertain
_DATA = [
    ("608zz", "608-2Z", 8, 22, 7, 12.0, 3.45, 1.37, 0.60, []),
    ("625zz", "625-2Z", 5, 16, 5, 4.8, 1.14, 0.38, 0.55, []),
    ("6800zz", "61800-2Z (6800ZZ)", 10, 19, 5, 5.5, 1.72, 0.83, 0.90, []),
    ("6803zz", "61803-2Z (6803ZZ)", 17, 26, 5, 7.8, 2.03, 1.27, 1.20, ["dynamic_load_kn", "static_load_kn"]),
    ("6806zz", "61806-2Z (6806ZZ)", 30, 42, 7, 23.0, 4.5, 3.4, 2.50, []),
    ("6808", "61808-2RZ (6808 thin section)", 40, 52, 7, 30.0, 4.94, 3.45, 3.50,
     ["mass_g", "dynamic_load_kn", "static_load_kn"]),
]

_DS = {
    "608zz": "https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-608-2Z",
    "625zz": "https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-625-2Z",
    "6800zz": "https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-61800-2Z",
    "6803zz": "https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-61803-2Z",
    "6806zz": "https://www.qualitybearingsonline.ca/61806-timken-thin-section-30x42x7mm/",
    "6808": "https://www.skf.com/group/products/rolling-bearings/ball-bearings/deep-groove-ball-bearings/productid-61808-2RZ",
}


def _rings(d, D):
    """Inner-ring OD and outer-ring ID (approx. 30 % of the section each)."""
    sec = (D - d) / 2
    return d + 2 * 0.32 * sec, D - 2 * 0.32 * sec


def _build(c: Component):
    d, D, B = c.specs["bore_mm"], c.specs["od_mm"], c.specs["width_mm"]
    i_od, o_id = _rings(d, D)
    inner = tube(i_od, d, -B / 2, B / 2)
    outer = tube(D, o_id, -B / 2, B / 2)
    shield = tube(o_id + 0.2, i_od + 0.3, -B / 2 + 0.3, B / 2 - 0.3)  # shields + ball cage
    return union(inner, outer, shield)


def _keepout(c: Component):
    # Printed shoulders may touch the inner OR outer ring faces, never the shields.
    d, D, B = c.specs["bore_mm"], c.specs["od_mm"], c.specs["width_mm"]
    i_od, o_id = _rings(d, D)
    return tube(o_id, i_od, -B / 2 - 0.6, B / 2 + 0.6)


def _make(row) -> Component:
    key, desig, d, D, B, m, C, C0, price, unc = row
    i_od, o_id = _rings(d, D)
    specs = {
        "designation": desig, "bore_mm": float(d), "od_mm": float(D), "width_mm": float(B),
        "dynamic_load_kn": C, "static_load_kn": C0,
        "housing_bore_mm": float(D), "shaft_mm": float(d),
        "inner_ring_od_mm": round(i_od, 2), "outer_ring_id_mm": round(o_id, 2),
        "housing_shoulder_max_d_mm": round(o_id + 0.2, 2),
        "shaft_shoulder_min_d_mm": round(i_od - 0.2, 2),
        "material": "chrome steel 52100, steel shields",
    }
    if unc:
        specs["uncertain"] = list(unc)
    return Component(
        key=f"bearing_{key}", name=f"Ball bearing {desig} {d}x{D}x{B} mm", category="bearing",
        mass_g=m, price_usd=price,
        supplier_url=f"https://www.vxb.com/search?q={desig.split()[0]}",
        datasheet_url=_DS[key],
        envelope_mm=(float(D), float(D), float(B)),
        holes=[Hole((0.0, 0.0, B / 2), (0.0, 0.0, 1.0), float(d), None)],
        specs=specs, build=_build, build_keepout=_keepout,
    )


COMPONENTS = [_make(r) for r in _DATA]
