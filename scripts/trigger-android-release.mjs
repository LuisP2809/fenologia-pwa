import { writeFile } from 'node:fs/promises';

const timestamp = new Date().toISOString();
await writeFile('android-release-trigger.txt', `${timestamp}\n`, 'utf8');
console.log('Solicitud de compilación release preparada.');
console.log('Ahora ejecuta:');
console.log('  git add android-release-trigger.txt');
console.log('  git commit -m "build: generar Android release firmado"');
console.log('  git push');
