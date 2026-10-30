"""Bench supplies for bigger arms and the CAN interface CubeMars actuators need.

Frame (both PSUs): case along +X from x = 0, terminals at the -X end, bottom at z = 0,
mounting holes in the bottom face (axis -Z), like ``power.PSU``.
"""
from __future__ import annotations

from .base import Component, Hole, box, cyl, union

MW = "https://www.meanwell.com/Upload/PDF/{0}/{0}-SPEC.PDF"


def _psu(key, name, model, L, W, H, volts, amps, mass, price, holes_x, hole_y, uncertain):
    holes = [Hole((x, hole_y, 0.0), (0.0, 0.0, -1.0), 2.5, "M3") for x in holes_x]

    def build(c):
        case = box(0.0, L, 0.0, W, 0.0, H) - box(-0.1, 12.0, 4.0, W - 30.0, 3.0, H + 0.1)  # terminal recess
        term = union(*[box(0.5, 11.0, 6.0 + k * 9.5, 13.5 + k * 9.5, 3.0, H - 8.0) for k in range(5)])
        for x in range(30, int(L) - 8, 8):
            case = case - box(x, x + 3.0, 15.0, W - 17.0, H - 1.0, H + 0.1)              # top vents
        for h in holes:
            case = case - cyl(2.5, -0.1, 3.0, h.pos[0], h.pos[1])
        return union(case, term)

    def keepout(c):
        return union(box(-30.0, 12.0, 4.0, W - 30.0, 3.0, H + 15.0),       # wiring + screwdriver access
                     box(25.0, L - 4.0, 10.0, W - 12.0, H - 0.01, H + 10.0))  # convection above the vents

    return Component(
        key=key, name=name, category="misc", mass_g=mass, price_usd=price,
        supplier_url=f"https://www.digikey.com/en/products/result?keywords={model}",
        datasheet_url=MW.format(model.rsplit("-", 1)[0]), envelope_mm=(L, W, H), holes=holes,
        specs={"voltage_v": volts, "current_a": amps, "power_w": round(volts * amps, 1), "input_vac": (85, 264),
               "terminals": "AC L, AC N, FG, -V, +V", "uncertain": ["holes" if u.startswith("hole") else u.split(" (")[0] for u in uncertain],
               "uncertain_notes": list(uncertain)},
        build=build, build_keepout=keepout)


PSU_12V_150 = _psu("psu_12v_lrs150", "Mean Well LRS-150-12 enclosed PSU, 12 V 12.5 A (150 W)", "LRS-150-12",
                   159.0, 97.0, 30.0, 12.0, 12.5, 500.0, 27.0, (32.0, 127.0), 48.5,
                   ["mass_g", "price_usd", "hole positions (taken from the LRS-75 pattern scaled to the case)"])
PSU_48V_350 = _psu("psu_48v_lrs350", "Mean Well LRS-350-48 enclosed PSU, 48 V 7.3 A (350 W)", "LRS-350-48",
                   215.0, 115.0, 30.0, 48.0, 7.3, 760.0, 45.0, (32.5, 182.5), 57.5,
                   ["mass_g", "price_usd", "hole positions (from the case outline, not the drawing)"])


def _can_build(c):
    body = box(0.0, 45.0, -10.0, 10.0, 0.0, 9.0)
    usb = box(-6.0, 0.01, -4.0, 4.0, 2.0, 7.0)
    term = box(44.99, 50.0, -7.0, 7.0, 1.0, 8.0)
    return union(body, usb, term)


CAN_ADAPTER = Component(
    key="usb_can_canable2", name="CANable 2.0 USB to CAN-FD adapter (candlelight firmware)", category="motor_driver",
    mass_g=10.0, price_usd=35.0, supplier_url="https://canable.io/", datasheet_url="https://canable.io/getting-started.html",
    envelope_mm=(56.0, 20.0, 9.0), holes=[],
    specs={"voltage_v": 5.0, "bus": "CAN 2.0 / CAN-FD up to 5 Mbit/s, SocketCAN (gs_usb) on Linux",
           "note": "CubeMars AK actuators speak CAN (MIT or servo mode); one adapter drives the whole bus with 120 ohm termination at both ends",
           "uncertain": ["mass_g", "envelope_mm", "price_usd"], "no_mounting_holes": True},
    build=_can_build, build_keepout=None)

COMPONENTS = [PSU_12V_150, PSU_48V_350, CAN_ADAPTER]
