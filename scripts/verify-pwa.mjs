import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = file => readFile(path.join(root, file), 'utf8');
const manifest = JSON.parse(await read('manifest.webmanifest'));
const index = await read('index.html');
const worker = await read('sw.js');

const requiredManifestFields = ['id','name','short_name','start_url','scope','display','theme_color','background_color','icons'];
const missing = requiredManifestFields.filter(field => manifest[field] == null);
if (missing.length) throw new Error(`Faltan campos del manifiesto: ${missing.join(', ')}`);
if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) throw new Error('El manifiesto necesita al menos dos iconos.');

for (const icon of manifest.icons) {
  if (!icon.src || !icon.sizes || !icon.type) throw new Error('Hay un icono incompleto en el manifiesto.');
  await access(path.join(root, icon.src.replace(/^\.\//,'')));
}

if (!index.includes('rel="manifest"')) throw new Error('index.html no enlaza el manifiesto.');
if (!index.includes('css-platform.css')) throw new Error('index.html no carga los estilos de plataforma.');

// La implementación puede usar optional chaining u otras variantes de sintaxis.
// Lo importante es que escuche la señal SKIP_WAITING y ejecute skipWaiting().
const supportsControlledUpdate = worker.includes('SKIP_WAITING') && /\bskipWaiting\s*\(/.test(worker);
if (!supportsControlledUpdate) {
  throw new Error('El service worker no admite actualización controlada.');
}

if (!worker.includes('app-platform.js')) throw new Error('El service worker no conserva el módulo de plataforma.');

console.log('PWA validada correctamente.');
console.log(`Nombre: ${manifest.name}`);
console.log(`Iconos: ${manifest.icons.length}`);
console.log(`Inicio: ${manifest.start_url}`);
