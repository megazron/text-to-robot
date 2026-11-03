"""Screen measured wearer dimensions against model openings; never certify wearability."""
import argparse
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np


def assess(robot, wearer):
    keys=('height_m','mass_kg','head_width_m','head_depth_m','head_height_m','hip_width_m','hip_depth_m',
          'thigh_diameter_m','shank_diameter_m','upper_arm_diameter_m','forearm_diameter_m','padding_m')
    if not wearer.get('dimension_source'): raise ValueError('dimension_source is required')
    for key in keys:
        value=wearer.get(key)
        if not isinstance(value,(int,float)) or not np.isfinite(value) or value<=0:
            raise ValueError(f'{key} must be finite and positive')
    checks=[]
    for link in robot['links']:
        g=link['geometry'];name=link['name']
        if g.get('part')!='ring':continue
        p=g.get('params',{});inner=p.get('inner')
        if not inner:continue
        scale=g.get('scale',[1,1,1]);available=[2*inner*scale[0],2*inner*scale[1]]
        segment=next((s for s in ('upper_arm','forearm','thigh','shank') if name.endswith(s+'_cuff')),None)
        if segment:
            required=wearer[segment+'_diameter_m']+2*wearer['padding_m']
            checks.append({'part':name,'check':'local cuff diameter with padding','available_m':min(available),'required_m':required,
                           'clearance_m':min(available)-required,'pass':min(available)>=required})
        elif name in ('pelvis_frame','neck_ring'):
            dimensions=['hip_depth_m','hip_width_m'] if name=='pelvis_frame' else ['head_depth_m','head_width_m']
            required=[wearer[k]+2*wearer['padding_m'] for k in dimensions]
            checks.append({'part':name,'check':'straight insertion through closed ring','available_xy_m':available,'required_xy_m':required,
                           'clearance_xy_m':list(np.array(available)-required),'pass':all(a>=b for a,b in zip(available,required))})
    return {'dimension_source':wearer['dimension_source'],'build_ready':False,'checks':checks,
        'static_dimension_checks_pass':bool(checks and all(c['pass'] for c in checks)),
        'entry':{'status':'unverified','required_sequence':['Open faceplate/crown and torso doors while unpowered',
            'Detach or open obstructing closed neck/pelvis/cuff interfaces','Enter boots and leg shells with external support',
            'Align human and machine joints before securing cuffs','Route cables clear of hinges; verify closure clearance',
            'Verify a manual, power-independent release from inside and outside'],
            'missing':['No demonstrated continuous human insertion path','No engineered quick-release or latch load rating']},
        'ventilation':{'status':'unverified','measured_flow_l_min':None,'co2_test':None,'thermal_test':None,
            'note':'Decorative grilles, helmet volume and sight holes do not establish breathable airflow. No fan/duct or fogging performance has been measured.'},
        'hardware':{'status':'unverified','missing':['Vendor CAD/revision for each actuator and electronics assembly',
            'Transmission, bearing, fastener and load-path verification','Continuous torque-speed/thermal/electrical ratings',
            'Measured inertias, cable masses, backlash and controller response']},
        'limitations':['Diameter checks do not prove fit, comfort, tissue clearance or safe joint alignment',
            'Ellipse axes are a straight insertion screen, not a full articulated insertion planner',
            'Prototype measurements and independent mechanical/electrical review remain required']}


def body_contacts(xml,wearer):
    import mujoco
    from .exo import add_wearer
    root=ET.fromstring(add_wearer(xml,height=wearer['height_m'],mass=wearer['mass_kg']))
    # Enable only robot-human contacts. Decorative human eyes/hair retain zero masks.
    for body in root.iter('body'):
        human=body.get('name','').startswith('w_')
        for geom in body.findall('geom'):
            if geom.get('mass')=='0':continue
            if not human and geom.get('contype','1')=='0':continue
            geom.set('contype','2' if human else '1');geom.set('conaffinity','1' if human else '2')
        if human:
            segment=next((s for s in ('upper_arm','forearm','thigh','shank') if body.get('name','').endswith(s)),None)
            if segment:
                for geom in body.findall('geom'):
                    if geom.get('type')=='capsule':geom.set('size',str(wearer[segment+'_diameter_m']/2+wearer['padding_m']))
        if body.get('name')=='w_head':
            geoms=[g for g in body.findall('geom') if g.get('type')=='capsule' and float(g.get('mass','0'))>0]
            head=geoms[-1];head.set('type','ellipsoid');head.attrib.pop('fromto',None)
            head.set('pos',f"0 0 {wearer['height_m']*.045+.045}")
            head.set('size',' '.join(str(wearer[k]/2+wearer['padding_m']) for k in ('head_depth_m','head_width_m','head_height_m')))
    model=mujoco.MjModel.from_xml_string(ET.tostring(root,encoding='unicode'));data=mujoco.MjData(model)
    reports={}
    for opened in (False,True):
        mujoco.mj_resetData(model,data)
        if opened:
            for j in range(model.njnt):
                if model.joint(j).name.endswith('_hinge'):
                    lo,hi=model.jnt_range[j];data.qpos[model.jnt_qposadr[j]]=lo if abs(lo)>abs(hi) else hi
        mujoco.mj_forward(model,data);pairs={}
        for c in data.contact:
            if any(model.geom_type[g]==mujoco.mjtGeom.mjGEOM_PLANE for g in (c.geom1,c.geom2)):continue
            a,b=[model.body(int(model.geom_bodyid[g])).name for g in (c.geom1,c.geom2)]
            if c.dist>=-.001 or a.startswith('w_')==b.startswith('w_'):continue
            key=tuple(sorted((a,b)));pairs[key]=max(pairs.get(key,0),float(-c.dist))
        reports['panels_open' if opened else 'panels_closed']={'penetrating_pairs':len(pairs),
            'pairs':[{'bodies':list(k),'depth_m':v} for k,v in sorted(pairs.items(),key=lambda p:-p[1])]}
    return {'poses':reports,'limitations':['Approximate mannequin and collision shapes; weld/adjacent exclusions apply',
        'Opening all panels at their joint limits is not a collision-free donning sequence','Human torso dimensions still use height-based approximations']}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('robot',type=Path);p.add_argument('wearer',type=Path)
    p.add_argument('--mjcf',type=Path);p.add_argument('--json',type=Path,required=True)
    a=p.parse_args();wearer=json.loads(a.wearer.read_text());report=assess(json.loads(a.robot.read_text()),wearer)
    report['robot_sha256']=hashlib.sha256(a.robot.read_bytes()).hexdigest()
    if a.mjcf:
        root=ET.parse(a.mjcf).getroot();compiler=root.find('compiler')
        if compiler is not None and compiler.get('meshdir'):
            compiler.set('meshdir',str((a.mjcf.parent/compiler.get('meshdir')).resolve()))
        report['human_contact_audit']=body_contacts(ET.tostring(root,encoding='unicode'),wearer)
    a.json.write_text(json.dumps(report,indent=2)+'\n');print(a.json)


if __name__=='__main__':main()
