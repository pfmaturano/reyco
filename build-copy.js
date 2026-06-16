// build-copy.js
// Vite ya generó dist/ con base '/app/'
// Este script:
//   1. Mueve todo dist/* → dist/app/
//   2. Copia manifest.json, service worker e íconos PWA a dist/app/
//   3. Pone el sitio institucional en dist/index.html
import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const appDir  = path.resolve('dist/app');

// 1. Crear dist/app/
fs.mkdirSync(appDir, { recursive: true });

// 2. Mover archivos de dist/ a dist/app/ (skip carpeta 'app')
for (const file of fs.readdirSync(distDir)) {
  if (file === 'app') continue;
  fs.renameSync(path.join(distDir, file), path.join(appDir, file));
  console.log(`  → dist/app/${file}`);
}

// 3. Copiar assets PWA (manifest, sw, íconos) a dist/app/
const appPublicDir = path.resolve('app-public');
if (fs.existsSync(appPublicDir)) {
  for (const file of fs.readdirSync(appPublicDir)) {
    fs.copyFileSync(path.join(appPublicDir, file), path.join(appDir, file));
    console.log(`  → dist/app/${file} (PWA asset)`);
  }
}

// 4. Copiar sitio institucional a dist/index.html
fs.copyFileSync(path.resolve('public/index.html'), path.join(distDir, 'index.html'));
console.log('✓ Sitio institucional → dist/index.html');
console.log('✓ App React + PWA → dist/app/');
