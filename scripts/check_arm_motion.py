"""Reproducible coordinated arm motions within declared URDF command-speed limits.
This complements the one-joint 1 Hz stress sweeps; it does not replace them.
"""
import os,sys
check_only='--check' in sys.argv
if not check_only:os.environ.setdefault('MUJOCO_GL','osmesa')
import hashlib,json,math,xml.etree.ElementTree as ET
from pathlib import Path
import mujoco
import numpy as np
from PIL import Image,ImageDraw
from ttr_mujoco.evidence import example_scene
from ttr_mujoco.testbench import _hold_targets,_finite
from ttr_mujoco.control import ModelBiasController
root=Path(__file__).resolve().parents[1]
rows=[]
for name,angles in [('01_arm_2dof',[.3,-.5]),('02_arm_6dof',[.35,.25,-.35,.2,.2,-.2]),('03_arm_7dof',[.35,.25,-.35,.2,.2,-.2,.15]),('04_scara',[.3,-.35,-.035,.4])]:
    if os.environ.get('TTR_EXAMPLE') and name!=os.environ['TTR_EXAMPLE']:continue
    folder=root/'examples'/name;source=folder/'robot.urdf'
    joints={j.get('name'):j for j in ET.parse(source).getroot().findall('joint')}
    with example_scene(folder) as (xml,evidence):
        m=mujoco.MjModel.from_xml_string(xml);d=mujoco.MjData(m);home=_hold_targets(m,d);goal=home.copy()
        velocity=np.zeros(m.nu);linear=[]
        for a in range(m.nu):
            joint=m.joint(m.actuator_trnid[a,0]).name;limit=joints[joint].find('limit')
            velocity[a]=float(limit.get('velocity'))
            index=int(joint.split('_')[-1])-1 if joint.startswith('joint_') else None
            goal[a]=angles[index] if index is not None else .015
            lo,hi=m.actuator_ctrlrange[a]
            if not lo<=goal[a]<=hi:raise ValueError(f'{name}/{joint}: goal outside range')
            linear.append(m.jnt_type[m.actuator_trnid[a,0]]==mujoco.mjtJoint.mjJNT_SLIDE)
        # Smoothstep has max derivative 1.5. Keep requested speeds at <= half
        # the declared limit; this does not model an actual motor speed governor.
        duration=max(1.5,float(np.max(3*np.abs(goal-home)/velocity)))
        controller=ModelBiasController(m)
        for _ in range(250):controller.apply(d,home);mujoco.mj_step(m,d)
        frames=[];errors=[];penetration=0.;deepest_pair=None;peak_force=np.zeros(m.nu);peak_speed=np.zeros(m.nu);finite=True
        camera=mujoco.MjvCamera();mujoco.mjv_defaultFreeCamera(m,camera)
        camera.azimuth=135;camera.elevation=-18;camera.distance=1.6;camera.lookat[:]=[0,0,.45]
        renderer=None if check_only else mujoco.Renderer(m,400,480)
        end=2*duration+1.;sample_every=max(1,round(.1/m.opt.timestep))
        for k in range(math.ceil(end/m.opt.timestep)):
            t=k*m.opt.timestep
            if t<duration:u=t/duration;blend=u*u*(3-2*u)
            elif t<duration+.5:blend=1.
            elif t<2*duration+.5:u=(t-duration-.5)/duration;blend=1-u*u*(3-2*u)
            else:blend=0.
            targets=home+blend*(goal-home);controller.apply(d,targets);mujoco.mj_step(m,d)
            actual=np.array([d.qpos[m.jnt_qposadr[j]] for j in m.actuator_trnid[:,0]])
            errors.append(actual-targets)
            peak_speed=np.maximum(peak_speed,np.abs([d.qvel[m.jnt_dofadr[j]] for j in m.actuator_trnid[:,0]]))
            for c in d.contact:
                if all(m.geom_type[g]!=mujoco.mjtGeom.mjGEOM_PLANE for g in (c.geom1,c.geom2)):
                    if -float(c.dist)>penetration:
                        penetration=-float(c.dist);deepest_pair=[m.body(m.geom_bodyid[g]).name for g in (c.geom1,c.geom2)]
            peak_force=np.maximum(peak_force,np.abs(d.actuator_force))
            finite=_finite(d)
            if not finite:break
            if renderer is not None and k%sample_every==0:
                renderer.update_scene(d,camera);im=Image.fromarray(renderer.render());draw=ImageDraw.Draw(im)
                draw.rectangle((0,0,480,35),fill='black');draw.text((8,5),'Coordinated arm motion: gravity + self-collision',fill='white')
                draw.text((8,19),'Limited test path; not a validated hardware build',fill='white');frames.append(im)
        if renderer is not None:renderer.close()
        rms=np.sqrt(np.mean(np.square(errors),axis=0));tolerance=np.where(linear,.008,.10)
        passed=finite and penetration<.001 and bool(np.all(rms<tolerance)) and bool(np.all(peak_speed<=velocity*1.01)) and bool(np.all(peak_force<=np.max(np.abs(m.actuator_forcerange),axis=1)+1e-8))
        if not check_only:frames[0].save(folder/'task_motion.gif',save_all=True,append_images=frames[1:],duration=100,loop=0)
        report={'scope':'One coordinated outward/return trajectory; not full workspace, learned policy or hardware validation',
            'controller_sha256':hashlib.sha256((root/'python/ttr_mujoco/control.py').read_bytes()).hexdigest(),
            'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'pass':passed,'source_urdf_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'mujoco_version':mujoco.__version__,
            'controller':'Position servo with model bias-force compensation, original effort limits enforced','gravity':True,'self_collision':True,'finite':finite,'max_interbody_penetration_m':penetration,'deepest_pair':deepest_pair,
            'leg_duration_s':duration,'command_profile':'Cubic smoothstep, requested peak speed <= 50% of URDF velocity limit',
            'gif_sha256':hashlib.sha256((folder/'task_motion.gif').read_bytes()).hexdigest(),
            'joints':[{'joint':m.joint(m.actuator_trnid[a,0]).name,'goal':float(goal[a]),'rms_error':float(rms[a]),
                'tolerance':float(tolerance[a]),'position_unit':'m' if linear[a] else 'rad','declared_speed_limit':float(velocity[a]),
                'requested_peak_speed':float(1.5*abs(goal[a]-home[a])/duration),'measured_peak_speed':float(peak_speed[a]),'measured_peak_effort':float(peak_force[a]),'effort_limit':float(max(abs(m.actuator_forcerange[a])))} for a in range(m.nu)]}
        if not check_only:(folder/'task_motion_report.json').write_text(json.dumps(report,indent=2)+'\n')
        rows.append({'example':name,'pass':passed,'rms':rms.tolist(),'penetration':penetration});print(rows[-1],flush=True)
raise SystemExit(0 if all(r['pass'] for r in rows) else 1)
