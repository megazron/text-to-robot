"""Isolated FK previews and measurable motion of the actual exported suit.
No dynamics or contact resolution: these illustrate the joint tree only.
"""
import os
os.environ.setdefault('MUJOCO_GL','osmesa')
import hashlib,json
from pathlib import Path
import mujoco,numpy as np
from PIL import Image,ImageDraw
from ttr_mujoco.convert import urdf_to_mjcf
root=Path(__file__).resolve().parents[1];folder=root/'examples/14_iron_man_mark_43'
source=folder/'robot.sim.urdf'
m=mujoco.MjModel.from_xml_string(urdf_to_mjcf(str(source),floating=False,self_collision=False))
r=mujoco.Renderer(m,480,600);report={'scope':'Prescribed joint positions; no dynamics or collision resolution','source_urdf_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'previews':{}}
for name,focus,distance,azimuth in [('hand','left_hand',.43,35),('neck','helmet',.65,155),('chest','chest_centre',1.0,155)]:
 d=mujoco.MjData(m);mujoco.mj_forward(m,d);frames=[];tracks=[]
 camera=mujoco.MjvCamera();mujoco.mjv_defaultFreeCamera(m,camera)
 camera.lookat[:]=d.body(focus).xpos;camera.distance=distance;camera.azimuth=azimuth;camera.elevation=-5
 target='left_finger_2_distal_knuckle' if name=='hand' else ('faceplate' if name=='neck' else 'left_chest_inlay')
 for i in range(48):
  f=(1-np.cos(2*np.pi*i/47))/2
  for j in range(m.njnt):
   joint=m.joint(j);n=joint.name or ''
   if name=='hand' and n.startswith('left_') and ('finger' in n or 'thumb' in n) and n.endswith('_hinge'):
    d.qpos[m.jnt_qposadr[j]]=m.jnt_range[j,1]*.8*f
   elif name=='neck' and n in ('neck_yaw','neck_pitch'):
    d.qpos[m.jnt_qposadr[j]]=(.55 if n=='neck_yaw' else -.2)*f
   elif name=='chest' and n in ('left_chest_door_hinge','right_chest_door_hinge'):
    d.qpos[m.jnt_qposadr[j]]=(.8 if n.startswith('left') else -.8)*f
  mujoco.mj_forward(m,d);tracks.append(d.body(target).xpos.copy())
  r.update_scene(d,camera);im=Image.fromarray(r.render());draw=ImageDraw.Draw(im)
  draw.rectangle((0,454,600,480),fill='black');draw.text((8,460),'Joint geometry preview; prescribed pose; collisions OFF',fill='white');frames.append(im)
 path=folder/f'{name}_joints.gif';frames[0].save(path,save_all=True,append_images=frames[1:],duration=83,loop=0)
 report['previews'][name]={'gif':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'tracked_body':target,'max_displacement_m':float(np.linalg.norm(np.array(tracks)-tracks[0],axis=1).max())}
 frames[23].save(f'/tmp/mark43-{name}-joints.png')
r.close();(folder/'articulation_report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
