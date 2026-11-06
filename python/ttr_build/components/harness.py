"""Harness parts every wired robot needs: main switches, fuse holders, lever splices, a mains inlet.

Panel parts: component z along the outward normal, flange on the outside of the wall (z >= 0), body behind it (z < 0);
component x runs along the short side of the cut-out. ``specs['body_mm']`` is the part behind the flange: the piece that
passes through the wall, used for clearance checks.
"""
from __future__ import annotations

from .base import Component, box, union


def _panel(fx, fy, ft, bx, by, depth):
    def build(c):
        return union(box(-fx / 2, fx / 2, -fy / 2, fy / 2, 0.0, ft), box(-bx / 2, bx / 2, -by / 2, by / 2, -depth, 0.01))
    return build


def _rocker(key, name, flange, body, depth, cut, rating, price, url):
    return Component(
        key=key, name=name, category="misc", mass_g=8.0, price_usd=price, supplier_url=url, datasheet_url=url,
        envelope_mm=(flange[0], flange[1], depth + 2.5), holes=[],
        specs={"panel_cutout_mm": list(cut), "rating": rating, "mount": "snaps into the panel cut-out", "no_mounting_holes": True,
               "body_mm": {"min": [-body[0] / 2, -body[1] / 2, -depth], "max": [body[0] / 2, body[1] / 2, -2.6]}, "uncertain": ["mass_g", "price_usd"]},
        build=_panel(flange[0], flange[1], 2.5, body[0], body[1], depth))


SEARCH = "https://www.aliexpress.com/w/wholesale-{}.html"
KCD1 = _rocker("switch_kcd1", "KCD1 rocker switch, SPST, 6 A 250 VAC / 10 A 125 VAC", (15.0, 21.0), (13.0, 19.0), 19.1, (13.0, 19.0), "6 A 250 VAC, 10 A 125 VAC", 0.3, SEARCH.format("kcd1-rocker-switch"))
KCD4 = _rocker("switch_kcd4", "KCD4 double-pole rocker switch, 16 A 250 VAC / 20 A 125 VAC", (25.0, 31.0), (22.0, 30.0), 25.5, (22.0, 30.0), "16 A 250 VAC, 20 A 125 VAC", 1.0, SEARCH.format("kcd4-rocker-switch"))

FUSE_HOLDER = Component(
    key="fuse_holder_atm_inline", name="Inline ATM mini blade fuse holder, 30 A class (Littelfuse FHM)", category="misc",
    mass_g=12.0, price_usd=2.5, supplier_url="https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders",
    datasheet_url="https://www.digikey.com/en/product-highlight/l/littelfuse-commercial-vehicle-products/fhac-fhm-series-in-line-fuse-holders",
    envelope_mm=(41.0, 14.0, 12.0), holes=[], specs={"voltage_v": 32, "current_a": 30, "no_mounting_holes": True, "mount": "inline in the harness, tied down in the compartment", "uncertain": ["mass_g", "price_usd", "envelope_mm"]},
    build=lambda c: box(0.0, 41.0, -7.0, 7.0, 0.0, 12.0))

LEVER = Component(
    key="wago_221_415", name="WAGO 221-415 five-way lever splice", category="misc",
    mass_g=4.0, price_usd=0.8, supplier_url="https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415",
    datasheet_url="https://www.wago.com/global/electrical-interconnections/compact-splicing-connector/p/221-415",
    envelope_mm=(20.2, 18.6, 8.5), holes=[], specs={"voltage_v": 450, "current_a": 32, "wire": "24-12 AWG", "no_mounting_holes": True, "mount": "tied to a strain-relief anchor in the compartment", "uncertain": ["mass_g", "price_usd", "envelope_mm", "current_a"]},
    build=lambda c: box(0.0, 20.2, -9.3, 9.3, 0.0, 8.5))

IEC_INLET = Component(
    key="iec_c14_fused_switched", name="IEC C14 panel inlet with fuse drawer and rocker switch, 10 A", category="misc",
    mass_g=40.0, price_usd=3.0, supplier_url=SEARCH.format("iec-c14-inlet-fuse-switch"), datasheet_url=SEARCH.format("iec-c14-inlet-fuse-switch"),
    envelope_mm=(30.0, 49.0, 34.0), holes=[], specs={"panel_cutout_mm": [27.5, 47.0], "rating": "10 A 250 VAC", "no_mounting_holes": True, "mount": "snaps into the panel cut-out",
           "body_mm": {"min": [-13.7, -23.4, -32.0], "max": [13.7, 23.4, -2.6]}, "uncertain": ["mass_g", "price_usd", "envelope_mm", "panel_cutout_mm"]},
    build=_panel(30.0, 49.0, 2.5, 27.4, 46.8, 32.0))

BATTERY_SWITCH = Component(
    key="switch_battery_6006", name="Blue Sea 6006 m-Series battery switch, ON-OFF, 48 VDC", category="misc",
    mass_g=190.0, price_usd=35.0, supplier_url="https://www.bluesea.com/products/6006", datasheet_url="https://www.bluesea.com/products/6006",
    envelope_mm=(70.0, 70.0, 60.0), holes=[], specs={"panel_cutout_mm": [52.0, 52.0], "rating": "275 A continuous, 48 VDC max", "no_mounting_holes": True, "mount": "panel, through a 52 mm hole",
           "body_mm": {"min": [-26.0, -26.0, -55.0], "max": [26.0, 26.0, -2.6]}, "uncertain": ["mass_g", "price_usd"]},
    build=_panel(70.0, 70.0, 5.0, 52.0, 52.0, 55.0))

FUSE_ANL = Component(
    key="fuse_holder_anl", name="ANL fuse holder, 58 V class, 35-300 A", category="misc",
    mass_g=60.0, price_usd=9.0, supplier_url="https://www.bluesea.com/products/category/62/ANL_Fuses", datasheet_url="https://www.bluesea.com/products/category/62/ANL_Fuses",
    envelope_mm=(90.0, 36.0, 25.0), holes=[], specs={"voltage_v": 58, "current_a": 300, "no_mounting_holes": True, "mount": "tied into the harness", "uncertain": ["mass_g", "price_usd", "envelope_mm", "voltage_v"]},
    build=lambda c: box(0.0, 90.0, -18.0, 18.0, 0.0, 25.0))

COMPONENTS = [KCD1, KCD4, FUSE_HOLDER, LEVER, IEC_INLET, BATTERY_SWITCH, FUSE_ANL]
