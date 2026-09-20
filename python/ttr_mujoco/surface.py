"""Offline FCL surface-intersection audit of exported URDF visual surfaces (the MoveIt mesh sources).
Triangle intersections are not a penetration-depth or solid-containment test.
Cylinders/spheres are tessellated; counts can differ from native MoveIt primitives.
Only direct parent/child links are excluded. This is deliberately stricter than
the MoveIt SRDF, which also excludes pairs within and between adjacent rigid assemblies.
"""
import argparse,hashlib,json
from pathlib import Path
import xml.etree.ElementTree as ET
import numpy as np
import trimesh
from .collision import resolve_mesh

class SurfaceScene:
 def __init__(self,source):
  self.source=Path(source).resolve();self.root=ET.parse(self.source).getroot()
  self.joints=self.root.findall('joint');self.links=self.root.findall('link')
  self.adjacent={frozenset((j.find('parent').get('link'),j.find('child').get('link'))) for j in self.joints}
  self.manager=trimesh.collision.CollisionManager();self.origins={};self.meshes={};self.mesh_hashes={}
  for link in self.links:
   name=link.get('name')
   if len(link.findall('visual'))>1:raise ValueError('Multiple visuals are not supported; refusing incomplete audit')
   c=link.find('visual')
   if c is None:continue
   g=c.find('geometry');m=g.find('mesh')
   if m is not None:
    path=resolve_mesh(self.source,m.get('filename'));self.mesh_hashes[m.get('filename')]=hashlib.sha256(path.read_bytes()).hexdigest();mesh=trimesh.load_mesh(path)
    mesh.apply_scale([float(v) for v in m.get('scale','1 1 1').split()])
   elif g.find('box') is not None:mesh=trimesh.creation.box([float(v) for v in g.find('box').get('size').split()])
   elif g.find('cylinder') is not None:
    cgeom=g.find('cylinder');mesh=trimesh.creation.cylinder(radius=float(cgeom.get('radius')),height=float(cgeom.get('length')),sections=64)
   elif g.find('sphere') is not None:mesh=trimesh.creation.icosphere(subdivisions=3,radius=float(g.find('sphere').get('radius')))
   else:raise ValueError('Unsupported collision geometry for '+name)
   self.origins[name]=self.pose(c.find('origin'));self.meshes[name]=mesh;self.manager.add_object(name,mesh)
 @staticmethod
 def pose(origin):
  if origin is None:return np.eye(4)
  m=trimesh.transformations.euler_matrix(*[float(x) for x in origin.get('rpy','0 0 0').split()]);m[:3,3]=[float(x) for x in origin.get('xyz','0 0 0').split()];return m
 def set_pose(self,values):
  children={j.find('child').get('link') for j in self.joints};poses={l.get('name'):np.eye(4) for l in self.links if l.get('name') not in children};remaining=list(self.joints)
  while remaining:
   count=len(remaining)
   for j in remaining[:]:
    parent=j.find('parent').get('link');child=j.find('child').get('link')
    if parent not in poses:continue
    v=values.get(j.get('name'),0.);motion=np.eye(4);kind=j.get('type')
    if kind!='fixed':
     a=j.find('axis');axis=np.array([float(x) for x in (a.get('xyz') if a is not None else '1 0 0').split()]);axis/=np.linalg.norm(axis)
     if kind in ('revolute','continuous'):motion=trimesh.transformations.rotation_matrix(v,axis)
     elif kind=='prismatic':motion[:3,3]=axis*v
     else:raise ValueError('Unsupported joint type '+kind)
    poses[child]=poses[parent]@self.pose(j.find('origin'))@motion;remaining.remove(j)
   if len(remaining)==count:raise ValueError('Disconnected or cyclic joint tree')
  self.world=poses
  for name in self.origins:self.manager.set_transform(name,poses[name]@self.origins[name])
 def contacts(self,values=None):
  self.set_pose(values or {});_,pairs=self.manager.in_collision_internal(return_names=True)
  return sorted(tuple(sorted(p)) for p in pairs if frozenset(p) not in self.adjacent)

