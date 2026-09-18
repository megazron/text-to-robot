import json,unittest
from pathlib import Path
from ttr_mujoco.wearability import assess
class WearabilityTests(unittest.TestCase):
    def setUp(self):
        self.w=json.loads((Path(__file__).parents[1]/'ttr_mujoco/wearer.example.json').read_text())
        self.robot={'links':[{'name':'neck_ring','geometry':{'type':'mesh','part':'ring','params':{'inner':.07}}}]}
    def test_neck_opening_is_not_mistaken_for_head_entry(self):
        r=assess(self.robot,self.w)
        self.assertFalse(r['checks'][0]['pass']);self.assertFalse(r['build_ready'])
        self.assertEqual(r['ventilation']['status'],'unverified')
    def test_bad_dimensions_rejected(self):
        for v in (0,-1,float('nan'),float('inf')):
            self.w['head_width_m']=v
            with self.assertRaises(ValueError):assess(self.robot,self.w)
    def test_large_opening_does_not_certify_buildability(self):
        self.robot['links'][0]['geometry']['params']['inner']=.2
        r=assess(self.robot,self.w);self.assertTrue(r['static_dimension_checks_pass']);self.assertFalse(r['build_ready'])
