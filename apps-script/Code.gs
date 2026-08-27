/* Fenología 0.17.0 · servicio central Google Sheets/Drive.
 * Este archivo se instala como un proyecto independiente de Google Apps Script.
 * No contiene tokens, IDs de Drive ni datos reales.
 */

const FENOLOGIA_SYNC_VERSION = '0.17.0';
const CONTROL_ID_PROPERTY = 'FENOLOGIA_CONTROL_SPREADSHEET_ID';
const ROOT_FOLDER_ID_PROPERTY = 'FENOLOGIA_ROOT_FOLDER_ID';
const PENDING_ALERT_HOURS_PROPERTY = 'FENOLOGIA_PENDING_ALERT_HOURS';
const FILE_WARNING_PERCENT_PROPERTY = 'FENOLOGIA_FILE_WARNING_PERCENT';
const MAX_BATCH_SIZE = 25;
const MAX_SNAPSHOT_RECORDS = 5000;
const SHEET_CELL_LIMIT = 10000000;
let runtimeControlCache=null;
let runtimeRootCache=null;
let runtimeWeekCache={};

const FENO_HEADERS = [
  'ID DATA','FECHA','SEMANA','MES','AÑO','CAMPO','FUNDO','MODULO','TURNO-LOTE','CUADRANTE','VARIEDAD','# PLANTA',
  'YEMAS (E01)','YEMAS (E02)','YEMAS (E03)','YEMAS (E04)','YEMAS (E05)','YEMAS (E06)','YEMAS (E07)','YEMAS (E08)','YEMAS (E09)',
  'PANICULA CERRADA (E10)','PANICULA ABIERTA (E11)','PANICULAS CUAJADAS (E12)','TAMAÑO ACEITUNA (E13)','FRUTO 1 (E14)','FRUTO 2 (E15)','FRUTO 3 (E16)','FRUTO 4 (E17)',
  'YEMAS VEGETATIVAS','YEMAS FLORALES','YEMAS DUDOSAS','SENESCENCIA','BROTE (E1 ROJO)','BROTE (E2 VERDE PALIDO)','BROTE (E3 VERDE OSCURO)',
  'PANICULA INDETERMINADA','PANICULA DETERMINADA','CONTEO DE PANICULAS','CONTEO DE CUAJAS/PANICULAS','PANICULAS SIN CUAJAR','PANICULA BUENA','PANICULA MEDIA','PANICULA MALA'
];
const BIO_HEADERS = ['ID DATA','FECHA','SEMANA','MES','AÑO','CAMPO','FUNDO','MODULO','TURNO-LOTE','CUADRANTE','VARIEDAD','# PLANTA']
  .concat(Array.from({length:35},function(_,index){
    const number=String(index+1).padStart(2,'0');
    return ['B.F.'+number+' (D.L)','B.F.'+number+' (D.EA)','B.F.'+number+' (D.EB)'];
  }).reduce(function(all,row){return all.concat(row);},[]))
  .concat(['CAIDA DE FRUTA (F1)','CAIDA DE FRUTA (F2)','CAIDA DE FRUTA (F3)','CAIDA DE FRUTA (F4)','FRUTA ANILLADA','FRUTA DESIDRATADA','FRUTOS PINTONES']);
const PARAM_HEADERS = ['ID DATA','FECHA','SEMANA','MES','AÑO','CAMPO','FUNDO','MODULO','TURNO-LOTE','CUADRANTE','VARIEDAD','EVALUADOR','PARAMETRO ID','PARAMETRO','SECCION','TIPO','VALOR','UNIDAD'];
const META_HEADERS = ['ID DATA','CAMPAÑA','EVALUADOR ID','EVALUADOR','SEMANA ARCHIVO','HASH','REVISIÓN','RECIBO','SINCRONIZADO','ESTADO'];
const AUDIT_HEADERS = ['FECHA HORA','EVENTO','ID DATA','EVALUADOR ID','SEMANA ARCHIVO','REVISIÓN','HASH','DETALLE'];

const CONTROL_HEADERS = {
  USUARIOS_SYNC:['EVALUADOR ID','NOMBRE','ROL','TOKEN HASH','ACTIVO','CREADO','ÚLTIMO ACCESO'],
  INDICE_GENERAL:['SEMANA ARCHIVO','CAMPAÑA','AÑO-SEMANA','ARCHIVO ID','ARCHIVO','URL','ESTADO','REGISTROS','CREADO','ACTUALIZADO','CELDAS ASIGNADAS','CAPACIDAD %'],
  REGISTRO_UUID:['UUID','CLAVE LÓGICA','HASH','REVISIÓN','SEMANA ARCHIVO','ARCHIVO ID','RECIBO','SINCRONIZADO','EVALUADOR ID','PAYLOAD JSON','ESTADO','ACTUALIZADO'],
  DISPOSITIVOS:['DISPOSITIVO ID','EVALUADOR ID','NOMBRE','ROL','ÚLTIMO CONTACTO','PENDIENTES','VERSIÓN APP','ESTADO'],
  ALERTAS:['ALERTA ID','CLAVE','TIPO','MENSAJE','EVALUADOR ID','SEMANA ARCHIVO','ESTADO','CREADO','RESUELTO'],
  BANDEJA_ENTRADA:['SOLICITUD ID','EVALUADOR ID','RECIBIDO','ESTADO','PAYLOAD JSON','RESULTADOS JSON','ERROR','PROCESADO'],
  CONFIG_CENTRAL:['CLAVE','REVISIÓN','HASH','CONFIGURACIÓN JSON','ACTUALIZADO','ACTUALIZADO POR']
};

