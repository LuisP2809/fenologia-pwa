(() => {
  const VERSION='0.13.4';
  const evaluatorRole=()=>state?.session?.role==='Evaluador';

  function normalizeSidebar(html){
    if(!evaluatorRole()) return html;
    const template=document.createElement('template');
    template.innerHTML=html;
    const nav=template.content.querySelector('.sidebar nav');
    if(!nav) return html;

    nav.querySelectorAll('[data-view="charts"],[data-view="consolidate"]').forEach(button=>button.remove());

    let mapButton=nav.querySelector('[data-view="map"]');
    if(!mapButton){
      mapButton=document.createElement('button');
      mapButton.dataset.view='map';
      mapButton.innerHTML=`<span>${icons.map}</span>Mapa de avance`;
      const exportButton=nav.querySelector('[data-view="export"]');
      if(exportButton) exportButton.insertAdjacentElement('afterend',mapButton);
      else nav.appendChild(mapButton);
    }
    mapButton.classList.toggle('active',state.view==='map');
    return template.innerHTML;
  }

  function cleanRenderedNavigation(){
    if(!evaluatorRole()) return;
    document.querySelectorAll('.sidebar [data-view="charts"],.sidebar [data-view="consolidate"]').forEach(button=>button.remove());
  }

  function openEvaluatorMap(){
    state.view='map';
    try{
      if(typeof mapView==='function'){
        mapView();
        cleanRenderedNavigation();
        return;
      }
    }catch(error){
      console.error('No se pudo abrir el mapa del Evaluador directamente:',error);
    }
    render();
  }

  const previousSidebar=sidebar;
  sidebar=function evaluatorNavigationSidebar(){
    return normalizeSidebar(previousSidebar());
  };

  const previousRender=render;
  render=function evaluatorNavigationRender(){
    if(evaluatorRole()&&state.view==='charts') state.view='map';
    const result=previousRender();
    cleanRenderedNavigation();
    return result;
  };

  document.addEventListener('click',event=>{
    if(!evaluatorRole()) return;
    const target=event.target.closest('[data-view]');
    if(!target) return;

    if(target.dataset.view==='map'){
      event.preventDefault();
      event.stopImmediatePropagation();
      openEvaluatorMap();
      return;
    }

    if(target.dataset.view==='charts'){
      event.preventDefault();
      event.stopImmediatePropagation();
      openEvaluatorMap();
    }
  },true);

  window.FenologiaEvaluatorNavigation={version:VERSION,openMap:openEvaluatorMap};
  if(typeof state!=='undefined'&&state.catalog&&state.session) render();
})();