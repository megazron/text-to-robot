"""Task-tool parts (pump, tubing, nozzle, tank, brush, blower, speaker), Cartesian-gantry motion parts (GT2 belt
drive, end stops) and delta-robot parts (ball-joint rod ends, carbon tube).

Prices are typical single-unit prices for generic parts (late 2026) and are listed as uncertain. Frames: motors
and pumps have their shaft or outlet along +Z; boards are ``shapes.pcb``.
"""
from __future__ import annotations

from .base import Component, Hole, box, cyl, rbox, tube, union
from .shapes import pcb, pcb_holes
from .linear import _t8_build, STEEL, ETA, ETA_BACK
import math

SEARCH = "https://www.aliexpress.com/w/wholesale-{}.html"


def _pump_build(c):
    motor = cyl(27.6, -38.0, 0.0) - cyl(2.5, -38.1, -34.0, -6.0, 0.0) - cyl(2.5, -38.1, -34.0, 6.0, 0.0)
    head = rbox(-17.0, 17.0, -14.0, 14.0, 0.0, 18.0, 3.0)
    ports = union(cyl(5.0, 18.0, 28.0, -7.0, 0.0), cyl(5.0, 18.0, 28.0, 7.0, 0.0))
    return union(motor, head, ports)


PUMP = Component(
    key="pump_12v_diaphragm", name="12 V diaphragm water pump, R385, about 1.5 L/min, 5 mm barbs", category="misc",
    mass_g=75.0, price_usd=6.0, supplier_url=SEARCH.format("r385-12v-diaphragm-pump"), datasheet_url=SEARCH.format("r385-12v-diaphragm-pump"),
    envelope_mm=(34.0, 28.0, 66.0), holes=[Hole((x, 0.0, -38.0), (0.0, 0.0, -1.0), 2.5, "M2.5") for x in (-6.0, 6.0)],
    specs={"voltage_v": 12.0, "flow_l_min": 1.5, "head_m": 2.0, "barb_mm": 5.0, "self_priming": True, "max_current_a": 0.8,
           "uncertain": ["flow_l_min", "head_m", "price_usd"]},
    build=_pump_build)

MOSFET = Component(
    key="mosfet_switch_module", name="Low-side MOSFET switch module, logic level (e.g. AOD4184 board), 5-36 V 15 A", category="motor_driver",
    mass_g=4.0, price_usd=2.0, supplier_url=SEARCH.format("aod4184-mosfet-module"), datasheet_url=SEARCH.format("aod4184-mosfet-module"),
    envelope_mm=(34.0, 17.0, 10.6), holes=pcb_holes([(3.0, 3.0), (31.0, 3.0)], 3.0, "M3"),
    specs={"voltage_v": 12.0, "input_v": (5, 36), "current_a": 15.0, "logic": "3.3-5 V PWM", "flyback": "on-board diode", "uncertain": ["price_usd"]},
    build=lambda c: pcb(34.0, 17.0, 1.6, [(3.0, 3.0), (31.0, 3.0)], 3.0, parts=[(2.0, 12.0, 6.0, 15.0, 9.0), (22.0, 32.0, 6.0, 15.0, 9.0), (14.0, 20.0, 5.0, 11.0, 2.4)]))

TUBING = Component(
    key="silicone_tube_5mm_2m", name="Food-grade silicone tube 5 x 8 mm, 2 m", category="misc",
    mass_g=60.0, price_usd=4.0, supplier_url=SEARCH.format("silicone-tube-5x8mm"), datasheet_url=SEARCH.format("silicone-tube-5x8mm"),
    envelope_mm=(120.0, 120.0, 10.0), holes=[], specs={"id_mm": 5.0, "od_mm": 8.0, "length_mm": 2000.0, "no_mounting_holes": True, "shown_as": "a coil", "uncertain": ["price_usd"]},
    build=lambda c: tube(120.0, 80.0, 0.0, 10.0))

NOZZLE = Component(
    key="mist_nozzle_brass", name="Brass misting / spray nozzle with 5 mm barb adapter", category="misc",
    mass_g=8.0, price_usd=2.0, supplier_url=SEARCH.format("brass-misting-nozzle-barb"), datasheet_url=SEARCH.format("brass-misting-nozzle-barb"),
    envelope_mm=(12.0, 12.0, 30.0), holes=[], specs={"orifice_mm": 0.5, "spray_angle_deg": 60, "no_mounting_holes": True, "mount": "pressed into a printed clip", "uncertain": ["price_usd"]},
    output_frame=((0.0, 0.0, 30.0), (0.0, 0.0, 1.0)), build=lambda c: union(cyl(12.0, 0.0, 12.0), cyl(6.0, 12.0, 30.0)))

