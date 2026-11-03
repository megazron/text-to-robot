"""Contact sheet of every component: ``python -m ttr_build.components.render``.

Writes ``docs/img/components.png`` (repo root) by default.  Each tile shows the
solid (shaded), its mounting holes (red: position + outward axis) and, for
actuators, the output frame (blue arrow).
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

from . import REGISTRY

_REPO = Path(__file__).resolve().parents[3]
_CAT_COLOR = {
    "actuator": (0.25, 0.27, 0.30), "bearing": (0.62, 0.64, 0.68), "fastener": (0.35, 0.35, 0.38),
    "insert": (0.80, 0.65, 0.30), "sensor": (0.30, 0.45, 0.70), "compute": (0.20, 0.55, 0.35),
    "battery": (0.75, 0.35, 0.25), "wheel": (0.22, 0.22, 0.22), "motor_driver": (0.30, 0.50, 0.60),
    "horn": (0.62, 0.64, 0.68), "misc": (0.6, 0.5, 0.7),
}


def _tile(ax, comp):
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    size = max(comp.envelope_mm)
    m = comp.mesh(tolerance=max(0.02, size / 300))
    # split long triangles so matplotlib's painter's-algorithm depth sort stays correct
    import trimesh
    v, f = trimesh.remesh.subdivide_to_size(m.vertices, m.faces, max_edge=size / 12, max_iter=6)
    m = trimesh.Trimesh(v, f, process=False)
    tris = m.vertices[m.faces]
    light = np.array([0.4, -0.5, 0.8]); light /= np.linalg.norm(light)
    shade = 0.35 + 0.65 * np.abs(m.face_normals @ light)  # two-sided: robust to winding
    base = np.array(_CAT_COLOR.get(comp.category, (0.5, 0.5, 0.5)))
    cols = np.clip(base[None, :] * (0.55 + 0.75 * shade[:, None]), 0, 1)
    ax.add_collection3d(Poly3DCollection(tris, facecolors=cols, edgecolors="none", linewidths=0))
    lo, hi = m.bounds
    c = (lo + hi) / 2
    r = max(hi - lo) / 2 * 1.05
    for h in comp.holes:
        p, a = np.array(h.pos), np.array(h.axis)
        q = p + a * r * 0.25
        ax.plot(*zip(p, q), color="#d62828", lw=0.9)
        ax.scatter(*p, color="#d62828", s=3, depthshade=False)
    if comp.output_frame is not None:
        o, a = np.array(comp.output_frame[0]), np.array(comp.output_frame[1])
        q = o + a * r * 0.6
        ax.plot(*zip(o, q), color="#1d4ed8", lw=1.6)
    ax.set_xlim(c[0] - r, c[0] + r); ax.set_ylim(c[1] - r, c[1] + r); ax.set_zlim(c[2] - r, c[2] + r)
    ax.set_box_aspect((1, 1, 1))
    ax.view_init(elev=24, azim=-58)
    ax.set_axis_off()
    e = comp.envelope_mm
    unc = " *" if comp.specs.get("uncertain") else ""
    ax.set_title(f"{comp.key}{unc}\n{e[0]:.0f}x{e[1]:.0f}x{e[2]:.0f} mm  {comp.mass_g:g} g", fontsize=7.5, pad=-4)


def render(out: Path, keys=None, cols: int = 9, dpi: int = 110):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    comps = [REGISTRY[k] for k in (keys or REGISTRY)]
    rows = math.ceil(len(comps) / cols)
    tile = 2.6
    head = 0.6  # inches reserved for the sheet title
    fig = plt.figure(figsize=(cols * tile, rows * (tile + 0.15) + head))
    for i, comp in enumerate(comps):
        ax = fig.add_subplot(rows, cols, i + 1, projection="3d")
        _tile(ax, comp)
    fig.suptitle("ttr_build component library  (red = mounting holes + outward axis, blue = actuator output +Z,"
                 " * = some specs uncertain)", fontsize=11, y=1 - 0.15 / fig.get_figheight())
    fig.subplots_adjust(left=0, right=1, bottom=0, top=1 - head / fig.get_figheight(), wspace=0, hspace=0.15)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=dpi, facecolor="white")
    plt.close(fig)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("-o", "--out", type=Path, default=_REPO / "docs" / "img" / "components.png")
    ap.add_argument("--keys", nargs="*", help="only these component keys")
    ap.add_argument("--all-screws", action="store_true", help="include every screw length (default: 6/16/30 only)")
    ap.add_argument("--cols", type=int, default=9)
    ap.add_argument("--dpi", type=int, default=110)
    a = ap.parse_args(argv)
    keys = a.keys
    if not keys and not a.all_screws:
        keys = [k for k, c in REGISTRY.items()
                if not (k.startswith("shcs_") and c.specs["length_mm"] not in (6, 16, 30))]
    print(render(a.out, keys, a.cols, a.dpi))


if __name__ == "__main__":
    main()
