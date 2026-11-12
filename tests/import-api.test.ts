import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {nDofArm} from '@ttr/robot-templates';
import {buildPart,massProperties,bbox} from '@ttr/mesh';

/** The server's port once it listens and answers /api/status: polled, with room for a loaded machine (2 minutes). */
async function apiReady(child:ReturnType<typeof spawn>,limitMs=120000):Promise<string>{
  const t0=Date.now();
  const port=await new Promise<string>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`API did not listen within ${limitMs/1000} s`)),limitMs);
    child.once('exit',(code)=>{clearTimeout(timer);reject(new Error(`API exited (${code})`))});
    child.stdout!.on('data',(data)=>{const m=String(data).match(/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(m[1]);}});
  });
  for(;;){
    try{if((await fetch(`http://127.0.0.1:${port}/api/status`)).ok)return port;}catch{/* not answering yet */}
    if(Date.now()-t0>limitMs)throw new Error(`API did not answer /api/status within ${limitMs/1000} s`);
    await new Promise((r)=>setTimeout(r,250));
  }
}

test('imported CAD tessellation survives API storage, STL streaming and downloads',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'ttr-import-'));
  const child=spawn(process.execPath,[resolve('apps/api/src/server.ts')],{env:{...process.env,PORT:'0',TTR_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
  try{
    const port=await apiReady(child);
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

test('the API server replaces its engine worker when the CAD kernel memory is full and keeps answering, meshes included',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'ttr-recycle-'));
  // a 1 MB threshold: every design fills it, so every answer is followed by a fresh worker
  const child=spawn(process.execPath,[resolve('apps/api/src/server.ts')],{env:{...process.env,PORT:'0',TTR_DATA_DIR:directory,TTR_RECYCLE_MB:'1'},stdio:['ignore','pipe','pipe']});
  try{
    const port=await apiReady(child);
    const api=`http://127.0.0.1:${port}`,post=(path:string,body:unknown)=>fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const ids:string[]=[];
    for(const prompt of ['a 2 DOF arm','a SCARA robot','a differential drive robot']){
      const r=await post('/api/robots/generate',{prompt});const j=await r.json() as any;
      assert.equal(r.status,200,JSON.stringify(j).slice(0,300));ids.push(j.id);
      const mesh=j.robot.links.find((l:any)=>l.geometry.type==='mesh');
      const stl=await fetch(`${api}/api/robots/${j.id}/mesh/${mesh.geometry.file}`);assert.equal(stl.status,200);assert.ok((await stl.arrayBuffer()).byteLength>84);
    }
    const status=await (await fetch(api+'/api/status')).json() as any;
    assert.ok(status.engine.recycles>=3,`recycled ${status.engine.recycles} times`);
    // anything that names a robot, a task or an object is designed now; random letters are still answered with why not
    const refused=await post('/api/robots/generate',{prompt:'qzxv bnmk wrtp'});assert.equal(refused.status,400);
    assert.match((await refused.json() as any).error,/random letters|could not find/);
  }finally{
    if(child.exitCode===null && child.signalCode===null){const exited=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill();await exited;}
    rmSync(directory,{recursive:true,force:true});
  }
});
