(() => {
  const FORBIDDEN_ADMIN_VIEWS = new Set(['evaluate','records','record-detail','export','admin-package']);

  function isAdministrator(){
    return state?.session?.role === 'Administrador';
  }

  function removeAdminActions(root=document){
    if(!isAdministrator()) return;
    root.querySelectorAll('[data-view="evaluate"],[data-view="records"],[data-view="export"],[data-view="admin-package"]').forEach(element=>element.remove());
    root.querySelectorAll('#edit-record,#export-csv,#export-bio,#backup,#import-backup,#clear-records').forEach(element=>element.remove());
  }

  const previousSidebar = sidebar;
  sidebar = function administratorSidebar(){
    const html = previousSidebar();
    if(!isAdministrator()) return html;

    const template = document.createElement('template');
    template.innerHTML = html;
    removeAdminActions(template.content);
    return template.innerHTML;
  };

  const previousHomeView = homeView;
  homeView = function administratorHomeView(){
    previousHomeView();
    if(!isAdministrator()) return;

    removeAdminActions(document);

    const pageTitle = document.querySelector('.page-title');
    const description = pageTitle?.querySelector('p');
    if(description){
      description.textContent = 'Administra usuarios, catálogos, campañas, mapas y seguridad de limpieza.';
    }
  };

  const previousRender = render;
  render = function administratorRouteGuard(){
    if(isAdministrator() && FORBIDDEN_ADMIN_VIEWS.has(state.view)){
      state.view = 'home';
    }
    const result = previousRender();
    if(isAdministrator()) removeAdminActions(document);
    return result;
  };

  document.addEventListener('click',event=>{
    if(!isAdministrator()) return;
    const target = event.target.closest('[data-view]');
    if(!target || !FORBIDDEN_ADMIN_VIEWS.has(target.dataset.view)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.view = 'home';
    render();
  },true);

  if(typeof state !== 'undefined' && state.catalog && state.session){
    render();
  }
})();
