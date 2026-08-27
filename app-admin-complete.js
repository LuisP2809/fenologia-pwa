(() => {
  const VERSION = '0.17.0';
  const SYSTEM_EPOCH = 'fresh-start-v1';
  const CONFIG_KEY = 'admin-config-v1';
  const MAP_KEY = 'admin-map-v1';
  const HISTORY_KEY = 'admin-config-history-v1';
  const DEVICE_KEY = 'device-config-v1';
  const CACHE_KEY = 'fenologia-admin-config-cache-v1';
  const CLEANUP_ADMIN_KEY = 'fenologia-cleanup-admin-profiles-v1';
  const CLEANUP_DEVICE_KEY = 'fenologia-cleanup-device-profile-v1';
  const CLEANUP_HISTORY_KEY = 'fenologia-cleanup-history-v1';
  const DEFAULT_PINS = {'ADM-01':'12345678','SUP-01':'11223344','EVA-01':'87654321'};
  const LOGIN_ATTEMPTS_KEY='fenologia-login-attempts-v1';
  const PERMISSIONS = [
    ['evaluate','Registrar evaluaciones'],
    ['records','Consultar registros'],
    ['export','Exportar y respaldar'],
    ['consolidate','Consolidar archivos'],
    ['map','Consultar mapa'],
    ['charts','Consultar gráficos'],
    ['admin','Administrar configuración']
  ];
  const ROLE_DEFAULTS = {
    Evaluador:['evaluate','records','export','charts'],
    Supervisor:['consolidate','map','charts'],
    Administrador:['evaluate','records','export','consolidate','map','charts','admin']
  };
  const ui = {
    userEditing:null,
    catalogTab:'hierarchy',
    catalogField:'',
    catalogFarm:'',
    catalogModule:'',
    catalogLot:'',
    lotEditing:null,
    campaignEditing:null,
    packageTarget:'',
    mapBusy:false
  };

  let adminConfig = null;
  let adminMap = null;
  let configHistory = [];
  let initialized = false;
  let initPromise = null;
  let creatingInitialAdmin = false;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const readJson = (key,fallback) => {
    try{return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));}
    catch{return fallback;}
  };
  const writeJson = (key,value) => localStorage.setItem(key,JSON.stringify(value));
  const localDate = value => value ? new Intl.DateTimeFormat('es-PE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—';
  const safe = value => String(value ?? '').trim();
  const upper = value => safe(value).toUpperCase();
  const unique = values => [...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'es'));
  const activeUsers = () => (adminConfig?.users || []).filter(user=>user.active);
  const rolePermissions = role => [...(ROLE_DEFAULTS[role] || [])];
  function loginAttemptState(){return readJson(LOGIN_ATTEMPTS_KEY,{count:0,lockedUntil:null});}
  function loginBlocked(){const value=loginAttemptState();return value.lockedUntil&&Date.now()<new Date(value.lockedUntil).getTime()?value:null;}
  function failedLogin(){
    const previous=loginAttemptState();const count=Number(previous.count||0)+1;
    writeJson(LOGIN_ATTEMPTS_KEY,{count,lockedUntil:count>=5?new Date(Date.now()+10*60*1000).toISOString():null});
    return count;
  }
  function clearLoginAttempts(){localStorage.removeItem(LOGIN_ATTEMPTS_KEY);}

  async function hashPin(pin){
    return window.FenologiaCredentials.legacyHash(pin);
  }

  async function getSetting(key,fallback=null){
    if(window.FenologiaDB?.isReady()&&!window.FenologiaDB.isFallback()){
      const value=await window.FenologiaDB.getSetting(key);
      return value ?? fallback;
    }
    return readJson(`fenologia-${key}`,fallback);
  }
  async function setSetting(key,value){
    localStorage.setItem(`fenologia-${key}`,JSON.stringify(value));
    if(window.FenologiaDB?.isReady()&&!window.FenologiaDB.isFallback()) await window.FenologiaDB.setSetting(key,value);
  }

  async function waitCatalog(){
    for(let attempt=0;attempt<200;attempt++){
      if(state.catalog?.lotesAgrupados) return state.catalog;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    throw new Error('No se pudo preparar el catálogo administrativo.');
  }

  function defaultCampaign(){
    return {id:'2026-2027',name:'2026-2027',startDate:'2026-10-01',endDate:'2027-09-30',active:true,current:true};
  }

  async function buildDefaultConfig(){
    const catalog=clone(await waitCatalog());
    const configuredUsers=[];
    const development=['localhost','127.0.0.1'].includes(location.hostname)||location.hostname.endsWith('.app.github.dev');
    for(const user of development?users:[]){
      const credential=await window.FenologiaCredentials.create(DEFAULT_PINS[user.id] || user.pin || '00000000');
      configuredUsers.push({
        id:user.id,
        name:user.name,
        role:user.role,
        active:true,
        ...credential,
        permissions:rolePermissions(user.role),
        createdAt:now(),
        updatedAt:now()
      });
    }
    return {
      type:'fenologia-admin-config',
      version:1,
      systemEpoch:SYSTEM_EPOCH,
      revision:1,
      updatedAt:now(),
      users:configuredUsers,
      catalog,
      assignments:clone(state.assignments || {}),
      archivedLots:[],
      campaigns:[defaultCampaign()]
    };
  }

  function normalizeConfig(value){
    const config=clone(value || {});
    config.type='fenologia-admin-config';
    config.version=1;
    config.systemEpoch=SYSTEM_EPOCH;
    config.revision=Number(config.revision || 1);
    config.updatedAt=config.updatedAt || now();
    config.users=Array.isArray(config.users)?config.users:[];
    config.users=config.users.map(user=>({
      id:safe(user.id),
      name:safe(user.name),
      role:['Evaluador','Supervisor','Administrador'].includes(user.role)?user.role:'Evaluador',
      active:user.active!==false,
      pinHash:safe(user.pinHash),
      pinSalt:safe(user.pinSalt),
      pinAlgorithm:safe(user.pinAlgorithm),
      pinIterations:Number(user.pinIterations||0)||null,
      permissions:Array.isArray(user.permissions)?unique(user.permissions):rolePermissions(user.role),
      createdAt:user.createdAt || now(),
      updatedAt:user.updatedAt || now()
    })).filter(user=>user.id&&user.name);
    config.catalog=config.catalog?.lotesAgrupados?config.catalog:clone(state.catalog);
    config.catalog.cuadrantes=unique(config.catalog.cuadrantes || ['NORTE','SUR','ESTE','OESTE']);
    config.catalog.variedadesPorCampo=config.catalog.variedadesPorCampo || {};
    config.assignments=config.assignments && typeof config.assignments==='object'?config.assignments:{};
    config.archivedLots=Array.isArray(config.archivedLots)?config.archivedLots:[];
    config.campaigns=Array.isArray(config.campaigns)&&config.campaigns.length?config.campaigns:[defaultCampaign()];
    return config;
  }

  function syncRuntime(){
    if(!adminConfig) return;
    users.splice(0,users.length,...adminConfig.users.map(user=>({
      id:user.id,name:user.name,role:user.role,active:user.active,
      permissions:[...user.permissions],pinHash:user.pinHash,pin:''
    })));
    state.catalog=clone(adminConfig.catalog);
    state.assignments=clone(adminConfig.assignments || {});
    const sessionUser=state.session && adminConfig.users.find(user=>user.id===state.session.id);
    const expired=state.session&&(!state.session.expiresAt||Date.now()>new Date(state.session.expiresAt).getTime()||!state.session.lastActiveAt||Date.now()-new Date(state.session.lastActiveAt).getTime()>30*60*1000);
    if(state.session && (!sessionUser || !sessionUser.active || expired)){
      localStorage.removeItem('fenologia-session');
      state.session=null;
      state.view='home';
    }else if(sessionUser){
      state.session={id:sessionUser.id,name:sessionUser.name,role:sessionUser.role,permissions:[...sessionUser.permissions],issuedAt:state.session.issuedAt,lastActiveAt:state.session.lastActiveAt,expiresAt:state.session.expiresAt};
      localStorage.setItem('fenologia-session',JSON.stringify(state.session));
    }
  }

  async function recordHistory(action,detail={},actor=state.session?.name || 'Sistema'){
    const entry={id:`CFG-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,action,detail,actor,createdAt:now(),revision:adminConfig?.revision || null};
    configHistory=[entry,...configHistory].slice(0,500);
    await setSetting(HISTORY_KEY,configHistory);
  }

  async function persistConfig(action,detail={}){
    adminConfig.revision=Number(adminConfig.revision || 0)+1;
    adminConfig.updatedAt=now();
    adminConfig.assignments=clone(state.assignments || adminConfig.assignments || {});
    writeJson(CACHE_KEY,adminConfig);
    await setSetting(CONFIG_KEY,adminConfig);
    syncRuntime();
    await save();
    await recordHistory(action,detail);
    window.dispatchEvent(new CustomEvent('fenologia-admin-config-change',{detail:{action,snapshot:centralSnapshot()}}));
  }

  function centralSnapshot(){
    if(!adminConfig)return null;
    return {
      type:'fenologia-central-config',version:1,systemEpoch:SYSTEM_EPOCH,
      revision:Number(adminConfig.revision||1),updatedAt:adminConfig.updatedAt||now(),
      users:(adminConfig.users||[]).map(user=>({
        id:user.id,name:user.name,role:user.role,active:user.active!==false,
        permissions:Array.isArray(user.permissions)?[...user.permissions]:rolePermissions(user.role)
      })),
      catalog:clone(adminConfig.catalog),assignments:clone(adminConfig.assignments||{}),
      campaigns:clone(adminConfig.campaigns||[]),archivedLots:clone(adminConfig.archivedLots||[])
    };
  }

  async function applyCentralConfig(snapshot){
    if(!snapshot||snapshot.type!=='fenologia-central-config'||snapshot.version!==1)throw new Error('La configuración central no es válida.');
    if(snapshot.systemEpoch!==SYSTEM_EPOCH)throw new Error('La configuración central pertenece a una etapa anterior del sistema.');
    const incomingRevision=Number(snapshot.revision||0);
    if(!Number.isInteger(incomingRevision)||incomingRevision<1)throw new Error('La revisión central no es válida.');
    if(adminConfig&&incomingRevision<Number(adminConfig.revision||0))return {applied:false,reason:'local-newer'};
    if(adminConfig&&incomingRevision===Number(adminConfig.revision||0)&&String(snapshot.updatedAt||'')===String(adminConfig.updatedAt||''))return {applied:false,reason:'already-current'};
    const credentials=new Map((adminConfig?.users||[]).map(user=>[upper(user.id),{
      pinHash:user.pinHash||'',pinSalt:user.pinSalt||'',pinAlgorithm:user.pinAlgorithm||'',pinIterations:Number(user.pinIterations||0)||null,
      createdAt:user.createdAt||now()
    }]));
    const mergedUsers=(Array.isArray(snapshot.users)?snapshot.users:[]).map(user=>{
      const credential=credentials.get(upper(user.id))||{};
      return {...user,...credential,updatedAt:snapshot.updatedAt||now()};
    });
    adminConfig=normalizeConfig({
      type:'fenologia-admin-config',version:1,systemEpoch:SYSTEM_EPOCH,revision:incomingRevision,updatedAt:snapshot.updatedAt||now(),
      users:mergedUsers,catalog:snapshot.catalog,assignments:snapshot.assignments||{},campaigns:snapshot.campaigns||[defaultCampaign()],archivedLots:snapshot.archivedLots||[]
    });
    state.assignments=clone(adminConfig.assignments||{});
    writeJson(CACHE_KEY,adminConfig);
    await setSetting(CONFIG_KEY,adminConfig);
    syncRuntime();
    await save();
    window.dispatchEvent(new CustomEvent('fenologia-central-config-applied',{detail:{revision:incomingRevision,updatedAt:adminConfig.updatedAt}}));
    render();
    return {applied:true,revision:incomingRevision};
  }

  async function handleCentralDeactivation(){
    const currentId=upper(state.session?.id);
    if(!currentId||!adminConfig)return false;
    const user=adminConfig.users.find(item=>upper(item.id)===currentId);
    if(user){user.active=false;user.updatedAt=now();writeJson(CACHE_KEY,adminConfig);await setSetting(CONFIG_KEY,adminConfig);}
    localStorage.removeItem('fenologia-session');
    state.session=null;state.view='home';
    await save();
    render();
    return true;
  }

  async function initialize(){
    if(initPromise) return initPromise;
    initPromise=(async()=>{
      await waitCatalog();
      const cached=readJson(CACHE_KEY,null);
      const stored=await getSetting(CONFIG_KEY,cached);
      adminConfig=normalizeConfig(stored || await buildDefaultConfig());
      configHistory=await getSetting(HISTORY_KEY,[]);
      adminMap=await getSetting(MAP_KEY,null);
      writeJson(CACHE_KEY,adminConfig);
      syncRuntime();
      installMapOverride();
      initialized=true;
      render();
      return adminConfig;
    })().catch(error=>{
      console.error(error);
      showToast(error.message || 'No se pudo preparar la configuración administrativa.');
      throw error;
    });
    return initPromise;
  }

  function flattenLots(catalog=adminConfig?.catalog){
    const rows=[];
    Object.entries(catalog?.lotesAgrupados || {}).forEach(([field,farms])=>{
      Object.entries(farms || {}).forEach(([farm,modules])=>{
        Object.entries(modules || {}).forEach(([module,lots])=>{
          (lots || []).forEach(lot=>rows.push({field,farm,module,lot}));
        });
      });
    });
    return rows.sort((a,b)=>`${a.field}|${a.farm}|${a.module}|${a.lot}`.localeCompare(`${b.field}|${b.farm}|${b.module}|${b.lot}`,'es'));
  }

  function hierarchyForLot(lot){
    return flattenLots().find(row=>row.lot===lot) || null;
  }

  function currentCampaign(dateValue=today()){
    const date=safe(dateValue);
    const exact=(adminConfig?.campaigns || []).find(item=>item.active!==false&&item.startDate&&item.endDate&&date>=item.startDate&&date<=item.endDate);
    return exact || (adminConfig?.campaigns || []).find(item=>item.active!==false&&item.current) || (adminConfig?.campaigns || []).find(item=>item.active!==false) || null;
  }

  function nextUserId(role){
    const prefix={Administrador:'ADM',Supervisor:'SUP',Evaluador:'EVA'}[role] || 'USR';
    const used=new Set((adminConfig.users || []).map(user=>user.id));
    for(let number=1;number<10000;number++){
      const id=`${prefix}-${String(number).padStart(3,'0')}`;
      if(!used.has(id)) return id;
    }
    return `${prefix}-${Date.now()}`;
  }

  function canAccess(view){
    if(!state.session) return false;
    if(state.session.role==='Administrador') return true;
    const permissions=state.session.permissions || rolePermissions(state.session.role);
    const map={evaluate:'evaluate',records:'records','record-detail':'records',export:'export',consolidate:'consolidate',map:'map',charts:'charts'};
    return !map[view] || permissions.includes(map[view]);
  }

  const originalFetch=window.fetch.bind(window);
  function installMapOverride(){
    if(window.__FENOLOGIA_ADMIN_MAP_OVERRIDE__) return;
    window.__FENOLOGIA_ADMIN_MAP_OVERRIDE__=true;
    window.fetch=function adminMapFetch(input,init){
      try{
        const raw=input instanceof Request?input.url:String(input);
        const url=new URL(raw,location.href);
        if(url.pathname.endsWith('/data/lotes-mapa.geojson')&&adminMap){
          return Promise.resolve(new Response(JSON.stringify(adminMap),{status:200,headers:{'Content-Type':'application/geo+json; charset=utf-8','Cache-Control':'no-store','X-Fenologia-Map-Source':'admin-import'}}));
        }
      }catch(error){console.warn('No se pudo aplicar el mapa administrativo:',error);}
      return originalFetch(input,init);
    };
  }

  function permissionsHtml(selected=[]){
    const set=new Set(selected);
    return PERMISSIONS.map(([key,label])=>`<label class="admin-check"><input type="checkbox" name="permissions" value="${key}" ${set.has(key)?'checked':''}><span>${label}</span></label>`).join('');
  }

  function userModal(user=null){
    const editing=Boolean(user);
    const selected=user?.permissions || rolePermissions(user?.role || 'Evaluador');
    return `<div class="admin-modal-backdrop" id="admin-modal"><section class="admin-modal">
      <div class="admin-modal-head"><div><span>${editing?'EDITAR USUARIO':'NUEVO USUARIO'}</span><h2>${editing?esc(user.name):'Crear acceso local'}</h2></div><button type="button" data-close-admin-modal>×</button></div>
      <form id="admin-user-form" class="admin-form">
        <input type="hidden" name="id" value="${esc(user?.id || '')}">
        <label>Nombre completo<input name="name" value="${esc(user?.name || '')}" required></label>
        <label>Rol<select name="role"><option ${user?.role==='Evaluador'?'selected':''}>Evaluador</option><option ${user?.role==='Supervisor'?'selected':''}>Supervisor</option><option ${user?.role==='Administrador'?'selected':''}>Administrador</option></select></label>
        <label>DNI / PIN ${editing?'<small>Déjalo vacío para conservarlo</small>':''}<input name="pin" inputmode="numeric" maxlength="8" pattern="\d{8}" ${editing?'':'required'}></label>
        <label class="admin-switch"><input type="checkbox" name="active" ${user?.active!==false?'checked':''}><span>Usuario activo</span></label>
        <fieldset><legend>Permisos del dispositivo</legend><div class="admin-check-grid" id="admin-permission-grid">${permissionsHtml(selected)}</div></fieldset>
        <div class="admin-modal-actions"><button type="button" class="secondary" data-close-admin-modal>Cancelar</button><button class="primary">${editing?'Guardar cambios':'Crear usuario'}</button></div>
      </form>
    </section></div>`;
  }

  function adminUsersView(){
    if(!isAdmin()){state.view='home';return homeView();}
    const rows=(adminConfig?.users || []).map(user=>`<article class="admin-user-card ${user.active?'':'inactive'}">
      <div class="admin-user-avatar">${esc(user.name.split(' ').map(part=>part[0]).slice(0,2).join(''))}</div>
      <div class="admin-user-main"><b>${esc(user.name)}</b><small>${esc(user.id)} · DNI protegido con SHA-256</small><div class="admin-permission-tags">${(user.permissions || []).map(permission=>`<span>${esc(PERMISSIONS.find(item=>item[0]===permission)?.[1] || permission)}</span>`).join('')}</div></div>
      <em class="admin-role">${esc(user.role)}</em>
      <span class="admin-status ${user.active?'active':'inactive'}">${user.active?'Activo':'Inactivo'}</span>
      <div class="admin-row-actions"><button class="secondary" data-edit-admin-user="${esc(user.id)}">Editar</button><button class="${user.active?'danger-soft':'secondary'}" data-toggle-admin-user="${esc(user.id)}">${user.active?'Desactivar':'Activar'}</button></div>
    </article>`).join('');
    app.innerHTML=shell(`${titleBlock('ADMINISTRADOR','Usuarios y roles','Crea accesos, asigna roles y desactiva usuarios sin borrar sus evaluaciones.',`<button class="primary" id="new-admin-user">+ Nuevo usuario</button>`)}
      <section class="metrics-grid three">${metric(adminConfig.users.length,'Usuarios registrados',icons.users)}${metric(activeUsers().length,'Usuarios activos',icons.check)}${metric(adminConfig.users.filter(user=>user.role==='Evaluador'&&user.active).length,'Evaluadores activos',icons.clipboard)}</section>
      <section class="panel"><div class="panel-head"><div><span>ACCESOS LOCALES</span><h2>Usuarios configurados</h2><p>Al desactivar un usuario se bloquea su próximo ingreso, pero sus registros históricos permanecen.</p></div></div><div class="admin-user-list">${rows || '<div class="empty">Sin usuarios</div>'}</div></section>
      <div id="admin-modal-host"></div>`);
  }

  function catalogFields(){return Object.keys(adminConfig?.catalog?.lotesAgrupados || {}).sort((a,b)=>a.localeCompare(b,'es'));}
  function catalogFarms(field){return Object.keys(adminConfig?.catalog?.lotesAgrupados?.[field] || {}).sort((a,b)=>a.localeCompare(b,'es'));}
  function catalogModules(field,farm){return Object.keys(adminConfig?.catalog?.lotesAgrupados?.[field]?.[farm] || {}).sort((a,b)=>a.localeCompare(b,'es'));}

  function catalogTabs(){
    return `<div class="admin-tabs">${[['hierarchy','Campos y lotes'],['quadrants','Cuadrantes'],['varieties','Variedades por lote']].map(([key,label])=>`<button class="${ui.catalogTab===key?'active':''}" data-admin-catalog-tab="${key}">${label}</button>`).join('')}</div>`;
  }

  function hierarchyPanel(){
    const rows=flattenLots().filter(row=>(!ui.catalogField||row.field===ui.catalogField)&&(!ui.catalogFarm||row.farm===ui.catalogFarm)&&(!ui.catalogModule||row.module===ui.catalogModule));
    const fields=catalogFields(),farms=catalogFarms(ui.catalogField),modules=catalogModules(ui.catalogField,ui.catalogFarm);
    return `<section class="panel"><div class="panel-head"><div><span>JERARQUÍA AGRÍCOLA</span><h2>Campos, fundos, módulos y lotes activos</h2></div><button class="primary" id="new-admin-lot">+ Agregar lote</button></div>
      <div class="admin-filter-row">
        <label>Campo<select id="admin-catalog-field"><option value="">Todos</option>${fields.map(value=>`<option ${ui.catalogField===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
        <label>Fundo<select id="admin-catalog-farm" ${ui.catalogField?'':'disabled'}><option value="">Todos</option>${farms.map(value=>`<option ${ui.catalogFarm===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
        <label>Módulo<select id="admin-catalog-module" ${ui.catalogFarm?'':'disabled'}><option value="">Todos</option>${modules.map(value=>`<option ${ui.catalogModule===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
        <div class="filter-total"><b>${rows.length}</b><span>lotes activos</span></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Campo</th><th>Fundo</th><th>Módulo</th><th>Turno-Lote</th><th>Variedades</th><th></th></tr></thead><tbody>${rows.slice(0,500).map(row=>`<tr><td>${esc(row.field)}</td><td>${esc(row.farm)}</td><td>${esc(row.module)}</td><td><b>${esc(row.lot)}</b></td><td>${esc((state.assignments[row.lot] || adminConfig.catalog.variedadesPorCampo[row.field] || []).join(', '))}</td><td><div class="table-actions"><button data-edit-admin-lot="${esc(row.lot)}">Editar</button><button class="danger-link" data-archive-admin-lot="${esc(row.lot)}">Desactivar</button></div></td></tr>`).join('')}</tbody></table></div>
      ${adminConfig.archivedLots.length?`<details class="admin-archive"><summary>Lotes desactivados (${adminConfig.archivedLots.length})</summary><div>${adminConfig.archivedLots.map(row=>`<span>${esc(row.lot)} <button data-restore-admin-lot="${esc(row.lot)}">Restaurar</button></span>`).join('')}</div></details>`:''}
    </section>`;
  }

  function lotModal(row=null){
    return `<div class="admin-modal-backdrop" id="admin-modal"><section class="admin-modal"><div class="admin-modal-head"><div><span>${row?'EDITAR LOTE':'NUEVO LOTE'}</span><h2>${row?esc(row.lot):'Agregar a la jerarquía'}</h2></div><button type="button" data-close-admin-modal>×</button></div>
      <form id="admin-lot-form" class="admin-form"><input type="hidden" name="originalLot" value="${esc(row?.lot || '')}">
        <label>Campo<input name="field" value="${esc(row?.field || '')}" required></label>
        <label>Fundo<input name="farm" value="${esc(row?.farm || '')}" required></label>
        <label>Módulo<input name="module" value="${esc(row?.module || '')}" required></label>
        <label>Turno-Lote<input name="lot" value="${esc(row?.lot || '')}" required></label>
        <div class="admin-modal-actions"><button type="button" class="secondary" data-close-admin-modal>Cancelar</button><button class="primary">Guardar lote</button></div>
      </form></section></div>`;
  }

  function quadrantsPanel(){
    const quadrants=adminConfig.catalog.cuadrantes || [];
    return `<section class="panel"><div class="panel-head"><div><span>CUADRANTES</span><h2>Direcciones disponibles en campo</h2><p>Los cuadrantes retirados dejan de aparecer en registros nuevos; el histórico no cambia.</p></div></div>
      <form id="admin-quadrant-form" class="admin-inline-form"><label>Nuevo cuadrante<input name="quadrant" placeholder="Ej. CENTRO" required></label><button class="primary">Agregar</button></form>
      <div class="admin-chip-list">${quadrants.map(value=>`<span>${esc(value)}<button data-remove-admin-quadrant="${esc(value)}" aria-label="Quitar">×</button></span>`).join('')}</div>
    </section>`;
  }

  function varietiesPanel(){
    const fields=catalogFields();
    if(!ui.catalogField) ui.catalogField=fields[0] || '';
    const farms=catalogFarms(ui.catalogField);
    if(!farms.includes(ui.catalogFarm)) ui.catalogFarm=farms[0] || '';
    const modules=catalogModules(ui.catalogField,ui.catalogFarm);
    if(!modules.includes(ui.catalogModule)) ui.catalogModule=modules[0] || '';
    const lots=adminConfig.catalog.lotesAgrupados?.[ui.catalogField]?.[ui.catalogFarm]?.[ui.catalogModule] || [];
    if(!lots.includes(ui.catalogLot)) ui.catalogLot=lots[0] || '';
    const fieldVarieties=adminConfig.catalog.variedadesPorCampo?.[ui.catalogField] || [];
    const assigned=new Set(state.assignments[ui.catalogLot] || fieldVarieties);
    return `<section class="panel"><div class="panel-head"><div><span>VARIEDADES</span><h2>Asignación por lote</h2><p>El Evaluador solo podrá seleccionar las variedades habilitadas para el lote.</p></div></div>
      <div class="admin-filter-row">
        <label>Campo<select id="admin-var-field">${fields.map(value=>`<option ${ui.catalogField===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
        <label>Fundo<select id="admin-var-farm">${farms.map(value=>`<option ${ui.catalogFarm===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
        <label>Módulo<select id="admin-var-module">${modules.map(value=>`<option ${ui.catalogModule===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
        <label>Turno-Lote<select id="admin-var-lot">${lots.map(value=>`<option ${ui.catalogLot===value?'selected':''}>${esc(value)}</option>`).join('')}</select></label>
      </div>
      ${ui.catalogLot?`<form id="admin-variety-assignment-form"><div class="admin-check-grid">${fieldVarieties.map(value=>`<label class="admin-check"><input type="checkbox" name="variety" value="${esc(value)}" ${assigned.has(value)?'checked':''}><span>${esc(value)}</span></label>`).join('')}</div><button class="primary">Guardar asignación</button></form>`:'<div class="empty">No hay lotes disponibles.</div>'}
      <hr><form id="admin-field-variety-form" class="admin-inline-form"><input type="hidden" name="field" value="${esc(ui.catalogField)}"><label>Nueva variedad para ${esc(ui.catalogField)}<input name="variety" placeholder="Ej. LAMB HASS" required></label><button class="secondary">Agregar variedad</button></form>
      <div class="admin-chip-list">${fieldVarieties.map(value=>`<span>${esc(value)}<button data-remove-field-variety="${esc(value)}" data-field="${esc(ui.catalogField)}">×</button></span>`).join('')}</div>
    </section>`;
  }

  function adminCatalogsView(){
    if(!isAdmin()){state.view='home';return homeView();}
    app.innerHTML=shell(`${titleBlock('ADMINISTRADOR','Catálogos agrícolas','Administra la jerarquía, los cuadrantes y las variedades disponibles para registros nuevos.')}
      ${catalogTabs()}${ui.catalogTab==='hierarchy'?hierarchyPanel():ui.catalogTab==='quadrants'?quadrantsPanel():varietiesPanel()}<div id="admin-modal-host"></div>`);
  }

  function campaignRows(){
    return (adminConfig.campaigns || []).map(campaign=>`<tr class="${campaign.active===false?'inactive-row':''}"><td><b>${esc(campaign.name)}</b>${campaign.current?'<small>Campaña actual</small>':''}</td><td>${esc(campaign.startDate || '—')}</td><td>${esc(campaign.endDate || '—')}</td><td><span class="admin-status ${campaign.active===false?'inactive':'active'}">${campaign.active===false?'Inactiva':'Activa'}</span></td><td><div class="table-actions"><button data-edit-admin-campaign="${esc(campaign.id)}">Editar</button><button class="${campaign.active===false?'':'danger-link'}" data-toggle-admin-campaign="${esc(campaign.id)}">${campaign.active===false?'Activar':'Desactivar'}</button></div></td></tr>`).join('');
  }

  function campaignModal(campaign=null){
    return `<div class="admin-modal-backdrop" id="admin-modal"><section class="admin-modal"><div class="admin-modal-head"><div><span>${campaign?'EDITAR CAMPAÑA':'NUEVA CAMPAÑA'}</span><h2>${esc(campaign?.name || 'Periodo agrícola')}</h2></div><button type="button" data-close-admin-modal>×</button></div>
      <form id="admin-campaign-form" class="admin-form"><input type="hidden" name="id" value="${esc(campaign?.id || '')}">
        <label>Nombre<input name="name" value="${esc(campaign?.name || '')}" placeholder="2026-2027" required></label>
        <label>Fecha inicial<input name="startDate" type="date" value="${esc(campaign?.startDate || '')}" required></label>
        <label>Fecha final<input name="endDate" type="date" value="${esc(campaign?.endDate || '')}" required></label>
        <label class="admin-switch"><input name="active" type="checkbox" ${campaign?.active!==false?'checked':''}><span>Campaña activa</span></label>
        <label class="admin-switch"><input name="current" type="checkbox" ${campaign?.current?'checked':''}><span>Usar como campaña actual</span></label>
        <div class="admin-modal-actions"><button type="button" class="secondary" data-close-admin-modal>Cancelar</button><button class="primary">Guardar campaña</button></div>
      </form></section></div>`;
  }

  function mapInfoHtml(){
    const stats=adminMap?.stats;
    return `<section class="panel admin-map-config"><div class="panel-head"><div><span>MAPA GEOJSON</span><h2>${adminMap?'Mapa personalizado activo':'Mapa incorporado activo'}</h2><p>El mapa se valida contra los lotes activos antes de reemplazarse.</p></div><button class="primary" id="import-admin-map">${adminMap?'Reemplazar GeoJSON':'Importar GeoJSON'}</button></div>
      <input type="file" id="admin-map-file" accept=".geojson,.json,application/geo+json,application/json" hidden>
      <div class="metrics-grid four">${metric(stats?.poligonosOriginales ?? 296,'Polígonos originales',icons.map)}${metric(stats?.lotesUnicos ?? 254,'Lotes únicos',icons.check)}${metric(stats?.lotesActivos ?? flattenLots().length,'Lotes vinculados',icons.clipboard)}${metric(stats?.faltantesActivos?.length ?? 0,'Lotes faltantes',icons.alert)}</div>
      ${adminMap?`<div class="admin-map-meta"><span>Importado: <b>${localDate(adminMap.meta?.importedAt)}</b></span><span>Archivo: <b>${esc(adminMap.meta?.fileName || 'GeoJSON')}</b></span><button class="danger-soft" id="restore-built-in-map">Volver al mapa incorporado</button></div>`:''}
    </section>`;
  }

  function adminSettingsView(){
    if(!isAdmin()){state.view='home';return homeView();}
    app.innerHTML=shell(`${titleBlock('ADMINISTRADOR','Campañas y mapa','Define los periodos agrícolas y reemplaza el archivo espacial sin modificar el código.',`<button class="primary" id="new-admin-campaign">+ Nueva campaña</button>`)}
      <section class="panel"><div class="panel-head"><div><span>CAMPAÑAS</span><h2>Periodos disponibles</h2><p>Las campañas activas aparecen en los formularios y filtros.</p></div></div><div class="table-wrap"><table><thead><tr><th>Campaña</th><th>Desde</th><th>Hasta</th><th>Estado</th><th></th></tr></thead><tbody>${campaignRows()}</tbody></table></div></section>
      ${mapInfoHtml()}<div id="admin-modal-host"></div>`);
  }

  function normalizeGeoJSON(payload,fileName='mapa.geojson'){
    if(!payload || payload.type!=='FeatureCollection' || !Array.isArray(payload.features)) throw new Error('El archivo no es una FeatureCollection GeoJSON válida.');
    if(!payload.features.length) throw new Error('El GeoJSON no contiene geometrías.');
    if(payload.features.length>100000) throw new Error('El GeoJSON supera el límite de 100 000 geometrías.');
    const lookup=new Map(flattenLots().map(row=>[upper(row.lot),row]));
    const grouped=new Map();
    let omitted=0;
    let coordinateCount=0;
    const samePosition=(first,last)=>first.length>=2&&last.length>=2&&first[0]===last[0]&&first[1]===last[1];
    const validateRing=(ring,label)=>{
      if(!Array.isArray(ring)||ring.length<4) throw new Error(`${label} debe tener al menos 4 coordenadas.`);
      ring.forEach((position,index)=>{
        coordinateCount++;
        if(coordinateCount>1000000) throw new Error('El GeoJSON supera el límite de 1 000 000 de coordenadas.');
        if(!Array.isArray(position)||position.length<2||!Number.isFinite(position[0])||!Number.isFinite(position[1])) throw new Error(`${label} contiene una coordenada inválida en la posición ${index+1}.`);
        if(position[0]<-180||position[0]>180||position[1]<-90||position[1]>90) throw new Error(`${label} contiene coordenadas fuera del rango geográfico permitido.`);
      });
      if(!samePosition(ring[0],ring.at(-1))) throw new Error(`${label} no está cerrado: la primera y última coordenada deben coincidir.`);
      const area=Math.abs(ring.slice(0,-1).reduce((sum,point,index)=>{
        const next=ring[(index+1)%(ring.length-1)];
        return sum+(point[0]*next[1]-next[0]*point[1]);
      },0)/2);
      if(area<1e-14) throw new Error(`${label} no forma un área válida.`);
    };
    const validatePolygon=(polygon,label)=>{
      if(!Array.isArray(polygon)||!polygon.length) throw new Error(`${label} no contiene anillos.`);
      polygon.forEach((ring,index)=>validateRing(ring,`${label}, anillo ${index+1}`));
      return polygon;
    };
    payload.features.forEach((feature,featureIndex)=>{
      const lot=safe(feature?.properties?.LOTE ?? feature?.properties?.lote ?? feature?.properties?.Lot);
      if(!lot || !feature?.geometry){omitted++;return;}
      const key=upper(lot);
      if(!grouped.has(key)) grouped.set(key,{lot,polygons:[]});
      const target=grouped.get(key);
      const label=`Geometría ${featureIndex+1} (${lot})`;
      if(feature.geometry.type==='Polygon') target.polygons.push(validatePolygon(feature.geometry.coordinates,label));
      else if(feature.geometry.type==='MultiPolygon'){
        if(!Array.isArray(feature.geometry.coordinates)||!feature.geometry.coordinates.length) throw new Error(`${label} no contiene polígonos.`);
        feature.geometry.coordinates.forEach((polygon,index)=>target.polygons.push(validatePolygon(polygon,`${label}, polígono ${index+1}`)));
      }else throw new Error(`${label} usa el tipo ${feature.geometry.type||'desconocido'}; solo se admiten Polygon y MultiPolygon.`);
    });
    const features=[];
    const extras=[];
    grouped.forEach((group,key)=>{
      const row=lookup.get(key);
      if(!row) extras.push(group.lot);
      features.push({type:'Feature',properties:{
        LOTE:row?.lot || group.lot,
        CAMPO:row?.field || '',
        FUNDO:row?.farm || '',
        MODULO:row?.module || '',
        ACTIVO:Boolean(row)
      },geometry:{type:'MultiPolygon',coordinates:group.polygons}});
    });
    const present=new Set(features.filter(feature=>feature.properties.ACTIVO).map(feature=>upper(feature.properties.LOTE)));
    const missing=flattenLots().map(row=>row.lot).filter(lot=>!present.has(upper(lot)));
    const normalized={
      type:'FeatureCollection',
      features,
      stats:{
        poligonosOriginales:payload.features.length,
        lotesUnicos:features.length,
        lotesActivos:features.filter(feature=>feature.properties.ACTIVO).length,
        referencias:features.filter(feature=>!feature.properties.ACTIVO).length,
        faltantesActivos:missing,
        extras,
        poligonosSinCodigoOmitidos:omitted
      },
      meta:{fileName,importedAt:now(),importedBy:state.session.name}
    };
    return normalized;
  }

  function cleanupProfileFor(user){
    const profiles=readJson(CLEANUP_ADMIN_KEY,{});
    const profile=profiles[user.id];
    if(!profile) return null;
    return {type:'fenologia-cleanup-profile',version:1,evaluatorId:profile.evaluatorId,evaluatorName:profile.evaluatorName,secret:profile.secret,issuedAt:profile.createdAt,issuedBy:profile.createdBy,revision:profile.revision,validUntil:new Date(new Date(profile.createdAt).getTime()+90*86400000).toISOString(),embeddedInSignedPackage:true};
  }

  function packageViewRows(){
    const cleanupHistory=readJson(CLEANUP_HISTORY_KEY,[]);
    const combined=[
      ...configHistory.map(item=>({...item,kind:'Configuración'})),
      ...cleanupHistory.map(item=>({id:item.id,kind:'Limpieza',action:`Limpieza de ${item.recordCount || 0} registros`,detail:{evaluador:item.evaluator,semana:item.authorizationWeek},actor:item.evaluator,createdAt:item.cleanedAt}))
    ].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,100);
    return combined.map(item=>`<tr><td>${esc(item.kind)}</td><td><b>${esc(item.action)}</b><small>${esc(Object.entries(item.detail || {}).map(([key,value])=>`${key}: ${Array.isArray(value)?value.join(', '):value}`).join(' · '))}</small></td><td>${esc(item.actor || 'Sistema')}</td><td>${esc(localDate(item.createdAt))}</td></tr>`).join('');
  }

  function adminPackageView(){
    if(!isAdmin()){state.view='home';return homeView();}
    const targets=activeUsers().filter(user=>user.role!=='Administrador');
    if(!targets.some(user=>user.id===ui.packageTarget)) ui.packageTarget=targets[0]?.id || '';
    const target=targets.find(user=>user.id===ui.packageTarget);
    const hasCleanup=target?.role!=='Evaluador' || Boolean(cleanupProfileFor(target));
    app.innerHTML=shell(`${titleBlock('ADMINISTRADOR','Paquetes e historial','Distribuye la configuración a cada dispositivo y revisa los cambios realizados.')}
      <section class="panel admin-package-card"><div class="panel-head"><div><span>PAQUETE DE CONFIGURACIÓN</span><h2>Preparar dispositivo</h2><p>El paquete actualiza usuarios, permisos, campañas, catálogos, variedades y mapa sin borrar evaluaciones.</p></div></div>
        <div class="admin-package-grid"><label>Usuario destinatario<select id="admin-package-target">${targets.map(user=>`<option value="${esc(user.id)}" ${ui.packageTarget===user.id?'selected':''}>${esc(user.name)} · ${esc(user.role)}</option>`).join('')}</select></label>
          <div class="admin-package-summary"><b>${esc(target?.name || 'Sin destinatario')}</b><span>${esc(target?.role || '')}</span><small>${target?`${flattenLots().length} lotes · ${adminConfig.campaigns.filter(item=>item.active!==false).length} campañas · revisión ${adminConfig.revision}`:'Crea un Evaluador o Supervisor activo.'}</small></div>
          <button class="primary" id="download-config-package" ${target&&hasCleanup?'':'disabled'}>Descargar paquete</button></div>
        ${target?.role==='Evaluador'&&!hasCleanup?'<div class="admin-warning">Primero crea el perfil de limpieza de este evaluador en “Seguridad de limpieza”.</div>':''}
      </section>
      <section class="panel"><div class="panel-head"><div><span>IMPORTAR EN ESTE DISPOSITIVO</span><h2>Aplicar un paquete recibido</h2><p>Se usa principalmente en los celulares del Evaluador y Supervisor.</p></div><button class="secondary" id="import-config-package">Seleccionar paquete</button></div><input type="file" id="config-package-file" accept=".json,application/json" hidden></section>
      <section class="panel"><div class="panel-head"><div><span>ACTIVIDAD</span><h2>Historial de limpiezas y configuraciones</h2></div></div><div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Acción</th><th>Responsable</th><th>Fecha</th></tr></thead><tbody>${packageViewRows() || '<tr><td colspan="4">Aún no hay actividad registrada.</td></tr>'}</tbody></table></div></section>`);
  }

  async function exportConfigPackage(){
    const target=activeUsers().find(user=>user.id===ui.packageTarget);
    if(!target) return showToast('Selecciona un usuario destinatario.');
    const cleanupProfile=target.role==='Evaluador'?cleanupProfileFor(target):null;
    if(target.role==='Evaluador'&&!cleanupProfile) return showToast('Primero crea el perfil de limpieza del evaluador.');
    const directory=activeUsers().map(user=>({
      id:user.id,name:user.name,role:user.role,active:true,
      permissions:user.permissions,
      pinHash:user.id===target.id?user.pinHash:null,
      pinSalt:user.id===target.id?user.pinSalt:null,
      pinAlgorithm:user.id===target.id?user.pinAlgorithm:null,
      pinIterations:user.id===target.id?user.pinIterations:null,
      loginAllowed:user.id===target.id
    }));
    const core={
      type:'fenologia-config-package',
      version:2,
      systemEpoch:SYSTEM_EPOCH,
      packageId:`PKG-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`,
      issuedAt:now(),
      issuedBy:state.session.name,
      revision:adminConfig.revision,
      target:{id:target.id,name:target.name,role:target.role},
      users:directory,
      catalog:clone(adminConfig.catalog),
      assignments:clone(state.assignments),
      campaigns:clone(adminConfig.campaigns),
      map:clone(adminMap),
      cleanupProfile,
      dynamicParameters:window.FenologiaDynamicParameters?.parameters?.()||[]
    };
    const payload=await window.FenologiaPackageSecurity.sign(core);
    const result=await downloadFile(`CONFIG_FENOLOGIA_${target.id}_${today().replaceAll('-','')}.json`,JSON.stringify(payload,null,2),'application/json');
    if(!result?.ok)return showToast('La descarga del paquete fue cancelada.');
    await recordHistory('Paquete descargado',{destinatario:target.name,rol:target.role,packageId:core.packageId});
    showToast('Paquete de configuración descargado.');
    adminPackageView();
  }

  async function importConfigPackage(file){
    const payload=JSON.parse(await file.text());
    if(payload?.type!=='fenologia-config-package'||payload?.version!==2||!payload.target||!payload.catalog) throw new Error('El archivo no es un paquete de configuración firmado compatible.');
    if(payload.systemEpoch!==SYSTEM_EPOCH)throw new Error('Este acceso pertenece a la configuración anterior y quedó invalidado por el reinicio. Solicita un archivo nuevo.');
    const verified=await window.FenologiaPackageSecurity.verify(payload);
    if(verified.pendingTrust){
      const shown=verified.fingerprint.match(/.{1,4}/g).join('-');
      if(!confirm(`Primera vinculación administrativa. Compara esta huella por un canal confiable:\n\n${shown}\n\n¿Confirmas que pertenece al Administrador?`))throw new Error('La identidad firmante no fue autorizada.');
      await window.FenologiaPackageSecurity.trust(payload.signature.publicKey);
    }
    const core=verified.core;
    const target=core.users?.find(user=>user.id===core.target.id);
    if(!target?.pinHash) throw new Error('El paquete no contiene el acceso protegido del destinatario.');
    const importedUsers=(core.users || []).map(user=>({
      id:user.id,name:user.name,role:user.role,active:user.active!==false,
      permissions:Array.isArray(user.permissions)?user.permissions:rolePermissions(user.role),
      pinHash:user.pinHash || '',
      pinSalt:user.pinSalt || '',pinAlgorithm:user.pinAlgorithm || '',pinIterations:Number(user.pinIterations||0)||null,
      loginAllowed:user.loginAllowed===true,
      createdAt:now(),updatedAt:now()
    }));
    adminConfig=normalizeConfig({
      type:'fenologia-admin-config',version:1,systemEpoch:SYSTEM_EPOCH,revision:core.revision || 1,updatedAt:now(),
      users:importedUsers,catalog:core.catalog,assignments:core.assignments || {},
      campaigns:core.campaigns || [defaultCampaign()],archivedLots:[]
    });
    adminMap=core.map || null;
    state.assignments=clone(adminConfig.assignments);
    await setSetting(CONFIG_KEY,adminConfig);
    await setSetting(MAP_KEY,adminMap);
    writeJson(CACHE_KEY,adminConfig);
    writeJson(DEVICE_KEY,{targetId:core.target.id,targetName:core.target.name,role:core.target.role,packageId:core.packageId,revision:core.revision,signerFingerprint:verified.fingerprint,importedAt:now()});
    if(core.cleanupProfile) writeJson(CLEANUP_DEVICE_KEY,{...core.cleanupProfile,enrolledAt:now()});
    if(Array.isArray(core.dynamicParameters))await window.FenologiaDynamicParameters?.replace?.(core.dynamicParameters,'Parámetros aplicados desde paquete firmado');
    syncRuntime();
    await save();
    await recordHistory('Paquete aplicado',{packageId:core.packageId,destinatario:core.target.name,firma:verified.fingerprint},core.target.name);
    localStorage.removeItem('fenologia-session');
    state.session=null;
    state.view='home';
    showToast('Configuración aplicada. Ingresa con el usuario destinatario.');
    render();
  }

  const previousLoginView=loginView;
  loginView=function adminLoginView(){
    previousLoginView();
    const card=document.querySelector('.login-card');
    if(!card || card.querySelector('.config-login-import')) return;
    if(initialized&&!(adminConfig?.users || []).length){
      card.innerHTML=`<div><span class="eyebrow green">CONFIGURACIÓN INICIAL</span><h2>Crear primer Administrador</h2><p>Este será el dispositivo principal desde el que crearás usuarios, roles y accesos.</p></div>
        <form id="first-admin-form">
          <label>Nombre completo<input name="name" autocomplete="name" required></label>
          <label>DNI / PIN de 8 dígitos<input name="pin" type="password" inputmode="numeric" maxlength="8" pattern="\\d{8}" autocomplete="new-password" required></label>
          <label>Confirmar DNI / PIN<input name="pinConfirmation" type="password" inputmode="numeric" maxlength="8" pattern="\\d{8}" autocomplete="new-password" required></label>
          <div class="first-admin-role"><span>Rol asignado</span><b>Administrador principal</b></div>
          <label class="first-admin-confirm"><input name="primaryDevice" type="checkbox" required><span>Confirmo que este es el dispositivo principal del Administrador.</span></label>
          <button class="primary wide">Crear Administrador y continuar <span>→</span></button>
        </form>
        <div class="config-login-import"><b>¿Este es otro dispositivo?</b><p>Los Evaluadores y Supervisores no crean un Administrador: importan el acceso nuevo que reciben.</p><button class="secondary" type="button" id="login-import-config">Importar acceso</button><input type="file" id="login-config-file" accept=".json,application/json" hidden></div>`;
      return;
    }
    const binding=readJson(DEVICE_KEY,null);
    const form=card.querySelector('#login-form');
    const allowed=(adminConfig?.users || []).find(user=>user.id===binding?.targetId) || activeUsers().find(user=>user.role==='Evaluador') || activeUsers()[0];
    if(form&&allowed){form.name.value=allowed.name;form.pin.value='';}
    card.insertAdjacentHTML('beforeend',`<div class="config-login-import"><b>${binding?`Dispositivo configurado para ${esc(binding.targetName)}`:'Configurar este dispositivo'}</b><p>${binding?'Usa el acceso del destinatario del paquete.':'Importa el paquete entregado por el Administrador.'}</p><button class="secondary" type="button" id="login-import-config">Importar configuración</button><input type="file" id="login-config-file" accept=".json,application/json" hidden></div>`);
  };

  const previousSidebar=sidebar;
  sidebar=function completeAdminSidebar(){
    let html=previousSidebar();
    const wrapper=document.createElement('div');
    wrapper.innerHTML=html;
    const nav=wrapper.querySelector('nav');
    if(isAdmin()&&nav){
      if(!nav.querySelector('[data-view="admin-settings"]')) nav.insertAdjacentHTML('beforeend',`<button data-view="admin-settings" class="${state.view==='admin-settings'?'active':''}"><span>🗓️</span>Campañas y mapa</button>`);
      if(!nav.querySelector('[data-view="admin-package"]')) nav.insertAdjacentHTML('beforeend',`<button data-view="admin-package" class="${state.view==='admin-package'?'active':''}"><span>📦</span>Paquetes e historial</button>`);
    }
    if(state.session&&!isAdmin()){
      const permissions=state.session.permissions || rolePermissions(state.session.role);
      const rules={evaluate:'evaluate',records:'records',export:'export',consolidate:'consolidate',map:'map',charts:'charts'};
      if(nav){
        const labels={evaluate:['📋','Registro de evaluación'],records:['🔎','Detalle de evaluación'],export:['📤','Exportar e importar'],consolidate:['🔄','Consolidar'],map:['🗺️','Mapa de avance'],charts:['📊','Gráficos']};
        Object.entries(rules).forEach(([view,permission])=>{
          const existing=nav.querySelector(`[data-view="${view}"]`);
          if(!permissions.includes(permission)){existing?.remove();return;}
          if(!existing){
            const [icon,label]=labels[view];
            nav.insertAdjacentHTML('beforeend',`<button data-view="${view}" class="${state.view===view?'active':''}"><span>${icon}</span>${label}</button>`);
          }
        });
      }
    }
    return wrapper.innerHTML;
  };

  const previousRender=render;
  render=function completeAdminRender(){
    if(state.session&&!canAccess(state.view)) state.view='home';
    if(state.session&&state.view==='admin-settings') return adminSettingsView();
    if(state.session&&state.view==='admin-package') return adminPackageView();
    return previousRender();
  };

  usersView=adminUsersView;
  catalogsView=adminCatalogsView;

  const previousEvaluateView=evaluateView;
  evaluateView=function campaignAwareEvaluateView(){
    previousEvaluateView();
    const input=document.querySelector('#evaluation-form [name="campaign"]');
    if(!input) return;
    const campaigns=(adminConfig?.campaigns || []).filter(item=>item.active!==false);
    const selected=input.value || currentCampaign(document.querySelector('#evaluation-form [name="date"]')?.value)?.name || '';
    const select=document.createElement('select');
    select.name='campaign';
    select.required=true;
    select.innerHTML=campaigns.map(item=>`<option value="${esc(item.name)}" ${item.name===selected?'selected':''}>${esc(item.name)}</option>`).join('');
    input.replaceWith(select);
    const dateInput=document.querySelector('#evaluation-form [name="date"]');
    if(dateInput&&!state.editingId) dateInput.addEventListener('change',()=>{const campaign=currentCampaign(dateInput.value);if(campaign) select.value=campaign.name;});
  };

  document.addEventListener('submit',async event=>{
    if(event.target.id==='first-admin-form'){
      event.preventDefault();event.stopImmediatePropagation();
      if(creatingInitialAdmin)return;
      creatingInitialAdmin=true;
      try{
        await initialize();
        if((adminConfig?.users || []).length)throw new Error('Ya existe un Administrador. Recarga e inicia sesión.');
        const data=new FormData(event.target),name=safe(data.get('name')),pin=safe(data.get('pin')),confirmation=safe(data.get('pinConfirmation'));
        if(name.length<3)throw new Error('Ingresa el nombre completo del Administrador.');
        if(!/^\d{8}$/.test(pin))throw new Error('El DNI / PIN debe tener exactamente 8 dígitos.');
        if(pin!==confirmation)throw new Error('La confirmación del DNI / PIN no coincide.');
        if(data.get('primaryDevice')!=='on')throw new Error('Confirma que este es el dispositivo principal.');
        const credential=await window.FenologiaCredentials.create(pin);
        const user={id:'ADM-001',name,role:'Administrador',active:true,...credential,permissions:rolePermissions('Administrador'),createdAt:now(),updatedAt:now()};
        adminConfig.users=[user];adminConfig.systemEpoch=SYSTEM_EPOCH;adminConfig.revision=1;adminConfig.updatedAt=now();
        writeJson(CACHE_KEY,adminConfig);await setSetting(CONFIG_KEY,adminConfig);syncRuntime();
        await recordHistory('Administrador inicial creado',{usuario:name,rol:'Administrador principal'},name);
        const issuedAt=new Date();
        state.session={id:user.id,name:user.name,role:user.role,permissions:[...user.permissions],issuedAt:issuedAt.toISOString(),lastActiveAt:issuedAt.toISOString(),expiresAt:new Date(issuedAt.getTime()+8*60*60*1000).toISOString()};
        localStorage.setItem('fenologia-session',JSON.stringify(state.session));
        state.view='home';render();showToast('Administrador principal creado correctamente.');
      }catch(error){showToast(error.message||'No se pudo crear el Administrador principal.');}
      finally{creatingInitialAdmin=false;}
      return;
    }
    if(event.target.id==='login-form'){
      event.preventDefault();event.stopImmediatePropagation();
      await initialize();
      const data=new FormData(event.target);
      const name=safe(data.get('name')).toLowerCase();
      const pin=safe(data.get('pin'));
      const blocked=loginBlocked();
      if(blocked){const minutes=Math.ceil((new Date(blocked.lockedUntil).getTime()-Date.now())/60000);return showToast(`Acceso bloqueado temporalmente. Intenta en ${minutes} minuto(s).`);}
      const user=(adminConfig.users || []).find(item=>item.name.toLowerCase()===name);
      if(!user||!user.active){failedLogin();return showToast('Nombre o acceso incorrecto.');}
      const binding=readJson(DEVICE_KEY,null);
      if(binding?.targetId&&binding.targetId!==user.id) return showToast(`Este dispositivo está configurado para ${binding.targetName}.`);
      if(!await window.FenologiaCredentials.verify(pin,user)){const count=failedLogin();return showToast(count>=5?'Acceso bloqueado durante 10 minutos.':'Nombre o acceso incorrecto.');}
      clearLoginAttempts();
      if(user.pinAlgorithm!=='PBKDF2-SHA256'){
        Object.assign(user,await window.FenologiaCredentials.create(pin));
        await setSetting(CONFIG_KEY,adminConfig);writeJson(CACHE_KEY,adminConfig);
      }
      const issuedAt=new Date();
      state.session={id:user.id,name:user.name,role:user.role,permissions:[...user.permissions],issuedAt:issuedAt.toISOString(),lastActiveAt:issuedAt.toISOString(),expiresAt:new Date(issuedAt.getTime()+8*60*60*1000).toISOString()};
      localStorage.setItem('fenologia-session',JSON.stringify(state.session));
      state.view='home';render();return;
    }

    if(event.target.id==='admin-user-form'){
      event.preventDefault();event.stopImmediatePropagation();
      const data=new FormData(event.target),id=safe(data.get('id')),role=safe(data.get('role')),name=safe(data.get('name')),pin=safe(data.get('pin'));
      if(!name) return showToast('Ingresa el nombre completo.');
      if(pin&&!/^\d{8}$/.test(pin)) return showToast('El DNI / PIN debe tener 8 dígitos.');
      let user=id?adminConfig.users.find(item=>item.id===id):null;
      const creating=!user;
      if(creating){user={id:nextUserId(role),name,role,active:true,pinHash:'',permissions:rolePermissions(role),createdAt:now(),updatedAt:now()};adminConfig.users.push(user);}
      user.name=name;user.role=role;user.active=data.get('active')==='on';user.permissions=data.getAll('permissions');
      if(!user.permissions.length) user.permissions=rolePermissions(role);
      if(pin) Object.assign(user,await window.FenologiaCredentials.create(pin));
      if(!user.pinHash) return showToast('Define un DNI / PIN para el usuario.');
      user.updatedAt=now();
      await persistConfig(creating?'Usuario creado':'Usuario actualizado',{usuario:user.name,rol:user.role,estado:user.active?'activo':'inactivo'});
      closeModal();adminUsersView();showToast(creating?'Usuario creado.':'Usuario actualizado.');return;
    }

    if(event.target.id==='admin-lot-form'){
      event.preventDefault();event.stopImmediatePropagation();
      const data=new FormData(event.target),original=safe(data.get('originalLot'));
      const row={field:upper(data.get('field')),farm:upper(data.get('farm')),module:upper(data.get('module')),lot:upper(data.get('lot'))};
      if(!row.field||!row.farm||!row.module||!row.lot) return showToast('Completa toda la jerarquía.');
      const duplicate=flattenLots().find(item=>item.lot===row.lot&&item.lot!==original);
      if(duplicate) return showToast('Ese Turno-Lote ya existe.');
      if(original){
        const old=hierarchyForLot(original);
        if(old) removeLotFromCatalog(old);
        if(original!==row.lot&&state.assignments[original]){state.assignments[row.lot]=state.assignments[original];delete state.assignments[original];}
      }
      addLotToCatalog(row);
      await persistConfig(original?'Lote actualizado':'Lote creado',{lote:row.lot,campo:row.field,fundo:row.farm,modulo:row.module});
      closeModal();adminCatalogsView();showToast('Catálogo actualizado.');return;
    }

    if(event.target.id==='admin-quadrant-form'){
      event.preventDefault();event.stopImmediatePropagation();
      const value=upper(new FormData(event.target).get('quadrant'));
      if(!value)return;
      if(adminConfig.catalog.cuadrantes.includes(value))return showToast('El cuadrante ya existe.');
      adminConfig.catalog.cuadrantes.push(value);adminConfig.catalog.cuadrantes=unique(adminConfig.catalog.cuadrantes);
      await persistConfig('Cuadrante agregado',{cuadrante:value});adminCatalogsView();return;
    }

    if(event.target.id==='admin-variety-assignment-form'){
      event.preventDefault();event.stopImmediatePropagation();
      if(!ui.catalogLot)return;
      state.assignments[ui.catalogLot]=new FormData(event.target).getAll('variety');
      await persistConfig('Variedades asignadas',{lote:ui.catalogLot,variedades:state.assignments[ui.catalogLot]});adminCatalogsView();showToast('Variedades actualizadas.');return;
    }

    if(event.target.id==='admin-field-variety-form'){
      event.preventDefault();event.stopImmediatePropagation();
      const data=new FormData(event.target),field=safe(data.get('field')),variety=upper(data.get('variety'));
      if(!field||!variety)return;
      const list=adminConfig.catalog.variedadesPorCampo[field] ||= [];
      if(list.includes(variety))return showToast('La variedad ya existe.');
      list.push(variety);adminConfig.catalog.variedadesPorCampo[field]=unique(list);
      await persistConfig('Variedad agregada',{campo:field,variedad:variety});adminCatalogsView();return;
    }

    if(event.target.id==='admin-campaign-form'){
      event.preventDefault();event.stopImmediatePropagation();
      const data=new FormData(event.target),id=safe(data.get('id')),name=safe(data.get('name')),startDate=safe(data.get('startDate')),endDate=safe(data.get('endDate'));
      if(startDate>endDate)return showToast('La fecha inicial no puede superar la fecha final.');
      let campaign=id?adminConfig.campaigns.find(item=>item.id===id):null;
      const creating=!campaign;
      if(!campaign){campaign={id:`CAM-${Date.now()}`,createdAt:now()};adminConfig.campaigns.push(campaign);}
      campaign.name=name;campaign.startDate=startDate;campaign.endDate=endDate;campaign.active=data.get('active')==='on';campaign.current=data.get('current')==='on';campaign.updatedAt=now();
      if(campaign.current) adminConfig.campaigns.forEach(item=>{if(item.id!==campaign.id)item.current=false;});
      await persistConfig(creating?'Campaña creada':'Campaña actualizada',{campaña:name,desde:startDate,hasta:endDate});
      closeModal();adminSettingsView();return;
    }
  },true);

  function closeModal(){document.querySelector('#admin-modal')?.remove();}
  function addLotToCatalog(row){
    const field=adminConfig.catalog.lotesAgrupados[row.field] ||= {};
    const farm=field[row.farm] ||= {};
    const lots=farm[row.module] ||= [];
    if(!lots.includes(row.lot)) lots.push(row.lot);
    farm[row.module]=unique(lots);
    adminConfig.catalog.variedadesPorCampo[row.field] ||= [];
  }
  function removeLotFromCatalog(row){
    const modules=adminConfig.catalog.lotesAgrupados?.[row.field]?.[row.farm];
    if(!modules)return;
    modules[row.module]=(modules[row.module] || []).filter(lot=>lot!==row.lot);
    if(!modules[row.module].length)delete modules[row.module];
    if(!Object.keys(modules).length)delete adminConfig.catalog.lotesAgrupados[row.field][row.farm];
    if(!Object.keys(adminConfig.catalog.lotesAgrupados[row.field]).length)delete adminConfig.catalog.lotesAgrupados[row.field];
  }

  document.addEventListener('click',async event=>{
    if(event.target.closest('#new-admin-user')){document.querySelector('#admin-modal-host').innerHTML=userModal();return;}
    const editUser=event.target.closest('[data-edit-admin-user]');if(editUser){const user=adminConfig.users.find(item=>item.id===editUser.dataset.editAdminUser);document.querySelector('#admin-modal-host').innerHTML=userModal(user);return;}
    const toggleUser=event.target.closest('[data-toggle-admin-user]');if(toggleUser){
      const user=adminConfig.users.find(item=>item.id===toggleUser.dataset.toggleAdminUser);if(!user)return;
      if(user.id===state.session.id&&user.active)return showToast('No puedes desactivar tu propio usuario.');
      if(user.role==='Administrador'&&user.active&&adminConfig.users.filter(item=>item.role==='Administrador'&&item.active).length<=1)return showToast('Debe permanecer al menos un Administrador activo.');
      user.active=!user.active;user.updatedAt=now();await persistConfig(user.active?'Usuario activado':'Usuario desactivado',{usuario:user.name});adminUsersView();return;
    }
    if(event.target.closest('[data-close-admin-modal]')){closeModal();return;}
    const roleSelect=event.target.closest('#admin-user-form [name="role"]');if(roleSelect)return;

    const tab=event.target.closest('[data-admin-catalog-tab]');if(tab){ui.catalogTab=tab.dataset.adminCatalogTab;adminCatalogsView();return;}
    if(event.target.closest('#new-admin-lot')){document.querySelector('#admin-modal-host').innerHTML=lotModal();return;}
    const editLot=event.target.closest('[data-edit-admin-lot]');if(editLot){document.querySelector('#admin-modal-host').innerHTML=lotModal(hierarchyForLot(editLot.dataset.editAdminLot));return;}
    const archiveLot=event.target.closest('[data-archive-admin-lot]');if(archiveLot){
      const row=hierarchyForLot(archiveLot.dataset.archiveAdminLot);if(!row)return;
      if(!confirm(`El lote ${row.lot} dejará de aparecer en registros nuevos. ¿Continuar?`))return;
      removeLotFromCatalog(row);adminConfig.archivedLots.push({...row,archivedAt:now()});
      await persistConfig('Lote desactivado',{lote:row.lot});adminCatalogsView();return;
    }
    const restoreLot=event.target.closest('[data-restore-admin-lot]');if(restoreLot){
      const index=adminConfig.archivedLots.findIndex(row=>row.lot===restoreLot.dataset.restoreAdminLot);if(index<0)return;
      const [row]=adminConfig.archivedLots.splice(index,1);addLotToCatalog(row);await persistConfig('Lote restaurado',{lote:row.lot});adminCatalogsView();return;
    }
    const removeQuadrant=event.target.closest('[data-remove-admin-quadrant]');if(removeQuadrant){
      if(adminConfig.catalog.cuadrantes.length<=1)return showToast('Debe permanecer al menos un cuadrante.');
      const value=removeQuadrant.dataset.removeAdminQuadrant;adminConfig.catalog.cuadrantes=adminConfig.catalog.cuadrantes.filter(item=>item!==value);
      await persistConfig('Cuadrante retirado',{cuadrante:value});adminCatalogsView();return;
    }
    const removeVariety=event.target.closest('[data-remove-field-variety]');if(removeVariety){
      const field=removeVariety.dataset.field,value=removeVariety.dataset.removeFieldVariety;
      adminConfig.catalog.variedadesPorCampo[field]=(adminConfig.catalog.variedadesPorCampo[field] || []).filter(item=>item!==value);
      Object.keys(state.assignments).forEach(lot=>{state.assignments[lot]=(state.assignments[lot] || []).filter(item=>item!==value);});
      await persistConfig('Variedad retirada',{campo:field,variedad:value});adminCatalogsView();return;
    }

    if(event.target.closest('#new-admin-campaign')){document.querySelector('#admin-modal-host').innerHTML=campaignModal();return;}
    const editCampaign=event.target.closest('[data-edit-admin-campaign]');if(editCampaign){document.querySelector('#admin-modal-host').innerHTML=campaignModal(adminConfig.campaigns.find(item=>item.id===editCampaign.dataset.editAdminCampaign));return;}
    const toggleCampaign=event.target.closest('[data-toggle-admin-campaign]');if(toggleCampaign){
      const campaign=adminConfig.campaigns.find(item=>item.id===toggleCampaign.dataset.toggleAdminCampaign);if(!campaign)return;
      campaign.active=!campaign.active;if(!campaign.active)campaign.current=false;
      await persistConfig(campaign.active?'Campaña activada':'Campaña desactivada',{campaña:campaign.name});adminSettingsView();return;
    }
    if(event.target.closest('#import-admin-map')){document.querySelector('#admin-map-file')?.click();return;}
    if(event.target.closest('#restore-built-in-map')){
      if(!confirm('Se quitará el mapa personalizado y se volverá al mapa incorporado. ¿Continuar?'))return;
      adminMap=null;await setSetting(MAP_KEY,null);await recordHistory('Mapa incorporado restaurado',{});showToast('Mapa incorporado restaurado. Recarga para aplicarlo.');adminSettingsView();return;
    }

    if(event.target.closest('#download-config-package')){await exportConfigPackage();return;}
    if(event.target.closest('#import-config-package')){document.querySelector('#config-package-file')?.click();return;}
    if(event.target.closest('#login-import-config')){document.querySelector('#login-config-file')?.click();return;}

    const profileButton=event.target.closest('[data-create-cleanup-profile]');
    if(profileButton){setTimeout(()=>recordHistory('Perfil de limpieza creado o renovado',{evaluador:profileButton.dataset.createCleanupProfile}),50);}
  });

  document.addEventListener('change',async event=>{
    if(event.target.id==='admin-catalog-field'){ui.catalogField=event.target.value;ui.catalogFarm='';ui.catalogModule='';adminCatalogsView();return;}
    if(event.target.id==='admin-catalog-farm'){ui.catalogFarm=event.target.value;ui.catalogModule='';adminCatalogsView();return;}
    if(event.target.id==='admin-catalog-module'){ui.catalogModule=event.target.value;adminCatalogsView();return;}
    if(event.target.id==='admin-var-field'){ui.catalogField=event.target.value;ui.catalogFarm='';ui.catalogModule='';ui.catalogLot='';adminCatalogsView();return;}
    if(event.target.id==='admin-var-farm'){ui.catalogFarm=event.target.value;ui.catalogModule='';ui.catalogLot='';adminCatalogsView();return;}
    if(event.target.id==='admin-var-module'){ui.catalogModule=event.target.value;ui.catalogLot='';adminCatalogsView();return;}
    if(event.target.id==='admin-var-lot'){ui.catalogLot=event.target.value;adminCatalogsView();return;}
    if(event.target.id==='admin-package-target'){ui.packageTarget=event.target.value;adminPackageView();return;}
    if(event.target.id==='admin-map-file'&&event.target.files?.[0]){
      try{
        ui.mapBusy=true;showToast('Validando GeoJSON…');
        const file=event.target.files[0];
        if(file.size>20*1024*1024) throw new Error('El GeoJSON supera el límite de 20 MB.');
        const payload=JSON.parse(await file.text()),normalized=normalizeGeoJSON(payload,file.name);
        if(normalized.stats.faltantesActivos.length) throw new Error(`El mapa no contiene ${normalized.stats.faltantesActivos.length} lote(s) activo(s): ${normalized.stats.faltantesActivos.slice(0,8).join(', ')}.`);
        adminMap=normalized;await setSetting(MAP_KEY,adminMap);await recordHistory('Mapa GeoJSON reemplazado',{archivo:file.name,lotes:normalized.stats.lotesActivos,polígonos:normalized.stats.poligonosOriginales});
        showToast('GeoJSON validado y guardado. Recarga para aplicarlo.');adminSettingsView();
      }catch(error){showToast(error.message || 'No se pudo importar el GeoJSON.');}
      finally{ui.mapBusy=false;event.target.value='';}
      return;
    }
    if(['config-package-file','login-config-file'].includes(event.target.id)&&event.target.files?.[0]){
      try{
        if(event.target.files[0].size>2*1024*1024) throw new Error('El paquete supera el límite de 2 MB.');
        await importConfigPackage(event.target.files[0]);
      }
      catch(error){showToast(error.message || 'No se pudo aplicar el paquete.');}
      event.target.value='';return;
    }
    if(event.target.matches('#admin-user-form [name="role"]')){
      const role=event.target.value,grid=document.querySelector('#admin-permission-grid');
      if(grid)grid.innerHTML=permissionsHtml(rolePermissions(role));
    }
  });

  window.FenologiaAdmin={version:VERSION,systemEpoch:SYSTEM_EPOCH,ready:()=>initialize(),config:()=>clone(adminConfig),map:()=>clone(adminMap),importPackage:importConfigPackage,centralSnapshot,applyCentralConfig,handleCentralDeactivation};

  initialize();
})();
