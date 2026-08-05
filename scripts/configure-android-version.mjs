import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const configPath = path.join(root, 'android-release.json');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

const release = JSON.parse(await readFile(configPath, 'utf8'));
const applicationId = String(release.applicationId || '').trim();
const versionName = String(release.versionName || '').trim();
const versionCode = Number(release.versionCode);

if (!/^([a-zA-Z][\w]*\.)+[a-zA-Z][\w]*$/.test(applicationId)) {
  throw new Error('applicationId inválido en android-release.json.');
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(versionName)) {
  throw new Error('versionName debe usar formato semántico, por ejemplo 0.12.1.');
}
if (!Number.isInteger(versionCode) || versionCode < 1) {
  throw new Error('versionCode debe ser un entero positivo.');
}

let gradle = await readFile(gradlePath, 'utf8');
const original = gradle;

gradle = gradle.replace(
  /(applicationId\s+)["'][^"']+["']/,
  `$1"${applicationId}"`
);
gradle = gradle.replace(
  /(versionCode\s+)\d+/,
  `$1${versionCode}`
);
gradle = gradle.replace(
  /(versionName\s+)["'][^"']+["']/,
  `$1"${versionName}"`
);

if (gradle === original) {
  throw new Error('No se encontraron los campos Android que debían actualizarse.');
}
if (!gradle.includes(`applicationId "${applicationId}"`)) {
  throw new Error('No se pudo confirmar applicationId en build.gradle.');
}
if (!gradle.includes(`versionCode ${versionCode}`)) {
  throw new Error('No se pudo confirmar versionCode en build.gradle.');
}
if (!gradle.includes(`versionName "${versionName}"`)) {
  throw new Error('No se pudo confirmar versionName en build.gradle.');
}

await writeFile(gradlePath, gradle, 'utf8');
console.log(`Android configurado: ${applicationId} · ${versionName} (${versionCode})`);
