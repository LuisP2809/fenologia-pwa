(() => {
  function migrationDate(info){
    if(!info?.migratedAt) return 'No disponible';
    return new Date(info.migratedAt).toLocaleString('es-PE');
  }

  function storagePanelHtml(){
    const fallback = window.FenologiaDB?.isFallback();
    const migration = window.FenologiaDB?.migrationInfo();
    return `<section class="panel db-status-panel">
      <div class="db-status-icon">${fallback?'⚠️':'🗄️'}</div>
      <div class="db-status-main">
        <span>ALMACENAMIENTO LOCAL</span>
        <h2>${fallback?'Modo de compatibilidad':'IndexedDB activo'}</h2>
        <p>${fallback?'El dispositivo está utilizando temporalmente el almacenamiento anterior. Los registros siguen disponibles.':'Los registros se guardan en una base local preparada para mayor cantidad de evaluaciones.'}</p>
      </div>
      <div class="db-status-metrics">
        <div><b id="db-record-count">${state.records.length}</b><span>Registros</span></div>
        <div><b>${migration?.legacyKeysPreserved?'Sí':'—'}</b><span>Copia anterior</span></div>
      </div>
      <div class="db-status-detail">
        <span>Primera migración</span><b>${migrationDate(migration)}</b>
        <small id="db-live-status">${fallback?'Compatibilidad activa':'Todos los cambios están guardados localmente.'}</small>
      </div>
      <button type="button" class="secondary" id="verify-db-storage">Verificar almacenamiento</button>
    </section>`;
  }

  function countIndexedDbRecords(){
    return new Promise((resolve,reject) => {
      const request = indexedDB.open('fenologia-pwa',1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('records','readonly');
        const countRequest = transaction.objectStore('records').count();
        countRequest.onsuccess = () => resolve(countRequest.result);
        countRequest.onerror = () => reject(countRequest.error || new Error('No se pudo contar los registros.'));
        transaction.oncomplete = () => db.close();
      };
      request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB.'));
    });
  }

  const previousSidebar = sidebar;
  sidebar = function indexedDbSidebar(){
    let html = previousSidebar().replace(/Versión\s+[0-9.]+/,'Versión 0.6.0');
    html = html.replace(/<small>(IndexedDB activo|Compatibilidad local|Guardado local activo)<\/small>/,`<small>${window.FenologiaDB?.isFallback()?'Compatibilidad local':'IndexedDB activo'}</small>`);
    return html;
  };

  const previousExportView = exportView;
  exportView = function indexedDbExportView(){
    previousExportView();
    if(document.querySelector('.db-status-panel')) return;
    const reference = document.querySelector('.export-period-panel') || document.querySelector('.export-grid');
    if(reference) reference.insertAdjacentHTML('beforebegin',storagePanelHtml());
  };

  document.addEventListener('click',async event => {
    if(!event.target.closest('#verify-db-storage')) return;
    const button = event.target.closest('#verify-db-storage');
    button.disabled = true;
    button.textContent = 'Verificando…';
    try{
      await window.FenologiaDB.flush();
      const status = await window.FenologiaDB.status();
      const storedCount = status.fallbackMode ? state.records.length : await countIndexedDbRecords();
      const screenCount = state.records.length;
      const matches = storedCount === screenCount;
      const message = status.fallbackMode
        ? 'La aplicación está operando con el almacenamiento de compatibilidad.'
        : matches
          ? `${storedCount} registro(s) confirmados correctamente en IndexedDB.`
          : `Revisión pendiente: pantalla ${screenCount}, IndexedDB ${storedCount}.`;
      showToast(message);
      const count = document.querySelector('#db-record-count');
      if(count) count.textContent = String(storedCount);
      const live = document.querySelector('#db-live-status');
      if(live) live.textContent = status.fallbackMode
        ? 'Compatibilidad activa'
        : matches
          ? `Verificado: ${new Date().toLocaleTimeString('es-PE')}`
          : 'La cantidad guardada no coincide; registra un respaldo antes de continuar.';
    }catch(error){
      showToast(error.message || 'No se pudo verificar el almacenamiento.');
    }finally{
      button.disabled = false;
      button.textContent = 'Verificar almacenamiento';
    }
  });

  window.addEventListener('fenologia-db-status',event => {
    const live = document.querySelector('#db-live-status');
    if(!live) return;
    if(event.detail?.status === 'saving') live.textContent = 'Guardando cambios…';
    if(event.detail?.status === 'saved') live.textContent = `Guardado: ${new Date(event.detail.lastSavedAt).toLocaleTimeString('es-PE')}`;
    if(event.detail?.status === 'error') live.textContent = 'No se pudo confirmar el último guardado.';
  });

  if(typeof state !== 'undefined' && state.catalog) render();
})();
