"""Reuse verified identical hull meshes when only link/joint frames change.
Rejects changes to mesh assets, link inertia/mass, links or visual orientation.
The result still requires fresh motion/physics audits.
"""
import argparse,copy,hashlib,json,tempfile,zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np
from ttr_mujoco.collision import resolve_mesh
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('before',type=Path);p.add_argument('after',type=Path);p.add_argument('archive',type=Path)
a=p.parse_args()
old=ET.parse(a.before).getroot();new=ET.parse(a.after).getroot()
old_links={l.get('name'):l for l in old.findall('link')};new_links={l.get('name'):l for l in new.findall('link')}
assert old_links.keys()==new_links.keys(),'Link inventory changed'
with zipfile.ZipFile(a.archive) as z:
    files={name:z.read(name) for name in z.namelist()}
report=json.loads(files['collision_report.json'])
assert report['source_urdf_sha256']==hashlib.sha256(a.before.read_bytes()).hexdigest()
records={r['link']:r for r in report['links']}
compound=ET.fromstring(files['robot.urdf'])
for name,after in new_links.items():
    before=old_links[name];target=next(l for l in compound.findall('link') if l.get('name')==name)
    for tag in ['inertial/mass','inertial/inertia','visual/geometry','collision/geometry']:
        assert ET.tostring(before.find(tag))==ET.tostring(after.find(tag)),f'{name}: changed {tag}'
    for mesh in after.findall('visual/geometry/mesh'):
        raw=resolve_mesh(a.after,mesh.get('filename')).read_bytes();r=records[name]
        scale=np.array([float(v) for v in mesh.get('scale','1 1 1').split()])
        settings=json.dumps({'tolerance_m':report['tolerance_m'],'max_hulls':r['max_hulls'],'coacd':report['coacd_version']},sort_keys=True).encode()
        assert hashlib.sha256(raw+scale.tobytes()+settings).hexdigest()==r['sha256'],f'{name}: mesh changed'
    def xyz(link):return np.array([float(v) for v in link.find('visual/origin').get('xyz').split()])
    assert before.find('visual/origin').get('rpy')==after.find('visual/origin').get('rpy')
    delta=xyz(after)-xyz(before)
    if np.any(delta):
        for origin in target.findall('visual/origin')+target.findall('collision/origin'):
            value=np.array([float(v) for v in origin.get('xyz','0 0 0').split()])+delta
            origin.set('xyz',' '.join(f'{v:.12g}' for v in value))
    target.remove(target.find('inertial'));target.append(copy.deepcopy(after.find('inertial')))
for joint in list(compound.findall('joint')):compound.remove(joint)
for joint in new.findall('joint'):compound.append(copy.deepcopy(joint))
report['source_urdf_sha256']=hashlib.sha256(a.after.read_bytes()).hexdigest()
report['reframed_from_urdf_sha256']=hashlib.sha256(a.before.read_bytes()).hexdigest()
files['robot.urdf']=ET.tostring(compound,encoding='utf-8',xml_declaration=True)
files['collision_report.json']=(json.dumps(report,indent=2)+'\n').encode()
# An old compiled scene must never survive a frame change.
files.pop('robot.mjcf.xml',None)
with tempfile.TemporaryDirectory() as td:
    for name,data in files.items():
        path=Path(td)/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    from ttr_mujoco.convert import urdf_to_mjcf
    import mujoco
    mujoco.MjModel.from_xml_string(urdf_to_mjcf(str(Path(td)/'robot.urdf'),self_collision=True))
with zipfile.ZipFile(a.archive,'w',zipfile.ZIP_DEFLATED) as z:
    for name,data in sorted(files.items()):z.writestr(name,data)
a.archive.with_name('collision_report.json').write_text(json.dumps(report,indent=2)+'\n')
print('Reused verified hulls; updated link/joint frames; fresh audits required')