BOTTLE = Component(
    key="water_bottle_1l", name="1 L HDPE wide-neck bottle (water tank), with a drilled cap", category="misc",
    mass_g=45.0, price_usd=3.0, supplier_url=SEARCH.format("1l-hdpe-wide-mouth-bottle"), datasheet_url=SEARCH.format("1l-hdpe-wide-mouth-bottle"),
    envelope_mm=(90.0, 90.0, 190.0), holes=[], specs={"volume_l": 1.0, "no_mounting_holes": True, "mount": "printed cradle and a strap", "uncertain": ["price_usd", "envelope_mm"]},
    build=lambda c: union(tube(90.0, 88.4, 0.0, 160.0), cyl(90.0, 0.0, 1.0), tube(45.0, 42.0, 159.0, 190.0), tube(90.0, 42.0, 159.0, 160.0)))

BRUSH = Component(
    key="brush_roller_120", name="Nylon bristle roller brush, 120 mm long, 50 mm diameter, 6 mm bore", category="misc",
    mass_g=55.0, price_usd=6.0, supplier_url=SEARCH.format("nylon-roller-brush-6mm-shaft"), datasheet_url=SEARCH.format("nylon-roller-brush-6mm-shaft"),
    envelope_mm=(50.0, 50.0, 120.0), holes=[], specs={"length_mm": 120.0, "diameter_mm": 50.0, "bore_mm": 6.0, "no_mounting_holes": True, "uncertain": ["price_usd"]},
    build=lambda c: tube(50.0, 6.0, 0.0, 120.0))


def _blower_build(c):
    return union(rbox(0.0, 50.0, 0.0, 50.0, 0.0, 15.0, 8.0), box(30.0, 50.0, 45.0, 62.0, 0.0, 15.0))


BLOWER = Component(
    key="blower_5015_12v", name="5015 centrifugal blower fan, 12 V 0.15 A", category="misc",
    mass_g=22.0, price_usd=4.0, supplier_url=SEARCH.format("5015-blower-12v"), datasheet_url=SEARCH.format("5015-blower-12v"),
    envelope_mm=(50.0, 62.0, 15.0), holes=[],
    specs={"voltage_v": 12.0, "airflow_cfm": 4.5, "static_pressure_pa": 250, "max_current_a": 0.15, "no_mounting_holes": True, "mount": "clamped in a printed duct",
           "note": "a hobby vacuum: picks up dust and crumbs, not grit", "uncertain": ["airflow_cfm", "static_pressure_pa", "price_usd"]},
    build=_blower_build)

AMP = Component(
    key="max98357a_amp", name="MAX98357A I2S 3 W class-D amplifier breakout", category="motor_driver",
    mass_g=2.0, price_usd=6.0, supplier_url="https://www.adafruit.com/product/3006", datasheet_url="https://www.analog.com/media/en/technical-documentation/data-sheets/MAX98357A-MAX98357B.pdf",
    envelope_mm=(19.4, 17.8, 2.6), holes=[], specs={"voltage_v": 5.0, "output_w": 3.2, "interface": "I2S", "no_mounting_holes": True, "mount": "pins in the breadboard / taped", "uncertain": ["mass_g"]},
    build=lambda c: pcb(19.4, 17.8, 1.6, [], 0.0, parts=[(6.0, 13.0, 6.0, 12.0, 1.0)]))

SPEAKER = Component(
    key="speaker_40mm_3w", name="40 mm 4 ohm 3 W speaker", category="misc",
    mass_g=18.0, price_usd=3.0, supplier_url="https://www.adafruit.com/product/3968", datasheet_url="https://www.adafruit.com/product/3968",
    envelope_mm=(40.0, 40.0, 18.0), holes=[], specs={"impedance_ohm": 4.0, "power_w": 3.0, "no_mounting_holes": True, "mount": "behind a printed grille, clamped by its rim", "uncertain": ["price_usd"]},
    build=lambda c: union(cyl(40.0, 0.0, 3.0), cyl(28.0, -15.0, 0.01)))

# ------------------------------------------------------------------ Cartesian gantry motion parts
GT2_PULLEY = Component(
    key="gt2_pulley_20t_5mm", name="GT2 timing pulley, 20 teeth, 5 mm bore, 6 mm belt", category="misc",
    mass_g=8.0, price_usd=2.0, supplier_url=SEARCH.format("gt2-pulley-20t-5mm"), datasheet_url="https://www.gates.com/us/en/power-transmission/synchronous-belts.html",
    envelope_mm=(16.0, 16.0, 16.0), holes=[], specs={"teeth": 20, "pitch_mm": 2.0, "pitch_diameter_mm": 12.73, "bore_mm": 5.0, "mm_per_rev": 40.0, "no_mounting_holes": True, "uncertain": ["price_usd"]},
    build=lambda c: union(cyl(16.0, 0.0, 7.0), cyl(12.2, 7.0, 15.0), cyl(16.0, 15.0, 16.0)) - cyl(5.0, -1.0, 17.0))

