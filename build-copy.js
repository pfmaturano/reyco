// build-copy.js
// Mueve la app React de dist/ a dist/app/ y copia el sitio institucional a dist/
import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const appDir = path.resolve('dist/app');

// 1. Crear carpeta dist/app/
if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true });

// 2. Mover todos los archivos de dist/ a dist/app/ (excepto los que ya están en app/)
const files = fs.readdirSync(distDir);
for (const file of files) {
  if (file === 'app') continue;
  const src = path.join(distDir, file);
  const dst = path.join(appDir, file);
  fs.renameSync(src, dst);
  console.log(`  Movido: ${file} → app/${file}`);
}

// 3. Copiar sitio institucional a dist/index.html
const siteHtml = path.resolve('public/index.html');
const siteDst  = path.resolve('dist/index.html');
fs.copyFileSync(siteHtml, siteDst);
console.log('✓ Sitio institucional → dist/index.html');
console.log('✓ App React → dist/app/');
