(() => {
  const VERSION='0.15.1';
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
    loading('Aplicando la actualización',`Instalando Fenología ${VERSION} sin borrar tus datos…`);
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
