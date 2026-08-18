(() => {
  const APP_VERSION = '0.7.1';
  const DELETION_HISTORY_KEY = 'supervisor-deletion-history-v1';

  const isSupervisorRole = () => state.session?.role === 'Supervisor';
  const localIsoDate = (date = new Date()) => {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0,10);
  };

  function supervisorHomeView(){
    const evaluators = new Set(state.records.map(record => record.evaluatorId || record.evaluator).filter(Boolean)).size;
    app.innerHTML = shell(`${titleBlock('SUPERVISOR','Panel de consolidación','Importa los archivos enviados por los evaluadores, revisa la calidad de los datos y prepara la base consolidada.')}
      <section class="metrics-grid">
        ${metric(state.records.length,'Registros consolidados',icons.detail,'Disponibles en este dispositivo')}
        ${metric(countToday(),'Evaluaciones de hoy',icons.clipboard,'Según la fecha de evaluación')}
        ${metric(lotsToday(),'Lotes evaluados hoy',icons.map,'Lotes distintos')}
        ${metric(evaluators,'Evaluadores incluidos',icons.users,'Con información consolidada')}
      </section>
      <section class="panel"><div class="panel-head"><div><span>FLUJO DEL SUPERVISOR</span><h2>¿Qué deseas hacer?</h2></div></div>
        <div class="actions-grid">
          ${actionCard('consolidate',icons.sync,'Consolidar archivos','Carga los CSV o respaldos entregados por los evaluadores.','Principal')}
          ${actionCard('export',icons.file,'Exportar y respaldar','Descarga la base consolidada o crea un respaldo completo.')}
          ${actionCard('map',icons.map,'Mapa de avance','Consulta los lotes evaluados en el periodo seleccionado.')}
          ${actionCard('charts',icons.chart,'Gráficos','Revisa los indicadores de la información consolidada.')}
        </div>
      </section>
      <section class="panel supervisor-role-note"><div class="supervisor-role-note-icon">ℹ️</div><div><b>El Supervisor no registra evaluaciones</b><p>Las evaluaciones se realizan en los celulares de los evaluadores. Aquí únicamente se reciben, consolidan, exportan y analizan.</p></div></section>`);
  }

  function cleanSupervisorExportView(){
    document.querySelector('.cleanup-guidance')?.remove();
    document.querySelector('.danger-zone')?.remove();
    document.querySelector('.device-security-card')?.remove();
    document.querySelector('.cleanup-modal-overlay')?.remove();

    const title = document.querySelector('.page-title h1');
    const description = document.querySelector('.page-title p');
    if(title) title.textContent = 'Exportar y respaldar';
    if(description) description.textContent = 'Exporta la base consolidada o crea un respaldo completo del dispositivo del Supervisor.';

    const grid = document.querySelector('.export-grid');
    if(grid && !document.querySelector('.supervisor-export-explainer')){
      grid.insertAdjacentHTML('beforebegin',`<section class="panel supervisor-export-explainer">
        <div class="supervisor-export-explainer-icon">📦</div>
        <div><span>IMPORTANTE</span><h2>Los archivos de evaluadores se cargan en Consolidar</h2><p>Este apartado sirve para exportar Fenología, exportar Biometría y respaldar la base que ya fue consolidada. La limpieza con código semanal corresponde únicamente al celular del Evaluador.</p></div>
      </section>`);
    }
  }

  function matchingSupervisorRecords(){
    const evaluatorId = document.querySelector('#supervisor-delete-evaluator')?.value || '';
    const from = document.querySelector('#supervisor-delete-from')?.value || '';
    const to = document.querySelector('#supervisor-delete-to')?.value || '';
    if(!evaluatorId) return [];
    if(from && to && from > to) return [];
    return state.records.filter(record => {
      if(record.evaluatorId !== evaluatorId) return false;
      if(from && (!record.date || record.date < from)) return false;
      if(to && (!record.date || record.date > to)) return false;
      return true;
    });
  }

  function updateDeletePreview(){
    const count = document.querySelector('#supervisor-delete-count');
    const warning = document.querySelector('#supervisor-delete-warning');
    const button = document.querySelector('#review-supervisor-delete');
    if(!count || !warning || !button) return;

    const evaluatorId = document.querySelector('#supervisor-delete-evaluator')?.value || '';
    const from = document.querySelector('#supervisor-delete-from')?.value || '';
    const to = document.querySelector('#supervisor-delete-to')?.value || '';
    const invalidRange = Boolean(from && to && from > to);
    const records = invalidRange ? [] : matchingSupervisorRecords();

    count.textContent = String(records.length);
    if(!evaluatorId){
      warning.textContent = 'Selecciona un evaluador para calcular los registros.';
    }else if(invalidRange){
      warning.textContent = 'La fecha Desde no puede ser posterior a Hasta.';
    }else if(!records.length){
      warning.textContent = 'No hay registros que coincidan con los filtros.';
    }else{
      warning.textContent = 'Estos registros se eliminarán únicamente de la base consolidada de este dispositivo.';
    }
    warning.classList.toggle('error',invalidRange || (Boolean(evaluatorId) && !records.length));
    button.disabled = !evaluatorId || invalidRange || !records.length;
  }

  function managementPanelHtml(){
    const evaluators = users.filter(user => user.role === 'Evaluador');
    return `<section class="panel supervisor-data-management">
      <div class="panel-head"><div><span>GESTIÓN DE LA BASE CONSOLIDADA</span><h2>Quitar registros importados</h2><p>Utiliza esta opción cuando hayas cargado un archivo equivocado o necesites reemplazar la información de un evaluador.</p></div></div>
      <div class="supervisor-delete-controls">
        <label>Evaluador<select id="supervisor-delete-evaluator"><option value="">Seleccionar</option>${evaluators.map(user=>`<option value="${esc(user.id)}">${esc(user.name)}</option>`).join('')}</select></label>
        <label>Desde <small>(opcional)</small><input id="supervisor-delete-from" type="date"></label>
        <label>Hasta <small>(opcional)</small><input id="supervisor-delete-to" type="date"></label>
        <div class="supervisor-delete-result"><strong id="supervisor-delete-count">0</strong><span>registros encontrados</span><small id="supervisor-delete-warning">Selecciona un evaluador para calcular los registros.</small></div>
        <button type="button" class="danger-soft" id="review-supervisor-delete" disabled>Revisar eliminación</button>
      </div>
      <div class="supervisor-management-note"><b>No se necesita el código semanal del Evaluador.</b><span>La eliminación del Supervisor usa una confirmación separada porque afecta su propia base consolidada, que puede reconstruirse importando nuevamente los archivos originales.</span></div>
    </section>`;
  }

  function explainConsolidation(){
    if(!document.querySelector('.supervisor-flow-guide')){
      const upload = document.querySelector('.supervisor-upload-zone, .upload-panel');
      if(upload){
        upload.insertAdjacentHTML('beforebegin',`<section class="panel supervisor-flow-guide">
          <div><span>1</span><b>Seleccionar archivos</b><p>Carga uno o varios CSV o respaldos JSON recibidos de los evaluadores.</p></div>
          <i>→</i>
          <div><span>2</span><b>Revisar el análisis</b><p>Asigna el evaluador y revisa nuevos, completados, repetidos y observados.</p></div>
          <i>→</i>
          <div><span>3</span><b>Consolidar</b><p>Solo los registros nuevos o completados ingresarán a la base.</p></div>
        </section>`);
      }
    }

    document.querySelectorAll('[data-remove-supervisor-file]').forEach(button => {
      button.textContent = 'Quitar';
      button.setAttribute('aria-label','Quitar este archivo de la revisión');
      button.classList.add('supervisor-remove-file-button');
    });
    const clear = document.querySelector('#clear-supervisor-selection');
    if(clear) clear.textContent = 'Quitar todos los archivos';

    if(!document.querySelector('.supervisor-status-guide')){
      const reviewGrid = document.querySelector('.supervisor-review-grid');
      if(reviewGrid){
        reviewGrid.insertAdjacentHTML('beforebegin',`<section class="panel supervisor-status-guide">
          <div><b>Nuevos</b><span>El ID no existe y se agregará.</span></div>
          <div><b>Completados</b><span>El mismo ID recibe datos que estaban vacíos.</span></div>
          <div><b>Repetidos</b><span>Ya existen y se omiten.</span></div>
          <div><b>Observados</b><span>Tienen errores o conflictos y no ingresan.</span></div>
        </section>`);
      }
    }

    if(!document.querySelector('.supervisor-data-management')){
      const history = document.querySelector('#supervisor-history');
      const historyPanel = history?.closest('.panel');
      if(historyPanel) historyPanel.insertAdjacentHTML('beforebegin',managementPanelHtml());
      else document.querySelector('main.content')?.insertAdjacentHTML('beforeend',managementPanelHtml());
      updateDeletePreview();
    }
  }

  function openDeleteModal(){
    const records = matchingSupervisorRecords();
    if(!records.length) return showToast('No hay registros para eliminar con esos filtros.');
    const evaluatorId = document.querySelector('#supervisor-delete-evaluator').value;
    const evaluator = users.find(user => user.id === evaluatorId);
    const from = document.querySelector('#supervisor-delete-from').value;
    const to = document.querySelector('#supervisor-delete-to').value;

    document.querySelector('.supervisor-delete-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'supervisor-delete-overlay';
    overlay.innerHTML = `<section class="supervisor-delete-modal" role="dialog" aria-modal="true" aria-labelledby="supervisor-delete-title">
      <div class="supervisor-delete-symbol">⚠️</div>
      <span>ELIMINACIÓN DE LA BASE CONSOLIDADA</span>
      <h2 id="supervisor-delete-title">Se quitarán ${records.length} registros</h2>
      <p>Evaluador: <b>${esc(evaluator?.name || evaluatorId)}</b><br>Periodo: <b>${from || 'Sin fecha inicial'} — ${to || 'Sin fecha final'}</b></p>
      <div class="supervisor-delete-warning-box">Esta acción no elimina los archivos originales. Para recuperar los registros, vuelve a importarlos desde Consolidar.</div>
      <label class="cleanup-check"><input type="checkbox" id="supervisor-delete-backup"><span>Confirmo que conservo los archivos originales o un respaldo de la base.</span></label>
      <label>Escribe <b>ELIMINAR</b><input id="supervisor-delete-text" autocomplete="off" placeholder="ELIMINAR"></label>
      <div class="cleanup-modal-actions"><button type="button" class="secondary" id="cancel-supervisor-delete">Cancelar</button><button type="button" class="danger" id="confirm-supervisor-delete" disabled>Eliminar registros</button></div>
    </section>`;
    document.body.appendChild(overlay);

    const checkbox = overlay.querySelector('#supervisor-delete-backup');
    const text = overlay.querySelector('#supervisor-delete-text');
    const confirmButton = overlay.querySelector('#confirm-supervisor-delete');
    const update = () => { confirmButton.disabled = !(checkbox.checked && text.value.trim().toUpperCase() === 'ELIMINAR'); };
    checkbox.addEventListener('change',update);
    text.addEventListener('input',update);
    overlay.querySelector('#cancel-supervisor-delete').addEventListener('click',()=>overlay.remove());
    overlay.addEventListener('click',event=>{ if(event.target===overlay) overlay.remove(); });
    confirmButton.addEventListener('click',async()=>{
      const ids = new Set(records.map(record => record.id));
      state.records = state.records.filter(record => !ids.has(record.id));
      save();
      await window.FenologiaDB?.flush?.();
      try{
        const history = await window.FenologiaDB.getSetting(DELETION_HISTORY_KEY) || [];
        history.push({id:`DEL-${Date.now()}`,deletedAt:new Date().toISOString(),supervisorId:state.session.id,supervisor:state.session.name,evaluatorId,evaluator:evaluator?.name || evaluatorId,from:from||null,to:to||null,recordCount:records.length});
        await window.FenologiaDB.setSetting(DELETION_HISTORY_KEY,history);
      }catch(error){ console.warn('No se pudo guardar el historial de eliminación',error); }
      overlay.remove();
      render();
      showToast(`${records.length} registro(s) eliminados de la base consolidada.`);
    });
    text.focus();
  }

  const previousSidebar = sidebar;
  sidebar = function simplifiedSupervisorSidebar(){
    let html = previousSidebar().replace(/Versión\s+[0-9.]+/,'Versión 0.7.1');
    if(!isSupervisorRole()) return html;
    html = html.replace(/<button data-view="evaluate"[\s\S]*?<\/button>/,'');
    html = html.replace(/<button data-view="records"[\s\S]*?<\/button>/,'');
    html = html.replace(/<small>[^<]*<\/small><\/div><\/aside>$/, '<small>Base supervisora local</small></div></aside>');
    return html;
  };

  const previousHomeView = homeView;
  homeView = function roleAwareHomeView(){
    if(isSupervisorRole()) return supervisorHomeView();
    return previousHomeView();
  };

  const previousExportView = exportView;
  exportView = function roleAwareExportView(){
    previousExportView();
    if(isSupervisorRole()) cleanSupervisorExportView();
  };

  const previousRender = render;
  render = function roleAwareSupervisorRender(){
    if(isSupervisorRole() && ['evaluate','records','record-detail'].includes(state.view)) state.view = 'home';
    const result = previousRender();
    if(isSupervisorRole() && state.view === 'export') cleanSupervisorExportView();
    if(isSupervisorRole() && state.view === 'consolidate') explainConsolidation();
    return result;
  };

  document.addEventListener('change',event=>{
    if(!isSupervisorRole()) return;
    if(['supervisor-delete-evaluator','supervisor-delete-from','supervisor-delete-to'].includes(event.target.id)) updateDeletePreview();
  });

  document.addEventListener('click',event=>{
    if(!isSupervisorRole()) return;
    if(event.target.closest('#review-supervisor-delete')){ openDeleteModal(); return; }
  });

  if(typeof state !== 'undefined' && state.catalog) render();
})();
