(() => {
  const VERSION='0.13.7';
  const isAdminUserPin=input=>input?.matches?.('#admin-user-form input[name="pin"]');

  function configureUserForm(root=document){
    const form=root.querySelector?.('#admin-user-form');
    if(!form) return;
    const input=form.querySelector('input[name="pin"]');
    if(input){
      input.setAttribute('type','text');
      input.setAttribute('inputmode','numeric');
      input.setAttribute('maxlength','8');
      input.setAttribute('pattern','[0-9]{8}');
      input.setAttribute('autocomplete','off');
      input.setAttribute('enterkeyhint','done');
      input.setAttribute('title','Ingresa exactamente 8 dígitos numéricos.');
      input.setAttribute('aria-label','DNI de 8 dígitos');

      const label=input.closest('label');
      if(label && !label.dataset.dniLabelFixed){
        label.dataset.dniLabelFixed='1';
        for(const node of [...label.childNodes]){
          if(node.nodeType===Node.TEXT_NODE && node.textContent.includes('DNI / PIN')){
            node.textContent=node.textContent.replace('DNI / PIN','DNI');
            break;
          }
        }
      }
    }

    const submit=form.querySelector('.admin-modal-actions button.primary');
    if(submit){
      submit.type='button';
      submit.id='admin-user-submit';
    }
  }

  function validateUserForm(form){
    const name=form.querySelector('[name="name"]');
    const pin=form.querySelector('[name="pin"]');
    const id=form.querySelector('[name="id"]')?.value.trim()||'';
    const editing=Boolean(id);
    const cleanName=name?.value.trim()||'';
    const cleanPin=(pin?.value||'').replace(/\D/g,'').slice(0,8);
    if(pin && pin.value!==cleanPin) pin.value=cleanPin;

    if(!cleanName){
      showToast('Ingresa el nombre completo.');
      name?.focus();
      return false;
    }
    if((!editing && !/^\d{8}$/.test(cleanPin)) || (editing && cleanPin && !/^\d{8}$/.test(cleanPin))){
      showToast('El DNI debe contener exactamente 8 dígitos numéricos.');
      pin?.focus();
      return false;
    }
    if(pin) pin.setCustomValidity('');
    return true;
  }

  function submitUserForm(button){
    const form=button?.form||button?.closest?.('#admin-user-form');
    if(!form || form.dataset.manualSubmitting==='1') return;
    if(!validateUserForm(form)) return;

    form.dataset.manualSubmitting='1';
    const originalText=button.textContent;
    button.disabled=true;
    button.textContent=(form.querySelector('[name="id"]')?.value.trim())?'Guardando…':'Creando…';

    const submitEvent=typeof SubmitEvent==='function'
      ? new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button})
      : new Event('submit',{bubbles:true,cancelable:true});
    form.dispatchEvent(submitEvent);

    setTimeout(()=>{
      if(document.contains(form)){
        delete form.dataset.manualSubmitting;
        button.disabled=false;
        button.textContent=originalText;
      }
    },2500);
  }

  document.addEventListener('input',event=>{
    if(!isAdminUserPin(event.target)) return;
    const cleaned=event.target.value.replace(/\D/g,'').slice(0,8);
    if(event.target.value!==cleaned) event.target.value=cleaned;
    event.target.setCustomValidity('');
  },true);

  document.addEventListener('invalid',event=>{
    if(!isAdminUserPin(event.target)) return;
    const value=event.target.value;
    event.target.setCustomValidity(value.length
      ? 'El DNI debe contener exactamente 8 dígitos numéricos.'
      : 'Ingresa el DNI de 8 dígitos.');
  },true);

  document.addEventListener('change',event=>{
    if(isAdminUserPin(event.target)) event.target.setCustomValidity('');
  },true);

  document.addEventListener('keydown',event=>{
    if(!event.target.closest?.('#admin-user-form')) return;
    if(event.key!=='Enter') return;
    if(event.target.matches('textarea,select,button')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    submitUserForm(document.querySelector('#admin-user-submit'));
  },true);

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#admin-user-submit');
    if(!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    submitUserForm(button);
  },true);

  const observer=new MutationObserver(mutations=>{
    if(mutations.some(mutation=>mutation.addedNodes.length)) configureUserForm();
  });
  observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});

  configureUserForm();
  window.FenologiaAdminDniFix={version:VERSION};
})();