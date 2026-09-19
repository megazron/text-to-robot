"""Run real, source-hashed MuJoCo diagnostics on every shipped example."""
import hashlib,json
from pathlib import Path
import mujoco
from ttr_mujoco.convert import urdf_to_mjcf
from ttr_mujoco.testbench import run_tests
root=Path(__file__).resolve().parents[1];rows=[]
for folder in sorted((root/'examples').iterdir()):
    source=folder/'robot.urdf'
    if not source.exists():continue
    try:
        xml=urdf_to_mjcf(str(source),self_collision=True)
        model=mujoco.MjModel.from_xml_string(xml);data=mujoco.MjData(model);mujoco.mj_forward(model,data)
        contacts=[]
        for c in data.contact:
            if c.dist<-.001 and all(model.geom_type[g]!=mujoco.mjtGeom.mjGEOM_PLANE for g in (c.geom1,c.geom2)):
                contacts.append({'bodies':[model.body(int(model.geom_bodyid[g])).name for g in (c.geom1,c.geom2)],'depth_m':float(-c.dist)})
        report=run_tests(xml,verbose=False)
        report['model']='robot.urdf';report['source_urdf_sha256']=hashlib.sha256(source.read_bytes()).hexdigest()
        report['initial_penetrations']=contacts
        report['hardware_verified']=False
        (folder/'simulation_report.json').write_text(json.dumps(report,indent=2)+'\n')
        row={'example':folder.name,'compiled':True,'passed':report['passed'],'total':report['total'],'initial_penetrations':len(contacts),'floating':report['floating'],'failed':[k for k,v in report['tests'].items() if not v['pass']]}
    except Exception as e:row={'example':folder.name,'compiled':False,'error':str(e)}
    rows.append(row);print(json.dumps(row),flush=True)
(root/'examples/validation_summary.json').write_text(json.dumps({'scope':'Self-collision enabled smoke tests, not manufacturing qualification','examples':rows},indent=2)+'\n')
