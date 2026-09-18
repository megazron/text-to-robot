import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {nDofArm} from '@ttr/robot-templates';
import {buildPart,massProperties,bbox} from '@ttr/mesh';

test('imported CAD tessellation survives API storage, STL streaming and downloads',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'ttr-import-'));
  const child=spawn(process.execPath,[resolve('apps/api/src/server.ts')],{env:{...process.env,PORT:'0',TTR_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
  try{
    const port=await new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('API startup timed out')),10000);
      child.once('exit',()=>{clearTimeout(timer);reject(new Error('API exited'))});
      child.stdout.on('data',(data)=>{const m=String(data).match(/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
    });
    const api=`http://127.0.0.1:${port}`;
    const spec=nDofArm(2);const mesh=buildPart({part:'ring',params:{outer:.04,inner:.03,height:.02}}),props=massProperties(mesh);
    spec.links[0].geometry={type:'mesh',part:'indexed_mesh',file:'cad_fixture.stl',vertices:mesh.v,triangles:mesh.f,volume:props.volume,centroid:props.centroid,inertia_unit:props.inertia,bbox:bbox(mesh)};
    const response=await fetch(api+'/api/robots/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({robot:spec})});
    const result=await response.json() as any;assert.equal(response.status,200,JSON.stringify(result));
    const asset=await fetch(`${api}/api/robots/${result.id}/mesh/cad_fixture.stl`);
    const binary=await asset.arrayBuffer();assert.equal(asset.status,200);assert.ok(binary.byteLength>84);
    assert.equal(new DataView(binary).getUint32(80,true),mesh.f.length);
    const cad=await fetch(api+'/api/robots/cad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({robot:result.robot})});
    const files=(await cad.json() as any).files;assert.ok(files['cad/hardware/attach.py']);assert.ok(files['cad/robot.json']);
    const invalid=structuredClone(spec);if(invalid.links[0].geometry.type==='mesh')invalid.links[0].geometry.triangles=[[0,1,999999]];
    const rejected=await fetch(api+'/api/robots/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({robot:invalid})});
    assert.equal(rejected.status,400);
  }finally{
    if(child.exitCode===null && child.signalCode===null){const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill();await exited;}
    rmSync(directory,{recursive:true,force:true});
  }
});
