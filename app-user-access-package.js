(() => {
  const VERSION='0.18.0';
  const DEFAULT_ENDPOINT='https://script.google.com/macros/s/AKfycby4c2t4QzQsUy9_OdHA7MF8hmVknbbzDwrVvSiL0yj5KNkK4eZ02CtzfWjWqlWm5tSd/exec';
  let activationScreen=false;

  const safe=value=>String(value??'').trim();
  const formatExpiry=value=>{try{return new Intl.DateTimeFormat('es-PE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}catch{return safe(value);}};
  const normalizeCode=value=>{const code=safe(value).toUpperCase().replace(/[^A-Z0-9]/g,'');return code.length===8?`${code.slice(0,4)}-${code.slice(4)}`:safe(value).toUpperCase();};

  class AccessError extends Error{
    constructor(code,message){super(message);this.name='FenologiaAccessError';this.code=code||'ACCESS_ERROR';}
  }

  function endpointFromConfig(){return safe(window.FenologiaSync?.getConfig?.().endpoint)||DEFAULT_ENDPOINT;}
  function validateEndpoint(value){
    const endpoint=safe(value);let url;
    try{url=new URL(endpoint);}catch{throw new AccessError('INVALID_ENDPOINT','La URL del servidor no es válida.');}
    if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!url.pathname.endsWith('/exec'))throw new AccessError('INVALID_ENDPOINT','Usa la URL HTTPS de Apps Script terminada en /exec.');
    return endpoint;
  }

  async function post(endpoint,body){
    if(!navigator.onLine)throw new AccessError('OFFLINE','Necesitas internet para completar esta operación.');
    let response;
    try{response=await fetch(validateEndpoint(endpoint),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),cache:'no-store'});}
    catch(error){throw new AccessError('NETWORK_ERROR','No se pudo contactar al servidor central.');}
    if(!response.ok)throw new AccessError(`HTTP_${response.status}`,`El servidor respondió HTTP ${response.status}.`);
    const result=await response.json();
    if(!result?.ok)throw new AccessError(result?.errorCode,result?.message||result?.error||'La solicitud fue rechazada.');
    return result;
  }

  function authEnvelope(action,payload={}){
    const config=window.FenologiaSync?.getConfig?.()||{};
    const evaluatorId=safe(state.session?.id)||safe(window.FenologiaAdmin?.config?.()?.users?.[0]?.id);
    if(!evaluatorId||!safe(config.deviceToken))throw new AccessError('NO_PROFILE','Este dispositivo no tiene una credencial central activa.');
    return {endpoint:config.endpoint,body:{action,evaluatorId,deviceToken:config.deviceToken,...payload}};
  }

  function adminRequest(action,payload={}){const request=authEnvelope(action,payload);return post(request.endpoint,request.body);}
  function bootstrapAdmin(values){return post(values.endpoint,{action:'bootstrap-admin',setupCode:values.setupCode,name:values.name,username:values.username});}
  function createUser(user){return adminRequest('create-user',{user});}
  function updateUser(user){return adminRequest('update-user',{user});}
  function setUserActive(targetUserId,active){return adminRequest('set-user-active',{targetUserId,active});}
  function createActivation(targetUserId){return adminRequest('create-activation',{targetUserId});}
  function redeemActivation(endpoint,activationCode){return post(endpoint,{action:'redeem-activation',activationCode});}
  function verifyCentralUser(){return adminRequest('ping');}

  function activationParams(value=location.href){
    try{const url=new URL(value,location.href);return {code:safe(url.searchParams.get('activate')),endpoint:safe(url.searchParams.get('server'))};}
    catch{return {code:'',endpoint:''};}
  }

  function activationLink(activation){
    const url=new URL(location.origin+location.pathname);
    url.searchParams.set('activate',activation.code);url.searchParams.set('server',endpointFromConfig());
    return url.toString();
  }

  function qrSvg(value){
    if(typeof window.qrcode!=='function')return '<div class="activation-qr-fallback">QR no disponible</div>';
    const qr=window.qrcode(0,'M');qr.addData(String(value));qr.make();return qr.createSvgTag({cellSize:5,margin:2,scalable:true});
  }

  function activationModal(activation,title){
    const link=activationLink(activation);
    return `<div class="admin-modal-backdrop" id="admin-modal"><section class="admin-modal activation-share-modal">
      <div class="admin-modal-head"><div><span>ACCESO DE UN SOLO USO</span><h2>${esc(title||'Activar dispositivo')}</h2></div><button type="button" data-close-admin-modal>×</button></div>
      <div class="activation-share-grid">
        <div class="activation-qr" aria-label="Código QR de activación">${qrSvg(link)}</div>
        <div class="activation-share-copy"><span>${esc(activation.user?.role||'Usuario')}</span><h3>${esc(activation.user?.name||'')}</h3><p>Usuario: <b>@${esc(activation.user?.username||'')}</b> · ${esc(activation.user?.id||'')}</p><code>${esc(activation.code)}</code><small>Vence: ${esc(formatExpiry(activation.expiresAt))}. Solo puede usarse una vez.</small></div>
      </div>
      <label class="activation-link-field">Enlace completo<input id="activation-link" value="${esc(link)}" readonly></label>
      <div class="admin-modal-actions"><button class="secondary" type="button" id="copy-activation-link">Copiar enlace</button><button class="primary" type="button" id="share-activation-link">Compartir acceso</button></div>
    </section></div>`;
  }

  function showActivation(activation,title){
    let host=document.querySelector('#admin-modal-host');
    if(!host){host=document.createElement('div');host.id='admin-modal-host';document.body.appendChild(host);}
    host.innerHTML=activationModal(activation,title);
  }

  function renderActivation(prefill=activationParams()){
    activationScreen=true;
    const endpoint=prefill.endpoint||endpointFromConfig();
    app.innerHTML=`<main class="login-page activation-page">
      <section class="login-hero"><div class="brand-mark">${icons.leaf}</div><span class="eyebrow">ACTIVACIÓN SEGURA</span><h1>Fenología</h1><p>Configura este dispositivo con el QR, enlace o código entregado por el Administrador.</p><div class="hero-points"><span>${icons.check} Código de un solo uso</span><span>${icons.check} PIN privado</span><span>${icons.check} Trabajo offline después de activar</span></div></section>
      <section class="login-card activation-card"><div><span class="eyebrow green">NUEVO ACCESO</span><h2>Activar dispositivo</h2><p>Crea un PIN que solo tú conocerás.</p></div>
        <form id="device-activation-form">
          <label>Código o enlace de activación<input name="activation" value="${esc(prefill.code||'')}" placeholder="ABCD-2345 o pega el enlace" autocomplete="one-time-code" required></label>
          <details ${prefill.endpoint?'open':''}><summary>Servidor central</summary><label>URL de Apps Script<input name="endpoint" type="url" value="${esc(endpoint)}" required></label></details>
          <label>Crea tu PIN (6 a 12 números)<input name="pin" type="password" inputmode="numeric" minlength="6" maxlength="12" pattern="[0-9]{6,12}" autocomplete="new-password" required></label>
          <label>Repite el PIN<input name="pinConfirmation" type="password" inputmode="numeric" minlength="6" maxlength="12" pattern="[0-9]{6,12}" autocomplete="new-password" required></label>
          <button class="primary wide">Activar y entrar <span>→</span></button><button class="secondary wide" type="button" data-cancel-activation>Volver al ingreso</button>
        </form><p class="activation-note">Después de activar, el ingreso normal será con Usuario + PIN. No necesitas guardar archivos JSON.</p>
      </section></main>`;
  }

  function decorateLogin(){
    if(state.session||activationScreen)return;
    const card=document.querySelector('.login-card');if(!card)return;
    const setupEndpoint=card.querySelector('#first-admin-form [name="endpoint"]');if(setupEndpoint&&!safe(setupEndpoint.value))setupEndpoint.value=DEFAULT_ENDPOINT;
    if(card.querySelector('[data-open-activation]'))return;
    card.insertAdjacentHTML('beforeend','<div class="config-login-import"><b>¿Recibiste un acceso?</b><p>Escanea el QR o escribe el código temporal.</p><button class="secondary" type="button" data-open-activation>Activar este dispositivo</button></div>');
  }

  document.addEventListener('submit',async event=>{
    if(event.target.id!=='device-activation-form')return;
    event.preventDefault();event.stopImmediatePropagation();
    const data=new FormData(event.target);const pin=safe(data.get('pin')),confirmation=safe(data.get('pinConfirmation'));
    if(!/^\d{6,12}$/.test(pin))return showToast('El PIN debe tener entre 6 y 12 números.');
    if(pin!==confirmation)return showToast('Los PIN no coinciden.');
    let raw=safe(data.get('activation')),endpoint=safe(data.get('endpoint')),code=raw;
    if(/^https?:\/\//i.test(raw)){const parsed=activationParams(raw);code=parsed.code;endpoint=parsed.endpoint||endpoint;}
    try{
      const result=await redeemActivation(endpoint,normalizeCode(code));
      await window.FenologiaSync.saveConfig({...window.FenologiaSync.getConfig(),enabled:true,transport:'apps-script',endpoint,deviceToken:result.profile.deviceToken});
      await window.FenologiaAdmin.installActivatedUser(result.profile,pin,endpoint);
      activationScreen=false;history.replaceState({},'',location.pathname);render();showToast('Dispositivo activado correctamente.');
      window.FenologiaSync.refreshCentralConfig().catch(()=>{});
    }catch(error){showToast(error.code==='ACTIVATION_EXPIRED'?'El código venció. Solicita uno nuevo al Administrador.':error.message||'No se pudo activar el dispositivo.');}
  },true);

  document.addEventListener('click',async event=>{
    if(event.target.closest('[data-open-activation]')){event.preventDefault();renderActivation({code:'',endpoint:endpointFromConfig()});return;}
    if(event.target.closest('[data-cancel-activation]')){activationScreen=false;history.replaceState({},'',location.pathname);render();return;}
    if(event.target.closest('#copy-activation-link')){
      const link=document.querySelector('#activation-link')?.value||'';
      try{await navigator.clipboard.writeText(link);showToast('Enlace de activación copiado.');}catch{showToast('No se pudo copiar automáticamente.');}
      return;
    }
    if(event.target.closest('#share-activation-link')){
      const link=document.querySelector('#activation-link')?.value||'';
      if(navigator.share){try{await navigator.share({title:'Acceso Fenología',text:'Activa tu acceso de Fenología.',url:link});return;}catch(error){if(error.name==='AbortError')return;}}
      try{await navigator.clipboard.writeText(link);showToast('Enlace copiado para compartir.');}catch{showToast('Comparte el QR mostrado en pantalla.');}
    }
  },true);

  const observer=new MutationObserver(mutations=>{if(mutations.some(mutation=>mutation.addedNodes.length))decorateLogin();});
  observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});

  window.addEventListener('fenologia-app-ready',()=>{
    const params=activationParams();if(params.code&&!state.session)renderActivation(params);else decorateLogin();
  },{once:true});
  setTimeout(()=>{const params=activationParams();if(params.code&&!state.session)renderActivation(params);else decorateLogin();},0);

  window.FenologiaAccess={version:VERSION,defaultEndpoint:()=>DEFAULT_ENDPOINT,bootstrapAdmin,createUser,updateUser,setUserActive,createActivation,redeemActivation,verifyCentralUser,showActivation,renderActivation,activationParams};
})();
