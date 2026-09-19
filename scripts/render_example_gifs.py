"""Fresh MuJoCo GIFs from shipped geometry, with explicit simulation settings."""
import os
os.environ.setdefault('MUJOCO_GL','osmesa')
import hashlib,json
from pathlib import Path
from ttr_mujoco.convert import urdf_to_mjcf
from ttr_mujoco.render import render_gif
root=Path(__file__).resolve().parents[1];selected=os.environ.get('TTR_EXAMPLE');manifest={}
if selected:manifest=json.loads((root/'examples/gif_manifest.json').read_text())
for folder in sorted((root/'examples').iterdir()):
    if selected and folder.name!=selected:continue
    source=folder/'robot.urdf'
    if not source.exists():continue
    xml=urdf_to_mjcf(str(source),self_collision=True)
    render_gif(xml,str(folder/'simulation.gif'),seconds=2,fps=10,width=400,height=320,motion='hold',orbit=25,
      label='Gravity + self-collision; pose-hold smoke run')
    manifest[folder.name]={'source_urdf_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
      'gif_sha256':hashlib.sha256((folder/'simulation.gif').read_bytes()).hexdigest(),'self_collision':True,'motion':'hold','seconds':2}
    print(folder.name,flush=True)
folder=root/'examples/14_iron_man_mark_43';source=folder/'robot.sim.urdf'
# Separate actuator previews from the above collision-enabled physical diagnostic.
xml=urdf_to_mjcf(str(source),floating=False,self_collision=False)
for name,focus in [('articulation',None),('helmet','helmet')]:
    render_gif(xml,str(folder/f'{name}.gif'),seconds=4,fps=12,width=600,height=480,motion='doff',focus=focus,
      label='Actuator preview: fixed base, self-collision OFF',zoom=.8 if focus else 1.0,orbit=20)
    manifest['mark43_'+name]={'source_urdf_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
      'gif_sha256':hashlib.sha256((folder/f'{name}.gif').read_bytes()).hexdigest(),'self_collision':False,'floating':False,'motion':'doff','seconds':4}
(root/'examples/gif_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
