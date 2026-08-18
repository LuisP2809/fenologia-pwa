(() => {
  const VERSION='0.13.1';
  const previousRender=render;
  render=function analysisSourceGuardRender(){
    return previousRender();
  };

  window.FenologiaAnalysisSourceGuard={version:VERSION};
})();
