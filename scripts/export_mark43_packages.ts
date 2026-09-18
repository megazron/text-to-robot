// node scripts/export_mark43_packages.ts /tmp/ttr-mark43-packages
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {exportRos2Package} from '@ttr/ros2-export';
import {exportTraining} from '@ttr/training-export';
import {generateCadFiles} from '@ttr/cad';
const spec=JSON.parse(readFileSync('examples/14_iron_man_mark_43/robot.json','utf8'));
const root=process.argv[2];if(!root)throw new Error('Supply an output directory');
for(const [bundle,files] of Object.entries({ros2:exportRos2Package(spec),training:exportTraining(spec),cad:generateCadFiles(spec)}))
  for(const [path,content] of Object.entries(files)){const target=join(root,bundle,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content);}
