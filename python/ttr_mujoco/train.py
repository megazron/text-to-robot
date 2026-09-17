"""Train a generated robot in MuJoCo with PPO (Stable-Baselines3)."""
import argparse, os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import torch  # noqa: F401  -- import torch before mujoco to avoid an OpenMP runtime clash (segfault)
from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env
from .env import MujocoRobotEnv


def train(model_path: str, task: str = "stand", steps: int = 100_000, out: str = "ppo_mujoco", n_envs: int = 4):
    env = make_vec_env(lambda: MujocoRobotEnv(model_path, task=task), n_envs=n_envs)
    try:
        import tensorboard  # noqa
        tb = "./tb"
    except ImportError:
        tb = None
    model = PPO("MlpPolicy", env, verbose=1, tensorboard_log=tb)
    model.learn(total_timesteps=steps); model.save(out)
    return out + ".zip"


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("model"); ap.add_argument("--task", default="stand")
    ap.add_argument("--steps", type=int, default=100_000); ap.add_argument("--out", default="ppo_mujoco")
    a = ap.parse_args(); print("saved", train(a.model, a.task, a.steps, a.out))
