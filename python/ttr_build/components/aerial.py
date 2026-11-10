"""Parts for the robots that fly and swim: a 5 inch quadcopter set (brushless motor, propeller, 4-in-1 ESC,
flight controller, receiver, FPV camera, 4S pack) and a small thruster ROV (T200 thruster, its ESC, a
watertight tube, cable penetrators, buoyancy foam, ballast, tether).

Values come from the cited product pages where those were read; thrust tables and the figures the makers
publish only as charts are estimates, and every such value is listed under ``uncertain``.

Frames follow the library: motors and thrusters have their output axis +Z with the output face at z = 0 and
the body below; boards are ``shapes.pcb`` (corner at the origin, bottom face z = 0).
"""
from __future__ import annotations

import math

from .base import Component, Hole, box, cyl, rbox, tube, union, polar, _b3d
from .shapes import pcb, pcb_holes
from .power import _lipo

# ------------------------------------------------------------------ brushless motor, 2207 class
M_BELL_D, M_BELL_H, M_BASE_H = 27.5, 15.5, 3.0


def _bldc_build(c):
    # stator base (bolted to the arm) z -18.5..-15.5, bell -15.5..0, prop shaft above the output face
    base = cyl(26.0, -(M_BELL_H + M_BASE_H), -M_BELL_H + 0.01)
    for x, y in ((8, 8), (-8, 8), (8, -8), (-8, -8)):
        base = base - cyl(3.0, -(M_BELL_H + M_BASE_H) - 0.1, -M_BELL_H - 1.0, x, y)
    bell = cyl(M_BELL_D, -M_BELL_H, 0.0) - cyl(M_BELL_D - 6.0, -1.5, 0.1)
    for k in range(6):  # cooling windows in the bell top
        a = math.radians(30 + k * 60)
        bell = bell - cyl(5.0, -1.6, 0.1, 9.0 * math.cos(a), 9.0 * math.sin(a))
    hub = cyl(10.0, -1.6, 0.01)
    shaft = cyl(5.0, 0.0, 14.0)
    leads = box(10.0, 22.0, -2.0, 2.0, -(M_BELL_H + M_BASE_H), -M_BELL_H - 0.5)
    return union(base, bell, hub, shaft, leads)


def _bldc_keepout(c):
    return union(c.solid(), cyl(M_BELL_D + 2.0, -M_BELL_H - 0.5, 0.5), cyl(5.6, 0.0, 16.0))


BLDC_2207 = Component(
    key="bldc_2207_1750kv", name="2207 brushless motor 1750 KV for 5 in props, 4S (e.g. iFlight XING2 2207)", category="actuator",
    mass_g=33.5, price_usd=19.0, supplier_url="https://shop.iflight.com/xing2-2207-unibell-fpv-motor-pro1504",
    datasheet_url="https://shop.iflight.com/xing2-2207-unibell-fpv-motor-pro1504",
    envelope_mm=(35.75, 27.5, 32.5), holes=[Hole((x, y, -(M_BELL_H + M_BASE_H)), (0.0, 0.0, -1.0), 3.0, "M3") for x, y in ((8, 8), (-8, 8), (8, -8), (-8, -8))],
    specs={"kv": 1750, "voltage_v": 14.8, "cells": "4S-6S", "max_current_a": 40.0, "shaft_d_mm": 5.0, "prop_shaft": "M5",
           "hole_pattern_mm": (16.0, 16.0),
           # torque = Kt x current, Kt = 60 / (2 pi KV): 0.00546 N·m/A
           "rated_torque_nm": 0.06, "peak_torque_nm": 0.2, "stall_torque_nm": 0.2, "no_load_speed_rad_s": round(1750 * 14.8 * 2 * math.pi / 60, 1),
           "gear_ratio": 1, "rotor_inertia_kgm2": 1.6e-6,
           # static thrust with a 5 x 4.3 x 3 propeller on 4S (16 V): [throttle, thrust g, current A]
           "thrust_table": [[0.25, 190, 2.4], [0.5, 560, 8.8], [0.75, 930, 19.5], [1.0, 1230, 33.0]],
           "thrust_prop": "prop_5x4_3x3",
           "uncertain": ["thrust_table", "rated_torque_nm", "rotor_inertia_kgm2", "price_usd"],
           "uncertain_notes": ["thrust_table: read off typical 2207 1750-1800 KV test charts for 5 in tri-blades on 4S, not a test of this motor"]},
    output_frame=((0.0, 0.0, 0.0), (0.0, 0.0, 1.0)), build=_bldc_build, build_keepout=_bldc_keepout)


