import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const settings=new Map();
const stores={syncQueue:new Map(),syncReceipts:new Map(),syncAlerts:new Map(),syncArchive:new Map()};
const events=[];
const downloads=[];
const appliedConfigurations=[];
let localCentralSnapshot=null;
const app={innerHTML:''};
const document={
  visibilityState:'visible',head:{appendChild(){}},
  querySelector(){return null;},querySelectorAll(){return [];},
  createElement(){return {remove(){},set src(value){this._src=value;},get src(){return this._src;}};},
  addEventListener(type,listener){events.push({type,listener});}
};
const windowObject={
  addEventListener(type,listener){events.push({type,listener});},
  dispatchEvent(event){events.push({type:event.type,detail:event.detail,dispatched:true});},
  FenologiaFileAnalysis:{getChartRecords:()=>[]},
  FenologiaAdmin:{
    centralSnapshot:()=>localCentralSnapshot?structuredClone(localCentralSnapshot):null,
    async applyCentralConfig(snapshot){localCentralSnapshot=structuredClone(snapshot);appliedConfigurations.push(structuredClone(snapshot));return {applied:true};},
    async handleCentralDeactivation(){state.session=null;return true;}
  }
};
const state={session:{id:'EVA-001',name:'Evaluador 1',role:'Evaluador'},records:[],view:'home',selectedRecordId:null};
let saveCount=0;
const context={
  window:windowObject,document,app,state,navigator:{onLine:true},developmentMode:true,
  crypto:webcrypto,TextEncoder,structuredClone,Date,JSON,Math,Number,String,Set,Map,URL,Promise,
  CustomEvent:class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
  FormData:class FormData{},Blob,
  setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},
  console,
  today:()=> '2026-08-18',
  save:async()=>{saveCount++;},
  saveEvaluation:async()=>true,
  render:()=>{app.innerHTML='BASE';},
  shell:value=>`SHELL:${value}`,
  titleBlock:(kicker,title,text,action='')=>`<header>${kicker}|${title}|${text}|${action}</header>`,
  metric:(value,label)=>`<metric>${value}|${label}</metric>`,
  icons:{sync:'sync',alert:'alert',check:'check',cloud:'cloud',clipboard:'clipboard',file:'file'},
  esc:value=>String(value??'').replace(/[&<>"']/g,''),
  isEvaluator:()=>state.session?.role==='Evaluador',
  isSupervisor:()=>['Supervisor','Administrador'].includes(state.session?.role),
  isAdmin:()=>state.session?.role==='Administrador',
  showToast(){},downloadFile:async(name,content,type)=>{downloads.push({name,content,type});return {ok:true};}
};
windowObject.FenologiaDB={
  async getSetting(key){return settings.has(key)?structuredClone(settings.get(key)):null;},
  async setSetting(key,value){settings.set(key,structuredClone(value));},
  async putSyncItem(store,item){stores[store].set(store==='syncArchive'?item.weekKey:item.id,structuredClone(item));return item;},
  async getSyncItem(store,key){return stores[store].has(key)?structuredClone(stores[store].get(key)):null;},
  async listSyncItems(store){return [...stores[store].values()].map(value=>structuredClone(value));},
  async deleteSyncItem(store,key){stores[store].delete(key);}
};
vm.createContext(context);
vm.runInContext(await readFile('app-sync-core.js','utf8'),context,{filename:'app-sync-core.js'});
vm.runInContext(await readFile('app-sync.js','utf8'),context,{filename:'app-sync.js'});
await windowObject.FenologiaSync.ready;
const preparedProfile=await windowObject.FenologiaSync.createProfile({
  endpoint:'https://script.google.com/macros/s/PRUEBA/exec',evaluatorId:'EVA-001',evaluator:'Evaluador 1',role:'Evaluador',deviceToken:'123456789012345678901234'
});
assert(preparedProfile.version==='0.17.0'&&preparedProfile.evaluatorId==='EVA-001','El asistente no generó el perfil con el usuario autocompletado.');
assert(downloads.at(-1)?.name==='Perfil-Sync-EVA-001.json','El asistente no descargó el nombre de perfil esperado.');
const invalidatedProfile={...preparedProfile,version:'0.15.1'};
let invalidatedRejected=false;
try{await windowObject.FenologiaSync.installProfile({size:JSON.stringify(invalidatedProfile).length,text:async()=>JSON.stringify(invalidatedProfile)});}catch{invalidatedRejected=true;}
assert(invalidatedRejected,'Un perfil anterior al reinicio todavía pudo instalarse.');
const compatibleProfile={...preparedProfile,version:'0.16.0'};
await windowObject.FenologiaSync.installProfile({size:JSON.stringify(compatibleProfile).length,text:async()=>JSON.stringify(compatibleProfile)});
assert(windowObject.FenologiaSync.getConfig().deviceToken===preparedProfile.deviceToken,'El perfil 0.16.0 instalado dejó de ser compatible.');
let wrongOwnerRejected=false;
try{await windowObject.FenologiaSync.installProfile({size:100,text:async()=>JSON.stringify({...preparedProfile,evaluatorId:'EVA-999'})});}catch{wrongOwnerRejected=true;}
assert(wrongOwnerRejected,'El dispositivo aceptó un perfil perteneciente a otro usuario.');
await windowObject.FenologiaSync.saveConfig({enabled:true,transport:'mock',cleanupEnabled:false,retentionWeeks:1});

const record={
  id:'EV-RUNTIME-001',date:'2026-08-10',campaign:'2026-2027',field:'CAMPO 1',farm:'FUNDO 1',module:'M1',lot:'L1',
  quadrant:'',variety:'HASS',plant:1,evaluatorId:'EVA-001',evaluator:'Evaluador 1',E01:2,createdAt:'2026-08-10T12:00:00.000Z'
};
state.records.push(record);state.selectedRecordId=record.id;
await windowObject.FenologiaSync.enqueueRecord(record);
assert(stores.syncQueue.size===1&&record.sync.status==='pending','El guardado local no creó la cola pendiente.');
await windowObject.FenologiaSync.processQueue();
assert(stores.syncQueue.size===0&&stores.syncReceipts.size===1,'La confirmación no movió la cola a recibos.');
assert(record.sync.status==='synced'&&record.sync.receiptId,'El registro no recibió estado confirmado.');

record.E01=7;record.updatedAt='2026-08-10T13:00:00.000Z';
await windowObject.FenologiaSync.enqueueRecord(record);
const revisionEntry=stores.syncQueue.get(record.id);
assert(revisionEntry.revision===2&&revisionEntry.baseHash,'La edición no creó una revisión enlazada.');
await windowObject.FenologiaSync.processQueue();
assert(stores.syncReceipts.get(record.id).revision===2,'La revisión editada no quedó confirmada.');

const conflict={...record,id:'EV-RUNTIME-CONFLICT',createdAt:'2026-08-10T14:00:00.000Z',updatedAt:undefined,sync:undefined};
state.records.push(conflict);state.selectedRecordId=conflict.id;
await windowObject.FenologiaSync.enqueueRecord(conflict);
await windowObject.FenologiaSync.processQueue();
assert(stores.syncQueue.get(conflict.id)?.status==='conflict','El duplicado lógico no quedó bloqueado para revisión.');
assert(conflict.sync.status==='conflict'&&stores.syncAlerts.size===1,'El conflicto no se reflejó en el registro y las alertas.');

state.view='sync-status';context.render();
assert(app.innerHTML.includes('COLA LOCAL')&&app.innerHTML.includes('Revisión necesaria'),'La pantalla del Evaluador no muestra la cola o el conflicto.');
assert(!app.innerHTML.includes('Limpiar datos'),'La pantalla de sincronización volvió a ofrecer limpieza manual.');

await windowObject.FenologiaSync.saveConfig({enabled:true,transport:'mock',cleanupEnabled:true,retentionWeeks:1});
const cleanup=await windowObject.FenologiaSync.runAutomaticCleanup();
assert(cleanup.removed===1&&!state.records.some(item=>item.id===record.id),'La limpieza no retiró únicamente la copia confirmada y vencida.');
assert(state.records.some(item=>item.id===conflict.id),'La limpieza retiró un conflicto pendiente.');

state.session={id:'SUP-001',name:'Supervisor 1',role:'Supervisor'};state.view='sync-monitor';
await windowObject.FenologiaSync.refreshRemote();context.render();
assert(windowObject.FenologiaSync.state.remoteRecords.length===1,'El Supervisor no recibió la revisión central activa.');
assert(app.innerHTML.includes('ARCHIVOS SEMANALES')&&app.innerHTML.includes('Equipo y sincronización'),'El monitor del Supervisor no contiene semanas y equipo.');
assert(stores.syncArchive.has('__ACTIVE_REMOTE_SNAPSHOT__'),'La semana central no quedó disponible para un reinicio offline.');
windowObject.FenologiaSync.state.remoteRecords=[];
await events.find(event=>event.type==='fenologia-db-external-change'&&event.listener)?.listener();
assert(windowObject.FenologiaSync.state.remoteRecords.length===1,'El caché offline no restauró la semana activa del Supervisor.');

state.session={id:'ADM-001',name:'Administrador 1',role:'Administrador'};state.view='sync-control';context.render();
assert(app.innerHTML.includes('sync-config-form')&&app.innerHTML.includes('Preparar dispositivo'),'El Administrador no dispone de conexión y del asistente por usuario.');
assert(!app.innerHTML.includes('id="sync-profile-form"'),'La configuración todavía duplica el formulario manual de perfiles.');
assert(app.innerHTML.includes('cola pendiente, conflictos y registros sin recibo nunca se eliminan'),'El panel no explica la protección de limpieza.');
localCentralSnapshot={
  type:'fenologia-central-config',version:1,systemEpoch:'fresh-start-v1',revision:3,updatedAt:'2026-08-19T12:00:00.000Z',
  users:[{id:'ADM-001',name:'Administrador 1',role:'Administrador',active:true,permissions:['admin']},{id:'SUP-001',name:'Supervisor 1',role:'Supervisor',active:true,permissions:['map','charts']}],
  catalog:{lotesAgrupados:{'CAMPO 1':{'FUNDO 1':{M1:['L1']}}},variedadesPorCampo:{'CAMPO 1':['HASS']}},assignments:{L1:['HASS']},campaigns:[],archivedLots:[]
};
await windowObject.FenologiaSync.publishCentralConfig(localCentralSnapshot);
assert(windowObject.FenologiaSync.state.remoteConfig?.revision===3,'El Administrador no publicó la configuración central en el simulador.');
state.session={id:'SUP-001',name:'Supervisor 1',role:'Supervisor'};
localCentralSnapshot={...localCentralSnapshot,revision:2,updatedAt:'2026-08-18T12:00:00.000Z'};
await windowObject.FenologiaSync.refreshCentralConfig();
assert(appliedConfigurations.at(-1)?.revision===3&&appliedConfigurations.at(-1)?.catalog.variedadesPorCampo['CAMPO 1'][0]==='HASS','El Supervisor no aplicó el catálogo central más reciente.');
assert(saveCount>0,'Los cambios de estado no se persistieron localmente.');

console.log('Runtime de sincronización validado: cola local, confirmación, edición, conflicto, limpieza y vistas por rol.');
