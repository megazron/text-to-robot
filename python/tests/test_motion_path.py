import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
module = None
if importlib.util.find_spec('fcl'):
    spec = importlib.util.spec_from_file_location('audit_motion_path', ROOT/'scripts/audit_motion_path.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)


@unittest.skipUnless(importlib.util.find_spec('fcl'), 'requires geometry extra')
class MotionPathTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name)/'robot.urdf'
        self.source.write_text('''<robot name="crossing"><link name="base"/>
<link name="a"><visual><geometry><box size=".04 .04 .04"/></geometry></visual></link>
<link name="b"><visual><geometry><box size=".04 .04 .04"/></geometry></visual></link>
<joint name="a_slide" type="prismatic"><parent link="base"/><child link="a"/><axis xyz="1 0 0"/><limit lower="-.3" upper=".3"/></joint>
<joint name="b_slide" type="prismatic"><parent link="base"/><child link="b"/><axis xyz="0 1 0"/><limit lower="-.3" upper=".3"/></joint></robot>''')
        self.scene = module.SurfaceScene(self.source)
        self.crossing = [{'a_slide':-.3,'b_slide':-.3}, {'a_slide':.3,'b_slide':.3}]

    def test_clear_endpoints_do_not_hide_collision_during_coordinated_motion(self):
        for point in self.crossing:
            self.assertEqual(self.scene.contacts(point), [])
        result = module.audit_path(self.scene, self.crossing, linear_step=.01)
        self.assertFalse(result['pass'])
        self.assertEqual(result['poses_checked'], 61)
        self.assertIn(('a','b'), result['first_failure']['pairs'])
        self.assertGreater(result['first_failure']['fraction'], 0)
        self.assertLess(result['first_failure']['fraction'], 1)
        self.assertTrue(any(p['positions']=={'a_slide':0.,'b_slide':0.} for p in result['failures']))

    def test_detour_clears_the_same_obstacle(self):
        result = module.audit_path(self.scene, [self.crossing[0],
            {'a_slide':.3,'b_slide':-.3}, self.crossing[1]], linear_step=.01)
        self.assertTrue(result['pass'])
        self.assertEqual(result['poses_checked'],121)
        self.assertIsNone(result['first_failure'])

    def test_initial_contacts_are_reported_not_accepted(self):
        result = module.audit_path(self.scene,[{'a_slide':0,'b_slide':0}]*2)
        self.assertFalse(result['pass'])
        self.assertEqual(result['initial_pairs'],[('a','b')])
        self.assertEqual(result['failing_poses'],2)
        self.assertEqual(result['poses_with_new_pairs'],0)

    def test_invalid_paths_rejected_before_collision_queries(self):
        self.scene.contacts = lambda *_: self.fail('invalid path changed scene')
        cases = [[], [{}]*2, [self.crossing[0]], [None, {}],
                 [{'missing':0}]*2, [{'a_slide':0},{'b_slide':0}]]
        cases += [[{'a_slide':v}]*2 for v in [True, '0', float('nan'), float('inf'), .31]]
        for points in cases:
            with self.subTest(points=points), self.assertRaises(ValueError):
                module.audit_path(self.scene, points)
        for kwargs in [{'angular_step':0}, {'linear_step':float('nan')},
                       {'max_poses':10}, {'linear_step':1e-320}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                module.audit_path(self.scene,self.crossing,**kwargs)

    def test_held_joints_must_have_valid_zero_and_mimic_is_rejected(self):
        text = self.source.read_text()
        for replacement in [text.replace('lower="-.3"','lower=".1"'),
                            text.replace('<axis xyz="1 0 0"/>','<axis xyz="0 0 0"/>'),
                            text.replace('<axis xyz="1 0 0"/>','<mimic joint="b_slide"/><axis xyz="1 0 0"/>')]:
            self.source.write_text(replacement)
            with self.assertRaises(ValueError):
                module.audit_path(module.SurfaceScene(self.source),[{'b_slide':.2}]*2)

    def test_continuous_joint_does_not_skip_full_turn(self):
        self.source.write_text('''<robot name="turn"><link name="base"/>
<link name="a"><visual><origin xyz=".3 0 0"/><geometry><box size=".04 .04 .04"/></geometry></visual></link>
<link name="obstacle"><visual><origin xyz="0 .3 0"/><geometry><box size=".04 .04 .04"/></geometry></visual></link>
<joint name="spin" type="continuous"><parent link="base"/><child link="a"/><axis xyz="0 0 1"/></joint>
<joint name="mount" type="fixed"><parent link="base"/><child link="obstacle"/></joint></robot>''')
        import math
        result = module.audit_path(module.SurfaceScene(self.source), [{'spin':0},{'spin':2*math.pi}])
        self.assertFalse(result['pass'])
        self.assertGreater(result['poses_checked'],300)

    def test_cli_status_and_report(self):
        path = Path(self.temp.name)/'path.json'
        output = Path(self.temp.name)/'report.json'
        path.write_text(json.dumps(self.crossing))
        command = [sys.executable,str(ROOT/'scripts/audit_motion_path.py'),str(self.source),str(path),'--json',str(output)]
        # A geometry-only command must work without any usable GL backend.
        env = {**os.environ, 'MUJOCO_GL':'unavailable_backend'}
        result = subprocess.run(command, capture_output=True, text=True, timeout=30, env=env)
        self.assertEqual(result.returncode,1,result.stderr)
        self.assertTrue(output.exists(),result.stderr)
        self.assertFalse(json.loads(output.read_text())['pass'])
        result = subprocess.run(command[:-1]+[str(path)], capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode,2)
        self.assertEqual(json.loads(path.read_text()), self.crossing)
