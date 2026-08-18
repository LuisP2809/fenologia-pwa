(() => {
  const IDLE_MS=30*60*1000;
  let lastPersist=0;
  function persistActivity(){
    if(!state?.session||Date.now()-lastPersist<60000)return;
    state.session.lastActiveAt=new Date().toISOString();
    localStorage.setItem('fenologia-session',JSON.stringify(state.session));lastPersist=Date.now();
  }
  function expired(){
    if(!state?.session)return false;
    const expiresAt=new Date(state.session.expiresAt||0).getTime();
    const lastActiveAt=new Date(state.session.lastActiveAt||0).getTime();
    return !expiresAt||Date.now()>expiresAt||!lastActiveAt||Date.now()-lastActiveAt>IDLE_MS;
  }
  function lockIfExpired(){
    if(!expired())return;
    localStorage.removeItem('fenologia-session');state.session=null;state.editingId=null;state.selectedRecordId=null;state.view='home';render();showToast('La sesión se cerró por seguridad. Ingresa nuevamente.');
  }
  ['pointerdown','keydown','input'].forEach(type=>document.addEventListener(type,persistActivity,{passive:true}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')lockIfExpired();});
  setInterval(lockIfExpired,60000);
  window.FenologiaSessionSecurity={persistActivity,expired};
})();
