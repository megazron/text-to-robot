import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import numpy as np
from ttr_hf.assets import fetch_assets, source_lock
from ttr_hf.env import SO101JointEnv

CACHE = Path(__file__).resolve().parents[2] / 'references/so101/cache'


class AssetTests(unittest.TestCase):
    def test_corrupted_cache_rejected_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'model.xml'
            path.write_bytes(b'bad')
            lock = {'files': {'model.xml': {'bytes': 3, 'sha256': hashlib.sha256(b'yes').hexdigest()}}, 'model': 'model.xml'}
            with patch('ttr_hf.assets.source_lock', return_value=lock):
                with self.assertRaisesRegex(ValueError, 'modified pinned asset'):
                    fetch_assets(directory, offline=True)
                path.write_bytes(b'yes')
                self.assertEqual(fetch_assets(directory, offline=True), path)

    def test_path_traversal_rejected(self):
        with patch('ttr_hf.assets.source_lock', return_value={'files': {'../escape': {}}}):
            with self.assertRaisesRegex(ValueError, 'Unsafe asset path'):
                fetch_assets('/tmp/unused', offline=True)


@unittest.skipUnless((CACHE / source_lock()['model']).is_file(), 'Run benchmark_hf_so101.py to fetch reference assets')
class SO101Tests(unittest.TestCase):
    def setUp(self):
        self.env = SO101JointEnv(fetch_assets(CACHE, offline=True))
        self.addCleanup(self.env.close)

    def test_invalid_actions_do_not_advance_physics(self):
        self.env.reset(seed=3)
        for action in [np.zeros(5), np.full(6, np.nan), np.full(6, 100)]:
            with self.assertRaises(ValueError):
                self.env.step(action)
        self.assertEqual(self.env.data.time, 0)

    def test_goal_observed_and_reproducible(self):
        first, _ = self.env.reset(seed=3)
        again, _ = self.env.reset(seed=3)
        np.testing.assert_array_equal(first, again)
        other, _ = self.env.reset(seed=4)
        self.assertFalse(np.array_equal(first[12:], other[12:]))
        np.testing.assert_array_equal(other[12:], self.env.goal.astype(np.float32))

    def test_success_requires_physical_tracking(self):
        self.env.reset(seed=1000)
        for _ in range(40):
            _, _, _, _, info = self.env.step(self.env.home)
        self.assertFalse(info['is_success'])
        self.env.reset(seed=1000)
        initial = self.env.data.qpos.copy()
        for _ in range(40):
            _, reward, done, _, info = self.env.step(self.env.goal)
            if done:
                break
        self.assertTrue(info['is_success'])
        self.assertGreater(np.linalg.norm(self.env.data.qpos - initial), 0.1)
        self.assertAlmostEqual(reward, -np.linalg.norm(self.env.data.qpos - self.env.goal))
        self.assertGreater(self.env.data.time, .2)
