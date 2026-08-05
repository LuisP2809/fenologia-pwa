(() => {
  const APP_VERSION = '0.7.2';
  const IMPORT_HISTORY_KEY = 'supervisor-import-history-v1';
  const DELETION_HISTORY_KEY = 'supervisor-deletion-history-v1';
  const LAST_BACKUP_KEY = 'fenologia-supervisor-last-backup';

  const isSupervisorOnly = () => state.session?.role === 'Supervisor';

  function shortDate(value){
    const date = value ? new Date(value) : new Date();
    const day = String(date.getDate()).padStart(2,'0');
    const month = String(date.getMonth()+1).padStart(2,'0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}_${month}_${year}`;
  }

  function supervisorUnifiedHome(){
    const evaluators = new Set(state.records.map(record => record.evaluatorId || record.evaluator).filter(Boolean)).size;
    app.innerHTML = shell(`${titleBlock('SUPERVISOR','Panel de consolidación','Recibe los archivos de los evaluadores, revisa la calidad y administra la base consolidada desde un solo lugar.')}
      <section class="metrics-grid">
        ${metric(state.records.length,'Registros consolidados',icons.detail,'Disponibles en este dispositivo')}
        ${metric(countToday(),'Evaluaciones de hoy',icons.clipboard,'Según la fecha de evaluación')}
        ${metric(lotsToday(),'Lotes evaluados hoy',icons.map,'Lotes distintos')}
        ${metric(evaluators,'Evaluadores incluidos',icons.users,'Con información consolidada')}
      </section>
      <section class="panel"><div class="panel-head"><div><span>ACCESOS DEL SUPERVISOR</span><h2>¿Qué deseas revisar?</h2></div></div>
        <div class="actions-grid supervisor-home-actions">
          ${actionCard('consolidate',icons.sync,'Consolidar','Importa, revisa, exporta, respalda y administra la base.','Principal')}
          ${actionCard('map',icons.map,'Mapa de avance','Consulta los lotes evaluados en el periodo seleccionado.')}
          ${actionCard('charts',icons.chart,'Gráficos','Revisa los indicadores de la información consolidada.')}
        </div>
      </section>
      <section class="panel supervisor-role-note"><div class="supervisor-role-note-icon">ℹ️</div><div><b>Todo el manejo de archivos está dentro de Consolidar</b><p>Los CSV de los evaluadores, la exportación final, el respaldo y la recuperación se administran desde ese único apartado.</p></div></section>`);
  }

  function backupPanelHtml(){
    const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
    return `<section class="panel supervisor-backup-panel">
      <div class="panel-head"><div><span>RESPALDO Y RECUPERACIÓN</span><h2>Protege la base consolidada</h2><p>El respaldo incluye todos los registros, las asignaciones y los historiales del Supervisor.</p></div><span class="supervisor-backup-status ${lastBackup?'ok':'pending'}">${lastBackup?`Último: ${new Date(lastBackup).toLocaleString('es-PE')}`:'Respaldo pendiente'}</span></div>
      <div class="supervisor-backup-actions">
        <button type="button" class="primary" id="supervisor-create-full-backup">🛡️ Crear respaldo completo</button>
        <button type="button" class="secondary" id="supervisor-restore-full-backup">↻ Restaurar respaldo</button>
        <input type="file" id="supervisor-backup-file" accept="application/json,.json" hidden>
      </div>
      <div class="supervisor-backup-note"><b>Importante:</b><span>Los archivos diarios de los evaluadores se cargan arriba, en Importar evaluaciones. “Restaurar respaldo” se usa únicamente para recuperar una copia completa del dispositivo del Supervisor.</span></div>
    </section>`;
  }

  function injectUnifiedTools(){
    if(!isSupervisorOnly() || state.view !== 'consolidate') return;
    document.querySelector('.supervisor-export-explainer')?.remove();
    if(document.querySelector('.supervisor-backup-panel')) return;

    const exportPanel = document.querySelector('.supervisor-export-panel');
    const management = document.querySelector('.supervisor-data-management');
    if(exportPanel) exportPanel.insertAdjacentHTML('afterend',backupPanelHtml());
    else if(management) management.insertAdjacentHTML('beforebegin',backupPanelHtml());
    else document.querySelector('main.content')?.insertAdjacentHTML('beforeend',backupPanelHtml());
  }

  async function createSupervisorBackup(){
    try{
      await window.FenologiaDB?.flush?.();
      const importHistory = await window.FenologiaDB?.getSetting?.(IMPORT_HISTORY_KEY) || [];
      const deletionHistory = await window.FenologiaDB?.getSetting?.(DELETION_HISTORY_KEY) || [];
      const createdAt = new Date().toISOString();
      const payload = {
        type:'fenologia-supervisor-backup',
        version:1,
        createdAt,
        createdBy:{id:state.session.id,name:state.session.name},
        records:state.records,
        assignments:state.assignments,
        importHistory,
        deletionHistory
      };
      downloadFile(`Respaldo-Supervisor-${shortDate(createdAt)}.json`,JSON.stringify(payload,null,2),'application/json');
      localStorage.setItem(LAST_BACKUP_KEY,createdAt);
      showToast(`Respaldo completo creado con ${state.records.length} registro(s).`);
      render();
    }catch(error){
      console.error(error);
      showToast('No se pudo crear el respaldo completo.');
    }
  }

  async function restoreSupervisorBackup(file){
    try{
      const payload = JSON.parse(await file.text());
      if(payload?.type !== 'fenologia-supervisor-backup' || payload?.version !== 1 || !Array.isArray(payload.records)){
        throw new Error('El archivo no es un respaldo completo del Supervisor.');
      }
      const created = payload.createdAt ? new Date(payload.createdAt).toLocaleString('es-PE') : 'fecha no disponible';
      const accepted = confirm(`Se reemplazará la base consolidada actual por el respaldo del ${created}, con ${payload.records.length} registro(s). ¿Deseas continuar?`);
      if(!accepted) return;

      state.records = payload.records;
      state.assignments = payload.assignments && typeof payload.assignments === 'object' ? payload.assignments : {};
      save();
      await window.FenologiaDB?.flush?.();
      if(Array.isArray(payload.importHistory)) await window.FenologiaDB?.setSetting?.(IMPORT_HISTORY_KEY,payload.importHistory);
      if(Array.isArray(payload.deletionHistory)) await window.FenologiaDB?.setSetting?.(DELETION_HISTORY_KEY,payload.deletionHistory);
      localStorage.setItem(LAST_BACKUP_KEY,new Date().toISOString());
      state.view = 'consolidate';
      render();
      showToast(`Respaldo restaurado: ${state.records.length} registro(s).`);
    }catch(error){
      console.error(error);
      showToast(error.message || 'No se pudo restaurar el respaldo.');
    }
  }

  const priorSidebar = sidebar;
  sidebar = function unifiedSupervisorSidebar(){
    let html = priorSidebar().replace(/Versión\s+[0-9.]+/,'Versión 0.7.2');
    if(!isSupervisorOnly()) return html;
    html = html.replace(/<button data-view="export"[\s\S]*?<\/button>/,'');
    return html;
  };

  const priorHomeView = homeView;
  homeView = function unifiedSupervisorHomeView(){
    if(isSupervisorOnly()) return supervisorUnifiedHome();
    return priorHomeView();
  };

  const priorRender = render;
  render = function unifiedSupervisorRender(){
    if(isSupervisorOnly() && state.view === 'export') state.view = 'consolidate';
    const result = priorRender();
    if(isSupervisorOnly() && state.view === 'consolidate') injectUnifiedTools();
    return result;
  };

  document.addEventListener('click',event => {
    if(!isSupervisorOnly()) return;
    const obsoleteExport = event.target.closest('[data-view="export"]');
    if(obsoleteExport){
      event.preventDefault();
      event.stopImmediatePropagation();
      state.view = 'consolidate';
      render();
    }
  },true);

  document.addEventListener('click',event => {
    if(!isSupervisorOnly()) return;
    if(event.target.closest('#supervisor-create-full-backup')){
      createSupervisorBackup();
      return;
    }
    if(event.target.closest('#supervisor-restore-full-backup')){
      document.querySelector('#supervisor-backup-file')?.click();
    }
  });

  document.addEventListener('change',event => {
    if(!isSupervisorOnly() || event.target.id !== 'supervisor-backup-file') return;
    const file = event.target.files?.[0];
    event.target.value = '';
    if(file) restoreSupervisorBackup(file);
  });

  if(typeof state !== 'undefined' && state.catalog) render();
})();
