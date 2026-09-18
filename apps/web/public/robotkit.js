// Client-side forward kinematics + geometry helpers + a tiny zip writer.
// Mirrors @ttr/kinematics so the browser needs no server for joint motion.

export function fromRPY(r, p, y) {
  const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p), cy = Math.cos(y), sy = Math.sin(y);
  return [
    cy*cp, cy*sp*sr - sy*cr, cy*sp*cr + sy*sr, 0,
    sy*cp, sy*sp*sr + cy*cr, sy*sp*cr - cy*sr, 0,
    -sp,   cp*sr,            cp*cr,            0,
    0,0,0,1,
  ];
}
export function translation(t){ const m=identity(); m[3]=t[0]; m[7]=t[1]; m[11]=t[2]; return m; }
export function identity(){ return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
export function multiply(a,b){ const o=new Array(16).fill(0); for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)o[i*4+j]+=a[i*4+k]*b[k*4+j]; return o; }
export function poseToMat(p){ return multiply(translation(p.xyz), fromRPY(p.rpy[0],p.rpy[1],p.rpy[2])); }
export function axisAngle(axis, ang){ const n=Math.hypot(...axis)||1; const [x,y,z]=[axis[0]/n,axis[1]/n,axis[2]/n]; const c=Math.cos(ang),s=Math.sin(ang),t=1-c;
  return [t*x*x+c, t*x*y-s*z, t*x*z+s*y,0, t*x*y+s*z, t*y*y+c, t*y*z-s*x,0, t*x*z-s*y, t*y*z+s*x, t*z*z+c,0, 0,0,0,1]; }

export function findRoot(spec){ const ch=new Set(spec.joints.map(j=>j.child)); return spec.links.map(l=>l.name).find(n=>!ch.has(n)); }

function jointMotion(j, v){
  if(j.type==='revolute'||j.type==='continuous') return axisAngle(j.axis, v);
  if(j.type==='prismatic'){ const n=Math.hypot(...j.axis)||1; return translation([j.axis[0]/n*v, j.axis[1]/n*v, j.axis[2]/n*v]); }
  return identity();
}
export function forwardKinematics(spec, values={}){
  const world=new Map(); const root=findRoot(spec); if(!root) return world;
  world.set(root, identity());
  const kids=new Map(); for(const j of spec.joints){ if(!kids.has(j.parent)) kids.set(j.parent,[]); kids.get(j.parent).push(j); }
  const stack=[root]; const seen=new Set();
  while(stack.length){ const par=stack.pop(); if(seen.has(par)) continue; seen.add(par); const pw=world.get(par);
    for(const j of (kids.get(par)||[])){ const v=values[j.name]??0; world.set(j.child, multiply(multiply(pw, poseToMat(j.origin)), jointMotion(j,v))); stack.push(j.child); } }
  return world;
}

// --- minimal store-only ZIP (no compression) for the ROS 2 package download ---
function crc32(bytes){ let c=~0; for(let i=0;i<bytes.length;i++){ c^=bytes[i]; for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320 & -(c&1)); } return ~c>>>0; }
export function makeZip(files){ // files: {path: string}
  const enc=new TextEncoder(); const chunks=[]; const central=[]; let offset=0;
  const u16=n=>[n&255,(n>>8)&255]; const u32=n=>[n&255,(n>>8)&255,(n>>16)&255,(n>>24)&255];
  const toBytes=(c)=> c instanceof Uint8Array ? c : (c && typeof c==='object' && c.b64) ? Uint8Array.from(atob(c.b64), ch=>ch.charCodeAt(0)) : enc.encode(String(c));
  for(const [path, content] of Object.entries(files)){
    const name=enc.encode(path); const data=toBytes(content); const crc=crc32(data);
    const local=[...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)];
    chunks.push(new Uint8Array(local), name, data);
    central.push([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),name]);
    offset += local.length + name.length + data.length;
  }
  const cd=[]; let cdSize=0;
  for(const c of central){ const name=c[c.length-1]; const head=c.slice(0,c.length-1); const arr=new Uint8Array([...head, ...name]); cd.push(arr); cdSize+=arr.length; }
  const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(central.length),...u16(central.length),...u32(cdSize),...u32(offset),...u16(0)]);
  const blobParts=[...chunks, ...cd, end];
  return new Blob(blobParts, {type:'application/zip'});
}

export function download(name, content, type='text/plain'){
  const blob = content instanceof Blob ? content : new Blob([content], {type});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