function setupFenologia(){
  const properties=PropertiesService.getScriptProperties();
  let root;
  const savedFolderId=properties.getProperty(ROOT_FOLDER_ID_PROPERTY);
  try{if(savedFolderId)root=DriveApp.getFolderById(savedFolderId);}catch(error){root=null;}
  if(!root){root=DriveApp.createFolder('FENOLOGIA - BASE CENTRAL');properties.setProperty(ROOT_FOLDER_ID_PROPERTY,root.getId());}

  let control;
  const savedControlId=properties.getProperty(CONTROL_ID_PROPERTY);
  try{if(savedControlId)control=SpreadsheetApp.openById(savedControlId);}catch(error){control=null;}
  if(!control){
    control=SpreadsheetApp.create('FENOLOGIA_CONTROL_0_17_0');
    DriveApp.getFileById(control.getId()).moveTo(root);
    properties.setProperty(CONTROL_ID_PROPERTY,control.getId());
  }
  Object.keys(CONTROL_HEADERS).forEach(function(name){ensureSheet_(control,name,CONTROL_HEADERS[name]);});
  const defaultSheet=control.getSheetByName('Sheet1')||control.getSheetByName('Hoja 1');
  if(defaultSheet&&control.getSheets().length>1)control.deleteSheet(defaultSheet);
  if(!properties.getProperty(PENDING_ALERT_HOURS_PROPERTY))properties.setProperty(PENDING_ALERT_HOURS_PROPERTY,'4');
  if(!properties.getProperty(FILE_WARNING_PERCENT_PROPERTY))properties.setProperty(FILE_WARNING_PERCENT_PROPERTY,'70');
  return {version:FENOLOGIA_SYNC_VERSION,folderId:root.getId(),folderUrl:root.getUrl(),controlId:control.getId(),controlUrl:control.getUrl()};
}

function registerSyncUser(evaluatorId,name,role,plainToken){
  resetRuntimeCaches_();
  setupFenologia();
  const id=clean_(evaluatorId).toUpperCase();
  const safeRole=clean_(role);
  if(!id||!name)throw new Error('Indica el ID y el nombre del usuario.');
  if(['Evaluador','Supervisor','Administrador'].indexOf(safeRole)<0)throw new Error('El rol no es válido.');
  const token=clean_(plainToken)||generateToken_();
  if(token.length<24)throw new Error('El token debe tener al menos 24 caracteres.');
  const sheet=control_().getSheetByName('USUARIOS_SYNC');
  const rows=sheetValues_(sheet);
  const rowIndex=rows.findIndex(function(row,index){return index>0&&clean_(row[0]).toUpperCase()===id;});
  const created=rowIndex>0?(rows[rowIndex][5]||new Date()):new Date();
  const values=[id,clean_(name),safeRole,sha256Hex_(token),true,created,''];
  if(rowIndex>0)sheet.getRange(rowIndex+1,1,1,values.length).setValues([values]);else sheet.appendRow(values);
  return {version:FENOLOGIA_SYNC_VERSION,evaluatorId:id,name:clean_(name),role:safeRole,deviceToken:token,warning:'Guarda este token de forma segura; no vuelve a mostrarse automáticamente.'};
}

function provisionSyncUserFromProperties(){
  const properties=PropertiesService.getScriptProperties();
  const id=clean_(properties.getProperty('FENOLOGIA_PROVISION_ID'));
  const name=clean_(properties.getProperty('FENOLOGIA_PROVISION_NAME'));
  const role=clean_(properties.getProperty('FENOLOGIA_PROVISION_ROLE'));
  if(!id||!name||!role)throw new Error('Configura FENOLOGIA_PROVISION_ID, FENOLOGIA_PROVISION_NAME y FENOLOGIA_PROVISION_ROLE en las propiedades del proyecto.');
  const profile=registerSyncUser(id,name,role);
  properties.deleteProperty('FENOLOGIA_PROVISION_ID');
  properties.deleteProperty('FENOLOGIA_PROVISION_NAME');
  properties.deleteProperty('FENOLOGIA_PROVISION_ROLE');
  console.log('PERFIL_SYNC='+JSON.stringify(profile));
  return profile;
}

function revokeSyncUser(evaluatorId){
  resetRuntimeCaches_();
  const id=clean_(evaluatorId).toUpperCase();
  const sheet=control_().getSheetByName('USUARIOS_SYNC');
  const rows=sheetValues_(sheet);
  const rowIndex=rows.findIndex(function(row,index){return index>0&&clean_(row[0]).toUpperCase()===id;});
  if(rowIndex<1)return false;
  sheet.getRange(rowIndex+1,5).setValue(false);
  return true;
}

function doPost(event){
  try{
    resetRuntimeCaches_();
    const body=JSON.parse(event&&event.postData&&event.postData.contents||'{}');
    if(['submit','resolve-alert','publish-config'].indexOf(body.action)<0)return jsonOutput_({ok:false,message:'Acción no permitida.'});
    const lock=LockService.getScriptLock();
    lock.waitLock(30000);
    try{
      const result=body.action==='submit'?submitLocked_(body):body.action==='resolve-alert'?resolveAlertLocked_(body):publishCentralConfigLocked_(body);
      return jsonOutput_(result);
    }finally{lock.releaseLock();}
  }catch(error){
    return jsonOutput_({ok:false,message:cleanError_(error)});
  }
}

function resolveAlertLocked_(body){
  const user=authenticatePost_(body);
  if(['Supervisor','Administrador'].indexOf(user.role)<0)throw new Error('El perfil no puede resolver alertas centrales.');
  const id=clean_(body.alertId);if(!id)throw new Error('Falta el identificador de alerta.');
  const sheet=control_().getSheetByName('ALERTAS');const row=findRowByValue_(sheet,1,id);
  if(!row)return {ok:true,alertId:id,status:'already-resolved'};
  sheet.getRange(row,7).setValue('RESOLVED');sheet.getRange(row,9).setValue(new Date());touchUser_(user);
  return {ok:true,alertId:id,status:'resolved'};
}

function publishCentralConfigLocked_(body){
  const user=authenticatePost_(body);
  if(user.role!=='Administrador')throw new Error('Solo un Administrador puede publicar la configuración central.');
  const configuration=validateCentralConfig_(body.configuration);
  const actor=configuration.users.filter(function(item){return item.id===user.id;})[0];
  if(!actor||actor.role!=='Administrador'||actor.active!==true)throw new Error('El Administrador que publica debe permanecer activo en la configuración.');
  const hash=sha256Hex_(canonicalString_(configuration));
  const sheet=control_().getSheetByName('CONFIG_CENTRAL');
  const current=currentCentralConfig_();
  if(current&&current.hash===hash){applyCentralUsers_(configuration.users);touchUser_(user);return {ok:true,status:'duplicate',revision:current.revision,hash:current.hash};}
  if(current&&configuration.revision<=current.revision)throw new Error('La configuración central tiene una revisión más reciente o diferente.');
  const json=JSON.stringify(configuration);
  const values=['ACTIVE',configuration.revision,hash,json,new Date(),user.id];
  if(current)sheet.getRange(current.row,1,1,values.length).setValues([values]);else sheet.appendRow(values);
  applyCentralUsers_(configuration.users);
  touchUser_(user);
  return {ok:true,status:'published',revision:configuration.revision,hash:hash,updatedAt:new Date().toISOString()};
}

