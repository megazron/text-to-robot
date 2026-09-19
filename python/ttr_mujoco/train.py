"""Train a generated robot in MuJoCo with PPO (Stable-Baselines3)."""
import argparse, os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import torch  # noqa: F401  -- import torch before mujoco to avoid an OpenMP runtime clash (segfault)
from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env
from .env import MujocoRobotEnv


def train(model_path: str, task: str = "stand", steps: int = 100_000, out: str = "ppo_mujoco", n_envs: int = 4, self_collision: bool = False, tip_body: str | None = None, seed: int = 0, rollout_steps: int = 256, bias_compensation: bool = False):
    if steps<1 or n_envs<1 or rollout_steps<2: raise ValueError("Positive steps/env count and rollout_steps>=2 required")
    env = make_vec_env(lambda: MujocoRobotEnv(model_path, task=task, self_collision=self_collision, tip_body=tip_body, bias_compensation=bias_compensation), n_envs=n_envs, seed=seed)
    try:
        import tensorboard  # noqa
        tb = "./tb"
    except ImportError:
        tb = None
    model = PPO("MlpPolicy", env, verbose=1, tensorboard_log=tb, seed=seed, n_steps=rollout_steps, batch_size=min(64,rollout_steps*n_envs))
    try:
        model.learn(total_timesteps=steps); model.save(out)
    finally:
        env.close()
    return out + ".zip"


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("model"); ap.add_argument("--task", default="stand")
    ap.add_argument("--steps", type=int, default=100_000); ap.add_argument("--out", default="ppo_mujoco")
    ap.add_argument("--tip-body"); ap.add_argument("--self-collision", action="store_true"); ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--bias-compensation", action="store_true")
    a = ap.parse_args(); print("saved", train(a.model, a.task, a.steps, a.out, self_collision=a.self_collision, tip_body=a.tip_body, seed=a.seed, bias_compensation=a.bias_compensation))
