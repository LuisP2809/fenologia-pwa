function consolidateView(){ app.innerHTML=shell(`${titleBlock('SUPERVISOR','Consolidar evaluaciones','Carga los archivos enviados por los evaluadores y valida los registros antes de consolidar.')}
  <section class="panel upload-panel"><div class="upload-icon">${icons.sync}</div><h2>Arrastra aquí los archivos Excel</h2><p>También puedes seleccionar varios archivos a la vez.</p><button class="primary">Seleccionar archivos</button><small>Formatos admitidos: XLSX, XLS y CSV</small></section>
  <section class="metrics-grid three">${metric(5,'Archivos cargados',icons.file)}${metric(4,'Correctos',icons.check)}${metric(1,'Observado',icons.alert)}</section>`); }
function mapView(){ app.innerHTML=shell(`${titleBlock('SUPERVISOR','Mapa de evaluaciones','Visualiza rápidamente qué lotes fueron evaluados hoy.')}
  <section class="panel map-panel"><div class="map-toolbar"><span><i class="legend gray"></i> Sin evaluar</span><span><i class="legend green"></i> Evaluado</span><select><option>Hoy</option></select></div><div class="fake-map">${Array.from({length:28},(_,i)=>`<div class="plot ${i%4===0||i%7===0?'done':''}"><b>M${String(7+(i%8)).padStart(2,'0')}</b><small>T${String(i+1).padStart(2,'0')}</small></div>`).join('')}</div></section>`); }
function chartsView(){ app.innerHTML=shell(`${titleBlock('SUPERVISOR','Resumen gráfico','Indicadores de avance para la jornada seleccionada.')}
  <section class="metrics-grid three">${metric(countToday(),'Evaluaciones',icons.clipboard)}${metric(lotsToday(),'Lotes',icons.map)}${metric(new Set(state.records.map(r=>r.evaluator)).size,'Evaluadores',icons.users)}</section>
  <section class="two-cols"><article class="panel"><div class="panel-head"><div><span>POR CAMPO</span><h2>Avance de evaluación</h2></div></div><div class="bars">${bar('Olmos',76)}${bar('Motupe',54)}</div></article><article class="panel"><div class="panel-head"><div><span>POR VARIEDAD</span><h2>Distribución de registros</h2></div></div><div class="donut"><div>68%</div></div><div class="donut-legend"><span><i></i>Hass</span><span><i></i>Otras variedades</span></div></article></section>`); }
function bar(name,value){ return `<div class="bar"><div><span>${name}</span><b>${value}%</b></div><i><em style="width:${value}%"></em></i></div>`; }

