(() => {
  const VERSION = '0.13.1';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const consolidation = {files:[],records:[],stats:null,issues:[],conflicts:[],busy:false};
  const analysis = {files:[],records:[],stats:null,issues:[],conflicts:[],loaded:false,busy:false};

  const blank = value => value === '' || value === null || value === undefined;
  const clean = value => String(value ?? '').trim();
  const html = value => clean(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  const ignoredKeys = new Set(['createdAt','updatedAt','importedAt','importedBy','sourceFiles','importBatchIds','importSource','importedFromCsv','importedFromXlsx']);

  function comparable(value){
    if(blank(value)) return '';
    if(typeof value === 'object') return JSON.stringify(value);
    return clean(value).replace(',', '.');
  }

  function weekNumber(dateText){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateText||'')) return null;
    const date = new Date(`${dateText}T12:00:00Z`);
    const day = date.getUTCDay() || 7;
    const thursday = new Date(date);
    thursday.setUTCDate(date.getUTCDate()+4-day);
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(),0,1));
    return Math.ceil((((thursday-yearStart)/86400000)+1)/7);
  }

  function weeksOf(records){
    return [...new Set(records.map(record=>weekNumber(record.date)).filter(Boolean))].sort((a,b)=>a-b);
  }

  function mergeParameters(current,incoming,conflicts){
    const merged = {...(current||{})};
    Object.entries(incoming||{}).forEach(([id,nextValue])=>{
      if(merged[id] === undefined){ merged[id] = nextValue; return; }
      const oldEntry = merged[id];
      const oldValue = oldEntry && typeof oldEntry === 'object' && Object.prototype.hasOwnProperty.call(oldEntry,'value') ? oldEntry.value : oldEntry;
      const newValue = nextValue && typeof nextValue === 'object' && Object.prototype.hasOwnProperty.call(nextValue,'value') ? nextValue.value : nextValue;
      if(blank(oldValue) && !blank(newValue)){ merged[id] = nextValue; return; }
      if(!blank(newValue) && comparable(oldValue) !== comparable(newValue)) conflicts.push(`Parámetro ${id}`);
    });
    return merged;
  }

  function mergeRecord(current,incoming){
    const merged = {...current};
    const conflicts = [];
    let completed = false;
    Object.entries(incoming).forEach(([key,value])=>{
      if(key === 'id' || ignoredKeys.has(key) || blank(value)) return;
      if(key === 'parametrosAdicionales'){
        const before = JSON.stringify(merged.parametrosAdicionales||{});
        merged.parametrosAdicionales = mergeParameters(merged.parametrosAdicionales,value,conflicts);
        if(before !== JSON.stringify(merged.parametrosAdicionales||{})) completed = true;
        return;
      }
      if(blank(merged[key])){ merged[key] = value; completed = true; return; }
      if(['evaluator','evaluatorId','campaign'].includes(key)) return;
      if(comparable(merged[key]) !== comparable(value)) conflicts.push(key);
    });
    return {merged,conflicts:[...new Set(conflicts)],completed};
  }

  function combineParsed(items){
    const map = new Map();
    const sources = new Map();
    const conflicts = [];
    const issues = [];
    let repeated = 0;
    let completed = 0;

    items.forEach(item=>{
      (item.parsed.issues||[]).forEach(issue=>issues.push({...issue,file:item.file.name}));
      item.parsed.records.forEach(record=>{
        const id = clean(record.id);
        if(!id) return;
        const current = map.get(id);
        if(!current){
          map.set(id,{...record});
          sources.set(id,[item.file.name]);
          return;
        }
        repeated++;
        const result = mergeRecord(current,record);
        const sourceFiles = [...(sources.get(id)||[]),item.file.name];
        if(result.conflicts.length){
          conflicts.push({id,files:[...new Set(sourceFiles)],fields:result.conflicts});
          return;
        }
        if(result.completed){ completed++; map.set(id,result.merged); }
        sources.set(id,[...new Set(sourceFiles)]);
      });
    });

    return {
      records:[...map.values()],
      conflicts,
      issues,
      stats:{files:items.length,unique:map.size,repeated,completed,weeks:weeksOf([...map.values()])}
    };
  }

  async function parseFiles(fileList,target){
    const files = [...fileList].filter(file=>/\.xlsx$/i.test(file.name));
    if(!files.length) throw new Error('Selecciona uno o varios archivos Excel .xlsx.');
    target.busy = true;
    target.files = files.map(file=>({name:file.name,size:file.size}));
    showToast(`Leyendo ${files.length} archivo(s) Excel…`);
    const items = [];
    for(const file of files){
      const parsed = await window.FenologiaXLSX.parseWorkbookRecords(file);
      items.push({file,parsed});
    }
    const result = combineParsed(items);
    Object.assign(target,result,{busy:false});
    return result;
  }

  function conflictHtml(conflicts){
    if(!conflicts.length) return '';
    return `<div class="file-analysis-warning"><b>⚠️ ${conflicts.length} conflicto(s) por ID DATA</b><p>No se elegirá un valor automáticamente. Corrige los archivos antes de continuar.</p><ul>${conflicts.slice(0,6).map(item=>`<li><b>${html(item.id)}</b> · ${html(item.fields.join(', '))}<small>${html(item.files.join(' + '))}</small></li>`).join('')}</ul>${conflicts.length>6?`<small>… y ${conflicts.length-6} conflicto(s) más.</small>`:''}</div>`;
  }

  function issuesHtml(issues){
    if(!issues.length) return '';
    return `<div class="file-analysis-note"><b>${issues.length} observación(es) de estructura</b><p>Se conservaron únicamente las filas válidas.</p></div>`;
  }

  function filesHtml(files){
    if(!files.length) return '<div class="file-analysis-empty">Aún no seleccionaste archivos.</div>';
    return `<div class="file-analysis-files">${files.map(file=>`<span>📄 ${html(file.name)}</span>`).join('')}</div>`;
  }

  function statsHtml(target){
    if(!target.stats) return '';
    const weeks = target.stats.weeks.length ? target.stats.weeks.map(week=>`S${week}`).join(', ') : '—';
    return `<div class="file-analysis-stats">
      <div><b>${target.stats.files}</b><span>Archivos</span></div>
      <div><b>${target.stats.unique}</b><span>ID DATA únicos</span></div>
      <div><b>${target.stats.repeated}</b><span>Repetidos controlados</span></div>
      <div><b>${target.stats.completed}</b><span>Registros completados</span></div>
      <div><b>${html(weeks)}</b><span>Semanas detectadas</span></div>
    </div>`;
  }

  function suggestedName(records){
    const weeks = weeksOf(records);
    if(weeks.length===1) return `Fenologia-sem${weeks[0]}.xlsx`;
    if(weeks.length>1) return `Fenologia-sem${weeks[0]}-a-sem${weeks.at(-1)}.xlsx`;
    return `Fenologia-consolidado-${new Date().toISOString().slice(0,10)}.xlsx`;
  }

  async function exportConsolidation(){
    if(!consolidation.records.length) return showToast('Primero selecciona los archivos que deseas consolidar.');
    if(consolidation.conflicts.length) return showToast('Hay conflictos por ID DATA. Corrígelos antes de exportar.');
    let name = prompt('Nombre del archivo consolidado:',suggestedName(consolidation.records));
    if(!name) return;
    if(!/\.xlsx$/i.test(name)) name += '.xlsx';
    const bytes = window.FenologiaXLSX.buildDataWorkbook(consolidation.records,'Consolidado de Fenología');
    await window.FenologiaXLSX.exportWorkbook(name,bytes);
    showToast(`Consolidado listo: ${consolidation.records.length} evaluaciones únicas.`);
  }

  async function loadAnalysisFiles(fileList){
    try{
      await parseFiles(fileList,analysis);
      if(analysis.conflicts.length){
        analysis.loaded = false;
        render();
        showToast('No se cargaron los gráficos porque existen conflictos por ID DATA.');
        return;
      }
      if(!analysis.records.length) throw new Error('Los archivos no contienen evaluaciones válidas.');
      state.records = analysis.records.map(record=>({...record}));
      analysis.loaded = true;
      window.__FENOLOGIA_ANALYSIS_SESSION = {
        version:VERSION,
        files:analysis.files.map(file=>file.name),
        records:analysis.records.length,
        weeks:analysis.stats?.weeks||[],
        loadedAt:new Date().toISOString()
      };
      render();
      showToast(`${analysis.records.length} evaluaciones cargadas para análisis. Solo se usarán estos archivos.`);
    }catch(error){
      analysis.busy=false;
      console.error(error);
      showToast(error.message||'No se pudieron cargar los archivos para análisis.');
      render();
    }
  }

  function clearAnalysis(){
    analysis.files=[];analysis.records=[];analysis.stats=null;analysis.issues=[];analysis.conflicts=[];analysis.loaded=false;
    state.records=[];
    delete window.__FENOLOGIA_ANALYSIS_SESSION;
    render();
    showToast('Base de análisis vacía. Selecciona los Excel que quieras analizar.');
  }

  function removeLegacyHistory(){
    const history = document.querySelector('#supervisor-history');
    history?.closest('.panel')?.remove();
  }

  function decorateConsolidate(){
    if(state.view!=='consolidate' || !isSupervisor()) return;
    removeLegacyHistory();
    document.querySelector('.xlsx-info-panel')?.remove();
    document.querySelector('.supervisor-file-list')?.closest('.panel')?.remove();
    document.querySelector('.supervisor-review-grid')?.closest('.panel')?.remove();
    document.querySelector('.supervisor-export-panel')?.remove();

    const upload = document.querySelector('.supervisor-upload');
    if(!upload) return;
    const label=upload.querySelector('span');const title=upload.querySelector('h2');const paragraph=upload.querySelector('p');const button=upload.querySelector('button');const input=upload.querySelector('input[type=file]');
    if(label) label.textContent='CONSOLIDAR ARCHIVOS';
    if(title) title.textContent='Selecciona uno o varios Excel';
    if(paragraph) paragraph.textContent='Une únicamente los archivos que selecciones. No guarda historial ni modifica los datos usados por los gráficos.';
    if(button){button.id='select-consolidation-xlsx';button.textContent='Seleccionar Excel';}
    if(input){input.id='consolidation-xlsx-files';input.accept=`.xlsx,${XLSX_MIME}`;input.multiple=true;}

    document.querySelector('#file-consolidation-panel')?.remove();
    upload.insertAdjacentHTML('afterend',`<section class="panel file-analysis-panel" id="file-consolidation-panel">
      <div class="panel-head"><div><span>CONSOLIDADO EN MEMORIA</span><h2>Archivos seleccionados</h2><p>Se unen por ID DATA. Los repetidos idénticos se cuentan una sola vez y los conflictos bloquean la exportación.</p></div></div>
      ${filesHtml(consolidation.files)}
      ${statsHtml(consolidation)}
      ${issuesHtml(consolidation.issues)}
      ${conflictHtml(consolidation.conflicts)}
      <div class="file-analysis-actions">
        <button type="button" class="secondary" id="select-consolidation-xlsx-again">${consolidation.files.length?'Cambiar archivos':'Seleccionar archivos'}</button>
        <button type="button" class="primary" id="download-consolidation-xlsx" ${!consolidation.records.length||consolidation.conflicts.length?'disabled':''}>Descargar Excel consolidado</button>
      </div>
      <p class="file-analysis-foot">Este proceso no conserva versiones anteriores dentro del aplicativo. El archivo descargado queda bajo tu control en la PC o celular.</p>
    </section>`);
  }

  function decorateCharts(){
    if(state.view!=='charts' || !isSupervisor()) return;
    const filters = document.querySelector('.charts-filters');
    if(!filters) return;
    document.querySelector('#chart-file-analysis-panel')?.remove();
    filters.insertAdjacentHTML('beforebegin',`<section class="panel file-analysis-panel chart-file-panel" id="chart-file-analysis-panel">
      <div class="panel-head"><div><span>FUENTE DE LOS GRÁFICOS</span><h2>Analizar archivos Excel seleccionados</h2><p>Los gráficos, mapas y comparativos usarán exclusivamente los Excel que cargues aquí durante esta sesión.</p></div></div>
      <input id="chart-analysis-files" type="file" accept=".xlsx,${XLSX_MIME}" multiple hidden>
      ${filesHtml(analysis.files)}
      ${statsHtml(analysis)}
      ${issuesHtml(analysis.issues)}
      ${conflictHtml(analysis.conflicts)}
      ${analysis.loaded?'<div class="file-analysis-active">✓ Base analítica activa. No se están sumando consolidaciones anteriores.</div>':'<div class="file-analysis-empty">Selecciona uno o varios Excel para definir la base que quieres analizar.</div>'}
      <div class="file-analysis-actions">
        <button type="button" class="primary" id="select-chart-analysis-files">${analysis.loaded?'Cambiar archivos para analizar':'Seleccionar archivos para analizar'}</button>
        ${analysis.loaded?'<button type="button" class="secondary" id="clear-chart-analysis">Vaciar análisis</button>':''}
      </div>
    </section>`);
  }

  function installStyles(){
    if(document.querySelector('#file-analysis-styles')) return;
    const style=document.createElement('style');style.id='file-analysis-styles';style.textContent=`
      .file-analysis-panel{margin-top:16px}.file-analysis-files{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.file-analysis-files span{padding:8px 11px;border:1px solid #d9e5de;border-radius:10px;background:#f8fbf9;font-size:13px}.file-analysis-stats{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:10px;margin:14px 0}.file-analysis-stats div{padding:12px;border:1px solid #dfe8e3;border-radius:12px;background:#fff}.file-analysis-stats b{display:block;font-size:19px;color:#07552f}.file-analysis-stats span{display:block;font-size:11px;color:#607168;margin-top:3px}.file-analysis-warning{padding:14px;border-radius:12px;background:#fff4e5;border:1px solid #f0c36b;margin:12px 0}.file-analysis-warning ul{padding-left:18px;margin:8px 0}.file-analysis-warning li{margin:6px 0}.file-analysis-warning small{display:block;color:#755c32;margin-top:2px}.file-analysis-note{padding:12px;border-radius:10px;background:#f2f6ff;border:1px solid #cddaf5;margin:10px 0}.file-analysis-empty{padding:13px;border-radius:10px;background:#f6f8f7;color:#65736b;margin:10px 0}.file-analysis-active{padding:12px;border-radius:10px;background:#eaf7ef;color:#07552f;font-weight:700;margin:10px 0}.file-analysis-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.file-analysis-foot{font-size:12px;color:#6d7972;margin-top:12px}.chart-file-panel{margin-bottom:16px}@media(max-width:760px){.file-analysis-stats{grid-template-columns:repeat(2,1fr)}.file-analysis-actions button{width:100%}}
    `;document.head.appendChild(style);
  }

  async function eraseLegacyHistoryStorage(){
    try{ await window.FenologiaDB?.setSetting?.('supervisor-import-history-v1',[]); }catch{}
    try{ localStorage.removeItem('supervisor-import-history-v1'); }catch{}
  }

  const previousRender = render;
  render = function fileDrivenRender(){
    const result = previousRender();
    installStyles();
    decorateConsolidate();
    decorateCharts();
    return result;
  };

  document.addEventListener('click',event=>{
    if(event.target.closest('#select-consolidation-xlsx') || event.target.closest('#select-consolidation-xlsx-again')){
      document.querySelector('#consolidation-xlsx-files')?.click();return;
    }
    if(event.target.closest('#download-consolidation-xlsx')){
      exportConsolidation().catch(error=>{console.error(error);showToast(error.message||'No se pudo exportar el consolidado.');});return;
    }
    if(event.target.closest('#select-chart-analysis-files')){
      document.querySelector('#chart-analysis-files')?.click();return;
    }
    if(event.target.closest('#clear-chart-analysis')){clearAnalysis();return;}
  },true);

  document.addEventListener('change',event=>{
    if(event.target.id==='consolidation-xlsx-files'){
      event.stopImmediatePropagation();
      const files=[...(event.target.files||[])];event.target.value='';
      parseFiles(files,consolidation).then(()=>{render();showToast(`${consolidation.records.length} ID DATA únicos listos para consolidar.`);}).catch(error=>{consolidation.busy=false;console.error(error);showToast(error.message||'No se pudieron leer los Excel.');render();});
      return;
    }
    if(event.target.id==='chart-analysis-files'){
      event.stopImmediatePropagation();
      const files=[...(event.target.files||[])];event.target.value='';
      loadAnalysisFiles(files);
    }
  },true);

  installStyles();
  eraseLegacyHistoryStorage();
  decorateConsolidate();
  decorateCharts();
  window.FenologiaFileAnalysis={version:VERSION,consolidation,analysis};
})();