def _prop_build(c):
    hub = cyl(12.0, 0.0, 7.0) - cyl(5.0, -0.1, 7.1)
    b3d = _b3d()
    blades = []
    for k in range(3):
        blade = box(5.0, 63.5, -6.5, 6.5, 2.5, 4.0)
        blades.append(blade.rotate(b3d.Axis.Z, k * 120))
    return union(hub, *blades)


PROP_5IN = Component(
    key="prop_5x4_3x3", name="5 x 4.3 x 3 tri-blade propeller, M5 hub (HQProp 5043 V1S), one", category="misc",
    mass_g=4.3, price_usd=1.0, supplier_url="https://www.hqprop.com/hq-durable-prop-5x43x3v1s-2cw2ccw-poly-carbonate-p0081.html",
    datasheet_url="https://www.hqprop.com/hq-durable-prop-5x43x3v1s-2cw2ccw-poly-carbonate-p0081.html",
    envelope_mm=(100.9, 116.4, 7.0), holes=[],
    specs={"diameter_mm": 127.0, "pitch_in": 4.3, "blades": 3, "bore_mm": 5.0, "material": "polycarbonate",
           "sold_as": "sets of 2 CW + 2 CCW", "no_mounting_holes": True, "uncertain": ["price_usd"]},
    build=_prop_build, build_keepout=lambda c: cyl(129.0, -1.0, 8.0))

# ------------------------------------------------------------------ flight electronics (30.5 mm stack)
STACK = [(5.25, 5.25), (35.75, 5.25), (5.25, 35.75), (35.75, 35.75)]


def _esc_build(c):
    return pcb(41.0, 41.0, 1.6, STACK, 4.0, parts=[(3.0, 38.0, 3.0, 38.0, 3.2), (0.0, 8.0, 15.0, 26.0, 1.5)], bottom=[(10.0, 31.0, 10.0, 31.0, 1.0)], r=3.0)


ESC_4IN1 = Component(
    key="esc_4in1_45a", name="4-in-1 BLHeli_S ESC 45 A per motor, 3-6S, 30.5 mm mount (e.g. SpeedyBee BLS 50A)", category="motor_driver",
    mass_g=13.0, price_usd=45.0, supplier_url="https://www.speedybee.com/speedybee-bls-50a-30x30-4-in-1-esc/",
    datasheet_url="https://www.speedybee.com/speedybee-bls-50a-30x30-4-in-1-esc/",
    envelope_mm=(41.0, 41.0, 5.8), holes=pcb_holes(STACK, 4.0, "M3"),
    specs={"voltage_v": 14.8, "cells": "3-6S", "current_a": 45.0, "burst_current_a": 55.0, "protocol": "DShot600",
           "mount": "30.5 x 30.5 mm, M3 on silicone grommets (4 mm holes)", "uncertain": ["mass_g", "current_a"]},
    build=_esc_build, build_keepout=lambda c: box(-8.0, 49.0, -2.0, 43.0, -2.0, 9.0))


def _fc_build(c):
    return pcb(41.0, 38.0, 1.6, [(5.25, 3.75), (35.75, 3.75), (5.25, 34.25), (35.75, 34.25)], 4.0,
               parts=[(15.0, 25.0, 14.0, 24.0, 1.2), (17.0, 24.0, -0.5, 4.0, 3.2), (3.0, 12.0, 30.0, 36.0, 2.0)], r=3.0)


