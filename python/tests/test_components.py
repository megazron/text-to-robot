"""Sanity checks for the datasheet-backed component library (ttr_build.components)."""
import math
import re
import unittest

from _deps import require

require("build123d", "trimesh")

from ttr_build.components import CATEGORIES, REGISTRY, get  # noqa: E402

REQUIRED = [
    "feetech_sts3215_c001", "feetech_sts3215_c018", "feetech_sts3215_c047",
    "dxl_xl330_m288", "dxl_xl430_w250", "dxl_xm430_w350", "dxl_xh540_w270",
    "cubemars_ak60_6", "cubemars_ak70_10", "cubemars_ak80_9", "cubemars_ak80_64",
    "nema17_42x40", "nema17_42x40_pg5", "pololu_37d_50to1_64cpr", "n20_gearmotor_100to1",
    "horn_sts3215_25t", "horn_dxl_hn12_n101",
    "bearing_608zz", "bearing_625zz", "bearing_6800zz", "bearing_6803zz", "bearing_6806zz", "bearing_6808",
    "shcs_m2x6", "shcs_m2.5x12", "shcs_m3x30", "shcs_m4x20", "insert_m3", "insert_m4", "nut_m3", "nut_m4",
    "rpi5", "jetson_orin_nano_super", "esp32_s3_devkitc1", "feetech_fe_urt1", "waveshare_bus_servo_adapter",
    "dxl_u2d2", "rplidar_c1", "rplidar_a1m8", "realsense_d435i", "rpi_camera_module_3", "bno085_breakout",
    "lipo_3s_2200", "lipo_4s_5000", "lipo_6s_10000", "psu_12v_lrs75", "buck_5v_5a",
    "wheel_65mm_tt", "wheel_90mm_37d",
]
TOL = 0.6  # mm


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(v):
    n = math.sqrt(sum(x * x for x in v))
    return tuple(x / n for x in v)


