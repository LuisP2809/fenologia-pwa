(() => {
  const VERSION='0.13.6';
  const isAdminUserPin=input=>input?.matches?.('#admin-user-form input[name="pin"]');

  function configureDniInput(root=document){
    const input=root.querySelector?.('#admin-user-form input[name="pin"]');
    if(!input) return;

    input.setAttribute('inputmode','numeric');
    input.setAttribute('maxlength','8');
    input.setAttribute('pattern','[0-9]{8}');
    input.setAttribute('autocomplete','off');
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

  const observer=new MutationObserver(mutations=>{
    if(mutations.some(mutation=>mutation.addedNodes.length)) configureDniInput();
  });
  observer.observe(document.querySelector('#app')||document.body,{childList:true,subtree:true});

  configureDniInput();
  window.FenologiaAdminDniFix={version:VERSION};
})();