"""Render a path audit's first collision witness from the matching exported URDF."""
import os
os.environ.setdefault('MUJOCO_GL', 'osmesa')
import argparse
import hashlib
import json
from pathlib import Path

import mujoco
from PIL import Image, ImageDraw
from ttr_mujoco.collision import resolve_mesh
from ttr_mujoco.convert import urdf_to_mjcf


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('urdf', type=Path)
    parser.add_argument('report', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = json.loads(args.report.read_text())
    if report['source_urdf_sha256'] != hashlib.sha256(args.urdf.read_bytes()).hexdigest():
        parser.error('Report belongs to a different URDF')
    for name, digest in report['source_mesh_sha256'].items():
        if hashlib.sha256(resolve_mesh(args.urdf, name).read_bytes()).hexdigest() != digest:
            parser.error('Report contains a stale mesh: '+name)
    failure = report['first_failure']
    if failure is None:
        parser.error('The report has no collision witness')
    model = mujoco.MjModel.from_xml_string(urdf_to_mjcf(str(args.urdf)))
    data = mujoco.MjData(model)
    for name, value in failure['positions'].items():
        joint = model.joint(name)
        data.qpos[model.jnt_qposadr[joint.id]] = value
    mujoco.mj_forward(model, data)
    bodies = {name for pair in failure['pairs'] for name in pair}
    for geom in range(model.ngeom):
        if model.body(model.geom_bodyid[geom]).name in bodies:
            model.geom_rgba[geom] = [1, .15, .02, 1]
    camera = mujoco.MjvCamera()
    mujoco.mjv_defaultFreeCamera(model, camera)
    camera.azimuth = 145
    camera.elevation = -10
    positions = [data.xpos[model.body(name).id] for name in bodies]
    camera.lookat[:] = sum(positions) / len(positions)
    span = max(float(max(p[i] for p in positions)-min(p[i] for p in positions)) for i in range(3))
    camera.distance = max(.8, span*3)
    with mujoco.Renderer(model, 640, 640) as renderer:
        renderer.update_scene(data, camera)
        frame = Image.fromarray(renderer.render())
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 0, 640, 51), fill='black')
    draw.text((10, 7), 'Sampled collision witness: orange parts intersect', fill='white')
    draw.text((10, 25), f"Segment {failure['segment']}, fraction {failure['fraction']:.3f}; posed geometry, not a dynamics run", fill='white')
    frame.save(args.output)


if __name__ == '__main__':
    main()
