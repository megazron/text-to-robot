"""Exercise opt-in bias control from actual exported MuJoCo training archives.
Requires the optional train dependencies. 64 PPO steps test the pipeline, not skill.
"""
import hashlib,json,os,subprocess,sys,tempfile,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];rows=[]
program='''
import torch
import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.env_checker import check_env
from ttr_mujoco.env import MujocoRobotEnv
import sys
model,tip,out=sys.argv[1:]
env=MujocoRobotEnv(model,task='reach',tip_body=tip,self_collision=True,bias_compensation=True,max_steps=32)
check_env(env,warn=True)
agent=PPO('MlpPolicy',env,n_steps=32,batch_size=32,seed=0,verbose=0)
agent.learn(total_timesteps=64);agent.save(out)
restored=PPO.load(out,env=env)
obs,_=env.reset(seed=0);action,_=restored.predict(obs,deterministic=True)
obs,reward,*_=env.step(action)
assert np.isfinite(obs).all() and np.isfinite(reward)
assert env.controller is not None
assert int(agent.num_timesteps)==64
env.close()
'''
for name,tip in [('02_arm_6dof','gripper_base'),('04_scara','tool')]:
    archive=root/'examples'/name/'robot.training.zip'
    with tempfile.TemporaryDirectory() as td:
        with zipfile.ZipFile(archive) as z:z.extractall(td)
        work=Path(td)/'training/mujoco';spec=json.loads((work/'robot.json').read_text())
        result=subprocess.run([sys.executable,'-c',program,f"../{spec['robot_name']}.urdf",tip,str(Path(td)/'checkpoint')],cwd=work,
            env={**os.environ,'OMP_NUM_THREADS':'1','PYTHONPATH':str(work)},capture_output=True,text=True,timeout=180)
        if result.returncode:print(result.stdout,result.stderr)
        row={'example':name,'pass':result.returncode==0,'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
             'gymnasium_check':result.returncode==0,'ppo_steps':64,'checkpoint_reload':result.returncode==0,
             'self_collision':True,'bias_compensation':True}
        rows.append(row);print(row,flush=True)
report={'scope':'Gymnasium API check, 64 PPO steps and checkpoint reload; not a learned task or hardware validation','examples':rows}
(root/'examples/arm_training_smoke.json').write_text(json.dumps(report,indent=2)+'\n')
raise SystemExit(0 if all(r['pass'] for r in rows) else 1)