GT2_IDLER = Component(
    key="gt2_idler_20t_3mm", name="GT2 toothless idler, 20 T size, 3 mm bore (with bearings)", category="misc",
    mass_g=5.0, price_usd=1.5, supplier_url=SEARCH.format("gt2-idler-20t-3mm"), datasheet_url=SEARCH.format("gt2-idler-20t-3mm"),
    envelope_mm=(18.0, 18.0, 9.0), holes=[], specs={"bore_mm": 3.0, "no_mounting_holes": True, "uncertain": ["price_usd"]},
    build=lambda c: union(cyl(18.0, 0.0, 1.0), cyl(12.2, 1.0, 8.0), cyl(18.0, 8.0, 9.0)) - cyl(3.0, -1.0, 10.0))

GT2_BELT = Component(
    key="gt2_belt_6mm_2m", name="GT2 timing belt, 6 mm wide, glass-fibre reinforced, 2 m", category="misc",
    mass_g=20.0, price_usd=4.0, supplier_url=SEARCH.format("gt2-belt-6mm-2m"), datasheet_url="https://www.gates.com/us/en/power-transmission/synchronous-belts.html",
    envelope_mm=(70.0, 70.0, 6.0), holes=[], specs={"width_mm": 6.0, "length_mm": 2000.0, "working_tension_n": 30.0, "no_mounting_holes": True, "shown_as": "a coil", "uncertain": ["price_usd", "working_tension_n"]},
    build=lambda c: tube(70.0, 58.0, 0.0, 6.0))

ENDSTOP = Component(
    key="endstop_microswitch", name="Mechanical end stop, microswitch on a small board, 3-pin", category="sensor",
    mass_g=3.0, price_usd=1.0, supplier_url=SEARCH.format("mechanical-endstop-3d-printer"), datasheet_url=SEARCH.format("mechanical-endstop-3d-printer"),
    envelope_mm=(40.0, 16.0, 7.6), holes=pcb_holes([(5.0, 3.5), (24.0, 3.5)], 3.0, "M3"),
    specs={"voltage_v": 5.0, "travel_mm": 1.0, "uncertain": ["price_usd"]},
    build=lambda c: pcb(40.0, 16.0, 1.6, [(5.0, 3.5), (24.0, 3.5)], 3.0, parts=[(18.0, 38.0, 6.0, 12.5, 6.0), (2.0, 10.0, 9.0, 15.0, 6.0)]))

T8_150 = Component(
    key="leadscrew_t8x8_150", name="Lead screw Tr8x8 (P2, 4 starts) 150 mm, stainless steel", category="misc",
    mass_g=round(math.pi / 4 * 7.2 ** 2 * 150 * STEEL, 1), price_usd=7.0,
    supplier_url="https://www.robotdigg.com/product/228/T8-Lead-Screw-with-Copper-Nut", datasheet_url="https://www.iso.org/standard/12719.html",
    envelope_mm=(8.0, 8.0, 150.0), holes=[],
    specs={"thread": "Tr8x8 (P2)", "lead_mm": 8.0, "pitch_mm": 2.0, "starts": 4, "length_mm": 150.0, "major_d_mm": 8.0, "mean_d_mm": 7.0,
           "friction_mu": 0.15, "efficiency": ETA, "backdrive_efficiency": ETA_BACK, "no_mounting_holes": True,
           "mount": "top end in a 5-to-8 mm coupler on the motor shaft", "uncertain": ["friction_mu", "efficiency", "backdrive_efficiency", "price_usd"]},
    build=_t8_build)

# ------------------------------------------------------------------ delta robot parts
ROD_END = Component(
    key="ball_joint_m3", name="M3 ball-joint rod end (aluminium ball stud, nylon socket), one", category="misc",
    mass_g=1.8, price_usd=0.8, supplier_url=SEARCH.format("m3-ball-joint-rod-end"), datasheet_url="https://www.igus.com/product/igubal-rod-end",
    envelope_mm=(9.0, 9.0, 20.0), holes=[], specs={"thread": "M3", "max_angle_deg": 30.0, "static_load_n": 150.0, "no_mounting_holes": True, "uncertain": ["static_load_n", "price_usd"]},
    build=lambda c: union(cyl(9.0, 0.0, 9.0), cyl(5.0, 9.0, 20.0)))

CF_TUBE = Component(
    key="cf_tube_6x4_1m", name="Carbon fibre tube 6 x 4 mm, pultruded, 1 m", category="misc",
    mass_g=25.0, price_usd=6.0, supplier_url=SEARCH.format("carbon-fiber-tube-6x4mm"), datasheet_url=SEARCH.format("carbon-fiber-tube-6x4mm"),
    envelope_mm=(6.0, 6.0, 1000.0), holes=[], specs={"od_mm": 6.0, "id_mm": 4.0, "length_mm": 1000.0, "kg_per_m": 0.025, "youngs_gpa": 110.0, "no_mounting_holes": True,
                                                    "mount": "glued into the rod ends", "uncertain": ["price_usd"]},
    build=lambda c: tube(6.0, 4.0, 0.0, 1000.0))

COMPONENTS = [PUMP, MOSFET, TUBING, NOZZLE, BOTTLE, BRUSH, BLOWER, AMP, SPEAKER, GT2_PULLEY, GT2_IDLER, GT2_BELT, ENDSTOP, T8_150, ROD_END, CF_TUBE]
