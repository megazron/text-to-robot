import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateRobot,DemoProvider} from '@ttr/robot-generator';
import {forwardKinematics} from '@ttr/kinematics';
const spec=(await generateRobot('Wearable Iron Man Mark 43 suit',{provider:new DemoProvider()})).robot;
function changed(name:string,values:Record<string,number>) {
  const before=forwardKinematics(spec,{}).get(name)!;
  const after=forwardKinematics(spec,values).get(name)!;
  return before.some((v,i)=>Math.abs(v-after[i])>1e-6);
}
test('Mark 43 helmet assembly follows neck rotation while collar stays on torso',()=>{
  for(const name of ['helmet','faceplate','left_eye_lens','right_cheek_panel','helmet_crown_panel','chin_guard'])
    assert.ok(changed(name,{neck_yaw:.3,neck_pitch:.15}),name);
  assert.equal(changed('helmet_neck_collar',{neck_yaw:.3,neck_pitch:.15}),false);
});
test('Mark 43 chest inlays follow their opening door',()=>{
  for(const side of ['left','right']) {
    for(const suffix of ['chest_inlay','chest_inlay_centre','pectoral_trim','collar_inlay'])
      assert.ok(changed(`${side}_${suffix}`,{[`${side}_chest_door_hinge`]:side==='left'?.5:-.5}));
    assert.equal(changed('chest_centre',{[`${side}_chest_door_hinge`]:.5}),false);
  }
});
test('Mark 43 each finger curls at three joints, with distal motion independent of palm',()=>{
  for(const side of ['left','right'])for(let f=1;f<=4;f++) {
    const base=`${side}_finger_${f}`,middle=`${base}_middle`,tip=`${base}_distal`;
    assert.ok(changed(tip,{[`${middle}_hinge`]:.7}));
    assert.ok(changed(`${tip}_knuckle`,{[`${tip}_hinge`]:.4}));
    assert.equal(changed(base,{[`${middle}_hinge`]:.7}),false);
    assert.equal(changed(`${side}_hand`,{[`${base}_hinge`]:.8}),false);
  }
});
test('Mark 43 MoveIt exposes neck and every digit joint',async()=>{
  const {planningGroups}=await import('@ttr/ros2-export');
  const groups=planningGroups(spec);
  assert.deepEqual(groups.find(g=>g.name==='neck')!.joints.map(j=>j.name),['neck_yaw','neck_pitch']);
  for(const side of ['left','right'])assert.equal(groups.find(g=>g.name===`${side}_hand`)!.joints.length,14);
});

test('left and right pectorals mirror the entire solid including wall thickness',async()=>{
  const {buildPart}=await import('@ttr/mesh');
  for(const section of ['lower','upper']) {
    const left=buildPart({part:'mark43_chest',params:{side:1,section}});
    const right=buildPart({part:'mark43_chest',params:{side:-1,section}});
    const points=(v:number[][])=>v.map(p=>p.map(x=>x.toFixed(8)).join(',')).sort();
    assert.deepEqual(points(left.v.map(([x,y,z])=>[x,-y,z])),points(right.v));
  }
});

test('forehead insert follows crown and rear detail follows its flight flap',()=>{
  assert.ok(changed('forehead_plate',{helmet_crown_panel_hinge:-.4}));
  assert.equal(changed('forehead_plate',{faceplate_hinge:-.4}),false);
  for(const side of ['left','right']) {
    assert.ok(changed(`${side}_back_scapula`,{[`${side}_flight_flap_hinge`]:-.4}));
    assert.equal(changed(`${side}_back_scapula`,{[`${side==='left'?'right':'left'}_flight_flap_hinge`]:-.4}),false);
  }
});
