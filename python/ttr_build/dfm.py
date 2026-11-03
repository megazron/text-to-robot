"""Design-for-FDM-printing audit of printed parts (STL).

For every part: watertight solid, best of the candidate print orientations (each large flat face down, plus the
six axis directions), and in that orientation
  - bed fit (default Prusa MK4: 250 x 210 x 220 mm),
  - support area: downward-facing surface steeper than 45 deg from vertical that is not on the bed,
  - first-layer contact area (adhesion),
  - thinnest wall: inward ray casts from sampled surface points (walls under 1.2 mm = 3 perimeters of 0.4 mm fail),
  - small features: parts or walls under 0.8 mm cannot be printed with a 0.4 mm nozzle.
A part passes when it fits, has a flat face on the bed, needs supports under at most 30 % of its surface (inside an open shell they are removable tree supports) (up to 8 % it
prints without supports; above that the print list says "supports") and has no wall under 1.2 mm. Usage: python -m ttr_build.dfm <part.stl|cad.zip|folder> [...] [--json out.json]
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from dataclasses import dataclass, asdict, field
from pathlib import Path

import numpy as np
import trimesh

BED_MM = (250.0, 210.0, 220.0)
OVERHANG_DEG = 45.0
MIN_WALL_MM = 1.2          # 3 perimeters: below this a wall is reported as thin
HARD_MIN_WALL_MM = 0.8     # 2 extrusion lines of a 0.4 mm nozzle: below this a feature does not print reliably
NOZZLE_MM = 0.4


@dataclass
class PartReport:
    name: str
    watertight: bool
    volume_cm3: float
    size_mm: list
    orientation: list            # unit vector pointing down onto the bed (in part coordinates)
    fits_bed: bool
    support_area_cm2: float
    support_frac: float          # support contact area / total surface
    bed_contact_cm2: float
    min_wall_mm: float
    thin_wall_frac: float        # sampled points whose wall is under MIN_WALL_MM
    passed: bool
    supports: str = "none"       # none (<= 8 % of the surface) / needed (<= 30 %, e.g. tree supports inside a dome)
    problems: list = field(default_factory=list)
    warnings: list = field(default_factory=list)


def _units_to_mm(m: trimesh.Trimesh) -> trimesh.Trimesh:
    ext = float(np.max(m.extents))
    if ext < 2.0:                # the exporters write metres
        m = m.copy(); m.apply_scale(1000.0)
    return m


def _rotation_to_down(d: np.ndarray) -> np.ndarray:
    """Rotation that maps direction d onto -z (d becomes the bed normal pointing down)."""
    return trimesh.geometry.align_vectors(d / np.linalg.norm(d), np.array([0.0, 0.0, -1.0]))


def _candidates(m: trimesh.Trimesh, n_faces: int = 6) -> list[np.ndarray]:
    dirs = [np.array(v, float) for v in ([1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1])]
    # the largest planar facets are natural print beds
    try:
        order = np.argsort(m.facets_area)[::-1][:n_faces]
        dirs += [m.facets_normal[i] for i in order]
    except Exception:
        pass
    return dirs


def _orientation_score(m: trimesh.Trimesh, d: np.ndarray):
    R = _rotation_to_down(d)
    mm = m.copy(); mm.apply_transform(R)
    zmin = mm.bounds[0, 2]
    n = mm.face_normals; a = mm.area_faces; c = mm.triangles_center
    down = -n[:, 2]                                     # 1 = facing straight down
    on_bed = (c[:, 2] - zmin) < 0.3
    steep = down > np.cos(np.radians(90 - OVERHANG_DEG))  # facing down more than 45 deg past vertical
    support = float(a[steep & ~on_bed].sum())
    bed = float(a[on_bed & (down > 0.95)].sum())
    ext = np.sort(mm.extents[:2])[::-1]
    fits = ext[0] <= max(BED_MM[:2]) and ext[1] <= min(BED_MM[:2]) and mm.extents[2] <= BED_MM[2]
    return support, bed, fits, mm


def _min_wall(m: trimesh.Trimesh, samples: int = 1500, seed: int = 0):
    """Thickness at sampled surface points: distance along the inward normal to the opposite surface."""
    rng = np.random.default_rng(seed)
    pts, fi = trimesh.sample.sample_surface(m, samples, seed=int(rng.integers(1 << 30)))
    nrm = m.face_normals[fi]
    origins = pts - nrm * 1e-3
    try:
        locs, idx_ray, _ = m.ray.intersects_location(origins, -nrm, multiple_hits=False)
    except Exception:
        return float("nan"), 0.0
    if not len(idx_ray): return float("nan"), 0.0
    th = np.full(len(pts), np.inf)
    th[idx_ray] = np.linalg.norm(locs - origins[idx_ray], axis=1)
    th = th[np.isfinite(th)]
    if not len(th): return float("nan"), 0.0
    # ignore the thinnest 0.5 % (sharp edges and chamfer tips are not walls)
    return float(np.percentile(th, 0.5)), float(np.mean(th < MIN_WALL_MM))


def audit_mesh(m: trimesh.Trimesh, name: str, max_support_frac: float = 0.30, no_support_frac: float = 0.08) -> PartReport:
    m = _units_to_mm(m)
    best = None
    for d in _candidates(m):
        s, bed, fits, mm = _orientation_score(m, d)
        key = (not fits, bed < 100.0, s - 0.2 * bed)   # must fit, then must stand on a flat face, then least support
        if best is None or key < best[0]: best = (key, d, s, bed, fits, mm)
    _, d, support, bed, fits, mm = best
    wall, thin = _min_wall(m)
    total = float(m.area)
    problems = []
    if not m.is_watertight: problems.append("mesh is not watertight (not a closed solid)")
    pieces = len(m.split(only_watertight=False))
    if pieces > 1: problems.append(f"{pieces} separate pieces (a part must be one connected solid)")
    if not fits: problems.append(f"does not fit a {BED_MM[0]:.0f} x {BED_MM[1]:.0f} x {BED_MM[2]:.0f} mm bed in any orientation tried ({' x '.join(f'{v:.0f}' for v in mm.extents)} mm)")
    if support / max(total, 1e-9) > max_support_frac: problems.append(f"needs supports under {support / 100:.1f} cm^2 ({support / total:.0%} of its surface) even in its best orientation")
    if bed < 1.0: problems.append("no flat face to stand on the bed")
    warnings = []
    if np.isfinite(wall) and wall < HARD_MIN_WALL_MM: problems.append(f"walls down to {wall:.2f} mm (< {HARD_MIN_WALL_MM} mm = 2 extrusion lines) on {thin:.0%} of the surface")
    elif np.isfinite(wall) and wall < MIN_WALL_MM: warnings.append(f"thin wall {wall:.2f} mm (prints with 2 perimeters; 3 recommended)")
    supports = "none" if support / max(total, 1e-9) <= no_support_frac else "needed"
    return PartReport(name=name, supports=supports, watertight=bool(m.is_watertight), volume_cm3=round(float(abs(m.volume)) / 1000, 2),
                      size_mm=[round(float(v), 1) for v in m.extents], orientation=[round(float(v), 3) for v in d],
                      fits_bed=bool(fits), support_area_cm2=round(support / 100, 2), support_frac=round(support / max(total, 1e-9), 3),
                      warnings=warnings, bed_contact_cm2=round(bed / 100, 2), min_wall_mm=round(wall, 2) if np.isfinite(wall) else None,
                      thin_wall_frac=round(thin, 3), passed=not problems, problems=problems)


def iter_parts(path: Path):
    path = Path(path)
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as z:
            for n in sorted(z.namelist()):
                if n.endswith(".stl") and "/print/" in n:
                    yield n.split("/")[-1][:-4], trimesh.load(io.BytesIO(z.read(n)), file_type="stl", force="mesh")
    elif path.is_dir():
        for f in sorted(path.rglob("*.stl")): yield f.stem, trimesh.load(f, force="mesh")
    else:
        yield path.stem, trimesh.load(path, force="mesh")


def main(argv):
    out = None
    if "--json" in argv: i = argv.index("--json"); out = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
    reports = []
    for p in argv:
        for name, mesh in iter_parts(Path(p)):
            r = audit_mesh(mesh, name); reports.append(asdict(r))
            print(f"{'PASS' if r.passed else 'FAIL'} {name:32s} {r.size_mm} mm  supports {r.supports} ({r.support_frac:.0%})  wall {r.min_wall_mm} mm  " + "; ".join(r.problems))
    if out: Path(out).write_text(json.dumps(reports, indent=1))
    return 0 if all(r["passed"] for r in reports) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
