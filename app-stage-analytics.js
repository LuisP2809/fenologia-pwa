(() => {
  const VERSION = '0.12.2';
  const CUSTOM_TABS = [
    ['stage-weekly-diff','Diferencia semanal'],
    ['stage-weekly-distribution','Distribución acumulada']
  ];
  const STAGES = Array.from({length:17},(_,index)=>`E${String(index+1).padStart(2,'0')}`);
  const THRESHOLDS = STAGES.slice(3);
  const GROUPS = [
    {id:'induction',label:'1. Inducción (E01–E04)',short:'Inducción',indexes:[0,1,2,3]},
    {id:'differentiation',label:'2. Diferenciación (E05–E06)',short:'Diferenciación',indexes:[4,5]},
    {id:'cauliflower',label:'3. Coliflor (E07–E08)',short:'Coliflor',indexes:[6,7]},
    {id:'closed-flower',label:'4. Flor cerrada (E09–E10)',short:'Flor cerrada',indexes:[8,9]},
    {id:'open-flower',label:'5. Flor abierta (E11)',short:'Flor abierta',indexes:[10]},
    {id:'fruit-set',label:'6. Cuaja (E12)',short:'Cuaja',indexes:[11]},
    {id:'olive',label:'7. Aceituna (E13)',short:'Aceituna',indexes:[12]},
    {id:'fruit-growth',label:'8. Crecimiento de fruto (E14–E17)',short:'Crecimiento de fruto',indexes:[13,14,15,16]}
  ];
  const analyticsState = {
    active:'',
    currentWeek:'',
    previousWeek:'',
    selectedGroup:'induction'
  };

  const blank = value => value === '' || value === null || value === undefined;
  const num = value => {
    if(blank(value)) return null;
    const parsed=Number(String(value).replace(',','.'));
    return Number.isFinite(parsed)?parsed:null;
  };
  const sum = values => values.reduce((total,value)=>total+(num(value)??0),0);
  const fmt = (value,digits=1) => value===null||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString('es-PE',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const pct = value => value===null?'—':`${fmt(value,1)} %`;
  const text = value => esc(value??'');

  function campaignOf(record){
    if(!blank(record.campaign)) return String(record.campaign);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(record.date||'')) return 'Sin campaña';
    const [year,month]=record.date.split('-').map(Number);
    return month>=10?`${year}-${year+1}`:`${year-1}-${year}`;
  }

  function weekInfo(dateText){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateText||'')) return null;
    const date=new Date(`${dateText}T12:00:00Z`);
    const day=date.getUTCDay()||7;
    const monday=new Date(date);
    monday.setUTCDate(date.getUTCDate()-day+1);
    const thursday=new Date(date);
    thursday.setUTCDate(date.getUTCDate()+4-day);
    const yearStart=new Date(Date.UTC(thursday.getUTCFullYear(),0,1));
    const week=Math.ceil((((thursday-yearStart)/86400000)+1)/7);
    return {
      key:monday.toISOString().slice(0,10),
      week,
      label:`S${String(week).padStart(2,'0')}`,
      long:`Semana ${week}`
    };
  }

  function sharedFilterValues(){
    const value=id=>document.querySelector(id)?.value||'';
    return {
      from:value('#chart-from'),to:value('#chart-to'),campaign:value('#chart-campaign'),
      field:value('#chart-field'),farm:value('#chart-farm'),module:value('#chart-module'),
      lot:value('#chart-lot'),variety:value('#chart-variety'),quadrant:value('#chart-quadrant'),
      evaluator:value('#chart-evaluator')
    };
  }

  function filteredRecords(){
    const filters=sharedFilterValues();
    const source=window.FenologiaFileAnalysis?.getChartRecords?.() ?? state.records;
    return source.filter(record=>{
      if(filters.from&&(!record.date||record.date<filters.from)) return false;
      if(filters.to&&(!record.date||record.date>filters.to)) return false;
      if(filters.campaign&&campaignOf(record)!==filters.campaign) return false;
      if(filters.field&&record.field!==filters.field) return false;
      if(filters.farm&&record.farm!==filters.farm) return false;
      if(filters.module&&record.module!==filters.module) return false;
      if(filters.lot&&record.lot!==filters.lot) return false;
      if(filters.variety&&record.variety!==filters.variety) return false;
      if(filters.quadrant&&record.quadrant!==filters.quadrant) return false;
      if(filters.evaluator&&(record.evaluatorId||record.evaluator||'')!==filters.evaluator) return false;
      return true;
    });
  }

  function groupByWeek(records){
    const map=new Map();
    records.forEach(record=>{
      const info=weekInfo(record.date);
      if(!info) return;
      if(!map.has(info.key)) map.set(info.key,{...info,records:[]});
      map.get(info.key).records.push(record);
    });
    return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
  }

  function stageTotals(records){
    return STAGES.map(stage=>sum(records.map(record=>record[stage])));
  }

  function stageDistribution(records){
    const totals=stageTotals(records);
    const total=sum(totals);
    return {totals,total,percentages:totals.map(value=>total?value/total*100:null)};
  }

  function thresholdPercent(records,startIndex){
    const distribution=stageDistribution(records);
    if(!distribution.total) return null;
    return sum(distribution.totals.slice(startIndex))/distribution.total*100;
  }

  function empty(title,detail){
    return `<div class="chart-empty stage-analysis-empty"><span>📊</span><b>${text(title)}</b><p>${text(detail)}</p></div>`;
  }

  function weekOptions(weeks,current){
    return weeks.map(week=>`<option value="${week.key}" ${week.key===current?'selected':''}>${week.long}</option>`).join('');
  }

  function normalizeWeeks(weeks){
    const keys=weeks.map(week=>week.key);
    if(!keys.includes(analyticsState.currentWeek)) analyticsState.currentWeek=keys.at(-1)||'';
    let currentIndex=keys.indexOf(analyticsState.currentWeek);
    if(currentIndex<1&&keys.length>1){
      analyticsState.currentWeek=keys.at(-1);
      currentIndex=keys.length-1;
    }
    if(!keys.includes(analyticsState.previousWeek)||analyticsState.previousWeek===analyticsState.currentWeek){
      analyticsState.previousWeek=currentIndex>0?keys[currentIndex-1]:'';
    }
  }

  function deltaCell(value,current,previous){
    if(value===null) return '<td class="stage-delta no-data"><span>—</span><small>Sin comparación</small></td>';
    const neutral=Math.abs(value)<0.05;
    const tone=neutral?'neutral':value>0?'positive':'negative';
    const arrow=neutral?'—':value>0?'↑':'↓';
    const sign=!neutral&&value>0?'+':'';
    return `<td class="stage-delta ${tone}" title="Actual: ${pct(current)} · Anterior: ${pct(previous)}"><span>${arrow}</span><b>${sign}${fmt(value,1)} %</b></td>`;
  }

  function weeklyDifference(records){
    const weeks=groupByWeek(records);
    if(weeks.length<2) return empty('Se necesitan por lo menos dos semanas','Registra o importa evaluaciones de dos semanas diferentes para calcular la variación.');
    normalizeWeeks(weeks);
    const current=weeks.find(week=>week.key===analyticsState.currentWeek);
    const previous=weeks.find(week=>week.key===analyticsState.previousWeek);
    if(!current||!previous) return empty('No se pudo formar la comparación','Selecciona dos semanas disponibles y distintas.');

    const moduleNames=[...new Set([...current.records,...previous.records].map(record=>record.module||record.lot).filter(Boolean))]
      .sort((a,b)=>String(a).localeCompare(String(b),'es',{numeric:true}));
    const rows=moduleNames.map(module=>{
      const currentRecords=current.records.filter(record=>(record.module||record.lot)===module);
      const previousRecords=previous.records.filter(record=>(record.module||record.lot)===module);
      const values=THRESHOLDS.map(stage=>{
        const start=STAGES.indexOf(stage);
        const currentPct=thresholdPercent(currentRecords,start);
        const previousPct=thresholdPercent(previousRecords,start);
        return {stage,current:currentPct,previous:previousPct,delta:currentPct===null||previousPct===null?null:currentPct-previousPct};
      });
      return {module,values};
    });
    const comparable=rows.flatMap(row=>row.values.map(item=>({...item,module:row.module}))).filter(item=>item.delta!==null);
    const increase=comparable.length?comparable.reduce((best,item)=>item.delta>best.delta?item:best,comparable[0]):null;
    const decrease=comparable.length?comparable.reduce((best,item)=>item.delta<best.delta?item:best,comparable[0]):null;
    const advanced=rows.filter(row=>row.values.some(item=>item.delta!==null&&item.delta>0.05)).length;

    return `<section class="panel stage-analysis-controls">
      <div><span>COMPARACIÓN SEMANAL</span><h2>${text(current.long)} frente a ${text(previous.long)}</h2><p>Porcentaje acumulado desde cada estadio hasta E17.</p></div>
      <div class="stage-week-selectors">
        <label>Semana actual<select id="stage-current-week">${weekOptions(weeks,analyticsState.currentWeek)}</select></label>
        <label>Semana anterior<select id="stage-previous-week">${weekOptions(weeks,analyticsState.previousWeek)}</select></label>
      </div>
    </section>
    <section class="stage-kpi-grid">
      <article><span>↗</span><div><b>${advanced}</b><small>Módulos con avance</small><em>de ${rows.length}</em></div></article>
      <article><span>↑</span><div><b>${increase&&increase.delta>0?`+${fmt(increase.delta,1)} %`:'—'}</b><small>Mayor incremento</small><em>${increase&&increase.delta>0?`${text(increase.module)} · ${text(increase.stage)}`:'Sin aumento'}</em></div></article>
      <article class="negative"><span>↓</span><div><b>${decrease&&decrease.delta<0?`${fmt(decrease.delta,1)} %`:'—'}</b><small>Mayor descenso</small><em>${decrease&&decrease.delta<0?`${text(decrease.module)} · ${text(decrease.stage)}`:'Sin descenso'}</em></div></article>
    </section>
    <article class="panel stage-analysis-card">
      <div class="chart-card-head"><div><span>MATRIZ DE AVANCE</span><h2>Diferencia de la semana actual y semana anterior</h2></div></div>
      ${rows.length?`<div class="stage-wide-table-wrap"><table class="stage-weekly-table"><thead><tr><th>Módulo</th>${THRESHOLDS.map(stage=>`<th>Dif. ≥ ${stage}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th>${text(row.module)}</th>${row.values.map(item=>deltaCell(item.delta,item.current,item.previous)).join('')}</tr>`).join('')}</tbody></table></div>`:empty('Sin módulos comparables','Las semanas elegidas no tienen módulos con conteos E01–E17.')}
      <div class="stage-delta-legend"><span class="positive">↑ Aumento</span><span class="negative">↓ Disminución</span><span class="neutral">— Sin cambio</span><small>Los valores se expresan en puntos porcentuales.</small></div>
    </article>`;
  }

  function groupPercentages(records){
    const distribution=stageDistribution(records);
    return GROUPS.map(group=>distribution.total?sum(group.indexes.map(index=>distribution.totals[index]))/distribution.total*100:null);
  }

  function stageLineChart(weeks,values,label){
    if(!weeks.length||!values.some(value=>value!==null)) return empty('Sin tendencia disponible','El grupo seleccionado no tiene conteos en las semanas filtradas.');
    const width=900,height=290,pad={left:56,right:20,top:30,bottom:48};
    const plotW=width-pad.left-pad.right,plotH=height-pad.top-pad.bottom;
    const x=index=>weeks.length===1?pad.left+plotW/2:pad.left+(index/(weeks.length-1))*plotW;
    const y=value=>pad.top+plotH-(Math.max(0,Math.min(100,value||0))/100)*plotH;
    const points=values.map((value,index)=>value===null?null:[x(index),y(value),value,index]).filter(Boolean);
    return `<div class="stage-line-wrap"><svg class="stage-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolución de ${text(label)}">
      ${[0,25,50,75,100].map(tick=>`<line x1="${pad.left}" y1="${y(tick)}" x2="${width-pad.right}" y2="${y(tick)}"/><text x="${pad.left-9}" y="${y(tick)+4}" text-anchor="end">${tick}%</text>`).join('')}
      ${weeks.map((week,index)=>`<text x="${x(index)}" y="${height-17}" text-anchor="middle">${week.week}</text>`).join('')}
      ${points.length>1?`<polyline points="${points.map(point=>`${point[0]},${point[1]}`).join(' ')}"/>`:''}
      ${points.map(point=>`<circle cx="${point[0]}" cy="${point[1]}" r="4"><title>${text(weeks[point[3]].long)}: ${pct(point[2])}</title></circle><text class="value-label" x="${point[0]}" y="${point[1]-10}" text-anchor="middle">${fmt(point[2],0)}%</text>`).join('')}
    </svg></div>`;
  }

  function weeklyDistribution(records){
    const weeks=groupByWeek(records);
    if(!weeks.length) return empty('Sin semanas con estadios','Los registros filtrados no contienen fecha y conteos E01–E17.');
    const matrix=weeks.map(week=>groupPercentages(week.records));
    const selectedIndex=Math.max(0,GROUPS.findIndex(group=>group.id===analyticsState.selectedGroup));
    if(selectedIndex<0) analyticsState.selectedGroup=GROUPS[0].id;
    const currentValues=matrix.at(-1)||[];
    const dominantIndex=currentValues.reduce((best,value,index)=>value!==null&&(best===-1||value>currentValues[best])?index:best,-1);
    const selectedValues=matrix.map(values=>values[selectedIndex]);
    let peakIndex=-1;
    selectedValues.forEach((value,index)=>{if(value!==null&&(peakIndex===-1||value>selectedValues[peakIndex])) peakIndex=index;});
    const currentSelected=selectedValues.at(-1)??null;
    const selectedGroup=GROUPS[selectedIndex]||GROUPS[0];

    return `<section class="panel stage-analysis-controls distribution-controls">
      <div><span>DISTRIBUCIÓN SEMANAL</span><h2>Etapas fenológicas agrupadas</h2><p>Cada columna representa el 100 % de los conteos E01–E17 de esa semana.</p></div>
      <div class="stage-week-selectors"><label>Grupo para tendencia<select id="stage-selected-group">${GROUPS.map(group=>`<option value="${group.id}" ${group.id===analyticsState.selectedGroup?'selected':''}>${text(group.label)}</option>`).join('')}</select></label></div>
    </section>
    <article class="panel stage-analysis-card">
      <div class="chart-card-head"><div><span>MAPA DE CALOR</span><h2>Distribución acumulada semanal de estadios</h2></div></div>
      <div class="stage-wide-table-wrap"><table class="stage-distribution-table"><thead><tr><th>Descripción</th>${weeks.map(week=>`<th title="${text(week.long)}">${week.week}</th>`).join('')}</tr></thead><tbody>${GROUPS.map((group,groupIndex)=>`<tr data-stage-group="${group.id}" class="${group.id===analyticsState.selectedGroup?'selected':''}"><th>${text(group.label)}</th>${weeks.map((week,weekIndex)=>{const value=matrix[weekIndex][groupIndex];const heat=value===null?0:Math.min(.88,.05+value/100*.83);return `<td style="--stage-heat:${heat}" title="${text(week.long)} · ${text(group.short)}: ${pct(value)}">${pct(value)}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="stage-table-help">Toca una fila para mostrar su evolución semanal.</p>
    </article>
    <section class="stage-distribution-bottom">
      <article class="panel stage-analysis-card stage-trend-card"><div class="chart-card-head"><div><span>EVOLUCIÓN DEL GRUPO SELECCIONADO</span><h2>${text(selectedGroup.label)}</h2></div></div>${stageLineChart(weeks,selectedValues,selectedGroup.short)}</article>
      <section class="stage-summary-cards">
        <article><span>✿</span><small>Etapa dominante actual</small><b>${dominantIndex>=0?text(GROUPS[dominantIndex].short):'—'}</b><strong>${dominantIndex>=0?pct(currentValues[dominantIndex]):'—'}</strong><em>${text(weeks.at(-1)?.long||'')}</em></article>
        <article><span>↗</span><small>Semana pico</small><b>${peakIndex>=0?text(weeks[peakIndex].long):'—'}</b><strong>${peakIndex>=0?pct(selectedValues[peakIndex]):'—'}</strong><em>${text(selectedGroup.short)}</em></article>
        <article><span>▣</span><small>% semana actual</small><b>${text(weeks.at(-1)?.long||'—')}</b><strong>${pct(currentSelected)}</strong><em>${text(selectedGroup.short)}</em></article>
      </section>
    </section>`;
  }

  function injectTabs(){
    const desktop=document.querySelector('.charts-tabs');
    if(desktop&&!desktop.querySelector('[data-stage-analysis]')){
      desktop.insertAdjacentHTML('beforeend',CUSTOM_TABS.map(([id,label])=>`<button type="button" data-stage-analysis="${id}">${label}</button>`).join(''));
    }
    const mobile=document.querySelector('#chart-tab-select');
    if(mobile&&!mobile.querySelector('option[value="stage-weekly-diff"]')){
      CUSTOM_TABS.forEach(([id,label])=>mobile.insertAdjacentHTML('beforeend',`<option value="${id}">${label}</option>`));
    }
    document.querySelectorAll('[data-chart-tab]').forEach(button=>button.classList.remove('active'));
    document.querySelectorAll('[data-stage-analysis]').forEach(button=>button.classList.toggle('active',button.dataset.stageAnalysis===analyticsState.active));
    if(mobile&&analyticsState.active) mobile.value=analyticsState.active;
  }

  function renderCustom(){
    const records=filteredRecords();
    const content=document.querySelector('#charts-content');
    const result=document.querySelector('.charts-result-head');
    if(result){
      const label=CUSTOM_TABS.find(([id])=>id===analyticsState.active)?.[1]||'Análisis semanal';
      result.innerHTML=`<b>${records.length.toLocaleString('es-PE')} evaluaciones encontradas</b><span>${text(label)}</span>`;
    }
    if(!content) return;
    content.innerHTML=analyticsState.active==='stage-weekly-diff'?weeklyDifference(records):weeklyDistribution(records);
  }

  const previousChartsView=chartsView;
  chartsView=function stageAnalyticsChartsView(){
    const result=previousChartsView();
    if(state.view!=='charts'||!isSupervisor()) return result;
    injectTabs();
    if(analyticsState.active) renderCustom();
    return result;
  };

  document.addEventListener('click',event=>{
    const normalTab=event.target.closest('[data-chart-tab]');
    if(normalTab) analyticsState.active='';
  },true);

  document.addEventListener('click',event=>{
    if(state.view!=='charts'||!isSupervisor()) return;
    const custom=event.target.closest('[data-stage-analysis]')?.dataset.stageAnalysis;
    if(custom){
      analyticsState.active=custom;
      chartsView();
      return;
    }
    const row=event.target.closest('[data-stage-group]');
    if(row&&analyticsState.active==='stage-weekly-distribution'){
      analyticsState.selectedGroup=row.dataset.stageGroup;
      renderCustom();
    }
  });

  document.addEventListener('change',event=>{
    if(state.view!=='charts'||!isSupervisor()) return;
    if(event.target.id==='chart-tab-select'){
      if(event.target.value.startsWith('stage-weekly-')){
        event.preventDefault();
        event.stopImmediatePropagation();
        analyticsState.active=event.target.value;
        chartsView();
      }else{
        analyticsState.active='';
      }
      return;
    }
    if(event.target.id==='stage-current-week'){
      analyticsState.currentWeek=event.target.value;
      const weeks=groupByWeek(filteredRecords());
      const index=weeks.findIndex(week=>week.key===analyticsState.currentWeek);
      analyticsState.previousWeek=index>0?weeks[index-1].key:'';
      renderCustom();
      return;
    }
    if(event.target.id==='stage-previous-week'){
      analyticsState.previousWeek=event.target.value;
      renderCustom();
      return;
    }
    if(event.target.id==='stage-selected-group'){
      analyticsState.selectedGroup=event.target.value;
      renderCustom();
    }
  },true);

  window.FenologiaStageAnalytics={version:VERSION,state:analyticsState};
  if(typeof state!=='undefined'&&state.catalog&&state.view==='charts') chartsView();
})();
