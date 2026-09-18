"""Rebuild physics evidence for the current Mark 43 URDF, without hiding failures.

Run after node scripts/regen_mark43_example.ts. --convex also exports a portable
compound-collision robot ZIP; install python[geometry] for that option.
"""
import argparse
import json
import tempfile
from pathlib import Path
import zipfile

import mujoco
from ttr_mujoco.convert import urdf_to_mjcf, relativize_meshes
from ttr_mujoco.exo import add_wearer, assist_test
from ttr_mujoco.testbench import run_tests


def clearance(xml):
    model=mujoco.MjModel.from_xml_string(xml);data=mujoco.MjData(model);mujoco.mj_forward(model,data)
    contacts=[]
    for contact in data.contact:
        if contact.dist < -.001 and all(model.geom_type[g]!=mujoco.mjtGeom.mjGEOM_PLANE for g in (contact.geom1,contact.geom2)):
            contacts.append({"body1":model.body(int(model.geom_bodyid[contact.geom1])).name,
                             "body2":model.body(int(model.geom_bodyid[contact.geom2])).name,"depth_m":float(-contact.dist)})
    return {"penetration_count":len(contacts),"max_depth_m":max((r["depth_m"] for r in contacts),default=0),"contacts":contacts}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--convex",action="store_true")
    args=parser.parse_args(); directory=Path(__file__).resolve().parents[1]/"examples/14_iron_man_mark_43"
    source=directory/"robot.sim.urdf"; xml=urdf_to_mjcf(str(source))
    for wearer in (False,True):
        scene=add_wearer(xml) if wearer else xml
        name="iron_man_mark_43_with_wearer.mjcf.xml" if wearer else "iron_man_mark_43.mjcf.xml"
        (directory/name).write_text(relativize_meshes(scene,str(directory)))
        report=run_tests(scene);report["model"]="robot.sim.urdf";report["wearer"]=wearer
        if wearer:
            assist=assist_test(scene);report["assist"]=assist
            report["tests"]["wearer_support"]={"pass":assist["suit_supports_wearer"],**assist}
            report["passed"]+=int(assist["suit_supports_wearer"]);report["total"]+=1
        name="mujoco_report_wearer.json" if wearer else "mujoco_report.json"
        (directory/name).write_text(json.dumps(report,indent=2)+"\n")
    collisions={"mujoco_version":mujoco.__version__,"scope":"Initial pose only; adjacent-body exclusions apply. No human-fit or motion-path validation.",
                "bounding_boxes":clearance(urdf_to_mjcf(str(source),self_collision=True))}
    if args.convex:
        from ttr_mujoco.collision import prepare
        with tempfile.TemporaryDirectory() as temporary:
            report=prepare(source,temporary)
            path=Path(temporary)
            scene=urdf_to_mjcf(str(path/"robot.urdf"),self_collision=True)
            (path/"robot.mjcf.xml").write_text(relativize_meshes(scene,str(path)))
            collisions["convex_meshes"]=clearance(scene)
            from ttr_mujoco.clearance import audit
            motion=audit(mujoco.MjModel.from_xml_string(scene))
            (directory/"motion_clearance_report.json").write_text(json.dumps(motion,indent=2)+"\n")
            (directory/"collision_report.json").write_text(json.dumps(report,indent=2)+"\n")
            with zipfile.ZipFile(directory/"robot.convex.zip","w",compression=zipfile.ZIP_DEFLATED) as archive:
                for file in sorted(path.rglob("*")):
                    if file.is_file():archive.write(file,file.relative_to(path))
    (directory/"clearance_report.json").write_text(json.dumps(collisions,indent=2)+"\n")
    print(json.dumps({k:{key:value for key,value in v.items() if key!="contacts"} for k,v in collisions.items() if isinstance(v,dict)},indent=2))


if __name__=="__main__":main()
