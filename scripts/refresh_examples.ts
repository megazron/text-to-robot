// Rebuild non-Mark43 examples from their recorded prompts, preserving generated names.
import {readdirSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {generateRobot,DemoProvider,collectMeshFiles} from '@ttr/robot-generator';
import {generateUrdf} from '@ttr/urdf-generator';
import {exportRos2Package,planningGroups} from '@ttr/ros2-export';
import {exportTraining} from '@ttr/training-export';
import {bomToMarkdown} from '@ttr/components';
import {dirname} from 'node:path';
for(const name of readdirSync('examples').filter(n=>/^\d\d_/.test(n))){
 if(process.env.TTR_EXAMPLE && name!==process.env.TTR_EXAMPLE)continue;
 const dir=`examples/${name}`;let spec;
 if(name.startsWith('14_'))spec=JSON.parse(readFileSync(`${dir}/robot.json`,'utf8'));
 else {
  const res=await generateRobot(readFileSync(`${dir}/prompt.txt`,'utf8'),{provider:new DemoProvider()});
  if(!res.validation.valid||!res.urdfValidation.valid)throw new Error(`Invalid ${name}`);
  spec=res.robot;
  writeFileSync(`${dir}/robot.json`,JSON.stringify(spec,null,2));
  writeFileSync(`${dir}/robot.urdf`,generateUrdf(spec));
  mkdirSync(`${dir}/meshes`,{recursive:true});
  for(const [file,bytes] of Object.entries(collectMeshFiles(spec)))writeFileSync(`${dir}/meshes/${file}`,bytes);
  writeFileSync(`${dir}/BOM.md`,bomToMarkdown(res.bom));
 }
 rmSync(`/tmp/ttr-example-packages/${name}`,{recursive:true,force:true});
 const files=exportRos2Package(spec);
 for(const [path,content] of Object.entries(files)){
  const target=`/tmp/ttr-example-packages/${name}/${path}`;mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);
 }
 rmSync(`/tmp/ttr-example-training/${name}`,{recursive:true,force:true});
 for(const [path,content] of Object.entries(exportTraining(spec))){const target=`/tmp/ttr-example-training/${name}/${path}`;mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);}
 console.log(name,spec.robot_name,planningGroups(spec).map(g=>g.name).join(','));
}
