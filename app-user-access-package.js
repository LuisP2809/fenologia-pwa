(() => {
  const VERSION='0.13.12';
  const CLEANUP_ADMIN_KEY='fenologia-cleanup-admin-profiles-v1';
  const CONFIG_KEY='admin-config-v1';
  const CACHE_KEY='fenologia-admin-config-cache-v1';

  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const safe=value=>String(value??'').trim();
  const readJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;}};
  const now=()=>new Date().toISOString();

  async function checksum(core){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(core)));
    return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

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
      revision:profile.revision
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
      loginAllowed:user.id===target.id
    }));
    const cleanupProfile=cleanupProfileFor(target);
    const core={
      type:'fenologia-config-package',
      version:1,
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
      cleanupProfile
    };
    const payload={...core,checksum:await checksum(core)};
    const stamp=(typeof today==='function'?today():new Date().toISOString().slice(0,10)).replaceAll('-','');
    downloadFile(`ACCESO_FENOLOGIA_${target.id}_${stamp}.json`,JSON.stringify(payload,null,2),'application/json');
    showToast(cleanupProfile
      ? `Acceso de ${target.name} descargado; incluye autorización de limpieza.`
      : `Acceso de ${target.name} descargado.`);
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
      if(card.querySelector('[data-download-user-access]')) return;
      const text=card.querySelector('.admin-user-main small')?.textContent||'';
      const match=text.match(/\b(?:EVA|SUP|ADM)-\d+\b/);
      const userId=match?.[0];
      if(!userId||userId===state.session?.id) return;
      const actions=card.querySelector('.admin-row-actions');
      if(!actions) return;
      const button=document.createElement('button');
      button.type='button';
      button.className='secondary';
      button.dataset.downloadUserAccess=userId;
      button.textContent='Descargar acceso';
      button.title=userId.startsWith('ADM-')?'Generar acceso administrativo para otro dispositivo.':'Generar archivo de acceso para este usuario.';
      actions.prepend(button);
    });
  }

  function decorate(){
    decorateLogin();
    decorateSecurity();
    decorateUsers();
  }

  document.addEventListener('click',event=>{
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
  window.FenologiaUserAccess={version:VERSION,downloadAccess};
})();