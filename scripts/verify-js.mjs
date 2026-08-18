import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files=(await readdir(process.cwd())).filter(file=>(file.startsWith('app-')||file==='sw.js')&&file.endsWith('.js')).sort();
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`Error de sintaxis en ${file}:\n${result.stderr||result.stdout}`);
}
console.log(`Sintaxis validada: ${files.length} archivos JavaScript.`);
