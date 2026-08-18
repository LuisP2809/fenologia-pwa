(() => {
  const previousChartsView=chartsView;
  chartsView=function stageAnalyticsUiView(){
    const result=previousChartsView();
    if(state.view==='charts'&&isSupervisor()&&!window.FenologiaStageAnalytics?.state?.active){
      const selected=document.querySelector('#chart-tab-select')?.value;
      if(selected){
        document.querySelector(`[data-chart-tab="${selected}"]`)?.classList.add('active');
      }
    }
    return result;
  };
  if(typeof state!=='undefined'&&state.catalog&&state.view==='charts') chartsView();
})();
