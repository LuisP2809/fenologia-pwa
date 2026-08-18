(() => {
  const VERSION='0.13.5';
  const CONSOLIDATE_DESCRIPTION='Une únicamente los archivos Excel que selecciones. No guarda historial ni modifica los datos usados por los gráficos.';

  function enforceXlsxUi(){
    if(state.view!=='consolidate')return;
    const description=document.querySelector('.supervisor-upload div:nth-child(2) p');
    if(description){
      if(description.dataset.dynamicNote!=='1') description.dataset.dynamicNote='1';
      if(description.textContent!==CONSOLIDATE_DESCRIPTION) description.textContent=CONSOLIDATE_DESCRIPTION;
    }
    const dynamicExport=document.querySelector('#export-consolidated-dynamic');
    if(dynamicExport&&!dynamicExport.hasAttribute('hidden')) dynamicExport.setAttribute('hidden','');
  }

  let scheduled=false;
  const observer=new MutationObserver(()=>{
    if(scheduled||state.view!=='consolidate')return;
    scheduled=true;
    queueMicrotask(()=>{
      scheduled=false;
      enforceXlsxUi();
    });
  });
  observer.observe(app,{childList:true,subtree:true});

  document.addEventListener('dragover',event=>{
    if(!event.target.closest('#supervisor-drop-zone'))return;
    event.preventDefault();
  },true);

  document.addEventListener('drop',event=>{
    if(!event.target.closest('#supervisor-drop-zone'))return;
    const files=[...(event.dataTransfer?.files||[])].filter(item=>/\.xlsx$/i.test(item.name));
    if(!files.length)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input=document.querySelector('#consolidation-xlsx-files')||document.querySelector('#supervisor-xlsx-file');
    if(!input)return;
    try{
      const transfer=new DataTransfer();
      files.forEach(file=>transfer.items.add(file));
      input.files=transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }catch{
      showToast('Usa “Seleccionar Excel” para cargar los archivos.');
    }
  },true);

  window.FenologiaXLSXCompat={version:VERSION};
  enforceXlsxUi();
})();
