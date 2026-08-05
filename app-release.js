(() => {
  const RELEASE_VERSION = '0.12.2';
  const previousSidebar = sidebar;
  sidebar = function releaseSidebar(){
    return previousSidebar().replace(/Versión\s+[0-9.]+/g,`Versión ${RELEASE_VERSION}`);
  };
  window.FENOLOGIA_VERSION = RELEASE_VERSION;
  if(typeof state !== 'undefined' && state.catalog) render();
})();
