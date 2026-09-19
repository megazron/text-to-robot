"""Reject stale reports, GIFs and incomplete ROS archives before publishing examples."""
import hashlib,json,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];base=root/'examples'
manifest=json.loads((base/'gif_manifest.json').read_text())
for folder in sorted(base.iterdir()):
    source=folder/'robot.urdf'
    if not source.exists():continue
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    report=json.loads((folder/'simulation_report.json').read_text())
    assert report['source_urdf_sha256']==digest,f'{folder.name}: stale report'
    entry=manifest[folder.name]
    assert entry['source_urdf_sha256']==digest,f'{folder.name}: stale GIF source'
    assert entry['gif_sha256']==hashlib.sha256((folder/'simulation.gif').read_bytes()).hexdigest(),f'{folder.name}: changed GIF'
    name=json.loads((folder/'robot.json').read_text())['robot_name']
    with zipfile.ZipFile(folder/'robot.ros2.zip') as z:
        assert z.testzip() is None
        assert f'{name}/package.xml' in z.namelist()
        assert len([n for n in z.namelist() if n.endswith('/package.xml')])==1
    assert (folder/'README.md').exists()
for name in ('articulation','helmet'):
    folder=base/'14_iron_man_mark_43';entry=manifest['mark43_'+name]
    assert entry['source_urdf_sha256']==hashlib.sha256((folder/'robot.sim.urdf').read_bytes()).hexdigest()
    assert entry['gif_sha256']==hashlib.sha256((folder/f'{name}.gif').read_bytes()).hexdigest()
print('All 17 example reports, GIFs and ROS archives are current')
