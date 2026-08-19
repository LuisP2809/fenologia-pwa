(() => {
  const VERSION='0.16.0';
  const RESET_MARKER='fenologia-fresh-start-v1';
  const DATABASE_NAME='fenologia-pwa';
  const LOCAL_KEYS=new Set([
    'admin-config-v1','admin-map-v1','admin-config-history-v1','device-config-v1',
    'dynamic-parameters-v1','dynamic-parameters-history-v1','package-signing-identity-v1',
    'trusted-package-signer-v1','supervisor-import-history-v1','supervisor-deletion-history-v1'
  ]);
  const app=document.querySelector('#app');

  function loading(title,detail){
    if(!app)return;
    app.innerHTML=`<main class="db-loading-page"><section class="db-loading-card"><div class="db-loading-icon">🌿</div><span>FENOLOGÍA</span><h1>${title}</h1><p>${detail}</p><div class="db-loading-bar"><i></i></div></section></main>`;
  }

  function loadScript(path){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=path;
      script.async=false;
      script.onload=resolve;
      script.onerror=()=>reject(new Error(`No se pudo cargar ${path.split('?')[0]}.`));
      document.body.appendChild(script);
    });
  }

  function removeApplicationKeys(storage){
    const keys=[];
    for(let index=0;index<storage.length;index+=1)keys.push(storage.key(index));
    keys.filter(key=>key&&(key.startsWith('fenologia-')||LOCAL_KEYS.has(key))).forEach(key=>storage.removeItem(key));
  }

  function deleteApplicationDatabase(){
    if(!('indexedDB' in window))return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const request=window.indexedDB.deleteDatabase(DATABASE_NAME);
      request.onsuccess=()=>resolve();
      request.onerror=()=>reject(request.error||new Error('No se pudo eliminar la base local anterior.'));
      request.onblocked=()=>loading('Cierra otras pestañas de Fenología','El reinicio continuará cuando ningún otro acceso a la aplicación mantenga abierta la base local.');
    });
  }

  async function resetApplicationData(){
    if(localStorage.getItem(RESET_MARKER)==='done')return false;
    loading('Reiniciando Fenología','Eliminando usuarios, roles, sesiones, evaluaciones y configuraciones anteriores de este dispositivo…');
    await deleteApplicationDatabase();
    removeApplicationKeys(localStorage);
    removeApplicationKeys(sessionStorage);
    localStorage.setItem(RESET_MARKER,'done');
    return true;
  }

  function waitForInstallation(registration){
    const worker=registration.installing;
    if(registration.waiting||!worker)return Promise.resolve();
    return new Promise(resolve=>{
      let finished=false;
      const finish=()=>{if(finished)return;finished=true;resolve();};
      const inspect=()=>{if(['installed','activated','redundant'].includes(worker.state))finish();};
      worker.addEventListener('statechange',inspect);
      inspect();
      window.setTimeout(finish,12000);
    });
  }

  async function activatePendingWorker(registration){
    if(!navigator.serviceWorker.controller)return false;
    if(!registration.waiting){
      try{await registration.update();}catch{return false;}
      await waitForInstallation(registration);
    }
    const waiting=registration.waiting;
    if(!waiting)return false;
    loading('Aplicando la actualización',`Instalando Fenología ${VERSION} y reemplazando la caché anterior…`);
    await new Promise(resolve=>{
      let finished=false;
      const finish=()=>{if(finished)return;finished=true;resolve();};
      navigator.serviceWorker.addEventListener('controllerchange',finish,{once:true});
      waiting.postMessage({type:'SKIP_WAITING'});
      window.setTimeout(finish,8000);
    });
    location.reload();
    return true;
  }

  async function start(){
    loading('Verificando la aplicación',`Comprobando Fenología ${VERSION}…`);
    await resetApplicationData();
    if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){
      try{
        const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
        if(await activatePendingWorker(registration))return;
      }catch(error){console.warn('No se pudo comprobar la actualización antes del inicio:',error);}
    }
    await loadScript(`app-db.js?v=${VERSION}`);
    await loadScript(`app-bootstrap.js?v=${VERSION}`);
  }

  start().catch(error=>{
    console.error(error);
    if(!app)return;
    app.innerHTML=`<main class="fatal"><h1>No se pudo iniciar Fenología</h1><p>${String(error.message||error)}</p><button id="retry-app-update">Reintentar</button></main>`;
    document.querySelector('#retry-app-update')?.addEventListener('click',()=>location.reload());
  });
})();
