"""Metric fasteners: ISO 4762 socket head cap screws, ISO 4032 hex nuts and
ruthex heat-set threaded inserts.

Frames
* Screw: axis Z, z = 0 is the underside of the head (the clamping face), head
  in +Z, shank towards -Z.  Hole: clamping face, axis -Z, clearance diameter.
* Nut: axis Z, faces at z = 0 and z = m.  Hole: bottom face (screw entry).
* Insert: axis Z, top face flush with the print surface at z = 0, body towards
  -Z.  Hole: top face, thread diameter.  Cut ``print_hole_dia_mm`` (NOT the
  keepout) into the printed part: the knurl is an interference fit by design.

Masses are computed from the ISO nominal geometry (steel 7.85 g/cm³, brass
8.5 g/cm³) — they match ISO/DIN mass tables to within a few percent.
"""
from __future__ import annotations

import math

from .base import Component, Hole, cyl, hexprism, union

ISO4762_URL = "https://www.iso.org/standard/34460.html"
ISO4032_URL = "https://webstore.ansi.org/standards/iso/iso40322012"
SHCS_SUPPLIER = "https://www.mcmaster.com/products/socket-head-screws/"
NUT_SUPPLIER = "https://www.mcmaster.com/products/hex-nuts/"

# thread: dk head dia, k head height, s hex key, clearance (medium, ISO 273), tap drill, pitch, price/pc
SHCS = {
    "M2": dict(dk=3.8, k=2.0, s=1.5, clear=2.4, tap=1.6, pitch=0.4, price=0.10),
    "M2.5": dict(dk=4.5, k=2.5, s=2.0, clear=2.9, tap=2.05, pitch=0.45, price=0.10),
    "M3": dict(dk=5.5, k=3.0, s=2.5, clear=3.4, tap=2.5, pitch=0.5, price=0.08),
    "M4": dict(dk=7.0, k=4.0, s=3.0, clear=4.5, tap=3.3, pitch=0.7, price=0.10),
}
LENGTHS = (6, 8, 10, 12, 16, 20, 25, 30)

# ISO 4032 style 1 hex nuts: s across flats, m height
NUTS = {"M3": dict(s=5.5, m=2.4, price=0.04), "M4": dict(s=7.0, m=3.2, price=0.05)}

# ruthex heat-set inserts: D1 knurl OD, D3 install hole, L length, W min wall
INSERTS = {
    "M3": dict(d1=4.6, d2=3.9, d3=4.0, L=5.7, W=1.6, price=0.12,
               url="https://www.3djake.com/ruthex/threaded-insert-m3-100-pieces"),
    "M4": dict(d1=6.3, d2=5.5, d3=5.6, L=8.1, W=2.1, price=0.18,
               url="https://www.3djake.com/ruthex/threaded-inserts-m4-50-pieces"),
}
STEEL, BRASS = 7.85e-3, 8.5e-3  # g/mm^3


def _nom(t: str) -> float:
    return float(t[1:])


def _shcs_vol(t, L):
    p = SHCS[t]
    d = _nom(t)
    head = math.pi / 4 * p["dk"] ** 2 * p["k"] - (3 * math.sqrt(3) / 2) * (p["s"] / math.sqrt(3)) ** 2 * 0.6 * p["k"]
    shank = math.pi / 4 * (d * 0.92) ** 2 * L  # threaded stress area ~0.85 d^2
    return head + shank


def _shcs_build(c: Component):
    t, L = c.specs["thread"], c.specs["length_mm"]
    p = SHCS[t]
    d = _nom(t)
    head = cyl(p["dk"], 0, p["k"]) - hexprism(p["s"], p["k"] * 0.4, p["k"] + 0.1)
    shank = cyl(d, -L, 0.01)
    return union(head, shank)


def _shcs_keepout(c: Component):
    p = SHCS[c.specs["thread"]]
    # hex-key / driver access straight above the head
    return cyl(p["dk"] + 1.0, p["k"], p["k"] + 30.0)


