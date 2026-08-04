const FENO_HEADERS = [
  'ID DATA','FECHA','SEMANA','MES','AÑO','CAMPO','FUNDO','MODULO','TURNO-LOTE','CUADRANTE','VARIEDAD','# PLANTA',
  'YEMAS (E01)','YEMAS (E02)','YEMAS (E03)','YEMAS (E04)','YEMAS (E05)','YEMAS (E06)','YEMAS (E07)','YEMAS (E08)','YEMAS (E09)',
  'PANICULA CERRADA (E10)','PANICULA ABIERTA (E11)','PANICULAS CUAJADAS (E12)','TAMAÑO ACEITUNA (E13)','FRUTO 1 (E14)','FRUTO 2 (E15)','FRUTO 3 (E16)','FRUTO 4 (E17)',
  'YEMAS VEGETATIVAS','YEMAS FLORALES','YEMAS DUDOSAS','SENESCENCIA','BROTE (E1 ROJO)','BROTE (E2 VERDE PALIDO)','BROTE (E3 VERDE OSCURO)',
  'PANICULA INDETERMINADA','PANICULA DETERMINADA','CONTEO DE PANICULAS','CONTEO DE CUAJAS/PANICULAS','PANICULAS SIN CUAJAR','PANICULA BUENA','PANICULA MEDIA','PANICULA MALA'
];
const BIO_HEADERS = [
  'ID DATA','FECHA','SEMANA','MES','AÑO','CAMPO','FUNDO','MODULO','TURNO-LOTE','CUADRANTE','VARIEDAD','# PLANTA',
  ...Array.from({length:35},(_,i)=>[`B.F.${String(i+1).padStart(2,'0')} (D.L)`,`B.F.${String(i+1).padStart(2,'0')} (D.EA)`,`B.F.${String(i+1).padStart(2,'0')} (D.EB)`]).flat(),
  'CAIDA DE FRUTA (F1)','CAIDA DE FRUTA (F2)','CAIDA DE FRUTA (F3)','CAIDA DE FRUTA (F4)','FRUTA ANILLADA','FRUTA DESIDRATADA','FRUTOS PINTONES'
];

