#!/usr/bin/env python3
"""Load every example URDF in PyBullet and step it: a physics sanity gate.

    pip install pybullet numpy
    python scripts/physics_check.py
"""
import sys, glob, os, numpy as np, pybullet as p
ok=0; rows=[]
for urdf in sorted(glob.glob("examples/*/robot.urdf")):
    name=urdf.split("/")[1]
    cid=p.connect(p.DIRECT)
    try:
        p.setGravity(0,0,-9.81)
        rid=p.loadURDF(urdf,[0,0,0.3],useFixedBase=False)
        nj=p.getNumJoints(rid)
        for _ in range(240): p.stepSimulation()
        pos,_=p.getBasePositionAndOrientation(rid)
        finite=all(np.isfinite(pos))
        rows.append((name,nj,finite,pos[2])); ok+= 1 if finite else 0
    except Exception as e:
        rows.append((name,-1,False,str(e)[:60]))
    finally: p.disconnect(cid)
for n,nj,f,z in rows: print(f"  {'PASS' if f else 'FAIL'} {n:18s} joints={nj:3d} base_z_after={z if isinstance(z,str) else round(z,3)}")
print(f"{ok}/{len(rows)} examples load and simulate in PyBullet")
sys.exit(0 if ok==len(rows) else 1)
