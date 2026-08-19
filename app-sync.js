(() => {
  const VERSION='0.15.1';
  const COMPATIBLE_PROFILE_VERSIONS=new Set(['0.15.0','0.15.1']);
  const CONFIG_KEY='fenologia-sync-config-v1';
  const DEVICE_ID_KEY='fenologia-sync-device-id-v1';
  const ACTIVE_SNAPSHOT_KEY='__ACTIVE_REMOTE_SNAPSHOT__';
  const MOCK_KEY='fenologia-sync-mock-server-v1';
  const CLEANUP_HISTORY_KEY='fenologia-sync-cleanup-history-v1';
  const DEFAULT_CONFIG={
    enabled:false,
    transport:'apps-script',
    endpoint:'',
    deviceToken:'',
    retentionWeeks:1,
    cleanupEnabled:true,
    refreshSeconds:30,
    pendingAlertHours:4,
    driveWarningPercent:70
  };
  const syncState={ready:false,running:false,lastRunAt:null,lastSuccessAt:null,lastError:null,deviceId:'',queue:[],receipts:[],alerts:[],archive:[],remoteRecords:[],remoteDevices:[],remoteWeeks:[],remoteAlerts:[],remoteDrive:null,timer:null};
  let config={...DEFAULT_CONFIG};
  let migrationPromise=null;
  let activeSessionKey='';

  const core=()=>window.FenologiaSyncCore;
  const now=()=>new Date().toISOString();
  const safeNumber=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  const cleanText=value=>String(value??'').trim();
  const recordById=id=>state.records.find(record=>record.id===id);

  function normalizedConfig(value){
    const next={...DEFAULT_CONFIG,...(value&&typeof value==='object'?value:{})};
    next.enabled=Boolean(next.enabled);
    next.cleanupEnabled=Boolean(next.cleanupEnabled);
    next.retentionWeeks=Math.max(1,Math.min(12,Math.trunc(safeNumber(next.retentionWeeks,1))));
    next.refreshSeconds=Math.max(15,Math.min(300,Math.trunc(safeNumber(next.refreshSeconds,30))));
    next.pendingAlertHours=Math.max(1,Math.min(72,Math.trunc(safeNumber(next.pendingAlertHours,4))));
    next.driveWarningPercent=Math.max(50,Math.min(95,Math.trunc(safeNumber(next.driveWarningPercent,70))));
    next.endpoint=cleanText(next.endpoint);
    next.deviceToken=cleanText(next.deviceToken);
    next.transport=['apps-script','cors','mock'].includes(next.transport)?next.transport:'apps-script';
    return next;
  }

  async function loadStores(){
    const [storedConfig,storedDeviceId,queue,receipts,alerts,archive]=await Promise.all([
      window.FenologiaDB.getSetting(CONFIG_KEY),
      window.FenologiaDB.getSetting(DEVICE_ID_KEY),
      window.FenologiaDB.listSyncItems('syncQueue'),
      window.FenologiaDB.listSyncItems('syncReceipts'),
      window.FenologiaDB.listSyncItems('syncAlerts'),
      window.FenologiaDB.listSyncItems('syncArchive')
    ]);
    config=normalizedConfig(storedConfig);
    syncState.deviceId=cleanText(storedDeviceId);
    if(!syncState.deviceId){
      syncState.deviceId=`DEV-${crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      await window.FenologiaDB.setSetting(DEVICE_ID_KEY,syncState.deviceId);
    }
    syncState.queue=queue;
    syncState.receipts=receipts;
    syncState.alerts=alerts;
    syncState.archive=archive;
    const cached=archive.find(item=>item.weekKey===ACTIVE_SNAPSHOT_KEY);
    if(cached&&!syncState.remoteRecords.length){
      syncState.remoteRecords=Array.isArray(cached.records)?cached.records:[];
      syncState.remoteDevices=Array.isArray(cached.devices)?cached.devices:[];
      syncState.remoteWeeks=Array.isArray(cached.weeks)?cached.weeks:[];
      syncState.remoteAlerts=Array.isArray(cached.alerts)?cached.alerts:[];
      syncState.remoteDrive=cached.drive||null;
    }
  }

  async function persistConfig(next){
    const candidate=normalizedConfig(next);
    if(candidate.enabled&&candidate.transport==='apps-script'){
      let endpoint;
      try{endpoint=new URL(candidate.endpoint);}catch{throw new Error('La URL de Apps Script no es válida.');}
      if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!endpoint.pathname.endsWith('/exec')) throw new Error('Usa la URL HTTPS de Apps Script terminada en /exec.');
      if(candidate.deviceToken.length<24) throw new Error('El token del dispositivo está incompleto.');
    }
    config=candidate;
    await window.FenologiaDB.setSetting(CONFIG_KEY,config);
    schedule();
    window.dispatchEvent(new CustomEvent('fenologia-sync-status',{detail:status()}));
    return config;
  }

  async function installProfile(file){
    if(!file)throw new Error('Selecciona un perfil de sincronización.');
    if(file.size>64*1024)throw new Error('El perfil supera el tamaño permitido.');
    const profile=JSON.parse(await file.text());
    if(profile?.type!=='fenologia-sync-profile'||!COMPATIBLE_PROFILE_VERSIONS.has(profile?.version))throw new Error('El archivo no es un perfil de sincronización compatible.');
    if(cleanText(profile.evaluatorId).toUpperCase()!==cleanText(state.session?.id).toUpperCase())throw new Error('El perfil pertenece a otro usuario.');
    await persistConfig({
      ...config,enabled:true,transport:'apps-script',endpoint:profile.endpoint,deviceToken:profile.deviceToken,
      retentionWeeks:profile.retentionWeeks??config.retentionWeeks,cleanupEnabled:profile.cleanupEnabled??config.cleanupEnabled
    });
    return profile;
  }

  async function downloadProfile(values){
    const profile={
      type:'fenologia-sync-profile',version:VERSION,createdAt:now(),endpoint:cleanText(values.endpoint),
      evaluatorId:cleanText(values.evaluatorId).toUpperCase(),evaluator:cleanText(values.evaluator),role:cleanText(values.role),
      deviceToken:cleanText(values.deviceToken),retentionWeeks:config.retentionWeeks,cleanupEnabled:config.cleanupEnabled
    };
    if(!profile.evaluatorId||!profile.evaluator)throw new Error('Completa el ID y nombre del destinatario.');
    if(!['Evaluador','Supervisor','Administrador'].includes(profile.role))throw new Error('Selecciona un rol válido.');
    let endpoint;
    try{endpoint=new URL(profile.endpoint);}catch{throw new Error('La URL de Apps Script no es válida.');}
    if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!endpoint.pathname.endsWith('/exec'))throw new Error('Usa una URL de Apps Script terminada en /exec.');
    if(profile.deviceToken.length<24)throw new Error('El token generado en Apps Script está incompleto.');
    const result=await downloadFile(`Perfil-Sync-${profile.evaluatorId}.json`,JSON.stringify(profile,null,2),'application/json');
    if(!result?.ok)throw new Error('La descarga del perfil fue cancelada.');
    return profile;
  }

  async function createProfile(form){
    return downloadProfile(Object.fromEntries(new FormData(form)));
  }

  function openAlerts(){
    const combined=[...syncState.alerts.filter(item=>item.status==='open'),...syncState.remoteAlerts.filter(item=>item.status==='open')];
    const seen=new Set();
    return combined.filter(item=>{const key=item.id||`${item.type}|${item.message}`;if(seen.has(key))return false;seen.add(key);return true;});
  }

  function formatBytes(value){
    const bytes=Number(value);if(!Number.isFinite(bytes))return 'No disponible';
    if(bytes<1024)return `${bytes} B`;
    const units=['KB','MB','GB','TB'];let size=bytes;let index=-1;
    do{size/=1024;index++;}while(size>=1024&&index<units.length-1);
    return `${size.toFixed(size>=100?0:size>=10?1:2)} ${units[index]}`;
  }

  function status(){
    const pending=syncState.queue.filter(item=>['pending','sending','confirming','error'].includes(item.status)).length;
    const conflicts=syncState.queue.filter(item=>item.status==='conflict').length;
    return {ready:syncState.ready,configured:isConfigured(),enabled:config.enabled,pending,conflicts,lastRunAt:syncState.lastRunAt,lastSuccessAt:syncState.lastSuccessAt,lastError:syncState.lastError,transport:config.transport};
  }

  function isConfigured(){
    if(!config.enabled) return false;
    if(config.transport==='mock') return developmentMode;
    return Boolean(config.endpoint&&config.deviceToken);
  }

  function recordSync(record,next){
    if(!record) return;
    record.sync={...(record.sync||{}),...next,updatedAt:now()};
  }

  async function enqueueRecord(record){
    if(!record?.id||!isEvaluator()||cleanText(record.evaluatorId).toUpperCase()!==cleanText(state.session?.id).toUpperCase()) return null;
    const [queued,receipt]=await Promise.all([
      window.FenologiaDB.getSyncItem('syncQueue',record.id),
      window.FenologiaDB.getSyncItem('syncReceipts',record.id)
    ]);
    const previous=queued||receipt||record.sync||null;
    const entry=await core().queueEntry(record,previous);
    if(receipt?.contentHash===entry.contentHash){
      recordSync(record,{status:'synced',contentHash:receipt.contentHash,revision:receipt.revision,syncedAt:receipt.syncedAt,weekKey:receipt.weekKey,receiptId:receipt.receiptId});
      await save();
      return receipt;
    }
    await window.FenologiaDB.putSyncItem('syncQueue',entry);
    recordSync(record,{status:'pending',contentHash:entry.contentHash,revision:entry.revision,weekKey:entry.weekKey,queuedAt:entry.updatedAt,message:'Guardado localmente; pendiente de sincronizar.'});
    await save();
    await loadStores();
    if(navigator.onLine) setTimeout(()=>processQueue(),0);
    return entry;
  }

  async function updateQueue(entry,changes){
    const next={...entry,...changes,updatedAt:now()};
    await window.FenologiaDB.putSyncItem('syncQueue',next);
    const record=recordById(entry.recordId);
    if(record) recordSync(record,{status:next.status,message:next.lastError||next.message||null,lastAttemptAt:next.lastAttemptAt||record.sync?.lastAttemptAt});
    return next;
  }

  async function createAlert(type,message,detail={}){
    const dedupeKey=`${type}|${detail.recordId||''}|${detail.evaluatorId||''}|${detail.weekKey||''}`;
    const existing=syncState.alerts.find(item=>item.dedupeKey===dedupeKey&&item.status==='open');
    if(existing) return existing;
    const alert={id:`ALT-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,dedupeKey,type,message,detail,status:'open',createdAt:now()};
    await window.FenologiaDB.putSyncItem('syncAlerts',alert);
    syncState.alerts.push(alert);
    window.dispatchEvent(new CustomEvent('fenologia-sync-alert',{detail:alert}));
    return alert;
  }

  async function resolveAlert(id){
    const alert=await window.FenologiaDB.getSyncItem('syncAlerts',id);
    if(!alert) return;
    await window.FenologiaDB.putSyncItem('syncAlerts',{...alert,status:'resolved',resolvedAt:now()});
    await loadStores();
  }

  async function resolveRemoteAlert(id){
    if(!isConfigured())throw new Error('El servicio central no está configurado.');
    if(config.transport==='mock'){syncState.remoteAlerts=syncState.remoteAlerts.filter(item=>item.id!==id);return;}
    const envelope={action:'resolve-alert',version:VERSION,deviceId:syncState.deviceId,evaluatorId:state.session?.id||'',deviceToken:config.deviceToken,alertId:id};
    if(config.transport==='cors'){
      const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(envelope),cache:'no-store'});
      if(!response.ok)throw new Error(`El servicio respondió ${response.status}.`);
      const result=await response.json();if(!result?.ok)throw new Error(result?.message||'No se pudo resolver la alerta.');
    }else{
      await fetch(config.endpoint,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(envelope),cache:'no-store'});
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    await refreshRemote();
    if(syncState.remoteAlerts.some(item=>item.id===id))throw new Error('La alerta todavía no fue confirmada como resuelta.');
  }

  async function hmacHex(secret,text){
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text));
    return [...new Uint8Array(signature)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  async function signedParams(action,extra={}){
    const timestamp=String(Date.now());
    const nonce=crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const evaluatorId=state.session?.id||'';
    const payload=Object.keys(extra).sort().map(key=>`${key}=${String(extra[key])}`).join('&');
    const tokenHash=await core().sha256(config.deviceToken);
    const signature=await hmacHex(tokenHash,`${action}|${evaluatorId}|${timestamp}|${nonce}|${payload}`);
    return {action,evaluatorId,timestamp,nonce,signature,...extra};
  }

  function jsonp(url,params,timeout=15000){
    return new Promise((resolve,reject)=>{
      const callback=`__fenologiaJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script=document.createElement('script');
      const timer=setTimeout(()=>finish(new Error('Google no respondió dentro del tiempo esperado.')),timeout);
      const finish=(error,value)=>{
        clearTimeout(timer);script.remove();delete window[callback];
        if(error) reject(error); else resolve(value);
      };
      window[callback]=value=>finish(null,value);
      const target=new URL(url);Object.entries({...params,callback}).forEach(([key,value])=>target.searchParams.set(key,String(value)));
      script.src=target.href;script.async=true;script.onerror=()=>finish(new Error('No se pudo consultar Google Apps Script.'));
      document.head.appendChild(script);
    });
  }

  async function mockRequest(action,payload={}){
    const store=(await window.FenologiaDB.getSetting(MOCK_KEY))||{records:{},business:{},devices:{},weeks:{}};
    store.records=store.records||{};store.business=store.business||{};store.devices=store.devices||{};store.weeks=store.weeks||{};
    const sessionId=state.session?.id||'LOCAL';
    store.devices[sessionId]={evaluatorId:sessionId,evaluator:state.session?.name||sessionId,lastSeenAt:now(),pending:Number(payload.pending||0),status:'online'};
    if(action==='submit'){
      const results=[];
      for(const entry of payload.entries||[]){
        const current=store.records[entry.id];
        const logicalId=store.business[entry.businessKey];
        if(logicalId&&logicalId!==entry.id){results.push({id:entry.id,status:'conflict',reason:'La clave lógica ya pertenece a otra evaluación.'});continue;}
        if(current&&current.contentHash===entry.contentHash){results.push({id:entry.id,status:'duplicate',receiptId:current.receiptId,weekKey:current.weekKey,revision:current.revision,syncedAt:current.syncedAt,contentHash:current.contentHash});continue;}
        if(current&&!(entry.baseHash===current.contentHash&&Number(entry.revision)===Number(current.revision)+1)){
          results.push({id:entry.id,status:'conflict',reason:'El UUID tiene una versión diferente.',serverHash:current.contentHash,serverRevision:current.revision});continue;
        }
        const syncedAt=now();const receiptId=`REC-${entry.id}-${entry.revision}`;
        const accepted={...entry,syncedAt,receiptId};store.records[entry.id]=accepted;store.business[entry.businessKey]=entry.id;
        store.weeks[entry.weekKey]={weekKey:entry.weekKey,status:'active',recordCount:Object.values(store.records).filter(item=>item.weekKey===entry.weekKey).length,updatedAt:syncedAt};
        results.push({id:entry.id,status:'accepted',receiptId,weekKey:entry.weekKey,revision:entry.revision,syncedAt,contentHash:entry.contentHash});
      }
      await window.FenologiaDB.setSetting(MOCK_KEY,store);return {ok:true,results};
    }
    if(action==='snapshot'){
      return {ok:true,records:Object.values(store.records).map(item=>item.payload),devices:Object.values(store.devices),weeks:Object.values(store.weeks),drive:{usedPercent:4,updatedAt:now()}};
    }
    await window.FenologiaDB.setSetting(MOCK_KEY,store);return {ok:true};
  }

  async function transportSubmit(entries){
    const requestId=`REQ-${Date.now()}-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}`;
    const owner=cleanText(state.session?.id).toUpperCase();
    const sendable=syncState.queue.filter(item=>cleanText(item.evaluatorId).toUpperCase()===owner&&['pending','sending','confirming','error'].includes(item.status)).length;
    const envelope={action:'submit',requestId,version:VERSION,deviceId:syncState.deviceId,evaluatorId:state.session?.id||'',deviceToken:config.deviceToken,pending:Math.max(0,sendable-entries.length),entries};
    if(config.transport==='mock') return mockRequest('submit',envelope);
    if(config.transport==='cors'){
      const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(envelope),cache:'no-store'});
      if(!response.ok) throw new Error(`El servicio de sincronización respondió ${response.status}.`);
      return response.json();
    }
    await fetch(config.endpoint,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(envelope),cache:'no-store'});
    for(let attempt=0;attempt<4;attempt++){
      await new Promise(resolve=>setTimeout(resolve,900+attempt*700));
      const params=await signedParams('status',{requestId});
      const result=await jsonp(config.endpoint,params);
      if(result?.results?.length) return result;
    }
    throw new Error('Google recibió la solicitud, pero la confirmación sigue pendiente.');
  }

  async function transportSnapshot(){
    const week=core().isoWeekInfo(today());
    const end=new Date(`${week.monday}T12:00:00Z`);end.setUTCDate(end.getUTCDate()+6);
    const range={from:week.monday,to:end.toISOString().slice(0,10)};
    if(config.transport==='mock') return mockRequest('snapshot',{pending:syncState.queue.length});
    if(config.transport==='cors'){
      const params=await signedParams('snapshot',range);
      const url=new URL(config.endpoint);Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,String(value)));
      const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`Consulta remota ${response.status}.`);return response.json();
    }
    return jsonp(config.endpoint,await signedParams('snapshot',range),25000);
  }

  async function acceptResult(entry,result){
    const record=recordById(entry.recordId);
    if(['accepted','duplicate'].includes(result.status)){
      const receipt={id:entry.id,recordId:entry.recordId,evaluatorId:entry.evaluatorId,weekKey:result.weekKey||entry.weekKey,revision:Number(result.revision||entry.revision),contentHash:result.contentHash||entry.contentHash,receiptId:result.receiptId||`REC-${entry.id}`,syncedAt:result.syncedAt||now(),status:'confirmed'};
      await window.FenologiaDB.putSyncItem('syncReceipts',receipt);
      await window.FenologiaDB.deleteSyncItem('syncQueue',entry.id);
      if(record) recordSync(record,{status:'synced',contentHash:receipt.contentHash,revision:receipt.revision,weekKey:receipt.weekKey,receiptId:receipt.receiptId,syncedAt:receipt.syncedAt,message:'Confirmado en Drive.'});
      return;
    }
    if(result.status==='conflict'){
      await updateQueue(entry,{status:'conflict',lastError:result.reason||'Conflicto de versión.',serverHash:result.serverHash||null,serverRevision:result.serverRevision||null});
      await createAlert('conflict',result.reason||'Una evaluación requiere revisión.',{recordId:entry.id,evaluatorId:entry.evaluatorId,weekKey:entry.weekKey});
      return;
    }
    await updateQueue(entry,{status:'error',lastError:result.reason||'El servicio rechazó el registro.'});
    await createAlert('rejected',result.reason||'Un registro fue rechazado antes de consolidarse.',{recordId:entry.id,evaluatorId:entry.evaluatorId,weekKey:entry.weekKey});
  }

  async function processQueue(){
    if(syncState.running||!isConfigured()||!navigator.onLine||!state.session) return status();
    syncState.running=true;syncState.lastRunAt=now();syncState.lastError=null;
    try{
      await loadStores();
      const currentTime=Date.now();
      const due=syncState.queue.filter(item=>
        ['pending','error','confirming','sending'].includes(item.status)&&
        cleanText(item.evaluatorId).toUpperCase()===cleanText(state.session.id).toUpperCase()&&
        new Date(item.nextAttemptAt||0).getTime()<=currentTime
      ).slice(0,25);
      if(!due.length){await refreshRemote();return status();}
      const sending=[];
      for(const entry of due){
        const next=await updateQueue(entry,{status:'sending',attempts:Number(entry.attempts||0)+1,lastAttemptAt:now(),lastError:null});sending.push(next);
      }
      const response=await transportSubmit(sending);
      const results=new Map((response?.results||[]).map(item=>[item.id,item]));
      for(const entry of sending){
        const result=results.get(entry.id);
        if(result) await acceptResult(entry,result);
        else await updateQueue(entry,{status:'confirming',nextAttemptAt:new Date(Date.now()+core().retryDelay(entry.attempts)).toISOString(),lastError:'Esperando confirmación remota.'});
      }
      await save();
      syncState.lastSuccessAt=now();
      await loadStores();
      await runAutomaticCleanup();
      window.dispatchEvent(new CustomEvent('fenologia-sync-complete',{detail:status()}));
    }catch(error){
      console.error('Synchronization failed',error);syncState.lastError=error.message||String(error);
      const items=await window.FenologiaDB.listSyncItems('syncQueue');
      for(const entry of items.filter(item=>['sending','confirming'].includes(item.status))){
        await updateQueue(entry,{status:'error',nextAttemptAt:new Date(Date.now()+core().retryDelay(entry.attempts)).toISOString(),lastError:syncState.lastError});
      }
    }finally{
      syncState.running=false;await loadStores();window.dispatchEvent(new CustomEvent('fenologia-sync-status',{detail:status()}));decorateRenderedView();
      const owner=cleanText(state.session?.id).toUpperCase();
      const hasMoreDue=syncState.queue.some(item=>cleanText(item.evaluatorId).toUpperCase()===owner&&['pending','error','confirming','sending'].includes(item.status)&&new Date(item.nextAttemptAt||0).getTime()<=Date.now());
      if(hasMoreDue&&navigator.onLine)setTimeout(()=>processQueue(),300);
    }
    return status();
  }

  async function refreshRemote(){
    if(!isConfigured()||!navigator.onLine||!state.session||!isSupervisor()) return null;
    const snapshot=await transportSnapshot();
    if(!snapshot?.ok) throw new Error(snapshot?.message||'No se pudo consultar la base central.');
    syncState.remoteRecords=Array.isArray(snapshot.records)?snapshot.records:[];
    syncState.remoteDevices=Array.isArray(snapshot.devices)?snapshot.devices:[];
    syncState.remoteWeeks=Array.isArray(snapshot.weeks)?snapshot.weeks:[];
    syncState.remoteAlerts=Array.isArray(snapshot.alerts)?snapshot.alerts:[];
    syncState.remoteDrive=snapshot.drive||null;
    syncState.lastSuccessAt=now();
    await window.FenologiaDB.putSyncItem('syncArchive',{
      weekKey:ACTIVE_SNAPSHOT_KEY,campaign:'active',status:'active-cache',updatedAt:now(),
      records:syncState.remoteRecords,devices:syncState.remoteDevices,weeks:syncState.remoteWeeks,alerts:syncState.remoteAlerts,drive:syncState.remoteDrive
    });
    if(syncState.remoteDrive&&Number(syncState.remoteDrive.usedPercent)>=config.driveWarningPercent){
      await createAlert('drive-capacity',`Drive alcanzó ${Number(syncState.remoteDrive.usedPercent).toFixed(1)} % de uso.`,{usedPercent:syncState.remoteDrive.usedPercent});
    }
    return snapshot;
  }

  function weeksOld(dateText){
    try{
      const recordMonday=new Date(`${core().isoWeekInfo(dateText).monday}T12:00:00Z`).getTime();
      const currentMonday=new Date(`${core().isoWeekInfo(today()).monday}T12:00:00Z`).getTime();
      return Math.floor((currentMonday-recordMonday)/(7*86400000));
    }catch{return 0;}
  }

  async function runAutomaticCleanup(){
    if(!config.cleanupEnabled||!isConfigured()||!isEvaluator()) return {removed:0};
    const [queue,receipts]=await Promise.all([window.FenologiaDB.listSyncItems('syncQueue'),window.FenologiaDB.listSyncItems('syncReceipts')]);
    const queuedIds=new Set(queue.map(item=>item.id));const receiptById=new Map(receipts.map(item=>[item.id,item]));
    const removable=state.records.filter(record=>{
      const receipt=receiptById.get(record.id);
      return core().cleanupEligible(record,receipt,queuedIds.has(record.id),weeksOld(record.date),config.retentionWeeks);
    });
    if(!removable.length) return {removed:0};
    const ids=new Set(removable.map(record=>record.id));state.records=state.records.filter(record=>!ids.has(record.id));await save();
    const history=(await window.FenologiaDB.getSetting(CLEANUP_HISTORY_KEY))||[];
    history.push({id:`CLN-${Date.now()}`,recordCount:ids.size,recordIds:[...ids],cleanedAt:now(),reason:'confirmed-weekly-retention',retentionWeeks:config.retentionWeeks});
    await window.FenologiaDB.setSetting(CLEANUP_HISTORY_KEY,history.slice(-100));
    return {removed:ids.size};
  }

  function syncBadge(record){
    const statusValue=record?.sync?.status||'local';
    const labels={local:'Solo local',pending:'Pendiente',sending:'Sincronizando',confirming:'Confirmando',synced:'Sincronizado',error:'Reintento pendiente',conflict:'Revisión necesaria'};
    return `<span class="sync-badge sync-${esc(statusValue)}">${esc(labels[statusValue]||statusValue)}</span>`;
  }

  function evaluatorSyncView(){
    const current=status();
    const rows=state.records.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,100);
    const oldestPending=syncState.queue.filter(item=>['pending','error','confirming'].includes(item.status)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)))[0];
    const pendingTooLong=oldestPending&&Date.now()-new Date(oldestPending.createdAt).getTime()>=config.pendingAlertHours*3600000;
    app.innerHTML=shell(`${titleBlock('SINCRONIZACIÓN','Estado de tus evaluaciones','El guardado local nunca espera a Drive.',`<button class="primary" id="sync-now" ${!navigator.onLine?'disabled':''}>↻ Sincronizar ahora</button>`)}
      <section class="metrics-grid">${metric(current.pending,'Pendientes',icons.sync)}${metric(current.conflicts,'Revisión necesaria',icons.alert)}${metric(syncState.receipts.length,'Confirmadas',icons.check)}${metric(navigator.onLine?'En línea':'Sin conexión','Conectividad',icons.cloud)}</section>
      ${pendingTooLong?`<section class="panel sync-warning"><b>Hay registros pendientes desde hace varias horas</b><p>No se borraron ni se perdieron. Conéctate a internet y usa “Sincronizar ahora”. El Supervisor verá el último estado que este celular haya alcanzado a comunicar.</p></section>`:''}
      ${!isConfigured()?'<section class="panel sync-warning"><b>Sincronización central aún no configurada</b><p>Los registros continúan protegidos en este celular. Instala el perfil individual entregado por el Administrador antes de la prueba con Drive.</p><div class="form-actions"><button class="secondary" type="button" id="install-sync-profile">Instalar perfil</button><input id="sync-profile-file" type="file" accept="application/json,.json" hidden></div></section>':''}
      <section class="panel"><div class="panel-head"><div><span>COLA LOCAL</span><h2>Registros recientes</h2><p>Una evaluación solamente se retira del celular después de recibir confirmación.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Lote</th><th>Planta</th><th>Estado</th></tr></thead><tbody>${rows.map(record=>`<tr><td>${esc(record.date)}</td><td>${esc(record.lot)}</td><td>${esc(record.plant)}</td><td>${syncBadge(record)}</td></tr>`).join('')||'<tr><td colspan="4">Sin registros locales.</td></tr>'}</tbody></table></div></section>`);
  }

  function monitorView(){
    const current=status();const devices=syncState.remoteDevices;const alerts=openAlerts();
    app.innerHTML=shell(`${titleBlock('SUPERVISIÓN','Equipo y sincronización','Monitorea confirmaciones y alertas sin modificar la base.',`<button class="primary" id="refresh-sync-monitor" ${!navigator.onLine?'disabled':''}>Actualizar</button>`)}
      <section class="metrics-grid">${metric(syncState.remoteRecords.length,'Evaluaciones de la semana',icons.clipboard)}${metric(current.pending,'Pendientes locales',icons.sync)}${metric(alerts.length,'Alertas abiertas',icons.alert)}${metric(syncState.remoteWeeks.length,'Semanas disponibles',icons.file)}</section>
      ${!isConfigured()?'<section class="panel sync-warning"><b>Servicio todavía no conectado</b><p>Instala el perfil individual del Supervisor para iniciar la prueba con la base central.</p><div class="form-actions"><button class="secondary" type="button" id="install-sync-profile">Instalar perfil</button><input id="sync-profile-file" type="file" accept="application/json,.json" hidden></div></section>':''}
      <section class="panel"><div class="panel-head"><div><span>DISPOSITIVOS</span><h2>Estado del equipo</h2></div></div><div class="sync-device-grid">${devices.map(device=>`<article><b>${esc(device.evaluator||device.evaluatorId)}</b><span>${esc(device.pending||0)} pendiente(s)</span><small>Último contacto: ${device.lastSeenAt?new Date(device.lastSeenAt).toLocaleString('es-PE'):'Sin contacto'}</small></article>`).join('')||'<p>Aún no hay dispositivos sincronizados.</p>'}</div></section>
      <section class="panel"><div class="panel-head"><div><span>ARCHIVOS SEMANALES</span><h2>Histórico disponible en Drive</h2><p>Los gráficos activos usan la semana actual. Para otras semanas puedes abrir el archivo o cargarlo en Archivos históricos.</p></div></div><div class="table-wrap"><table><thead><tr><th>Semana</th><th>Registros</th><th>Capacidad</th><th></th></tr></thead><tbody>${syncState.remoteWeeks.map(week=>`<tr><td><b>${esc(week.yearWeek||week.weekKey)}</b><small>${esc(week.campaign||'')}</small></td><td>${esc(week.recordCount||0)}</td><td>${Number(week.cellPercent||0).toFixed(1)} %</td><td>${week.url?`<a class="secondary sync-file-link" href="${esc(week.url)}" target="_blank" rel="noopener noreferrer">Abrir</a>`:'—'}</td></tr>`).join('')||'<tr><td colspan="4">Aún no hay archivos semanales.</td></tr>'}</tbody></table></div></section>
      ${syncState.remoteDrive?`<section class="panel sync-drive"><div><span>ESPACIO DE DRIVE</span><h2>${syncState.remoteDrive.usedPercent==null?'Capacidad no disponible':`${Number(syncState.remoteDrive.usedPercent).toFixed(1)} % utilizado`}</h2><p>${formatBytes(syncState.remoteDrive.usedBytes)} de ${formatBytes(syncState.remoteDrive.limitBytes)}. Los archivos eliminados liberan espacio después de vaciar la papelera.</p></div></section>`:''}
      <section class="panel"><div class="panel-head"><div><span>ALERTAS</span><h2>Situaciones que requieren revisión</h2></div></div><div class="sync-alert-list">${alerts.map(alert=>`<article><div><b>${esc(alert.message)}</b><small>${alert.createdAt?new Date(alert.createdAt).toLocaleString('es-PE'):'Generada por el servidor'}</small></div>${syncState.alerts.some(local=>local.id===alert.id)?`<button class="secondary" data-resolve-sync-alert="${esc(alert.id)}">Marcar revisada</button>`:alert.type==='pending-device'?'<span class="sync-badge sync-pending">Se cierra al sincronizar</span>':`<button class="secondary" data-resolve-remote-alert="${esc(alert.id)}">Marcar revisada</button>`}</article>`).join('')||'<p>No hay alertas abiertas.</p>'}</div></section>`);
  }

  function adminSyncView(){
    app.innerHTML=shell(`${titleBlock('ADMINISTRADOR','Seguridad y sincronización','Configura la conexión, retención local y controles operativos.')}
      <form class="panel sync-config-form" id="sync-config-form">
        <div class="panel-head"><div><span>CONEXIÓN CENTRAL</span><h2>Google Apps Script</h2><p>La URL y el token se guardan solamente en este dispositivo.</p></div></div>
        <div class="form-grid">
          <label>Estado<select name="enabled"><option value="false" ${!config.enabled?'selected':''}>Desactivado</option><option value="true" ${config.enabled?'selected':''}>Activado</option></select></label>
          <label>Transporte<select name="transport"><option value="apps-script" ${config.transport==='apps-script'?'selected':''}>Google Apps Script</option><option value="cors" ${config.transport==='cors'?'selected':''}>API con CORS</option>${developmentMode?`<option value="mock" ${config.transport==='mock'?'selected':''}>Simulador local</option>`:''}</select></label>
          <label class="wide-field">URL del servicio<input name="endpoint" type="url" value="${esc(config.endpoint)}" placeholder="https://script.google.com/macros/s/.../exec"></label>
          <label class="wide-field">Token de este dispositivo Administrador<input name="deviceToken" type="password" value="${esc(config.deviceToken)}" autocomplete="off"></label>
          <label>Semanas en el celular<input name="retentionWeeks" type="number" min="1" max="12" value="${config.retentionWeeks}"></label>
          <label>Actualización del Supervisor<input name="refreshSeconds" type="number" min="15" max="300" value="${config.refreshSeconds}"></label>
          <label>Aviso local pendiente (horas)<input name="pendingAlertHours" type="number" min="1" max="72" value="${config.pendingAlertHours}"></label>
          <label>Alerta de Drive (%)<input name="driveWarningPercent" type="number" min="50" max="95" value="${config.driveWarningPercent}"></label>
          <label class="sync-check"><input name="cleanupEnabled" type="checkbox" ${config.cleanupEnabled?'checked':''}><span>Limpiar automáticamente solo registros confirmados y fuera del periodo local</span></label>
        </div><div class="form-actions"><button class="primary" type="submit">Guardar configuración local</button><button class="secondary" type="button" id="test-sync-connection">Probar conexión</button></div>
      </form>
      <section class="panel sync-protection"><div><span>PREPARACIÓN POR USUARIO</span><h2>Acceso y sincronización en un solo asistente</h2><p>Abre “Usuarios y roles” y utiliza <b>Preparar dispositivo</b>. El ID, nombre y rol se completan automáticamente para evitar perfiles cruzados.</p><div class="form-actions"><button class="secondary" type="button" data-view="users">Abrir Usuarios y roles</button></div></div></section>
      <section class="panel sync-protection"><b>Protección obligatoria</b><p>No existe permiso de limpieza para Evaluadores. La cola pendiente, conflictos y registros sin recibo nunca se eliminan.</p></section>`);
  }

  function normalizeSidebar(){
    const nav=document.querySelector('.sidebar nav');if(!nav||!state.session)return;
    if(isEvaluator()){
      nav.querySelector('[data-view="export"]')?.remove();
      nav.querySelector('[data-view="consolidate"]')?.remove();
      nav.querySelector('[data-view="charts"]')?.remove();
      if(!nav.querySelector('[data-view="sync-status"]')) nav.insertAdjacentHTML('beforeend',`<button data-view="sync-status" class="${state.view==='sync-status'?'active':''}"><span>🔄</span>Sincronización</button>`);
    }
    if(state.session.role==='Supervisor'){
      const consolidate=nav.querySelector('[data-view="consolidate"]');if(consolidate) consolidate.innerHTML='<span>🗂️</span>Archivos históricos';
      if(!nav.querySelector('[data-view="sync-monitor"]')) nav.insertAdjacentHTML('beforeend',`<button data-view="sync-monitor" class="${state.view==='sync-monitor'?'active':''}"><span>☁️</span>Equipo y sincronización</button>`);
    }
    if(isAdmin()){
      nav.querySelector('[data-view="cleanup-security"]')?.remove();
      if(!nav.querySelector('[data-view="sync-control"]')) nav.insertAdjacentHTML('beforeend',`<button data-view="sync-control" class="${state.view==='sync-control'?'active':''}"><span>🔐</span>Seguridad y sincronización</button>`);
    }
  }

  function decorateHome(){
    if(state.view!=='home'||!state.session)return;
    const title=document.querySelector('.page-title');if(!title||document.querySelector('.sync-home-strip'))return;
    const current=status();
    title.insertAdjacentHTML('afterend',`<section class="sync-home-strip ${isConfigured()?'configured':'pending'}"><div><b>${isConfigured()?'Sincronización central preparada':'Modo local protegido'}</b><span>${current.pending} pendiente(s) · ${current.conflicts} en revisión</span></div>${isEvaluator()?'<button class="secondary" data-view="sync-status">Ver estado</button>':isSupervisor()?'<button class="secondary" data-view="sync-monitor">Ver equipo</button>':''}</section>`);
    if(isEvaluator()){
      const legacyExport=document.querySelector('.actions-grid [data-view="export"]');
      if(legacyExport){legacyExport.dataset.view='sync-status';const heading=legacyExport.querySelector('b');const paragraph=legacyExport.querySelector('p');if(heading)heading.textContent='Sincronización';if(paragraph)paragraph.textContent='Revisa qué evaluaciones ya están confirmadas en Drive.';}
      const localPanel=document.querySelector('.status-panel');
      const localText=localPanel?.querySelector('p');if(localText)localText.textContent='La información se guarda primero en este equipo y se envía automáticamente cuando hay conexión. Nunca se limpia un registro pendiente o sin recibo.';
      const localLabel=localPanel?.querySelector('.status-line span');if(localLabel)localLabel.textContent='Pendientes de sincronizar';
      const localValue=localPanel?.querySelector('.status-line b');if(localValue)localValue.textContent=String(current.pending);
    }
  }

  function decorateRecords(){
    if(!['records','record-detail'].includes(state.view))return;
    const headerRow=document.querySelector('#records-container thead tr');
    if(headerRow&&!headerRow.querySelector('.sync-status-header'))headerRow.querySelector('th:last-child')?.insertAdjacentHTML('beforebegin','<th class="sync-status-header">Sincronización</th>');
    document.querySelectorAll('[data-record]').forEach(row=>{
      const record=recordById(row.dataset.record);if(!record||row.querySelector('.sync-badge'))return;
      row.querySelector('td:last-child')?.insertAdjacentHTML('beforebegin',`<td>${syncBadge(record)}</td>`);
    });
    if(state.view==='record-detail'&&!document.querySelector('.record-sync-panel')){
      const record=recordById(state.selectedRecordId);const first=document.querySelector('.detail-summary');
      if(record&&first) first.insertAdjacentHTML('afterend',`<section class="panel record-sync-panel"><div><span>ESTADO DE SINCRONIZACIÓN</span><h2>${syncBadge(record)}</h2><p>${esc(record.sync?.message||'El registro permanece protegido en este dispositivo.')}</p></div></section>`);
    }
  }

  function decorateRenderedView(){
    if(typeof state==='undefined'||!state.session)return;
    normalizeSidebar();decorateHome();decorateRecords();
    if(isEvaluator()) document.querySelectorAll('#clear-records,.cleanup-guidance,.cleanup-profile-card,.device-security-card').forEach(element=>element.remove());
  }

  async function ensureEvaluatorQueue(){
    if(!isEvaluator()||migrationPromise)return migrationPromise;
    migrationPromise=(async()=>{
      const owner=cleanText(state.session.id).toUpperCase();
      for(const record of state.records.filter(item=>cleanText(item.evaluatorId).toUpperCase()===owner&&!item.sync?.status)){
        try{await enqueueRecord(record);}catch(error){console.warn('No se pudo migrar un registro a la cola:',record.id,error);}
      }
      await loadStores();
    })().finally(()=>{migrationPromise=null;});
    return migrationPromise;
  }

  function activateSessionSync(){
    const next=state.session?`${state.session.id}|${state.session.role}`:'';
    if(next===activeSessionKey)return;
    activeSessionKey=next;
    if(!next)return;
    setTimeout(()=>{
      if(isEvaluator())ensureEvaluatorQueue().then(()=>processQueue());
      else if(isSupervisor())refreshRemote().then(()=>{if(['charts','sync-monitor'].includes(state.view))render();}).catch(()=>{});
    },0);
  }

  function schedule(){
    if(syncState.timer) clearInterval(syncState.timer);
    syncState.timer=setInterval(()=>{
      if(document.visibilityState==='visible'&&navigator.onLine){processQueue();if(isSupervisor())refreshRemote().then(()=>{if(['charts','sync-monitor'].includes(state.view))render();}).catch(()=>{});}
    },config.refreshSeconds*1000);
  }

  const previousSaveEvaluation=saveEvaluation;
  saveEvaluation=async function synchronizedSaveEvaluation(form){
    const result=await previousSaveEvaluation(form);
    if(!result)return result;
    const record=recordById(state.selectedRecordId);
    if(record){try{await enqueueRecord(record);showToast('Evaluación guardada localmente; sincronización en segundo plano.');if(state.view==='record-detail')render();}catch(error){console.error(error);recordSync(record,{status:'error',message:'Guardada localmente; no se pudo preparar la cola.'});await save();}}
    return result;
  };

  const previousRender=render;
  render=function synchronizationRender(){
    if(state.session&&state.view==='sync-status') evaluatorSyncView();
    else if(state.session&&state.view==='sync-monitor') monitorView();
    else if(state.session&&state.view==='sync-control') adminSyncView();
    else previousRender();
    decorateRenderedView();
    activateSessionSync();
  };

  const previousChartSource=window.FenologiaFileAnalysis?.getChartRecords?.bind(window.FenologiaFileAnalysis);
  if(window.FenologiaFileAnalysis){
    window.FenologiaFileAnalysis.getChartRecords=()=>{
      const historical=previousChartSource?previousChartSource():[];
      const active=isEvaluator()?state.records:syncState.remoteRecords;
      return core().deduplicateRecords([active,historical]);
    };
  }

  document.addEventListener('click',event=>{
    if(isEvaluator()&&event.target.closest('[data-view="export"],#clear-records')){
      event.preventDefault();event.stopImmediatePropagation();state.view='sync-status';render();return;
    }
    if(event.target.closest('#sync-now')){processQueue().then(()=>{render();showToast('Sincronización revisada.');});return;}
    if(event.target.closest('#install-sync-profile')){document.querySelector('#sync-profile-file')?.click();return;}
    if(event.target.closest('#refresh-sync-monitor')){refreshRemote().then(()=>{render();showToast('Panel actualizado.');}).catch(error=>showToast(error.message));return;}
    if(event.target.closest('#test-sync-connection')){processQueue().then(result=>showToast(result.lastError||'Prueba de conexión finalizada.'));return;}
    const resolveButton=event.target.closest('[data-resolve-sync-alert]');if(resolveButton){resolveAlert(resolveButton.dataset.resolveSyncAlert).then(()=>render());}
    const remoteResolve=event.target.closest('[data-resolve-remote-alert]');if(remoteResolve){resolveRemoteAlert(remoteResolve.dataset.resolveRemoteAlert).then(()=>{render();showToast('Alerta central marcada como revisada.');}).catch(error=>showToast(error.message));}
  },true);

  document.addEventListener('change',event=>{
    if(event.target.id!=='sync-profile-file')return;
    installProfile(event.target.files?.[0]).then(()=>{showToast('Perfil instalado solamente en este dispositivo.');render();if(navigator.onLine)processQueue();}).catch(error=>showToast(error.message||'No se pudo instalar el perfil.')).finally(()=>{event.target.value='';});
  },true);

  document.addEventListener('submit',event=>{
    if(event.target.id==='sync-profile-form'){
      event.preventDefault();event.stopImmediatePropagation();
      createProfile(event.target).then(profile=>{event.target.deviceToken.value='';showToast(`Perfil creado para ${profile.evaluatorId}.`);}).catch(error=>showToast(error.message||'No se pudo crear el perfil.'));
      return;
    }
    if(event.target.id!=='sync-config-form')return;
    event.preventDefault();event.stopImmediatePropagation();
    const data=Object.fromEntries(new FormData(event.target));
    data.enabled=data.enabled==='true';data.cleanupEnabled=event.target.cleanupEnabled.checked;
    persistConfig(data).then(()=>{showToast('Configuración local guardada. No se publicó ningún servicio.');render();}).catch(error=>showToast(error.message||'No se pudo guardar la configuración.'));
  },true);

  window.addEventListener('online',()=>processQueue());
  window.addEventListener('fenologia-db-external-change',()=>loadStores().then(decorateRenderedView));

  async function initialize(){
    await loadStores();syncState.ready=true;schedule();decorateRenderedView();
    await ensureEvaluatorQueue();
    if(navigator.onLine) setTimeout(()=>processQueue(),500);
    window.dispatchEvent(new CustomEvent('fenologia-sync-ready',{detail:status()}));
  }

  window.FenologiaSync={VERSION,initialize,ready:initialize(),status,getConfig:()=>({...config}),saveConfig:persistConfig,createProfile:downloadProfile,installProfile,enqueueRecord,processQueue,refreshRemote,runAutomaticCleanup,resolveRemoteAlert,getChartRecords:()=>core().deduplicateRecords([isEvaluator()?state.records:syncState.remoteRecords]),state:syncState};
})();
