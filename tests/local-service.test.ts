import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateRobot,modifyRobot} from '@ttr/robot-generator';
import {providerStatus} from '@ttr/llm-providers';
import {meshTopology,buildPart,massProperties} from '@ttr/mesh';
import {mecanum,nDofArm} from '@ttr/robot-templates';
import {generateUrdf} from '@ttr/urdf-generator';
import {buildBom} from '@ttr/components';
import {exportTraining} from '@ttr/training-export';

test('generation and modification cannot call external inference even with old credentials',async(t)=>{
  const old=process.env.HF_TOKEN;process.env.HF_TOKEN='unused';
  t.after(()=>{if(old===undefined)delete process.env.HF_TOKEN;else process.env.HF_TOKEN=old;});
  t.mock.method(globalThis,'fetch',()=>{throw new Error('Unexpected external network request');});
  const generated=await generateRobot('6 DOF arm');
  const modified=await modifyRobot(generated.robot,'make the forearm 30% longer');
  assert.equal(generated.provider,'local');assert.equal(modified.provider,'local');
  assert.equal(providerStatus().requires_token,false);
  assert.ok(modified.validation.valid);
});

test('viewer dependencies are same-origin and usable on shared robot URLs',()=>{
  const html=readFileSync('apps/web/public/index.html','utf8');
  assert.doesNotMatch(html,/https:\/\/cdn|src="\.\/app|href="styles/);
  assert.match(html,/src="\/app.js"/);
  for(const file of ['three.module.js','addons/controls/OrbitControls.js','addons/loaders/STLLoader.js'])
    assert.ok(readFileSync(`apps/web/public/vendor/${file}`).length>100);
});

test('mounting plates have through-holes and a closed positive-volume surface',()=>{
  const params={width:.144,height:.144,thickness:.003,bore:.0034,inset:.012,vents:5};
  const mesh=buildPart({part:'mounting_plate',params});
  assert.ok(meshTopology(mesh).closed);
  const volume=massProperties(mesh).volume;
  assert.ok(volume>0 && volume<params.width*params.height*params.thickness);
  const arm=nDofArm(6);assert.ok(arm.links.some(l=>l.name==='base_link_service_lid'));
  assert.equal(arm.joints.find(j=>j.name==='joint_2')!.axis.join(),arm.joints.find(j=>j.name==='joint_3')!.axis.join());
});

test('mecanum rollers stay passive through URDF, BOM and training export',()=>{
  const spec=mecanum();assert.equal(spec.joints.filter(j=>j.passive).length,32);
  const urdf=generateUrdf(spec);assert.equal((urdf.match(/passive="true"/g)||[]).length,32);
  assert.ok(!buildBom(spec).lines.some(l=>/roller_\d+_bearing/.test(l.note??'')));
  const code=exportTraining(spec)['training/robot_env.py'] as string;
  assert.match(code,/passive_names = \[/);assert.match(code,/p.VELOCITY_CONTROL,targetVelocity/);
  assert.match(code,/URDF_USE_SELF_COLLISION/);assert.match(code,/range\(12\)/);
});

test('arm spars are connected closed solids extending between joint centres',()=>{
  for(const dof of [2,6,7]) {
    const spec=nDofArm(dof);
    for(const l of spec.links.filter(l=>l.geometry.type==='mesh' && l.geometry.part==='arm_spar')) {
      if(l.geometry.type!=='mesh')throw new Error('Expected mesh');
      const mesh=buildPart(l.geometry),topology=meshTopology(mesh);
      assert.ok(topology.closed,`${dof}/${l.name}`);
      assert.ok(massProperties(mesh).volume>0);
      assert.ok(Math.abs(l.origin.xyz[2]+l.geometry.bbox.min[2])<1e-8);
      const next=spec.joints.find(j=>j.parent===l.name && j.origin.xyz[2]>0);
      assert.ok(next,`${l.name} requires a distal attachment`);
      assert.ok(Math.abs(l.origin.xyz[2]+l.geometry.bbox.max[2]-next.origin.xyz[2])<1e-8);
    }
  }
});

test('length modification keeps a mesh spar attached and scales its actual solid',async()=>{
  const before=await generateRobot('6 DOF arm');
  const after=await modifyRobot(before.robot,'make the forearm 30% longer');
  const a=before.robot.links.find(l=>l.name==='forearm'),b=after.robot.links.find(l=>l.name==='forearm');
  assert.ok(a?.geometry.type==='mesh' && b?.geometry.type==='mesh');
  assert.ok(Math.abs(b.geometry.volume/a.geometry.volume-1.3)<1e-8);
  const distal=after.robot.joints.find(j=>j.parent==='forearm' && j.type==='revolute');
  assert.ok(distal);
  assert.ok(Math.abs(b.origin.xyz[2]+b.geometry.bbox.max[2]-distal.origin.xyz[2])<1e-8);
  assert.notDeepEqual(a.inertia,b.inertia);
});

test('arm spar compound collisions cover the solid without filling narrow-end clearance',()=>{
  const spec=nDofArm(2),l=spec.links.find(l=>l.name==='shoulder');
  assert.ok(l?.geometry.type==='mesh');
  const p=l.geometry.params;assert.ok(p);const L=Number(p.length),R=Number(p.radius),neck=Number(p.neck),gap=Number(p.gap);
  const half=(L-2*gap+2*Math.min(gap*.3,.006))/2;
  for(const [x,y,z] of buildPart(l.geometry).v) {
    const r=Math.hypot(x,y);
    assert.ok((r<=neck+1e-9 && Math.abs(z)<=L/2+1e-9) || (r<=R+1e-9 && Math.abs(z)<=half+1e-9));
  }
  assert.ok(half<L/2-.001 && neck<R*.5);
  const urdf=generateUrdf(spec),block=urdf.split('<link name="shoulder">')[1].split('</link>')[0];
  assert.equal((block.match(/<collision>/g)||[]).length,2);
});
