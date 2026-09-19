// Original parametric sheet parts. Hole geometry is real, not painted on.
import earcut from 'earcut';
import { orient, type Mesh } from './core.ts';

export function mountingPlate(width: number, height: number, thickness: number, bore: number, inset: number, vents = 0): Mesh {
  if (!(width > 0 && height > 0 && thickness > 0 && bore > 0 && inset > bore && 2 * (inset + bore) < Math.min(width, height)))
    throw new Error('Invalid mounting plate dimensions');
  const contours: [number, number][][] = [[[-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2]]];
  for (const sx of [-1,1]) for (const sy of [-1,1]) {
    const cx=sx*(width/2-inset),cy=sy*(height/2-inset);
    contours.push(Array.from({length:24},(_,i)=>[cx+bore/2*Math.cos(-i*Math.PI/12),cy+bore/2*Math.sin(-i*Math.PI/12)]));
  }
  for(let i=0;i<vents;i++) {
    const y=(i-(vents-1)/2)*.008, x=width*.2;
    if(Math.abs(y)+.002 < height/2-2*inset)contours.push([[-x,y-.002],[-x,y+.002],[x,y+.002],[x,y-.002]]);
  }
  const points=contours.flat(),holes:number[]=[];
  let offset=contours[0].length;
  for(const contour of contours.slice(1)){holes.push(offset);offset+=contour.length;}
  const caps=earcut(points.flat(),holes,2),n=points.length;
  const mesh:Mesh={v:[...points.map(([x,y])=>[x,y,-thickness/2] as [number,number,number]),...points.map(([x,y])=>[x,y,thickness/2] as [number,number,number])],f:[]};
  for(let i=0;i<caps.length;i+=3){const [a,b,c]=caps.slice(i,i+3);mesh.f.push([c,b,a],[a+n,b+n,c+n]);}
  offset=0;
  for(const contour of contours){for(let i=0;i<contour.length;i++){const a=offset+i,b=offset+(i+1)%contour.length;mesh.f.push([a,b,b+n],[a,b+n,a+n]);}offset+=contour.length;}
  return orient(mesh);
}
