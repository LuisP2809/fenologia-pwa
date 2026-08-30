import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const read=file=>readFile(path.join(root,file),'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

const [packageText,index,updater,bootstrap,worker,evaluation,evaluationFlow,xlsx,supervisor,fileAnalysis,sourceGuard,database,security,admin,syncCore,sync,appsScript,platform,userAccess,map]=await Promise.all([
  read('package.json'),read('index.html'),read('app-updater-0.19.0.js'),read('app-bootstrap.js'),read('sw.js'),read('app-eval.js'),
  read('app-evaluation-flow.js'),read('app-xlsx-workflow.js'),read('app-supervisor.js'),
  read('app-supervisor-file-analysis.js'),read('app-analysis-source-guard.js'),read('app-db.js'),
  read('app-security.js'),read('app-admin-complete.js'),read('app-sync-core.js'),read('app-sync.js'),read('apps-script/Code.gs'),read('app-platform.js'),read('app-user-access-package.js'),read('app-map.js')
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
assert(index.includes('app-updater-0.19.0.js')&&updater.includes('activatePendingWorker'),'Falta el puente externo de recuperación para activar la actualización antes del bootstrap.');
assert(updater.includes("updateViaCache:'none'")&&updater.includes("./sw.js?recovery=0.19.0-cache-1"),'El puente de recuperación no fuerza la descarga del service worker nuevo.');
assert(!worker.includes('ignoreSearch:true'),'El service worker todavía permite que una versión anterior suplante archivos nuevos.');
assert(updater.includes("waiting.postMessage({type:'SKIP_WAITING'})")&&updater.includes('location.reload()'),'El puente no activa y recarga la nueva caché.');
assert(updater.includes("RESET_MARKER='fenologia-access-start-v2'")&&!updater.includes('deleteDatabase('),'El reinicio de accesos puede borrar evaluaciones locales.');
assert(updater.includes('LOCAL_KEYS.has(key)')&&!updater.includes("key.startsWith('fenologia-')"),'El reinicio no limita el borrado a credenciales conocidas.');
assert(!updater.includes('localStorage.clear()')&&!updater.includes('sessionStorage.clear()'),'El reinicio puede borrar datos ajenos alojados en el mismo origen.');

const modules=[...bootstrap.matchAll(/'([^']+\.js)'/g)].map(match=>match[1]);
for(const module of modules)await access(path.join(root,module));
for(const required of ['app-credentials.js','app-package-security.js','app-session-security.js'])assert(modules.includes(required),`Bootstrap no carga ${required}.`);
for(const required of ['app-sync-core.js','app-sync.js'])assert(modules.includes(required),`Bootstrap no carga ${required}.`);
assert(modules.includes('vendor/qrcode.js')&&modules.indexOf('vendor/qrcode.js')<modules.indexOf('app-user-access-package.js'),'El generador QR local no carga antes del flujo de activación.');
assert(modules.indexOf('app-sync-core.js')<modules.indexOf('app-sync.js'),'El módulo de sincronización carga antes de su núcleo.');
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
assert(database.includes('const DB_VERSION = 2'),'IndexedDB no actualizó su esquema para la cola.');
for(const store of ['syncQueue','syncReceipts','syncAlerts','syncArchive'])assert(database.includes(`'${store}'`),`IndexedDB no contiene ${store}.`);
assert(syncCore.includes('cleanupEligible')&&sync.includes('core().cleanupEligible'),'La limpieza automática no exige recibo y hash mediante una regla comprobable.');
assert(sync.includes("nav.querySelector('[data-view=\"export\"]')?.remove()")||sync.includes("nav.querySelector('[data-view=\"export\"]')"),'El Evaluador todavía conserva la navegación de exportación manual.');
assert(sync.includes("nav.querySelector('[data-view=\"cleanup-security\"]')?.remove()"),'El Administrador todavía expone la autorización antigua de limpieza.');
assert(platform.includes('platform-login-version')&&platform.includes('Versión ${PLATFORM_VERSION}'),'La pantalla de ingreso no muestra la versión instalada.');
assert(platform.includes("document.querySelector('.login-card')")&&platform.includes('announceUpdate(registration)'),'Una actualización pendiente no se ofrece en la pantalla de ingreso.');
assert(platform.includes("registration.waiting.postMessage({type:'SKIP_WAITING'})"),'La pantalla sin sesión no puede activar la actualización pendiente.');
assert(userAccess.includes('device-activation-form')&&userAccess.includes('qrSvg')&&userAccess.includes('create-activation'),'Falta la activación central mediante QR y código.');
assert(userAccess.includes('Solo puede usarse una vez')&&userAccess.includes('ACTIVATION_EXPIRED'),'El acceso temporal no explica o controla su uso único y vencimiento.');
assert(userAccess.includes('FenologiaAdmin.installActivatedUser')&&userAccess.includes('FenologiaSync.saveConfig'),'La activación no instala usuario, PIN local y token central en un solo paso.');
assert(admin.includes("SYSTEM_EPOCH = 'fresh-start-v2'")&&appsScript.includes("systemEpoch:'fresh-start-v2'"),'Los accesos no pertenecen a la nueva etapa del sistema.');
assert(admin.includes("payload.systemEpoch!==SYSTEM_EPOCH")&&admin.includes('quedó invalidado por el reinicio'),'La importación todavía permite accesos creados antes del reinicio.');
assert(admin.includes('id="first-admin-form"')&&admin.includes('bootstrapAdmin')&&appsScript.includes("registerSyncUser('ADM-001'")&&admin.includes('Administrador principal'),'Falta la creación guiada y única del primer Administrador.');
assert(sync.includes("new Set(['0.18.0','0.19.0'])"),'La versión 0.19.0 no conserva los perfiles 0.18.0 actuales.');
assert(sync.includes('legacyService:true')&&sync.includes('todavía debe actualizarse a 0.19.0'),'La transición al servicio 0.19.0 puede bloquear el envío de evaluaciones.');
assert(map.includes('getAnalysisRecords')&&!map.includes('records=state.records.filter(recordOk)'),'El mapa no consume el consolidado en línea compartido.');
assert(sync.includes("['map','charts','sync-monitor']")&&sync.includes('fenologia-remote-snapshot'),'Mapa y gráficos no se actualizan al recibir el consolidado.');
assert(admin.includes('centralSnapshot')&&admin.includes('applyCentralConfig')&&admin.includes('handleCentralDeactivation'),'La configuración administrativa no puede sincronizarse o aplicar una desactivación central.');
assert(index.includes('https://script.google.com')&&index.includes('https://script.googleusercontent.com'),'CSP no permite la respuesta firmada de Apps Script.');
assert(appsScript.includes('LockService.getScriptLock()'),'Apps Script no bloquea escrituras concurrentes.');
assert(appsScript.includes('REGISTRO_UUID')&&appsScript.includes('BANDEJA_ENTRADA'),'Apps Script no conserva idempotencia y recuperación.');
assert(appsScript.includes('CONFIG_CENTRAL')&&appsScript.includes('Usuario desactivado.'),'Apps Script no centraliza configuración y desactivaciones.');
assert(appsScript.includes('prepareInitialAdmin')&&appsScript.includes('prepareAdminRecovery')&&appsScript.includes('bootstrapAdminAction_')&&appsScript.includes('redeemActivationAction_'),'Apps Script no contiene el arranque, recuperación y activación temporal.');
assert(appsScript.includes('ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000')&&appsScript.includes('sha256Hex_(normalizeActivationCode_'),'Los códigos no vencen en 24 horas o no se guardan mediante huella.');
assert(appsScript.includes("clean_(item.userId).toUpperCase()===user.id")&&appsScript.includes('properties.deleteProperty(storedKey)'),'Generar un acceso nuevo no invalida códigos temporales anteriores del mismo usuario.');
assert(!appsScript.includes('JSON.stringify(body)'),'Apps Script guarda el token sin ocultar en la bandeja de entrada.');
assert(appsScript.includes("'FENOLOGIA','BIOMETRIA','PARAMETROS_ADICIONALES','METADATOS'"),'Apps Script no administra todas las hojas semanales de datos.');

console.log(`Integridad validada: ${modules.length} módulos, ${new Set(assets).size} recursos offline y cuadrante opcional.`);
