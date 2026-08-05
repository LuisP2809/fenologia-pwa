(() => {
  const APP_VERSION = '0.8.0';
  const scripts = [
    'app-core.js',
    'app-eval.js',
    'app-admin.js',
    'app-security.js',
    'app-workflow-patches.js',
    'app-export-filters.js',
    'app-db-ui.js',
    'app-supervisor.js',
    'app-supervisor-role.js',
    'app-supervisor-unified.js',
    'app-release.js',
    'app-map.js'
  ];

  function loadingView(message,detail='Preparando el almacenamiento local seguro…'){
    const app = document.querySelector('#app');
    if(!app) return;
    app.innerHTML = `<main class="db-loading-page"><section class="db-loading-card"><div class="db-loading-icon">🌿</div><span>FENOLOGÍA</span><h1>${message}</h1><p>${detail}</p><div class="db-loading-bar"><i></i></div></section></main>`;
  }

  function loadScript(path){
    return new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = `${path}?v=${APP_VERSION}`;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`No se pudo cargar ${path}.`));
      document.body.appendChild(script);
    });
  }

  async function start(){
    loadingView('Preparando tus datos');
    const result = await window.FenologiaDB.prepare();
    loadingView(
      result.ok ? 'Almacenamiento listo' : 'Modo de compatibilidad activo',
      result.ok
        ? `${result.recordCount} registro(s) disponibles. Cargando la aplicación…`
        : 'IndexedDB no estuvo disponible; se conservará el almacenamiento anterior.'
    );

    for(const path of scripts) await loadScript(path);
    window.dispatchEvent(new CustomEvent('fenologia-app-ready',{detail:{version:APP_VERSION,storage:result}}));
  }

  start().catch(error => {
    console.error(error);
    const app = document.querySelector('#app');
    if(app) app.innerHTML = `<main class="fatal"><h1>No se pudo iniciar Fenología</h1><p>${String(error.message || error)}</p><button onclick="location.reload()">Reintentar</button></main>`;
  });
})();