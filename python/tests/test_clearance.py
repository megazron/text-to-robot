import unittest
import mujoco
from ttr_mujoco.clearance import audit


class ClearanceTests(unittest.TestCase):
    def test_detects_collision_away_from_neutral_and_records_reproducible_pose(self):
        model=mujoco.MjModel.from_xml_string('''<mujoco><compiler angle="radian"/><worldbody>
        <body name="obstacle" pos="0 0.3 0"><geom type="sphere" size=".04"/></body>
        <body name="arm"><joint name="swing" range="0 1.5707963267948966"/>
        <geom type="sphere" pos=".3 0 0" size=".04"/></body></worldbody></mujoco>''')
        d=mujoco.MjData(model);mujoco.mj_forward(model,d);self.assertEqual(d.ncon,0)
        report=audit(model,3)
        self.assertFalse(report['pass']);self.assertEqual(report['poses_checked'],4)
        worst=report['pairs'][0]
        self.assertEqual(worst['witness_joint'],'swing')
        self.assertAlmostEqual(worst['witness_position'],1.5707963267948966)
        self.assertGreater(worst['max_depth_m'],.07)

    def test_disabled_contact_masks_cannot_claim_clearance_pass(self):
        model=mujoco.MjModel.from_xml_string('<mujoco><worldbody><body><geom type="sphere" size=".1" contype="0" conaffinity="0"/></body></worldbody></mujoco>')
        self.assertFalse(audit(model)['pass'])
