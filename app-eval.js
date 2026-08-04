function evaluateView(){
  const fields = Object.keys(state.catalog.lotesAgrupados);
  app.innerHTML = shell(`${titleBlock('EVALUADOR','Registro de evaluación','Completa la ubicación y abre únicamente las secciones que necesitas evaluar.',`<span class="step-badge">Planta <b id="plant-preview">1</b></span>`)}
    <form id="evaluation-form">
      <section class="panel form-panel"><div class="section-title"><span>1</span><div><h2>Datos generales</h2><p>Identifica correctamente el punto de evaluación.</p></div></div>
        <div class="form-grid">
          <label>Fecha<input name="date" type="date" value="${today()}" required></label>
          <label>Campaña<input name="campaign" value="2026-2027" required></label>
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
          ${accordion('Estadios fenológicos','Conteo de estadios E01 a E17', stages.map(s=>numberField(s,s)).join(''),'open')}
          ${accordion('Evolución de yemas','Vegetativas, florales y dudosas',numberField('Yemas vegetativas','yemasVegetativas')+numberField('Yemas florales','yemasFlorales')+numberField('Yemas dudosas','yemasDudosas'))}
          ${accordion('Senescencia y brotamiento','Estado vegetativo de la planta',numberField('Senescencia','senescencia')+numberField('Brote E1 rojo','broteRojo')+numberField('Brote E2 verde pálido','brotePalido')+numberField('Brote E3 verde oscuro','broteOscuro'))}
          ${accordion('Floración, cuaja y panícula','Conteos de floración y calidad',numberField('Panícula indeterminada','paniculaIndeterminada')+numberField('Panícula determinada','paniculaDeterminada')+numberField('Conteo de panículas','conteoPaniculas')+numberField('Conteo cuajas/panícula','conteoCuajas')+numberField('Panícula buena','paniculaBuena')+numberField('Panícula media','paniculaMedia')+numberField('Panícula mala','paniculaMala'))}
          ${accordion('Biometría de fruto','35 frutos: D.L, D.EA y D.EB',biometryGrid())}
          ${accordion('Caída y condición de fruta','Conteos complementarios',numberField('Caída F1','caidaF1')+numberField('Caída F2','caidaF2')+numberField('Caída F3','caidaF3')+numberField('Caída F4','caidaF4')+numberField('Fruta anillada','frutaAnillada')+numberField('Fruta deshidratada','frutaDeshidratada')+numberField('Frutos pintones','frutosPintones'))}
        </div>
      </section>
      <div class="form-actions"><button type="button" class="secondary" data-view="home">Cancelar</button><button class="primary">${icons.check} Guardar evaluación</button></div>
    </form>`);
  bindEvaluationSelectors();
}
function accordion(title,text,body,open=''){ return `<details ${open}><summary><div><b>${title}</b><small>${text}</small></div><span>⌄</span></summary><div class="accordion-body numeric-grid">${body}</div></details>`; }
function numberField(label,name){ return `<label>${label}<input type="number" name="${name}" min="0" step="1" inputmode="numeric" placeholder="0"></label>`; }
function biometryGrid(){ return Array.from({length:35},(_,i)=>`<fieldset><legend>Fruto ${i+1}</legend>${numberField('D.L',`f${i+1}_dl`)}${numberField('D.EA',`f${i+1}_dea`)}${numberField('D.EB',`f${i+1}_deb`)}</fieldset>`).join(''); }
function bindEvaluationSelectors(){
  const f=$('#evaluation-form'); if(!f) return;
  const fill=(select,list)=>{select.innerHTML=options(list); select.disabled=!list.length;};
  f.field.onchange=()=>{fill(f.farm,Object.keys(state.catalog.lotesAgrupados[f.field.value]||{}));fill(f.module,[]);fill(f.lot,[]);fill(f.variety,[]);};
  f.farm.onchange=()=>{fill(f.module,Object.keys(state.catalog.lotesAgrupados[f.field.value]?.[f.farm.value]||{}));fill(f.lot,[]);fill(f.variety,[]);};
  f.module.onchange=()=>{fill(f.lot,state.catalog.lotesAgrupados[f.field.value]?.[f.farm.value]?.[f.module.value]||[]);fill(f.variety,[]);};
  f.lot.onchange=()=>{fill(f.variety,state.assignments[f.lot.value]||state.catalog.variedadesPorCampo[f.field.value]||[]);updatePlant(f);};
  ['date','variety','quadrant'].forEach(n=>f[n].addEventListener('change',()=>updatePlant(f)));
}
function updatePlant(f){ const n=1+state.records.filter(r=>r.date===f.date.value&&r.evaluatorId===state.session.id&&r.lot===f.lot.value&&r.variety===f.variety.value&&r.quadrant===f.quadrant.value).length; $('#plant-preview').textContent=n; }
function saveEvaluation(form){
  const data=Object.fromEntries(new FormData(form));
  const plant=1+state.records.filter(r=>r.date===data.date&&r.evaluatorId===state.session.id&&r.lot===data.lot&&r.variety===data.variety&&r.quadrant===data.quadrant).length;
  state.records.push({...data,id:`EV-${Date.now()}`,plant,evaluatorId:state.session.id,evaluator:state.session.name,createdAt:new Date().toISOString()}); save(); showToast(`Evaluación guardada · Planta ${plant}`); state.view='records'; render();
}

