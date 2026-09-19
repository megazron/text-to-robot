"""Smoke-test each exported PyBullet environment after scripts/refresh_examples.ts."""
import sys,importlib,json
from pathlib import Path
import numpy as np
rows=[]
for folder in sorted(Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/ttr-example-training').iterdir()):
 sys.path.insert(0,str(folder/'training'))
 try:
  mod=importlib.import_module('robot_env');cls=next(c for n,c in vars(mod).items() if n.endswith('Env') and isinstance(c,type))
  env=cls();obs,_=env.reset(seed=0);obs,reward,term,trunc,info=env.step(np.zeros(env.action_space.shape,dtype=np.float32))
  ok=bool(np.isfinite(obs).all() and np.isfinite(reward));rows.append({'example':folder.name,'pass':ok,'task':env.task_name,'actuators':len(env.joints)});env.close()
 except Exception as e:rows.append({'example':folder.name,'pass':False,'error':str(e)})
 finally:
  sys.path.pop(0);sys.modules.pop('robot_env',None);sys.modules.pop('tasks',None)
(Path(__file__).resolve().parents[1]/'examples/training_validation.json').write_text(json.dumps({'scope':'Generated PyBullet environments reset and take one finite step; not trained policy performance','examples':rows},indent=2)+'\n')
print(json.dumps(rows,indent=2));raise SystemExit(0 if all(r['pass'] for r in rows) else 1)
