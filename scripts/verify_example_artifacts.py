"""Reject stale reports, GIFs and incomplete ROS archives before publishing examples."""
import hashlib,json,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];base=root/'examples'
manifest=json.loads((base/'gif_manifest.json').read_text())
training={r['example']:r for r in json.loads((base/'training_validation.json').read_text())['examples']}
summary={r['example']:r for r in json.loads((base/'validation_summary.json').read_text())['examples']}
for folder in sorted(base.iterdir()):
    source=folder/'robot.urdf'
    if not source.exists():continue
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    report=json.loads((folder/'simulation_report.json').read_text())
    assert report['source_urdf_sha256']==digest,f'{folder.name}: stale report'
    assert summary[folder.name]['compiled'] and summary[folder.name]['passed']==report['passed']
    assert training[folder.name]['pass'] and training[folder.name]['archive_sha256']==hashlib.sha256((folder/'robot.training.zip').read_bytes()).hexdigest(),f'{folder.name}: stale training smoke evidence'
    entry=manifest[folder.name]
    assert entry['source_urdf_sha256']==digest,f'{folder.name}: stale GIF source'
    assert entry['gif_sha256']==hashlib.sha256((folder/'simulation.gif').read_bytes()).hexdigest(),f'{folder.name}: changed GIF'
    for item in (report,entry):
        if 'collision_archive_sha256' in item:
            assert item['collision_archive_sha256']==hashlib.sha256((folder/'robot.convex.zip').read_bytes()).hexdigest(),f'{folder.name}: stale compound evidence'
    name=json.loads((folder/'robot.json').read_text())['robot_name']
    with zipfile.ZipFile(folder/'robot.ros2.zip') as z:
        assert z.testzip() is None
        assert f'{name}/package.xml' in z.namelist()
        assert len([n for n in z.namelist() if n.endswith('/package.xml')])==1
    with zipfile.ZipFile(folder/'robot.training.zip') as z:
        assert z.testzip() is None
        assert 'training/robot_env.py' in z.namelist()
        assert not any('__pycache__' in n or n.endswith('.pyc') for n in z.namelist())
    spec_bytes=(folder/'robot.json').read_bytes()
    readiness=json.loads((folder/'buildability_report.json').read_text())
    assert readiness['source_robot_sha256']==hashlib.sha256(spec_bytes).hexdigest(),f'{folder.name}: stale build inventory'
    assert readiness['source_bom_sha256']==hashlib.sha256((folder/'bom.json').read_bytes()).hexdigest(),f'{folder.name}: stale BOM inventory'
    assert readiness['hardware_verified'] is False and readiness['manufacturing_ready'] is False
    with zipfile.ZipFile(folder/'robot.cad.zip') as z:
        assert z.testzip() is None
        assert json.loads(z.read('cad/robot.json'))==json.loads(spec_bytes),f'{folder.name}: stale CAD export'
        for link in json.loads(spec_bytes)['links']:
            assert f"cad/stl/parts/{link['name']}.stl" in z.namelist()
    assert (folder/'BUILDABILITY.md').exists()
    assert (folder/'README.md').exists()
for name in ('articulation','helmet'):
    folder=base/'14_iron_man_mark_43';entry=manifest['mark43_'+name]
    assert entry['source_urdf_sha256']==hashlib.sha256((folder/'robot.sim.urdf').read_bytes()).hexdigest()
    assert entry['gif_sha256']==hashlib.sha256((folder/f'{name}.gif').read_bytes()).hexdigest()
print('All 17 example reports, GIFs and ROS archives are current')

folder=base/'14_iron_man_mark_43'
report=json.loads((folder/'articulation_report.json').read_text())
assert report['source_urdf_sha256']==hashlib.sha256((folder/'robot.sim.urdf').read_bytes()).hexdigest()
for preview in report['previews'].values():
    assert preview['sha256']==hashlib.sha256((folder/preview['gif']).read_bytes()).hexdigest()
    assert preview['max_displacement_m']>.001
print('Mark 43 isolated motion previews match the shipped model')

surface=json.loads((folder/'surface_contact_report.json').read_text())
assert surface['source_urdf_sha256']==hashlib.sha256((folder/'robot.sim.urdf').read_bytes()).hexdigest()
for name,digest in surface['source_mesh_sha256'].items():
    assert digest==hashlib.sha256((folder/name).read_bytes()).hexdigest(),f'Stale surface mesh: {name}'
comparison=json.loads((folder/'surface_contact_comparison.json').read_text())
assert comparison['current_urdf_sha256']==surface['source_urdf_sha256']
assert comparison['current_pair_count']==surface['neutral_pair_count']
print('Surface contact evidence matches the current mesh assets')

for name in ['moveit_report.json','moveit_left_arm_report.json','moveit_right_arm_report.json','wearability_report.json']:
    r=json.loads((folder/name).read_text())
    assert r['robot_sha256']==hashlib.sha256((folder/'robot.json').read_bytes()).hexdigest(),f'Stale {name}'

web=json.loads((base/'web_validation.json').read_text())
assert not web['external_requests'] and not web['page_errors'] and not web['failed_responses']
assert web['shared_reload_pass'] and len(web['examples'])==17
for row in web['examples']:
    assert row['pass'] and row['source_robot_sha256']==hashlib.sha256((base/row['example']/'robot.json').read_bytes()).hexdigest()
for name,digest in web['web_source_sha256'].items():
    assert digest==hashlib.sha256((root/'apps/web/public'/name).read_bytes()).hexdigest()
runtime=json.loads((base/'runtime_validation.json').read_text())
assert runtime['ros_packages_built']==17 and len(runtime['ros_archive_sha256'])==17
for name,digest in runtime['ros_archive_sha256'].items():
    assert digest==hashlib.sha256((base/name/'robot.ros2.zip').read_bytes()).hexdigest()
for key in ['training','browser','mobile_motion']:
    entry=runtime[key]
    assert entry['sha256']==hashlib.sha256((base/entry['report']).read_bytes()).hexdigest()
print('Browser and ROS build records match the current artifacts')

mobile=json.loads((base/'mobile_motion.json').read_text())
assert len(mobile['results'])==6 and all(row['pass'] for row in mobile['results'])
for row in mobile['results']:
    assert row['source_urdf_sha256']==hashlib.sha256((base/row['example']/'robot.urdf').read_bytes()).hexdigest()
print('All six recorded contact-driven motion checks passed on current models')
