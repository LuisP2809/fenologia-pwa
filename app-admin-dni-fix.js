(() => {
  const VERSION='0.13.8';
  const CONFIG_KEY='admin-config-v1';
  const HISTORY_KEY='admin-config-history-v1';
  const CACHE_KEY='fenologia-admin-config-cache-v1';
  const LOCAL_CONFIG_KEY='fenologia-admin-config-v1';
  const LOCAL_HISTORY_KEY='fenologia-admin-config-history-v1';
  const RETURN_KEY='fenologia-admin-return-users-after-save';
  const ROLE_DEFAULTS={
    Evaluador:['evaluate','records','export'],
    Supervisor:['consolidate','map','charts'],
    Administrador:['consolidate','map','charts','admin']
  };

  const isAdminUserPin=input=>input?.matches?.('#admin-user-form input[name="pin"]');
  const safe=value=>String(value??'').trim();
  const now=()=>new Date().toISOString();

  async function hashDni(dni){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`FENOLOGIA|PIN|${String(dni)}`));
    return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  function nextUserId(config,role){
    const prefix={Administrador:'ADM',Supervisor:'SUP',Evaluador:'EVA'}[role]||'USR';
    const used=new Set((config.users||[]).map(user=>user.id));
    for(let number=1;number<10000;number++){
      const id=`${prefix}-${String(number).padStart(3,'0')}`;
      if(!used.has(id)) return id;
    }
    return `${prefix}-${Date.now()}`;
  }

  function configureUserForm(root=document){
    const form=root.querySelector?.('#admin-user-form');
    if(!form) return;
    const input=form.querySelector('input[name="pin"]');
    if(input){
      input.setAttribute('type','text');
      input.setAttribute('inputmode','numeric');
      input.setAttribute('maxlength','8');
      input.setAttribute('pattern','[0-9]{8}');
      input.setAttribute('autocomplete','off');
      input.setAttribute('enterkeyhint','done');
      input.setAttribute('title','Ingresa exactamente 8 dígitos numéricos.');
      input.setAttribute('aria-label','DNI de 8 dígitos');

      const label=input.closest('label');
      if(label&&!label.dataset.dniLabelFixed){
        label.dataset.dniLabelFixed='1';
        for(const node of [...label.childNodes]){
          if(node.nodeType===Node.TEXT_NODE&&node.textContent.includes('DNI / PIN')){
            node.textContent=node.textContent.replace('DNI / PIN','DNI');
            break;
          }
        }
      }
    }

    const submit=form.querySelector('.admin-modal-actions button.primary');
    if(submit){
      submit.type='button';
      submit.id='admin-user-submit';
    }
  }

  function validateUserForm(form){
    const name=form.querySelector('[name="name"]');
    const pin=form.querySelector('[name="pin"]');
    const id=safe(form.querySelector('[name="id"]')?.value);
    const editing=Boolean(id);
    const cleanName=safe(name?.value);
    const cleanPin=(pin?.value||'').replace(/\D/g,'').slice(0,8);
    if(pin&&pin.value!==cleanPin) pin.value=cleanPin;

    if(!cleanName){showToast('Ingresa el nombre completo.');name?.focus();return null;}
    if((!editing&&!/^\d{8}$/.test(cleanPin))||(editing&&cleanPin&&!/^\d{8}$/.test(cleanPin))){
      showToast('El DNI debe contener exactamente 8 dígitos numéricos.');pin?.focus();return null;
    }
    if(pin) pin.setCustomValidity('');
    return {id,editing,name:cleanName,pin:cleanPin,role:safe(form.querySelector('[name="role"]')?.value)||'Evaluador'};
  }

  async function readStoredConfig(){
    if(window.FenologiaDB?.isReady?.()&&!window.FenologiaDB?.isFallback?.()){
      const stored=await window.FenologiaDB.getSetting(CONFIG_KEY);
      if(stored) return stored;
    }
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||localStorage.getItem(LOCAL_CONFIG_KEY)||'null');}
    catch{return null;}
  }

  async function saveHistory(action,detail){
    try{
      let history=[];
      if(window.FenologiaDB?.isReady?.()&&!window.FenologiaDB?.isFallback?.()){
        history=await window.FenologiaDB.getSetting(HISTORY_KEY)||[];
      }else{
        history=JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY)||'[]');
      }
      if(!Array.isArray(history)) history=[];
      history=[{id:`CFG-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,action,detail,actor:state.session?.name||'Administrador',createdAt:now()},...history].slice(0,500);
      localStorage.setItem(LOCAL_HISTORY_KEY,JSON.stringify(history));
      if(window.FenologiaDB?.isReady?.()&&!window.FenologiaDB?.isFallback?.()) await window.FenologiaDB.setSetting(HISTORY_KEY,history);
    }catch(error){console.warn('No se pudo registrar el historial administrativo:',error);}
  }

  async function persistUserDirectly(form,button){
    if(form.dataset.directSaving==='1') return;
    const values=validateUserForm(form);
    if(!values) return;

    form.dataset.directSaving='1';
    const originalText=button.textContent;
    button.disabled=true;
    button.textContent=values.editing?'Guardando…':'Creando…';

    try{
      const current=window.FenologiaAdmin?.config?.();
      if(!current||!Array.isArray(current.users)) throw new Error('La configuración administrativa aún no está disponible.');
      const config=JSON.parse(JSON.stringify(current));
      let user=values.editing?config.users.find(item=>item.id===values.id):null;
      const creating=!user;

      const permissions=[...form.querySelectorAll('input[name="permissions"]:checked')].map(input=>input.value);
      const finalPermissions=permissions.length?permissions:[...(ROLE_DEFAULTS[values.role]||[])];
      const pinHash=values.pin?await hashDni(values.pin):safe(user?.pinHash);
      if(!pinHash) throw new Error('Define un DNI de 8 dígitos para el usuario.');

      const duplicateName=config.users.find(item=>item.id!==values.id&&safe(item.name).toLowerCase()===values.name.toLowerCase());
      if(duplicateName) throw new Error('Ya existe un usuario con ese nombre.');
      const duplicateDni=config.users.find(item=>item.id!==values.id&&safe(item.pinHash)===pinHash);
      if(duplicateDni) throw new Error('Ese DNI ya está asignado a otro usuario.');

      if(!user){
        user={id:nextUserId(config,values.role),createdAt:now()};
        config.users.push(user);
      }
      user.name=values.name;
      user.role=values.role;
      user.active=form.querySelector('[name="active"]')?.checked!==false;
      user.permissions=finalPermissions;
      user.pinHash=pinHash;
      user.updatedAt=now();
      config.revision=Number(config.revision||0)+1;
      config.updatedAt=now();

      localStorage.setItem(CACHE_KEY,JSON.stringify(config));
      localStorage.setItem(LOCAL_CONFIG_KEY,JSON.stringify(config));
      if(window.FenologiaDB?.isReady?.()&&!window.FenologiaDB?.isFallback?.()){
        await window.FenologiaDB.setSetting(CONFIG_KEY,config);
      }

      const verified=await readStoredConfig();
      const saved=verified?.users?.find(item=>item.id===user.id&&item.pinHash===pinHash&&item.name===values.name);
      if(!saved) throw new Error('El usuario no pudo verificarse después del guardado.');

      await saveHistory(creating?'Usuario creado':'Usuario actualizado',{usuario:user.name,rol:user.role,estado:user.active?'activo':'inactivo'});
      sessionStorage.setItem(RETURN_KEY,creating?'Usuario creado correctamente.':'Usuario actualizado correctamente.');
      location.reload();
    }catch(error){
      console.error('No se pudo guardar el usuario:',error);
      delete form.dataset.directSaving;
      button.disabled=false;
      button.textContent=originalText;
      showToast(error.message||'No se pudo guardar el usuario.');
    }
  }

  document.addEventListener('input',event=>{
    if(!isAdminUserPin(event.target)) return;
    const cleaned=event.target.value.replace(/\D/g,'').slice(0,8);
    if(event.target.value!==cleaned) event.target.value=cleaned;
    event.target.setCustomValidity('');
  },true);

  document.addEventListener('invalid',event=>{
    if(!isAdminUserPin(event.target)) return;
    const value=event.target.value;
    event.target.setCustomValidity(value.length?'El DNI debe contener exactamente 8 dígitos numéricos.':'Ingresa el DNI de 8 dígitos.');
  },true);

  document.addEventListener('change',event=>{
    if(isAdminUserPin(event.target)) event.target.setCustomValidity('');
  },true);

  document.addEventListener('keydown',event=>{
    const form=event.target.closest?.('#admin-user-form');
    if(!form||event.key!=='Enter'||event.target.matches('textarea,select,button')) return;
    event.preventDefault();event.stopImmediatePropagation();
    const button=form.querySelector('#admin-user-submit');
    if(button) persistUserDirectly(form,button);
  },true);

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#admin-user-submit');
    if(!button) return;
    event.preventDefault();event.stopImmediatePropagation();
    const form=button.closest('#admin-user-form');
    if(form) persistUserDirectly(form,button);
  },true);

  const observer=new MutationObserver(mutations=>{
    if(mutations.some(mutation=>mutation.addedNodes.length)) configureUserForm();
  });
  observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});

  configureUserForm();

  const returnMessage=sessionStorage.getItem(RETURN_KEY);
  if(returnMessage){
    sessionStorage.removeItem(RETURN_KEY);
    setTimeout(()=>{
      if(state?.session?.role==='Administrador'){
        state.view='users';
        render();
        showToast(returnMessage);
      }
    },0);
  }

  window.FenologiaAdminDniFix={version:VERSION};
})();