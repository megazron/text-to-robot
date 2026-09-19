#!/usr/bin/env python3
"""PyBullet load/finite/floor smoke checks. Requires ./python plus pybullet.
This does not certify balance, contact accuracy or manufacturing readiness.
"""
from pathlib import Path
import json,sys,xml.etree.ElementTree as ET,numpy as np,pybullet as p
from ttr_mujoco.convert import _guess_floating
rows=[]
for folder in sorted(Path('examples').iterdir()):
    source=folder/'robot.sim.urdf'
    if not source.exists():source=folder/'robot.urdf'
    if not source.exists():continue
    cid=p.connect(p.DIRECT)
    try:
        floating=_guess_floating(source.read_text());p.setGravity(0,0,-9.81);p.setTimeStep(1/240)
        floor=p.createCollisionShape(p.GEOM_PLANE);p.createMultiBody(0,floor)
        flags=p.URDF_USE_INERTIA_FROM_FILE
        if len(ET.fromstring(source.read_text()).findall("link"))>127:flags |= p.URDF_MERGE_FIXED_LINKS
        robot=p.loadURDF(str(source),useFixedBase=not floating,flags=flags)
        if floating:
            low=min(p.getAABB(robot,j)[0][2] for j in range(-1,p.getNumJoints(robot)))
            pos,quat=p.getBasePositionAndOrientation(robot)
            p.resetBasePositionAndOrientation(robot,[pos[0],pos[1],pos[2]+.005-low],quat)
        for j in range(p.getNumJoints(robot)):
            info=p.getJointInfo(robot,j)
            if info[2]==p.JOINT_FIXED:continue
            if info[10]<=0 or info[11]<=0:raise ValueError('Missing joint effort/velocity')
            p.setJointMotorControl2(robot,j,p.POSITION_CONTROL,targetPosition=0,force=info[10],maxVelocity=info[11])
        finite=True
        for _ in range(480):
            p.stepSimulation();pos,quat=p.getBasePositionAndOrientation(robot)
            finite=finite and bool(np.all(np.isfinite(pos+quat)))
        pos,_=p.getBasePositionAndOrientation(robot)
        passed=finite and (not floating or pos[2]>-1)
        rows.append({'example':folder.name,'pass':passed,'floating':floating,'base_z':pos[2]})
    except Exception as e:rows.append({'example':folder.name,'pass':False,'error':str(e)})
    finally:p.disconnect(cid)
for row in rows:print(json.dumps(row))
print(f"{sum(r['pass'] for r in rows)}/{len(rows)} load/finite/floor smoke checks")
sys.exit(0 if all(r['pass'] for r in rows) else 1)
