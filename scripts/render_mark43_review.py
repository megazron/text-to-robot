"""Render actual exported Mark 43 geometry for visual review, without animation."""
import os
os.environ.setdefault('MUJOCO_GL','osmesa')
from pathlib import Path
import mujoco
from PIL import Image
from ttr_mujoco.convert import urdf_to_mjcf

root=Path(__file__).resolve().parents[1]
xml=urdf_to_mjcf(str(root/'examples/14_iron_man_mark_43/robot.sim.urdf'))
model=mujoco.MjModel.from_xml_string(xml);data=mujoco.MjData(model);mujoco.mj_forward(model,data)
renderer=mujoco.Renderer(model,720,640)
for name,azimuth in [('front',180),('threequarter',145),('rear',0)]:
    camera=mujoco.MjvCamera();mujoco.mjv_defaultFreeCamera(model,camera)
    camera.lookat[:]=[0,0,1.0];camera.distance=2.7;camera.azimuth=azimuth;camera.elevation=-5
    renderer.update_scene(data,camera)
    Image.fromarray(renderer.render()).save(root/f'docs/img/mark43_{name}_review.png')
renderer.close()

# An open-panel mannequin view illustrates the proposed entry geometry; it does
# not establish a collision-free insertion path or physical wearable fit.
from ttr_mujoco.exo import add_wearer
model=mujoco.MjModel.from_xml_string(add_wearer(xml));data=mujoco.MjData(model)
for j in range(model.njnt):
    if model.joint(j).name.endswith('_hinge'):
        lo,hi=model.jnt_range[j];data.qpos[model.jnt_qposadr[j]]=lo if abs(lo)>abs(hi) else hi
mujoco.mj_forward(model,data);renderer=mujoco.Renderer(model,720,640)
camera=mujoco.MjvCamera();mujoco.mjv_defaultFreeCamera(model,camera)
camera.lookat[:]=[0,0,1.0];camera.distance=3.1;camera.azimuth=150;camera.elevation=-8
renderer.update_scene(data,camera)
Image.fromarray(renderer.render()).save(root/'docs/img/mark43_entry_review.png');renderer.close()
