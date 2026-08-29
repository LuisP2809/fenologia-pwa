import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const coreSource=await readFile('app-sync-core.js','utf8');
const coreContext={window:{},crypto:webcrypto,TextEncoder,structuredClone,Date,JSON,Math,Number,String,Set,Map};
vm.createContext(coreContext);
vm.runInContext(coreSource,coreContext,{filename:'app-sync-core.js'});
const core=coreContext.window.FenologiaSyncCore;

const serverSource=await readFile('apps-script/Code.gs','utf8');
const serverContext={Date,JSON,Math,Number,String,Array,Object,Set,Map,console};
vm.createContext(serverContext);
vm.runInContext(`${serverSource}\n;globalThis.__serverTest={FENOLOGIA_SYNC_VERSION,FENO_HEADERS,BIO_HEADERS,PARAM_HEADERS,weekKey_,businessKey_,canonicalString_,fenologyRow_,biometryRow_,classifyEntry_,validateCentralConfig_,normalizeActivationCode_,formatActivationCode_,normalizeUsername_};`,serverContext,{filename:'apps-script/Code.gs'});
const server=serverContext.__serverTest;

assert(core.VERSION==='0.18.0'&&server.FENOLOGIA_SYNC_VERSION==='0.18.0','Cliente y servidor no corresponden a 0.18.0.');
assert(core.isoWeekInfo('2021-01-01').key==='2020-S53','La semana ISO falla al cruzar de año.');
assert(core.isoWeekInfo('2024-12-30').key==='2025-S01','La primera semana ISO del año siguiente es incorrecta.');
assert(server.FENO_HEADERS.length===44,'La hoja FENOLOGIA no conserva 44 columnas.');
assert(server.BIO_HEADERS.length===124,'La hoja BIOMETRIA no conserva 124 columnas.');
assert(server.PARAM_HEADERS.length===18,'La hoja de parámetros no conserva 18 columnas.');
const centralConfiguration=server.validateCentralConfig_({
  type:'fenologia-central-config',version:1,systemEpoch:'fresh-start-v2',revision:2,updatedAt:'2026-08-19T12:00:00.000Z',
  users:[{id:'ADM-001',username:'admin',name:'Administrador',role:'Administrador',active:true,permissions:['admin'],pinHash:'NO-DEBE-SALIR'}],
  catalog:{lotesAgrupados:{}},assignments:{},campaigns:[],archivedLots:[]
});
assert(!('pinHash' in centralConfiguration.users[0]),'La configuración central expone credenciales locales.');
assert(centralConfiguration.users[0].username==='admin','La configuración central perdió el usuario de inicio de sesión.');
assert(server.normalizeActivationCode_('abcd-2345')==='ABCD2345'&&server.formatActivationCode_('ABCD2345')==='ABCD-2345','El código temporal no se normaliza de forma estable.');
assert(server.normalizeActivationCode_('ABOI-1234')===''&&server.normalizeUsername_('Eva.001')==='eva.001','La validación de código o usuario permite valores ambiguos.');

function sampleRecord(overrides={}){
  return {
    id:'EV-TEST-0001',date:'2026-08-17',campaign:'2026-2027',field:'CAMPO 1',farm:'FUNDO 1',module:'MOD 1',
    lot:'LOTE 1',quadrant:'',variety:'HASS',plant:1,evaluatorId:'EVA-001',evaluator:'Evaluador 1',
    E01:2,E11:3,f1_dl:10,f1_dea:8,parametrosAdicionales:{altura:{value:12,name:'Altura',section:'Planta',type:'integer',unit:'cm'}},
    createdAt:'2026-08-17T12:00:00.000Z',...overrides
  };
}

const optionalQuadrant=sampleRecord();
assert(core.businessKey(optionalQuadrant).includes('||1'),'La clave lógica no acepta cuadrante vacío.');
assert(core.businessKey(optionalQuadrant)===server.businessKey_(optionalQuadrant),'Cliente y servidor forman claves lógicas diferentes.');
assert(core.weekKey(optionalQuadrant)===server.weekKey_(optionalQuadrant),'Cliente y servidor enrutan a semanas diferentes.');
assert(core.canonicalString(optionalQuadrant)===server.canonicalString_(optionalQuadrant),'Cliente y servidor canonicalizan el contenido de forma diferente.');
assert(server.fenologyRow_(optionalQuadrant).length===44,'Una fila fenológica no tiene 44 valores.');
assert(server.biometryRow_(optionalQuadrant).length===124,'Una fila biométrica no tiene 124 valores.');

const firstEntry=await core.queueEntry(optionalQuadrant);
const unchangedEntry=await core.queueEntry(optionalQuadrant,firstEntry);
assert(firstEntry.revision===1&&unchangedEntry.revision===1,'Un reintento idéntico incrementa indebidamente la revisión.');
const editedEntry=await core.queueEntry({...optionalQuadrant,E01:5,updatedAt:'2026-08-17T13:00:00.000Z'},firstEntry);
assert(editedEntry.revision===2&&editedEntry.baseHash===firstEntry.contentHash,'Una edición no enlaza correctamente la revisión anterior.');