function centralConfigSnapshot_(user){
  const current=currentCentralConfig_();
  touchUser_(user);
  if(!current)return {ok:true,available:false,version:FENOLOGIA_SYNC_VERSION};
  return {ok:true,available:true,version:FENOLOGIA_SYNC_VERSION,revision:current.revision,hash:current.hash,updatedAt:current.updatedAt,configuration:current.configuration};
}

function currentCentralConfig_(){
  const sheet=control_().getSheetByName('CONFIG_CENTRAL');
  const rows=sheetValues_(sheet);
  for(let index=1;index<rows.length;index++){
    if(clean_(rows[index][0])!=='ACTIVE')continue;
    const json=clean_(rows[index][3]);
    if(!json)return null;
    return {row:index+1,revision:Number(rows[index][1]||0),hash:clean_(rows[index][2]),configuration:JSON.parse(json),updatedAt:dateIso_(rows[index][4]),updatedBy:clean_(rows[index][5])};
  }
  return null;
}

function validateCentralConfig_(value){
  if(!value||typeof value!=='object'||value.type!=='fenologia-central-config'||Number(value.version)!==1)throw new Error('La configuración central no es válida.');
  if(clean_(value.systemEpoch)!=='fresh-start-v1')throw new Error('La configuración pertenece a una etapa anterior del sistema.');
  const revision=Number(value.revision||0);
  if(!Number.isInteger(revision)||revision<1)throw new Error('La revisión de configuración no es válida.');
  if(!Array.isArray(value.users)||!value.users.length)throw new Error('La configuración no contiene usuarios.');
  const seen={};
  const users=value.users.map(function(item){
    const id=clean_(item&&item.id).toUpperCase();const name=clean_(item&&item.name);const role=clean_(item&&item.role);
    if(!/^[A-Z0-9_-]{3,40}$/.test(id)||!name)throw new Error('La configuración contiene un usuario incompleto.');
    if(seen[id])throw new Error('La configuración repite el usuario '+id+'.');seen[id]=true;
    if(['Evaluador','Supervisor','Administrador'].indexOf(role)<0)throw new Error('La configuración contiene un rol no válido.');
    const permissions=Array.isArray(item.permissions)?item.permissions.map(clean_).filter(Boolean).slice(0,20):[];
    return {id:id,name:name.slice(0,120),role:role,active:item.active!==false,permissions:permissions};
  });
  const cloneValue=function(input,fallback){try{return JSON.parse(JSON.stringify(input===undefined?fallback:input));}catch(error){throw new Error('La configuración contiene datos que no se pueden guardar.');}};
  const result={
    type:'fenologia-central-config',version:1,systemEpoch:'fresh-start-v1',revision:revision,
    updatedAt:clean_(value.updatedAt)||new Date().toISOString(),users:users,
    catalog:cloneValue(value.catalog,{}),assignments:cloneValue(value.assignments,{}),
    campaigns:cloneValue(value.campaigns,[]),archivedLots:cloneValue(value.archivedLots,[])
  };
  const json=JSON.stringify(result);
  if(json.length>45000)throw new Error('La configuración central supera el tamaño seguro de una celda de Google Sheets.');
  return result;
}

function applyCentralUsers_(users){
  const byId={};users.forEach(function(user){byId[user.id]=user;});
  const sheet=control_().getSheetByName('USUARIOS_SYNC');
  const rows=sheetValues_(sheet);
  for(let index=1;index<rows.length;index++){
    const id=clean_(rows[index][0]).toUpperCase();if(!id)continue;
    const central=byId[id];
    if(central){sheet.getRange(index+1,2).setValue(central.name);sheet.getRange(index+1,3).setValue(central.role);sheet.getRange(index+1,5).setValue(central.active);}
    else sheet.getRange(index+1,5).setValue(false);
  }
}

function doGet(event){
  resetRuntimeCaches_();
  const params=event&&event.parameter||{};
  const callback=clean_(params.callback);
  let response;
  try{
    const user=authenticateSignedGet_(params);
    if(params.action==='status')response=statusByRequest_(params,user);
    else if(params.action==='snapshot')response=snapshot_(params,user);
    else if(params.action==='config')response=centralConfigSnapshot_(user);
    else response={ok:false,message:'Acción no permitida.'};
  }catch(error){response={ok:false,message:cleanError_(error)};}
  return callback?jsonpOutput_(callback,response):jsonOutput_(response);
}

