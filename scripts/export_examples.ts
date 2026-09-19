// Export the checked-in specifications without regenerating prompts or silently
// depending on files left in /tmp by an earlier developer session.
import {readdirSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {exportRos2Package} from '@ttr/ros2-export';
import {exportTraining} from '@ttr/training-export';
import {generateCadFiles} from '@ttr/cad';
import {buildBom,bomToMarkdown} from '@ttr/components';
import type {RobotSpecification} from '@ttr/robot-schema';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
for(const name of readdirSync('examples').filter(n=>/^\d\d_/.test(n))){
 if(process.env.TTR_EXAMPLE && name!==process.env.TTR_EXAMPLE)continue;
 const folder=join('examples',name),raw=readFileSync(join(folder,'robot.json'),'utf8');
 const spec:RobotSpecification=JSON.parse(raw);
 const match=readFileSync(join(folder,'prompt.txt'),'utf8').match(/budget\s*[:=]?\s*\$([\d,]+)/i);
 const bom=buildBom(spec,match?Number(match[1].replaceAll(',','')):undefined);
 writeFileSync(join(folder,'BOM.md'),bomToMarkdown(bom));
 writeFileSync(join(folder,'bom.json'),JSON.stringify(bom,null,2)+'\n');
 const stage=mkdtempSync(join(tmpdir(),'ttr-exports-'));
 try{
  for(const [kind,files] of Object.entries({ros2:exportRos2Package(spec),training:exportTraining(spec),cad:generateCadFiles(spec)})){
   const base=join(stage,kind);
   for(const [file,content] of Object.entries(files)){
    const target=join(base,file);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);
    if(kind==='ros2' && file.startsWith(spec.robot_name+'/moveit/')){
     const target=join(folder,file.slice(spec.robot_name.length+1));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);
    }
   }
   execFileSync('python3',['-c',`import sys,zipfile\nfrom pathlib import Path\nbase=Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted(base.rglob('*')):\n  if p.is_file():\n   info=zipfile.ZipInfo(p.relative_to(base).as_posix(),(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,p.read_bytes())`,base,join(folder,`robot.${kind}.zip`)]);
  }
 }finally{rmSync(stage,{recursive:true,force:true});}
 const joints=spec.joints.filter(j=>j.type!=='fixed');
 const evidence={
  scope:'Design-input inventory, not a hardware qualification or a claim that missing interfaces were inspected in CAD',
  source_robot_sha256:digest(raw),source_bom_sha256:digest(readFileSync(join(folder,'bom.json'),'utf8')),
  hardware_verified:false,manufacturing_ready:false,prototype_test_evidence:null,
  declared_mass_kg:spec.links.reduce((a,l)=>a+l.mass,0),
  links_with_inferred_mass:spec.links.filter(l=>l.inferred?.includes('mass')).map(l=>l.name),
  actuator_catalogue_sizing_pass:bom.sizing_pass,
  joint_requirements:joints.map(j=>({joint:j.name,type:j.type,effort:j.limit?.effort,effort_unit:j.type==='prismatic'?'N':'N·m',velocity:j.limit?.velocity,velocity_unit:j.type==='prismatic'?'m/s':'rad/s',...(j.type==='continuous'?{travel:'continuous'}:{lower:j.limit?.lower,upper:j.limit?.upper,position_unit:j.type==='prismatic'?'m':'rad'})})),
  missing_evidence:[
   {id:'component_interfaces',detail:'No verified vendor drawing, shaft/horn interface, mounting-hole pattern or bearing fit is associated with each joint.'},
   {id:'actuator_operating_envelope',detail:'No complete speed/effort/thermal-duty and feedback qualification; catalogue effort alone does not validate the selected actuator.'},
   {id:'electronics_packaging',detail:'No verified placement, mounting, connector access or cable-bend clearance for the selected electronics. The optional enclosure example uses synthetic dimensions.'},
   {id:'electrical_system',detail:'No validated rail voltages, peak currents, power budget, wiring schematic or protection sizing.'},
   {id:'manufacturing_and_assembly',detail:'No complete tolerance stack, material/process specification, fastener schedule, assembly procedure or service-access validation.'},
   {id:'measured_dynamics',detail:'No prototype measurements establish masses, inertias, friction, backlash, compliance or model-to-hardware agreement.'},
   {id:'physical_validation',detail:'No physical assembly, load test or task-performance evidence is attached.'},
  ],
 };
 writeFileSync(join(folder,'buildability_report.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(name,'CAD / ROS / training / BOM / build evidence exported');
}
