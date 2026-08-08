(() => {
  const VERSION='0.13.0';

  function enforceXlsxUi(){
    if(state.view!=='consolidate')return;
    const description=document.querySelector('.supervisor-upload div:nth-child(2) p');
    if(description){
      description.dataset.dynamicNote='1';
      description.textContent='Admite libros .xlsx generados por Fenología o preparados en una PC. Reconoce las columnas por nombre y controla duplicados por ID DATA.';
    }
    document.querySelector('#export-consolidated-dynamic')?.setAttribute('hidden','');
  }

  const observer=new MutationObserver(()=>enforceXlsxUi());
  observer.observe(app,{childList:true,subtree:true});

  document.addEventListener('dragover',event=>{
    if(!event.target.closest('#supervisor-drop-zone'))return;
    event.preventDefault();
  },true);

  document.addEventListener('drop',event=>{
    if(!event.target.closest('#supervisor-drop-zone'))return;
    const file=[...(event.dataTransfer?.files||[])].find(item=>/\.xlsx$/i.test(item.name));
    if(!file)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input=document.querySelector('#supervisor-xlsx-file');
    if(!input)return;
    try{
      const transfer=new DataTransfer();
      transfer.items.add(file);
      input.files=transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }catch{
      showToast('Usa “Seleccionar Excel” para cargar este archivo.');
    }
  },true);

  window.FenologiaXLSXCompat={version:VERSION};
  enforceXlsxUi();
})();
