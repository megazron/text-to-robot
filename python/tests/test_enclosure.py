import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
import numpy as np

from ttr_cad.enclosure import validate, build, export
from ttr_cad.attach import attach

EXAMPLE = Path(__file__).parents[1] / "ttr_cad" / "example_enclosure.json"


class EnclosureValidationTests(unittest.TestCase):
    def setUp(self):
        self.spec = json.loads(EXAMPLE.read_text())

    def test_rejects_invalid_hardware_inputs(self):
        for key, value in (("wall_mm", float("nan")), ("floor_mm", -1), ("dimension_source", ""),
                           ("name", "../../escape"), ("boss_diameter_mm", 3.3),
                           ("mounting_holes_mm", [[29, 19], [-29, -19]]),
                           ("cable_port_mm", [14, 20, 5])):
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate({**self.spec, key: value})

    @unittest.skipUnless(importlib.util.find_spec("cadquery"), "install .[cad] for solid CAD tests")
    def test_attachment_accounts_for_housing_and_electronics_mass(self):
        robot={"robot_name":"fixture","links":[{"name":"base","mass":1}],"joints":[],"materials":[],"metadata":{"notes":[]}}
        result=attach(robot,self.spec,"base",[.2,0,.1],[0,0,.3],.045)
        self.assertEqual(len(robot["links"]),1,"input must not be mutated")
        self.assertEqual(len(result["links"]),4)
        self.assertEqual(result["joints"][0]["origin"]["xyz"],[.2,0,.1])
        self.assertEqual(result["joints"][1]["parent"],"electronics_bay_demo_base")
        parts,_=build(self.spec)
        expected=.045+sum(p.val().Volume()*1e-9*self.spec["density_kg_m3"] for p in parts.values())
        self.assertAlmostEqual(sum(l["mass"] for l in result["links"])-1,expected)
        for link in result["links"][1:3]:
            self.assertEqual(link["geometry"]["part"],"indexed_mesh")
            self.assertGreater(len(link["geometry"]["triangles"]),0)
        with self.assertRaisesRegex(ValueError,"already exist"):
            attach(result,self.spec,"base",[0,0,0],[0,0,0],.045)

    @unittest.skipUnless(importlib.util.find_spec("cadquery"), "install .[cad] for solid CAD tests")
    def test_hollow_enclosure_has_mounting_bores_and_exports_real_solids(self):
        import cadquery as cq
        parts, assembly = build(self.spec)
        base = parts["base"]
        self.assertTrue(base.val().isValid())
        # A point in the empty interior must not be contained in the base.
        self.assertFalse(base.val().isInside(cq.Vector(0, 0, 12)))
        # Board and lid bores are empty along their full grip, material surrounds them.
        self.assertFalse(base.val().isInside(cq.Vector(-24, -14, 1)))
        self.assertTrue(base.val().isInside(cq.Vector(-21, -14, 4)))
        for x, y in assembly["lid_holes_mm"]:
            self.assertFalse(base.val().isInside(cq.Vector(x, y, 10)))
        self.assertFalse(base.val().isInside(cq.Vector(32, 0, 13)), "cable port must be open")
        with tempfile.TemporaryDirectory() as directory:
            report = export(self.spec, directory)
            for name in ("base", "lid"):
                step = Path(directory) / f"electronics_bay_demo_{name}.step"
                self.assertTrue(step.exists())
                reloaded = cq.importers.importStep(str(step)).val()
                self.assertTrue(reloaded.isValid())
                self.assertAlmostEqual(reloaded.Volume(), parts[name].val().Volume(), places=4)
                self.assertGreater((Path(directory) / f"electronics_bay_demo_{name}.stl").stat().st_size, 100)
                props = report["parts"][name]
                self.assertGreater(props["mass_kg"], 0)
                inertia = np.array(props["inertia_kg_m2"])
                self.assertTrue(np.all(np.linalg.eigvalsh(inertia) > 0))
                np.testing.assert_allclose(inertia, inertia.T, atol=1e-12)


if __name__ == "__main__":
    unittest.main()
