(() => {
  const VERSION='0.16.0';
  const SYSTEM_EPOCH='fresh-start-v1';
  const CLEANUP_ADMIN_KEY='fenologia-cleanup-admin-profiles-v1';
  const CONFIG_KEY='admin-config-v1';
  const CACHE_KEY='fenologia-admin-config-cache-v1';

  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const safe=value=>String(value??'').trim();
  const readJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;}};
  const now=()=>new Date().toISOString();

  function cleanupProfileFor(target){
    if(target?.role!=='Evaluador') return null;
    const profile=readJson(CLEANUP_ADMIN_KEY,{})?.[target.id];
    if(!profile) return null;
    return {
      type:'fenologia-cleanup-profile',
      version:1,
      evaluatorId:profile.evaluatorId,
      evaluatorName:profile.evaluatorName,
      secret:profile.secret,
      issuedAt:profile.createdAt,
      issuedBy:profile.createdBy,
      revision:profile.revision,
      validUntil:new Date(new Date(profile.createdAt).getTime()+90*86400000).toISOString(),
      embeddedInSignedPackage:true
    };
  }

  function normalizedPermissions(user){
    const permissions=new Set(Array.isArray(user.permissions)?user.permissions:[]);
    if(user.role==='Evaluador'){
      permissions.add('evaluate');
      permissions.add('records');
      permissions.add('export');
      permissions.add('map');
      permissions.delete('charts');
      permissions.delete('consolidate');
      permissions.delete('admin');
    }
    if(user.role==='Administrador'){
      ['evaluate','records','export','consolidate','map','charts','admin'].forEach(permission=>permissions.add(permission));
    }
    return [...permissions];
  }

  async function downloadAccess(userId){
    if(state?.session?.role!=='Administrador') return showToast('Solo el Administrador puede descargar accesos.');
    const config=window.FenologiaAdmin?.config?.();
    if(!config||!Array.isArray(config.users)) return showToast('La configuración de usuarios aún no está disponible.');
    const target=config.users.find(user=>user.id===userId&&user.active!==false);
    if(!target) return showToast('El usuario no existe o está inactivo.');
    if(!safe(target.pinHash)) return showToast('El usuario no tiene un DNI configurado.');

    const activeUsers=config.users.filter(user=>user.active!==false);
    const directory=activeUsers.map(user=>({
      id:user.id,
      name:user.name,
      role:user.role,
      active:true,
      permissions:normalizedPermissions(user),
      pinHash:user.id===target.id?user.pinHash:null,
      pinSalt:user.id===target.id?user.pinSalt:null,
      pinAlgorithm:user.id===target.id?user.pinAlgorithm:null,
      pinIterations:user.id===target.id?user.pinIterations:null,
      loginAllowed:user.id===target.id
    }));
    const cleanupProfile=cleanupProfileFor(target);
    const core={
      type:'fenologia-config-package',
      version:2,
      systemEpoch:SYSTEM_EPOCH,
      packageId:`PKG-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`,
      issuedAt:now(),
      issuedBy:state.session.name,
      revision:Number(config.revision||1),
      target:{id:target.id,name:target.name,role:target.role},
      users:directory,
      catalog:clone(config.catalog||state.catalog),
      assignments:clone(config.assignments||state.assignments||{}),
      campaigns:clone(config.campaigns||[]),
      map:clone(window.FenologiaAdmin?.map?.()||null),
      cleanupProfile,
      dynamicParameters:window.FenologiaDynamicParameters?.parameters?.()||[]
    };
    const payload=await window.FenologiaPackageSecurity.sign(core);
    const stamp=(typeof today==='function'?today():new Date().toISOString().slice(0,10)).replaceAll('-','');
    const result=await downloadFile(`ACCESO_FENOLOGIA_${target.id}_${stamp}.json`,JSON.stringify(payload,null,2),'application/json');
    if(!result?.ok)return showToast('La descarga del acceso fue cancelada.');
    showToast(cleanupProfile
      ? `Acceso de ${target.name} descargado; incluye autorización de limpieza.`
      : `Acceso de ${target.name} descargado.`);
    return result;
  }

  function devicePreparationModal(target){
    const syncConfig=window.FenologiaSync?.getConfig?.()||{};
    const endpoint=safe(syncConfig.endpoint);
    return `<div class="admin-modal-backdrop" id="admin-modal"><section class="admin-modal device-preparation-modal">
      <div class="admin-modal-head"><div><span>PREPARAR DISPOSITIVO</span><h2>${esc(target.name)}</h2></div><button type="button" data-close-admin-modal>×</button></div>
      <div class="device-preparation-identity"><b>${esc(target.id)}</b><span>${esc(target.role)}</span><small>Activo · nombre, ID y rol bloqueados para evitar cruces</small></div>
      <section class="device-preparation-step required-step">
        <div class="device-step-number">1</div><div><span>ACCESO LOCAL · OBLIGATORIO</span><h3>Permitir el ingreso con nombre y DNI</h3><p>Este es el archivo que se importa en la pantalla de bienvenida del celular. No contiene el token de Drive.</p><code>ACCESO_FENOLOGIA_${esc(target.id)}_AAAAMMDD.json</code></div>
        <button type="button" class="primary" data-prepare-access="${esc(target.id)}">Descargar acceso</button>
      </section>
      <form id="prepare-device-sync-form" class="device-preparation-step sync-step">
        <input type="hidden" name="evaluatorId" value="${esc(target.id)}"><input type="hidden" name="evaluator" value="${esc(target.name)}"><input type="hidden" name="role" value="${esc(target.role)}">
        <div class="device-step-number">2</div><div><span>SINCRONIZACIÓN DRIVE · DESPUÉS DE INGRESAR</span><h3>Conectar este usuario con la base central</h3><p>Usa exactamente el token registrado en Apps Script para <b>${esc(target.id)}</b>.</p>
          <div class="device-preparation-fields"><label>URL del servicio<input name="endpoint" type="url" value="${esc(endpoint)}" placeholder="https://script.google.com/macros/s/.../exec" required></label><label>Token individual de Apps Script<input name="deviceToken" type="password" minlength="24" autocomplete="new-password" required></label></div>
          <code>Perfil-Sync-${esc(target.id)}.json</code><small class="device-preparation-help">Se instala desde “Sincronización” después de iniciar sesión. Nunca se importa en la bienvenida.</small>
        </div><button type="submit" class="secondary">Descargar Perfil-Sync</button>
      </form>
      <div class="device-preparation-result" id="device-preparation-result" role="status">Primero entrega el acceso local. El perfil de Drive puede prepararse después, cuando Apps Script esté desplegado.</div>
    </section></div>`;
  }

  function openDevicePreparation(userId){
    if(state?.session?.role!=='Administrador')return showToast('Solo el Administrador puede preparar dispositivos.');
    const config=window.FenologiaAdmin?.config?.();
    const target=config?.users?.find(user=>user.id===userId&&user.active!==false);
    if(!target)return showToast('El usuario no existe o está inactivo.');
    const host=document.querySelector('#admin-modal-host');
    if(!host)return showToast('Abre “Usuarios y roles” para preparar el dispositivo.');
    host.innerHTML=devicePreparationModal(target);
  }

  async function alignEvaluatorPermissions(){
    try{
      if(state?.session?.role!=='Administrador') return;
      const config=window.FenologiaAdmin?.config?.();
      if(!config||!Array.isArray(config.users)) return;
      let changed=false;
      config.users.forEach(user=>{
        const next=normalizedPermissions(user);
        if(JSON.stringify(next)!==JSON.stringify(user.permissions||[])){
          user.permissions=next;
          user.updatedAt=now();
          changed=true;
        }
      });
      if(!changed) return;
      config.revision=Number(config.revision||0)+1;
      config.updatedAt=now();
      localStorage.setItem(CACHE_KEY,JSON.stringify(config));
      localStorage.setItem('fenologia-admin-config-v1',JSON.stringify(config));
      if(window.FenologiaDB?.isReady?.()&&!window.FenologiaDB?.isFallback?.()) await window.FenologiaDB.setSetting(CONFIG_KEY,config);
    }catch(error){console.warn('No se pudieron alinear los permisos de los usuarios:',error);}
  }

  function decorateLogin(){
    document.querySelector('.demo-note')?.remove();
    const button=document.querySelector('#login-import-config');
    if(button&&button.textContent!=='Importar acceso') button.textContent='Importar acceso';
    const card=button?.closest('.config-login-import');
    const title=card?.querySelector('b');
    const text=card?.querySelector('p');
    if(title&&!title.textContent.includes('configurado para')&&title.textContent!=='Configurar este dispositivo') title.textContent='Configurar este dispositivo';
    const accessText='Importa el archivo de acceso entregado por el Administrador.';
    if(text&&text.textContent!==accessText) text.textContent=accessText;
  }

  function decorateSecurity(){
    if(state?.session?.role!=='Administrador'||state.view!=='cleanup-security') return;
    document.querySelectorAll('[data-download-cleanup-profile]').forEach(button=>{
      if(button.textContent!=='Descargar acceso') button.textContent='Descargar acceso';
      const title='Archivo completo para configurar el dispositivo e ingresar con nombre y DNI.';
      if(button.title!==title) button.title=title;
    });
    const heading=document.querySelector('.security-profile-list')?.closest('.panel')?.querySelector('.panel-head h2');
    if(heading&&heading.textContent!=='Evaluadores y códigos semanales') heading.textContent='Evaluadores y códigos semanales';
    const head=document.querySelector('.security-profile-list')?.closest('.panel')?.querySelector('.panel-head>div');
    if(head&&!head.querySelector('.access-security-note')){
      const note=document.createElement('p');
      note.className='access-security-note';
      note.textContent='Aquí se muestran solo usuarios con rol Evaluador. Supervisor y Administrador no requieren autorización semanal de limpieza.';
      head.appendChild(note);
    }
  }

  function decorateUsers(){
    if(state?.session?.role!=='Administrador'||state.view!=='users') return;
    document.querySelectorAll('.admin-user-card').forEach(card=>{
      if(card.querySelector('[data-prepare-user-device]')) return;
      card.querySelector('[data-download-user-access]')?.remove();
      const text=card.querySelector('.admin-user-main small')?.textContent||'';
      const match=text.match(/\b(?:EVA|SUP|ADM)-\d+\b/);
      const userId=match?.[0];
      if(!userId||userId===state.session?.id) return;
      const actions=card.querySelector('.admin-row-actions');
      if(!actions) return;
      const button=document.createElement('button');
      button.type='button';
      button.className='primary';
      button.dataset.prepareUserDevice=userId;
      button.textContent='Preparar dispositivo';
      button.title='Generar el acceso local y, cuando corresponda, el perfil individual de Drive.';
      actions.prepend(button);
    });
  }

  function decorate(){
    decorateLogin();
    decorateSecurity();
    decorateUsers();
  }

  document.addEventListener('click',async event=>{
    const prepareButton=event.target.closest?.('[data-prepare-user-device]');
    if(prepareButton){event.preventDefault();event.stopImmediatePropagation();openDevicePreparation(prepareButton.dataset.prepareUserDevice);return;}
    const accessButton=event.target.closest?.('[data-prepare-access]');
    if(accessButton){event.preventDefault();event.stopImmediatePropagation();await downloadAccess(accessButton.dataset.prepareAccess);const result=document.querySelector('#device-preparation-result');if(result)result.textContent='Acceso local descargado. En el celular del destinatario usa “Importar acceso” antes de iniciar sesión.';return;}
    const securityButton=event.target.closest?.('[data-download-cleanup-profile]');
    if(securityButton){
      event.preventDefault();
      event.stopImmediatePropagation();
      downloadAccess(securityButton.dataset.downloadCleanupProfile);
      return;
    }
    const userButton=event.target.closest?.('[data-download-user-access]');
    if(userButton){
      event.preventDefault();
      event.stopImmediatePropagation();
      downloadAccess(userButton.dataset.downloadUserAccess);
    }
  },true);

  document.addEventListener('submit',async event=>{
    if(event.target.id!=='prepare-device-sync-form')return;
    event.preventDefault();event.stopImmediatePropagation();
    try{
      const values=Object.fromEntries(new FormData(event.target));
      if(!window.FenologiaSync?.createProfile)throw new Error('El módulo de sincronización todavía no está disponible.');
      const profile=await window.FenologiaSync.createProfile(values);
      event.target.deviceToken.value='';
      const result=document.querySelector('#device-preparation-result');
      if(result)result.textContent=`Perfil ${profile.evaluatorId} descargado. Instálalo únicamente después de ingresar como ${profile.evaluator}.`;
      showToast(`Perfil individual preparado para ${profile.evaluatorId}.`);
    }catch(error){showToast(error.message||'No se pudo preparar el perfil individual.');}
  },true);

  const observer=new MutationObserver(mutations=>{
    if(!mutations.some(mutation=>mutation.addedNodes.length)) return;
    decorate();
  });
  observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});

  window.addEventListener('fenologia-app-ready',()=>{
    alignEvaluatorPermissions().finally(decorate);
  },{once:true});

  setTimeout(()=>alignEvaluatorPermissions().finally(decorate),0);
  decorate();
  window.FenologiaUserAccess={version:VERSION,downloadAccess,openDevicePreparation};
})();
