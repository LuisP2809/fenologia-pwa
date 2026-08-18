(() => {
  const VERSION = '0.9.0';
  const TABS = [
    ['summary','Resumen'],['stages','Estadios E01–E17'],['sprouts','Brotamiento'],
    ['senescence','Senescencia'],['biometry','Biometría'],['fall','Caída de fruta'],
    ['quadrants','Cuadrantes'],['panicles','Panículas'],['buds','Evolución de yemas']
  ];
  const stageKeys = Array.from({length:17},(_,index)=>`E${String(index+1).padStart(2,'0')}`);
  const chartState = {
    tab:'summary', from:'', to:'', campaign:'', field:'', farm:'', module:'', lot:'',
    variety:'', quadrant:'', evaluator:'', stage:'E06', measure:'dl'
  };

  const blank = value => value === '' || value === null || value === undefined;
  const num = value => {
    if(blank(value)) return null;
    const parsed = Number(String(value).replace(',','.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const sum = values => values.reduce((total,value)=>total+(num(value) ?? 0),0);
  const average = values => {
    const valid = values.map(num).filter(value=>value !== null);
    return valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : null;
  };
  const unique = values => [...new Set(values.filter(value=>!blank(value)).map(value=>String(value)))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  const fmt = (value,digits=1) => value === null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('es-PE',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const pct = value => value === null ? '—' : `${fmt(value,1)} %`;
  const clamp = value => Math.max(0,Math.min(100,Number(value)||0));
  const text = value => esc(value ?? '');
  const sourceRecords = () => window.FenologiaFileAnalysis?.getChartRecords?.() ?? state.records;

  function campaignOf(record){
    if(!blank(record.campaign)) return String(record.campaign);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(record.date||'')) return 'Sin campaña';
    const [year,month] = record.date.split('-').map(Number);
    return month >= 10 ? `${year}-${year+1}` : `${year-1}-${year}`;
  }

  function weekInfo(dateText){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateText||'')) return null;
    const date = new Date(`${dateText}T12:00:00Z`);
    const day = date.getUTCDay() || 7;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate()-day+1);
    const thursday = new Date(date);
    thursday.setUTCDate(date.getUTCDate()+4-day);
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(),0,1));
    const week = Math.ceil((((thursday-yearStart)/86400000)+1)/7);
    return {
      key:monday.toISOString().slice(0,10),
      label:`S${String(week).padStart(2,'0')}`,
      long:`Semana ${week} · ${monday.toISOString().slice(0,10)}`
    };
  }

  function filteredRecords(){
    return sourceRecords().filter(record => {
      if(chartState.from && (!record.date || record.date < chartState.from)) return false;
      if(chartState.to && (!record.date || record.date > chartState.to)) return false;
      if(chartState.campaign && campaignOf(record) !== chartState.campaign) return false;
      if(chartState.field && record.field !== chartState.field) return false;
      if(chartState.farm && record.farm !== chartState.farm) return false;
      if(chartState.module && record.module !== chartState.module) return false;
      if(chartState.lot && record.lot !== chartState.lot) return false;
      if(chartState.variety && record.variety !== chartState.variety) return false;
      if(chartState.quadrant && record.quadrant !== chartState.quadrant) return false;
      if(chartState.evaluator && (record.evaluatorId || record.evaluator || '') !== chartState.evaluator) return false;
      return true;
    });
  }

  function filterOptions(){
    const records = sourceRecords();
    const fields = unique(records.map(r=>r.field).concat(Object.keys(state.catalog?.lotesAgrupados||{})));
    const farms = unique(records.filter(r=>!chartState.field||r.field===chartState.field).map(r=>r.farm)
      .concat(Object.keys(state.catalog?.lotesAgrupados?.[chartState.field]||{})));
    const modules = unique(records.filter(r=>(!chartState.field||r.field===chartState.field)&&(!chartState.farm||r.farm===chartState.farm)).map(r=>r.module)
      .concat(Object.keys(state.catalog?.lotesAgrupados?.[chartState.field]?.[chartState.farm]||{})));
    const catalogLots = state.catalog?.lotesAgrupados?.[chartState.field]?.[chartState.farm]?.[chartState.module] || [];
    const lots = unique(records.filter(r=>(!chartState.field||r.field===chartState.field)&&(!chartState.farm||r.farm===chartState.farm)&&(!chartState.module||r.module===chartState.module)).map(r=>r.lot).concat(catalogLots));
    const varieties = unique(records.map(r=>r.variety).concat(Object.values(state.catalog?.variedadesPorCampo||{}).flat()));
    const quadrants = unique(records.map(r=>r.quadrant).concat(state.catalog?.cuadrantes||[]));
    const campaigns = unique(records.map(campaignOf));
    const evaluators = [];
    records.forEach(r=>{
      const value=r.evaluatorId||r.evaluator;
      if(value&&!evaluators.some(item=>item.value===value)) evaluators.push({value,label:r.evaluator||r.evaluatorId});
    });
    users.filter(u=>u.role==='Evaluador').forEach(u=>{
      if(!evaluators.some(item=>item.value===u.id)) evaluators.push({value:u.id,label:u.name});
    });
    evaluators.sort((a,b)=>a.label.localeCompare(b.label,'es'));
    return {fields,farms,modules,lots,varieties,quadrants,campaigns,evaluators};
  }

  function selectOptions(values,current,all='Todos'){
    return `<option value="">${all}</option>${values.map(value=>`<option value="${text(value)}" ${String(value)===String(current)?'selected':''}>${text(value)}</option>`).join('')}`;
  }

  function filterPanel(){
    const o = filterOptions();
    return `<section class="panel charts-filters">
      <div class="panel-head"><div><span>FILTROS GENERALES</span><h2>Alcance del análisis</h2><p>Todos los gráficos de la pestaña respetan esta selección.</p></div><button class="link" id="charts-clear">Limpiar filtros</button></div>
      <div class="charts-filter-grid">
        <label>Desde<span class="chart-date-wrap"><input id="chart-from" type="date" value="${text(chartState.from)}"></span></label>
        <label>Hasta<span class="chart-date-wrap"><input id="chart-to" type="date" value="${text(chartState.to)}"></span></label>
        <label>Campaña<select id="chart-campaign">${selectOptions(o.campaigns,chartState.campaign)}</select></label>
        <label>Campo<select id="chart-field">${selectOptions(o.fields,chartState.field)}</select></label>
        <label>Fundo<select id="chart-farm" ${chartState.field?'':'disabled'}>${selectOptions(o.farms,chartState.farm)}</select></label>
        <label>Módulo<select id="chart-module" ${chartState.farm?'':'disabled'}>${selectOptions(o.modules,chartState.module)}</select></label>
        <label>Turno-Lote<select id="chart-lot" ${chartState.module?'':'disabled'}>${selectOptions(o.lots,chartState.lot)}</select></label>
        <label>Variedad<select id="chart-variety">${selectOptions(o.varieties,chartState.variety)}</select></label>
        <label>Cuadrante<select id="chart-quadrant">${selectOptions(o.quadrants,chartState.quadrant)}</select></label>
        <label>Evaluador<select id="chart-evaluator"><option value="">Todos</option>${o.evaluators.map(item=>`<option value="${text(item.value)}" ${item.value===chartState.evaluator?'selected':''}>${text(item.label)}</option>`).join('')}</select></label>
      </div>
      ${chartState.from&&chartState.to&&chartState.from>chartState.to?'<div class="charts-warning">La fecha inicial no puede ser posterior a la fecha final.</div>':''}
    </section>`;
  }

  function tabs(){
    return `<div class="charts-tabs" role="tablist">${TABS.map(([id,label])=>`<button type="button" data-chart-tab="${id}" class="${chartState.tab===id?'active':''}">${label}</button>`).join('')}</div>
      <label class="charts-mobile-tab">Vista<select id="chart-tab-select">${TABS.map(([id,label])=>`<option value="${id}" ${chartState.tab===id?'selected':''}>${label}</option>`).join('')}</select></label>`;
  }

  function empty(title='Sin datos para estos filtros',detail='Prueba ampliando el periodo o retirando algún filtro.'){
    return `<div class="chart-empty"><span>📊</span><b>${title}</b><p>${detail}</p></div>`;
  }

  function card(title,kicker,body,extraClass=''){
    return `<article class="panel chart-card ${extraClass}"><div class="chart-card-head"><div><span>${kicker}</span><h2>${title}</h2></div></div>${body}</article>`;
  }

  function stat(value,label,sub='',tone=''){
    return `<article class="chart-stat ${tone}"><strong>${value}</strong><span>${label}</span><small>${sub}</small></article>`;
  }

  function groupByWeek(records){
    const map = new Map();
    records.forEach(record=>{
      const info=weekInfo(record.date); if(!info)return;
      if(!map.has(info.key)) map.set(info.key,{...info,records:[]});
      map.get(info.key).records.push(record);
    });
    return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key));
  }

  function lineChart(labels,series,{percent=false,height=290,unit='',maxValue=null}={}){
    if(!labels.length || !series.some(item=>item.values.some(value=>value!==null))) return empty();
    const width=900,pad={l:54,r:22,t:28,b:48},plotW=width-pad.l-pad.r,plotH=height-pad.t-pad.b;
    const all=series.flatMap(item=>item.values).filter(value=>value!==null&&Number.isFinite(value));
    const max=maxValue ?? (percent?100:Math.max(1,...all)*1.12);
    const x=index=>labels.length===1?pad.l+plotW/2:pad.l+(index/(labels.length-1))*plotW;
    const y=value=>pad.t+plotH-(Math.max(0,value)/max)*plotH;
    const ticks=percent?[0,25,50,75,100]:[0,.25,.5,.75,1].map(f=>max*f);
    return `<div class="line-chart-wrap"><svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${text(series.map(s=>s.name).join(', '))}">
      ${ticks.map(t=>`<line x1="${pad.l}" y1="${y(t)}" x2="${width-pad.r}" y2="${y(t)}" class="grid-line"/><text x="${pad.l-9}" y="${y(t)+4}" text-anchor="end" class="axis-label">${percent?`${Math.round(t)}%`:fmt(t,t<10?1:0)}${unit}</text>`).join('')}
      ${labels.map((label,index)=>`<text x="${x(index)}" y="${height-16}" text-anchor="middle" class="axis-label">${text(label)}</text>`).join('')}
      ${series.map((item,seriesIndex)=>{
        const segments=[];let current=[];
        item.values.forEach((value,index)=>{if(value===null){if(current.length)segments.push(current);current=[];}else current.push([x(index),y(value),value,index]);});
        if(current.length)segments.push(current);
        return `<g class="chart-series chart-series-${seriesIndex%6}">${segments.map(segment=>`<polyline points="${segment.map(p=>`${p[0]},${p[1]}`).join(' ')}"/>`).join('')}${segments.flat().map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="4"><title>${text(item.name)} · ${text(labels[p[3]])}: ${percent?pct(p[2]):`${fmt(p[2],2)}${unit}`}</title></circle>`).join('')}</g>`;
      }).join('')}
    </svg><div class="chart-legend">${series.map((item,index)=>`<span class="chart-series-${index%6}"><i></i>${text(item.name)}</span>`).join('')}</div></div>`;
  }

  function stacked100(groups,series){
    if(!groups.length) return empty();
    return `<div class="stacked-list">${groups.map((group,index)=>{
      const total=series.reduce((acc,item)=>acc+(item.values[index]||0),0);
      return `<div class="stacked-row"><b>${text(group)}</b><div class="stacked-track">${series.map((item,sIndex)=>{const value=total?item.values[index]/total*100:0;return value?`<span class="chart-bg-${sIndex%6}" style="width:${value}%"><em>${value>=7?`${fmt(value,0)}%`:''}</em><title>${text(item.name)}: ${pct(value)}</title></span>`:'';}).join('')}</div></div>`;
    }).join('')}<div class="chart-legend">${series.map((item,index)=>`<span class="chart-series-${index%6}"><i></i>${text(item.name)}</span>`).join('')}</div></div>`;
  }

  function groupedBars(groups,series,{percent=true}={}){
    if(!groups.length) return empty();
    const max=percent?100:Math.max(1,...series.flatMap(item=>item.values.map(value=>value||0)))*1.1;
    return `<div class="grouped-chart"><div class="grouped-plot">${groups.map((group,index)=>`<div class="group-column"><div class="group-bars">${series.map((item,sIndex)=>{const value=item.values[index];const height=value===null?0:clamp(value/max*100);return `<div class="group-bar chart-bg-${sIndex%6}" style="height:${height}%"><span>${value===null?'':percent?pct(value):fmt(value,1)}</span><title>${text(item.name)} · ${text(group)}: ${value===null?'Sin dato':percent?pct(value):fmt(value,2)}</title></div>`;}).join('')}</div><b>${text(group)}</b></div>`).join('')}</div><div class="chart-legend">${series.map((item,index)=>`<span class="chart-series-${index%6}"><i></i>${text(item.name)}</span>`).join('')}</div></div>`;
  }

  function simpleBars(items,{percent=false}={}){
    if(!items.length) return empty();
    const max=percent?100:Math.max(1,...items.map(item=>item.value))*1.05;
    return `<div class="simple-bars">${items.map((item,index)=>`<div class="simple-bar"><div><span>${text(item.label)}</span><b>${percent?pct(item.value):fmt(item.value,item.digits??0)}</b></div><i><em class="chart-bg-${index%6}" style="width:${clamp(item.value/max*100)}%"></em></i>${item.sub?`<small>${text(item.sub)}</small>`:''}</div>`).join('')}</div>`;
  }

  function stageTotals(records){
    return stageKeys.map(stage=>sum(records.map(record=>record[stage])));
  }

  function summaryView(records){
    if(!records.length) return empty();
    const totals=stageTotals(records),stageTotal=sum(totals),dominantIndex=totals.indexOf(Math.max(...totals));
    const broteTotal=sum(records.flatMap(r=>[r.broteRojo,r.brotePalido,r.broteOscuro]));
    const activeBrote=broteTotal?sum(records.flatMap(r=>[r.broteRojo,r.brotePalido]))/broteTotal*100:null;
    const sen=average(records.map(r=>r.senescencia));
    const dl=average(records.flatMap(r=>fruitValues(r,'dl')));
    const fall=average(records.map(record=>fallTotal(record)).filter(value=>value!==null));
    const weeks=groupByWeek(records);
    const fields=unique(records.map(r=>r.field));
    return `<section class="chart-stats-grid">
      ${stat(records.length.toLocaleString('es-PE'),'Evaluaciones','Registros consolidados')}
      ${stat(new Set(records.map(r=>r.lot).filter(Boolean)).size,'Lotes evaluados','Según filtros')}
      ${stat(new Set(records.map(r=>r.module).filter(Boolean)).size,'Módulos','Con información')}
      ${stat(stageTotal?stageKeys[dominantIndex]:'—','Estadio dominante',stageTotal?pct(totals[dominantIndex]/stageTotal*100):'Sin conteos')}
      ${stat(activeBrote===null?'—':pct(activeBrote),'Brotamiento activo','Rojo + verde pálido')}
      ${stat(sen===null?'—':fmt(sen,2),'Senescencia promedio','Por planta evaluada')}
      ${stat(dl===null?'—':fmt(dl,2),'D.L. promedio','Frutos medidos')}
      ${stat(fall===null?'—':fmt(fall,2),'Caída promedio','F1 + F2 + F3 + F4')}
    </section>
    <section class="charts-two-cols">
      ${card('Evaluaciones por semana','ACTIVIDAD',lineChart(weeks.map(w=>w.label),[{name:'Evaluaciones',values:weeks.map(w=>w.records.length)}],{height:280}),'wide-chart')}
      ${card('Distribución por campo','COBERTURA',simpleBars(fields.map(field=>({label:field,value:records.filter(r=>r.field===field).length}))))}
    </section>`;
  }

  function stagesView(records){
    if(!records.length) return empty();
    const groups=unique(records.map(r=>r.module||r.lot));
    const matrix=groups.map(group=>{
      const subset=records.filter(r=>(r.module||r.lot)===group), totals=stageTotals(subset), total=sum(totals);
      return {group,total,values:totals.map(value=>total?value/total*100:0)};
    });
    const grand=stageTotals(records),grandTotal=sum(grand),dominant=grandTotal?stageKeys[grand.indexOf(Math.max(...grand))]:'—';
    const weeks=groupByWeek(records);
    const trend=weeks.map(week=>{const totals=stageTotals(week.records),total=sum(totals),index=stageKeys.indexOf(chartState.stage);return total?totals[index]/total*100:null;});
    const selectedIndex=stageKeys.indexOf(chartState.stage);
    return `<section class="chart-stats-grid compact">
      ${stat(records.length,'Evaluaciones','Base filtrada')}${stat(groups.length,'Módulos','Con conteos')}${stat(dominant,'Estadio dominante',grandTotal?pct(Math.max(...grand)/grandTotal*100):'Sin datos')}${stat(grandTotal.toLocaleString('es-PE'),'Estructuras','Suma E01–E17')}
    </section>
    <section class="panel chart-control-strip"><label>Estadio para tendencia<select id="chart-stage">${stageKeys.map(stage=>`<option ${stage===chartState.stage?'selected':''}>${stage}</option>`).join('')}</select></label></section>
    ${card('Distribución porcentual por módulo','MATRIZ E01–E17',matrix.length?`<div class="stage-matrix-wrap"><table class="stage-matrix"><thead><tr><th>Módulo</th>${stageKeys.map(s=>`<th class="${s===chartState.stage?'selected':''}">${s}</th>`).join('')}</tr></thead><tbody>${matrix.map(row=>`<tr><th>${text(row.group)}</th>${row.values.map((value,index)=>`<td class="${index===selectedIndex?'selected':''}" style="--heat:${Math.min(.88,.08+value/100*.8)}">${pct(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:empty())}
    <section class="charts-two-cols">
      ${card(`Tendencia semanal de ${chartState.stage}`,'EVOLUCIÓN',lineChart(weeks.map(w=>w.label),[{name:chartState.stage,values:trend}],{percent:true,height:280,maxValue:100}))}
      ${card(`Participación de ${chartState.stage} por módulo`,'COMPARACIÓN',simpleBars(matrix.map(row=>({label:row.group,value:row.values[selectedIndex]})).sort((a,b)=>b.value-a.value),{percent:true}))}
    </section>`;
  }

  function sproutsView(records){
    const usable=records.filter(r=>[r.broteRojo,r.brotePalido,r.broteOscuro].some(v=>!blank(v)));
    if(!usable.length) return empty('Sin datos de brotamiento','Los campos Brote rojo, verde pálido y verde oscuro están vacíos para estos filtros.');
    const weeks=groupByWeek(usable), seriesDefs=[['Brote rojo','broteRojo'],['Verde pálido','brotePalido'],['Verde oscuro','broteOscuro']];
    const raw=seriesDefs.map(([name,key])=>({name,values:weeks.map(w=>sum(w.records.map(r=>r[key])))}));
    const percentages=seriesDefs.map(([name,key])=>({name,values:weeks.map(w=>{const total=sum(w.records.flatMap(r=>[r.broteRojo,r.brotePalido,r.broteOscuro]));return total?sum(w.records.map(r=>r[key]))/total*100:null;})}));
    const farms=unique(usable.map(r=>r.farm));
    const farmSeries=seriesDefs.map(([name,key])=>({name,values:farms.map(farm=>{const subset=usable.filter(r=>r.farm===farm),total=sum(subset.flatMap(r=>[r.broteRojo,r.brotePalido,r.broteOscuro]));return total?sum(subset.map(r=>r[key]))/total*100:null;})}));
    const active=weeks.map(w=>{const total=sum(w.records.flatMap(r=>[r.broteRojo,r.brotePalido,r.broteOscuro]));return total?sum(w.records.flatMap(r=>[r.broteRojo,r.brotePalido]))/total*100:null;});
    return `<section class="charts-two-cols">
      ${card('Distribución semanal del brote','BARRAS AL 100 %',stacked100(weeks.map(w=>w.label),raw))}
      ${card('Tendencia de los estados','EVOLUCIÓN SEMANAL',lineChart(weeks.map(w=>w.label),percentages,{percent:true,maxValue:100}))}
      ${card('Estado del brote por fundo','COMPARACIÓN',groupedBars(farms,farmSeries,{percent:true}))}
      ${card('Brotación activa (Rojo + Pálido)','INDICADOR',lineChart(weeks.map(w=>w.label),[{name:'Brotación activa',values:active}],{percent:true,maxValue:100}))}
    </section>`;
  }

  function senescenceView(records){
    const usable=records.filter(r=>!blank(r.senescencia));
    if(!usable.length) return empty('Sin datos de senescencia');
    const weeks=groupByWeek(usable), farms=unique(usable.map(r=>r.farm));
    const farmSeries=farms.map(farm=>({name:farm,values:weeks.map(w=>average(w.records.filter(r=>r.farm===farm).map(r=>r.senescencia)))}));
    const avgSeries=weeks.map(w=>average(w.records.map(r=>r.senescencia)));
    const countSeries=weeks.map(w=>w.records.length);
    const lots=unique(usable.map(r=>r.lot)).map(lot=>{const subset=usable.filter(r=>r.lot===lot);return {lot,farm:subset[0]?.farm,module:subset[0]?.module,count:subset.length,avg:average(subset.map(r=>r.senescencia))};}).sort((a,b)=>(b.avg||0)-(a.avg||0));
    return `<section class="chart-stats-grid compact">${stat(usable.length,'Plantas evaluadas','Con senescencia')}${stat(fmt(average(usable.map(r=>r.senescencia)),2),'Promedio general','Por planta')}${stat(lots[0]?.lot||'—','Mayor promedio',lots[0]?fmt(lots[0].avg,2):'Sin datos')}${stat(lots.length,'Lotes','Con registros')}</section>
    <section class="charts-two-cols">
      ${card('Distribución semanal por fundo','SENESCENCIA',lineChart(weeks.map(w=>w.label),farmSeries,{height:300}))}
      ${card('Promedio y plantas evaluadas','EVOLUCIÓN',`${lineChart(weeks.map(w=>w.label),[{name:'Prom. senescencia',values:avgSeries}],{height:260})}${simpleBars(weeks.map((w,i)=>({label:w.label,value:countSeries[i],sub:'plantas'})))}`)}
    </section>
    ${card('Senescencia por lote','DETALLE',`<div class="chart-table-wrap"><table class="chart-table"><thead><tr><th>Fundo</th><th>Módulo</th><th>Lote</th><th>Plantas</th><th>Prom./planta</th></tr></thead><tbody>${lots.map(row=>`<tr><td>${text(row.farm)}</td><td>${text(row.module)}</td><td>${text(row.lot)}</td><td>${row.count}</td><td>${fmt(row.avg,2)}</td></tr>`).join('')}</tbody></table></div>`)}`;
  }

  function fruitValues(record,measure){
    const values=[];
    for(let index=1;index<=35;index++){
      const value=num(record[`f${index}_${measure}`]);
      if(value!==null) values.push(value);
    }
    return values;
  }

  function biometryView(records){
    const usable=records.filter(r=>fruitValues(r,chartState.measure).length);
    if(!usable.length) return empty('Sin mediciones de biometría','No hay D.L., D.EA o D.EB registrados para estos filtros.');
    const labels={dl:'D.L.',dea:'D.EA',deb:'D.EB'}, weeks=groupByWeek(usable);
    const campaigns=unique(usable.map(campaignOf));
    const campaignSeries=campaigns.map(campaign=>({name:campaign,values:weeks.map(w=>average(w.records.filter(r=>campaignOf(r)===campaign).flatMap(r=>fruitValues(r,chartState.measure))))}));
    const weekAvg=weeks.map(w=>average(w.records.flatMap(r=>fruitValues(r,chartState.measure))));
    const changes=weekAvg.map((value,index)=>index&&value!==null&&weekAvg[index-1]!==null?value-weekAvg[index-1]:null);
    const allValues=usable.flatMap(r=>fruitValues(r,chartState.measure));
    const lots=unique(usable.map(r=>r.lot)).map(lot=>{const subset=usable.filter(r=>r.lot===lot);return {label:lot,value:average(subset.flatMap(r=>fruitValues(r,chartState.measure)))};}).filter(x=>x.value!==null).sort((a,b)=>b.value-a.value).slice(0,15);
    return `<section class="panel chart-control-strip"><label>Medida<select id="chart-measure"><option value="dl" ${chartState.measure==='dl'?'selected':''}>D.L. · Diámetro longitudinal</option><option value="dea" ${chartState.measure==='dea'?'selected':''}>D.EA · Diámetro ecuatorial A</option><option value="deb" ${chartState.measure==='deb'?'selected':''}>D.EB · Diámetro ecuatorial B</option></select></label></section>
    <section class="chart-stats-grid compact">${stat(fmt(average(allValues),2),`${labels[chartState.measure]} promedio`,`${allValues.length} mediciones`)}${stat(fmt(Math.min(...allValues),2),'Mínimo','Valor observado')}${stat(fmt(Math.max(...allValues),2),'Máximo','Valor observado')}${stat(changes.at(-1)===null?'—':`${changes.at(-1)>=0?'+':''}${fmt(changes.at(-1),2)}`,'Cambio semanal','Última semana vs anterior')}</section>
    <section class="charts-two-cols">
      ${card(`${labels[chartState.measure]} promedio por campaña`,'TASA DE CRECIMIENTO',lineChart(weeks.map(w=>w.label),campaignSeries,{height:320}))}
      ${card('Variación frente a la semana anterior','DIFERENCIA SEMANAL',simpleBars(weeks.slice(1).map((w,index)=>({label:w.label,value:Math.abs(changes[index+1]||0),sub:`${(changes[index+1]||0)>=0?'Aumentó':'Disminuyó'} ${fmt(Math.abs(changes[index+1]||0),2)}`}))))}
      ${card(`Ranking de lotes por ${labels[chartState.measure]}`,'PROMEDIO',simpleBars(lots))}
      ${card('Nota metodológica','LECTURA',`<div class="chart-note"><b>Variación del promedio semanal</b><p>La aplicación compara el promedio de todos los frutos medidos en cada semana. No representa el seguimiento del mismo fruto individual.</p></div>`)}
    </section>`;
  }

  function fallTotal(record){
    const values=['caidaF1','caidaF2','caidaF3','caidaF4'].map(key=>num(record[key]));
    return values.some(value=>value!==null) ? values.reduce((total,value)=>total+(value||0),0) : null;
  }

  function fallView(records){
    const fields=['caidaF1','caidaF2','caidaF3','caidaF4','frutaAnillada','frutaDeshidratada','frutosPintones'];
    const usable=records.filter(r=>fields.some(key=>!blank(r[key])));
    if(!usable.length) return empty('Sin datos de caída o condición de fruta');
    const weeks=groupByWeek(usable);
    const series=[
      {name:'Caída total F1–F4',values:weeks.map(w=>average(w.records.map(fallTotal)))},
      {name:'Fruta anillada',values:weeks.map(w=>average(w.records.map(r=>r.frutaAnillada)))},
      {name:'Fruta deshidratada',values:weeks.map(w=>average(w.records.map(r=>r.frutaDeshidratada)))},
      {name:'Frutos pintones',values:weeks.map(w=>average(w.records.map(r=>r.frutosPintones)))}
    ];
    const lots=unique(usable.map(r=>r.lot)).map(lot=>{const subset=usable.filter(r=>r.lot===lot);return {label:lot,value:average(subset.map(fallTotal))};}).filter(x=>x.value!==null).sort((a,b)=>b.value-a.value).slice(0,15);
    const totalAvg=average(usable.map(fallTotal));
    return `<section class="chart-stats-grid compact">${stat(fmt(totalAvg,2),'Caída promedio','F1 + F2 + F3 + F4')}${stat(fmt(average(usable.map(r=>r.frutaAnillada)),2),'Fruta anillada','Promedio/evaluación')}${stat(fmt(average(usable.map(r=>r.frutaDeshidratada)),2),'Deshidratada','Promedio/evaluación')}${stat(fmt(average(usable.map(r=>r.frutosPintones)),2),'Pintones','Promedio/evaluación')}</section>
    <section class="charts-two-cols">
      ${card('Caída y condición por semana','EVOLUCIÓN',lineChart(weeks.map(w=>w.label),series,{height:330}))}
      ${card('Lotes con mayor caída','RANKING',simpleBars(lots))}
    </section>
    <div class="chart-note inline-note"><b>Unidad del eje:</b> se muestra el valor promedio registrado por evaluación. La unidad corresponde a la utilizada durante el registro de campo.</div>`;
  }

  function composition(records,groupKey){
    const groups=unique(records.map(r=>r[groupKey]));
    const keys=[['Vegetativas','yemasVegetativas'],['Florales','yemasFlorales'],['Dudosas','yemasDudosas']];
    const series=keys.map(([name,key])=>({name,values:groups.map(group=>{const subset=records.filter(r=>r[groupKey]===group),total=sum(subset.flatMap(r=>[r.yemasVegetativas,r.yemasFlorales,r.yemasDudosas]));return total?sum(subset.map(r=>r[key]))/total*100:null;})}));
    return {groups,series};
  }

  function quadrantsView(records){
    const usable=records.filter(r=>[r.yemasVegetativas,r.yemasFlorales,r.yemasDudosas].some(v=>!blank(v)));
    if(!usable.length) return empty('Sin datos de yemas por cuadrante');
    const byQuadrant=composition(usable,'quadrant'),byVariety=composition(usable,'variety');
    return `<section class="charts-two-cols single-stack">
      ${card('Composición de yemas por cuadrante','CUADRANTES',groupedBars(byQuadrant.groups,byQuadrant.series,{percent:true}),'wide-chart')}
      ${card('Composición de yemas por variedad','VARIEDADES',groupedBars(byVariety.groups,byVariety.series,{percent:true}),'wide-chart')}
    </section>`;
  }

  function paniclesView(records){
    const fields=['paniculaIndeterminada','paniculaDeterminada','conteoPaniculas','conteoCuajas','paniculasSinCuajar','paniculaBuena','paniculaMedia','paniculaMala'];
    const usable=records.filter(r=>fields.some(key=>!blank(r[key])));
    if(!usable.length) return empty('Sin datos de panículas');
    const weeks=groupByWeek(usable),modules=unique(usable.map(r=>r.module));
    const typeSeries=[
      {name:'Indeterminada',values:weeks.map(w=>{const total=sum(w.records.flatMap(r=>[r.paniculaIndeterminada,r.paniculaDeterminada]));return total?sum(w.records.map(r=>r.paniculaIndeterminada))/total*100:null;})},
      {name:'Determinada',values:weeks.map(w=>{const total=sum(w.records.flatMap(r=>[r.paniculaIndeterminada,r.paniculaDeterminada]));return total?sum(w.records.map(r=>r.paniculaDeterminada))/total*100:null;})}
    ];
    const qualitySeries=[['Buena','paniculaBuena'],['Media','paniculaMedia'],['Mala','paniculaMala']].map(([name,key])=>({name,values:weeks.map(w=>{const total=sum(w.records.flatMap(r=>[r.paniculaBuena,r.paniculaMedia,r.paniculaMala]));return total?sum(w.records.map(r=>r[key]))/total*100:null;})}));
    const cuajas=weeks.map(w=>{const pan=sum(w.records.map(r=>r.conteoPaniculas)),q=sum(w.records.map(r=>r.conteoCuajas));return pan?q/pan:null;});
    const noSet=weeks.map(w=>average(w.records.map(r=>r.paniculasSinCuajar)));
    const rows=modules.map(module=>{const subset=usable.filter(r=>r.module===module),pan=sum(subset.map(r=>r.conteoPaniculas));return {module,ind:sum(subset.map(r=>r.paniculaIndeterminada)),det:sum(subset.map(r=>r.paniculaDeterminada)),good:sum(subset.map(r=>r.paniculaBuena)),medium:sum(subset.map(r=>r.paniculaMedia)),bad:sum(subset.map(r=>r.paniculaMala)),set:pan?sum(subset.map(r=>r.conteoCuajas))/pan:null};});
    return `<section class="charts-two-cols">
      ${card('Tipo de panícula','DETERMINADA VS. INDETERMINADA',lineChart(weeks.map(w=>w.label),typeSeries,{percent:true,maxValue:100}))}
      ${card('Calidad de panículas','BUENA · MEDIA · MALA',lineChart(weeks.map(w=>w.label),qualitySeries,{percent:true,maxValue:100}))}
      ${card('Cuajas por panícula','EFICIENCIA DE CUAJADO',lineChart(weeks.map(w=>w.label),[{name:'Cuajas/panícula',values:cuajas}],{}))}
      ${card('Panículas sin cuajar','EVOLUCIÓN',lineChart(weeks.map(w=>w.label),[{name:'Sin cuajar',values:noSet}],{}))}
    </section>
    ${card('Resumen por módulo','MATRIZ DE PANÍCULAS',`<div class="chart-table-wrap"><table class="chart-table"><thead><tr><th>Módulo</th><th>Indeterminada</th><th>Determinada</th><th>Buena</th><th>Media</th><th>Mala</th><th>Cuajas/panícula</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${text(r.module)}</th><td>${fmt(r.ind,0)}</td><td>${fmt(r.det,0)}</td><td>${fmt(r.good,0)}</td><td>${fmt(r.medium,0)}</td><td>${fmt(r.bad,0)}</td><td>${fmt(r.set,2)}</td></tr>`).join('')}</tbody></table></div>`)}`;
  }

  function budsView(records){
    const usable=records.filter(r=>[r.yemasVegetativas,r.yemasFlorales,r.yemasDudosas].some(v=>!blank(v)));
    if(!usable.length) return empty('Sin datos de evolución de yemas');
    const weeks=groupByWeek(usable),defs=[['Vegetativas','yemasVegetativas'],['Florales','yemasFlorales'],['Dudosas','yemasDudosas']];
    const series=defs.map(([name,key])=>({name,values:weeks.map(w=>{const total=sum(w.records.flatMap(r=>[r.yemasVegetativas,r.yemasFlorales,r.yemasDudosas]));return total?sum(w.records.map(r=>r[key]))/total*100:null;})}));
    const latest=series.map(item=>{const values=item.values,last=values.at(-1),prev=values.length>1?values.at(-2):null;return {name:item.name,last,delta:last!==null&&prev!==null?last-prev:null};});
    const modules=composition(usable,'module');
    return `<section class="chart-stats-grid compact">${latest.map(item=>stat(item.last===null?'—':pct(item.last),`Yemas ${item.name.toLowerCase()}`,item.delta===null?'Sin semana anterior':`${item.delta>=0?'↑':'↓'} ${item.delta>=0?'+':''}${fmt(item.delta,1)} p.p.`,item.delta>0?'positive':item.delta<0?'negative':'' )).join('')}</section>
    <section class="charts-two-cols single-stack">
      ${card('Evolución semanal de yemas','TENDENCIA',lineChart(weeks.map(w=>w.label),series,{percent:true,maxValue:100,height:330}),'wide-chart')}
      ${card('Composición por módulo','COMPARACIÓN',groupedBars(modules.groups,modules.series,{percent:true}),'wide-chart')}
    </section>`;
  }

  function tabContent(records){
    if(chartState.from&&chartState.to&&chartState.from>chartState.to) return empty('Corrige el rango de fechas','La fecha Desde debe ser anterior o igual a Hasta.');
    return ({summary:summaryView,stages:stagesView,sprouts:sproutsView,senescence:senescenceView,biometry:biometryView,fall:fallView,quadrants:quadrantsView,panicles:paniclesView,buds:budsView}[chartState.tab]||summaryView)(records);
  }

  const previousChartsView = chartsView;
  chartsView = function realChartsView(){
    if(!isSupervisor()) return previousChartsView();
    const records=filteredRecords();
    app.innerHTML=shell(`${titleBlock(state.session.role==='Administrador'?'ADMINISTRADOR':'SUPERVISOR','Gráficos con datos reales','Analiza la evolución fenológica y biométrica de la base consolidada.')}${tabs()}${filterPanel()}<div class="charts-result-head"><b>${records.length.toLocaleString('es-PE')} evaluaciones encontradas</b><span>${TABS.find(([id])=>id===chartState.tab)?.[1]||'Resumen'}</span></div><section id="charts-content">${tabContent(records)}</section>`);
  };

  function readFilters(){
    chartState.from=$('#chart-from')?.value||''; chartState.to=$('#chart-to')?.value||'';
    chartState.campaign=$('#chart-campaign')?.value||''; chartState.field=$('#chart-field')?.value||'';
    chartState.farm=$('#chart-farm')?.value||''; chartState.module=$('#chart-module')?.value||'';
    chartState.lot=$('#chart-lot')?.value||''; chartState.variety=$('#chart-variety')?.value||'';
    chartState.quadrant=$('#chart-quadrant')?.value||''; chartState.evaluator=$('#chart-evaluator')?.value||'';
  }

  document.addEventListener('click',event=>{
    if(state.view!=='charts'||!isSupervisor()) return;
    const tab=event.target.closest('[data-chart-tab]')?.dataset.chartTab;
    if(tab){chartState.tab=tab;chartsView();return;}
    if(event.target.closest('#charts-clear')){
      Object.assign(chartState,{from:'',to:'',campaign:'',field:'',farm:'',module:'',lot:'',variety:'',quadrant:'',evaluator:''});
      chartsView();
    }
  });

  document.addEventListener('change',event=>{
    if(state.view!=='charts'||!isSupervisor()) return;
    if(event.target.id==='chart-tab-select'){chartState.tab=event.target.value;chartsView();return;}
    if(event.target.id==='chart-stage'){chartState.stage=event.target.value;chartsView();return;}
    if(event.target.id==='chart-measure'){chartState.measure=event.target.value;chartsView();return;}
    if(!event.target.id.startsWith('chart-')) return;
    readFilters();
    if(event.target.id==='chart-field'){chartState.farm='';chartState.module='';chartState.lot='';}
    if(event.target.id==='chart-farm'){chartState.module='';chartState.lot='';}
    if(event.target.id==='chart-module') chartState.lot='';
    chartsView();
  });

  if(typeof state!=='undefined'&&state.catalog&&state.view==='charts') chartsView();
})();