FC_F405 = Component(
    key="fc_f405_30x30", name="F405 flight controller, BMI270 IMU, OSD, barometer, 30.5 mm mount (e.g. SpeedyBee F405 V4)", category="compute",
    mass_g=9.0, price_usd=40.0, supplier_url="https://www.speedybee.com/speedybee-f405-v4-bls-55a-30x30-fc-esc-stack/",
    datasheet_url="https://www.speedybee.com/speedybee-f405-v4-bls-55a-30x30-fc-esc-stack/",
    envelope_mm=(41.0, 38.5, 4.8), holes=pcb_holes([(5.25, 3.75), (35.75, 3.75), (5.25, 34.25), (35.75, 34.25)], 4.0, "M3"),
    specs={"voltage_v": 5.0, "input_v": (7, 26), "mcu": "STM32F405", "imu": "BMI270", "firmware": "Betaflight / INAV / ArduPilot",
           "bec": "5 V 2 A, 9 V 2 A", "uncertain": ["mass_g"]},
    build=_fc_build, build_keepout=lambda c: union(c.solid(), box(15.0, 26.0, -8.0, 4.0, 0.0, 5.0)))

ELRS_RX = Component(
    key="elrs_receiver_nano", name="ExpressLRS 2.4 GHz nano receiver with T antenna (e.g. RadioMaster RP1)", category="misc",
    mass_g=1.5, price_usd=16.0, supplier_url="https://www.radiomasterrc.com/products/rp1-expresslrs-2-4ghz-nano-receiver",
    datasheet_url="https://www.radiomasterrc.com/products/rp1-expresslrs-2-4ghz-nano-receiver",
    envelope_mm=(18.0, 11.0, 4.0), holes=[],
    specs={"voltage_v": 5.0, "interface": "UART (CRSF)", "range": "kilometres line of sight with a matching transmitter",
           "mount": "heat-shrink, taped inside the canopy; antenna out through a hole", "no_mounting_holes": True, "uncertain": ["mass_g"]},
    build=lambda c: rbox(0.0, 18.0, 0.0, 11.0, 0.0, 4.0, 1.0))


def _fpv_build(c):
    body = rbox(-9.5, 9.5, -9.5, 9.5, -14.0, 0.0, 2.0)
    for sx in (-1, 1):
        body = body - cyl_x(2.0, sx * 9.5, -7.0, 4.0)
    lens = cyl(14.0, 0.0, 8.0)
    return union(body, lens)


def cyl_x(d, x, z, depth):
    """A drill along x at (x, 0, z), entering from the face at x towards the centre."""
    from .base import cyl_between
    return cyl_between(d, (x * (1 + 0.02), 0.0, z), (x - (depth if x > 0 else -depth), 0.0, z))


FPV_CAM = Component(
    key="fpv_camera_micro", name="Micro analog FPV camera, 19 mm, 1/1.8 in sensor (e.g. Caddx Ratel 2)", category="sensor",
    mass_g=5.9, price_usd=30.0, supplier_url="https://caddxfpv.com/products/caddxfpv-ratel-2-starlight-hdr-fpv-camera",
    datasheet_url="https://caddxfpv.com/products/caddxfpv-ratel-2-starlight-hdr-fpv-camera",
    envelope_mm=(19.0, 19.0, 22.0), holes=[Hole((9.5, 0.0, -7.0), (1.0, 0.0, 0.0), 2.0, "M2"), Hole((-9.5, 0.0, -7.0), (-1.0, 0.0, 0.0), 2.0, "M2")],
    specs={"voltage_v": 5.0, "input_v": (5, 40), "fov_deg": (165, 120), "output": "analog CVBS (live video, not recorded stills)",
           "mount": "side M2 screws in a printed cradle, tilt adjustable", "uncertain": ["price_usd"]},
    output_frame=((0.0, 0.0, 8.0), (0.0, 0.0, 1.0)), build=_fpv_build)

LIPO_4S_1500 = _lipo("lipo_4s_1500", "LiPo 4S 1500 mAh 100C, XT60 (e.g. CNHL Black Series)", 4, 1500, 74.0, 35.0, 36.0, 190.0, 32.0, 100, "XT60",
                     "https://chinahobbyline.com/products/cnhl-black-series-1500mah-14-8v-4s-100c-lipo-battery-with-xt60-plug",
                     "https://chinahobbyline.com/products/cnhl-black-series-1500mah-14-8v-4s-100c-lipo-battery-with-xt60-plug",
                     ["envelope_mm", "price_usd"])

