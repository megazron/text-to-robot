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
