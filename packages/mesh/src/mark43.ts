// Reference-informed armour surfaces. All dimensions are metres; these are
// authored shapes, not scans or a claim of prop-exact geometry.
import { type Mesh, type V3, loft, shell, flip, mirrorY } from './core.ts';
import { superArc, insetOutline } from './shapes.ts';

const outlines: Record<string,[number,number][]> = {
  pectoral: [[-.48,-.22],[-.23,-.48],[.22,-.38],[.5,.04],[.38,.38],[.05,.5],[-.43,.38]],
  sternum: [[-.31,-.5],[.31,-.5],[.5,.15],[.30,.5],[-.30,.5],[-.5,.15]],
  abdomen: [[-.34,-.50],[.34,-.50],[.50,.14],[.43,.5],[-.43,.5],[-.50,.14]],
  flank: [[-.28,-.50],[.30,-.38],[.50,.04],[.26,.50],[-.32,.38],[-.50,-.10]],
  thigh: [[-.24,-.50],[.33,-.40],[.48,.18],[.24,.50],[-.40,.31],[-.5,-.25]],
  shin: [[-.20,-.50],[.20,-.50],[.48,.18],[.32,.50],[-.32,.50],[-.48,.18]],
  knee: [[0,-.50],[.44,-.15],[.50,.30],[.25,.50],[-.25,.50],[-.50,.30],[-.44,-.15]],
  gauntlet: [[-.3,-.50],[.30,-.50],[.5,.26],[.22,.5],[-.22,.5],[-.5,.26]],
  belt: [[-.42,-.35],[0,-.50],[.42,-.35],[.5,.32],[.27,.5],[-.27,.5],[-.5,.32]],
  collar: [[-.5,-.1],[-.32,-.5],[.32,-.5],[.5,-.1],[.44,.5],[-.44,.5]],
};
export function armourPanel(style:string,w:number,h:number,t:number,R:number):Mesh {
  const outline=outlines[style];if(!outline)throw new Error(`Unknown armour panel ${style}`);
  const outer=outline.map(([u,v])=>[u*w,v*h] as [number,number]);
  const bevel=Math.min(t*.35,.0015),inner=insetOutline(outer,bevel);
  const wrap=(points:[number,number][],depth:number)=>points.map(([y,z])=>[(R-depth)*Math.cos(y/R)-R,(R-depth)*Math.sin(y/R),z] as V3);
  // Preserve every authored corner. A regular grid rounds off oblique outlines.
  return loft([wrap(inner,t),wrap(outer,t-bevel),wrap(outer,bevel),wrap(inner,0)],{closed:true,capStart:true,capEnd:true});
}
export function sculptedLimb(length:number,rTop:number,rBottom:number,a0:number,a1:number,thickness:number,style:string):Mesh {
  // Depth, width and forward offset vary independently. Breaks make actual
  // longitudinal facets rather than smoothing the entire limb into a tube.
  const profiles:Record<string,number[][]>={
    thigh:[[0,.90,.94,0],[.14,1.04,1.0,.025],[.40,.99,.94,.035],[.72,.88,.86,.03],[1,.76,.78,.04]],
    shin:[[0,.94,.92,0],[.20,1.03,1.0,-.025],[.48,.91,.88,0],[.76,.77,.78,.03],[1,.70,.74,.055]],
    arm:[[0,.85,.90,0],[.22,1.03,1.0,0],[.52,1,.96,0],[.8,.87,.86,0],[1,.78,.82,0]],
    forearm:[[0,.86,.93,0],[.18,1.07,1.04,0],[.40,1.0,.99,.03],[.74,.83,.88,.04],[1,.71,.77,.03]],
  };
  const rows=profiles[style]??profiles.arm;
  const sections=rows.map(([u,dx,dy,cx])=>{const r=rTop+(rBottom-rTop)*u;return superArc(r*dx,r*dy,-length*u,a0,a1,25,2.65,cx*rTop);});
  return shell(flip(loft(sections,{closed:false})),thickness);
}
export function shoulderShell(side:number):Mesh {
  const rows:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=
    [[.012,.112,.104],[.043,.105,.096],[.074,.079,.072],[.087,.030,.026]];
  const sections=rows.map(([z,rx,ry])=>superArc(rx,ry,z,-Math.PI,Math.PI,33,2.7).map(([x,y,z])=>[x,y,z-.45*Math.max(0,y)] as V3));
  // A shallow crowned shell with a sloped outside skirt; open underneath.
  sections.push(superArc(.001,.001,.09,-Math.PI,Math.PI,33,2.7));
  const m=shell(loft(sections,{closed:true,capEnd:true}),.005);
  return side<0?mirrorY(m):m;
}

export function bootShell():Mesh {
  const rows=[[ -.078,.164,.073,.035],[-.052,.162,.074,.035],[-.010,.139,.070,.021],[.035,.080,.062,-.015],[.07,.065,.055,-.028]];
  const sec=rows.map(([z,rx,ry,cx])=>superArc(rx,ry,z,-Math.PI,Math.PI-2*Math.PI/40,40,3.4,cx));
  return shell(flip(loft(sec,{closed:true})),.005);
}
