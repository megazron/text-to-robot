import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPart,meshTopology,massProperties,translate,orient,type Mesh} from '@ttr/mesh';
import {ironManMark43} from '@ttr/robot-templates';
import {geometryTris} from '@ttr/cad';
import {generateCollision,generateVisual} from '@ttr/urdf-generator';
import {pose} from '@ttr/robot-schema';
import {linkPositions} from '@ttr/kinematics';

const fromTriangles=(triangles: ReturnType<typeof geometryTris>):Mesh => orient({v:triangles.flat(),f:triangles.map((_,i)=>[3*i,3*i+1,3*i+2])});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('all Mark 43 recipe solids have closed, consistently wound edge topology',()=>{
  const spec=ironManMark43();let checked=0;
  for(const link of spec.links)if(link.geometry.type==='mesh'){
    const mesh=buildPart(link.geometry); assert.ok(meshTopology(mesh).closed,link.name);
    assert.ok(massProperties(mesh).volume>0,link.name);checked++;
  }
  assert.equal(checked,150);
});

test('solid integration matches an analytic translated cuboid, not its surface shell',()=>{
  const mesh=translate(fromTriangles(geometryTris({type:'box',size:[1,2,3]})),[10,-20,30]);
  const p=massProperties(mesh);near(p.volume,6);
  p.centroid.forEach((v,i)=>near(v,[10,-20,30][i]));
  near(p.inertia.ixx,6.5);near(p.inertia.iyy,5);near(p.inertia.izz,2.5);near(p.inertia.ixy,0);
});

test('sphere and capsule STL have no internal caps or degenerate poles',()=>{
  for(const geometry of [{type:'sphere' as const,radius:.1},{type:'capsule' as const,radius:.1,length:.3}]){
    const mesh=fromTriangles(geometryTris(geometry));assert.ok(meshTopology(mesh).closed);
    // Euler characteristic of one genus-zero boundary (no internal disks).
    const edges=new Set(mesh.f.flatMap(f=>f.map((a,i)=>[a,f[(i+1)%3]].sort((a,b)=>a-b).join(':'))));
    assert.equal(mesh.v.length-edges.size+mesh.f.length,2);
  }
});

test('helmet sight apertures are cut through the faceplate, not painted over it',()=>{
  const m=buildPart({part:'helmet_faceplate'});
  const hits=(y:number,z:number)=>m.f.filter(f=>{
    const [a,b,c]=f.map(i=>m.v[i]);
    const cross=(p:number[],q:number[],r:number[]) => (q[1]-p[1])*(r[2]-p[2])-(q[2]-p[2])*(r[1]-p[1]);
    const p=[0,y,z],s=[cross(a,b,p),cross(b,c,p),cross(c,a,p)];
    return Math.abs(cross(a,b,c))>1e-12 && (s.every(v=>v>1e-12)||s.every(v=>v< -1e-12));
  }).length;
  assert.equal(hits(.044,.043),0);assert.equal(hits(-.044,.043),0);
  assert.ok(hits(.04,.075)>=2,'solid forehead should still block the ray');
});

test('URDF capsule exports both end caps with rotated offsets',()=>{
  const link={name:'capsule',mass:1,geometry:{type:'capsule' as const,radius:.05,length:.2},origin:pose([1,0,0],[0,Math.PI/2,0])};
  for(const xml of [generateVisual(link),generateCollision(link)]){
    assert.equal((xml.match(/<sphere /g)||[]).length,2);
    const origins=[...xml.matchAll(/xyz="([^"]+)"/g)].map((m)=>m[1].split(' ').map(Number));
    near(origins[1][0],.9);near(origins[2][0],1.1);near(origins[1][2],0);near(origins[2][2],0);
  }
});

test('neutral exosuit stance separates the hands from the thigh shells and mirrors abduction',()=>{
  const spec=ironManMark43();const positions=linkPositions(spec,{});
  assert.ok(positions.left_hand[1]>.30);assert.ok(positions.right_hand[1]< -.30);
  near(positions.left_hand[1],-positions.right_hand[1]);
  assert.equal(spec.joints.find(j=>j.name==='right_shoulder_abduction')!.axis[0],-1);
  assert.equal(spec.joints.find(j=>j.name==='left_shoulder_abduction')!.axis[0],1);
  for(const name of ['left_thigh_cuff','left_shank_cuff','pelvis_frame']) {
    const g=spec.links.find(l=>l.name===name)!.geometry;
    assert.equal(g.type,'mesh');if(g.type==='mesh')assert.equal(g.part,'ring');
  }
});
