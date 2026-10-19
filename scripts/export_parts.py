"""Export python/ttr_build.components to the TypeScript parts catalog.

Writes packages/parts/data/catalog.json (datasheet values, mounting holes, output frames)
and packages/parts/data/meshes.json (coarse tessellations of each component's CAD body,
used as the visual in URDF/MuJoCo/browser). Needs build123d:

    .venv/bin/python scripts/export_parts.py
"""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from ttr_build.components import REGISTRY  # noqa: E402

OUT = ROOT / "packages/parts/data"
# fasteners, nuts and inserts are BOM lines only; their meshes are not worth shipping
NO_MESH = ("shcs_", "nut_", "insert_")


def tessellate(component, tol: float):
    solid = component.solid()
    verts, tris = solid.tessellate(tol, 0.5)
    v = [[round(p.X, 2), round(p.Y, 2), round(p.Z, 2)] for p in verts]
    return v, [list(t) for t in tris]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    catalog, meshes = {}, {}
    for key in sorted(REGISTRY):
        c = REGISTRY[key]
        entry = {
            "key": c.key, "name": c.name, "category": c.category, "mass_g": c.mass_g, "price_usd": c.price_usd,
            "supplier_url": c.supplier_url, "datasheet_url": c.datasheet_url, "envelope_mm": list(c.envelope_mm),
            "holes": [{"pos": list(h.pos), "axis": list(h.axis), "dia_mm": h.dia_mm, "thread": h.thread} for h in c.holes],
            "specs": c.specs,
            "output_frame": [list(c.output_frame[0]), list(c.output_frame[1])] if c.output_frame else None,
        }
        if not key.startswith(NO_MESH):
            bb = c.solid().bounding_box()
            entry["bbox_mm"] = {"min": [round(bb.min.X, 2), round(bb.min.Y, 2), round(bb.min.Z, 2)],
                                "max": [round(bb.max.X, 2), round(bb.max.Y, 2), round(bb.max.Z, 2)]}
            # coarse enough to keep the browser bundle small, fine enough to read as the real part
            span = max(bb.max.X - bb.min.X, bb.max.Y - bb.min.Y, bb.max.Z - bb.min.Z)
            v, f = tessellate(c, max(0.15, span / 250))
            meshes[key] = {"v": [x for p in v for x in p], "f": [i for t in f for i in t]}
            entry["mesh_triangles"] = len(f)
        catalog[key] = entry
        print(f"{key:32s} {entry.get('mesh_triangles', '-')}")
    (OUT / "catalog.json").write_text(json.dumps(catalog, indent=1, default=list) + "\n")
    (OUT / "meshes.json").write_text(json.dumps(meshes, separators=(",", ":")) + "\n")
    print(f"{len(catalog)} components, {sum(len(m['f']) // 3 for m in meshes.values())} triangles")


if __name__ == "__main__":
    main()
