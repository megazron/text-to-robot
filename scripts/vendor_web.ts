// Browser dependencies are served by our own host: no CDN requests at runtime.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildSync } from 'esbuild';
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
// GIF encoder for "Download animation" (gifenc, MIT)
for (const [source, destination] of Object.entries({ 'dist/gifenc.esm.js': 'gifenc.esm.js', 'LICENSE.md': 'GIFENC-LICENSE.md' })) copyFileSync(`node_modules/gifenc/${source}`, `apps/web/public/vendor/${destination}`);
// avr8js (MIT): the AVR simulator of the Run tab, bundled into one ES module (its package ships extensionless imports)
buildSync({ entryPoints: ['node_modules/avr8js/dist/esm/index.js'], bundle: true, format: 'esm', minify: true, outfile: 'apps/web/public/vendor/avr8js.js', legalComments: 'none', logLevel: 'error' });
copyFileSync('node_modules/avr8js/LICENSE', 'apps/web/public/vendor/AVR8JS-LICENSE.txt');
