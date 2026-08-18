import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const read=file=>readFile(path.join(root,file),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

const [packageText,index,bootstrap,worker,evaluation,evaluationFlow,xlsx,supervisor,fileAnalysis,sourceGuard,database,security,admin]=await Promise.all([
  read('package.json'),read('index.html'),read('app-bootstrap.js'),read('sw.js'),read('app-eval.js'),
  read('app-evaluation-flow.js'),read('app-xlsx-workflow.js'),read('app-supervisor.js'),
  read('app-supervisor-file-analysis.js'),read('app-analysis-source-guard.js'),read('app-db.js'),
  read('app-security.js'),read('app-admin-complete.js')
]);
const packageInfo=JSON.parse(packageText);
const version=packageInfo.version;

assert(evaluation.includes('Cuadrante (opcional)'),'La captura no identifica el cuadrante como opcional.');
assert(!/name="quadrant"\s+required/.test(evaluation),'El formulario base todavía exige cuadrante.');
assert(evaluationFlow.includes('quadrant.required=false'),'Falta el resguardo de cuadrante opcional en el flujo final.');
const requiredBase=xlsx.match(/const REQUIRED_BASE\s*=\s*\[([^\]]+)\]/s)?.[1]||'';
assert(!requiredBase.includes('CUADRANTE'),'La importación XLSX todavía exige CUADRANTE.');
assert(!supervisor.includes("missing.push('CUADRANTE')"),'La validación de supervisor todavía exige CUADRANTE.');

assert(evaluationFlow.includes('FenologiaDynamicParameters?.collect'),'Los parámetros dinámicos no se recogen en el guardado final.');
assert(evaluationFlow.includes('await save()'),'El flujo final no espera la persistencia local.');
assert(!database.includes('recordsStore.clear()'),'IndexedDB todavía realiza un borrado total antes de guardar.');
assert(!/state\.records\s*=/.test(fileAnalysis),'El análisis de archivos todavía reemplaza los registros persistentes.');
assert(!/state\.records\s*=/.test(sourceGuard),'La protección de análisis todavía intercambia el estado persistente.');
assert(!fileAnalysis.includes('eraseLegacyHistoryStorage'),'El analizador todavía borra historial heredado.');
assert(security.includes("'verified-backup-v1'"),'Falta la copia interna verificada.');
assert(security.includes('restore-internal-backup'),'Falta la recuperación de la copia interna.');

for(const source of [index,bootstrap,worker])assert(source.includes(version),`La versión ${version} no está sincronizada en un archivo de publicación.`);
assert(index.includes('Content-Security-Policy'),'Falta la política de seguridad de contenido.');
assert(!index.includes('onclick='),'index.html contiene manejadores en línea incompatibles con CSP.');

const modules=[...bootstrap.matchAll(/'([^']+\.js)'/g)].map(match=>match[1]);
for(const module of modules)await access(path.join(root,module));
for(const required of ['app-credentials.js','app-package-security.js','app-session-security.js'])assert(modules.includes(required),`Bootstrap no carga ${required}.`);
assert(modules.indexOf('app-package-security.js')<modules.indexOf('app-admin-complete.js'),'La verificación de paquetes carga demasiado tarde.');

const assetBlock=worker.match(/const ASSETS=\[([\s\S]*?)\];/)?.[1]||'';
const assets=[...assetBlock.matchAll(/(?:versioned\()?['"](\.\/[^'"?]+)['"]/g)].map(match=>match[1]);
for(const asset of new Set(assets)){
  if(asset==='./')continue;
  await access(path.join(root,asset.replace(/^\.\//,'')));
}

const manifest=JSON.parse(await read('manifest.webmanifest'));
assert(manifest.icons.some(icon=>icon.type==='image/png'&&icon.sizes==='192x192'),'El manifiesto no incluye PNG de 192 px.');
assert(manifest.icons.some(icon=>icon.type==='image/png'&&icon.sizes==='512x512'),'El manifiesto no incluye PNG de 512 px.');
assert(manifest.icons.some(icon=>icon.type==='image/png'&&icon.purpose==='maskable'),'El manifiesto no incluye PNG maskable.');
assert(admin.includes("version:2")&&admin.includes('FenologiaPackageSecurity.sign'),'Los paquetes administrativos no están firmados en formato v2.');

console.log(`Integridad validada: ${modules.length} módulos, ${new Set(assets).size} recursos offline y cuadrante opcional.`);
