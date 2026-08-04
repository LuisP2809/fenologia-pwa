(() => {
  const originalSidebar = sidebar;
  sidebar = function patchedSidebar(){
    return originalSidebar().replace('Versión 0.4','Versión 0.4.2');
  };

  const originalExportView = exportView;
  exportView = function patchedExportView(){
    originalExportView();
    const dangerZone = document.querySelector('.danger-zone');
    if(!dangerZone || document.querySelector('.cleanup-guidance')) return;

    dangerZone.insertAdjacentHTML('beforebegin', `
      <section class="panel cleanup-guidance">
        <div class="cleanup-guidance-icon">🗓️</div>
        <div>
          <span>RECOMENDACIÓN OPERATIVA</span>
          <h2>Limpieza semanal de datos</h2>
          <p>Se recomienda limpiar los datos locales una vez por semana, después de completar el respaldo correspondiente.</p>
          <ul>
            <li>Primero exporta los archivos o crea un respaldo actualizado.</li>
            <li>Comunica a tu supervisor que realizarás la limpieza de datos.</li>
            <li>Verifica que no existan evaluaciones nuevas posteriores al respaldo.</li>
          </ul>
        </div>
      </section>`);

    const button = document.querySelector('#clear-records');
    if(button) button.textContent = 'Revisar y limpiar datos';
  };

  const originalSaveEvaluation = saveEvaluation;
  saveEvaluation = function continuousSaveEvaluation(form){
    if(state.editingId){
      originalSaveEvaluation(form);
      return;
    }

    const data = normalizeIntegerFields(Object.fromEntries(new FormData(form)));
    const plant = 1 + state.records.filter(record =>
      record.date === data.date &&
      record.evaluatorId === state.session.id &&
      record.lot === data.lot &&
      record.variety === data.variety &&
      record.quadrant === data.quadrant
    ).length;

    const record = {
      ...data,
      id:`EV-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      plant,
      evaluatorId:state.session.id,
      evaluator:state.session.name,
      createdAt:new Date().toISOString()
    };

    state.records.push(record);
    state.selectedRecordId = record.id;
    save();

    // Se conservan los datos generales para continuar evaluando el mismo punto.
    form.querySelectorAll('input[type="number"]').forEach(input => { input.value = ''; });
    updatePlant(form);

    const nextPlant = plant + 1;
    showToast(`Evaluación guardada · Planta ${plant}. Continúa con Planta ${nextPlant}.`);

    let notice = form.querySelector('.continuous-save-notice');
    if(!notice){
      notice = document.createElement('div');
      notice.className = 'continuous-save-notice';
      form.prepend(notice);
    }
    notice.innerHTML = `<b>✓ Planta ${plant} guardada correctamente</b><span>Los datos de ubicación se conservaron. Ya puedes registrar la Planta ${nextPlant}.</span>`;

    form.querySelector('input[type="number"]')?.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'smooth'});
  };

  function closeCleanupModal(){
    document.querySelector('.cleanup-modal-overlay')?.remove();
  }

  function openCleanupModal(){
    const validation = typeof canClearRecords === 'function' ? canClearRecords() : {ok:true};
    if(!validation.ok){
      showToast(validation.message);
      return;
    }

    closeCleanupModal();
    const overlay = document.createElement('div');
    overlay.className = 'cleanup-modal-overlay';
    overlay.innerHTML = `
      <section class="cleanup-modal" role="dialog" aria-modal="true" aria-labelledby="cleanup-title">
        <div class="cleanup-modal-symbol">⚠️</div>
        <span>CONFIRMACIÓN DE LIMPIEZA</span>
        <h2 id="cleanup-title">Antes de eliminar los datos</h2>
        <p>Se eliminarán <b>${state.records.length} registros</b> de este dispositivo. Esta acción no se puede deshacer desde la aplicación.</p>
        <div class="cleanup-weekly-note"><b>Recomendación:</b> realiza esta limpieza semanalmente, después de respaldar la información.</div>
        <label class="cleanup-check"><input type="checkbox" id="confirm-supervisor"><span>Ya comuniqué a mi supervisor que realizaré la limpieza de datos.</span></label>
        <label class="cleanup-check"><input type="checkbox" id="confirm-backup"><span>Confirmo que descargué un respaldo actualizado y que no registré evaluaciones nuevas después.</span></label>
        <div class="cleanup-modal-actions">
          <button type="button" class="secondary" id="cancel-cleanup">Cancelar</button>
          <button type="button" class="danger" id="confirm-cleanup" disabled>Eliminar datos respaldados</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    const supervisor = overlay.querySelector('#confirm-supervisor');
    const backup = overlay.querySelector('#confirm-backup');
    const confirmButton = overlay.querySelector('#confirm-cleanup');
    const updateButton = () => { confirmButton.disabled = !(supervisor.checked && backup.checked); };
    supervisor.addEventListener('change', updateButton);
    backup.addEventListener('change', updateButton);
    overlay.querySelector('#cancel-cleanup').addEventListener('click', closeCleanupModal);
    overlay.addEventListener('click', event => { if(event.target === overlay) closeCleanupModal(); });
    confirmButton.addEventListener('click', () => {
      state.records = [];
      state.selectedRecordId = null;
      save();
      closeCleanupModal();
      render();
      showToast('Datos locales respaldados y eliminados correctamente.');
    });
  }

  document.addEventListener('click', event => {
    if(!event.target.closest('#clear-records')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openCleanupModal();
  }, true);
})();