function submitLocked_(body){
  const user=authenticatePost_(body);
  const entries=Array.isArray(body.entries)?body.entries:[];
  if(!entries.length||entries.length>MAX_BATCH_SIZE)throw new Error('El lote debe contener entre 1 y '+MAX_BATCH_SIZE+' evaluaciones.');
  const requestId=clean_(body.requestId);
  if(!/^[A-Za-z0-9_-]{10,120}$/.test(requestId))throw new Error('La solicitud no tiene un identificador válido.');
  updateDevice_(body,user);
  touchUser_(user);

  const inbox=control_().getSheetByName('BANDEJA_ENTRADA');
  const existingRequest=findRowByValue_(inbox,1,requestId);
  if(existingRequest){
    const stored=clean_(inbox.getRange(existingRequest,6).getValue());
    if(stored)return {ok:true,requestId:requestId,results:JSON.parse(stored)};
  }else{
    const requestSummary={version:clean_(body.version),deviceId:clean_(body.deviceId),pending:Number(body.pending||0),entryIds:entries.map(function(entry){return clean_(entry&&entry.id);})};
    inbox.appendRow([requestId,user.id,new Date(),'PROCESSING',JSON.stringify(requestSummary),'','','']);
  }
  const inboxRow=findRowByValue_(inbox,1,requestId);

  const registry=control_().getSheetByName('REGISTRO_UUID');
  const rows=sheetValues_(registry);
  const byId={};const byBusiness={};
  rows.slice(1).forEach(function(row,index){
    if(!row[0])return;
    const item=registryObject_(row,index+2);byId[item.id]=item;if(item.businessKey)byBusiness[item.businessKey]=item;
  });
  const results=[];
  const touchedWeeks={};
  entries.forEach(function(entry){
    try{
      validateEntry_(entry,user);
      const current=byId[entry.id];
      const logical=byBusiness[entry.businessKey];
      const decision=classifyEntry_(entry,current,logical);
      if(decision.status==='conflict')throw conflictError_(decision.reason,decision.current);
      if(decision.status==='duplicate'){
        results.push(receiptResult_(current,'duplicate'));return;
      }

      const receiptId=current&&current.receiptId?current.receiptId:'REC-'+entry.id+'-'+entry.revision;
      const reserved=reserveRegistry_(registry,current,entry,receiptId,user);
      byId[entry.id]=reserved;byBusiness[entry.businessKey]=reserved;
      const week=writeWeeklyRecord_(entry,reserved,current);
      touchedWeeks[week.weekKey]=week;
      const syncedAt=new Date();
      const confirmed=confirmRegistry_(registry,reserved,entry,receiptId,week,syncedAt);
      byId[entry.id]=confirmed;byBusiness[entry.businessKey]=confirmed;
      results.push(receiptResult_(confirmed,'accepted'));
    }catch(error){
      if(error&&error.isConflict){
        createAlert_('conflict','CONFLICT|'+entry.id,error.message,user.id,entry.weekKey||'');
        results.push({id:entry.id,status:'conflict',reason:error.message,serverHash:error.serverHash||null,serverRevision:error.serverRevision||null});
      }else{
        createAlert_('rejected','REJECTED|'+entry.id,cleanError_(error),user.id,entry.weekKey||'');
        results.push({id:entry.id,status:'error',reason:cleanError_(error)});
      }
    }
  });
  SpreadsheetApp.flush();
  Object.keys(touchedWeeks).forEach(function(key){
    try{finalizeWeek_(touchedWeeks[key]);}
    catch(error){createAlert_('index-error','INDEX|'+key,'El archivo se guardó, pero su índice requiere actualización: '+cleanError_(error),'',key);}
  });
  inbox.getRange(inboxRow,4).setValue('PROCESSED');
  inbox.getRange(inboxRow,6).setValue(JSON.stringify(results));
  inbox.getRange(inboxRow,7).setValue('');
  inbox.getRange(inboxRow,8).setValue(new Date());
  return {ok:true,requestId:requestId,results:results};
}

function classifyEntry_(entry,current,logical){
  if(logical&&logical.id!==entry.id)return {status:'conflict',reason:'La ubicación, fecha y planta ya pertenecen a otra evaluación.',current:logical};
  if(current&&current.hash===entry.contentHash&&current.status==='CONFIRMED')return {status:'duplicate',current:current};
  if(current&&current.hash!==entry.contentHash&&(current.status!=='CONFIRMED'||entry.baseHash!==current.hash||Number(entry.revision)!==Number(current.revision)+1)){
    return {status:'conflict',reason:'El UUID tiene una versión diferente en la base central.',current:current};
  }
  if(current&&current.hash===entry.contentHash&&Number(entry.revision)!==Number(current.revision))return {status:'conflict',reason:'La revisión recibida no coincide con el UUID reservado.',current:current};
  return {status:'accepted',current:current||null};
}

function statusByRequest_(params,user){
  const requestId=clean_(params.requestId);
  if(!requestId)return {ok:false,message:'Falta el identificador de solicitud.',results:[]};
  const sheet=control_().getSheetByName('BANDEJA_ENTRADA');
  const row=findRowByValue_(sheet,1,requestId);
  if(!row)return {ok:true,requestId:requestId,status:'pending',results:[]};
  if(clean_(sheet.getRange(row,2).getValue()).toUpperCase()!==user.id)throw new Error('La solicitud no pertenece a este dispositivo.');
  const results=clean_(sheet.getRange(row,6).getValue());
  return {ok:true,requestId:requestId,status:results?'processed':'pending',results:results?JSON.parse(results):[]};
}

function snapshot_(params,user){
  if(['Supervisor','Administrador'].indexOf(user.role)<0)throw new Error('El perfil no tiene permiso para consultar el consolidado.');
  touchUser_(user);
  const from=/^\d{4}-\d{2}-\d{2}$/.test(params.from||'')?params.from:'';
  const to=/^\d{4}-\d{2}-\d{2}$/.test(params.to||'')?params.to:'';
  const registry=control_().getSheetByName('REGISTRO_UUID');
  const records=[];
  sheetValues_(registry).slice(1).forEach(function(row){
    if(clean_(row[10])!=='CONFIRMED'||!row[9])return;
    try{
      const payload=JSON.parse(row[9]);
      if(from&&payload.date<from)return;if(to&&payload.date>to)return;
      if(records.length<MAX_SNAPSHOT_RECORDS)records.push(payload);
    }catch(error){/* Una fila dañada no interrumpe la consulta completa. */}
  });
  const devices=deviceSnapshot_();
  const weeks=weekSnapshot_();
  const alerts=openAlerts_().concat(pendingDeviceAlerts_(devices));
  const drive=driveSnapshot_();
  return {ok:true,version:FENOLOGIA_SYNC_VERSION,records:records,devices:devices,weeks:weeks,alerts:alerts,drive:drive,truncated:records.length>=MAX_SNAPSHOT_RECORDS,generatedAt:new Date().toISOString()};
}

function validateEntry_(entry,user){
  if(!entry||typeof entry!=='object')throw new Error('La evaluación recibida no es válida.');
  if(!/^[A-Za-z0-9_-]{8,120}$/.test(clean_(entry.id)))throw new Error('El UUID no es válido.');
  if(!/^[a-f0-9]{64}$/.test(clean_(entry.contentHash)))throw new Error('El hash no es válido.');
  if(!entry.payload||entry.payload.id!==entry.id)throw new Error('El payload no coincide con su UUID.');
  if(user.role==='Evaluador'&&clean_(entry.evaluatorId).toUpperCase()!==user.id)throw new Error('Un Evaluador solo puede enviar sus propios registros.');
  if(clean_(entry.payload.evaluatorId).toUpperCase()!==clean_(entry.evaluatorId).toUpperCase())throw new Error('El evaluador del payload no coincide.');
  if(sha256Hex_(canonicalString_(entry.payload))!==entry.contentHash)throw new Error('El contenido no supera la validación de integridad.');
  if(businessKey_(entry.payload)!==entry.businessKey)throw new Error('La clave lógica no coincide con el contenido.');
  if(weekKey_(entry.payload)!==entry.weekKey)throw new Error('La semana de destino no coincide con la fecha.');
  if(!Number.isInteger(Number(entry.revision))||Number(entry.revision)<1)throw new Error('La revisión no es válida.');
}

