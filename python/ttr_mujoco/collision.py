"""Prepare portable URDF with convex mesh collisions derived from its visual solids.

This is an explicit offline operation: input meshes must already be closed volumes.
CoACD approximates the solids; it does not certify clearance, repair CAD, or change
inertia. A report records every approximation and the source hashes.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np


def resolve_mesh(urdf: Path, filename: str) -> Path:
    if filename.startswith("package://"):
        relative = filename.removeprefix("package://").split("/", 1)[1]
        candidates = [urdf.parent / relative, urdf.parent.parent / relative]
    else:
        candidates = [urdf.parent / filename]
    for candidate in candidates:
        if candidate.is_file(): return candidate.resolve()
    raise FileNotFoundError(f"Cannot resolve mesh {filename!r} relative to {urdf}")


def decompose(mesh, tolerance_m, max_hulls, seed=0):
    import coacd
    import trimesh
    if not mesh.is_volume:
        raise ValueError("Collision source is not a consistently wound closed volume; repair its generator first")
    if mesh.is_convex:
        return [mesh.convex_hull]
    coacd.set_log_level("error")
    result = coacd.run_coacd(coacd.Mesh(np.asarray(mesh.vertices), np.asarray(mesh.faces)),
        threshold=tolerance_m, real_metric=True, max_convex_hull=max_hulls,
        preprocess_mode="off", resolution=1500, mcts_iterations=30, mcts_nodes=15, seed=seed)
    # Re-triangulate each returned convex vertex set: tiny coplanar faces in the
    # native triangulation must not become nonmanifold OBJ assets in MuJoCo.
    hulls = [trimesh.Trimesh(vertices=v, faces=f, process=True).convex_hull for v, f in result]
    if not hulls or any(not hull.is_volume or not hull.is_convex for hull in hulls):
        raise ValueError("Decomposition did not produce valid convex solids")
    return hulls


def prepare(urdf_path, out_dir, tolerance_m=0.002, max_hulls=64):
    import trimesh
    from importlib.metadata import version
    if not np.isfinite(tolerance_m) or tolerance_m <= 0:
        raise ValueError("tolerance_m must be finite and positive")
    if not isinstance(max_hulls, int) or (max_hulls != -1 and max_hulls < 1):
        raise ValueError("max_hulls must be -1 or a positive integer")
    urdf = Path(urdf_path).resolve(); out = Path(out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True); meshes_dir = out / "meshes"; meshes_dir.mkdir(exist_ok=True)
    destination=out / "robot.urdf"
    if destination == urdf: raise ValueError("Use a separate output directory; source URDF must not be overwritten")
    root = ET.parse(urdf).getroot(); cache = {}; records=[]
    for link in root.findall("link"):
        visuals = [v for v in link.findall("visual") if v.find("geometry/mesh") is not None]
        if not visuals: continue
        replacements=[]
        for visual in visuals:
            element=visual.find("geometry/mesh"); source=resolve_mesh(urdf, element.get("filename"))
            raw=source.read_bytes(); scale=np.array([float(v) for v in element.get("scale", "1 1 1").split()])
            if scale.shape != (3,) or not np.all(np.isfinite(scale)) or np.any(scale<=0): raise ValueError("Mesh scale must contain three positive finite values")
            settings=json.dumps({"tolerance_m":tolerance_m,"max_hulls":max_hulls,"coacd":version("coacd")},sort_keys=True).encode()
            digest=hashlib.sha256(raw+scale.tobytes()+settings).hexdigest()
            if digest not in cache:
                mesh=trimesh.load_mesh(source, force="mesh")
                mesh.apply_scale(scale)
                try:
                    hulls=decompose(mesh,tolerance_m,max_hulls)
                except Exception as error:
                    raise ValueError(f"Cannot prepare {link.get('name')} ({source.name}): {error}") from error
                filenames=[]
                for i,hull in enumerate(hulls):
                    filename=f"collision_{digest[:20]}_{i:03d}.obj"
                    hull.export(meshes_dir / filename); filenames.append(f"meshes/{filename}")
                # Sum is an upper bound on occupied volume if hulls overlap, not
                # a Hausdorff-distance or missing-material guarantee.
                source_volume=float(mesh.volume); sum_volume=float(sum(h.volume for h in hulls))
                sampled,_=trimesh.sample.sample_surface(trimesh.util.concatenate(hulls),512,seed=0)
                _,distances,_=trimesh.proximity.closest_point(mesh,sampled)
                record={"sha256":digest,"source_file":source.name,"source_volume_m3":source_volume,
                        "hulls":len(hulls),"summed_hull_volume_m3":sum_volume,
                        "summed_volume_ratio":sum_volume/source_volume,
                        "sampled_surface_deviation_max_m":float(np.max(distances)),
                        "sampled_surface_deviation_p95_m":float(np.percentile(distances,95)),
                        "surface_samples":512,
                        "requested_concavity_m":tolerance_m,"max_hulls":max_hulls,
                        "quality": "approximate; hull cap can exceed requested concavity"}
                cache[digest]=(filenames,record)
            filenames,record=cache[digest]
            records.append({"link":link.get("name"),**record})
            visual_name=f"visual_{hashlib.sha256(raw).hexdigest()[:20]}{source.suffix.lower()}"
            target=meshes_dir / visual_name
            if not target.exists(): target.write_bytes(raw)
            element.set("filename", f"meshes/{visual_name}")
            for filename in filenames:
                collision=ET.Element("collision")
                origin=visual.find("origin")
                if origin is not None: collision.append(copy.deepcopy(origin))
                geometry=ET.SubElement(collision,"geometry")
                ET.SubElement(geometry,"mesh",filename=filename)
                replacements.append(collision)
        for old in link.findall("collision"): link.remove(old)
        # Preserve primitive visuals too if a source link mixes primitives and meshes.
        for visual in link.findall("visual"):
            if visual.find("geometry/mesh") is None:
                collision=ET.Element("collision")
                for tag in ("origin","geometry"):
                    node=visual.find(tag)
                    if node is not None: collision.append(copy.deepcopy(node))
                replacements.append(collision)
        link.extend(replacements)
    # Copy any remaining mesh references (e.g. collision-only links) into the bundle.
    for element in root.findall(".//mesh"):
        if (out / element.get("filename")).is_file(): continue
        source=resolve_mesh(urdf,element.get("filename")); raw=source.read_bytes()
        filename=f"asset_{hashlib.sha256(raw).hexdigest()[:20]}{source.suffix.lower()}"
        (meshes_dir/filename).write_bytes(raw); element.set("filename",f"meshes/{filename}")
    report={"source_urdf_sha256":hashlib.sha256(urdf.read_bytes()).hexdigest(),"coacd_version":version("coacd"),
            "tolerance_m":tolerance_m,"links":records,"unique_decompositions":len(cache),
            "collision_hulls":sum(r["hulls"] for r in records),
            "limitations":["Approximate collision geometry; sampled deviation is not a worst-case error bound",
                           "No human fit, strength or motion-path certification", "URDF mass/inertia unchanged",
                           "Run conversion with --self-collision to test interference"]}
    ET.indent(root)
    # Publish the URDF only after all source meshes have passed validation.
    destination.write_text(ET.tostring(root,encoding="unicode")+"\n")
    (out/"collision_report.json").write_text(json.dumps(report,indent=2)+"\n")
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urdf",type=Path);parser.add_argument("--out",type=Path,required=True)
    parser.add_argument("--tolerance-mm",type=float,default=2)
    parser.add_argument("--max-hulls",type=int,default=64)
    args=parser.parse_args()
    report=prepare(args.urdf,args.out,args.tolerance_mm/1000,args.max_hulls)
    print(json.dumps({"links":len(report["links"]),"collision_hulls":report["collision_hulls"],"out":str(args.out)},indent=2))


if __name__ == "__main__": main()