class ComponentLibraryTest(unittest.TestCase):
    def test_required_parts_present(self):
        missing = [k for k in REQUIRED if k not in REGISTRY]
        self.assertEqual(missing, [])
        self.assertIs(get("bearing_608zz"), REGISTRY["bearing_608zz"])
        with self.assertRaises(KeyError):
            get("no_such_part")

    def test_metadata(self):
        for c in REGISTRY.values():
            with self.subTest(c.key):
                self.assertIn(c.category, CATEGORIES)
                self.assertGreater(c.mass_g, 0)
                self.assertGreater(c.price_usd, 0)
                self.assertTrue(c.supplier_url.startswith("https://"), c.supplier_url)
                self.assertTrue(c.datasheet_url.startswith("https://"), c.datasheet_url)
                self.assertTrue(c.name)
                self.assertEqual(len(c.envelope_mm), 3)
                self.assertTrue(all(v > 0 for v in c.envelope_mm))
                for f in c.specs.get("uncertain", []):
                    self.assertTrue(f in c.specs or hasattr(c, f), f"{c.key}: uncertain field {f} unknown")
                si = c.si()
                self.assertAlmostEqual(si["mass_kg"], c.mass_g / 1000)

    def test_holes(self):
        for c in REGISTRY.values():
            with self.subTest(c.key):
                if c.category != "battery" and not c.specs.get("no_mounting_holes"):
                    self.assertTrue(c.holes, "no mounting holes")
                lo, hi = c.bbox()
                for h in c.holes:
                    self.assertAlmostEqual(math.sqrt(sum(a * a for a in h.axis)), 1.0, places=6)
                    self.assertGreater(h.dia_mm, 0)
                    if h.thread is not None:
                        self.assertRegex(h.thread, r"^(M\d+(\.\d+)?|1/4-20|#\d+-\d+)$")
                    for i in range(3):
                        self.assertGreaterEqual(h.pos[i], lo[i] - TOL, f"hole {h} outside bbox")
                        self.assertLessEqual(h.pos[i], hi[i] + TOL, f"hole {h} outside bbox")

    def test_holes_sit_on_a_surface(self):
        # a mounting hole must open onto free space (just outside along +axis), be empty at its centre
        # just inside, and be surrounded by material -- catches holes buried under features or floating
        import build123d as bd
        for c in REGISTRY.values():
            if c.category == "fastener":  # a screw's "hole" is the clearance hole it needs, not a feature on it
                continue
            s = c.solid()
            for h in c.holes:
                with self.subTest(c.key, hole=h.pos):
                    p, a = h.pos, h.axis
                    u = (1.0, 0.0, 0.0) if abs(a[0]) < 0.9 else (0.0, 1.0, 0.0)
                    u = _unit(_cross(a, u))
                    w = _cross(a, u)
                    pt = lambda d, r=0.0, t=0.0: bd.Vector(*[p[i] + a[i] * d + r * (math.cos(t) * u[i] + math.sin(t) * w[i])
                                                            for i in range(3)])
                    self.assertFalse(s.is_inside(pt(0.3)), "hole entry is buried")
                    self.assertFalse(s.is_inside(pt(-0.4)), "hole centre is solid")
                    ring = sum(s.is_inside(pt(-0.4, h.dia_mm / 2 + 0.35, k * math.pi / 4)) for k in range(8))
                    self.assertGreaterEqual(ring, 5, "hole is not surrounded by material")

    def test_envelope_matches_solid(self):
        for c in REGISTRY.values():
            with self.subTest(c.key):
                lo, hi = c.bbox()
                size = [b - a for a, b in zip(lo, hi)]
                for got, want in zip(size, c.envelope_mm):
                    self.assertAlmostEqual(got, want, delta=max(0.6, 0.02 * want))

    def test_density_plausible(self):
        # effective density = real mass / modelled volume; catches unit slips and wrong solids
        for c in REGISTRY.values():
            with self.subTest(c.key):
                vol_cm3 = c.solid().volume / 1000.0
                self.assertGreater(vol_cm3, 0)
                rho = c.mass_g / vol_cm3
                self.assertGreater(rho, 0.15, f"{c.key}: {rho:.2f} g/cm3 too light for its solid")
                self.assertLess(rho, 9.0, f"{c.key}: {rho:.2f} g/cm3 denser than brass")

    def test_actuators(self):
        acts = [c for c in REGISTRY.values() if c.category == "actuator"]
        self.assertGreaterEqual(len(acts), 14)
        for c in acts:
            with self.subTest(c.key):
                self.assertIsNotNone(c.output_frame)
                origin, axis = c.output_frame
                self.assertEqual(tuple(axis), (0.0, 0.0, 1.0))
                self.assertAlmostEqual(origin[2], 0.0)
                for f in ("stall_torque_nm", "rated_torque_nm", "no_load_speed_rad_s", "voltage_v"):
                    self.assertGreater(c.specs[f], 0, f)
                self.assertLessEqual(c.specs["rated_torque_nm"], c.specs["stall_torque_nm"])
                lo, hi = c.bbox()
                self.assertLess(lo[2], -5.0, "body must extend towards -Z")
                self.assertLess(abs(origin[0]) + abs(origin[1]), 1e-6, "output axis must be the Z axis")

    def test_keepout_contains_solid(self):
        for c in REGISTRY.values():
            with self.subTest(c.key):
                s, k = c.solid(), c.keepout()
                outside = (s - k).volume
                self.assertLess(outside, 1e-3 * s.volume + 1e-3)
                self.assertGreaterEqual(k.volume, s.volume - 1e-3)

    def test_si_helpers(self):
        from ttr_build.components import kgcm_to_nm, rpm_to_rad_s, si
        self.assertAlmostEqual(si(45.2), 0.0452)
        self.assertAlmostEqual(si(55, "g"), 0.055)
        self.assertAlmostEqual(kgcm_to_nm(10), 0.980665, places=3)
        self.assertAlmostEqual(rpm_to_rad_s(60), 6.283, places=3)
        inert = get("bearing_608zz").inertia_si()
        self.assertAlmostEqual(inert["mass_kg"], 0.012)
        self.assertTrue(all(inert["inertia_kgm2"][i][i] > 0 for i in range(3)))

    def test_keys_are_slugs(self):
        for k in REGISTRY:
            self.assertRegex(k, r"^[a-z0-9_.]+$")


if __name__ == "__main__":
    unittest.main()