class LockedCentral{
  constructor(){this.records=new Map();this.business=new Map();this.tail=Promise.resolve();}
  submit(entry){
    const operation=this.tail.then(()=>{
      const stored=this.records.get(entry.id);
      const current=stored?{id:stored.id,hash:stored.contentHash,revision:stored.revision,status:'CONFIRMED'}:null;
      const logicalId=this.business.get(entry.businessKey);const logical=logicalId?{id:logicalId}:null;
      const decision=server.classifyEntry_(entry,current,logical);
      if(decision.status!=='accepted')return {status:decision.status,reason:decision.reason};
      this.records.set(entry.id,entry);this.business.set(entry.businessKey,entry.id);return {status:'accepted'};
    });
    this.tail=operation.then(()=>undefined,()=>undefined);return operation;
  }
}

const central=new LockedCentral();
const entries=[];
for(let day=0;day<6;day++){
  const date=new Date('2026-08-17T12:00:00Z');date.setUTCDate(date.getUTCDate()+day);
  for(let evaluator=1;evaluator<=5;evaluator++){
    for(let plant=1;plant<=80;plant++){
      const suffix=`${day+1}-${evaluator}-${plant}`;
      entries.push(await core.queueEntry(sampleRecord({
        id:`EV-${suffix}`,date:date.toISOString().slice(0,10),evaluatorId:`EVA-00${evaluator}`,evaluator:`Evaluador ${evaluator}`,
        plant,quadrant:plant%2?'':'Q1',E01:plant,createdAt:date.toISOString()
      })));
    }
  }
}
assert(entries.length===2400,'La simulación no contiene las 2,400 evaluaciones previstas.');
const mixed=entries.slice().sort((a,b)=>a.id.localeCompare(b.id)).reverse();
const firstResults=await Promise.all(mixed.map(entry=>central.submit(entry)));
assert(firstResults.every(result=>result.status==='accepted'),'Una carga válida fue rechazada durante la concurrencia simulada.');
assert(central.records.size===2400,'La central no conservó exactamente 2,400 UUID.');

const resendResults=await Promise.all(entries.filter((_,index)=>index%5===0).map(entry=>central.submit(entry)));
assert(resendResults.every(result=>result.status==='duplicate'),'Un reenvío idéntico no fue tratado como idempotente.');
assert(central.records.size===2400,'Los reenvíos crearon filas centrales adicionales.');

const logicalDuplicate=await core.queueEntry({...optionalQuadrant,id:'EV-OTHER-UUID'});
const revisionCentral=new LockedCentral();
await revisionCentral.submit(firstEntry);
assert((await revisionCentral.submit(logicalDuplicate)).status==='conflict','La clave lógica repetida con otro UUID no se bloqueó.');
assert((await revisionCentral.submit(editedEntry)).status==='accepted','Una edición válida no actualizó el UUID existente.');
const staleEdit=await core.queueEntry({...optionalQuadrant,E01:9,updatedAt:'2026-08-17T14:00:00.000Z'},firstEntry);
assert((await revisionCentral.submit(staleEdit)).status==='conflict','Una edición basada en una versión obsoleta no fue bloqueada.');

const receipt={id:firstEntry.id,contentHash:firstEntry.contentHash};
const syncedRecord={...optionalQuadrant,sync:{status:'synced',contentHash:firstEntry.contentHash}};
assert(core.cleanupEligible(syncedRecord,receipt,false,1,1),'Un registro confirmado y vencido no resulta elegible para limpieza.');
assert(!core.cleanupEligible(syncedRecord,receipt,true,2,1),'Un registro todavía en cola podría eliminarse.');
assert(!core.cleanupEligible(syncedRecord,{...receipt,contentHash:'otro'},false,2,1),'Un recibo con otro hash podría habilitar limpieza.');
assert(!core.cleanupEligible({...syncedRecord,sync:{status:'pending',contentHash:firstEntry.contentHash}},receipt,false,2,1),'Un registro pendiente podría eliminarse.');
assert(!core.cleanupEligible(syncedRecord,receipt,false,0,1),'Un registro de la semana activa podría eliminarse.');

const syncSource=await readFile('app-sync.js','utf8');
const dbSource=await readFile('app-db.js','utf8');
assert(syncSource.includes("mode:'no-cors'")&&syncSource.includes("signedParams('status',{requestId})"),'Falta la confirmación posterior al POST de Apps Script.');
assert(syncSource.includes('record.sync?.contentHash===receipt.contentHash')||syncSource.includes('cleanupEligible'),'La limpieza no exige coincidencia de hash.');
assert(dbSource.includes("'syncQueue'")&&dbSource.includes("'syncReceipts'"),'IndexedDB no contiene cola y recibos separados.');
assert(serverSource.includes('LockService.getScriptLock()'),'El servidor no serializa escrituras concurrentes.');
assert(serverSource.includes("'PROCESSING'")&&serverSource.includes("'CONFIRMED'"),'El servidor no conserva estados recuperables de escritura.');
assert(serverSource.includes('ensureRange_(sheet,row,values.length)')&&serverSource.includes('insertRowsAfter'),'El archivo semanal no amplía su cuadrícula antes de superar 1,000 filas.');
assert(serverSource.includes('CONFIG_CENTRAL')&&serverSource.includes('publishCentralConfigLocked_'),'El servidor no publica la configuración operativa central.');

console.log('Sincronización validada: 2,400 evaluaciones, 480 reenvíos, edición, conflicto, semanas ISO, cuadrante opcional y limpieza confirmada.');
