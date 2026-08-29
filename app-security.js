(() => {
  const ADMIN_PROFILES_KEY = 'fenologia-cleanup-admin-profiles-v1';
  const DEVICE_PROFILE_KEY = 'fenologia-cleanup-device-profile-v1';
  const HISTORY_KEY = 'fenologia-cleanup-history-v1';
  const ATTEMPTS_KEY = 'fenologia-cleanup-code-attempts-v1';
  const encoder = new TextEncoder();

  const readJson = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  };
  const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const bytesToBase64Url = bytes => {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  };
  const base64UrlToBytes = value => {
    const padded = value.replaceAll('-','+').replaceAll('_','/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  };
  const randomSecret = () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
  };
  const dateText = value => value ? new Intl.DateTimeFormat('es-PE',{dateStyle:'medium'}).format(new Date(value)) : '—';

  function isoWeekInfo(input = new Date()){
    const date = new Date(input.getFullYear(), input.getMonth(), input.getDate());
    const day = date.getDay() || 7;
    const thursday = new Date(date);
    thursday.setDate(date.getDate() + 4 - day);
    const year = thursday.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const week = Math.ceil((((thursday - yearStart) / 86400000) + 1) / 7);
    const monday = new Date(date);
    monday.setDate(date.getDate() - day + 1);
    monday.setHours(0,0,0,0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);
    return {year,week,key:`${year}-W${String(week).padStart(2,'0')}`,monday,sunday};
  }

  async function calculateWeeklyCode(profile, input = new Date()){
    const week = isoWeekInfo(input);
    const key = await crypto.subtle.importKey('raw', base64UrlToBytes(profile.secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
    const message = `FENOLOGIA|LIMPIEZA|${profile.evaluatorId}|${week.key}`;
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
    const number = (((signature[0] << 24) >>> 0) + (signature[1] << 16) + (signature[2] << 8) + signature[3]) % 1000000;
    return {code:String(number).padStart(6,'0'),week};
  }

  function getAdminProfiles(){ return readJson(ADMIN_PROFILES_KEY, {}); }
  function saveAdminProfiles(profiles){ writeJson(ADMIN_PROFILES_KEY, profiles); }
  function getDeviceProfile(){ return readJson(DEVICE_PROFILE_KEY, null); }
  function saveDeviceProfile(profile){ writeJson(DEVICE_PROFILE_KEY, profile); }
  function getHistory(){ return readJson(HISTORY_KEY, []); }
  function saveHistory(history){ writeJson(HISTORY_KEY, history); }
  function addHistory(entry){ const history=getHistory(); history.push(entry); saveHistory(history); }
  function mergeHistory(incoming=[]){
    const merged = new Map(getHistory().map(item=>[item.id,item]));
    incoming.forEach(item=>{ if(item?.id) merged.set(item.id,item); });
    saveHistory([...merged.values()]);
  }

  function createOrRotateProfile(evaluatorId){
    if(!isAdmin()) return null;
    const evaluator = users.find(user=>user.id===evaluatorId && user.role==='Evaluador');
    if(!evaluator) return null;
    const profiles = getAdminProfiles();
    profiles[evaluatorId] = {
      evaluatorId,
      evaluatorName:evaluator.name,
      secret:randomSecret(),
      active:true,
      createdAt:new Date().toISOString(),
      createdBy:state.session.name,
      revision:(profiles[evaluatorId]?.revision||0)+1
    };
    saveAdminProfiles(profiles);
    return profiles[evaluatorId];
  }

  async function downloadEnrollmentProfile(evaluatorId){
    if(!isAdmin()) return showToast('Solo el Administrador puede crear perfiles de autorización.');
    const profile = getAdminProfiles()[evaluatorId];
    if(!profile) return showToast('Primero crea el perfil del evaluador.');
    const validUntil=new Date(new Date(profile.createdAt).getTime()+90*86400000).toISOString();
    const core = {
      type:'fenologia-cleanup-profile',
      version:2,
      evaluatorId:profile.evaluatorId,
      evaluatorName:profile.evaluatorName,
      secret:profile.secret,
      issuedAt:profile.createdAt,
      issuedBy:profile.createdBy,
      revision:profile.revision,
      validUntil
    };
    const payload=await window.FenologiaPackageSecurity.sign(core);
    const result=await downloadFile(`PERFIL_LIMPIEZA_${evaluatorId}.json`,JSON.stringify(payload,null,2),'application/json');
    if(!result?.ok)return showToast('La descarga del perfil fue cancelada.');
    showToast('Perfil descargado. Entrégalo únicamente al evaluador correspondiente.');
  }

  async function importEnrollmentProfile(file){
    const payload = JSON.parse(await file.text());
    if(payload?.type!=='fenologia-cleanup-profile'||payload?.version!==2||!payload.evaluatorId||!payload.secret) throw new Error('El archivo no es un perfil firmado compatible.');
    const verified=await window.FenologiaPackageSecurity.verify(payload);
    if(verified.pendingTrust){
      const shown=verified.fingerprint.match(/.{1,4}/g).join('-');
      if(!confirm(`Primera vinculación administrativa. Compara esta huella por un canal confiable:\n\n${shown}\n\n¿Confirmas que pertenece al Administrador?`))throw new Error('La identidad firmante no fue autorizada.');
      await window.FenologiaPackageSecurity.trust(payload.signature.publicKey);
    }
    const profile=verified.core;
    if(state.session.role!=='Evaluador') throw new Error('El perfil solo puede vincularse desde el rol Evaluador.');
    if(profile.evaluatorId!==state.session.id) throw new Error('Este perfil pertenece a otro evaluador.');
    if(!profile.validUntil||Date.now()>new Date(profile.validUntil).getTime())throw new Error('El perfil de limpieza está vencido. Solicita uno nuevo.');
    const current=getDeviceProfile();if(current&&Number(profile.revision)<Number(current.revision||0))throw new Error('No se puede instalar una revisión anterior del perfil.');
    await calculateWeeklyCode(profile);
    saveDeviceProfile({...profile,signatureFingerprint:verified.fingerprint,enrolledAt:new Date().toISOString()});
    localStorage.removeItem(ATTEMPTS_KEY);
    return payload;
  }

  function attemptsState(){ return readJson(ATTEMPTS_KEY,{count:0,lockedUntil:null,week:null}); }
  function resetAttempts(){ localStorage.removeItem(ATTEMPTS_KEY); }
  async function verifyWeeklyCode(value){
    const profile = getDeviceProfile();
    if(!profile) return {ok:false,message:'Este celular todavía no está vinculado con un perfil creado por el Administrador.'};
    if(profile.evaluatorId!==state.session.id) return {ok:false,message:'El perfil vinculado no corresponde al usuario actual.'};
    if(profile.validUntil&&Date.now()>new Date(profile.validUntil).getTime())return {ok:false,message:'El perfil de limpieza venció. Solicita al Administrador un perfil actualizado.'};
    const currentWeek = isoWeekInfo();
    if(profile.lastVerifiedWeek&&currentWeek.key<profile.lastVerifiedWeek)return {ok:false,message:'La fecha del dispositivo es anterior a la última autorización registrada. Revisa fecha y hora.'};
    const attempts = attemptsState();
    if(attempts.lockedUntil && Date.now()<new Date(attempts.lockedUntil).getTime()){
      const minutes=Math.ceil((new Date(attempts.lockedUntil).getTime()-Date.now())/60000);
      return {ok:false,message:`Demasiados intentos. Vuelve a probar en ${minutes} minuto(s).`};
    }
    if(attempts.week!==currentWeek.key) resetAttempts();
    const expected = await calculateWeeklyCode(profile);
    if(String(value).trim()===expected.code){ resetAttempts();saveDeviceProfile({...profile,lastVerifiedWeek:currentWeek.key,lastVerifiedAt:new Date().toISOString()});return {ok:true,week:expected.week,message:'Código semanal validado.'}; }
    const nextCount=(attempts.week===currentWeek.key?attempts.count:0)+1;
    const next={count:nextCount,week:currentWeek.key,lockedUntil:null};
    if(nextCount>=5) next.lockedUntil=new Date(Date.now()+10*60000).toISOString();
    writeJson(ATTEMPTS_KEY,next);
    return {ok:false,message:next.lockedUntil?'Código incorrecto. El ingreso quedó bloqueado durante 10 minutos.':`Código incorrecto. Intento ${nextCount} de 5.`};
  }

  function recordCleanup({recordCount,lastBackup,authorizationWeek,method='weekly-code'}){
    addHistory({
      id:`CL-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      evaluatorId:state.session.id,
      evaluator:state.session.name,
      role:state.session.role,
      cleanedAt:new Date().toISOString(),
      recordCount,
      lastBackup:lastBackup||null,
      authorizationWeek:authorizationWeek||isoWeekInfo().key,
      authorizationMethod:method
    });
  }

  function securityView(){
    if(!isAdmin()){state.view='home';return homeView();}
    const profiles=getAdminProfiles();
    const evaluators=users.filter(user=>user.role==='Evaluador');
    const week=isoWeekInfo();
    app.innerHTML=shell(`${titleBlock('ADMINISTRADOR','Seguridad de limpieza','Solo el Administrador puede crear y renovar las autorizaciones semanales para eliminar datos.')}
      <section class="panel security-explainer">
        <div class="security-lock">🔐</div>
        <div><span>FUNCIONAMIENTO SIN BASE CENTRAL</span><h2>Autorización válida sin internet</h2><p>Cada evaluador vincula su celular una sola vez con el perfil que tú generas. Después, el código cambia automáticamente cada semana y puede validarse sin conexión.</p></div>
      </section>
      <section class="security-week panel"><div><span>SEMANA VIGENTE</span><h2>${week.key}</h2><p>${dateText(week.monday.toISOString())} – ${dateText(week.sunday.toISOString())}</p></div><div class="security-week-badge">6 dígitos</div></section>
      <section class="panel"><div class="panel-head"><div><span>EVALUADORES</span><h2>Perfiles y códigos semanales</h2></div></div>
        <div class="security-profile-list">${evaluators.map(user=>{
          const profile=profiles[user.id];
          return `<article class="security-profile-row">
            <div class="security-avatar">${esc(user.name.split(' ').map(part=>part[0]).slice(0,2).join(''))}</div>
            <div class="security-person"><b>${esc(user.name)}</b><small>${esc(user.id)} · ${profile?'Perfil activo':'Sin perfil vinculado'}</small></div>
            <div class="weekly-code ${profile?'':'empty'}" data-weekly-code="${user.id}">${profile?'••••••':'—'}</div>
            <div class="security-profile-actions">
              ${profile?`<button class="secondary" data-copy-cleanup-code="${user.id}">Copiar código</button><button class="secondary" data-download-cleanup-profile="${user.id}">Descargar perfil</button><button class="danger-soft" data-create-cleanup-profile="${user.id}">Renovar</button>`:`<button class="primary" data-create-cleanup-profile="${user.id}">Crear perfil</button>`}
            </div>
          </article>`;
        }).join('')}</div>
      </section>
      <section class="panel security-note"><b>Importante</b><p>La renovación genera una revisión nueva y el evaluador debe importarla. Sin conexión central, un celular que conserve el perfil anterior podrá usarlo hasta su vencimiento; para revocación inmediata se requiere sincronización con un servidor.</p></section>`);
    evaluators.forEach(async user=>{
      const profile=profiles[user.id]; if(!profile)return;
      const target=document.querySelector(`[data-weekly-code="${user.id}"]`);
      try{const result=await calculateWeeklyCode(profile);if(target)target.textContent=result.code;}catch{if(target)target.textContent='ERROR';}
    });
  }

  const previousSidebar=sidebar;
  sidebar=function securitySidebar(){
    let html=previousSidebar().replace('Versión 0.4.2','Versión 0.5');
    if(isAdmin()&&!html.includes('data-view="cleanup-security"')){
      html=html.replace('</nav>',`<button data-view="cleanup-security" class="${state.view==='cleanup-security'?'active':''}"><span>🔐</span>Seguridad de limpieza</button></nav>`);
    }
    return html;
  };

  const previousRender=render;
  render=function securityRender(){
    if(state.session&&state.view==='cleanup-security') return securityView();
    return previousRender();
  };

  const previousExportView=exportView;
  exportView=function securityExportView(){
    previousExportView();
    const grid=document.querySelector('.export-grid');
    if(grid&&!document.querySelector('.internal-backup-card')){
      const manifest=readJson('fenologia-last-backup-manifest-v1',null);
      grid.insertAdjacentHTML('beforebegin',`<section class="panel device-security-card internal-backup-card">
        <div class="device-security-icon">💾</div>
        <div><span>RECUPERACIÓN LOCAL</span><h2>Copia interna verificada</h2><p>${manifest?`Última copia: ${dateText(manifest.createdAt)} · ${Number(manifest.recordCount||0)} registros.`:'Crea un respaldo para habilitar una copia interna verificable antes de limpiar.'}</p></div>
        <button class="secondary" id="restore-internal-backup" ${manifest?'':'disabled'}>Restaurar copia interna</button>
      </section>`);
    }
    if(state.session.role!=='Evaluador') return;
    const profile=getDeviceProfile();
    if(!grid||document.querySelector('.cleanup-profile-card'))return;
    grid.insertAdjacentHTML('beforebegin',`<section class="panel device-security-card cleanup-profile-card">
      <div class="device-security-icon">${profile?'🛡️':'🔗'}</div>
      <div><span>AUTORIZACIÓN DE LIMPIEZA</span><h2>${profile?'Celular vinculado':'Vincula este celular'}</h2><p>${profile?`Perfil de ${esc(profile.evaluatorName)} · vinculado ${dateText(profile.enrolledAt)}`:'Importa una sola vez el perfil entregado por el Administrador. Después podrás validar los códigos semanales sin internet.'}</p></div>
      <button class="${profile?'secondary':'primary'}" id="import-cleanup-profile">${profile?'Reemplazar perfil':'Importar perfil'}</button>
      <input type="file" id="cleanup-profile-file" accept="application/json,.json" hidden>
    </section>`);
  };

  createBackup=async function securedBackup(){
    await window.FenologiaDB?.flush?.();
    const createdAt=new Date().toISOString();
    const filename=`RESPALDO_FENOLOGIA_${today().replaceAll('-','')}.json`;
    const payload={
      type:'fenologia-full-backup',version:3,createdAt,records:state.records,assignments:state.assignments,
      cleanupHistory:getHistory(),adminConfig:window.FenologiaAdmin?.config?.()||null,adminMap:window.FenologiaAdmin?.map?.()||null,
      dynamicParameters:window.FenologiaDynamicParameters?.parameters?.()||[],deviceBinding:readJson('device-config-v2',null),
      cleanupDeviceProfile:getDeviceProfile()
    };
    const result=await downloadFile(filename,JSON.stringify(payload,null,2),'application/json');
    if(!result?.ok) return showToast('El respaldo fue cancelado; la limpieza continúa bloqueada.');
    const newestAt=state.records.reduce((latest,record)=>Math.max(latest,new Date(record.updatedAt||record.createdAt||0).getTime()||0),0);
    const manifest={createdAt,filename,recordCount:state.records.length,newestAt,externalPersisted:Boolean(result.persisted)};
    let internalVerified=false;
    if(window.FenologiaDB?.isReady?.()&&!window.FenologiaDB?.isFallback?.()){
      await window.FenologiaDB.setSetting('verified-backup-v1',{payload,manifest});
      const verified=await window.FenologiaDB.getSetting('verified-backup-v1');
      internalVerified=verified?.manifest?.createdAt===createdAt&&verified?.manifest?.recordCount===state.records.length;
    }
    if(!result.persisted&&!internalVerified) return showToast('No se confirmó una copia persistente. La limpieza continúa bloqueada.');
    localStorage.setItem('fenologia-last-backup',createdAt);
    localStorage.setItem('fenologia-last-backup-manifest-v1',JSON.stringify(manifest));
    showToast(result.persisted?'Respaldo guardado y verificado.':'Respaldo preparado y copia interna verificada.');
    exportView();
  };

  importBackup=async function securedImportBackup(file){
    const previousRecords=state.records,previousAssignments=state.assignments;
    try{
      if(file.size>25*1024*1024)throw new Error('El respaldo supera el límite de 25 MB.');
      const payload=JSON.parse(await file.text());
      if(!payload||!Array.isArray(payload.records)||typeof payload.assignments!=='object') throw new Error('El archivo no tiene la estructura de respaldo válida.');
      const existing=new Map(state.records.map(record=>[record.id,record]));let added=0,updated=0,unchanged=0;
      payload.records.forEach(incoming=>{
        if(!incoming?.id)return;
        const current=existing.get(incoming.id);
        if(!current){existing.set(incoming.id,incoming);added++;return;}
        const currentTime=new Date(current.updatedAt||current.createdAt||0).getTime();
        const incomingTime=new Date(incoming.updatedAt||incoming.createdAt||0).getTime();
        if(incomingTime>currentTime){existing.set(incoming.id,incoming);updated++;}else unchanged++;
      });
      if(payload.records.length>100000)throw new Error('El respaldo supera el límite de 100 000 registros.');
      state.records=[...existing.values()];
      state.assignments={...state.assignments,...payload.assignments};
      await save();
      if(Array.isArray(payload.cleanupHistory))mergeHistory(payload.cleanupHistory);
      showToast(`Importación: ${added} nuevos, ${updated} actualizados, ${unchanged} existentes.`);exportView();
    }catch(error){state.records=previousRecords;state.assignments=previousAssignments;showToast(error.message||'No se pudo importar el respaldo.');}
  };

  document.addEventListener('click',async event=>{
    if(event.target.closest('#restore-internal-backup')){
      const previousRecords=state.records,previousAssignments=state.assignments;
      try{
        const stored=await window.FenologiaDB?.getSetting?.('verified-backup-v1');
        const payload=stored?.payload;
        if(!payload||!Array.isArray(payload.records)||typeof payload.assignments!=='object') throw new Error('No se encontró una copia interna válida en este dispositivo.');
        if(payload.records.length>100000) throw new Error('La copia interna supera el límite de 100 000 registros.');
        if(!confirm(`Se combinarán ${payload.records.length} registros de la copia interna con los datos actuales. ¿Continuar?`))return;
        const existing=new Map(state.records.map(record=>[record.id,record]));
        payload.records.forEach(record=>{
          if(!record?.id)return;
          const current=existing.get(record.id);
          const currentTime=new Date(current?.updatedAt||current?.createdAt||0).getTime();
          const backupTime=new Date(record.updatedAt||record.createdAt||0).getTime();
          if(!current||backupTime>currentTime)existing.set(record.id,record);
        });
        state.records=[...existing.values()];state.assignments={...state.assignments,...payload.assignments};
        await save();
        if(Array.isArray(payload.cleanupHistory))mergeHistory(payload.cleanupHistory);
        showToast(`Copia interna restaurada: ${payload.records.length} registros verificados.`);exportView();
      }catch(error){state.records=previousRecords;state.assignments=previousAssignments;showToast(error.message||'No se pudo restaurar la copia interna.');}
      return;
    }
    const createButton=event.target.closest('[data-create-cleanup-profile]');
    if(createButton){
      if(!isAdmin())return showToast('Solo el Administrador puede crear autorizaciones.');
      const evaluatorId=createButton.dataset.createCleanupProfile;
      const exists=Boolean(getAdminProfiles()[evaluatorId]);
      if(exists&&!confirm('Al renovar, el evaluador deberá importar un perfil nuevo. ¿Continuar?'))return;
      createOrRotateProfile(evaluatorId);showToast(exists?'Perfil renovado.':'Perfil creado.');securityView();return;
    }
    const downloadButton=event.target.closest('[data-download-cleanup-profile]');
    if(downloadButton){await downloadEnrollmentProfile(downloadButton.dataset.downloadCleanupProfile);return;}
    const copyButton=event.target.closest('[data-copy-cleanup-code]');
    if(copyButton){
      if(!isAdmin())return showToast('Solo el Administrador puede consultar el código.');
      const profile=getAdminProfiles()[copyButton.dataset.copyCleanupCode];
      if(!profile)return showToast('No existe un perfil para este evaluador.');
      const result=await calculateWeeklyCode(profile);
      try{await navigator.clipboard.writeText(result.code);showToast(`Código ${result.code} copiado.`);}catch{showToast(`Código semanal: ${result.code}`);}
      return;
    }
    if(event.target.closest('#import-cleanup-profile')){document.querySelector('#cleanup-profile-file')?.click();return;}
  });

  document.addEventListener('change',async event=>{
    if(event.target.id!=='cleanup-profile-file'||!event.target.files?.[0])return;
    try{
      if(event.target.files[0].size>1024*1024) throw new Error('El perfil supera el límite de 1 MB.');
      await importEnrollmentProfile(event.target.files[0]);showToast('Celular vinculado correctamente con el Administrador.');exportView();
    }
    catch(error){showToast(error.message||'No se pudo importar el perfil.');}
    event.target.value='';
  });

  window.cleanupSecurity={isoWeekInfo,calculateWeeklyCode,getDeviceProfile,verifyWeeklyCode,recordCleanup,getHistory,mergeHistory};
})();
