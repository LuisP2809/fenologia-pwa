(() => {
  const PLATFORM_VERSION = '0.12.0';
  let installPrompt = null;
  let serviceWorkerRegistration = null;
  let updateAvailable = false;
  let reloadingForUpdate = false;

  const isNative = () => Boolean(
    window.Capacitor?.isNativePlatform?.() ||
    ['capacitor:','ionic:'].includes(location.protocol)
  );
  const isStandalone = () => isNative() ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  async function requestPersistentStorage(){
    try{
      if(!navigator.storage?.persist) return false;
      if(await navigator.storage.persisted?.()) return true;
      return await navigator.storage.persist();
    }catch{return false;}
  }

  function installButton(){
    if(isStandalone()) return '';
    return `<button type="button" class="platform-install-button" id="platform-install" title="Instalar Fenología"><span>⬇</span><b>Instalar</b></button>`;
  }

  function updateBanner(){
    if(!updateAvailable) return '';
    return `<section class="platform-update-banner" id="platform-update-banner"><div><span>NUEVA VERSIÓN</span><b>Fenología está lista para actualizarse</b><small>Los registros locales se conservarán.</small></div><button type="button" id="platform-update">Actualizar ahora</button></section>`;
  }

  function decorateHeader(){
    const topbar=document.querySelector('.topbar');
    if(!topbar || topbar.querySelector('#platform-install') || isStandalone()) return;
    const connection=topbar.querySelector('.connection');
    connection?.insertAdjacentHTML('beforebegin',installButton());
  }

  function decorateLogin(){
    const card=document.querySelector('.login-card');
    if(!card || card.querySelector('.platform-login-card')) return;
    const installed=isStandalone();
    card.insertAdjacentHTML('beforeend',`<section class="platform-login-card ${installed?'installed':''}"><span>${installed?'✓':'⬇'}</span><div><b>${installed?'Aplicación instalada':'Instalar Fenología'}</b><p>${installed?'Se ejecuta como aplicación independiente y conserva los datos localmente.':'Agrégala a la pantalla principal para trabajar con acceso rápido y sin conexión.'}</p></div>${installed?'':`<button type="button" id="platform-install">Instalar</button>`}</section>`);
  }

  function decorateUpdate(){
    if(!updateAvailable || document.querySelector('#platform-update-banner')) return;
    const content=document.querySelector('.content');
    content?.insertAdjacentHTML('afterbegin',updateBanner());
  }

  function decorate(){
    decorateHeader();
    decorateLogin();
    decorateUpdate();
    document.documentElement.dataset.platform=isNative()?'android':isStandalone()?'pwa':'web';
  }

  const previousHeader=header;
  header=function platformHeader(){
    const html=previousHeader();
    if(isStandalone()) return html;
    const template=document.createElement('template');
    template.innerHTML=html;
    const connection=template.content.querySelector('.connection');
    connection?.insertAdjacentHTML('beforebegin',installButton());
    return template.innerHTML;
  };

  const previousLoginView=loginView;
  loginView=function platformLoginView(){
    previousLoginView();
    decorateLogin();
  };

  const previousRender=render;
  render=function platformRender(){
    const result=previousRender();
    decorate();
    return result;
  };

  const browserDownload=typeof downloadFile==='function'?downloadFile:null;
  if(browserDownload){
    downloadFile=function platformDownload(name,content,type='text/plain;charset=utf-8'){
      if(isNative() && navigator.share && typeof File!=='undefined'){
        try{
          const file=new File([content],name,{type});
          if(!navigator.canShare || navigator.canShare({files:[file]})){
            navigator.share({title:name,files:[file]}).catch(error=>{
              if(error?.name!=='AbortError') browserDownload(name,content,type);
            });
            return;
          }
        }catch(error){console.warn('No se pudo abrir el panel de compartir:',error);}
      }
      return browserDownload(name,content,type);
    };
  }

  function showInstallHelp(){
    const ua=navigator.userAgent.toLowerCase();
    if(/iphone|ipad|ipod/.test(ua)){
      showToast('En Safari pulsa Compartir y luego “Agregar a inicio”.');
    }else if(/android/.test(ua)){
      showToast('Abre el menú del navegador y pulsa “Instalar aplicación”.');
    }else{
      showToast('Usa el icono de instalación de la barra del navegador.');
    }
  }

  async function beginInstall(){
    await requestPersistentStorage();
    if(!installPrompt){showInstallHelp();return;}
    const prompt=installPrompt;
    installPrompt=null;
    await prompt.prompt();
    await prompt.userChoice.catch(()=>null);
    decorate();
  }

  async function applyUpdate(){
    const waiting=serviceWorkerRegistration?.waiting;
    if(!waiting){
      await serviceWorkerRegistration?.update?.();
      showToast('Buscando la versión más reciente…');
      return;
    }
    waiting.postMessage({type:'SKIP_WAITING'});
  }

  async function registerServiceWorker(){
    if(isNative() || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    try{
      const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
      serviceWorkerRegistration=registration;
      if(registration.waiting && navigator.serviceWorker.controller){
        updateAvailable=true;decorateUpdate();
      }
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='installed' && navigator.serviceWorker.controller){
            updateAvailable=true;
            decorateUpdate();
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(reloadingForUpdate) return;
        reloadingForUpdate=true;
        location.reload();
      });
      window.setTimeout(()=>registration.update().catch(()=>{}),2500);
    }catch(error){console.warn('No se pudo registrar el modo offline:',error);}
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    installPrompt=event;
    decorate();
  });
  window.addEventListener('appinstalled',()=>{
    installPrompt=null;
    requestPersistentStorage();
    showToast('Fenología quedó instalada.');
    decorate();
  });
  window.addEventListener('online',()=>{
    const node=document.querySelector('.connection');
    if(node){node.innerHTML='<i class="online"></i>En línea';}
  });
  window.addEventListener('offline',()=>{
    const node=document.querySelector('.connection');
    if(node){node.innerHTML='<i class="offline"></i>Sin conexión';}
  });

  document.addEventListener('click',event=>{
    if(event.target.closest('#platform-install')){beginInstall();return;}
    if(event.target.closest('#platform-update')){applyUpdate();}
  });

  window.FenologiaPlatform={
    version:PLATFORM_VERSION,
    isNative,
    isStandalone,
    requestPersistentStorage,
    registration:()=>serviceWorkerRegistration
  };

  registerServiceWorker();
  if(typeof state!=='undefined'&&state.catalog) decorate();
})();