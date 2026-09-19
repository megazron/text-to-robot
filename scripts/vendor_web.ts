// Browser dependencies are served by our own host: no CDN requests at runtime.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const files = {
  'build/three.module.js': 'three.module.js',
  'examples/jsm/controls/OrbitControls.js': 'addons/controls/OrbitControls.js',
  'examples/jsm/loaders/STLLoader.js': 'addons/loaders/STLLoader.js',
  'LICENSE': 'THREE-LICENSE.txt',
};
for (const [source, destination] of Object.entries(files)) {
  const target = `apps/web/public/vendor/${destination}`;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(`node_modules/three/${source}`, target);
}
