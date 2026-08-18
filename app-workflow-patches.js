(() => {
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
            <li>Solicita al Administrador el código semanal de autorización.</li>
          </ul>
        </div>
      </section>`);

    const button = document.querySelector('#clear-records');
    if(button) button.textContent = 'Revisar y limpiar datos';
  };

  const originalSaveEvaluation = saveEvaluation;
  saveEvaluation = async function continuousSaveEvaluation(form){
    if(state.editingId) return originalSaveEvaluation(form);

    const data = normalizeIntegerFields(Object.fromEntries(new FormData(form)));
    const matching = state.records.filter(record =>
      record.date === data.date && record.evaluatorId === state.session.id && record.lot === data.lot &&
      record.variety === data.variety && record.quadrant === data.quadrant
    );
    const plant = 1+matching.reduce((highest,record)=>Math.max(highest,Number(record.plant)||0),0);

    const record = {...data,id:`EV-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,plant,evaluatorId:state.session.id,evaluator:state.session.name,createdAt:new Date().toISOString()};
    state.records.push(record);state.selectedRecordId=record.id;await save();
    form.querySelectorAll('input[type="number"]').forEach(input=>{input.value='';});updatePlant(form);
    const nextPlant=plant+1;showToast(`Evaluación guardada · Planta ${plant}. Continúa con Planta ${nextPlant}.`);
    let notice=form.querySelector('.continuous-save-notice');
    if(!notice){notice=document.createElement('div');notice.className='continuous-save-notice';form.prepend(notice);}
    notice.innerHTML=`<b>✓ Planta ${plant} guardada correctamente</b><span>Los datos de ubicación se conservaron. Ya puedes registrar la Planta ${nextPlant}.</span>`;
    form.querySelector('input[type="number"]')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'smooth'});
  };

  function closeCleanupModal(){document.querySelector('.cleanup-modal-overlay')?.remove();}

  function openCleanupModal(){
    const validation=typeof canClearRecords==='function'?canClearRecords():{ok:true};
    if(!validation.ok){showToast(validation.message);return;}
    closeCleanupModal();
    const requiresCode=state.session.role==='Evaluador';
    const linked=Boolean(window.cleanupSecurity?.getDeviceProfile());
    const overlay=document.createElement('div');overlay.className='cleanup-modal-overlay';
    overlay.innerHTML=`<section class="cleanup-modal" role="dialog" aria-modal="true" aria-labelledby="cleanup-title">
      <div class="cleanup-modal-symbol">⚠️</div><span>CONFIRMACIÓN DE LIMPIEZA</span><h2 id="cleanup-title">Antes de eliminar los datos</h2>
      <p>Se eliminarán <b>${state.records.length} registros</b> de la vista activa. La copia interna verificada seguirá disponible desde “Exportar e importar”.</p>
      <div class="cleanup-weekly-note"><b>Recomendación:</b> realiza esta limpieza semanalmente, después de respaldar la información.</div>
      <label class="cleanup-check"><input type="checkbox" id="confirm-supervisor"><span>Ya comuniqué a mi supervisor que realizaré la limpieza de datos.</span></label>
      <label class="cleanup-check"><input type="checkbox" id="confirm-backup"><span>Confirmo que creé un respaldo verificado y que no registré evaluaciones nuevas después.</span></label>
      ${requiresCode?`<section class="cleanup-code-stage" id="cleanup-code-stage" hidden>
        <span>AUTORIZACIÓN DEL ADMINISTRADOR</span><h3>Ingrese el código semanal</h3>
        <p>${linked?'Solicita al Administrador el código vigente de 6 dígitos. Funciona sin internet.':'Este celular no está vinculado. Importa primero el perfil entregado por el Administrador desde “Exportar e importar”.'}</p>
        <div class="cleanup-code-entry"><input id="cleanup-weekly-code" maxlength="6" inputmode="numeric" pattern="[0-9]*" placeholder="000000" ${linked?'':'disabled'}><button type="button" class="primary" id="verify-cleanup-code" ${linked?'':'disabled'}>Validar código</button></div>
        <div class="cleanup-code-status" id="cleanup-code-status"></div>
      </section>`:`<section class="cleanup-code-stage admin-approved"><span>AUTORIZACIÓN</span><h3>Administrador autenticado</h3><p>El rol Administrador no requiere un código adicional para limpiar sus propios datos locales.</p></section>`}
      <div class="cleanup-modal-actions"><button type="button" class="secondary" id="cancel-cleanup">Cancelar</button><button type="button" class="danger" id="confirm-cleanup" disabled>Eliminar datos respaldados</button></div>
    </section>`;
    document.body.appendChild(overlay);

    const supervisor=overlay.querySelector('#confirm-supervisor');const backup=overlay.querySelector('#confirm-backup');
    const confirmButton=overlay.querySelector('#confirm-cleanup');const codeStage=overlay.querySelector('#cleanup-code-stage');
    let authorization={ok:!requiresCode,week:window.cleanupSecurity?.isoWeekInfo().key,method:requiresCode?'weekly-code':'admin-role'};
    const resetAuthorization=()=>{if(requiresCode){authorization={ok:false,week:null,method:'weekly-code'};confirmButton.disabled=true;const status=overlay.querySelector('#cleanup-code-status');if(status){status.textContent='';status.className='cleanup-code-status';}}};
    const updateSteps=()=>{
      const confirmationsReady=supervisor.checked&&backup.checked;
      if(codeStage)codeStage.hidden=!confirmationsReady;
      if(!confirmationsReady)resetAuthorization();
      confirmButton.disabled=!(confirmationsReady&&authorization.ok);
    };
    supervisor.addEventListener('change',updateSteps);backup.addEventListener('change',updateSteps);
    overlay.querySelector('#cancel-cleanup').addEventListener('click',closeCleanupModal);
    overlay.addEventListener('click',event=>{if(event.target===overlay)closeCleanupModal();});
    const codeInput=overlay.querySelector('#cleanup-weekly-code');
    codeInput?.addEventListener('input',()=>{codeInput.value=codeInput.value.replace(/\D/g,'').slice(0,6);resetAuthorization();});
    overlay.querySelector('#verify-cleanup-code')?.addEventListener('click',async()=>{
      const status=overlay.querySelector('#cleanup-code-status');
      if(codeInput.value.length!==6){status.textContent='Ingresa los 6 dígitos.';status.className='cleanup-code-status error';return;}
      status.textContent='Validando…';status.className='cleanup-code-status';
      const result=await window.cleanupSecurity.verifyWeeklyCode(codeInput.value);
      authorization={ok:result.ok,week:result.week?.key||null,method:'weekly-code'};
      status.textContent=result.message;status.className=`cleanup-code-status ${result.ok?'success':'error'}`;
      confirmButton.disabled=!(supervisor.checked&&backup.checked&&authorization.ok);
    });
    confirmButton.addEventListener('click',async()=>{
      if(!(supervisor.checked&&backup.checked&&authorization.ok))return;
      const recordCount=state.records.length;const lastBackup=localStorage.getItem('fenologia-last-backup');
      const previousRecords=state.records;const previousSelection=state.selectedRecordId;
      confirmButton.disabled=true;confirmButton.textContent='Eliminando…';
      try{
        state.records=[];state.selectedRecordId=null;await save();
        window.cleanupSecurity?.recordCleanup({recordCount,lastBackup,authorizationWeek:authorization.week,method:authorization.method});
        closeCleanupModal();render();showToast('Datos locales respaldados y eliminados correctamente.');
      }catch(error){
        state.records=previousRecords;state.selectedRecordId=previousSelection;
        confirmButton.disabled=false;confirmButton.textContent='Eliminar datos respaldados';
        showToast(error.message||'No se pudo completar la limpieza. Los datos se conservaron.');
      }
    });
    updateSteps();
  }

  document.addEventListener('click',event=>{
    if(!event.target.closest('#clear-records'))return;
    event.preventDefault();event.stopImmediatePropagation();openCleanupModal();
  },true);
})();
