"""Overlay a library component on its reference STEP and report how well they agree.

The reference is moved into the component frame (rotate about Z by --rot deg, then
translate by --dx --dy --dz) and both are intersected with a clip box so features
the reference lacks (e.g. the horn) can be excluded.

    python scripts/hardware/compare_component.py hobby_sg90 references/hardware/cache/sg90.step \
        --rot -90 --dx 16.6 --dz -28.7 --clip-top -6.0
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python"))
from build123d import Axis, Box, Pos, import_step  # noqa: E402

from ttr_build.components import get  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("key"); ap.add_argument("step")
    for k in ("rot", "dx", "dy", "dz"):
        ap.add_argument(f"--{k}", type=float, default=0.0)
    ap.add_argument("--clip-top", type=float, default=1e9, help="ignore everything above this z (component frame)")
    ap.add_argument("--clip-bottom", type=float, default=-1e9, help="ignore everything below this z")
    a = ap.parse_args()
    comp = get(a.key).solid()
    ref = import_step(a.step)
    ref = Pos(a.dx, a.dy, a.dz) * ref.rotate(Axis.Z, a.rot)
    bb = comp.bounding_box()
    lo, hi = max(a.clip_bottom, bb.min.Z - 50), min(a.clip_top, bb.max.Z + 50)
    clip = Pos(0, 0, (lo + hi) / 2) * Box(400, 400, hi - lo)
    c, r = comp & clip, ref & clip
    inter = (c & r).volume
    union_v = c.volume + r.volume - inter
    rb, cb = r.bounding_box(), c.bounding_box()
    print(f"component {c.volume:9.0f} mm3   reference {r.volume:9.0f} mm3   IoU {inter / union_v:.3f}")
    print(f"bbox component ({cb.min.X:.1f},{cb.min.Y:.1f},{cb.min.Z:.1f})..({cb.max.X:.1f},{cb.max.Y:.1f},{cb.max.Z:.1f})")
    print(f"bbox reference ({rb.min.X:.1f},{rb.min.Y:.1f},{rb.min.Z:.1f})..({rb.max.X:.1f},{rb.max.Y:.1f},{rb.max.Z:.1f})")


if __name__ == "__main__":
    main()