function reserveRegistry_(sheet,current,entry,receiptId,user){
  const values=[entry.id,entry.businessKey,entry.contentHash,Number(entry.revision),entry.weekKey,current&&current.fileId||'',receiptId,current&&current.syncedAt||'',entry.evaluatorId,JSON.stringify(entry.payload),'PROCESSING',new Date()];
  let row=current&&current.row;
  if(row)sheet.getRange(row,1,1,values.length).setValues([values]);
  else{sheet.appendRow(values);row=sheet.getLastRow();}
  return registryObject_(values,row);
}

function confirmRegistry_(sheet,reserved,entry,receiptId,week,syncedAt){
  const values=[entry.id,entry.businessKey,entry.contentHash,Number(entry.revision),entry.weekKey,week.fileId,receiptId,syncedAt,entry.evaluatorId,JSON.stringify(entry.payload),'CONFIRMED',syncedAt];
  sheet.getRange(reserved.row,1,1,values.length).setValues([values]);
  return registryObject_(values,reserved.row);
}

function registryObject_(row,rowNumber){
  return {id:clean_(row[0]),businessKey:clean_(row[1]),hash:clean_(row[2]),revision:Number(row[3]||0),weekKey:clean_(row[4]),fileId:clean_(row[5]),receiptId:clean_(row[6]),syncedAt:dateIso_(row[7]),evaluatorId:clean_(row[8]),payloadJson:clean_(row[9]),status:clean_(row[10]),updatedAt:dateIso_(row[11]),row:rowNumber};
}

function receiptResult_(record,status){
  return {id:record.id,status:status,receiptId:record.receiptId,weekKey:record.weekKey,revision:record.revision,syncedAt:record.syncedAt,contentHash:record.hash};
}

function writeWeeklyRecord_(entry,reserved,previous){
  const week=getOrCreateWeek_(entry.weekKey);
  if(previous&&previous.fileId&&previous.fileId!==week.fileId)clearRecordFromFile_(previous.fileId,entry.id);
  const book=week.book||SpreadsheetApp.openById(week.fileId);
  writeSingleRecord_(book.getSheetByName('FENOLOGIA'),entry.id,fenologyRow_(entry.payload));
  writeSingleRecord_(book.getSheetByName('BIOMETRIA'),entry.id,biometryRow_(entry.payload));
  replaceParameterRows_(book.getSheetByName('PARAMETROS_ADICIONALES'),entry.id,dynamicRows_(entry.payload));
  writeSingleRecord_(book.getSheetByName('METADATOS'),entry.id,[entry.id,entry.payload.campaign||campaignFromWeekKey_(entry.weekKey),entry.evaluatorId,entry.payload.evaluator||'',entry.weekKey,entry.contentHash,Number(entry.revision),reserved.receiptId,new Date(),'CONFIRMED']);
  appendValues_(book.getSheetByName('AUDITORIA'),[new Date(),previous?'ACTUALIZACIÓN':'CREACIÓN',entry.id,entry.evaluatorId,entry.weekKey,Number(entry.revision),entry.contentHash,'Escritura idempotente confirmada']);
  return week;
}

function finalizeWeek_(week){
  const book=week.book||SpreadsheetApp.openById(week.fileId);
  week.cellCount=spreadsheetCellCount_(book);week.cellPercent=week.cellCount/SHEET_CELL_LIMIT*100;
  const warning=Number(PropertiesService.getScriptProperties().getProperty(FILE_WARNING_PERCENT_PROPERTY)||70);
  if(week.cellPercent>=warning)createAlert_('file-capacity','CAPACITY|'+week.weekKey,'El archivo semanal alcanzó '+week.cellPercent.toFixed(1)+' % de su capacidad.','',week.weekKey);
  updateWeekIndex_(week);
}

function getOrCreateWeek_(weekKey){
  if(runtimeWeekCache[weekKey])return runtimeWeekCache[weekKey];
  const index=control_().getSheetByName('INDICE_GENERAL');
  const row=findRowByValue_(index,1,weekKey);
  if(row){
    const values=index.getRange(row,1,1,CONTROL_HEADERS.INDICE_GENERAL.length).getValues()[0];
    try{
      const book=SpreadsheetApp.openById(clean_(values[3]));
      const existing={weekKey:weekKey,campaign:clean_(values[1]),yearWeek:clean_(values[2]),fileId:book.getId(),name:book.getName(),url:book.getUrl(),createdAt:values[8],indexRow:row,cellCount:Number(values[10]||0),cellPercent:Number(values[11]||0),book:book};
      runtimeWeekCache[weekKey]=existing;return existing;
    }catch(error){/* Se recupera creando un archivo nuevo y conservando el índice. */}
  }
  const parsed=parseWeekKey_(weekKey);
  const root=rootFolder_();
  let campaignFolder;
  const folders=root.getFoldersByName(parsed.campaign);
  campaignFolder=folders.hasNext()?folders.next():root.createFolder(parsed.campaign);
  const fileName='FENOLOGIA_'+parsed.yearWeek.replace('-','_');
  const book=SpreadsheetApp.create(fileName);
  DriveApp.getFileById(book.getId()).moveTo(campaignFolder);
  ensureSheet_(book,'FENOLOGIA',FENO_HEADERS);
  ensureSheet_(book,'BIOMETRIA',BIO_HEADERS);
  ensureSheet_(book,'PARAMETROS_ADICIONALES',PARAM_HEADERS);
  ensureSheet_(book,'METADATOS',META_HEADERS);
  ensureSheet_(book,'AUDITORIA',AUDIT_HEADERS);
  const defaultSheet=book.getSheetByName('Sheet1')||book.getSheetByName('Hoja 1');
  if(defaultSheet&&book.getSheets().length>1)book.deleteSheet(defaultSheet);
  const created=new Date();
  const data=[weekKey,parsed.campaign,parsed.yearWeek,book.getId(),book.getName(),book.getUrl(),'ACTIVE',0,created,created,spreadsheetCellCount_(book),0];
  if(row)index.getRange(row,1,1,data.length).setValues([data]);else index.appendRow(data);
  const createdWeek={weekKey:weekKey,campaign:parsed.campaign,yearWeek:parsed.yearWeek,fileId:book.getId(),name:book.getName(),url:book.getUrl(),createdAt:created,indexRow:row||index.getLastRow(),cellCount:data[10],cellPercent:0,book:book};
  runtimeWeekCache[weekKey]=createdWeek;return createdWeek;
}

