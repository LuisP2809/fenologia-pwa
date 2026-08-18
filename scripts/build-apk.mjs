import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const androidDir = path.join(root, 'android');
await access(androidDir).catch(() => {
  throw new Error('La carpeta android no existe. Ejecuta primero: npm run android:init');
});

const isWindows = process.platform === 'win32';
const command = isWindows ? 'gradlew.bat' : './gradlew';
const child = spawn(command, ['assembleDebug'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWindows
});

const code = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', resolve);
});

if (code !== 0) throw new Error(`Gradle terminó con código ${code}.`);
console.log('APK generado en android/app/build/outputs/apk/debug/app-debug.apk');
