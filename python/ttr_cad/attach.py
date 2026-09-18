"""Attach a dimensioned enclosure and measured electronics mass to a robot JSON.

The returned specification carries CAD tessellation and exact solid mass properties
so the browser, URDF and CAD exporters use the same geometry. Mount pose is in the
parent link frame (metres/radians). Mechanical fasteners and load paths still need
engineering; this is a fixed-joint model of the supplied mount, not its design.
"""
import argparse
import copy
import json
from pathlib import Path
import numpy as np

if __package__:
    from .enclosure import build, export
else:  # Standalone copy bundled in CAD downloads.
    from enclosure import build, export


def attach(robot, enclosure, parent, xyz, rpy, electronics_mass_kg):
    import cadquery as cq
    if parent not in {link["name"] for link in robot["links"]}: raise ValueError("parent link not found")
    if len(xyz)!=3 or len(rpy)!=3 or not np.all(np.isfinite([*xyz,*rpy])): raise ValueError("mount pose must be finite xyz/rpy triples")
    if not np.isfinite(electronics_mass_kg) or electronics_mass_kg<=0: raise ValueError("Supply a positive measured electronics mass")
    parts, assembly=build(enclosure); result=copy.deepcopy(robot)
    names={link["name"] for link in result["links"]}|{joint["name"] for joint in result["joints"]}
    base_name=enclosure["name"]+"_base"
    if any(enclosure["name"]+suffix in names for suffix in ("_base","_lid","_electronics","_base_mount","_lid_mount","_electronics_mount")):
        raise ValueError("Enclosure names already exist in this robot")
    zero={"xyz":[0,0,0],"rpy":[0,0,0]}
    material=enclosure["name"]+"_polymer"
    if material in {m["name"] for m in result["materials"]}: raise ValueError("Enclosure material name already exists")
    result["materials"].append({"name":material,"color":[.18,.2,.23,1]})
    def joint(name, child, target, origin):
        result["joints"].append({"name":name,"type":"fixed","parent":target,"child":child,"origin":origin,"axis":[0,0,1]})
    for label, part in parts.items():
        shape=part.val(); vertices,triangles=shape.tessellate(.05,.1)
        vertices=[[v/1000 for v in vertex.toTuple()] for vertex in vertices]
        tensor=np.asarray(cq.Shape.matrixOfInertia(shape))*1e-15
        inertia=dict(zip(("ixx","iyy","izz","ixy","ixz","iyz"),[float(tensor[i,j]) for i,j in ((0,0),(1,1),(2,2),(0,1),(0,2),(1,2))]))
        name=enclosure["name"]+"_"+label
        g={"type":"mesh","part":"indexed_mesh","file":name+".stl","vertices":vertices,"triangles":triangles,
           "volume":shape.Volume()*1e-9,"centroid":[v/1000 for v in shape.Center().toTuple()],"inertia_unit":inertia,
           "bbox":{"min":np.min(vertices,axis=0).tolist(),"max":np.max(vertices,axis=0).tolist()}}
        result["links"].append({"name":name,"role":"housing","geometry":g,"mass":g["volume"]*enclosure["density_kg_m3"],
                                "inertia":{k:v*enclosure["density_kg_m3"] for k,v in inertia.items()},"origin":copy.deepcopy(zero),"material":material})
        joint(name+"_mount",name,parent if label=="base" else base_name,
              {"xyz":list(xyz),"rpy":list(rpy)} if label=="base" else copy.deepcopy(zero))
    name=enclosure["name"]+"_electronics"; dimensions=[v/1000 for v in enclosure["board_mm"]]
    origin=copy.deepcopy(zero);origin["xyz"]=[0,0,assembly["board_origin_mm"][2]/1000+dimensions[2]/2]
    x,y,z=dimensions;mass=float(electronics_mass_kg)
    result["links"].append({"name":name,"role":"electronics","geometry":{"type":"box","size":dimensions},"mass":mass,
        "origin":origin,"inertia":{"ixx":mass*(y*y+z*z)/12,"iyy":mass*(x*x+z*z)/12,"izz":mass*(x*x+y*y)/12,"ixy":0,"ixz":0,"iyz":0},
        "inferred":["inertia","electronics represented as a uniform populated-board envelope"]})
    joint(name+"_mount",name,base_name,copy.deepcopy(zero))
    metadata=result.setdefault("metadata",{})
    metadata.setdefault("notes",[]).extend([f"Housing {enclosure['name']}: {enclosure['dimension_source']}",
        "Housing CAD solid mass and measured electronics mass included. Fastener/cable masses excluded; fixed mount attachment strength and clearance unverified."])
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("robot",type=Path);parser.add_argument("enclosure",type=Path)
    parser.add_argument("--parent",required=True);parser.add_argument("--xyz",type=float,nargs=3,required=True)
    parser.add_argument("--rpy",type=float,nargs=3,default=[0,0,0]);parser.add_argument("--electronics-mass-kg",type=float,required=True)
    parser.add_argument("--out",type=Path,required=True)
    args=parser.parse_args(); enclosure=json.loads(args.enclosure.read_text())
    robot=attach(json.loads(args.robot.read_text()),enclosure,args.parent,args.xyz,args.rpy,args.electronics_mass_kg)
    args.out.mkdir(parents=True,exist_ok=True)
    export(enclosure,args.out/"cad")
    (args.out/"robot.json").write_text(json.dumps(robot,indent=2)+"\n")
    print(args.out/"robot.json")


if __name__=="__main__": main()
