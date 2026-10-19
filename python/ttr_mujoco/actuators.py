"""Datasheet ratings and reflected rotor inertia of the actuator behind every joint.

Sources, in order of preference:
  1. ``metadata.design.joints[]`` of the robot.json (``rated_nm``, ``peak_nm``, ``speed_rad_s``)
     written by the design engine (see docs/DESIGN_ENGINE.md);
  2. the catalog component mounted for that joint (link ``<joint>_actuator`` whose
     geometry is ``{part: component, params: {key}}``), looked up in
     ``packages/parts/data/catalog.json``;
  3. the URDF limit only (effort = peak, velocity = speed, continuous rating unknown).

Armature (reflected rotor inertia, kg m^2) is ``J_rotor * N^2``. The catalog carries the
gear ratio N for every actuator but no rotor inertia, so ``J_rotor`` is an ESTIMATE per
actuator family (``ROTOR_INERTIA`` below) unless the component specs give
``rotor_inertia_kgm2``. The estimates are typical values for the motor size used in
each family; treat the resulting armature as +-50 %.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache

# Rotor inertia estimates (kg m^2) per actuator family -- motor-side, before the gearbox.
ROTOR_INERTIA = {
    # ~20 mm iron-core DC motor in the STS3215/3250 case
    "feetech_sts": 2.4e-7,
    # ~20 mm coreless DC motor in DYNAMIXEL X (XL/XM/XH)
    "dynamixel_x": 1.0e-7,
    # outrunner BLDC rotor of the CubeMars AK series (AK60 ~ AK80 diameter class)
    "cubemars_ak60": 3.0e-5, "cubemars_ak70": 4.5e-5, "cubemars_ak80": 6.0e-5,
    # NEMA17 42x40 stepper rotor (typical datasheet 54 g cm^2)
    "stepper": 5.4e-6,
    # small brushed gearmotors: 37 mm can (Pololu 37D) / 12 mm N20 can
    "dc_gearmotor_37": 1.5e-6, "dc_gearmotor_n20": 1.0e-8, "dc_gearmotor": 1.0e-6,
}
# Gear ratio fallback when the catalog does not say (family typical).
DEFAULT_RATIO = {"feetech_sts": 345.0, "dynamixel_x": 300.0, "cubemars_ak": 9.0, "stepper": 1.0, "dc_gearmotor": 50.0}

_CATALOG_PATH = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "packages", "parts", "data", "catalog.json"))


@lru_cache(maxsize=1)
def catalog() -> dict:
    path = os.environ.get("TTR_PARTS_CATALOG", _CATALOG_PATH)
    try:
        with open(path, encoding="utf8") as f:
            return json.load(f)
    except OSError:
        return {}


def family_of(key: str) -> str:
    """Same mapping as @ttr/parts actuatorFamily()."""
    if key.startswith("feetech_sts"): return "feetech_sts"
    if key.startswith("dxl_"): return "dynamixel_x"
    if key.startswith("cubemars_"): return "cubemars_ak"
    if key.startswith("nema17"): return "stepper"
    return "dc_gearmotor"


def rotor_inertia(key: str) -> tuple[float, str]:
    """(J_rotor kg m^2, source) for a catalog actuator key."""
    specs = catalog().get(key, {}).get("specs", {})
    if specs.get("rotor_inertia_kgm2"):
        return float(specs["rotor_inertia_kgm2"]), "datasheet"
    fam = family_of(key)
    if fam == "cubemars_ak":
        size = "ak80" if "ak80" in key else "ak70" if "ak70" in key else "ak60"
        return ROTOR_INERTIA[f"cubemars_{size}"], f"estimate ({fam} {size} outrunner rotor)"
    if fam == "dc_gearmotor":
        sub = "dc_gearmotor_n20" if key.startswith("n20") else "dc_gearmotor_37" if "37d" in key else "dc_gearmotor"
        return ROTOR_INERTIA[sub], f"estimate ({sub})"
    return ROTOR_INERTIA[fam], f"estimate ({fam} motor)"


def actuator_rating(key: str) -> dict | None:
    """SI rating of a catalog actuator (mirrors @ttr/parts rating())."""
    c = catalog().get(key)
    if not c: return None
    s = c.get("specs", {})
    try:
        rated = float(s["rated_torque_nm"]); peak = float(s.get("peak_torque_nm", s.get("stall_torque_nm", rated)))
        speed = float(s.get("rated_speed_rad_s", s.get("no_load_speed_rad_s")))
    except (KeyError, TypeError, ValueError):
        return None
    noload = float(s.get("no_load_speed_rad_s", speed))
    ratio = float(s.get("gear_ratio") or DEFAULT_RATIO.get(family_of(key), 1.0))
    j, src = rotor_inertia(key)
    return {"key": key, "family": family_of(key), "rated_nm": rated, "peak_nm": peak, "speed_rad_s": speed,
            "no_load_speed_rad_s": noload, "gear_ratio": ratio, "rotor_inertia_kgm2": j,
            "armature_kgm2": j * ratio ** 2, "armature_source": f"{src} x gear ratio {ratio:g}^2"}


def load_spec(spec) -> dict | None:
    if spec is None or isinstance(spec, dict): return spec
    with open(spec, encoding="utf8") as f:
        return json.load(f)


def _component_key(link: dict) -> str | None:
    g = link.get("geometry") or {}
    if g.get("part") == "component":
        return (g.get("params") or {}).get("key")
    return None


def _match_limit(limit: dict) -> str | None:
    """Catalog actuator whose peak torque and speed equal the URDF limit (Assembly.revolute/continuous
    copy them from the datasheet), when exactly one matches."""
    effort, velocity = limit.get("effort"), limit.get("velocity")
    if not effort or not velocity: return None
    hits = []
    for key, c in catalog().items():
        if c.get("category") != "actuator": continue
        r = actuator_rating(key)
        if r and abs(r["peak_nm"] - float(effort)) < 1e-3 and abs(r["speed_rad_s"] - float(velocity)) < 1e-3: hits.append(key)
    return hits[0] if len(hits) == 1 else None


def joint_actuators(spec) -> dict[str, dict]:
    """joint name -> rating dict (rated_nm may be None when only the URDF is known)."""
    spec = load_spec(spec)
    if not spec: return {}
    links = {l["name"]: l for l in spec.get("links", [])}
    design = (spec.get("metadata") or {}).get("design") or {}
    records = {r["joint"]: r for r in design.get("joints", []) if "joint" in r}
    out = {}
    listed = {j.get("name") for j in spec.get("joints", [])}
    extra = [{"name": n, "type": "revolute"} for n in records if n not in listed]   # design records for joints the spec does not list
    for j in list(spec.get("joints", [])) + extra:
        if j.get("type") not in ("revolute", "continuous", "prismatic") or j.get("passive"): continue
        name = j["name"]; rec = records.get(name)
        key = (rec or {}).get("actuator")
        if not key:
            # the component mounted as "<joint>_actuator" (Assembly.mount naming), or a
            # drive motor on the parent link named after the joint
            for cand in (f"{name}_actuator", f"{name}_motor"):
                if cand in links and _component_key(links[cand]): key = _component_key(links[cand]); break
        limit = j.get("limit") or {}
        if not key: key = _match_limit(limit)
        r = actuator_rating(key) if key else None
        if r is None:
            r = {"key": key, "family": family_of(key) if key else None, "rated_nm": None, "peak_nm": limit.get("effort"),
                 "speed_rad_s": limit.get("velocity"), "no_load_speed_rad_s": limit.get("velocity"), "gear_ratio": None,
                 "armature_kgm2": None, "armature_source": None}
        r = dict(r)
        if rec:
            for k in ("rated_nm", "peak_nm", "speed_rad_s"):
                if rec.get(k) is not None: r[k] = float(rec[k])
            r["required_nm"] = rec.get("required_nm")
            r["source"] = "metadata.design.joints"
        else:
            r["source"] = "catalog component" if r.get("key") and r.get("rated_nm") is not None else "URDF limit only"
        out[name] = r
    return out
