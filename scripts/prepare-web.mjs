import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'www');
const folders = ['data', 'icons', 'vendor'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const indexSource=await readFile(path.join(root,'index.html'),'utf8');
const bootstrapSource=await readFile(path.join(root,'app-bootstrap.js'),'utf8');
const referenced=[...indexSource.matchAll(/(?:src|href)="([^"?]+\.(?:js|css|webmanifest))/g)].map(match=>match[1]);
const bootModules=[...bootstrapSource.matchAll(/'([^']+\.js)'/g)].map(match=>match[1]);
const files=new Set(['index.html','manifest.webmanifest','sw.js','app-db.js','app-bootstrap.js',...referenced,...bootModules]);
for(const file of files){
  if(file.startsWith('data/')||file.startsWith('icons/')||file.startsWith('vendor/'))continue;
  await access(path.join(root,file));
  await cp(path.join(root,file),path.join(output,file));
}

for (const folder of folders) {
  await cp(path.join(root, folder), path.join(output, folder), { recursive: true });
}
await access(path.join(output,'data','lotes-mapa.geojson'));

const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(
  path.join(output, 'build-info.json'),
  JSON.stringify({
    name: packageInfo.name,
    version: packageInfo.version,
    builtAt: new Date().toISOString(),
    commit:process.env.GITHUB_SHA || 'local',
    target: 'web-capacitor'
  }, null, 2),
  'utf8'
);

const required = ['index.html', 'manifest.webmanifest', 'sw.js', 'app-bootstrap.js'];
for (const file of required) await access(path.join(output,file));

console.log(`Web preparada en ${output}`);
console.log(`Versión ${packageInfo.version}`);