function recordsView(){
  app.innerHTML=shell(`${titleBlock('CONSULTA','Detalle de evaluaciones','Revisa los registros guardados en este dispositivo.',`<button class="primary" data-view="evaluate">+ Nueva evaluación</button>`)}
    <section class="panel"><div class="filters"><label>Buscar<input id="record-search" placeholder="Lote, fundo o variedad"></label><label>Fecha<input id="record-date" type="date"></label><div class="filter-total"><b>${state.records.length}</b><span>registros</span></div></div><div id="records-container">${recordTable(state.records)}</div></section>`);
}
function recordTable(list){
  if(!list.length) return `<div class="empty"><span>${icons.detail}</span><b>Sin registros</b><p>No hay evaluaciones que coincidan con los filtros.</p></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Ubicación</th><th>Variedad</th><th>Cuadrante</th><th>Planta</th><th>Evaluador</th></tr></thead><tbody>${list.slice().reverse().map(r=>`<tr data-record="${r.id}"><td>${esc(r.date)}</td><td><b>${esc(r.lot)}</b><small>${esc(r.field)} · ${esc(r.farm)}</small></td><td>${esc(r.variety)}</td><td><span class="tag">${esc(r.quadrant)}</span></td><td>${esc(r.plant)}</td><td>${esc(r.evaluator)}</td></tr>`).join('')}</tbody></table></div>`;
}

function exportView(){
  app.innerHTML=shell(`${titleBlock('GESTIÓN DE DATOS','Exportar, importar y limpiar','Protege la información antes de liberar el almacenamiento del dispositivo.')}
    <section class="export-grid">
      ${exportCard('export-csv',icons.file,'Exportar Fenología','Genera un archivo CSV compatible con Excel.','44 columnas','green')}
      ${exportCard('export-bio',icons.chart,'Exportar Biometría','Incluye las mediciones de los 35 frutos.','124 columnas','blue')}
      ${exportCard('backup',icons.shield,'Crear respaldo','Descarga todos los registros y configuraciones.','Archivo JSON','amber')}
      ${exportCard('import',icons.sync,'Importar respaldo','Recupera evaluaciones previamente exportadas.','Próximamente','gray')}
    </section>
    <section class="panel danger-zone"><div><span>ZONA PROTEGIDA</span><h2>Limpiar datos locales</h2><p>Solo debe hacerse después de descargar un respaldo. Esta acción elimina los registros del dispositivo.</p></div><button class="danger" id="clear-records">Limpiar datos</button></section>`);
}
function exportCard(id,icon,title,text,tag,tone){ return `<button class="export-card ${tone}" id="${id}"><span>${icon}</span><div><b>${title}</b><p>${text}</p><em>${tag}</em></div><i>→</i></button>`; }
function downloadFile(name,content,type){ const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href); }
function exportCsv(){ const h=['ID','FECHA','CAMPAÑA','CAMPO','FUNDO','MODULO','LOTE','VARIEDAD','CUADRANTE','PLANTA','EVALUADOR'];const rows=state.records.map(r=>[r.id,r.date,r.campaign,r.field,r.farm,r.module,r.lot,r.variety,r.quadrant,r.plant,r.evaluator]);downloadFile('fenologia.csv','\ufeff'+[h,...rows].map(x=>x.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv;charset=utf-8');showToast('Archivo de Fenología generado.'); }
