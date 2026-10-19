"""Core types and CAD helpers for the component library.

Conventions (all library values are millimetres and grams):

* Every component lives in its own *component frame*.  Actuators: the output
  axis is +Z, the output (horn / flange / shaft shoulder) face is at z = 0 of
  ``output_frame`` origin and the body extends towards -Z.
* ``Hole.pos`` is the point where a mating fastener enters the component (on
  the mounting surface), ``Hole.axis`` is the unit *outward* normal of that
  surface, i.e. it points from the component towards the structure that bolts
  to it.  A screw therefore travels along ``-axis`` into the component.
  ``dia_mm`` is the hole diameter in the component (tap size for threaded holes,
  through-hole diameter otherwise); ``thread`` is e.g. ``"M2"`` or ``None``.
* ``solid()`` is a realistic body; ``keepout()`` is ``solid()`` plus volumes
  printed structure must leave free (rotating horns, cable/connector exits,
  sensor fields of view, tool access).  Mating surfaces are *not* inflated, so
  a printed part may touch the keepout but must not intersect it.
  Exception: heat-set inserts are an interference fit by design — cut
  ``specs['print_hole_dia_mm']`` x ``specs['print_hole_depth_mm']`` instead.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Optional

CATEGORIES = (
    "actuator", "bearing", "fastener", "insert", "sensor", "compute", "battery",
    "wheel", "motor_driver", "horn", "misc",
)


@dataclass
class Hole:
    pos: tuple[float, float, float]
    axis: tuple[float, float, float]
    dia_mm: float
    thread: Optional[str] = None  # e.g. "M2", "M3"; pos in component frame (mm)


@dataclass
class Component:
    key: str
    name: str
    category: str  # actuator|bearing|fastener|insert|sensor|compute|battery|wheel|motor_driver|horn|misc
    mass_g: float
    price_usd: float
    supplier_url: str
    datasheet_url: str
    envelope_mm: tuple[float, float, float]  # bounding box size of solid()
    holes: list[Hole]  # mounting holes the structure must mate with
    specs: dict  # stall_torque_nm, rated_torque_nm, no_load_speed_rad_s, voltage_v, bore_mm, ...
    output_frame: Optional[tuple] = None  # actuators: ((x, y, z) mm, (ax, ay, az)) of output face
    # --- implementation details (not part of the public contract) ---
    build: Optional[Callable[["Component"], object]] = field(default=None, repr=False, compare=False)
    build_keepout: Optional[Callable[["Component"], object]] = field(default=None, repr=False, compare=False)
    _solid: object = field(default=None, init=False, repr=False, compare=False)
    _keepout: object = field(default=None, init=False, repr=False, compare=False)

    # ------------------------------------------------------------------ CAD
    def solid(self):
        """Realistic body in the component frame (mm), a ``build123d.Part``."""
        if self._solid is None:
            if self.build is None:
                raise NotImplementedError(f"{self.key}: no geometry builder")
            self._solid = _as_part(self.build(self))
        return self._solid

    def keepout(self):
        """``solid()`` plus clearance volumes printed parts must not intersect."""
        if self._keepout is None:
            s = self.solid()
            extra = self.build_keepout(self) if self.build_keepout else None
            self._keepout = _as_part(s + extra) if extra is not None else s
        return self._keepout

    def mesh(self, tolerance: float = 0.05):
        """Triangle mesh of ``solid()`` as a ``trimesh.Trimesh`` (mm)."""
        return to_trimesh(self.solid(), tolerance)

    def bbox(self):
        """(min xyz, max xyz) of ``solid()`` in mm."""
        bb = self.solid().bounding_box()
        return (tuple(bb.min), tuple(bb.max))

    # ------------------------------------------------------------------- SI
    def si(self) -> dict:
        """The numbers a URDF/MJCF writer needs, in kg / m / N·m / rad/s."""
        of = None
        if self.output_frame is not None:
            o, a = self.output_frame
            of = (tuple(v / 1000.0 for v in o), tuple(a))
        return {
            "key": self.key,
            "mass_kg": self.mass_g / 1000.0,
            "envelope_m": tuple(v / 1000.0 for v in self.envelope_mm),
            "holes_m": [
                {"pos": tuple(v / 1000.0 for v in h.pos), "axis": tuple(h.axis),
                 "dia_m": h.dia_mm / 1000.0, "thread": h.thread}
                for h in self.holes
            ],
            "output_frame_m": of,
            "specs": dict(self.specs),
        }

    def inertia_si(self) -> dict:
        """Mass, centre of mass (m) and inertia tensor about the COM (kg·m²),
        from ``solid()`` at uniform density scaled to the real mass."""
        m = self.mesh(0.1)
        vol_m3 = abs(m.volume) * 1e-9
        rho = (self.mass_g / 1000.0) / vol_m3
        m.apply_scale(1e-3)
        m.density = rho
        return {"mass_kg": self.mass_g / 1000.0,
                "com_m": tuple(float(v) for v in m.center_mass),
                "inertia_kgm2": [[float(v) for v in row] for row in m.moment_inertia]}


def si(value_mm_or_g: float, unit: str = "mm") -> float:
    """Convert a library value to SI: ``si(45.2) -> 0.0452`` m, ``si(55, 'g') -> 0.055`` kg."""
    if unit in ("mm", "g"):
        return value_mm_or_g / 1000.0
    if unit == "kgcm":  # kgf·cm -> N·m
        return value_mm_or_g * 0.0980665
    if unit == "rpm":
        return value_mm_or_g * 2.0 * math.pi / 60.0
    raise ValueError(unit)


def kgcm_to_nm(v: float) -> float:
    return round(v * 0.0980665, 4)


def rpm_to_rad_s(v: float) -> float:
    return round(v * 2.0 * math.pi / 60.0, 3)


# ===================================================================== CAD
# Thin wrappers around build123d's algebra API so part builders stay readable.

def _b3d():
    import build123d as bd
    return bd


def _as_part(shape):
    bd = _b3d()
    if isinstance(shape, bd.Part):
        return shape
    if isinstance(shape, bd.Compound):
        return bd.Part(shape.wrapped)
    return bd.Part(bd.Compound([shape]).wrapped) if not hasattr(shape, "wrapped") else bd.Part(shape.wrapped)


def box(x0, x1, y0, y1, z0, z1):
    """Axis-aligned box from bounds."""
    bd = _b3d()
    x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1)); z0, z1 = sorted((z0, z1))
    return bd.Pos((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) * bd.Box(x1 - x0, y1 - y0, z1 - z0)


def cbox(cx, cy, cz, sx, sy, sz):
    """Axis-aligned box from centre + size."""
    return box(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2)


def cyl(d, z0, z1, x=0.0, y=0.0):
    """Cylinder of diameter ``d`` along Z from z0 to z1 at (x, y)."""
    bd = _b3d()
    z0, z1 = sorted((z0, z1))
    return bd.Pos(x, y, (z0 + z1) / 2) * bd.Cylinder(d / 2, z1 - z0)


def tube(od, idia, z0, z1, x=0.0, y=0.0):
    return cyl(od, z0, z1, x, y) - cyl(idia, z0 - 0.01, z1 + 0.01, x, y)


def cyl_between(d, p0, p1):
    """Cylinder of diameter ``d`` from point p0 to p1 (any direction)."""
    bd = _b3d()
    v = bd.Vector(*p1) - bd.Vector(*p0)
    length = v.length
    plane = bd.Plane(origin=p0, z_dir=v.normalized())
    c = bd.Cylinder(d / 2, length, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    return plane * c


def hexprism(af, z0, z1, x=0.0, y=0.0, rot_deg=0.0):
    """Hexagonal prism, ``af`` = width across flats, along Z."""
    bd = _b3d()
    z0, z1 = sorted((z0, z1))
    poly = bd.RegularPolygon(af / math.sqrt(3), 6, major_radius=True)
    return bd.Pos(x, y, z0) * bd.Rot(0, 0, rot_deg) * bd.extrude(poly, amount=z1 - z0)


def rbox(x0, x1, y0, y1, z0, z1, r):
    """Box with vertical edges rounded by ``r`` (rounded-rectangle extrusion)."""
    bd = _b3d()
    x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1)); z0, z1 = sorted((z0, z1))
    r = min(r, (x1 - x0) / 2 - 1e-3, (y1 - y0) / 2 - 1e-3)
    rr = bd.RectangleRounded(x1 - x0, y1 - y0, r)
    return bd.Pos((x0 + x1) / 2, (y0 + y1) / 2, z0) * bd.extrude(rr, amount=z1 - z0)


def drill(part, holes, depth=4.0):
    """Cut every hole of ``holes`` into ``part`` (tap/through diameter, ``depth`` mm deep)."""
    cutters = None
    for h in holes:
        p0 = tuple(p + a * 0.2 for p, a in zip(h.pos, h.axis))
        p1 = tuple(p - a * depth for p, a in zip(h.pos, h.axis))
        c = cyl_between(h.dia_mm, p0, p1)
        cutters = c if cutters is None else cutters + c
    return part - cutters if cutters is not None else part


def union(*parts):
    out = None
    for p in parts:
        if p is None:
            continue
        out = p if out is None else out + p
    return out


def polar(n, pcd, start_deg=0.0):
    """``n`` points equally spaced on a circle of diameter ``pcd``."""
    return [(pcd / 2 * math.cos(math.radians(start_deg + i * 360.0 / n)),
             pcd / 2 * math.sin(math.radians(start_deg + i * 360.0 / n))) for i in range(n)]


def to_trimesh(shape, tolerance=0.05):
    import numpy as np
    import trimesh
    verts, tris = shape.tessellate(tolerance, 0.3)
    v = np.array([(p.X, p.Y, p.Z) for p in verts], dtype=float)
    f = np.array(tris, dtype=np.int64)
    m = trimesh.Trimesh(v, f, process=True)
    trimesh.repair.fix_normals(m)
    return m