function updateWeekIndex_(week){
  const index=control_().getSheetByName('INDICE_GENERAL');
  const row=week.indexRow||findRowByValue_(index,1,week.weekKey);
  const registry=control_().getSheetByName('REGISTRO_UUID');
  const count=sheetValues_(registry).slice(1).filter(function(item){return clean_(item[4])===week.weekKey&&clean_(item[10])==='CONFIRMED';}).length;
  index.getRange(row,7,1,6).setValues([['ACTIVE',count,week.createdAt||new Date(),new Date(),week.cellCount||0,week.cellPercent||0]]);
}

function clearRecordFromFile_(fileId,id){
  try{
    const book=SpreadsheetApp.openById(fileId);
    ['FENOLOGIA','BIOMETRIA','PARAMETROS_ADICIONALES','METADATOS'].forEach(function(name){
      const sheet=book.getSheetByName(name);if(!sheet)return;
      findRowsById_(sheet,id).forEach(function(row){sheet.getRange(row,1,1,sheet.getLastColumn()).clearContent();});
    });
    appendValues_(book.getSheetByName('AUDITORIA'),[new Date(),'MOVIDO DE SEMANA',id,'','',0,'','El registro fue trasladado al archivo correspondiente a su nueva fecha.']);
  }catch(error){throw new Error('No se pudo retirar la revisión anterior de su archivo semanal.');}
}

function writeSingleRecord_(sheet,id,values){
  const rows=findRowsById_(sheet,id);
  const row=rows.length?rows[0]:Math.max(2,sheet.getLastRow()+1);
  ensureRange_(sheet,row,values.length);
  sheet.getRange(row,1,1,values.length).setValues([values]);
  rows.slice(1).forEach(function(extra){sheet.getRange(extra,1,1,sheet.getLastColumn()).clearContent();});
  return row;
}

function replaceParameterRows_(sheet,id,rows){
  findRowsById_(sheet,id).forEach(function(row){sheet.getRange(row,1,1,PARAM_HEADERS.length).clearContent();});
  if(!rows.length)return;
  const start=Math.max(2,sheet.getLastRow()+1);
  ensureRange_(sheet,start+rows.length-1,PARAM_HEADERS.length);
  sheet.getRange(start,1,rows.length,PARAM_HEADERS.length).setValues(rows);
}

function findRowsById_(sheet,id){
  const last=sheet.getLastRow();if(last<2)return [];
  return sheet.getRange(2,1,last-1,1).createTextFinder(id).matchEntireCell(true).findAll().map(function(range){return range.getRow();});
}

function fenologyRow_(record){
  const keys=Array.from({length:17},function(_,index){return 'E'+String(index+1).padStart(2,'0');});
  return dateParts_(record).concat(keys.map(function(key){return value_(record[key]);})).concat([
    'yemasVegetativas','yemasFlorales','yemasDudosas','senescencia','broteRojo','brotePalido','broteOscuro','paniculaIndeterminada','paniculaDeterminada','conteoPaniculas','conteoCuajas','paniculasSinCuajar','paniculaBuena','paniculaMedia','paniculaMala'
  ].map(function(key){return value_(record[key]);}));
}

function biometryRow_(record){
  const measurements=[];
  for(let fruit=1;fruit<=35;fruit++)['dl','dea','deb'].forEach(function(axis){measurements.push(value_(record['f'+fruit+'_'+axis]));});
  return dateParts_(record).concat(measurements).concat(['caidaF1','caidaF2','caidaF3','caidaF4','frutaAnillada','frutaDeshidratada','frutosPintones'].map(function(key){return value_(record[key]);}));
}

function dynamicRows_(record){
  const result=[];const params=record.parametrosAdicionales||{};const parts=dateParts_(record);
  Object.keys(params).sort().forEach(function(id){
    const entry=params[id];const raw=entry&&typeof entry==='object'&&Object.prototype.hasOwnProperty.call(entry,'value')?entry.value:entry;
    if(raw===''||raw===null||raw===undefined)return;
    result.push(parts.slice(0,11).concat([record.evaluator||'',id,entry&&entry.name||id,entry&&entry.section||'Otros',entry&&entry.type||'text',raw,entry&&entry.unit||'']));
  });
  return result;
}

function dateParts_(record){
  const info=isoWeekInfo_(record.date);const date=new Date(record.date+'T12:00:00Z');
  return [record.id,record.date,info.week,date.getUTCMonth()+1,date.getUTCFullYear(),value_(record.field),value_(record.farm),value_(record.module),value_(record.lot),value_(record.quadrant),value_(record.variety),value_(record.plant)];
}

function authenticatePost_(body){
  const user=findUser_(body.evaluatorId);
  if(!user)throw new Error('Dispositivo no autorizado.');
  if(!user.active)throw new Error('Usuario desactivado.');
  if(!constantTimeEqual_(sha256Hex_(clean_(body.deviceToken)),user.tokenHash))throw new Error('Dispositivo no autorizado.');
  return user;
}