# ------------------------------------------------------------------ ROV: T200 thruster and its ESC


def _t200_build(c):
    # motor pod along the axis, nozzle ring around the propeller, mounting foot below
    pod = cyl(50.0, -95.0, -20.0)
    nozzle = tube(100.0, 92.0, -45.0, 0.0)
    struts = union(*[box(-1.5, 1.5, 24.0, 47.0, -40.0, -30.0).rotate(_b3d().Axis.Z, k * 120) for k in range(3)])
    prop = cyl(20.0, -30.0, -10.0)
    foot = box(-12.0, 12.0, -60.0, -46.0, -85.0, -55.0)
    from .base import cyl_between
    for x in (-9.5, 9.5):
        foot = foot - cyl_between(3.0, (x, -60.5, -70.0), (x, -54.0, -70.0))
    return union(pod, nozzle, struts, prop, foot)


T200 = Component(
    key="t200_thruster", name="Blue Robotics T200 underwater thruster (7-20 V)", category="actuator",
    mass_g=344.0, price_usd=200.0, supplier_url="https://bluerobotics.com/store/thrusters/t100-t200-thrusters/t200-thruster-r2-rp/",
    datasheet_url="https://bluerobotics.com/store/thrusters/t100-t200-thrusters/t200-thruster-r2-rp/",
    envelope_mm=(100.0, 110.0, 95.0), holes=[Hole((x, -60.0, -70.0), (0.0, -1.0, 0.0), 3.0, "M3") for x in (-9.5, 9.5)],
    specs={"voltage_v": 16.0, "input_v": (7, 20), "max_thrust_fwd_kgf": 5.25, "max_thrust_rev_kgf": 4.1, "max_current_a": 24.0,
           "mass_in_water_g": 156.0, "thrust_at_12v_fwd_kgf": 3.71, "current_at_12v_a": 17.0,
           "rated_torque_nm": 0.3, "peak_torque_nm": 0.6, "stall_torque_nm": 0.6, "no_load_speed_rad_s": 380.0, "gear_ratio": 1,
           "mount": "two M3 screws in the mounting foot (19 mm apart)", "uncertain": ["rated_torque_nm", "peak_torque_nm", "no_load_speed_rad_s", "holes"]},
    output_frame=((0.0, 0.0, 0.0), (0.0, 0.0, 1.0)), build=_t200_build)

BASIC_ESC = Component(
    key="basic_esc_30a", name="Blue Robotics Basic ESC 30 A (7-26 V, PWM input)", category="motor_driver",
    mass_g=16.0, price_usd=36.0, supplier_url="https://bluerobotics.com/store/thrusters/speed-controllers/besc30-r3/",
    datasheet_url="https://bluerobotics.com/store/thrusters/speed-controllers/besc30-r3/",
    envelope_mm=(40.0, 22.0, 8.0), holes=[],
    specs={"voltage_v": 16.0, "input_v": (7, 26), "current_a": 30.0, "input": "RC PWM 1100-1900 us, bidirectional",
           "mount": "zip-tied to the electronics tray", "no_mounting_holes": True},
    build=lambda c: rbox(0.0, 40.0, 0.0, 22.0, 0.0, 8.0, 2.0))


def _wte_build(c):
    shell = tube(114.0, 101.6, 0.0, 298.0)
    caps = union(cyl(114.0, -12.0, 0.01), cyl(114.0, 297.99, 310.0))
    return union(shell, caps)


