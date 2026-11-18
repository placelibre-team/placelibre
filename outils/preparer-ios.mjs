import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'public');
const target = path.join(root, '.capacitor-web');
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
await build({
  entryPoints: [path.join(root, 'native/bridge.mjs')],
  outfile: path.join(target, 'js/native.js'),
  bundle: true, format: 'iife', platform: 'browser', target: 'safari15',
  minify: true, legalComments: 'eof'
});
const file = path.join(target, 'index.html');
const html = await readFile(file, 'utf8');
const marker = '<script src="js/config.js"></script>';
if (!html.includes(marker)) throw new Error('Point d’insertion du pont iOS absent.');
await writeFile(file, html.replace(marker, '<script src="js/native.js"></script>\n' + marker));
console.log('Interface iOS préparée dans .capacitor-web (site public inchangé).');