function authenticateSignedGet_(params){
  const user=findUser_(params.evaluatorId);
  if(!user)throw new Error('Dispositivo no autorizado.');
  if(!user.active)throw new Error('Usuario desactivado.');
  const timestamp=Number(params.timestamp||0);
  if(!timestamp||Math.abs(Date.now()-timestamp)>5*60*1000)throw new Error('La firma venció.');
  const nonce=clean_(params.nonce);
  if(!/^[A-Za-z0-9_-]{10,160}$/.test(nonce))throw new Error('Nonce no válido.');
  const payload=signedPayload_(params);
  const text=params.action+'|'+user.id+'|'+String(params.timestamp)+'|'+nonce+'|'+payload;
  const expected=hmacHex_(user.tokenHash,text);
  if(!constantTimeEqual_(expected,clean_(params.signature)))throw new Error('Firma de dispositivo no válida.');
  const cache=CacheService.getScriptCache();const nonceKey='nonce:'+user.id+':'+nonce;
  if(cache.get(nonceKey))throw new Error('Solicitud repetida.');
  cache.put(nonceKey,'1',600);
  return user;
}

function signedPayload_(params){
  const keys=params.action==='status'?['requestId']:params.action==='snapshot'?['from','to']:[];
  return keys.sort().map(function(key){return key+'='+String(params[key]||'');}).join('&');
}

function findUser_(evaluatorId){
  const id=clean_(evaluatorId).toUpperCase();
  const sheet=control_().getSheetByName('USUARIOS_SYNC');
  const rows=sheetValues_(sheet);
  for(let index=1;index<rows.length;index++){
    const row=rows[index];
    if(clean_(row[0]).toUpperCase()===id)return {id:id,name:clean_(row[1]),role:clean_(row[2]),tokenHash:clean_(row[3]),active:row[4]===true||String(row[4]).toUpperCase()==='TRUE',row:index+1};
  }
  return null;
}

function touchUser_(user){control_().getSheetByName('USUARIOS_SYNC').getRange(user.row,7).setValue(new Date());}

function updateDevice_(body,user){
  const sheet=control_().getSheetByName('DISPOSITIVOS');
  const deviceId=clean_(body.deviceId)||user.id;
  const row=findRowByValue_(sheet,1,deviceId);
  const values=[deviceId,user.id,user.name,user.role,new Date(),Math.max(0,Number(body.pending||0)),clean_(body.version)||'',navigatorStatus_(Number(body.pending||0))];
  if(row)sheet.getRange(row,1,1,values.length).setValues([values]);else sheet.appendRow(values);
}

function navigatorStatus_(pending){return pending>0?'PENDING':'ONLINE';}

function deviceSnapshot_(){
  const rows=sheetValues_(control_().getSheetByName('DISPOSITIVOS')).slice(1);
  return rows.filter(function(row){return row[0];}).map(function(row){
    const lastSeen=dateIso_(row[4]);const age=lastSeen?Date.now()-new Date(lastSeen).getTime():Infinity;
    return {deviceId:clean_(row[0]),evaluatorId:clean_(row[1]),evaluator:clean_(row[2]),role:clean_(row[3]),lastSeenAt:lastSeen,pending:Number(row[5]||0),version:clean_(row[6]),status:age<=2*60*1000?'online':'offline'};
  });
}

function pendingDeviceAlerts_(devices){
  const hours=Number(PropertiesService.getScriptProperties().getProperty(PENDING_ALERT_HOURS_PROPERTY)||4);
  return devices.filter(function(device){return device.pending>0&&device.lastSeenAt&&Date.now()-new Date(device.lastSeenAt).getTime()>=hours*3600000;}).map(function(device){
    return {id:'DEVICE-'+device.deviceId,type:'pending-device',message:device.evaluator+' tiene '+device.pending+' registro(s) pendientes y no contacta hace '+hours+' horas.',detail:{evaluatorId:device.evaluatorId,deviceId:device.deviceId,pending:device.pending},status:'open',createdAt:device.lastSeenAt};
  });
}

function weekSnapshot_(){
  return sheetValues_(control_().getSheetByName('INDICE_GENERAL')).slice(1).filter(function(row){return row[0];}).map(function(row){
    return {weekKey:clean_(row[0]),campaign:clean_(row[1]),yearWeek:clean_(row[2]),fileId:clean_(row[3]),name:clean_(row[4]),url:clean_(row[5]),status:clean_(row[6]),recordCount:Number(row[7]||0),createdAt:dateIso_(row[8]),updatedAt:dateIso_(row[9]),cellCount:Number(row[10]||0),cellPercent:Number(row[11]||0)};
  }).sort(function(a,b){return b.weekKey.localeCompare(a.weekKey);});
}

function driveSnapshot_(){
  try{
    const used=Number(DriveApp.getStorageUsed()||0);const limit=Number(DriveApp.getStorageLimit()||0);
    return {usedBytes:used,limitBytes:limit,usedPercent:limit?used/limit*100:null,updatedAt:new Date().toISOString()};
  }catch(error){return {usedBytes:null,limitBytes:null,usedPercent:null,updatedAt:new Date().toISOString()};}
}

function createAlert_(type,key,message,evaluatorId,weekKey){
  const sheet=control_().getSheetByName('ALERTAS');
  const rows=sheetValues_(sheet);
  const existing=rows.findIndex(function(row,index){return index>0&&clean_(row[1])===key&&clean_(row[6])==='OPEN';});
  if(existing>0)return;
  sheet.appendRow(['ALT-'+new Date().getTime()+'-'+Math.random().toString(36).slice(2,7),key,type,message,evaluatorId||'',weekKey||'','OPEN',new Date(),'']);
}

function openAlerts_(){
  return sheetValues_(control_().getSheetByName('ALERTAS')).slice(1).filter(function(row){return clean_(row[6])==='OPEN';}).map(function(row){
    return {id:clean_(row[0]),type:clean_(row[2]),message:clean_(row[3]),detail:{evaluatorId:clean_(row[4]),weekKey:clean_(row[5])},status:'open',createdAt:dateIso_(row[7])};
  });
}

function control_(){
  if(runtimeControlCache)return runtimeControlCache;
  const id=PropertiesService.getScriptProperties().getProperty(CONTROL_ID_PROPERTY);
  if(!id)throw new Error('El servicio no está configurado. Ejecuta setupFenologia().');
  runtimeControlCache=SpreadsheetApp.openById(id);return runtimeControlCache;
}

function rootFolder_(){
  if(runtimeRootCache)return runtimeRootCache;
  const id=PropertiesService.getScriptProperties().getProperty(ROOT_FOLDER_ID_PROPERTY);
  if(!id)throw new Error('La carpeta central no está configurada.');
  runtimeRootCache=DriveApp.getFolderById(id);return runtimeRootCache;
}