WTE_4IN = Component(
    key="wte_4in_300", name="Blue Robotics 4 in watertight enclosure, 298 mm acrylic tube, aluminium end caps (rated 100 m)", category="misc",
    mass_g=1450.0, price_usd=285.0, supplier_url="https://bluerobotics.com/store/watertight-enclosures/4-series/wte4-asm-r1/",
    datasheet_url="https://bluerobotics.com/store/watertight-enclosures/4-series/wte4-asm-r1/",
    envelope_mm=(114.0, 114.0, 322.0), holes=[],
    specs={"inner_d_mm": 101.6, "inner_length_mm": 298.0, "displaced_volume_l": round(math.pi * (0.057 ** 2) * 0.322 * 1000, 2), "depth_rating_m": 100,
           "penetrator_holes": 10, "sealing": "double O-ring flanges, vent plug for the final seal", "mount": "printed clamp rings round the tube",
           "od_mm": 114.0, "id_mm": 101.6, "no_mounting_holes": True, "uncertain": ["mass_g", "price_usd"]},
    build=_wte_build, build_keepout=lambda c: union(cyl(116.0, -14.0, 312.0)))

PENETRATOR = Component(
    key="penetrator_m10", name="M10 cable penetrator for 6 mm cable, potted (Blue Robotics)", category="misc",
    mass_g=4.0, price_usd=4.0, supplier_url="https://bluerobotics.com/store/cables-connectors/penetrators/penetrator-vp/",
    datasheet_url="https://bluerobotics.com/store/cables-connectors/penetrators/penetrator-vp/",
    envelope_mm=(14.0, 14.0, 22.0), holes=[], specs={"thread": "M10 x 1.5", "cable_od_mm": 6.0, "no_mounting_holes": True},
    build=lambda c: union(cyl(14.0, 0.0, 6.0), cyl(10.0, -12.0, 0.01), cyl(8.0, 6.0, 10.0)))

FOAM = Component(
    key="buoyancy_foam_1l", name="Subsea buoyancy foam block, R-3318 urethane, about 1 L (cut to shape)", category="misc",
    mass_g=310.0, price_usd=40.0, supplier_url="https://bluerobotics.com/store/rov/rov-accessories/subsea-buoyancy-foam-r-3318-r1/",
    datasheet_url="https://bluerobotics.com/store/rov/rov-accessories/subsea-buoyancy-foam-r-3318-r1/",
    envelope_mm=(200.0, 100.0, 50.0), holes=[], specs={"density_kg_m3": 310.0, "volume_l": 1.0, "depth_rating_m": 300, "no_mounting_holes": True, "uncertain": ["price_usd"]},
    build=lambda c: rbox(0.0, 200.0, 0.0, 100.0, 0.0, 50.0, 4.0))

BALLAST = Component(
    key="ballast_200g", name="Stainless ballast weight 200 g (trim)", category="misc",
    mass_g=200.0, price_usd=8.0, supplier_url="https://bluerobotics.com/store/rov/rov-accessories/ballast-weight/",
    datasheet_url="https://bluerobotics.com/store/rov/rov-accessories/ballast-weight/",
    envelope_mm=(60.0, 25.0, 17.0), holes=[], specs={"volume_cm3": 25.3, "no_mounting_holes": True, "mount": "bolted under the frame", "uncertain": ["price_usd"]},
    build=lambda c: rbox(0.0, 60.0, 0.0, 25.0, 0.0, 17.0, 2.0))

TETHER = Component(
    key="tether_cat5_25m", name="Neutrally buoyant tether, 25 m, 2 twisted pairs (Fathom slim style)", category="misc",
    mass_g=520.0, price_usd=45.0, supplier_url="https://bluerobotics.com/store/cables-connectors/cables/fathom-slim-tether/",
    datasheet_url="https://bluerobotics.com/store/cables-connectors/cables/fathom-slim-tether/",
    envelope_mm=(150.0, 150.0, 40.0), holes=[], specs={"length_m": 25.0, "od_mm": 4.0, "pairs": 2, "no_mounting_holes": True,
                                                       "note": "coiled on the surface; strain-relieved at the hull penetrator", "uncertain": ["price_usd", "mass_g"]},
    build=lambda c: tube(150.0, 90.0, 0.0, 40.0))

COMPONENTS = [BLDC_2207, PROP_5IN, ESC_4IN1, FC_F405, ELRS_RX, FPV_CAM, LIPO_4S_1500, T200, BASIC_ESC, WTE_4IN, PENETRATOR, FOAM, BALLAST, TETHER]
