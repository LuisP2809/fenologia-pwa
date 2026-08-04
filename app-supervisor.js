(() => {
  const APP_VERSION = '0.7.0';
  const HISTORY_KEY = 'supervisor-import-history-v1';
  const supervisorState = {
    files: [],
    analysis: null,
    history: [],
    historyLoaded: false,
    busy: false,
    exportFrom: '',
    exportTo: ''
  };

  const evaluatorUsers = () => users.filter(user => user.role === 'Evaluador');
  const isBlank = value => value === '' || value === null || value === undefined;
  const comparable = value => isBlank(value) ? '' : String(value).trim();
  const safeNumber = value => {
    if(isBlank(value)) return '';
    const normalized = String(value).trim().replace(',','.');
    const number = Number(normalized);
    return Number.isFinite(number) ? Math.max(0,Math.trunc(number)) : value;
  };
  const stripBom = value => String(value ?? '').replace(/^\uFEFF/,'').trim();
  const normalizedHeader = value => stripBom(value).replace(/\s+/g,' ').toUpperCase();
  const headersEqual = (actual, expected) => actual.length === expected.length && actual.every((header,index) => normalizedHeader(header) === normalizedHeader(expected[index]));
  const dateStamp = value => {
    if(!value) return 'sin_fecha';
    const [year,month,day] = value.split('-');
    return `${day}_${month}_${String(year).slice(-2)}`;
  };
  const localIsoDate = (date = new Date()) => {
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0,10);
  };

  function normalizeDate(value){
    const text = stripBom(value);
    if(!text) return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
    if(slash){
      const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
      return `${year}-${slash[2].padStart(2,'0')}-${slash[1].padStart(2,'0')}`;
    }
    return '';
  }

  function detectDelimiter(text){
    const firstLine = String(text).replace(/^\uFEFF/,'').split(/\r?\n/).find(line => line.trim()) || '';
    const candidates = [';',',','\t'];
    return candidates.map(delimiter => ({delimiter,count:firstLine.split(delimiter).length})).sort((a,b)=>b.count-a.count)[0].delimiter;
  }

  function parseDelimited(text){
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const input = String(text).replace(/^\uFEFF/,'');

    for(let index=0; index<input.length; index++){
      const character = input[index];
      if(quoted){
        if(character === '"' && input[index+1] === '"'){
          cell += '"';
          index++;
        }else if(character === '"'){
          quoted = false;
        }else{
          cell += character;
        }
        continue;
      }
      if(character === '"'){
        quoted = true;
      }else if(character === delimiter){
        row.push(cell);
        cell = '';
      }else if(character === '\n'){
        row.push(cell.replace(/\r$/,''));
        rows.push(row);
        row = [];
        cell = '';
      }else{
        cell += character;
      }
    }
    if(cell.length || row.length){
      row.push(cell.replace(/\r$/,''));
      rows.push(row);
    }
    return rows.filter(values => values.some(value => String(value).trim() !== ''));
  }

  function baseRecord(row){
    return {
      id:stripBom(row[0]),
      date:normalizeDate(row[1]),
      field:stripBom(row[5]),
      farm:stripBom(row[6]),
      module:stripBom(row[7]),
      lot:stripBom(row[8]),
      quadrant:stripBom(row[9]),
      variety:stripBom(row[10]),
      plant:safeNumber(row[11]),
      campaign:'',
      importedFromCsv:true
    };
  }

  function fenologyRecord(row){
    const record = baseRecord(row);
    let cursor = 12;
    stages.forEach(stage => { record[stage] = safeNumber(row[cursor++]); });
    [
      'yemasVegetativas','yemasFlorales','yemasDudosas','senescencia','broteRojo','brotePalido','broteOscuro',
      'paniculaIndeterminada','paniculaDeterminada','conteoPaniculas','conteoCuajas','paniculasSinCuajar',
      'paniculaBuena','paniculaMedia','paniculaMala'
    ].forEach(key => { record[key] = safeNumber(row[cursor++]); });
    return record;
  }

  function biometryRecord(row){
    const record = baseRecord(row);
    let cursor = 12;
    for(let fruit=1; fruit<=35; fruit++){
      record[`f${fruit}_dl`] = safeNumber(row[cursor++]);
      record[`f${fruit}_dea`] = safeNumber(row[cursor++]);
      record[`f${fruit}_deb`] = safeNumber(row[cursor++]);
    }
    ['caidaF1','caidaF2','caidaF3','caidaF4','frutaAnillada','frutaDeshidratada','frutosPintones'].forEach(key => {
      record[key] = safeNumber(row[cursor++]);
    });
    return record;
  }

  function validateRecord(record){
    const missing = [];
    if(!record.id) missing.push('ID DATA');
    if(!record.date) missing.push('FECHA');
    if(!record.field) missing.push('CAMPO');
    if(!record.farm) missing.push('FUNDO');
    if(!record.module) missing.push('MODULO');
    if(!record.lot) missing.push('TURNO-LOTE');
    if(!record.quadrant) missing.push('CUADRANTE');
    if(!record.variety) missing.push('VARIEDAD');
    if(isBlank(record.plant) || Number(record.plant) < 1) missing.push('# PLANTA');
    return missing;
  }

  function inferEvaluator(records){
    const ids = [...new Set(records.map(record => record.evaluatorId).filter(Boolean))];
    return ids.length === 1 ? ids[0] : '';
  }

  async function parseCsvFile(file){
    const text = await file.text();
    const rows = parseDelimited(text);
    if(!rows.length) throw new Error('El archivo está vacío.');
    const headers = rows[0].map(stripBom);
    let kind = '';
    let builder = null;
    if(headersEqual(headers,FENO_HEADERS)){
      kind = 'fenologia';
      builder = fenologyRecord;
    }else if(headersEqual(headers,BIO_HEADERS)){
      kind = 'biometria';
      builder = biometryRecord;
    }else{
      throw new Error(`Estructura no reconocida: se encontraron ${headers.length} columnas; se esperaban 44 o 124.`);
    }

    const records = [];
    const issues = [];
    rows.slice(1).forEach((row,index) => {
      const rowNumber = index + 2;
      if(row.length !== headers.length){
        issues.push({row:rowNumber,message:`La fila tiene ${row.length} columnas y debería tener ${headers.length}.`});
        return;
      }
      const record = builder(row);
      const missing = validateRecord(record);
      if(missing.length){
        issues.push({row:rowNumber,id:record.id,message:`Faltan datos obligatorios: ${missing.join(', ')}.`});
        return;
      }
      records.push(record);
    });
    return {kind,records,issues,headersCount:headers.length};
  }

  async function parseJsonFile(file){
    const payload = JSON.parse(await file.text());
    if(!payload || !Array.isArray(payload.records)) throw new Error('El JSON no contiene una lista válida de evaluaciones.');
    const records = [];
    const issues = [];
    payload.records.forEach((incoming,index) => {
      const record = {...incoming};
      record.date = normalizeDate(record.date);
      record.plant = safeNumber(record.plant);
      const missing = validateRecord(record);
      if(missing.length){
        issues.push({row:index+1,id:record.id,message:`Registro inválido: faltan ${missing.join(', ')}.`});
        return;
      }
      records.push(record);
    });
    return {kind:'respaldo',records,issues,headersCount:null};
  }

  async function parseSupervisorFile(file){
    const extension = file.name.split('.').pop().toLowerCase();
    const parsed = extension === 'json' ? await parseJsonFile(file) : await parseCsvFile(file);
    const detectedEvaluatorId = inferEvaluator(parsed.records);
    const evaluators = evaluatorUsers();
    return {
      id:`FILE-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      name:file.name,
      size:file.size,
      kind:parsed.kind,
      records:parsed.records,
      issues:parsed.issues,
      headersCount:parsed.headersCount,
      evaluatorId:detectedEvaluatorId || (evaluators.length === 1 ? evaluators[0].id : ''),
      error:null
    };
  }

  function recordWithSource(record,file,batchId,importedAt){
    const evaluator = evaluatorUsers().find(user => user.id === (record.evaluatorId || file.evaluatorId));
    const sourceFiles = [...new Set([...(record.sourceFiles || []),file.name])];
    const importBatchIds = [...new Set([...(record.importBatchIds || []),batchId])];
    return {
      ...record,
      evaluatorId:record.evaluatorId || file.evaluatorId || '',
      evaluator:record.evaluator || evaluator?.name || 'Evaluador no identificado',
      sourceFiles,
      importBatchIds,
      importedAt,
      importedBy:state.session.name,
      importSource:file.kind
    };
  }

  function mergeRecord(current,incoming){
    const merged = {...current};
    const conflicts = [];
    const changedFields = [];
    const ignoredKeys = new Set(['createdAt','updatedAt','importedAt','importedBy','sourceFiles','importBatchIds','importSource','importedFromCsv']);

    Object.entries(incoming).forEach(([key,value]) => {
      if(ignoredKeys.has(key) || key === 'id' || isBlank(value)) return;
      const existing = merged[key];
      if(isBlank(existing)){
        merged[key] = value;
        changedFields.push(key);
        return;
      }
      if(comparable(existing) !== comparable(value)){
        if(key === 'evaluator' || key === 'evaluatorId') return;
        conflicts.push(key);
      }
    });

    if(conflicts.length) return {status:'observed',record:current,conflicts,changedFields:[]};
    merged.sourceFiles = [...new Set([...(current.sourceFiles || []),...(incoming.sourceFiles || [])])];
    merged.importBatchIds = [...new Set([...(current.importBatchIds || []),...(incoming.importBatchIds || [])])];
    if(incoming.importedAt) merged.importedAt = incoming.importedAt;
    if(incoming.importedBy) merged.importedBy = incoming.importedBy;
    if(incoming.importSource) merged.importSource = incoming.importSource;
    if(changedFields.length){
      merged.updatedAt = new Date().toISOString();
      return {status:'updated',record:merged,conflicts:[],changedFields};
    }
    return {status:'duplicate',record:current,conflicts:[],changedFields:[]};
  }

  function analyzeFiles(batchId = `PREVIEW-${Date.now()}`, importedAt = new Date().toISOString()){
    const recordMap = new Map(state.records.map(record => [record.id,{...record}]));
    const operations = [];
    const fileResults = [];
    const totals = {new:0,updated:0,duplicate:0,observed:0,valid:0};

    supervisorState.files.forEach(file => {
      const summary = {fileId:file.id,name:file.name,kind:file.kind,new:0,updated:0,duplicate:0,observed:file.issues.length,valid:0};
      file.issues.forEach(issue => operations.push({status:'observed',file,issue}));
      totals.observed += file.issues.length;

      if(file.error){
        summary.observed++;
        totals.observed++;
        operations.push({status:'observed',file,issue:{message:file.error}});
        fileResults.push(summary);
        return;
      }

      file.records.forEach(record => {
        if(!record.evaluatorId && !file.evaluatorId){
          summary.observed++;
          totals.observed++;
          operations.push({status:'observed',file,record,issue:{message:'Selecciona el evaluador responsable del archivo.'}});
          return;
        }

        const incoming = recordWithSource(record,file,batchId,importedAt);
        const current = recordMap.get(incoming.id);
        if(!current){
          recordMap.set(incoming.id,incoming);
          summary.new++;
          summary.valid++;
          totals.new++;
          totals.valid++;
          operations.push({status:'new',file,record:incoming});
          return;
        }

        const result = mergeRecord(current,incoming);
        summary[result.status]++;
        totals[result.status]++;
        if(result.status === 'updated'){
          summary.valid++;
          totals.valid++;
          recordMap.set(incoming.id,result.record);
        }
        operations.push({status:result.status,file,record:incoming,result});
      });
      fileResults.push(summary);
    });

    return {recordMap,operations,fileResults,totals};
  }

  function fileTypeLabel(kind){
    return ({fenologia:'Fenología · 44 columnas',biometria:'Biometría · 124 columnas',respaldo:'Respaldo JSON'})[kind] || 'Archivo no reconocido';
  }

  function fileRowsHtml(){
    const evaluators = evaluatorUsers();
    if(!supervisorState.files.length){
      return `<div class="supervisor-empty"><span>📂</span><b>Aún no hay archivos seleccionados</b><p>Selecciona varios CSV o respaldos JSON para analizarlos juntos.</p></div>`;
    }
    return supervisorState.files.map(file => {
      const result = supervisorState.analysis?.fileResults.find(item => item.fileId === file.id);
      return `<article class="supervisor-file-row ${file.error?'error':''}">
        <div class="supervisor-file-icon">${file.kind==='biometria'?'📏':file.kind==='respaldo'?'🛡️':'🌿'}</div>
        <div class="supervisor-file-info"><b>${esc(file.name)}</b><small>${file.error?esc(file.error):`${fileTypeLabel(file.kind)} · ${file.records.length} fila(s) válida(s)`}</small></div>
        <label>Evaluador
          <select data-supervisor-evaluator="${file.id}" ${file.error?'disabled':''}>
            <option value="">Seleccionar</option>
            ${evaluators.map(user=>`<option value="${esc(user.id)}" ${file.evaluatorId===user.id?'selected':''}>${esc(user.name)}</option>`).join('')}
          </select>
        </label>
        <div class="supervisor-file-counts">
          <span class="new">${result?.new || 0} nuevos</span>
          <span class="updated">${result?.updated || 0} completados</span>
          <span>${result?.duplicate || 0} repetidos</span>
          <span class="observed">${result?.observed || 0} observados</span>
        </div>
        <button type="button" class="icon-button" data-remove-supervisor-file="${file.id}" aria-label="Quitar archivo">×</button>
      </article>`;
    }).join('');
  }

  function observationsHtml(){
    const observed = supervisorState.analysis?.operations.filter(operation => operation.status === 'observed') || [];
    if(!observed.length) return `<div class="supervisor-ok"><span>✓</span><div><b>Sin observaciones</b><p>Los archivos seleccionados pueden consolidarse.</p></div></div>`;
    return `<div class="supervisor-observations">${observed.slice(0,20).map(operation => {
      const id = operation.record?.id || operation.issue?.id || 'Sin ID';
      const detail = operation.result?.conflicts?.length
        ? `Conflicto en: ${operation.result.conflicts.join(', ')}`
        : operation.issue?.message || 'Registro observado.';
      return `<div><b>${esc(operation.file.name)}</b><span>${esc(id)}</span><p>${esc(detail)}</p></div>`;
    }).join('')}${observed.length>20?`<small>Se muestran 20 de ${observed.length} observaciones.</small>`:''}</div>`;
  }

  function defaultExportRange(){
    const dates = state.records.map(record=>record.date).filter(Boolean).sort();
    return {from:dates[0] || localIsoDate(),to:dates[dates.length-1] || localIsoDate()};
  }

  function consolidatedRecords(){
    const from = supervisorState.exportFrom;
    const to = supervisorState.exportTo;
    if(!from || !to || from > to) return [];
    return state.records.filter(record => record.date && record.date >= from && record.date <= to);
  }

  function historyHtml(){
    if(!supervisorState.historyLoaded) return `<div class="supervisor-history-loading">Cargando historial…</div>`;
    if(!supervisorState.history.length) return `<div class="supervisor-empty compact"><span>🕘</span><b>Sin importaciones anteriores</b><p>El primer lote consolidado aparecerá aquí.</p></div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Responsable</th><th>Archivos</th><th>Nuevos</th><th>Completados</th><th>Repetidos</th><th>Observados</th></tr></thead><tbody>${supervisorState.history.slice().reverse().slice(0,20).map(batch=>`<tr><td>${new Date(batch.importedAt).toLocaleString('es-PE')}</td><td>${esc(batch.supervisor)}</td><td>${batch.files.length}</td><td>${batch.new}</td><td>${batch.updated}</td><td>${batch.duplicate}</td><td>${batch.observed}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function consolidateViewReal(){
    if(!isSupervisor()){
      state.view='home';
      return homeView();
    }
    if(!supervisorState.exportFrom || !supervisorState.exportTo){
      const range = defaultExportRange();
      supervisorState.exportFrom = range.from;
      supervisorState.exportTo = range.to;
    }
    supervisorState.analysis = analyzeFiles();
    const totals = supervisorState.analysis.totals;
    const exportCount = consolidatedRecords().length;

    app.innerHTML = shell(`${titleBlock('SUPERVISOR','Consolidar evaluaciones','Analiza los archivos de los evaluadores, evita duplicados y conserva un historial de cada importación.')}
      <section class="panel supervisor-upload" id="supervisor-drop-zone">
        <div class="supervisor-upload-icon">${icons.sync}</div>
        <div><span>IMPORTACIÓN MÚLTIPLE</span><h2>Selecciona archivos de los evaluadores</h2><p>Admite los CSV generados por Fenología y los respaldos JSON. Puedes escoger varios archivos a la vez.</p></div>
        <button type="button" class="primary" id="select-supervisor-files">Seleccionar archivos</button>
        <input type="file" id="supervisor-files" accept=".csv,text/csv,.json,application/json" multiple hidden>
      </section>

      <section class="metrics-grid supervisor-metrics">
        ${metric(supervisorState.files.length,'Archivos seleccionados',icons.file)}
        ${metric(totals.new,'Registros nuevos',icons.check)}
        ${metric(totals.updated,'Registros completados',icons.sync)}
        ${metric(totals.duplicate,'Repetidos omitidos',icons.detail)}
        ${metric(totals.observed,'Observados',icons.alert)}
      </section>

      <section class="panel"><div class="panel-head"><div><span>REVISIÓN PREVIA</span><h2>Archivos y responsables</h2></div><button type="button" class="secondary" id="clear-supervisor-selection" ${supervisorState.files.length?'':'disabled'}>Quitar selección</button></div>
        <div class="supervisor-file-list">${fileRowsHtml()}</div>
      </section>

      <section class="two-cols supervisor-review-grid">
        <article class="panel"><div class="panel-head"><div><span>CONTROL DE CALIDAD</span><h2>Observaciones detectadas</h2></div></div>${observationsHtml()}</article>
        <article class="panel supervisor-confirm"><span>RESULTADO DEL ANÁLISIS</span><h2>${totals.valid} registro(s) listos para consolidar</h2><p>Se agregarán los nuevos y se completarán registros que tengan información complementaria. Los repetidos y conflictos no se modificarán.</p><button type="button" class="primary wide" id="commit-supervisor-import" ${totals.valid && !supervisorState.busy?'':'disabled'}>${supervisorState.busy?'Consolidando…':'Consolidar registros válidos'}</button></article>
      </section>

      <section class="panel supervisor-export-panel"><div class="panel-head"><div><span>BASE CONSOLIDADA</span><h2>Exportar por rango de fechas</h2><p>Incluye todos los registros ya consolidados en este dispositivo.</p></div></div>
        <div class="supervisor-export-controls">
          <label>Desde<input type="date" id="supervisor-export-from" value="${esc(supervisorState.exportFrom)}"></label>
          <label>Hasta<input type="date" id="supervisor-export-to" value="${esc(supervisorState.exportTo)}"></label>
          <div class="supervisor-export-count"><b>${exportCount}</b><span>evaluaciones</span></div>
          <button type="button" class="secondary" id="export-consolidated-feno" ${exportCount?'':'disabled'}>Exportar Fenología</button>
          <button type="button" class="secondary" id="export-consolidated-bio" ${exportCount?'':'disabled'}>Exportar Biometría</button>
        </div>
      </section>

      <section class="panel"><div class="panel-head"><div><span>TRAZABILIDAD</span><h2>Historial de importaciones</h2></div></div><div id="supervisor-history">${historyHtml()}</div></section>`);

    if(!supervisorState.historyLoaded) loadHistory();
  }

  async function loadHistory(){
    try{
      const history = await window.FenologiaDB.getSetting(HISTORY_KEY);
      supervisorState.history = Array.isArray(history) ? history : [];
    }catch{
      try{ supervisorState.history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
      catch{ supervisorState.history = []; }
    }
    supervisorState.historyLoaded = true;
    const target = document.querySelector('#supervisor-history');
    if(target) target.innerHTML = historyHtml();
  }

  async function saveHistory(){
    try{ await window.FenologiaDB.setSetting(HISTORY_KEY,supervisorState.history); }
    catch{ localStorage.setItem(HISTORY_KEY,JSON.stringify(supervisorState.history)); }
  }

  async function selectFiles(fileList){
    const files = [...fileList];
    if(!files.length) return;
    supervisorState.busy = true;
    showToast(`Analizando ${files.length} archivo(s)…`);
    const parsed = [];
    for(const file of files){
      try{
        parsed.push(await parseSupervisorFile(file));
      }catch(error){
        parsed.push({
          id:`FILE-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
          name:file.name,
          size:file.size,
          kind:'error',
          records:[],
          issues:[],
          headersCount:null,
          evaluatorId:'',
          error:error.message || 'No se pudo analizar el archivo.'
        });
      }
    }
    supervisorState.files.push(...parsed);
    supervisorState.busy = false;
    supervisorState.analysis = analyzeFiles();
    consolidateViewReal();
    showToast(`${files.length} archivo(s) analizados.`);
  }

  async function commitImport(){
    if(supervisorState.busy) return;
    const batchId = `IMP-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const importedAt = new Date().toISOString();
    const analysis = analyzeFiles(batchId,importedAt);
    if(!analysis.totals.valid) return showToast('No hay registros válidos para consolidar.');

    supervisorState.busy = true;
    consolidateViewReal();
    state.records = [...analysis.recordMap.values()];
    save();
    await window.FenologiaDB.flush();

    const batch = {
      id:batchId,
      importedAt,
      supervisorId:state.session.id,
      supervisor:state.session.name,
      files:supervisorState.files.map(file=>({name:file.name,kind:file.kind,evaluatorId:file.evaluatorId,rows:file.records.length})),
      new:analysis.totals.new,
      updated:analysis.totals.updated,
      duplicate:analysis.totals.duplicate,
      observed:analysis.totals.observed,
      resultingRecords:state.records.length
    };
    supervisorState.history.push(batch);
    await saveHistory();
    supervisorState.files = [];
    supervisorState.analysis = null;
    supervisorState.busy = false;
    consolidateViewReal();
    showToast(`Consolidación lista: ${batch.new} nuevos y ${batch.updated} completados.`);
  }

  function exportConsolidated(type){
    const records = consolidatedRecords();
    if(!records.length) return showToast('No hay registros en el rango seleccionado.');
    if(supervisorState.exportFrom > supervisorState.exportTo) return showToast('La fecha inicial no puede ser posterior a la fecha final.');
    const headers = type === 'fenologia' ? FENO_HEADERS : BIO_HEADERS;
    const rowBuilder = type === 'fenologia' ? fenologyRow : biometryRow;
    const rows = records.map(rowBuilder);
    if(rows.some(row => row.length !== headers.length)) return showToast('No se pudo validar la estructura consolidada.');
    const csv = '\uFEFF' + [headers,...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
    const single = supervisorState.exportFrom === supervisorState.exportTo;
    const range = single
      ? dateStamp(supervisorState.exportFrom)
      : `${dateStamp(supervisorState.exportFrom)} al ${dateStamp(supervisorState.exportTo)}`;
    const name = `Consolidado-${type==='fenologia'?'Fenologia':'Biometria'}-${range}.csv`;
    downloadFile(name,csv,'text/csv;charset=utf-8');
    showToast(`${records.length} registros consolidados exportados.`);
  }

  const previousSidebar = sidebar;
  sidebar = function supervisorSidebar(){
    return previousSidebar().replace(/Versión\s+[0-9.]+/,'Versión 0.7.0');
  };

  const previousRender = render;
  render = function supervisorRender(){
    if(state.session && state.view === 'consolidate') return consolidateViewReal();
    return previousRender();
  };

  document.addEventListener('click',event => {
    if(event.target.closest('#select-supervisor-files')){
      document.querySelector('#supervisor-files')?.click();
      return;
    }
    const remove = event.target.closest('[data-remove-supervisor-file]');
    if(remove){
      supervisorState.files = supervisorState.files.filter(file => file.id !== remove.dataset.removeSupervisorFile);
      supervisorState.analysis = analyzeFiles();
      consolidateViewReal();
      return;
    }
    if(event.target.closest('#clear-supervisor-selection')){
      supervisorState.files = [];
      supervisorState.analysis = null;
      consolidateViewReal();
      return;
    }
    if(event.target.closest('#commit-supervisor-import')){
      commitImport();
      return;
    }
    if(event.target.closest('#export-consolidated-feno')){
      exportConsolidated('fenologia');
      return;
    }
    if(event.target.closest('#export-consolidated-bio')){
      exportConsolidated('biometria');
    }
  });

  document.addEventListener('change',event => {
    if(event.target.id === 'supervisor-files'){
      selectFiles(event.target.files || []);
      event.target.value = '';
      return;
    }
    const evaluatorSelect = event.target.closest('[data-supervisor-evaluator]');
    if(evaluatorSelect){
      const file = supervisorState.files.find(item => item.id === evaluatorSelect.dataset.supervisorEvaluator);
      if(file) file.evaluatorId = evaluatorSelect.value;
      supervisorState.analysis = analyzeFiles();
      consolidateViewReal();
      return;
    }
    if(event.target.id === 'supervisor-export-from'){
      supervisorState.exportFrom = event.target.value;
      consolidateViewReal();
      return;
    }
    if(event.target.id === 'supervisor-export-to'){
      supervisorState.exportTo = event.target.value;
      consolidateViewReal();
    }
  });

  document.addEventListener('dragover',event => {
    const zone = event.target.closest('#supervisor-drop-zone');
    if(!zone) return;
    event.preventDefault();
    zone.classList.add('dragging');
  });
  document.addEventListener('dragleave',event => {
    const zone = event.target.closest('#supervisor-drop-zone');
    if(zone) zone.classList.remove('dragging');
  });
  document.addEventListener('drop',event => {
    const zone = event.target.closest('#supervisor-drop-zone');
    if(!zone) return;
    event.preventDefault();
    zone.classList.remove('dragging');
    selectFiles(event.dataTransfer?.files || []);
  });

  if(typeof state !== 'undefined' && state.catalog) render();
})();
