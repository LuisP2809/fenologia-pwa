(() => {
  const VERSION='0.13.3';
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
    const charts=event.target.closest('[data-view="charts"]');
    if(!charts) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.view='map';
    render();
  },true);

  window.FenologiaEvaluatorNavigation={version:VERSION};
  if(typeof state!=='undefined'&&state.catalog&&state.session) render();
})();