function evaluateView(){
  const editing = state.editingId ? state.records.find(r=>r.id===state.editingId) : null;
  const fields = Object.keys(state.catalog.lotesAgrupados);
  app.innerHTML = shell(`${titleBlock('EVALUADOR',editing?'Editar evaluación':'Registro de evaluación',editing?'Corrige la información del registro seleccionado. El ID y el número de planta se conservan.':'Completa la ubicación y abre únicamente las secciones que necesitas evaluar.',`<span class="step-badge">Planta <b id="plant-preview">${editing?.plant||1}</b></span>`)}
    <form id="evaluation-form">
      <section class="panel form-panel"><div class="section-title"><span>1</span><div><h2>Datos generales</h2><p>Identifica correctamente el punto de evaluación.</p></div></div>
        <div class="form-grid">
          <label>Fecha<input name="date" type="date" value="${esc(editing?.date||today())}" required></label>
          <label>Campaña<input name="campaign" value="${esc(editing?.campaign||'2026-2027')}" required></label>
          <label>Campo<select name="field" required>${options(fields)}</select></label>
          <label>Fundo<select name="farm" disabled required>${options([])}</select></label>
          <label>Módulo<select name="module" disabled required>${options([])}</select></label>
          <label>Turno - Lote<select name="lot" disabled required>${options([])}</select></label>
          <label>Variedad<select name="variety" disabled required>${options([])}</select></label>
          <label>Cuadrante<select name="quadrant" required>${options(state.catalog.cuadrantes)}</select></label>
        </div>
      </section>
      <section class="panel form-panel"><div class="section-title"><span>2</span><div><h2>Variables de evaluación</h2><p>Ingresa únicamente números enteros. El valor cero significa “evaluado sin presencia”.</p></div></div>
        <div class="accordions">
          ${accordion('Estadios fenológicos','Conteo de estadios E01 a E17', stages.map(s=>numberField(s,s,editing?.[s])).join(''),'open')}
          ${accordion('Evolución de yemas','Vegetativas, florales y dudosas',numberField('Yemas vegetativas','yemasVegetativas',editing?.yemasVegetativas)+numberField('Yemas florales','yemasFlorales',editing?.yemasFlorales)+numberField('Yemas dudosas','yemasDudosas',editing?.yemasDudosas))}
          ${accordion('Senescencia y brotamiento','Estado vegetativo de la planta',numberField('Senescencia','senescencia',editing?.senescencia)+numberField('Brote E1 rojo','broteRojo',editing?.broteRojo)+numberField('Brote E2 verde pálido','brotePalido',editing?.brotePalido)+numberField('Brote E3 verde oscuro','broteOscuro',editing?.broteOscuro))}
          ${accordion('Floración, cuaja y panícula','Conteos de floración y calidad',numberField('Panícula indeterminada','paniculaIndeterminada',editing?.paniculaIndeterminada)+numberField('Panícula determinada','paniculaDeterminada',editing?.paniculaDeterminada)+numberField('Conteo de panículas','conteoPaniculas',editing?.conteoPaniculas)+numberField('Conteo cuajas/panícula','conteoCuajas',editing?.conteoCuajas)+numberField('Panículas sin cuajar','paniculasSinCuajar',editing?.paniculasSinCuajar)+numberField('Panícula buena','paniculaBuena',editing?.paniculaBuena)+numberField('Panícula media','paniculaMedia',editing?.paniculaMedia)+numberField('Panícula mala','paniculaMala',editing?.paniculaMala))}
          ${accordion('Biometría de fruto','35 frutos: D.L, D.EA y D.EB',biometryGrid(editing))}
          ${accordion('Caída y condición de fruta','Conteos complementarios',numberField('Caída F1','caidaF1',editing?.caidaF1)+numberField('Caída F2','caidaF2',editing?.caidaF2)+numberField('Caída F3','caidaF3',editing?.caidaF3)+numberField('Caída F4','caidaF4',editing?.caidaF4)+numberField('Fruta anillada','frutaAnillada',editing?.frutaAnillada)+numberField('Fruta deshidratada','frutaDeshidratada',editing?.frutaDeshidratada)+numberField('Frutos pintones','frutosPintones',editing?.frutosPintones))}
        </div>
      </section>
      <div class="form-actions"><button type="button" class="secondary" id="cancel-evaluation">Cancelar</button><button class="primary">${icons.check} ${editing?'Guardar cambios':'Guardar evaluación'}</button></div>
    </form>`);
  bindEvaluationSelectors(editing);
}
function accordion(title,text,body,open=''){ return `<details ${open}><summary><div><b>${title}</b><small>${text}</small></div><span>⌄</span></summary><div class="accordion-body numeric-grid">${body}</div></details>`; }
function numberField(label,name,value=''){ const shown=value===0?'0':(value??''); return `<label>${label}<input type="number" name="${name}" min="0" step="1" inputmode="numeric" placeholder="0" value="${esc(shown)}"></label>`; }
function biometryGrid(record){ return Array.from({length:35},(_,i)=>`<fieldset><legend>Fruto ${i+1}</legend>${numberField('D.L',`f${i+1}_dl`,record?.[`f${i+1}_dl`])}${numberField('D.EA',`f${i+1}_dea`,record?.[`f${i+1}_dea`])}${numberField('D.EB',`f${i+1}_deb`,record?.[`f${i+1}_deb`])}</fieldset>`).join(''); }
function fillSelect(select,list,value=''){ select.innerHTML=options(list); select.disabled=!list.length; if(value) select.value=value; }
function bindEvaluationSelectors(editing){
  const f=$('#evaluation-form'); if(!f) return;
  f.field.onchange=()=>{fillSelect(f.farm,Object.keys(state.catalog.lotesAgrupados[f.field.value]||{}));fillSelect(f.module,[]);fillSelect(f.lot,[]);fillSelect(f.variety,[]);};
  f.farm.onchange=()=>{fillSelect(f.module,Object.keys(state.catalog.lotesAgrupados[f.field.value]?.[f.farm.value]||{}));fillSelect(f.lot,[]);fillSelect(f.variety,[]);};
  f.module.onchange=()=>{fillSelect(f.lot,state.catalog.lotesAgrupados[f.field.value]?.[f.farm.value]?.[f.module.value]||[]);fillSelect(f.variety,[]);};
  f.lot.onchange=()=>{fillSelect(f.variety,state.assignments[f.lot.value]||state.catalog.variedadesPorCampo[f.field.value]||[]);updatePlant(f);};
  ['date','variety','quadrant'].forEach(n=>f[n].addEventListener('change',()=>updatePlant(f)));
  if(editing){
    f.field.value=editing.field;
    fillSelect(f.farm,Object.keys(state.catalog.lotesAgrupados[editing.field]||{}),editing.farm);
    fillSelect(f.module,Object.keys(state.catalog.lotesAgrupados[editing.field]?.[editing.farm]||{}),editing.module);
    fillSelect(f.lot,state.catalog.lotesAgrupados[editing.field]?.[editing.farm]?.[editing.module]||[],editing.lot);
    fillSelect(f.variety,state.assignments[editing.lot]||state.catalog.variedadesPorCampo[editing.field]||[],editing.variety);
    f.quadrant.value=editing.quadrant;
  }
}
function updatePlant(f){
  if(state.editingId){ $('#plant-preview').textContent=state.records.find(r=>r.id===state.editingId)?.plant||1; return; }
  const n=1+state.records.filter(r=>r.date===f.date.value&&r.evaluatorId===state.session.id&&r.lot===f.lot.value&&r.variety===f.variety.value&&r.quadrant===f.quadrant.value).length;
  $('#plant-preview').textContent=n;
}
function normalizeIntegerFields(data){
  Object.keys(data).forEach(key=>{
    if(['date','campaign','field','farm','module','lot','variety','quadrant'].includes(key)) return;
    data[key]=data[key]===''?'':Math.max(0,Math.trunc(Number(data[key])));
  });
  return data;
}
function saveEvaluation(form){
  const data=normalizeIntegerFields(Object.fromEntries(new FormData(form)));
  if(state.editingId){
    const index=state.records.findIndex(r=>r.id===state.editingId);
    if(index<0) return showToast('No se encontró el registro.');
    const previous=state.records[index];
    state.records[index]={...previous,...data,updatedAt:new Date().toISOString()};
    state.selectedRecordId=previous.id;
    state.editingId=null;
    save(); showToast('Evaluación actualizada.'); state.view='record-detail'; render(); return;
  }
  const plant=1+state.records.filter(r=>r.date===data.date&&r.evaluatorId===state.session.id&&r.lot===data.lot&&r.variety===data.variety&&r.quadrant===data.quadrant).length;
  const record={...data,id:`EV-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,plant,evaluatorId:state.session.id,evaluator:state.session.name,createdAt:new Date().toISOString()};
  state.records.push(record); state.selectedRecordId=record.id; save(); showToast(`Evaluación guardada · Planta ${plant}`); state.view='record-detail'; render();
}

function recordsView(){
  app.innerHTML=shell(`${titleBlock('CONSULTA','Detalle de evaluaciones','Revisa los registros guardados en este dispositivo.',`<button class="primary" data-view="evaluate">+ Nueva evaluación</button>`)}
    <section class="panel"><div class="filters"><label>Buscar<input id="record-search" placeholder="Lote, fundo o variedad"></label><label>Fecha<input id="record-date" type="date"></label><div class="filter-total"><b>${state.records.length}</b><span>registros</span></div></div><div id="records-container">${recordTable(state.records)}</div></section>`);
}
function recordTable(list){
  if(!list.length) return `<div class="empty"><span>${icons.detail}</span><b>Sin registros</b><p>No hay evaluaciones que coincidan con los filtros.</p></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Ubicación</th><th>Variedad</th><th>Cuadrante</th><th>Planta</th><th>Evaluador</th><th></th></tr></thead><tbody>${list.slice().reverse().map(r=>`<tr data-record="${r.id}" class="clickable-row"><td>${esc(r.date)}</td><td><b>${esc(r.lot)}</b><small>${esc(r.field)} · ${esc(r.farm)}</small></td><td>${esc(r.variety)}</td><td><span class="tag">${esc(r.quadrant)}</span></td><td>${esc(r.plant)}</td><td>${esc(r.evaluator)}</td><td>→</td></tr>`).join('')}</tbody></table></div>`;
}
function recordDetailView(){
  const r=state.records.find(x=>x.id===state.selectedRecordId);
  if(!r){state.view='records';return recordsView();}
  const stageItems=stages.map(s=>detailItem(stageLabel(s),r[s])).join('');
  const phenologyItems=[
    ['Yemas vegetativas',r.yemasVegetativas],['Yemas florales',r.yemasFlorales],['Yemas dudosas',r.yemasDudosas],['Senescencia',r.senescencia],
    ['Brote E1 rojo',r.broteRojo],['Brote E2 verde pálido',r.brotePalido],['Brote E3 verde oscuro',r.broteOscuro],['Panícula indeterminada',r.paniculaIndeterminada],
    ['Panícula determinada',r.paniculaDeterminada],['Conteo de panículas',r.conteoPaniculas],['Conteo cuajas/panícula',r.conteoCuajas],['Panículas sin cuajar',r.paniculasSinCuajar],
    ['Panícula buena',r.paniculaBuena],['Panícula media',r.paniculaMedia],['Panícula mala',r.paniculaMala]
  ].map(([a,b])=>detailItem(a,b)).join('');
  const fruitRows=Array.from({length:35},(_,i)=>{const n=i+1;return `<tr><td>${n}</td><td>${displayValue(r[`f${n}_dl`])}</td><td>${displayValue(r[`f${n}_dea`])}</td><td>${displayValue(r[`f${n}_deb`])}</td></tr>`}).join('');
  const conditionItems=[['Caída F1',r.caidaF1],['Caída F2',r.caidaF2],['Caída F3',r.caidaF3],['Caída F4',r.caidaF4],['Fruta anillada',r.frutaAnillada],['Fruta deshidratada',r.frutaDeshidratada],['Frutos pintones',r.frutosPintones]].map(([a,b])=>detailItem(a,b)).join('');
  app.innerHTML=shell(`${titleBlock('DETALLE DE EVALUACIÓN',`Planta ${esc(r.plant)} · ${esc(r.lot)}`,`ID ${esc(r.id)}`,`<div class="detail-actions"><button class="secondary" data-view="records">← Volver</button><button class="primary" id="edit-record">Editar registro</button></div>`)}
    <section class="detail-summary panel">
      ${summaryItem('Fecha',r.date)}${summaryItem('Campaña',r.campaign)}${summaryItem('Campo',r.field)}${summaryItem('Fundo',r.farm)}${summaryItem('Módulo',r.module)}${summaryItem('Turno-Lote',r.lot)}${summaryItem('Variedad',r.variety)}${summaryItem('Cuadrante',r.quadrant)}${summaryItem('Evaluador',r.evaluator)}
    </section>
    <section class="panel"><div class="panel-head"><div><span>FENOLOGÍA</span><h2>Estadios E01–E17</h2></div></div><div class="detail-grid">${stageItems}</div></section>
    <section class="panel"><div class="panel-head"><div><span>VARIABLES COMPLEMENTARIAS</span><h2>Yemas, brotamiento y panícula</h2></div></div><div class="detail-grid">${phenologyItems}</div></section>
    <section class="panel"><div class="panel-head"><div><span>BIOMETRÍA</span><h2>35 frutos evaluados</h2></div></div><div class="table-wrap compact"><table><thead><tr><th>Fruto</th><th>D.L</th><th>D.EA</th><th>D.EB</th></tr></thead><tbody>${fruitRows}</tbody></table></div></section>
    <section class="panel"><div class="panel-head"><div><span>CONDICIÓN DE FRUTA</span><h2>Caída y observaciones cuantitativas</h2></div></div><div class="detail-grid">${conditionItems}</div></section>`);
}
function stageLabel(s){ const labels={E10:'Panícula cerrada',E11:'Panícula abierta',E12:'Panículas cuajadas',E13:'Tamaño aceituna',E14:'Fruto 1',E15:'Fruto 2',E16:'Fruto 3',E17:'Fruto 4'}; return labels[s]?`${labels[s]} (${s})`:`Yemas (${s})`; }
function displayValue(v){ return v===0?'0':(v===''||v===undefined||v===null?'—':esc(v)); }
function detailItem(label,value){ return `<div class="detail-item"><span>${esc(label)}</span><b>${displayValue(value)}</b></div>`; }
function summaryItem(label,value){ return `<div><span>${esc(label)}</span><b>${displayValue(value)}</b></div>`; }

function exportView(){
  const lastBackup=localStorage.getItem('fenologia-last-backup');
  app.innerHTML=shell(`${titleBlock('GESTIÓN DE DATOS','Exportar, importar y limpiar','Protege la información antes de liberar el almacenamiento del dispositivo.')}
    <section class="export-grid">
      ${exportCard('export-csv',icons.file,'Exportar Fenología','Genera las 44 columnas definidas en el Excel original.','44 columnas','green')}
      ${exportCard('export-bio',icons.chart,'Exportar Biometría','Incluye las mediciones de los 35 frutos y condición de fruta.','124 columnas','blue')}
      ${exportCard('backup',icons.shield,'Crear respaldo','Descarga registros y asignaciones para recuperar el dispositivo.','Archivo JSON','amber')}
      ${exportCard('import-backup',icons.sync,'Importar respaldo','Recupera y combina evaluaciones previamente respaldadas.','Habilitado','green')}
      <input id="backup-file" type="file" accept="application/json,.json" hidden>
    </section>
    <section class="panel backup-status"><div><span>ÚLTIMO RESPALDO</span><h2>${lastBackup?new Date(lastBackup).toLocaleString('es-PE'):'Aún no se ha creado un respaldo'}</h2><p>${state.records.length} registros disponibles en este dispositivo.</p></div><span class="backup-badge ${lastBackup?'ok':'pending'}">${lastBackup?'Protección activa':'Respaldo pendiente'}</span></section>
    <section class="panel danger-zone"><div><span>ZONA PROTEGIDA</span><h2>Limpiar datos locales</h2><p>La limpieza solo se habilita cuando el último respaldo es posterior al registro más reciente.</p></div><button class="danger" id="clear-records">Limpiar datos</button></section>`);
}
function exportCard(id,icon,title,text,tag,tone){ return `<button class="export-card ${tone}" id="${id}"><span>${icon}</span><div><b>${title}</b><p>${text}</p><em>${tag}</em></div><i>→</i></button>`; }
function downloadFile(name,content,type){ const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500); }
function isoWeek(dateText){ const d=new Date(`${dateText}T12:00:00`); const target=new Date(d.valueOf()); const day=(d.getDay()+6)%7; target.setDate(target.getDate()-day+3); const firstThursday=new Date(target.getFullYear(),0,4); const firstDay=(firstThursday.getDay()+6)%7; firstThursday.setDate(firstThursday.getDate()-firstDay+3); return 1+Math.round((target-firstThursday)/604800000); }
function dateParts(r){ const d=new Date(`${r.date}T12:00:00`); return [r.id,r.date,isoWeek(r.date),d.getMonth()+1,d.getFullYear(),r.field,r.farm,r.module,r.lot,r.quadrant,r.variety,r.plant]; }
function fenologyRow(r){ return [...dateParts(r),...stages.map(s=>r[s]??''),r.yemasVegetativas??'',r.yemasFlorales??'',r.yemasDudosas??'',r.senescencia??'',r.broteRojo??'',r.brotePalido??'',r.broteOscuro??'',r.paniculaIndeterminada??'',r.paniculaDeterminada??'',r.conteoPaniculas??'',r.conteoCuajas??'',r.paniculasSinCuajar??'',r.paniculaBuena??'',r.paniculaMedia??'',r.paniculaMala??'']; }
function biometryRow(r){ const measurements=Array.from({length:35},(_,i)=>[r[`f${i+1}_dl`]??'',r[`f${i+1}_dea`]??'',r[`f${i+1}_deb`]??'']).flat(); return [...dateParts(r),...measurements,r.caidaF1??'',r.caidaF2??'',r.caidaF3??'',r.caidaF4??'',r.frutaAnillada??'',r.frutaDeshidratada??'',r.frutosPintones??'']; }
function csvCell(value){ return `"${String(value??'').replaceAll('"','""')}"`; }
function exportExact(type){
  const headers=type==='fenologia'?FENO_HEADERS:BIO_HEADERS;
  const rows=state.records.map(type==='fenologia'?fenologyRow:biometryRow);
  if(rows.some(r=>r.length!==headers.length)) return showToast('No se pudo validar la estructura de exportación.');
  const csv='\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n');
  const stamp=today().replaceAll('-','');
  downloadFile(`${type==='fenologia'?'FENOLOGIA':'BIOMETRIA'}_${stamp}.csv`,csv,'text/csv;charset=utf-8');
  showToast(`${headers.length} columnas exportadas correctamente.`);
}
function createBackup(){
  const payload={version:1,createdAt:new Date().toISOString(),records:state.records,assignments:state.assignments};
  downloadFile(`RESPALDO_FENOLOGIA_${today().replaceAll('-','')}.json`,JSON.stringify(payload,null,2),'application/json');
  localStorage.setItem('fenologia-last-backup',payload.createdAt);
  showToast('Respaldo creado y protección activada.');
  exportView();
}
async function importBackup(file){
  try{
    const payload=JSON.parse(await file.text());
    if(!payload||!Array.isArray(payload.records)||typeof payload.assignments!=='object') throw new Error('El archivo no tiene la estructura de respaldo válida.');
    const existing=new Map(state.records.map(r=>[r.id,r])); let added=0,updated=0,unchanged=0;
    payload.records.forEach(incoming=>{
      if(!incoming?.id) return;
      const current=existing.get(incoming.id);
      if(!current){existing.set(incoming.id,incoming);added++;return;}
      const currentTime=new Date(current.updatedAt||current.createdAt||0).getTime();
      const incomingTime=new Date(incoming.updatedAt||incoming.createdAt||0).getTime();
      if(incomingTime>currentTime){existing.set(incoming.id,incoming);updated++;}else unchanged++;
    });
    state.records=[...existing.values()];
    state.assignments={...state.assignments,...payload.assignments};
    save(); showToast(`Importación: ${added} nuevos, ${updated} actualizados, ${unchanged} existentes.`); exportView();
  }catch(error){showToast(error.message||'No se pudo importar el respaldo.');}
}
function canClearRecords(){
  if(!state.records.length) return {ok:false,message:'No hay registros para limpiar.'};
  const backup=localStorage.getItem('fenologia-last-backup');
  if(!backup) return {ok:false,message:'Primero debes crear un respaldo.'};
  const newest=Math.max(...state.records.map(r=>new Date(r.updatedAt||r.createdAt||0).getTime()));
  if(new Date(backup).getTime()<newest) return {ok:false,message:'Hay cambios posteriores al último respaldo. Crea uno nuevo.'};
  return {ok:true};
}
