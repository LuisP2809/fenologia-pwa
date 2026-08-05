import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'www');
const allowedExtensions = new Set(['.html', '.js', '.css', '.webmanifest']);
const folders = ['data', 'icons'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const entries = await readdir(root, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile()) continue;
  if (!allowedExtensions.has(path.extname(entry.name))) continue;
  await cp(path.join(root, entry.name), path.join(output, entry.name));
}

for (const folder of folders) {
  await cp(path.join(root, folder), path.join(output, folder), { recursive: true });
}

const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(
  path.join(output, 'build-info.json'),
  JSON.stringify({
    name: packageInfo.name,
    version: packageInfo.version,
    builtAt: new Date().toISOString(),
    target: 'capacitor-android'
  }, null, 2),
  'utf8'
);

const required = ['index.html', 'manifest.webmanifest', 'sw.js', 'app-bootstrap.js'];
for (const file of required) {
  const found = entries.some(entry => entry.isFile() && entry.name === file);
  if (!found) throw new Error(`Falta el archivo obligatorio ${file}.`);
}

console.log(`Web preparada en ${output}`);
console.log(`Versión ${packageInfo.version}`);
