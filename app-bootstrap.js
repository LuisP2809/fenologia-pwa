(() => {
  const APP_VERSION = '0.14.0';
  const scripts = [
    'app-core.js','app-eval.js','app-admin.js','app-credentials.js','app-package-security.js','app-security.js','app-workflow-patches.js','app-export-filters.js','app-db-ui.js','app-supervisor.js','app-supervisor-role.js','app-supervisor-unified.js','app-map.js','app-charts.js','app-admin-complete.js','app-admin-dni-fix.js','app-user-access-package.js','app-admin-role-cleanup.js','app-dynamic-parameters.js','app-dynamic-supervisor.js','app-stage-analytics.js','app-stage-analytics-ui.js','app-charts-refinement.js','app-platform.js','app-xlsx-workflow.js','app-xlsx-compat.js','app-supervisor-file-analysis.js','app-analysis-source-guard.js','app-evaluator-navigation.js','app-evaluation-flow.js','app-session-security.js','app-release.js'
  ];
  function loadingView(message,detail='Preparando el almacenamiento local seguro…'){
    const app=document.querySelector('#app');if(!app)return;
    app.innerHTML=`<main class="db-loading-page"><section class="db-loading-card"><div class="db-loading-icon">🌿</div><span>FENOLOGÍA</span><h1>${message}</h1><p>${detail}</p><div class="db-loading-bar"><i></i></div></section></main>`;
  }
  async function resetCodespacesWorker(){
    if(!location.hostname.endsWith('.app.github.dev'))return false;
    const marker=`fenologia-codespaces-reset-${APP_VERSION}`;if(sessionStorage.getItem(marker)==='done')return false;
    loadingView('Actualizando entorno de prueba','Retirando el acceso de demostración de la pantalla de ingreso…');
    let changed=false;
    try{
      if('serviceWorker' in navigator){const registrations=await navigator.serviceWorker.getRegistrations();if(registrations.length){await Promise.all(registrations.map(registration=>registration.unregister()));changed=true;}}
      if('caches' in window){const names=(await caches.keys()).filter(name=>name.startsWith('fenologia-'));if(names.length){await Promise.all(names.map(name=>caches.delete(name)));changed=true;}}
    }catch(error){console.warn('No se pudo limpiar completamente el entorno de Codespaces:',error);}
    sessionStorage.setItem(marker,'done');
    if(changed||navigator.serviceWorker?.controller){const next=new URL(location.href);next.searchParams.set('fresh',APP_VERSION);location.replace(next.href);return true;}
    return false;
  }
  function loadScript(path){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`${path}?v=${APP_VERSION}`;script.async=false;script.onload=resolve;script.onerror=()=>reject(new Error(`No se pudo cargar ${path}.`));document.body.appendChild(script);});}
  async function start(){
    if(await resetCodespacesWorker())return;
    loadingView('Preparando tus datos');
    const result=await window.FenologiaDB.prepare();
    loadingView(result.ok?'Almacenamiento listo':'Modo de compatibilidad activo',result.ok?`${result.recordCount} registro(s) disponibles. Cargando la aplicación…`:'IndexedDB no estuvo disponible; se conservará el almacenamiento anterior.');
    for(const path of scripts){
      await loadScript(path);
      if(path==='app-admin-complete.js'){loadingView('Preparando Administrador','Cargando usuarios, campañas, catálogos y seguridad local…');await window.FenologiaAdmin?.ready();}
      if(path==='app-dynamic-parameters.js'){loadingView('Preparando parámetros','Cargando las variables adicionales y sus reglas de evaluación…');await window.FenologiaDynamicParameters?.ready();}
    }
    window.dispatchEvent(new CustomEvent('fenologia-app-ready',{detail:{version:APP_VERSION,storage:result}}));
  }
  start().catch(error=>{
    console.error(error);const app=document.querySelector('#app');if(!app)return;
    app.innerHTML=`<main class="fatal"><h1>No se pudo iniciar Fenología</h1><p>${String(error.message||error)}</p><button id="retry-app-start">Reintentar</button></main>`;
    document.querySelector('#retry-app-start')?.addEventListener('click',()=>location.reload());
  });
})();
