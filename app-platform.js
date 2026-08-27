(() => {
  const PLATFORM_VERSION = '0.17.0';
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

  const nativePlugin = name => window.Capacitor?.Plugins?.[name] || null;
  const safeFileName = value => String(value || 'archivo.txt')
    .replace(/[\\/:*?"<>|]+/g,'_')
    .replace(/\s+/g,'_');

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
    if(!card) return;
    if(!card.querySelector('.platform-login-version')){
      const form=card.querySelector('#login-form, #first-admin-form');
      form?.insertAdjacentHTML('beforebegin',`<div class="platform-login-version"><span>Versión ${PLATFORM_VERSION}</span><small>Interfaz y accesos actualizados</small></div>`);
    }
    if(!card.querySelector('.platform-login-card')){
      const installed=isStandalone();
      card.insertAdjacentHTML('beforeend',`<section class="platform-login-card ${installed?'installed':''}"><span>${installed?'✓':'⬇'}</span><div><b>${installed?'Aplicación instalada':'Instalar Fenología'}</b><p>${installed?'Se ejecuta como aplicación independiente y conserva los datos localmente.':'Agrégala a la pantalla principal para trabajar con acceso rápido y sin conexión.'}</p></div>${installed?'':`<button type="button" id="platform-install">Instalar</button>`}</section>`);
    }
    decorateUpdate();
  }

  function decorateUpdate(){
    if(!updateAvailable || document.querySelector('#platform-update-banner')) return;
    const content=document.querySelector('.content');
    if(content){content.insertAdjacentHTML('afterbegin',updateBanner());return;}
    const login=document.querySelector('.login-card');
    if(login){login.insertAdjacentHTML('beforeend',updateBanner());document.querySelector('#platform-update-banner')?.classList.add('login-update');}
  }

  function hasActiveSession(){
    return typeof state!=='undefined'&&Boolean(state.session);
  }

  function announceUpdate(registration){
    updateAvailable=true;
    decorateUpdate();
    if(hasActiveSession()) return;
    window.setTimeout(()=>{
      if(registration.waiting&&!hasActiveSession()) registration.waiting.postMessage({type:'SKIP_WAITING'});
    },800);
  }

  function decorateExportHelp(){
    if(!isNative() || !['export','consolidate'].includes(state?.view) || document.querySelector('.platform-export-help')) return;
    const content=document.querySelector('.content');
    const title=content?.querySelector('.page-title');
    title?.insertAdjacentHTML('afterend',`<section class="panel platform-export-help"><div><span>EXPORTACIÓN EN ANDROID</span><h2>Guardar y compartir</h2><p>Cada archivo se guardará en <b>Documentos/Fenología</b> y luego se abrirá el panel para compartirlo por WhatsApp, correo, Drive u otra aplicación.</p></div></section>`);
  }

  function decorate(){
    decorateHeader();
    decorateLogin();
    decorateUpdate();
    decorateExportHelp();
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

  async function writeNativeExport(name,content){
    const Filesystem=nativePlugin('Filesystem');
    if(!Filesystem) throw new Error('El complemento de archivos no está disponible en esta versión del APK.');

    const fileName=safeFileName(name);
    const data=String(content ?? '');
    let persistent=null;
    let persistentError=null;

    try{
      persistent=await Filesystem.writeFile({
        path:`Fenologia/${fileName}`,
        data,
        directory:'DOCUMENTS',
        encoding:'utf8',
        recursive:true
      });
    }catch(error){
      persistentError=error;
      console.warn('No se pudo guardar la copia en Documentos:',error);
    }

    const temporary=await Filesystem.writeFile({
      path:`FenologiaCompartir/${fileName}`,
      data,
      directory:'CACHE',
      encoding:'utf8',
      recursive:true
    });

    return {fileName,persistent,persistentError,temporary};
  }

  async function shareNativeExport(result){
    const Share=nativePlugin('Share');
    if(!Share) throw new Error('El complemento para compartir no está disponible en esta versión del APK.');
    const canShare=await Share.canShare?.().catch(()=>({value:true}));
    if(canShare && canShare.value===false) throw new Error('Android no permite compartir archivos en este dispositivo.');
    await Share.share({
      title:result.fileName,
      text:'Archivo exportado desde Fenología.',
      files:[result.temporary.uri],
      dialogTitle:'Compartir archivo de Fenología'
    });
  }

  async function exportNative(name,content,type){
    try{
      const result=await writeNativeExport(name,content,type);
      try{
        await shareNativeExport(result);
      }catch(error){
        if(!result.persistent) throw error;
        console.warn('El archivo se guardó, pero no se abrió el panel de compartir:',error);
      }

      if(result.persistent){
        showToast(`Guardado en Documentos/Fenología: ${result.fileName}`);
      }else{
        showToast('Archivo listo para compartir. Elige WhatsApp o “Guardar en archivos”.');
      }
      return result;
    }catch(error){
      console.error('No se pudo exportar desde Android:',error);
      showToast(error.message || 'No se pudo guardar ni compartir el archivo.');
      throw error;
    }
  }

  async function shareWebFile(name,content,type){
    if(!navigator.share || typeof File==='undefined') return false;
    try{
      const file=new File([content],name,{type});
      if(navigator.canShare && !navigator.canShare({files:[file]})) return false;
      await navigator.share({title:name,text:'Archivo exportado desde Fenología.',files:[file]});
      return true;
    }catch(error){
      if(error?.name==='AbortError') return true;
      console.warn('El navegador no pudo compartir el archivo:',error);
      return false;
    }
  }

  const browserDownload=typeof downloadFile==='function'?downloadFile:null;
  if(browserDownload){
    downloadFile=async function platformDownload(name,content,type='text/plain;charset=utf-8'){
      if(isNative()){
        const nativeResult=await exportNative(name,content,type);
        return {ok:true,persisted:Boolean(nativeResult.persistent),name:nativeResult.fileName,native:true};
      }

      const result=await browserDownload(name,content,type);
      if(result?.ok&&/android|iphone|ipad|ipod/i.test(navigator.userAgent)){
        const shared=await shareWebFile(name,content,type);
        if(shared) showToast('Archivo preparado y panel de compartir abierto.');
      }
      return result;
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
      if(registration.waiting && navigator.serviceWorker.controller) announceUpdate(registration);
      registration.addEventListener('updatefound',()=>{
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{
          if(worker.state==='installed' && navigator.serviceWorker.controller) announceUpdate(registration);
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
    exportFile:exportNative,
    registration:()=>serviceWorkerRegistration
  };

  registerServiceWorker();
  if(typeof state!=='undefined'&&state.catalog) decorate();
})();
