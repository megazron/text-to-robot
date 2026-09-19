import type { RobotSpecification, Vec3 } from '@ttr/robot-schema';
import { pose } from '@ttr/robot-schema';
import { meshGeometry } from '@ttr/mesh';
import { box, link, joint } from './builder.ts';

/** Split a solid chassis into manufacturable sheet parts, preserving its link frame.
 * Dimensions are our design choices, not copied vendor tolerances or qualification.
 */
export function hollowChassis(spec: RobotSpecification, name='base_link') {
  const base=spec.links.find(l=>l.name===name);
  if(!base || base.geometry.type!=='box' || base.origin.rpy.some(v=>v!==0))return;
  const [x,y,z]=base.geometry.size,[cx,cy,cz]=base.origin.xyz;
  if(Math.min(x,y)<.09 || z<.045)return;
  const t=.003,material=base.material;
  const plate=(id:string,vents=0)=>meshGeometry('mounting_plate',`${id}.stl`,{width:x,height:y,thickness:t,bore:.0034,inset:.012,vents});
  base.geometry=plate(name);base.origin=pose([cx,cy,cz-z/2+t/2]);
  base.mass=base.geometry.volume*2700;base.inertia=undefined;base.collision=undefined;
  base.inferred=['material_density','inertia'];
  const fixed=(id:string,g:ReturnType<typeof box>|ReturnType<typeof meshGeometry>,p:Vec3)=>{
    spec.links.push(link(id,g,{material,role:'housing',density:2700,origin:pose(p)}));
    spec.joints.push(joint(`${id}_mount`,'fixed',name,id));
  };
  fixed(`${name}_service_lid`,plate(`${name}_service_lid`,5),[cx,cy,cz+z/2-t/2]);
  for(const s of [-1,1]){
    fixed(`${name}_${s>0?'front':'rear'}_panel`,box(t,y,z-2*t),[cx+s*(x/2-t/2),cy,cz]);
    fixed(`${name}_${s>0?'left':'right'}_panel`,box(x-2*t,t,z-2*t),[cx,cy+s*(y/2-t/2),cz]);
  }
  for(const sx of [-1,1])for(const sy of [-1,1]){
    const id=`${name}_standoff_${sx>0?'f':'r'}${sy>0?'l':'r'}`;
    fixed(id,meshGeometry('ring',`${id}.stl`,{outer:.004,inner:.0017,height:z-2*t}),[cx+sx*(x/2-.012),cy+sy*(y/2-.012),cz]);
  }
  spec.metadata.notes.push(`Housing ${name}: 3 mm aluminium panels, four 3.4 mm mounting bores with 12 mm edge offsets, vented removable lid and hollow standoffs. Interior ${((x-2*t)*1000).toFixed(0)} × ${((y-2*t)*1000).toFixed(0)} × ${((z-2*t)*1000).toFixed(0)} mm. Sheet density 2700 kg/m³ is assumed; electronics selection, inserts and screw lengths remain unqualified. Mesh collision proxies fill small bores.`);
}
