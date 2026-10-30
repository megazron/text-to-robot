"""Hobby servos and Arduino electronics: valid solids, sane specs, and agreement with open CAD.

The CAD comparisons need references/hardware/cache (python scripts/fetch_hardware_refs.py);
they are skipped when it is absent.
"""
import math
import unittest
from pathlib import Path

from ttr_build.components import get

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "references" / "hardware" / "cache"

SERVOS = ["hobby_sg90", "hobby_mg90s", "hobby_mg996r", "hobby_ds3218"]
BOARDS = ["arduino_uno_r3", "arduino_nano_v3", "pca9685_16ch", "buck_lm2596", "dc_jack_5521_panel", "psu_5v_lrs50"]


def iou(key, step, rot=0.0, dx=0.0, dy=0.0, dz=0.0, lo=-1e9, hi=1e9):
    from build123d import Axis, Box, Pos, import_step
    comp = get(key).solid()
    ref = Pos(dx, dy, dz) * import_step(str(CACHE / step)).rotate(Axis.Z, rot)
    bb = comp.bounding_box()
    lo, hi = max(lo, bb.min.Z - 50), min(hi, bb.max.Z + 50)
    clip = Pos(0, 0, (lo + hi) / 2) * Box(400, 400, hi - lo)
    c, r = comp & clip, ref & clip
    inter = (c & r).volume
    return inter / (c.volume + r.volume - inter)


class HobbyServoSpecs(unittest.TestCase):
    def test_solids_and_frames(self):
        for k in SERVOS:
            c = get(k)
            s = c.solid()
            self.assertTrue(s.is_valid, k)
            bb = s.bounding_box()
            self.assertLess(abs(bb.max.Z - (2.8 if c.specs["horn"] == "cross" else 0.5)), 0.2, k)  # horn face at z = 0
            self.assertEqual(c.output_frame, ((0.0, 0.0, 0.0), (0.0, 0.0, 1.0)))

    def test_torque_speed_and_current(self):
        sg90, mg996r, ds3218 = get("hobby_sg90"), get("hobby_mg996r"), get("hobby_ds3218")
        self.assertAlmostEqual(sg90.specs["stall_torque_nm"], 1.8 * 9.80665 / 100, places=3)
        self.assertAlmostEqual(sg90.specs["no_load_speed_rad_s"], (math.pi / 3) / 0.10, places=2)
        self.assertGreater(mg996r.specs["stall_torque_nm"], sg90.specs["stall_torque_nm"] * 5)
        self.assertGreater(ds3218.specs["stall_torque_nm"], mg996r.specs["stall_torque_nm"])
        for k in SERVOS:
            c = get(k)
            self.assertAlmostEqual(c.specs["rated_torque_nm"], 0.3 * c.specs["stall_torque_nm"], places=3)
            self.assertGreater(c.specs["stall_current_a"], 0.3)
            self.assertEqual(len(c.specs["pulse_us"]), 2)

    def test_tab_holes_symmetric_about_case(self):
        for k in SERVOS:
            c = get(k)
            tabs = [h for h in c.holes if h.axis == (0.0, 0.0, -1.0)]
            xs = sorted({round(h.pos[0], 3) for h in tabs})
            self.assertAlmostEqual((xs[0] + xs[-1]) / 2, -c.specs["output_offset_mm"], places=3, msg=k)
            self.assertAlmostEqual(xs[-1] - xs[0], c.specs["tab_hole_spacing_mm"][0], places=3, msg=k)

    def test_horn_holes_inside_horn(self):
        for k in SERVOS:
            c = get(k)
            for h in c.holes:
                if h.axis == (0.0, 0.0, 1.0):
                    self.assertLessEqual(math.hypot(h.pos[0], h.pos[1]), c.specs["horn_radius_mm"], k)


class Boards(unittest.TestCase):
    def test_boards_build(self):
        for k in BOARDS:
            self.assertTrue(get(k).solid().is_valid, k)

    def test_uno_hole_pattern(self):
        xy = sorted((h.pos[0], h.pos[1]) for h in get("arduino_uno_r3").holes)
        self.assertEqual(xy, sorted([(13.97, 2.54), (15.24, 50.8), (66.04, 7.62), (66.04, 35.56)]))


@unittest.skipUnless(CACHE.exists(), "open CAD references not downloaded")
class AgreesWithOpenCad(unittest.TestCase):
    """Volume overlap with the reference STEP models (frames aligned by hand once)."""

    def test_sg90(self):
        self.assertGreater(iou("hobby_sg90", "sg90.step", rot=-90, dx=-16.6, dz=-28.7, hi=-2.0), 0.95)

    def test_mg90s(self):
        self.assertGreater(iou("hobby_mg90s", "mg90s_1143.step", rot=90, dz=-9.9, hi=-2.0), 0.94)

    def test_mg996r_matches_standard_size(self):
        self.assertGreater(iou("hobby_mg996r", "futaba3003.step", dx=-9.4, dz=-44.1, hi=-6.2), 0.9)

    def test_pca9685_board(self):
        self.assertGreater(iou("pca9685_16ch", "pca9685_815.step", dx=1.91, dy=6.48, lo=0.0, hi=1.57), 0.93)

    def test_lm2596_board(self):
        self.assertGreater(iou("buck_lm2596", "lm2596.step", lo=0.0, hi=1.6), 0.98)


if __name__ == "__main__":
    unittest.main()