def _shcs(t: str, L: int) -> Component:
    p = SHCS[t]
    vol = _shcs_vol(t, L)
    specs = {
        "thread": t, "length_mm": float(L), "pitch_mm": p["pitch"], "head_dia_mm": p["dk"],
        "head_height_mm": p["k"], "hex_key_mm": p["s"], "clearance_hole_mm": p["clear"],
        "tap_drill_mm": p["tap"], "counterbore_dia_mm": round(p["dk"] + 0.6, 2),
        "counterbore_depth_mm": round(p["k"] + 0.3, 2), "material": "alloy steel 12.9, black oxide",
        "standard": "ISO 4762", "mass_source": "computed from ISO 4762 nominal geometry",
    }
    return Component(
        key=f"shcs_{t.lower()}x{L}", name=f"Socket head cap screw {t}x{L} (ISO 4762)",
        category="fastener", mass_g=round(vol * STEEL, 3), price_usd=p["price"],
        supplier_url=SHCS_SUPPLIER, datasheet_url=ISO4762_URL,
        envelope_mm=(p["dk"], p["dk"], L + p["k"]),
        holes=[Hole((0.0, 0.0, 0.0), (0.0, 0.0, -1.0), p["clear"], t)],
        specs=specs, build=_shcs_build, build_keepout=_shcs_keepout,
    )


def _nut_build(c: Component):
    s, m, d = c.specs["across_flats_mm"], c.specs["height_mm"], _nom(c.specs["thread"])
    return hexprism(s, 0, m) - cyl(d * 0.85, -1, m + 1)


def _nut(t: str) -> Component:
    p = NUTS[t]
    d = _nom(t)
    ac = p["s"] * 2 / math.sqrt(3)
    vol = (3 * math.sqrt(3) / 2) * (ac / 2) ** 2 * p["m"] - math.pi / 4 * (d * 0.85) ** 2 * p["m"]
    specs = {
        "thread": t, "across_flats_mm": p["s"], "across_corners_mm": round(ac, 2), "height_mm": p["m"],
        "pocket_af_mm": round(p["s"] + 0.3, 2), "pocket_depth_mm": round(p["m"] + 0.3, 2),
        "standard": "ISO 4032", "material": "steel class 8, zinc",
        "mass_source": "computed from ISO 4032 nominal geometry",
    }
    return Component(
        key=f"nut_{t.lower()}", name=f"Hex nut {t} (ISO 4032)", category="fastener",
        mass_g=round(vol * STEEL, 3), price_usd=p["price"], supplier_url=NUT_SUPPLIER,
        datasheet_url=ISO4032_URL, envelope_mm=(round(ac, 3), p["s"], p["m"]),
        holes=[Hole((0.0, 0.0, 0.0), (0.0, 0.0, -1.0), d, t)],
        specs=specs, build=_nut_build,
    )


def _insert_build(c: Component):
    s = c.specs
    L, d1, d2, d = s["length_mm"], s["knurl_od_mm"], s["pilot_od_mm"], _nom(s["thread"])
    body = union(cyl(d1, -L * 0.75, 0), cyl(d2, -L, -L * 0.75 + 0.01))
    return body - cyl(d, -L - 1, 1)


def _insert_keepout(c: Component):
    s = c.specs
    # the screw continues past the insert: keep 3 mm below it free for the tip
    return cyl(_nom(s["thread"]) + 0.6, -s["length_mm"] - 3.0, -s["length_mm"] + 0.01)


def _insert(t: str) -> Component:
    p = INSERTS[t]
    d = _nom(t)
    vol = math.pi / 4 * ((p["d1"] ** 2) * 0.75 * p["L"] + (p["d2"] ** 2) * 0.25 * p["L"] - d ** 2 * p["L"])
    specs = {
        "thread": t, "length_mm": p["L"], "knurl_od_mm": p["d1"], "pilot_od_mm": p["d2"],
        "print_hole_dia_mm": p["d3"], "print_hole_depth_mm": round(p["L"] + 1.0, 2),
        "min_wall_mm": p["W"], "material": "brass", "brand": "ruthex",
        "mass_source": "computed from ruthex nominal geometry",
        "note": "interference fit: cut print_hole_dia_mm, not the keepout",
    }
    return Component(
        key=f"insert_{t.lower()}", name=f"Heat-set insert {t}x{p['L']} (ruthex)", category="insert",
        mass_g=round(vol * BRASS, 3), price_usd=p["price"], supplier_url=p["url"], datasheet_url=p["url"],
        envelope_mm=(p["d1"], p["d1"], p["L"]),
        holes=[Hole((0.0, 0.0, 0.0), (0.0, 0.0, 1.0), d, t)],
        specs=specs, build=_insert_build, build_keepout=_insert_keepout,
    )


COMPONENTS = (
    [_shcs(t, L) for t in SHCS for L in LENGTHS]
    + [_nut(t) for t in NUTS]
    + [_insert(t) for t in INSERTS]
)
