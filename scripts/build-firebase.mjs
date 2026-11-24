// Збирає SDK Firebase в один файл site/vendor/firebase.js (без CDN — працює офлайн).
import { build } from 'esbuild';

await build({
  entryPoints: ['scripts/firebase-entry.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  legalComments: 'eof',
  outfile: 'site/vendor/firebase.js',
});
console.log('✅ site/vendor/firebase.js');
