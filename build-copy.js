// build-copy.js
// Copia el sitio institucional al dist/ para que Netlify lo sirva en la raíz
import fs from 'fs';
import path from 'path';

const src = path.resolve('public/index.html');
const dst = path.resolve('dist/index.html');

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dst);
  console.log('✓ Sitio institucional copiado a dist/index.html');
} else {
  console.error('✗ No se encontró public/index.html');
  process.exit(1);
}
