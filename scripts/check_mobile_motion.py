"""Measure drive/strafe motion from wheel torque through actual contacts."""
import hashlib,json,sys
from pathlib import Path
import mujoco
from ttr_mujoco.convert import urdf_to_mjcf
from ttr_mujoco.testbench import _hold_targets,_finite,_up

root=Path(__file__).resolve().parents[1]
rows=[]
for name in ['05_diff_drive','06_four_wheel','07_mecanum','12_mars_rover','15_wall_e']:
    path=root/'examples'/name/'robot.urdf'
    m=mujoco.MjModel.from_xml_string(urdf_to_mjcf(str(path),self_collision=True))
    for mode in (['forward','strafe'] if name.startswith('07') else ['forward']):
        d=mujoco.MjData(m);d.ctrl[:]=_hold_targets(m,d)
        mujoco.mj_step(m,d,nstep=round(.5/m.opt.timestep));start=d.qpos[:3].copy()
        commands={}
        for a in range(m.nu):
            joint=m.joint(m.actuator_trnid[a,0]).name
            if 'wheel' in joint:
                sign=(-1 if ('front_right' in joint or 'rear_left' in joint) else 1) if mode=='strafe' else 1
                d.ctrl[a]=sign*4;commands[joint]=float(d.ctrl[a])
        mujoco.mj_step(m,d,nstep=round(2/m.opt.timestep))
        displacement=d.qpos[:3]-start;main=1 if mode=='strafe' else 0;cross=1-main
        ok=_finite(d) and _up(m,d)>.9 and abs(displacement[main])>.15 and abs(displacement[cross])<.05
        rows.append({'example':name,'task':mode,'pass':bool(ok),'source_urdf_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                     'commands_rad_s':commands,'displacement_m':displacement.tolist(),'upright':_up(m,d)})
report={'scope':'Two-second open-loop motion from wheel actuators and contact physics; not navigation, learning or hardware validation',
        'mujoco_version':mujoco.__version__,'self_collision':True,'external_forces':False,'results':rows}
if '--check' not in sys.argv:
    (root/'examples/mobile_motion.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(rows,indent=2))
raise SystemExit(0 if all(row['pass'] for row in rows) else 1)