function resetRuntimeCaches_(){runtimeControlCache=null;runtimeRootCache=null;runtimeWeekCache={};}

function ensureSheet_(book,name,headers){
  let sheet=book.getSheetByName(name);if(!sheet)sheet=book.insertSheet(name);
  if(sheet.getMaxColumns()<headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
  sheet.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#07552f').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  return sheet;
}

function ensureRange_(sheet,lastRow,lastColumn){
  const extraColumns=Math.max(0,lastColumn-sheet.getMaxColumns());
  const requiredRows=Math.max(0,lastRow-sheet.getMaxRows());
  let extraRows=requiredRows?Math.max(requiredRows,250):0;
  if(extraColumns||extraRows){
    const book=sheet.getParent();
    const current=spreadsheetCellCount_(book);
    let projected=current+extraColumns*sheet.getMaxRows()+extraRows*(sheet.getMaxColumns()+extraColumns);
    if(projected>SHEET_CELL_LIMIT&&extraRows>requiredRows){extraRows=requiredRows;projected=current+extraColumns*sheet.getMaxRows()+extraRows*(sheet.getMaxColumns()+extraColumns);}
    if(projected>SHEET_CELL_LIMIT)throw new Error('El archivo semanal alcanzó el límite de celdas antes de completar la escritura.');
  }
  if(extraColumns)sheet.insertColumnsAfter(sheet.getMaxColumns(),extraColumns);
  if(extraRows)sheet.insertRowsAfter(sheet.getMaxRows(),extraRows);
}

function appendValues_(sheet,values){
  const row=Math.max(2,sheet.getLastRow()+1);ensureRange_(sheet,row,values.length);
  sheet.getRange(row,1,1,values.length).setValues([values]);return row;
}

function sheetValues_(sheet){return sheet.getLastRow()?sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn()).getValues():[];}
function findRowByValue_(sheet,column,value){
  const last=sheet.getLastRow();if(last<2)return 0;
  const found=sheet.getRange(2,column,last-1,1).createTextFinder(String(value)).matchEntireCell(true).findNext();
  return found?found.getRow():0;
}
function spreadsheetCellCount_(book){return book.getSheets().reduce(function(total,sheet){return total+sheet.getMaxRows()*sheet.getMaxColumns();},0);}

function isoWeekInfo_(dateText){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(clean_(dateText)))throw new Error('La fecha no es válida.');
  const date=new Date(dateText+'T12:00:00Z');const day=date.getUTCDay()||7;
  const thursday=new Date(date);thursday.setUTCDate(date.getUTCDate()+4-day);
  const weekYear=thursday.getUTCFullYear();const yearStart=new Date(Date.UTC(weekYear,0,1));
  const week=Math.ceil((((thursday-yearStart)/86400000)+1)/7);
  return {week:week,weekYear:weekYear,key:weekYear+'-S'+String(week).padStart(2,'0')};
}

function weekKey_(record){return campaignKey_(record.campaign,record.date)+'_'+isoWeekInfo_(record.date).key;}
function campaignKey_(campaign,dateText){
  const clean=clean_(campaign).replace(/[^0-9A-Za-z_-]+/g,'-').replace(/^-+|-+$/g,'');if(clean)return clean;
  const date=new Date(dateText+'T12:00:00Z');const year=date.getUTCFullYear();return date.getUTCMonth()>=9?year+'-'+(year+1):(year-1)+'-'+year;
}
function businessKey_(record){
  const values=[record.date,record.evaluatorId,record.lot,record.variety,record.quadrant||'',record.plant];
  if(values.slice(0,4).concat(values.slice(5)).some(function(value){return clean_(value)==='';}))throw new Error('No se pudo formar la clave lógica.');
  return values.map(function(value){return clean_(value).toUpperCase();}).join('|');
}
function parseWeekKey_(key){
  const match=clean_(key).match(/^(.*)_(\d{4}-S\d{2})$/);if(!match)throw new Error('La semana de archivo no es válida.');
  return {campaign:match[1],yearWeek:match[2]};
}
function campaignFromWeekKey_(key){return parseWeekKey_(key).campaign;}

function canonicalString_(value){return JSON.stringify(stableValue_(value));}
function stableValue_(value){
  if(Array.isArray(value))return value.map(stableValue_);
  if(value&&typeof value==='object')return Object.keys(value).filter(function(key){return ['sync','_sync','syncStatus','syncMessage','lastSyncAttemptAt'].indexOf(key)<0;}).sort().reduce(function(result,key){result[key]=stableValue_(value[key]);return result;},{});
  if(typeof value==='number'&&!Number.isFinite(value))return null;
  return value===undefined?null:value;
}
function sha256Hex_(value){return bytesHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8));}
function hmacHex_(key,value){return bytesHex_(Utilities.computeHmacSha256Signature(String(value),String(key),Utilities.Charset.UTF_8));}
function bytesHex_(bytes){return bytes.map(function(byte){return ((byte+256)%256).toString(16).padStart(2,'0');}).join('');}
function constantTimeEqual_(left,right){
  left=String(left||'');right=String(right||'');let difference=left.length^right.length;
  for(let index=0;index<Math.max(left.length,right.length);index++)difference|=(left.charCodeAt(index%Math.max(1,left.length))||0)^(right.charCodeAt(index%Math.max(1,right.length))||0);
  return difference===0;
}

function conflictError_(message,current){const error=new Error(message);error.isConflict=true;error.serverHash=current&&current.hash;error.serverRevision=current&&current.revision;return error;}
function generateToken_(){return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
function clean_(value){return String(value===null||value===undefined?'':value).trim();}
function value_(value){return value===null||value===undefined?'':value;}
function dateIso_(value){if(!value)return '';const date=value instanceof Date?value:new Date(value);return Number.isNaN(date.getTime())?'':date.toISOString();}
function cleanError_(error){return clean_(error&&error.message||error||'Error no identificado.').slice(0,500);}
function jsonOutput_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function jsonpOutput_(callback,value){
  if(!/^[A-Za-z_$][0-9A-Za-z_$.]{0,100}$/.test(callback))return jsonOutput_({ok:false,message:'Callback no válido.'});
  return ContentService.createTextOutput(callback+'('+JSON.stringify(value)+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
