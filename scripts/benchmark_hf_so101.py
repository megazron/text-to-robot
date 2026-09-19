#!/usr/bin/env python3
"""Fetch pinned HF assets and measure SO101 physical joint positioning."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

os.environ.setdefault('MUJOCO_GL', 'egl' if '--gif' in sys.argv else 'disable')
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'python'))
from ttr_hf.assets import fetch_assets, source_lock
from ttr_hf.env import JOINTS, SO101JointEnv
import mujoco
import numpy as np
from PIL import Image


def benchmark(env, episodes, policy=None, capture=False):
    rows, frames = [], []
    for seed in range(1000, 1000 + episodes):
        obs, info = env.reset(seed=seed)
        peak, peak_effort = info['max_penetration_m'], 0.
        for step in range(40):
            if policy is None:
                action = env.home
            elif policy == 'servo':
                action = env.goal
            else:
                action, _ = policy.predict(obs, deterministic=True)
            obs, reward, done, truncated, info = env.step(action)
            peak = max(peak, info['max_penetration_m'])
            peak_effort = max(peak_effort, float(np.max(np.abs(env.data.actuator_force))))
            if capture and seed == 1000:
                frames.append(Image.fromarray(env.render()))
            if done or truncated:
                break
        rows.append({'seed': seed, 'success': bool(info['is_success']),
                     'duration_s': (step + 1) * .05,
                     'final_error_rad': info['max_joint_error_rad'],
                     'peak_penetration_m': peak,
                     'peak_actuator_effort_nm': peak_effort})
    return {'success_rate': sum(row['success'] for row in rows) / episodes,
            'mean_final_error_rad': float(np.mean([row['final_error_rad'] for row in rows])),
            'episodes': rows}, frames


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=Path('references/so101/cache'))
    parser.add_argument('--output', type=Path, default=Path('references/so101'))
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--episodes', type=int, default=32)
    parser.add_argument('--gif', action='store_true')
    parser.add_argument('--train-steps', type=int, default=0,
                        help='Optional local CPU PPO training; never uploads to the Hub')
    args = parser.parse_args()
    if args.episodes < 1 or args.train_steps < 0:
        parser.error('episodes must be positive and train-steps nonnegative')
    # Torch must precede MuJoCo simulation on some OpenMP builds.
    if args.train_steps:
        import torch
        torch.set_num_threads(1)
        from stable_baselines3 import PPO
    path = fetch_assets(args.cache, offline=args.offline)
    args.output.mkdir(parents=True, exist_ok=True)
    env = SO101JointEnv(path)
    try:
        from gymnasium.utils.env_checker import check_env
        check_env(env, skip_render_check=True)
        hold, _ = benchmark(env, args.episodes)
        servo, frames = benchmark(env, args.episodes, policy='servo', capture=args.gif)
        lock = source_lock()
        report = {'source': lock, 'mujoco_version': mujoco.__version__,
                  'environment_sha256': hashlib.sha256(Path(sys.modules[SO101JointEnv.__module__].__file__).read_bytes()).hexdigest(),
                  'protocol': {'task': 'joint_positioning', 'control_hz': 20,
                               'physics_hz': 500, 'seeds': [1000, 999 + args.episodes],
                               'success': 'all joint errors <0.05 rad, all speeds <0.1 rad/s, contact penetration <1mm, for 5 consecutive steps',
                               'action_units': 'absolute radians', 'joint_order': list(JOINTS)},
                  'hardware_validated': False, 'grasp_assistance': False,
                  'limitations': ['Joint-positioning only; no pick/place or payload validation.',
                                  'Upstream convex mesh contacts and estimated servo dynamics; no measured hardware system identification.',
                                  'LeRobot normalized motor commands require explicit per-robot calibration; radians are not a hardware command contract.'],
                  'hold_baseline': hold, 'position_servo': servo}
        if args.train_steps:
            train_env = SO101JointEnv(path)
            try:
                model = PPO('MlpPolicy', train_env, seed=0, n_steps=256, batch_size=64,
                            device='cpu', verbose=0)
                model.learn(total_timesteps=args.train_steps)
                model.save(args.output / 'ppo_so101')
                trained, _ = benchmark(env, args.episodes, policy=model)
                report['ppo'] = {'requested_steps': args.train_steps,
                                 'actual_steps': model.num_timesteps, **trained}
            finally:
                train_env.close()
        if frames:
            frames[0].save(args.output / 'positioning.gif', save_all=True,
                           append_images=frames[1:], duration=50, loop=0)
        (args.output / 'benchmark.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({key: {'success_rate': report[key]['success_rate'],
                                'mean_final_error_rad': report[key]['mean_final_error_rad']}
                          for key in ['hold_baseline', 'position_servo', 'ppo'] if key in report}, indent=2))
    finally:
        env.close()


if __name__ == '__main__':
    main()
