// "Download and train" export: a multi-task, multi-method training suite backed
// by PyBullet (loads the generated URDF with joint motors). Supports RL (PPO/SAC),
// demo collection with a scripted expert, and behaviour cloning.
import {readFileSync,readdirSync} from "node:fs";
import type { RobotSpecification } from "@ttr/robot-schema";
import { safeName } from "@ttr/robot-schema";
import { generateUrdf } from "@ttr/urdf-generator";
import { buildPart, toStlBinary } from "@ttr/mesh";
import { classify, type RobotClass } from "./classify.ts";
import { TASKS } from "./tasks.ts";

export type FileMap = Record<string, string | Uint8Array>;
const cn = (name: string) => name.split(/[_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("") || "Robot";

function tasksPy(cls: RobotClass): string {
  const defs = TASKS[cls];
  const out: string[] = ["\"\"\"Task catalogue (auto-generated). Each task returns (reward, terminated).\"\"\"", "import numpy as np", "import pybullet as p", ""];
  for (const t of defs) {
    out.push(`def ${t.id}(self, action):`);
    // reward bodies are authored at 8-space indent; re-indent to 4 for a standalone fn
    const body = t.reward.replace(/p\.getLinkState\(self.robot, self.tip_index\)/g,"self.p.getLinkState(self.robot, self.tip_index)").replace(/(?<![\w.])p\.getJointState/g,"self.p.getJointState").replace(/(?<![\w.])p\.getBaseVelocity/g,"self.p.getBaseVelocity").replace(/(?<![\w.])p\.getBasePositionAndOrientation/g,"self.p.getBasePositionAndOrientation").split("\n").map((l) => (l.startsWith("        ") ? "    " + l.slice(8) : l)).join("\n");
    out.push(body);
    out.push(`    return float(reward), bool(terminated)`, "");
  }
  out.push(`TASKS = {`);
  for (const t of defs) out.push(`    "${t.id}": (${JSON.stringify(t.title)}, ${t.id}),`);
  out.push(`}`, `DEFAULT_TASK = "${defs[0].id}"`, "");
  return out.join("\n");
}

function envPy(spec: RobotSpecification, cls: RobotClass): string {
  const name = safeName(spec.robot_name);
  const fixed = (cls === "manipulator" || cls === "gripper") ? "True" : "False";
  const tip = spec.links.find(l=>l.name==='gripper_base')?.name ?? spec.end_effectors[0]?.attach_link ?? spec.joints.filter(j=>j.type!=='fixed'&&!/finger|thumb|wheel/.test(j.name)).at(-1)?.child ?? '';
  return `"""Gymnasium environment for ${spec.robot_name} (auto-generated). Backend: PyBullet."""
import os
import numpy as np
import gymnasium as gym
from gymnasium import spaces
import pybullet as p
import pybullet_data
from pybullet_utils.bullet_client import BulletClient
import tasks as T

URDF = os.path.join(os.path.dirname(__file__), "${name}.urdf")


class ${cn(name)}Env(gym.Env):
    metadata = {"render_modes": ["human", "rgb_array"], "render_fps": 60}

    def __init__(self, render_mode=None, task=None, max_steps=1000):
        super().__init__()
        self.render_mode = render_mode
        self.task_name = task or T.DEFAULT_TASK
        self.task_fn = T.TASKS[self.task_name][1]
        self.max_steps = max_steps
        self.fall_height = 0.15
        self.p = BulletClient(connection_mode=p.GUI if render_mode == "human" else p.DIRECT)
        self.p.setAdditionalSearchPath(pybullet_data.getDataPath())
        self._load()
        n = len(self.joints)
        self.action_space = spaces.Box(-1.0, 1.0, shape=(n,), dtype=np.float32)
        self.observation_space = spaces.Box(-np.inf, np.inf, shape=(2 * n + 6,), dtype=np.float32)
        self.steps = 0

    def _load(self):
        self.p.resetSimulation(); self.p.setGravity(0, 0, -9.81)
        self.plane = self.p.loadURDF("plane.urdf")
        self.robot = self.p.loadURDF(URDF, [0, 0, 0.05], useFixedBase=${fixed}, flags=p.URDF_USE_INERTIA_FROM_FILE${spec.links.length>127 ? " | p.URDF_MERGE_FIXED_LINKS" : ""})
        self.joints = [j for j in range(self.p.getNumJoints(self.robot))
                       if self.p.getJointInfo(self.robot, j)[2] != p.JOINT_FIXED]
        self.limits = []; self.efforts = []; self.velocities = []
        for j in self.joints:
            info = self.p.getJointInfo(self.robot, j); lo, hi = info[8], info[9]
            if lo >= hi: lo, hi = -np.pi, np.pi
            self.limits.append((lo, hi))
            if info[10] <= 0 or info[11] <= 0: raise ValueError("URDF needs positive effort and velocity limits")
            self.efforts.append(info[10]); self.velocities.append(info[11])
        tip_name = ${JSON.stringify(tip)}
        self.tip_index = next((j for j in range(self.p.getNumJoints(self.robot))
                               if self.p.getJointInfo(self.robot,j)[12].decode() == tip_name), -1)
        if self.task_name == "reach" and self.tip_index < 0:
            raise ValueError("Reaching requires a named tool link in the robot specification")

    def _obs(self):
        q = [self.p.getJointState(self.robot, j)[0] for j in self.joints]
        dq = [self.p.getJointState(self.robot, j)[1] for j in self.joints]
        pos, _ = self.p.getBasePositionAndOrientation(self.robot)
        extra = list(self.target) + list(pos) if hasattr(self, "target") else list(pos) + [0, 0, 0]
        return np.array(q + dq + extra[:6], dtype=np.float32)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed); self._load(); self.steps = 0
        self.target = np.array([self.np_random.uniform(0.2, 0.6),
                                self.np_random.uniform(-0.3, 0.3),
                                self.np_random.uniform(0.1, 0.6)], dtype=np.float32)
        if self.task_name == "aperture":
            self.target[:] = [self.np_random.uniform(0, sum(hi-lo for lo,hi in self.limits)),0,0]
        return self._obs(), {}

    def apply(self, action):
        action = np.asarray(action, dtype=np.float32)
        if action.shape != (len(self.joints),) or not np.all(np.isfinite(action)):
            raise ValueError("Expected one finite action per actuated joint")
        action = np.clip(action, -1.0, 1.0)
        for a, j, (lo, hi), effort, velocity in zip(action, self.joints, self.limits, self.efforts, self.velocities):
            self.p.setJointMotorControl2(self.robot, j, p.POSITION_CONTROL,
                                    targetPosition=lo + (float(a) + 1.0) * 0.5 * (hi - lo), force=effort, maxVelocity=velocity)

    def step(self, action):
        self.apply(action); self.p.stepSimulation(); self.steps += 1
        reward, terminated = self.task_fn(self, np.asarray(action, dtype=np.float32))
        return self._obs(), reward, terminated, self.steps >= self.max_steps, {"is_success": bool(terminated and self.task_name in ("reach", "hold", "goto", "aperture"))}

    def close(self):
        if self.p.isConnected(): self.p.disconnect()


for _tid in T.TASKS:
    gym.register(id=f"${cn(name)}-{_tid}-v0",
                 entry_point="robot_env:${cn(name)}Env", kwargs={"task": _tid})
`;
}

function trainRlPy(spec: RobotSpecification): string {
  const c = cn(safeName(spec.robot_name)); const name = safeName(spec.robot_name);
  return `"""Reinforcement learning (PPO or SAC) for ${spec.robot_name}. Auto-generated.

    python train_rl.py --task reach --algo ppo --steps 200000
    python train_rl.py --play --task reach
"""
import argparse
import gymnasium as gym
from stable_baselines3 import PPO, SAC
from stable_baselines3.common.env_util import make_vec_env
import robot_env, tasks as T

ALGOS = {"ppo": PPO, "sac": SAC}


def env_id(task): return f"${c}-{task}-v0"


def _tb_dir():
    try:
        import tensorboard  # noqa: F401
        return "./tb"
    except ImportError:
        return None  # train fine without TensorBoard logging


def train(task, algo, steps):
    Algo = ALGOS[algo]
    env = make_vec_env(env_id(task), n_envs=4)
    model = Algo("MlpPolicy", env, verbose=1, tensorboard_log=_tb_dir())
    model.learn(total_timesteps=steps)
    model.save(f"${name}_{algo}_{task}")
    print("saved", f"${name}_{algo}_{task}.zip")


def play(task, algo):
    env = gym.make(env_id(task), render_mode="human")
    model = ALGOS[algo].load(f"${name}_{algo}_{task}")
    obs, _ = env.reset()
    for _ in range(3000):
        a, _ = model.predict(obs, deterministic=True)
        obs, r, term, trunc, _ = env.step(a)
        if term or trunc: obs, _ = env.reset()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", default=T.DEFAULT_TASK, choices=list(T.TASKS))
    ap.add_argument("--algo", default="ppo", choices=list(ALGOS))
    ap.add_argument("--steps", type=int, default=200_000)
    ap.add_argument("--play", action="store_true")
    a = ap.parse_args()
    play(a.task, a.algo) if a.play else train(a.task, a.algo, a.steps)
`;
}

function collectPy(spec: RobotSpecification): string {
  const c = cn(safeName(spec.robot_name));
  return `"""Collect expert demonstrations with a scripted controller (PyBullet inverse
kinematics toward the task target). Saves demos.npz for imitation learning.

    python collect_demos.py --task reach --episodes 50
"""
import argparse
import numpy as np
import gymnasium as gym
import pybullet as p
import robot_env, tasks as T


def expert_action(env):
    if env.task_name == "aperture":
        q = float(env.target[0]) / len(env.joints)
        return np.clip(np.array([2*(q-lo)/(hi-lo)-1 for lo,hi in env.limits],dtype=np.float32),-1,1)
    if env.task_name not in ("reach","hold","track"):
        raise ValueError("No scripted expert supplied for this task; use RL or measured demonstrations")
    ik = env.p.calculateInverseKinematics(env.robot, env.tip_index, list(env.target))
    action = []
    for idx, j in enumerate(env.joints):
        lo, hi = env.limits[idx]
        q = ik[idx] if idx < len(ik) else 0.0
        action.append(2.0 * (q - lo) / (hi - lo) - 1.0)
    return np.clip(np.array(action, dtype=np.float32), -1, 1)


def main(task, episodes):
    env = gym.make(f"${c}-{task}-v0").unwrapped
    O, A = [], []
    for _ in range(episodes):
        obs, _ = env.reset()
        for _ in range(env.max_steps):
            a = expert_action(env)
            O.append(obs); A.append(a)
            obs, r, term, trunc, _ = env.step(a)
            if term or trunc: break
    np.savez("demos.npz", obs=np.array(O), act=np.array(A))
    print("saved demos.npz", len(O), "transitions")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", default=T.DEFAULT_TASK)
    ap.add_argument("--episodes", type=int, default=50)
    a = ap.parse_args(); main(a.task, a.episodes)
`;
}

function bcPy(spec: RobotSpecification): string {
  const name = safeName(spec.robot_name);
  return `"""Behaviour cloning (imitation learning) from demos.npz using PyTorch.

    python collect_demos.py --episodes 50     # first, gather expert data
    python train_bc.py --epochs 50            # then clone it
"""
import argparse
import numpy as np
import torch
import torch.nn as nn


class Policy(nn.Module):
    def __init__(self, obs_dim, act_dim):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(obs_dim, 256), nn.ReLU(),
                                 nn.Linear(256, 256), nn.ReLU(), nn.Linear(256, act_dim))
    def forward(self, x): return self.net(x)


def main(epochs, lr):
    d = np.load("demos.npz")
    obs = torch.tensor(d["obs"], dtype=torch.float32)
    act = torch.tensor(d["act"], dtype=torch.float32)
    model = Policy(obs.shape[1], act.shape[1])
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()
    for e in range(epochs):
        opt.zero_grad()
        loss = loss_fn(model(obs), act)
        loss.backward(); opt.step()
        if e % 10 == 0: print(f"epoch {e}  loss {loss.item():.4f}")
    torch.save(model.state_dict(), "bc_${name}.pt")
    print("saved bc_${name}.pt")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--lr", type=float, default=1e-3)
    a = ap.parse_args(); main(a.epochs, a.lr)
`;
}

function evalPy(spec: RobotSpecification): string {
  const c = cn(safeName(spec.robot_name)); const name = safeName(spec.robot_name);
  return `"""Evaluate a trained policy (RL .zip or BC .pt) and report success rate.

    python evaluate.py --task reach --rl ${name}_ppo_reach
    python evaluate.py --task reach --bc bc_${name}.pt
"""
import argparse
import numpy as np
import gymnasium as gym
import torch
import robot_env, tasks as T


def main(task, rl, bc, episodes):
    env = gym.make(f"${c}-{task}-v0")
    policy = None
    if rl:
        from stable_baselines3 import PPO, SAC
        policy = (SAC if "sac" in rl else PPO).load(rl)
        act = lambda o: policy.predict(o, deterministic=True)[0]
    elif bc:
        from train_bc import Policy
        obs_dim = env.observation_space.shape[0]; act_dim = env.action_space.shape[0]
        net = Policy(obs_dim, act_dim); net.load_state_dict(torch.load(bc)); net.eval()
        act = lambda o: net(torch.tensor(o, dtype=torch.float32)).detach().numpy()
    else:
        act = lambda o: env.action_space.sample()
    succ, rets = 0, []
    for _ in range(episodes):
        obs, _ = env.reset(); total = 0.0; done = False
        while not done:
            obs, r, term, trunc, info = env.step(act(obs)); total += r; done = term or trunc
            if info.get("is_success", False): succ += 1
        rets.append(total)
    print(f"episodes={episodes} success={succ}/{episodes} mean_return={np.mean(rets):.2f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", default=T.DEFAULT_TASK)
    ap.add_argument("--rl"); ap.add_argument("--bc"); ap.add_argument("--episodes", type=int, default=20)
    a = ap.parse_args(); main(a.task, a.rl, a.bc, a.episodes)
`;
}

export function exportTraining(spec: RobotSpecification): FileMap {
  const name = safeName(spec.robot_name);
  const cls = classify(spec);
  const hasMeshes=spec.links.some(l=>l.geometry.type==="mesh");
  const mujocoSource=hasMeshes?"collision/robot.urdf":`../${name}.urdf`;
  const collisionPreparation=hasMeshes?`python -m ttr_mujoco.collision ../${name}.urdf --out collision\n`:"";
  const tip = spec.links.find(l=>l.name==="gripper_base")?.name ?? spec.end_effectors[0]?.attach_link ?? spec.links.find(l=>l.role?.startsWith("wrist"))?.name ?? "YOUR_TOOL_LINK";
  const taskList = TASKS[cls].map((t) => `  - \`${t.id}\` — ${t.title}`).join("\n");
  const files: FileMap = {};
  files[`training/${name}.urdf`] = generateUrdf(spec, { meshPrefix: "meshes/" });   // relative paths: PyBullet/MuJoCo resolve next to the URDF
  for (const l of spec.links) { const g = l.geometry; if (g.type === "mesh" && !files[`training/meshes/${g.file}`]) files[`training/meshes/${g.file}`] = toStlBinary(buildPart(g), 1); }
  files[`training/tasks.py`] = tasksPy(cls);
  files[`training/robot_env.py`] = envPy(spec, cls);
  files[`training/train_rl.py`] = trainRlPy(spec);
  files[`training/collect_demos.py`] = collectPy(spec);
  files[`training/train_bc.py`] = bcPy(spec);
  files[`training/evaluate.py`] = evalPy(spec);
  files[`training/requirements.txt`] = "# CPU-only torch on GPU-less machines:  pip install torch --index-url https://download.pytorch.org/whl/cpu\ngymnasium>=0.29\npybullet>=3.2\nmujoco>=3.1\nstable-baselines3>=2.3\ntorch>=2.1\nnumpy>=1.24\ntensorboard>=2.15\n";
  const pythonRoot=new URL("../../../python/ttr_mujoco/",import.meta.url);
  for(const file of readdirSync(pythonRoot).filter(f=>f.endsWith(".py")))files[`training/mujoco/ttr_mujoco/${file}`]=readFileSync(new URL(file,pythonRoot),"utf8");
  files[`training/mujoco/wearer.example.json`]=readFileSync(new URL("wearer.example.json",pythonRoot),"utf8");
  files[`training/mujoco/robot.json`]=JSON.stringify(spec,null,2);
  files[`training/mujoco/requirements.txt`]="mujoco>=3.1,<4\ngymnasium>=0.29\nnumpy>=1.24\npillow>=10\nstable-baselines3>=2.3\ntrimesh>=4.5,<5\ncoacd>=1.0.7,<2\nrtree>=1.3,<2\npython-fcl>=0.7,<0.8\n";
  files[`training/mujoco/README.md`] =
`# ${spec.robot_name} in MuJoCo

Test, render and train this exact robot in MuJoCo with the text-to-robot Python layer:

\`\`\`bash
pip install -r requirements.txt
pip install torch --index-url https://download.pytorch.org/whl/cpu    # CPU torch on GPU-less machines

${collisionPreparation}python -m ttr_mujoco test   ${mujocoSource} --self-collision                       # settle / hold / actuator sweep / disturbance
python -m ttr_mujoco render ${mujocoSource} --self-collision -o ${name}.gif --motion sweep
python -m ttr_mujoco train  ${mujocoSource} --self-collision --task ${cls === "manipulator" ? `reach --tip-body ${tip}` : cls === "gripper" ? "aperture" : "stand"} --steps 400000
\`\`\`

Mesh-based exports first prepare approximate convex collision hulls. This preserves
hollow regions better than bounding boxes; inspect the generated collision report.
Simulation and training do not validate hardware fit or a learned policy.

Or from Python:

\`\`\`python
from ttr_mujoco import urdf_to_mjcf, run_tests, render_gif
from ttr_mujoco.env import MujocoRobotEnv
report = run_tests(urdf_to_mjcf("${mujocoSource}", self_collision=True))              # dict with per-test pass/fail + metrics
env = MujocoRobotEnv("${mujocoSource}", self_collision=True, task="${cls === "manipulator" ? "reach" : cls === "gripper" ? "aperture" : "stand"}"${cls === "manipulator" ? `, tip_body="${tip}"` : ""})
\`\`\`
`;
  files[`training/README.md`] =
`# Train ${spec.robot_name}

Auto-generated training suite. Robot class: **${cls}**. Physics: PyBullet (loads the URDF directly with a motor per joint). No ROS required.

\`\`\`bash
cd training
pip install -r requirements.txt
\`\`\`

## Tasks available
${taskList}

## MuJoCo (recommended)
See \`mujoco/README.md\` — the same URDF converted to an actuated MuJoCo scene, with a test battery, renderer and PPO trainer.

## Reinforcement learning in PyBullet (PPO / SAC)
\`\`\`bash
python train_rl.py --task ${TASKS[cls][0].id} --algo ppo --steps 200000
python train_rl.py --task ${TASKS[cls][0].id} --play          # watch it
\`\`\`

## Imitation learning (behaviour cloning)
\`\`\`bash
python collect_demos.py --task ${TASKS[cls][0].id} --episodes 50   # scripted expert -> demos.npz
python train_bc.py --epochs 50                                     # clone the expert
\`\`\`

## Evaluate
\`\`\`bash
python evaluate.py --task ${TASKS[cls][0].id} --rl ${name}_ppo_${TASKS[cls][0].id}
python evaluate.py --task ${TASKS[cls][0].id} --bc bc_${name}.pt
\`\`\`

Add your own task by dropping a reward function into \`tasks.py\`; it is picked up automatically.
Classical motion planning is available via the exported ROS 2 / MoveIt 2 package.
`;
  return files;
}