def audit(scene,joints=(),samples=5):
 if not isinstance(samples,int) or samples<3:raise ValueError('samples must be an integer >= 3')
 neutral=scene.contacts();baseline=set(neutral);motion=[]
 by_name={j.get('name'):j for j in scene.joints}
 for name in joints:
  if name not in by_name:raise ValueError('Unknown joint '+name)
  joint=by_name[name];limit=joint.find('limit')
  if joint.get('type') not in ('revolute','prismatic') or limit is None:raise ValueError('A limited revolute/prismatic joint is required: '+name)
  lo,hi=float(limit.get('lower')),float(limit.get('upper'))
  for value in np.linspace(lo,hi,samples):
   pairs=set(scene.contacts({name:float(value)}))
   motion.append({'joint':name,'position':float(value),'pair_count':len(pairs),'new_pairs':sorted(pairs-baseline)})
 return {'scope':__doc__,'source_urdf_sha256':hashlib.sha256(scene.source.read_bytes()).hexdigest(),
  'source_mesh_sha256':scene.mesh_hashes,'neutral_pair_count':len(neutral),'pairs':neutral,
  'samples_per_joint':samples,'poses_checked':1+len(motion),'motion':motion,
  'pass':not neutral and not any(p['pair_count'] for p in motion),
  'limitations':['Independent joint samples do not certify continuous or combined motion',
   'Surface intersections do not test full containment or wearer fit; use compound collision and wearer audits too']}

def audit_grid(scene, joints, samples=9):
 """Sample simultaneous motion of two or three joints, retaining failure witnesses.

 This complements independent sweeps; it is not continuous collision detection.
 Limit the grid size to prevent accidental exponential work on a whole robot.
 """
 from itertools import product
 if not isinstance(samples,int) or isinstance(samples,bool) or samples<3:
  raise ValueError('samples must be an integer >= 3')
 if len(joints) not in (2,3) or len(set(joints))!=len(joints):
  raise ValueError('grid requires two or three distinct joints')
 if samples**len(joints)>10000:
  raise ValueError('grid exceeds 10000 poses; select fewer joints or samples')
 by_name={j.get('name'):j for j in scene.joints}
 limits={}
 for name in joints:
  joint=by_name.get(name)
  if joint is None:raise ValueError('Unknown joint '+name)
  limit=joint.find('limit')
  if joint.get('type') not in ('revolute','prismatic') or limit is None:
   raise ValueError('A limited revolute/prismatic joint is required: '+name)
  lo,hi=float(limit.get('lower')),float(limit.get('upper'))
  if not np.isfinite([lo,hi]).all() or lo>hi:raise ValueError('Invalid limits: '+name)
  limits[name]={'lower':lo,'upper':hi,'unit':'m' if joint.get('type')=='prismatic' else 'rad'}
 neutral=scene.contacts();failures=[]
 for values in product(*(np.linspace(limits[n]['lower'],limits[n]['upper'],samples) for n in joints)):
  pose=dict(zip(joints,map(float,values)));pairs=scene.contacts(pose)
  if pairs:failures.append({'positions':pose,'pairs':pairs})
 return {'scope':__doc__,'mode':'simultaneous_joint_grid',
  'source_urdf_sha256':hashlib.sha256(scene.source.read_bytes()).hexdigest(),
  'source_mesh_sha256':scene.mesh_hashes,'joint_limits':limits,
  'samples_per_joint':samples,'poses_checked':1+samples**len(joints),
  'neutral_pairs':neutral,'failing_grid_poses':len(failures),'failures':failures,
  'pass':not neutral and not failures,
  'limitations':['Uniform grid samples are not continuous collision detection',
   'Only the named joints vary; every other joint stays at zero',
   'Surface intersections do not test full containment, human fit or achievable dynamics']}

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('urdf',type=Path);p.add_argument('--json',type=Path,required=True)
 group=p.add_mutually_exclusive_group();group.add_argument('--joints',nargs='*',default=[]);group.add_argument('--all-joints',action='store_true',help='Sweep every limited revolute/prismatic joint');p.add_argument('--samples',type=int,default=5);p.add_argument('--grid',action='store_true',help='Sample simultaneous motion of two or three joints');a=p.parse_args()
 scene=SurfaceScene(a.urdf)
 joints=[j.get('name') for j in scene.joints if j.get('type') in ('revolute','prismatic') and j.find('limit') is not None] if a.all_joints else a.joints
 if a.grid and a.all_joints:p.error('--grid requires two or three explicitly named --joints')
 report=(audit_grid if a.grid else audit)(scene,joints,a.samples)
 if a.all_joints:report['coverage']='Every limited revolute/prismatic joint in the exported URDF, moved independently; no combined-motion guarantee'
 a.json.write_text(json.dumps(report,indent=2)+'\n');print(report['poses_checked'],'poses; pass:',report['pass'])
if __name__=='__main__':main()
