"""Datasheet-backed library of real, purchasable robot components.

>>> from ttr_build.components import REGISTRY, get
>>> s = get("feetech_sts3215_c001")
>>> s.mass_g, s.specs["stall_torque_nm"], s.output_frame
>>> part = s.solid(); ko = s.keepout()          # build123d Parts, mm, component frame

See ``base.py`` for frame / hole conventions.  Every number traces to
``datasheet_url``; numbers we could not confirm on a primary source are listed
in ``specs['uncertain']``.
"""
from __future__ import annotations

from .base import CATEGORIES, Component, Hole, kgcm_to_nm, rpm_to_rad_s, si

from . import bearings, fasteners  # noqa: E402

_MODULES = [bearings, fasteners]
for _name in ("feetech", "dynamixel", "cubemars", "hobby", "motors", "electronics", "arduino", "power", "wheels", "supplies"):
    try:
        _MODULES.append(__import__(f"{__name__}.{_name}", fromlist=["COMPONENTS"]))
    except ModuleNotFoundError as _e:  # pragma: no cover - only while building the library
        if _e.name != f"{__name__}.{_name}":
            raise

REGISTRY: dict[str, Component] = {}
for _m in _MODULES:
    for _c in _m.COMPONENTS:
        if _c.key in REGISTRY:
            raise ValueError(f"duplicate component key {_c.key}")
        REGISTRY[_c.key] = _c


def get(key: str) -> Component:
    try:
        return REGISTRY[key]
    except KeyError:
        raise KeyError(f"unknown component {key!r}; known: {', '.join(sorted(REGISTRY))}") from None


def by_category(category: str) -> list[Component]:
    return [c for c in REGISTRY.values() if c.category == category]


__all__ = ["CATEGORIES", "Component", "Hole", "REGISTRY", "get", "by_category", "si",
           "kgcm_to_nm", "rpm_to_rad_s"]
