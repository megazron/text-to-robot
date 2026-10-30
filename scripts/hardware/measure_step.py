"""Print the measurable features of a STEP model: bounding box and every cylinder
(diameter, axis, centre, length). Used to take component dimensions from open CAD.

    python scripts/hardware/measure_step.py <file.step> [--min-d 1] [--max-d 30]
"""
import argparse
from collections import defaultdict

from build123d import GeomType, import_step


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("step"); ap.add_argument("--min-d", type=float, default=0.8); ap.add_argument("--max-d", type=float, default=40)
    a = ap.parse_args()
    shape = import_step(a.step)
    bb = shape.bounding_box()
    print(f"bbox min ({bb.min.X:.2f}, {bb.min.Y:.2f}, {bb.min.Z:.2f})  max ({bb.max.X:.2f}, {bb.max.Y:.2f}, {bb.max.Z:.2f})  size {bb.size.X:.2f} x {bb.size.Y:.2f} x {bb.size.Z:.2f}")
    seen = defaultdict(list)
    for f in shape.faces():
        if f.geom_type != GeomType.CYLINDER:
            continue
        try:
            r = f.radius
            ax = f.axis_of_rotation
        except Exception:
            continue
        d = 2 * r
        if not (a.min_d <= d <= a.max_d):
            continue
        fb = f.bounding_box()
        dvec = ax.direction
        axis = max(("X", abs(dvec.X)), ("Y", abs(dvec.Y)), ("Z", abs(dvec.Z)), key=lambda t: t[1])[0]
        c = fb.center()
        length = {"X": fb.size.X, "Y": fb.size.Y, "Z": fb.size.Z}[axis]
        key = (round(d, 2), axis, round(c.X, 1), round(c.Y, 1), round(c.Z, 1))
        seen[key].append(length)
    for (d, axis, x, y, z), ls in sorted(seen.items(), key=lambda kv: (-kv[0][0], kv[0][1])):
        print(f"  cyl d={d:6.2f} axis={axis} centre=({x:7.1f},{y:7.1f},{z:7.1f}) len={max(ls):6.2f}")


if __name__ == "__main__":
    main()
