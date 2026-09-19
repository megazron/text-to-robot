"""Render actual exported Mark 43 geometry for visual review, without animation."""
import os
os.environ.setdefault('MUJOCO_GL','osmesa')
from pathlib import Path
import argparse
import mujoco
from PIL import Image
from ttr_mujoco.convert import urdf_to_mjcf

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--robot-dir',type=Path,default=root/'examples/14_iron_man_mark_43')
parser.add_argument('--output-dir',type=Path,default=root/'docs/img')
args=parser.parse_args();model_dir=args.robot_dir;out=args.output_dir;out.mkdir(parents=True,exist_ok=True)
xml=urdf_to_mjcf(str(model_dir/'robot.sim.urdf'))
model=mujoco.MjModel.from_xml_string(xml);data=mujoco.MjData(model);mujoco.mj_forward(model,data)
renderer=mujoco.Renderer(model,720,640)
for name,azimuth in [('front',180),('threequarter',145),('rear',0)]:
    camera=mujoco.MjvCamera();mujoco.mjv_defaultFreeCamera(model,camera)
    camera.lookat[:]=[0,0,1.0];camera.distance=2.7;camera.azimuth=azimuth;camera.elevation=-5
    renderer.update_scene(data,camera)
    Image.fromarray(renderer.render()).save(out/f'mark43_{name}_review.png')
# Close views are actual geometry, using the same scene and material definitions.
for name,z,distance,azimuth in [('helmet',1.70,.62,165),('torso',1.38,1.15,145)]:
    camera=mujoco.MjvCamera();mujoco.mjv_defaultFreeCamera(model,camera)
    camera.lookat[:]=[.03,0,z];camera.distance=distance;camera.azimuth=azimuth;camera.elevation=0
    renderer.update_scene(data,camera)
    Image.fromarray(renderer.render()).save(out/f'mark43_{name}_review.png')
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
Image.fromarray(renderer.render()).save(out/'mark43_entry_review.png');renderer.close()

# Tie visual evidence to the exported model; reference review refuses stale images.
import hashlib, json
views=['front','threequarter','rear','torso','helmet','entry']
manifest={'robot_sha256':hashlib.sha256((model_dir/'robot.json').read_bytes()).hexdigest(),
          'images':{v:hashlib.sha256((out/f'mark43_{v}_review.png').read_bytes()).hexdigest() for v in views}}
(out/'mark43_render_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
