(() => {
  const VERSION='0.13.1';
  let backup=null;
  let guarding=false;

  const previousRender=render;
  render=function analysisSourceGuardRender(){
    const supervisor=typeof isSupervisor==='function'&&isSupervisor();
    const fileAnalysis=window.FenologiaFileAnalysis?.analysis;
    const onCharts=state.view==='charts'&&supervisor;

    if(onCharts&&!fileAnalysis?.loaded){
      if(!guarding){
        backup=Array.isArray(state.records)?state.records:[];
        guarding=true;
      }
      state.records=[];
    }else if(guarding&&!fileAnalysis?.loaded){
      state.records=backup||[];
      backup=null;
      guarding=false;
    }else if(fileAnalysis?.loaded){
      backup=null;
      guarding=false;
    }

    return previousRender();
  };

  window.FenologiaAnalysisSourceGuard={version:VERSION};
})();