function usersView(){ app.innerHTML=shell(`${titleBlock('ADMINISTRADOR','Usuarios y roles','Gestiona responsables, permisos y estados de acceso.',`<button class="primary">+ Nuevo usuario</button>`)}<section class="panel">${users.map(u=>`<div class="user-row"><span>${u.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span><div><b>${u.name}</b><small>${u.id} · DNI protegido</small></div><em>${u.role}</em><i>Activo</i><button>•••</button></div>`).join('')}</section>`); }
function catalogsView(){
  const fields=Object.keys(state.catalog.lotesAgrupados);
  app.innerHTML=shell(`${titleBlock('ADMINISTRADOR','Catálogos y variedades','Asigna variedades a cada lote sin modificar el código de la aplicación.')}
    <section class="panel"><div class="section-title"><span>${icons.settings}</span><div><h2>Asignación de variedades por lote</h2><p>Los cambios se guardan localmente y conservan el historial de evaluaciones.</p></div></div>
      <form id="assignment-form" class="form-grid"><label>Campo<select name="field">${options(fields)}</select></label><label>Fundo<select name="farm" disabled>${options([])}</select></label><label>Módulo<select name="module" disabled>${options([])}</select></label><label>Lote<select name="lot" disabled>${options([])}</select></label><div class="variety-checks" id="variety-checks"><p>Selecciona un lote para ver sus variedades.</p></div><button class="primary" type="button" id="save-assignment">Guardar asignación</button></form>
    </section>`); bindAssignments();
}
function bindAssignments(){ const f=$('#assignment-form'); const fill=(s,l)=>{s.innerHTML=options(l);s.disabled=!l.length;};f.field.onchange=()=>{fill(f.farm,Object.keys(state.catalog.lotesAgrupados[f.field.value]||{}));fill(f.module,[]);fill(f.lot,[])};f.farm.onchange=()=>fill(f.module,Object.keys(state.catalog.lotesAgrupados[f.field.value]?.[f.farm.value]||{}));f.module.onchange=()=>fill(f.lot,state.catalog.lotesAgrupados[f.field.value]?.[f.farm.value]?.[f.module.value]||[]);f.lot.onchange=()=>{const list=state.catalog.variedadesPorCampo[f.field.value]||[];const selected=new Set(state.assignments[f.lot.value]||list);$('#variety-checks').innerHTML=list.map(v=>`<label><input type="checkbox" value="${v}" ${selected.has(v)?'checked':''}><span>${v}</span></label>`).join('')}; }

function render(){
  if(!state.session) return loginView();
  const views={home:homeView,evaluate:evaluateView,records:recordsView,'record-detail':recordDetailView,export:exportView,consolidate:consolidateView,map:mapView,charts:chartsView,users:usersView,catalogs:catalogsView};
  (views[state.view]||homeView)();
}

document.addEventListener('click',async e=>{
  const view=e.target.closest('[data-view]')?.dataset.view;
  if(view){
    if(view==='evaluate') state.editingId=null;
    state.view=view;render();return;
  }
  const record=e.target.closest('[data-record]')?.dataset.record;
  if(record){state.selectedRecordId=record;state.view='record-detail';render();return;}
  if(e.target.closest('#edit-record')){state.editingId=state.selectedRecordId;state.view='evaluate';render();return;}
  if(e.target.closest('#cancel-evaluation')){const hadEdit=Boolean(state.editingId);state.editingId=null;state.view=hadEdit&&state.selectedRecordId?'record-detail':'records';render();return;}
  if(e.target.closest('#logout')){localStorage.removeItem('fenologia-session');state.session=null;state.editingId=null;state.selectedRecordId=null;render();return;}
  if(e.target.closest('#export-csv')){exportExact('fenologia');return;}
  if(e.target.closest('#export-bio')){exportExact('biometria');return;}
  if(e.target.closest('#backup')){createBackup();return;}
  if(e.target.closest('#import-backup')){$('#backup-file')?.click();return;}
  if(e.target.closest('#clear-records')){
    const check=canClearRecords();if(!check.ok)return showToast(check.message);
    if(confirm('Se eliminarán los registros locales respaldados. ¿Deseas continuar?')){
      const previousRecords=state.records,previousSelection=state.selectedRecordId;
      try{state.records=[];state.selectedRecordId=null;await save();render();showToast('Datos locales eliminados.');}
      catch(error){state.records=previousRecords;state.selectedRecordId=previousSelection;showToast('No se pudo completar la limpieza. Los datos se conservaron.');}
    }
    return;
  }
  if(e.target.closest('#save-assignment')){
    const f=$('#assignment-form');if(!f.lot.value)return showToast('Selecciona un lote.');
    const previous=state.assignments[f.lot.value];state.assignments[f.lot.value]=$$('#variety-checks input:checked').map(x=>x.value);
    try{await save();showToast('Variedades actualizadas.');}
    catch(error){if(previous===undefined)delete state.assignments[f.lot.value];else state.assignments[f.lot.value]=previous;showToast('No se pudo guardar la asignación.');}
  }
});
document.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='login-form'&&!window.FenologiaAdmin){const d=new FormData(e.target);const u=users.find(x=>x.name.toLowerCase()===String(d.get('name')).trim().toLowerCase()&&x.pin===d.get('pin'));if(!u)return showToast('Nombre o acceso incorrecto.');const issuedAt=new Date();state.session={...u,issuedAt:issuedAt.toISOString(),lastActiveAt:issuedAt.toISOString(),expiresAt:new Date(issuedAt.getTime()+8*60*60*1000).toISOString()};localStorage.setItem('fenologia-session',JSON.stringify(state.session));state.view='home';render();}
  if(e.target.id==='evaluation-form') saveEvaluation(e.target).catch(error=>{console.error(error);showToast('No se pudo guardar la evaluación. Los datos permanecen en el formulario.');});
});
document.addEventListener('input',e=>{
  if(e.target.id==='record-search'||e.target.id==='record-date'){const q=($('#record-search')?.value||'').toLowerCase();const date=$('#record-date')?.value||'';const list=state.records.filter(r=>(!date||r.date===date)&&(!q||[r.lot,r.farm,r.variety,r.field].join(' ').toLowerCase().includes(q)));$('#records-container').innerHTML=recordTable(list);}
});
document.addEventListener('change',e=>{
  if(e.target.id==='backup-file'&&e.target.files?.[0]){importBackup(e.target.files[0]);e.target.value='';}
});
window.addEventListener('online',render);window.addEventListener('offline',render);

window.__FENOLOGIA_CATALOG_READY__=(async()=>{
  const response=await fetch('./data/catalogos.json',{cache:'no-store'});
  if(!response.ok)throw new Error(`El catálogo respondió ${response.status}.`);
  const catalog=await response.json();
  if(!catalog?.lotesAgrupados)throw new Error('El catálogo de lotes no tiene una estructura válida.');
  state.catalog=catalog;
  render();
  return catalog;
})();
window.__FENOLOGIA_CATALOG_READY__.catch(err=>{
  app.innerHTML=`<main class="fatal"><h1>No se pudo cargar Fenología</h1><p>${esc(err.message)}</p></main>`;
});
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
