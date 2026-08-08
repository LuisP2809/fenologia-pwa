(() => {
  const VERSION='0.12.3';
  let redirectingSummary=false;

  const blank=value=>value===''||value===null||value===undefined;
  const num=value=>{
    if(blank(value)) return null;
    const parsed=Number(String(value).replace(',','.'));
    return Number.isFinite(parsed)?parsed:null;
  };
  const sum=values=>values.reduce((total,value)=>total+(num(value)??0),0);
  const average=values=>{
    const valid=values.map(num).filter(value=>value!==null);
    return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null;
  };
  const unique=values=>[...new Set(values.filter(value=>!blank(value)).map(String))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  const fmt=(value,digits=1)=>value===null||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString('es-PE',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const pct=value=>value===null?'—':`${fmt(value,1)} %`;
  const clamp=value=>Math.max(0,Math.min(100,Number(value)||0));
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

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
    return {key:monday.toISOString().slice(0,10),week,label:`S${String(week).padStart(2,'0')}`,long:`Semana ${week}`};
  }

  function domFilters(){
    const value=id=>document.querySelector(id)?.value||'';
    return {
      from:value('#chart-from'),to:value('#chart-to'),campaign:value('#chart-campaign'),field:value('#chart-field'),
      farm:value('#chart-farm'),module:value('#chart-module'),lot:value('#chart-lot'),variety:value('#chart-variety'),
      quadrant:value('#chart-quadrant'),evaluator:value('#chart-evaluator')
    };
  }

  function filteredRecords({ignoreDates=false}={}){
    const filters=domFilters();
    return state.records.filter(record=>{
      if(!ignoreDates&&filters.from&&(!record.date||record.date<filters.from)) return false;
      if(!ignoreDates&&filters.to&&(!record.date||record.date>filters.to)) return false;
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

  function compositionPercent(records,key,keys){
    const hasEvaluation=records.some(record=>keys.some(field=>!blank(record[field])));
    if(!hasEvaluation) return null;
    const total=sum(records.flatMap(record=>keys.map(field=>record[field])));
    if(total===0) return 0;
    return sum(records.map(record=>record[key]))/total*100;
  }

  function ratioPercent(records,numeratorKey,denominatorKey){
    const hasEvaluation=records.some(record=>!blank(record[numeratorKey])||!blank(record[denominatorKey]));
    if(!hasEvaluation) return null;
    const denominator=sum(records.map(record=>record[denominatorKey]));
    if(denominator===0) return 0;
    return sum(records.map(record=>record[numeratorKey]))/denominator*100;
  }

  function empty(title,detail='No hay información registrada para los filtros seleccionados.'){
    return `<div class="chart-empty ref-chart-empty"><span>📊</span><b>${safe(title)}</b><p>${safe(detail)}</p></div>`;
  }

  function card(title,kicker,body,extra=''){
    return `<article class="panel chart-card ref-chart-card ${extra}"><div class="chart-card-head"><div><span>${safe(kicker)}</span><h2>${safe(title)}</h2></div></div>${body}</article>`;
  }

  function lineChart(labels,series,{percent=false,digits=1}={}){
    const hasValues=series.some(item=>item.values.some(value=>value!==null));
    if(!labels.length||!hasValues) return empty('Sin datos para la evolución');
    const width=Math.max(820,labels.length*58),height=300,pad={l:58,r:22,t:30,b:48},plotW=width-pad.l-pad.r,plotH=height-pad.t-pad.b;
    const all=series.flatMap(item=>item.values).filter(value=>value!==null&&Number.isFinite(value));
    const max=percent?100:Math.max(1,...all)*1.12;
    const x=index=>labels.length===1?pad.l+plotW/2:pad.l+(index/(labels.length-1))*plotW;
    const y=value=>pad.t+plotH-(Math.max(0,value||0)/max)*plotH;
    const ticks=percent?[0,25,50,75,100]:[0,.25,.5,.75,1].map(f=>max*f);
    return `<div class="ref-line-wrap"><svg class="ref-line-chart" viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="img">
      ${ticks.map(t=>`<line x1="${pad.l}" y1="${y(t)}" x2="${width-pad.r}" y2="${y(t)}"/><text x="${pad.l-10}" y="${y(t)+4}" text-anchor="end">${percent?`${Math.round(t)}%`:fmt(t,digits)}</text>`).join('')}
      ${labels.map((label,index)=>`<text x="${x(index)}" y="${height-17}" text-anchor="middle">${safe(label)}</text>`).join('')}
      ${series.map((item,sIndex)=>{
        const segments=[];let current=[];
        item.values.forEach((value,index)=>{if(value===null){if(current.length)segments.push(current);current=[];}else current.push([x(index),y(value),value,index]);});
        if(current.length) segments.push(current);
        return `<g class="ref-series ref-series-${sIndex%5}">${segments.map(segment=>`<polyline points="${segment.map(point=>`${point[0]},${point[1]}`).join(' ')}"/>`).join('')}${segments.flat().map(point=>`<circle cx="${point[0]}" cy="${point[1]}" r="4"><title>${safe(item.name)} · ${safe(labels[point[3]])}: ${percent?pct(point[2]):fmt(point[2],digits)}</title></circle>`).join('')}</g>`;
      }).join('')}
    </svg><div class="ref-legend">${series.map((item,index)=>`<span class="ref-series-${index%5}"><i></i>${safe(item.name)}</span>`).join('')}</div></div>`;
  }

  function simpleBars(items,{percent=false,digits=1}={}){
    if(!items.length||!items.some(item=>item.value!==null)) return empty('Sin datos para comparar');
    const valid=items.map(item=>item.value).filter(value=>value!==null);
    const max=percent?100:Math.max(1,...valid)*1.08;
    return `<div class="ref-simple-bars">${items.map((item,index)=>`<div class="ref-simple-row"><div><span>${safe(item.label)}</span><b>${item.value===null?'—':percent?pct(item.value):fmt(item.value,digits)}</b></div><i><em class="ref-bg-${index%5}" style="width:${item.value===null?0:clamp(item.value/max*100)}%"></em></i></div>`).join('')}</div>`;
  }

  function groupedHorizontal(groups,series){
    if(!groups.length||!series.some(item=>item.values.some(value=>value!==null))) return empty('Sin datos para comparar');
    return `<div class="ref-grouped-horizontal">${groups.map((group,gIndex)=>`<section><h4>${safe(group)}</h4>${series.map((item,sIndex)=>{const value=item.values[gIndex];return `<div class="ref-grouped-row"><span>${safe(item.name)}</span><i><em class="ref-bg-${sIndex%5}" style="width:${value===null?0:clamp(value)}%"></em></i><b>${pct(value)}</b></div>`;}).join('')}</section>`).join('')}<div class="ref-legend">${series.map((item,index)=>`<span class="ref-series-${index%5}"><i></i>${safe(item.name)}</span>`).join('')}</div></div>`;
  }

  function comparisonCard(title,kicker,leftTitle,leftBody,rightTitle,rightBody){
    return `<article class="panel ref-comparison-card"><div class="chart-card-head"><div><span>${safe(kicker)}</span><h2>${safe(title)}</h2></div></div><div class="ref-compare-grid"><section><h3>${safe(leftTitle)}</h3>${leftBody}</section><section><h3>${safe(rightTitle)}</h3>${rightBody}</section></div></article>`;
  }

  function findCardByTitle(fragment){
    return [...document.querySelectorAll('#charts-content .chart-card')].find(card=>card.querySelector('h2')?.textContent.includes(fragment));
  }

  function replaceCardBody(card,body){
    if(!card) return;
    [...card.children].forEach(child=>{if(!child.classList.contains('chart-card-head')) child.remove();});
    card.insertAdjacentHTML('beforeend',body);
  }

  function hideSummary(){
    const button=document.querySelector('[data-chart-tab="summary"]');
    const option=document.querySelector('#chart-tab-select option[value="summary"]');
    const active=button?.classList.contains('active')||document.querySelector('#chart-tab-select')?.value==='summary';
    button?.remove();
    option?.remove();
    if(active&&!redirectingSummary){
      redirectingSummary=true;
      setTimeout(()=>{
        document.querySelector('[data-chart-tab="stages"]')?.click();
        redirectingSummary=false;
      },0);
    }
    return active;
  }

  function refineStages(){
    findCardByTitle('Tendencia semanal de')?.remove();
  }

  function refineSprouts(){
    findCardByTitle('Brotación activa')?.remove();
    const records=filteredRecords();
    const usable=records.filter(record=>['broteRojo','brotePalido','broteOscuro'].some(key=>!blank(record[key])));
    const weeks=groupByWeek(usable);
    const defs=[['Brote rojo','broteRojo'],['Verde pálido','brotePalido'],['Verde oscuro','broteOscuro']];
    const series=defs.map(([name,key])=>({name,values:weeks.map(week=>compositionPercent(week.records,key,['broteRojo','brotePalido','broteOscuro']))}));
    const cardNode=findCardByTitle('Tendencia de los estados');
    replaceCardBody(cardNode,lineChart(weeks.map(week=>week.label),series,{percent:true}));
  }

  function refineSenescence(){
    const content=document.querySelector('#charts-content');
    if(!content) return;
    const records=filteredRecords();
    const usable=records.filter(record=>!blank(record.senescencia));
    if(!usable.length){content.innerHTML=empty('Sin datos de senescencia');return;}
    const weeks=groupByWeek(usable);
    const weekly=weeks.map(week=>average(week.records.map(record=>record.senescencia)));
    const funds=unique(usable.map(record=>record.farm));
    const varieties=unique(usable.map(record=>record.variety));
    const fundItems=funds.map(fund=>({label:fund,value:average(usable.filter(record=>record.farm===fund).map(record=>record.senescencia))}));
    const varietyItems=varieties.map(variety=>({label:variety,value:average(usable.filter(record=>record.variety===variety).map(record=>record.senescencia))}));
    content.innerHTML=`<section class="charts-two-cols ref-chart-layout">
      ${card('Distribución semanal de senescencia','PROMEDIO POR SEMANA',simpleBars(weeks.map((week,index)=>({label:week.label,value:weekly[index]})),{digits:2}))}
      ${card('Evolución semanal de senescencia','EVOLUCIÓN SEMANAL',lineChart(weeks.map(week=>week.label),[{name:'Senescencia',values:weekly}],{digits:2}))}
      ${card('Senescencia por fundo','COMPARACIÓN',simpleBars(fundItems,{digits:2}))}
      ${card('Senescencia por variedad','COMPARACIÓN',simpleBars(varietyItems,{digits:2}))}
    </section>`;
  }

  function percentageSeries(records,groupKey,defs){
    const groups=unique(records.map(record=>record[groupKey]));
    const keys=defs.map(([,key])=>key);
    const series=defs.map(([name,key])=>({name,values:groups.map(group=>compositionPercent(records.filter(record=>record[groupKey]===group),key,keys))}));
    return {groups,series};
  }

  function ratioSeries(records,groupKey,numeratorKey,denominatorKey,label){
    const groups=unique(records.map(record=>record[groupKey]));
    return {groups,series:[{name:label,values:groups.map(group=>ratioPercent(records.filter(record=>record[groupKey]===group),numeratorKey,denominatorKey))}]};
  }

  function refinePanicles(){
    const content=document.querySelector('#charts-content');
    if(!content) return;
    const fields=['paniculaIndeterminada','paniculaDeterminada','conteoPaniculas','conteoCuajas','paniculasSinCuajar','paniculaBuena','paniculaMedia','paniculaMala'];
    const records=filteredRecords();
    const usable=records.filter(record=>fields.some(key=>!blank(record[key])));
    if(!usable.length){content.innerHTML=empty('Sin datos de panículas');return;}

    const typeDefs=[['Indeterminada','paniculaIndeterminada'],['Determinada','paniculaDeterminada']];
    const qualityDefs=[['Buena','paniculaBuena'],['Media','paniculaMedia'],['Mala','paniculaMala']];
    const typeFund=percentageSeries(usable,'farm',typeDefs),typeVariety=percentageSeries(usable,'variety',typeDefs);
    const qualityFund=percentageSeries(usable,'farm',qualityDefs),qualityVariety=percentageSeries(usable,'variety',qualityDefs);
    const setFund=ratioSeries(usable,'farm','conteoCuajas','conteoPaniculas','Eficiencia de cuaja');
    const setVariety=ratioSeries(usable,'variety','conteoCuajas','conteoPaniculas','Eficiencia de cuaja');
    const noSetFund=ratioSeries(usable,'farm','paniculasSinCuajar','conteoPaniculas','Sin cuajar');
    const noSetVariety=ratioSeries(usable,'variety','paniculasSinCuajar','conteoPaniculas','Sin cuajar');

    content.innerHTML=`<section class="ref-panicle-stack">
      ${comparisonCard('Panícula determinada vs. indeterminada','PORCENTAJE','Por fundo',groupedHorizontal(typeFund.groups,typeFund.series),'Por variedad',groupedHorizontal(typeVariety.groups,typeVariety.series))}
      ${comparisonCard('Calidad de panículas: buena, media y mala','PORCENTAJE','Por fundo',groupedHorizontal(qualityFund.groups,qualityFund.series),'Por variedad',groupedHorizontal(qualityVariety.groups,qualityVariety.series))}
      ${comparisonCard('Eficiencia de cuaja','CUAJAS / PANÍCULAS · %','Por fundo',groupedHorizontal(setFund.groups,setFund.series),'Por variedad',groupedHorizontal(setVariety.groups,setVariety.series))}
      ${comparisonCard('Panículas sin cuajar','PANÍCULAS SIN CUAJAR / TOTAL · %','Por fundo',groupedHorizontal(noSetFund.groups,noSetFund.series),'Por variedad',groupedHorizontal(noSetVariety.groups,noSetVariety.series))}
    </section>`;
  }

  function refineBuds(){
    const allWeeksRecords=filteredRecords({ignoreDates:true});
    const allUsable=allWeeksRecords.filter(record=>['yemasVegetativas','yemasFlorales','yemasDudosas'].some(key=>!blank(record[key])));
    const weeks=groupByWeek(allUsable);
    const defs=[['Vegetativas','yemasVegetativas'],['Florales','yemasFlorales'],['Dudosas','yemasDudosas']];
    const trendSeries=defs.map(([name,key])=>({name,values:weeks.map(week=>compositionPercent(week.records,key,['yemasVegetativas','yemasFlorales','yemasDudosas']))}));
    const trendCard=findCardByTitle('Evolución semanal de yemas');
    if(trendCard){
      const kicker=trendCard.querySelector('.chart-card-head span');
      if(kicker) kicker.textContent='TENDENCIA · TODAS LAS SEMANAS';
      replaceCardBody(trendCard,`${lineChart(weeks.map(week=>week.label),trendSeries,{percent:true})}<p class="ref-chart-note">La tendencia ignora únicamente los filtros Desde/Hasta; mantiene campaña, campo, fundo, módulo, lote, variedad, cuadrante y evaluador.</p>`);
    }

    const currentRecords=filteredRecords().filter(record=>['yemasVegetativas','yemasFlorales','yemasDudosas'].some(key=>!blank(record[key])));
    const byVariety=percentageSeries(currentRecords,'variety',defs);
    const stack=document.querySelector('#charts-content .charts-two-cols.single-stack');
    if(stack&&!stack.querySelector('[data-ref-buds-variety]')){
      stack.insertAdjacentHTML('beforeend',card('Composición de yemas por variedad','COMPARACIÓN POR VARIEDAD',groupedHorizontal(byVariety.groups,byVariety.series),'wide-chart').replace('<article ','<article data-ref-buds-variety="1" '));
    }
  }

  function refineWeeklyDifference(){
    const current=document.querySelector('#stage-current-week');
    const previous=document.querySelector('#stage-previous-week');
    const currentText=current?.selectedOptions?.[0]?.textContent||'';
    const previousText=previous?.selectedOptions?.[0]?.textContent||'';
    const currentWeek=currentText.match(/\d+/)?.[0]||'—';
    const previousWeek=previousText.match(/\d+/)?.[0]||'—';
    const heading=document.querySelector('#charts-content .stage-analysis-card .chart-card-head h2');
    if(heading) heading.textContent=`Diferencia semana actual (Sem. ${currentWeek}) y semana anterior (Sem. ${previousWeek})`;
  }

  function refineWeeklyDistribution(){
    const label=document.querySelector('.distribution-controls .stage-week-selectors label');
    if(label&&label.firstChild) label.firstChild.nodeValue='Grupo para indicadores';
    document.querySelector('.stage-table-help')?.remove();
    document.querySelector('.stage-trend-card')?.remove();
    document.querySelector('.stage-distribution-bottom')?.classList.add('ref-distribution-no-trend');
  }

  function normalTab(){
    return document.querySelector('[data-chart-tab].active')?.dataset.chartTab||document.querySelector('#chart-tab-select')?.value||'';
  }

  function injectStyles(){
    if(document.querySelector('#charts-refinement-style')) return;
    const style=document.createElement('style');
    style.id='charts-refinement-style';
    style.textContent=`
      .ref-chart-layout{align-items:start}.ref-chart-card{min-height:100%}
      .ref-line-wrap{width:100%;overflow-x:auto;padding-bottom:4px}.ref-line-chart{height:auto;display:block;overflow:visible}
      .ref-line-chart line{stroke:#dce8e0;stroke-width:1;stroke-dasharray:3 5}.ref-line-chart text{font-size:12px;fill:#657b6e}
      .ref-series polyline{fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.ref-series circle{fill:#fff;stroke:currentColor;stroke-width:3}
      .ref-series-0{color:#08783f}.ref-series-1{color:#41bea0}.ref-series-2{color:#ec5a24}.ref-series-3{color:#5570f5}.ref-series-4{color:#4d0ab3}
      .ref-bg-0{background:#08783f!important}.ref-bg-1{background:#41bea0!important}.ref-bg-2{background:#ec5a24!important}.ref-bg-3{background:#5570f5!important}.ref-bg-4{background:#4d0ab3!important}
      .ref-legend{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-top:12px;color:#5c7266;font-size:13px}.ref-legend span{display:flex;align-items:center;gap:6px}.ref-legend i{width:10px;height:10px;border-radius:50%;background:currentColor}
      .ref-simple-bars{display:flex;flex-direction:column;gap:13px}.ref-simple-row>div{display:flex;justify-content:space-between;gap:12px}.ref-simple-row span{font-weight:750;color:#365644}.ref-simple-row b{color:#0a5731}.ref-simple-row>i{display:block;height:11px;border-radius:999px;background:#e9f1ec;overflow:hidden;margin-top:6px}.ref-simple-row>i>em{display:block;height:100%;border-radius:999px}
      .ref-panicle-stack{display:grid;grid-template-columns:1fr;gap:18px}.ref-comparison-card{margin:0}.ref-compare-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.ref-compare-grid>section{min-width:0}.ref-compare-grid h3{font-size:15px;color:#24523c;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #dce8e0}
      .ref-grouped-horizontal{display:flex;flex-direction:column;gap:14px}.ref-grouped-horizontal>section{background:#f8fbf9;border:1px solid #e1ebe4;border-radius:13px;padding:11px}.ref-grouped-horizontal h4{margin:0 0 9px;color:#174b31}.ref-grouped-row{display:grid;grid-template-columns:minmax(92px,130px) 1fr 58px;gap:8px;align-items:center;margin:7px 0}.ref-grouped-row>span{font-size:12px;color:#4d6659}.ref-grouped-row>i{height:10px;background:#e7efe9;border-radius:999px;overflow:hidden}.ref-grouped-row>i>em{display:block;height:100%;border-radius:999px}.ref-grouped-row>b{text-align:right;color:#0b6035;font-size:12px}
      .ref-chart-note{margin:9px 0 0;color:#6b8074;font-size:12px;background:#f4f8f5;border-left:3px solid #16814a;padding:9px 11px;border-radius:8px}
      .stage-distribution-table{min-width:980px}.stage-distribution-table thead th:first-child,.stage-distribution-table tbody>tr>th{width:175px;max-width:175px;min-width:175px;white-space:normal;line-height:1.15;font-size:11px;padding-left:7px;padding-right:7px}.stage-distribution-table td{min-width:48px;padding-left:6px;padding-right:6px;font-size:12px}
      .stage-distribution-bottom.ref-distribution-no-trend{grid-template-columns:1fr}.ref-distribution-no-trend .stage-summary-cards{width:100%}
      @media(max-width:900px){.ref-compare-grid{grid-template-columns:1fr}.stage-distribution-table thead th:first-child,.stage-distribution-table tbody>tr>th{width:155px;max-width:155px;min-width:155px}.stage-distribution-table{min-width:900px}}
      @media(max-width:560px){.ref-grouped-row{grid-template-columns:90px 1fr 52px}.ref-compare-grid{gap:16px}.stage-distribution-table thead th:first-child,.stage-distribution-table tbody>tr>th{width:140px;max-width:140px;min-width:140px;font-size:10px}.stage-distribution-table td{min-width:44px;font-size:11px}}
    `;
    document.head.appendChild(style);
  }

  function refine(){
    if(state.view!=='charts'||!isSupervisor()) return;
    injectStyles();
    if(hideSummary()) return;
    const custom=window.FenologiaStageAnalytics?.state?.active||'';
    if(custom==='stage-weekly-diff'){refineWeeklyDifference();return;}
    if(custom==='stage-weekly-distribution'){refineWeeklyDistribution();return;}
    const tab=normalTab();
    if(tab==='stages') refineStages();
    else if(tab==='sprouts') refineSprouts();
    else if(tab==='senescence') refineSenescence();
    else if(tab==='panicles') refinePanicles();
    else if(tab==='buds') refineBuds();
  }

  const previousChartsView=chartsView;
  chartsView=function refinedChartsView(){
    const result=previousChartsView();
    if(state.view==='charts'&&isSupervisor()) queueMicrotask(refine);
    return result;
  };

  document.addEventListener('change',event=>{
    if(state.view!=='charts'||!isSupervisor()) return;
    if(['stage-current-week','stage-previous-week','stage-selected-group'].includes(event.target.id)) setTimeout(refine,0);
  });
  document.addEventListener('click',event=>{
    if(state.view!=='charts'||!isSupervisor()) return;
    if(event.target.closest('[data-stage-group]')) setTimeout(refine,0);
  });

  window.FenologiaChartsRefinement={version:VERSION,refresh:refine};
  if(typeof state!=='undefined'&&state.catalog&&state.view==='charts') chartsView();
})();
