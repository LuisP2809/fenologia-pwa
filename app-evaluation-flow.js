(() => {
  const VERSION='0.13.11';

  function makeQuadrantOptional(){
    const form=document.querySelector('#evaluation-form');
    const quadrant=form?.querySelector('[name="quadrant"]');
    if(!quadrant) return;
    quadrant.required=false;
    quadrant.removeAttribute('required');
    quadrant.setAttribute('aria-required','false');
    if(quadrant.options?.[0]&&quadrant.options[0].value==='') quadrant.options[0].textContent='Seleccionar (opcional)';
    const label=quadrant.closest('label');
    if(label&&!label.dataset.optionalQuadrant){
      label.dataset.optionalQuadrant='1';
      const text=[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);
      if(text&&text.textContent.trim()==='Cuadrante') text.textContent='Cuadrante (opcional)';
    }
  }

  function clearEvaluationVariables(form){
    const panels=form.querySelectorAll('.form-panel');
    const variablesPanel=panels[1];
    if(!variablesPanel) return;
    variablesPanel.querySelectorAll('input,select,textarea').forEach(control=>{
      if(control.matches('input[type="checkbox"],input[type="radio"]')){
        control.checked=false;
      }else if(control.tagName==='SELECT'){
        control.selectedIndex=0;
      }else{
        control.value='';
      }
      control.dispatchEvent(new Event('input',{bubbles:true}));
      control.dispatchEvent(new Event('change',{bubbles:true}));
    });
  }

  function clearNextEvaluationSelectors(form){
    const variety=form.querySelector('[name="variety"]');
    const quadrant=form.querySelector('[name="quadrant"]');
    if(variety) variety.value='';
    if(quadrant) quadrant.value='';
  }

  const previousEvaluateView=evaluateView;
  evaluateView=function evaluationFlowView(){
    previousEvaluateView();
    makeQuadrantOptional();
  };

  const previousSaveEvaluation=saveEvaluation;
  saveEvaluation=function evaluationFlowSave(form){
    if(state.editingId){
      previousSaveEvaluation(form);
      return;
    }

    const data=normalizeIntegerFields(Object.fromEntries(new FormData(form)));
    const plant=1+state.records.filter(record=>
      record.date===data.date&&
      record.evaluatorId===state.session.id&&
      record.lot===data.lot&&
      record.variety===data.variety&&
      record.quadrant===(data.quadrant||'')
    ).length;

    const record={
      ...data,
      quadrant:data.quadrant||'',
      id:`EV-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      plant,
      evaluatorId:state.session.id,
      evaluator:state.session.name,
      createdAt:new Date().toISOString()
    };

    state.records.push(record);
    state.selectedRecordId=record.id;
    save();

    clearEvaluationVariables(form);
    clearNextEvaluationSelectors(form);
    makeQuadrantOptional();
    updatePlant(form);

    showToast(`Evaluación guardada · Planta ${plant}`);
    let notice=form.querySelector('.continuous-save-notice');
    if(!notice){
      notice=document.createElement('div');
      notice.className='continuous-save-notice';
      form.prepend(notice);
    }
    notice.innerHTML='<b>✓ Evaluación guardada correctamente</b><span>Se conservaron fecha, campaña, campo, fundo, módulo y Turno-Lote. Selecciona la siguiente variedad y, si corresponde, el cuadrante.</span>';
    form.querySelector('[name="variety"]')?.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'smooth'});
  };

  window.FenologiaEvaluationFlow={version:VERSION,makeQuadrantOptional,clearEvaluationVariables};
})();