"""Load the shipped collision model for reproducible example diagnostics."""
from contextlib import contextmanager
from pathlib import Path
import hashlib,json,tempfile,zipfile
import xml.etree.ElementTree as ET
import numpy as np
from .collision import resolve_mesh
from .convert import urdf_to_mjcf

@contextmanager
def example_scene(directory):
    directory=Path(directory);archive=directory/'robot.convex.zip'
    if not archive.exists():
        yield urdf_to_mjcf(str(directory/'robot.urdf'),self_collision=True),{'collision_model':'URDF primitives / mesh bounding boxes','self_collision':True}
        return
    source=directory/('robot.sim.urdf' if (directory/'robot.sim.urdf').exists() else 'robot.urdf')
    with zipfile.ZipFile(archive) as z,tempfile.TemporaryDirectory() as td:
        report=json.loads(z.read('collision_report.json'))
        if report['source_urdf_sha256']!=hashlib.sha256(source.read_bytes()).hexdigest():
            raise ValueError('Stale compound collision archive; regenerate before auditing')
        records={r['link']:r for r in report.get('links',[])}
        for link in ET.parse(source).getroot().findall('link'):
            meshes=link.findall('visual/geometry/mesh')
            for mesh in meshes:
                record=records.get(link.get('name'))
                if record is None:raise ValueError('Missing collision provenance for '+link.get('name'))
                raw=resolve_mesh(source,mesh.get('filename')).read_bytes()
                scale=np.array([float(v) for v in mesh.get('scale','1 1 1').split()])
                settings=json.dumps({'tolerance_m':report['tolerance_m'],'max_hulls':record['max_hulls'],'coacd':report['coacd_version']},sort_keys=True).encode()
                if record['sha256']!=hashlib.sha256(raw+scale.tobytes()+settings).hexdigest():
                    raise ValueError('Stale collision mesh: '+mesh.get('filename'))
        z.extractall(td)
        yield urdf_to_mjcf(str(Path(td)/'robot.urdf'),self_collision=True),{
            'collision_model':'compound convex meshes and URDF primitives','self_collision':True,
            'collision_archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
            'limitations':report['limitations']}
