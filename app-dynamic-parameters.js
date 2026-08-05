(() => {
  const VERSION = '0.11.0';
  const SETTING_KEY = 'dynamic-parameters-v1';
  const HISTORY_KEY = 'dynamic-parameters-history-v1';
  const CACHE_KEY = 'fenologia-dynamic-parameters-cache-v1';
  const TYPES = {
    integer:'Número entero', decimal:'Número decimal', percentage:'Porcentaje',
    yesno:'Sí / No', list:'Lista de opciones', text:'Texto corto', date:'Fecha'
  };
  const NUMERIC_TYPES = new Set(['integer','decimal','percentage']);
  const DEFAULT_SECTIONS = ['Brotamiento','Floración','Cuajado','Fruto','Sanidad','Calidad','Riego','Nutrición','Otros'];
  const ui = {editing:null, chartParameter:'', chartGroup:'week'};
  let parameters = [];
  let parameterHistory = [];
  let initPromise = null;

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const safe = value => String(value ?? '').trim();
  const now = () => new Date().toISOString();
  const readJson = (key,fallback) => { try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;} };
  const unique = values => [...new Set(values.map(safe).filter(Boolean))];
  const valueBlank = value => value === '' || value === null || value === undefined;

  async function getSetting(key,fallback){
    if(window.FenologiaDB?.isReady()&&!window.FenologiaDB.isFallback()){
      const value = await window.FenologiaDB.getSetting(key);
      return value ?? fallback;
    }
    return readJson(`fenologia-${key}`,fallback);
  }
  async function setSetting(key,value){
    localStorage.setItem(`fenologia-${key}`,JSON.stringify(value));
    if(window.FenologiaDB?.isReady()&&!window.FenologiaDB.isFallback()) await window.FenologiaDB.setSetting(key,value);
  }

  function defaultAggregation(type){
    if(NUMERIC_TYPES.has(type)) return 'average';
    if(type === 'yesno') return 'percent_yes';
    return 'count';
  }
  function normalizeParameter(input,index=0){
    const type = TYPES[input?.type] ? input.type : 'integer';
    let minimum = valueBlank(input?.minimum) ? null : Number(input.minimum);
    let maximum = valueBlank(input?.maximum) ? null : Number(input.maximum);
    if(!Number.isFinite(minimum)) minimum = null;
    if(!Number.isFinite(maximum)) maximum = null;
    if(type === 'percentage'){
      if(minimum === null) minimum = 0;
      if(maximum === null) maximum = 100;
    }
    return {
      id:safe(input?.id) || `PAR-${Date.now()}-${index}`,
      name:safe(input?.name) || `Parámetro ${index+1}`,
      section:safe(input?.section) || 'Otros',
      type,
      unit:safe(input?.unit),
      minimum,
      maximum,
      options:type==='list'?unique(Array.isArray(input?.options)?input.options:[]):[],
      required:input?.required===true,
      active:input?.active!==false,
      chartable:input?.chartable===true,
      aggregation:safe(input?.aggregation) || defaultAggregation(type),
      revision:Number(input?.revision || 1),
      createdAt:input?.createdAt || now(),
      updatedAt:input?.updatedAt || now()
    };
  }
  function normalizeCatalog(value){
    return (Array.isArray(value)?value:[]).map(normalizeParameter)
      .filter(item=>item.id&&item.name)
      .sort((a,b)=>`${a.section}|${a.name}`.localeCompare(`${b.section}|${b.name}`,'es'));
  }
  async function initialize(){
    if(initPromise) return initPromise;
    initPromise=(async()=>{
      const cached=readJson(CACHE_KEY,[]);
      parameters=normalizeCatalog(await getSetting(SETTING_KEY,cached));
      const storedHistory=await getSetting(HISTORY_KEY,[]);
      parameterHistory=Array.isArray(storedHistory)?storedHistory:[];
      localStorage.setItem(CACHE_KEY,JSON.stringify(parameters));
      return parameters;
    })();
    return initPromise;
  }
  async function persist(action,detail={}){
    parameters=normalizeCatalog(parameters);
    localStorage.setItem(CACHE_KEY,JSON.stringify(parameters));
    await setSetting(SETTING_KEY,parameters);
    parameterHistory=[{
      id:`DYN-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
      action,detail,actor:state.session?.name || 'Sistema',createdAt:now()
    },...parameterHistory].slice(0,300);
    await setSetting(HISTORY_KEY,parameterHistory);
    window.dispatchEvent(new CustomEvent('fenologia-dynamic-parameters-changed',{detail:{action,parameters:clone(parameters)}}));
  }
  async function replaceCatalog(incoming,action='Catálogo de parámetros reemplazado'){
    parameters=normalizeCatalog(incoming);
    await persist(action,{cantidad:parameters.length});
  }

  function usedCount(id){
    return state.records.filter(record=>!valueBlank(readStoredValue(record,id))).length;
  }
  function readStoredEntry(record,id){
    return record?.parametrosAdicionales?.[id] ?? null;
  }
  function readStoredValue(record,id){
    const entry=readStoredEntry(record,id);
    return entry&&typeof entry==='object'&&Object.prototype.hasOwnProperty.call(entry,'value')?entry.value:entry;
  }
  function parameterSnapshot(parameter,value){
    return {
      value,
      name:parameter.name,
      section:parameter.section,
      type:parameter.type,
      unit:parameter.unit,
      definitionRevision:parameter.revision,
      recordedAt:now()
    };
  }
  function formatValue(value,parameter){
    if(valueBlank(value)) return 'No registrado';
    if(parameter?.type==='yesno') return String(value).toUpperCase()==='SI'?'Sí':'No';
    if(NUMERIC_TYPES.has(parameter?.type)){
      const number=Number(value);
      if(Number.isFinite(number)) return `${number.toLocaleString('es-PE',{maximumFractionDigits:3})}${parameter?.unit?` ${parameter.unit}`:''}`;
    }
    return `${value}${parameter?.unit?` ${parameter.unit}`:''}`;
  }

  function aggregationOptions(type,selected){
    const options=NUMERIC_TYPES.has(type)
      ? [['average','Promedio'],['sum','Suma'],['count','Conteo'],['min','Mínimo'],['max','Máximo']]
      : type==='yesno' ? [['percent_yes','% de Sí'],['count','Conteo respondido']]
      : [['count','Conteo registrado']];
    return options.map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
  }
  function parameterModal(parameter=null){
    const editing=Boolean(parameter);
    const used=parameter?usedCount(parameter.id):0;
    const sections=unique(DEFAULT_SECTIONS.concat(parameters.map(item=>item.section)));
    const type=parameter?.type || 'integer';
    return `<div class="admin-modal-backdrop" id="dynamic-parameter-modal"><section class="admin-modal dynamic-parameter-modal">
      <div class="admin-modal-head"><div><span>${editing?'EDITAR PARÁMETRO':'NUEVO PARÁMETRO'}</span><h2>${editing?esc(parameter.name):'Agregar variable de evaluación'}</h2></div><button type="button" data-close-dynamic-modal>×</button></div>
      <form id="dynamic-parameter-form" class="admin-form">
        <input type="hidden" name="id" value="${esc(parameter?.id || '')}">
        <input type="hidden" name="lockedType" value="${esc(type)}">
        <label>Nombre del parámetro<input name="name" value="${esc(parameter?.name || '')}" placeholder="Ej. Longitud del brote" required></label>
        <label>Sección<input name="section" list="dynamic-sections" value="${esc(parameter?.section || 'Otros')}" required><datalist id="dynamic-sections">${sections.map(value=>`<option value="${esc(value)}"></option>`).join('')}</datalist></label>
        <label>Tipo de dato<select name="type" ${used?'disabled':''}>${Object.entries(TYPES).map(([value,label])=>`<option value="${value}" ${type===value?'selected':''}>${label}</option>`).join('')}</select>${used?`<small>El tipo está bloqueado porque ya existen ${used} registro(s).</small>`:''}</label>
        <label>Unidad<input name="unit" value="${esc(parameter?.unit || '')}" placeholder="cm, g, frutos, etc."></label>
        <div class="dynamic-range-fields">
          <label>Valor mínimo<input name="minimum" type="number" step="any" value="${parameter?.minimum ?? ''}"></label>
          <label>Valor máximo<input name="maximum" type="number" step="any" value="${parameter?.maximum ?? ''}"></label>
        </div>
        <label class="dynamic-options-field">Opciones de la lista<textarea name="options" rows="4" placeholder="Una opción por línea">${esc((parameter?.options || []).join('\n'))}</textarea><small>Solo se usa cuando el tipo es “Lista de opciones”.</small></label>
        <label>Agregación para gráficos<select name="aggregation">${aggregationOptions(type,parameter?.aggregation || defaultAggregation(type))}</select></label>
        <div class="dynamic-switches">
          <label class="admin-switch"><input type="checkbox" name="required" ${parameter?.required?'checked':''}><span>Obligatorio</span></label>
          <label class="admin-switch"><input type="checkbox" name="chartable" ${parameter?.chartable?'checked':''}><span>Disponible en gráficos</span></label>
          <label class="admin-switch"><input type="checkbox" name="active" ${parameter?.active!==false?'checked':''}><span>Parámetro activo</span></label>
        </div>
        <div class="admin-modal-actions"><button type="button" class="secondary" data-close-dynamic-modal>Cancelar</button><button class="primary">${editing?'Guardar cambios':'Crear parámetro'}</button></div>
      </form>
    </section></div>`;
  }
  function updateModalTypeUI(){
    const form=document.querySelector('#dynamic-parameter-form');
    if(!form)return;
    const type=form.elements.type?.value || form.elements.lockedType.value;
    form.querySelector('.dynamic-options-field')?.classList.toggle('visible',type==='list');
    form.querySelector('.dynamic-range-fields')?.classList.toggle('hidden',!NUMERIC_TYPES.has(type));
    const aggregation=form.elements.aggregation;
    const current=aggregation.value;
    aggregation.innerHTML=aggregationOptions(type,current || defaultAggregation(type));
    if(![...aggregation.options].some(option=>option.value===current)) aggregation.value=defaultAggregation(type);
    if(type==='percentage'){
      if(form.elements.minimum.value==='')form.elements.minimum.value='0';
      if(form.elements.maximum.value==='')form.elements.maximum.value='100';
    }
  }
  function parametersView(){
    if(!isAdmin()){state.view='home';return homeView();}
    const active=parameters.filter(item=>item.active);
    const chartable=active.filter(item=>item.chartable);
    const sections=new Set(active.map(item=>item.section));
    app.innerHTML=shell(`${titleBlock('ADMINISTRADOR','Parámetros de evaluación','Crea nuevas variables sin modificar las columnas oficiales de Fenología y Biometría.',`<button class="primary" id="new-dynamic-parameter">+ Nuevo parámetro</button>`)}
      <section class="metrics-grid four">${metric(parameters.length,'Parámetros creados','🧩')}${metric(active.length,'Parámetros activos','✓')}${metric(chartable.length,'Disponibles en gráficos','📊')}${metric(sections.size,'Secciones activas','📂')}</section>
      <section class="panel dynamic-parameter-guide"><div><b>Funcionamiento</b><p>Los parámetros activos aparecen en registros nuevos. Al desactivarlos desaparecen del formulario, pero sus valores históricos permanecen.</p></div><div><b>Exportación</b><p>Las estructuras oficiales de 44 y 124 columnas no cambian. Los valores nuevos se descargan en un archivo adicional de formato largo.</p></div></section>
      <section class="panel"><div class="panel-head"><div><span>CATÁLOGO FLEXIBLE</span><h2>Variables configuradas</h2></div></div>
        <div class="dynamic-parameter-list">${parameters.length?parameters.map(parameter=>{
          const used=usedCount(parameter.id);
          return `<article class="dynamic-parameter-row ${parameter.active?'':'inactive'}">
            <div class="dynamic-parameter-icon">${NUMERIC_TYPES.has(parameter.type)?'123':parameter.type==='yesno'?'S/N':parameter.type==='date'?'📅':'Aa'}</div>
            <div class="dynamic-parameter-main"><b>${esc(parameter.name)}</b><small>${esc(parameter.section)} · ${esc(TYPES[parameter.type])}${parameter.unit?` · ${esc(parameter.unit)}`:''}</small><div><span>${parameter.required?'Obligatorio':'Opcional'}</span><span>${parameter.chartable?'Gráfico activo':'Sin gráfico'}</span><span>${used} registro(s)</span></div></div>
            <span class="admin-status ${parameter.active?'active':'inactive'}">${parameter.active?'Activo':'Inactivo'}</span>
            <div class="admin-row-actions"><button class="secondary" data-edit-dynamic-parameter="${esc(parameter.id)}">Editar</button><button class="${parameter.active?'danger-soft':'secondary'}" data-toggle-dynamic-parameter="${esc(parameter.id)}">${parameter.active?'Desactivar':'Activar'}</button></div>
          </article>`;
        }).join(''):'<div class="empty"><span>🧩</span><b>Aún no hay parámetros adicionales</b><p>Crea la primera variable cuando necesites ampliar la evaluación.</p></div>'}</div>
      </section><div id="dynamic-parameter-modal-host"></div>`);
  }

  function activeParameters(){return parameters.filter(item=>item.active);}
  function dynamicInput(parameter,record){
    const value=readStoredValue(record,parameter.id);
    const required=parameter.required?'required':'';
    const name=`dyn__${parameter.id}`;
    const label=`${esc(parameter.name)}${parameter.unit?` <small>(${esc(parameter.unit)})</small>`:''}${parameter.required?' <em>*</em>':''}`;
    if(parameter.type==='yesno') return `<label>${label}<select name="${name}" data-dynamic-parameter="${esc(parameter.id)}" ${required}><option value="">Seleccionar</option><option value="SI" ${String(value).toUpperCase()==='SI'?'selected':''}>Sí</option><option value="NO" ${String(value).toUpperCase()==='NO'?'selected':''}>No</option></select></label>`;
    if(parameter.type==='list') return `<label>${label}<select name="${name}" data-dynamic-parameter="${esc(parameter.id)}" ${required}><option value="">Seleccionar</option>${parameter.options.map(option=>`<option value="${esc(option)}" ${String(value)===option?'selected':''}>${esc(option)}</option>`).join('')}</select></label>`;
    if(parameter.type==='date') return `<label>${label}<input type="date" name="${name}" data-dynamic-parameter="${esc(parameter.id)}" value="${esc(value || '')}" ${required}></label>`;
    if(parameter.type==='text') return `<label>${label}<input type="text" maxlength="120" name="${name}" data-dynamic-parameter="${esc(parameter.id)}" value="${esc(value || '')}" ${required}></label>`;
    const min=parameter.minimum===null?'':`min="${parameter.minimum}"`,max=parameter.maximum===null?'':`max="${parameter.maximum}"`,step=parameter.type==='integer'?'1':'any';
    return `<label>${label}<input type="number" step="${step}" ${min} ${max} inputmode="decimal" name="${name}" data-dynamic-parameter="${esc(parameter.id)}" value="${valueBlank(value)?'':esc(value)}" ${required}></label>`;
  }
  function appendDynamicFields(){
    const form=document.querySelector('#evaluation-form');
    const container=form?.querySelector('.accordions');
    if(!container || container.querySelector('.dynamic-evaluation-section'))return;
    const active=activeParameters();
    if(!active.length)return;
    const editing=state.editingId?state.records.find(record=>record.id===state.editingId):null;
    const groups=new Map();
    active.forEach(parameter=>{if(!groups.has(parameter.section))groups.set(parameter.section,[]);groups.get(parameter.section).push(parameter);});
    const html=[...groups.entries()].map(([section,items])=>`<details class="dynamic-evaluation-section" open><summary><div><b>${esc(section)}</b><small>${items.length} parámetro(s) configurable(s)</small></div><span>⌄</span></summary><div class="accordion-body numeric-grid">${items.map(parameter=>dynamicInput(parameter,editing)).join('')}</div></details>`).join('');
    container.insertAdjacentHTML('beforeend',html);
  }
  function normalizeInputValue(raw,parameter){
    if(valueBlank(raw))return null;
    if(parameter.type==='integer'){
      const number=Number(raw);return Number.isFinite(number)?Math.trunc(number):null;
    }
    if(['decimal','percentage'].includes(parameter.type)){
      const number=Number(String(raw).replace(',','.'));return Number.isFinite(number)?number:null;
    }
    return safe(raw);
  }
  function collectDynamicValues(form){
    const result={};
    form.querySelectorAll('[data-dynamic-parameter]').forEach(input=>{
      const parameter=parameters.find(item=>item.id===input.dataset.dynamicParameter);if(!parameter)return;
      const value=normalizeInputValue(input.value,parameter);
      if(value===null||value==='')return;
      result[parameter.id]=parameterSnapshot(parameter,value);
    });
    return result;
  }

  const previousEvaluateView=evaluateView;
  evaluateView=function dynamicEvaluateView(){previousEvaluateView();appendDynamicFields();};

  const previousSaveEvaluation=saveEvaluation;
  saveEvaluation=function dynamicSaveEvaluation(form){
    const active=activeParameters();
    const collected=collectDynamicValues(form);
    const controls=[...form.querySelectorAll('[data-dynamic-parameter]')];
    const names=controls.map(control=>control.name);
    controls.forEach(control=>{control.name='';});
    try{previousSaveEvaluation(form);}finally{controls.forEach((control,index)=>{control.name=names[index];});}
    const record=state.records.find(item=>item.id===state.selectedRecordId);
    if(!record)return;
    const stored=clone(record.parametrosAdicionales || {});
    active.forEach(parameter=>{delete stored[parameter.id];});
    Object.assign(stored,collected);
    record.parametrosAdicionales=stored;
    record.parametrosAdicionalesActualizados=now();
    save();
    render();
  };

  const previousRecordDetailView=recordDetailView;
  recordDetailView=function dynamicRecordDetailView(){
    previousRecordDetailView();
    const record=state.records.find(item=>item.id===state.selectedRecordId);if(!record)return;
    const stored=record.parametrosAdicionales || {};
    const definitions=new Map(activeParameters().map(item=>[item.id,item]));
    Object.entries(stored).forEach(([id,entry])=>{
      if(definitions.has(id))return;
      const snapshot=entry&&typeof entry==='object'?entry:{};
      definitions.set(id,normalizeParameter({id,name:snapshot.name||id,section:snapshot.section||'Histórico',type:snapshot.type||'text',unit:snapshot.unit||'',active:false}));
    });
    if(!definitions.size)return;
    const groups=new Map();
    definitions.forEach(parameter=>{if(!groups.has(parameter.section))groups.set(parameter.section,[]);groups.get(parameter.section).push(parameter);});
    const panel=`<section class="panel dynamic-detail-panel"><div class="panel-head"><div><span>PARÁMETROS ADICIONALES</span><h2>Variables configurables</h2><p>“No registrado” significa que el parámetro todavía no existía o no fue llenado en esta evaluación.</p></div></div>${[...groups.entries()].map(([section,items])=>`<div class="dynamic-detail-group"><h3>${esc(section)}</h3><div class="detail-grid">${items.map(parameter=>`<div class="detail-item"><span>${esc(parameter.name)}</span><b>${esc(formatValue(readStoredValue(record,parameter.id),parameter))}</b></div>`).join('')}</div></div>`).join('')}</section>`;
    document.querySelector('.content')?.insertAdjacentHTML('beforeend',panel);
  };

  function csvCell(value){const text=String(value??'');return /[;"\n\r]/.test(text)?`"${text.replaceAll('"','""')}"`:text;}
  function isoWeek(dateText){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateText||''))return '';
    const date=new Date(`${dateText}T12:00:00Z`),day=date.getUTCDay()||7,thursday=new Date(date);thursday.setUTCDate(date.getUTCDate()+4-day);
    const start=new Date(Date.UTC(thursday.getUTCFullYear(),0,1));return Math.ceil((((thursday-start)/86400000)+1)/7);
  }
  function exportDynamicCsv(){
    const rows=[];
    state.records.forEach(record=>Object.entries(record.parametrosAdicionales || {}).forEach(([id,entry])=>{
      const parameter=parameters.find(item=>item.id===id) || normalizeParameter({id,name:entry?.name||id,section:entry?.section||'Histórico',type:entry?.type||'text',unit:entry?.unit||'',active:false});
      const value=readStoredValue(record,id);if(valueBlank(value))return;
      const date=record.date||'',parsed=date?new Date(`${date}T12:00:00`):null;
      rows.push([record.id,date,isoWeek(date),parsed?parsed.getMonth()+1:'',parsed?parsed.getFullYear():'',record.field,record.farm,record.module,record.lot,record.quadrant,record.variety,record.evaluator||record.evaluatorId,id,parameter.name,parameter.section,TYPES[parameter.type],value,parameter.unit]);
    }));
    if(!rows.length)return showToast('No hay parámetros adicionales registrados para exportar.');
    const headers=['ID DATA','FECHA','SEMANA','MES','AÑO','CAMPO','FUNDO','MODULO','TURNO-LOTE','CUADRANTE','VARIEDAD','EVALUADOR','PARAMETRO ID','PARAMETRO','SECCION','TIPO','VALOR','UNIDAD'];
    const csv='\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n');
    downloadFile(`PARAMETROS_ADICIONALES_${today().replaceAll('-','')}.csv`,csv,'text/csv;charset=utf-8');
    showToast(`${rows.length} valor(es) adicionales exportados.`);
  }
  const previousExportView=exportView;
  exportView=function dynamicExportView(){
    previousExportView();
    const content=document.querySelector('.content');if(!content||content.querySelector('.dynamic-export-panel'))return;
    content.insertAdjacentHTML('beforeend',`<section class="panel dynamic-export-panel"><div class="panel-head"><div><span>PARÁMETROS ADICIONALES</span><h2>Exportación flexible para Power BI</h2><p>Descarga únicamente los valores configurables. Las exportaciones oficiales de 44 y 124 columnas permanecen intactas.</p></div><button class="primary" id="export-dynamic-parameters">Descargar CSV</button></div></section>`);
  };

  function inferredCampaign(record){
    if(record.campaign)return record.campaign;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(record.date||''))return '';
    const [year,month]=record.date.split('-').map(Number);
    return month>=10?`${year}-${year+1}`:`${year-1}-${year}`;
  }
  function filteredChartRecords(){
    const values={from:'#chart-from',to:'#chart-to',campaign:'#chart-campaign',field:'#chart-field',farm:'#chart-farm',module:'#chart-module',lot:'#chart-lot',variety:'#chart-variety',quadrant:'#chart-quadrant',evaluator:'#chart-evaluator'};
    const filters=Object.fromEntries(Object.entries(values).map(([key,selector])=>[key,document.querySelector(selector)?.value || '']));
    return state.records.filter(record=>{
      if(filters.from&&record.date<filters.from)return false;if(filters.to&&record.date>filters.to)return false;
      if(filters.campaign&&inferredCampaign(record)!==filters.campaign)return false;if(filters.field&&record.field!==filters.field)return false;
      if(filters.farm&&record.farm!==filters.farm)return false;if(filters.module&&record.module!==filters.module)return false;
      if(filters.lot&&record.lot!==filters.lot)return false;if(filters.variety&&record.variety!==filters.variety)return false;
      if(filters.quadrant&&record.quadrant!==filters.quadrant)return false;
      if(filters.evaluator&&(record.evaluatorId||record.evaluator)!==filters.evaluator)return false;
      return true;
    });
  }
  function weekGroup(dateText){
    if(!dateText)return {key:'Sin fecha',label:'Sin fecha'};
    return {key:`${dateText.slice(0,4)}-${String(isoWeek(dateText)).padStart(2,'0')}`,label:`S${String(isoWeek(dateText)).padStart(2,'0')}`};
  }
  function groupLabel(record,group){
    if(group==='week')return weekGroup(record.date);
    const labels={field:'Campo',farm:'Fundo',module:'Módulo',lot:'Lote',variety:'Variedad',quadrant:'Cuadrante'};
    return {key:safe(record[group])||`Sin ${labels[group]?.toLowerCase()||'dato'}`,label:safe(record[group])||'Sin dato'};
  }
  function aggregate(values,parameter){
    const valid=values.filter(value=>!valueBlank(value));
    if(!valid.length)return null;
    if(parameter.type==='yesno'&&parameter.aggregation==='percent_yes') return valid.filter(value=>String(value).toUpperCase()==='SI').length/valid.length*100;
    if(!NUMERIC_TYPES.has(parameter.type)||parameter.aggregation==='count')return valid.length;
    const numbers=valid.map(Number).filter(Number.isFinite);if(!numbers.length)return null;
    if(parameter.aggregation==='sum')return numbers.reduce((a,b)=>a+b,0);
    if(parameter.aggregation==='min')return Math.min(...numbers);
    if(parameter.aggregation==='max')return Math.max(...numbers);
    return numbers.reduce((a,b)=>a+b,0)/numbers.length;
  }
  function chartUnit(parameter){return parameter.type==='yesno'&&parameter.aggregation==='percent_yes'?'%':parameter.unit||'';}
  function aggregationLabel(parameter){
    return ({average:'Promedio',sum:'Suma',count:'Conteo',min:'Mínimo',max:'Máximo',percent_yes:'% de Sí'})[parameter.aggregation] || parameter.aggregation;
  }
  function renderDynamicChartPanel(){
    const host=document.querySelector('.dynamic-chart-panel');if(!host)return;
    const chartable=activeParameters().filter(item=>item.chartable);
    if(!chartable.length){host.innerHTML='<div class="chart-empty"><span>🧩</span><b>Sin parámetros configurables para gráficos</b><p>Activa “Disponible en gráficos” desde el Administrador.</p></div>';return;}
    if(!chartable.some(item=>item.id===ui.chartParameter))ui.chartParameter=chartable[0].id;
    const parameter=chartable.find(item=>item.id===ui.chartParameter);
    const records=filteredChartRecords();
    const groups=new Map();
    records.forEach(record=>{
      const group=groupLabel(record,ui.chartGroup);if(!groups.has(group.key))groups.set(group.key,{...group,values:[]});
      const value=readStoredValue(record,parameter.id);if(!valueBlank(value))groups.get(group.key).values.push(value);
    });
    const items=[...groups.values()].map(group=>({...group,value:aggregate(group.values,parameter)})).filter(item=>item.value!==null)
      .sort((a,b)=>ui.chartGroup==='week'?a.key.localeCompare(b.key):b.value-a.value);
    const max=Math.max(1,...items.map(item=>Number(item.value)||0));
    const unit=chartUnit(parameter),observations=items.reduce((total,item)=>total+item.values.length,0),overall=aggregate(items.flatMap(item=>item.values),parameter);
    host.innerHTML=`<div class="panel-head"><div><span>PARÁMETROS CONFIGURABLES</span><h2>${esc(parameter.name)}</h2><p>Respeta los filtros generales mostrados en esta página.</p></div></div>
      <div class="dynamic-chart-controls"><label>Parámetro<select id="dynamic-chart-parameter">${chartable.map(item=>`<option value="${esc(item.id)}" ${item.id===parameter.id?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label><label>Agrupar por<select id="dynamic-chart-group">${[['week','Semana'],['field','Campo'],['farm','Fundo'],['module','Módulo'],['lot','Turno-Lote'],['variety','Variedad'],['quadrant','Cuadrante']].map(([value,label])=>`<option value="${value}" ${ui.chartGroup===value?'selected':''}>${label}</option>`).join('')}</select></label><div class="dynamic-chart-total"><b>${overall===null?'—':Number(overall).toLocaleString('es-PE',{maximumFractionDigits:2})}${unit?` ${unit}`:''}</b><span>${aggregationLabel(parameter)} · ${observations} dato(s)</span></div></div>
      ${items.length?`<div class="dynamic-bars">${items.slice(0,40).map((item,index)=>`<div class="dynamic-bar-row"><span>${esc(item.label)}</span><i><em class="chart-bg-${index%6}" style="width:${Math.max(2,(item.value/max)*100)}%"></em></i><b>${Number(item.value).toLocaleString('es-PE',{maximumFractionDigits:2})}${unit?` ${esc(unit)}`:''}</b></div>`).join('')}</div>`:'<div class="chart-empty"><span>📊</span><b>Sin valores registrados</b><p>Los registros filtrados todavía no contienen este parámetro.</p></div>'}`;
  }
  const previousChartsView=chartsView;
  chartsView=function dynamicChartsView(){
    previousChartsView();
    const content=document.querySelector('.content');if(!content||content.querySelector('.dynamic-chart-panel'))return;
    content.insertAdjacentHTML('beforeend','<section class="panel chart-card dynamic-chart-panel"></section>');
    renderDynamicChartPanel();
  };

  const previousSidebar=sidebar;
  sidebar=function dynamicParameterSidebar(){
    const html=previousSidebar();if(!isAdmin())return html;
    const wrapper=document.createElement('div');wrapper.innerHTML=html;const nav=wrapper.querySelector('nav');
    if(nav&&!nav.querySelector('[data-view="admin-parameters"]')){
      const anchor=nav.querySelector('[data-view="admin-settings"]');
      const button=`<button data-view="admin-parameters" class="${state.view==='admin-parameters'?'active':''}"><span>🧩</span>Parámetros</button>`;
      anchor?anchor.insertAdjacentHTML('beforebegin',button):nav.insertAdjacentHTML('beforeend',button);
    }
    return wrapper.innerHTML;
  };
  const previousRender=render;
  render=function dynamicParameterRender(){
    if(state.session&&state.view==='admin-parameters')return parametersView();
    return previousRender();
  };

  const originalDownloadFile=downloadFile;
  async function checksum(core){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(core)));
    return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  downloadFile=function dynamicAwareDownload(filename,content,type){
    if(/^RESPALDO_FENOLOGIA_.*\.json$/i.test(filename)){
      try{const payload=JSON.parse(content);payload.dynamicParameters=clone(parameters);content=JSON.stringify(payload,null,2);}catch{}
      return originalDownloadFile(filename,content,type);
    }
    if(/^CONFIG_FENOLOGIA_.*\.json$/i.test(filename)){
      (async()=>{
        try{const payload=JSON.parse(content),{checksum:oldChecksum,...core}=payload;core.dynamicParameters=clone(parameters);const enhanced={...core,checksum:await checksum(core)};originalDownloadFile(filename,JSON.stringify(enhanced,null,2),type);}catch{originalDownloadFile(filename,content,type);}
      })();
      return;
    }
    return originalDownloadFile(filename,content,type);
  };
  const previousImportBackup=importBackup;
  importBackup=async function dynamicAwareImportBackup(file){
    try{const payload=JSON.parse(await file.text());if(Array.isArray(payload.dynamicParameters))await replaceCatalog(payload.dynamicParameters,'Parámetros recuperados desde respaldo');}catch{}
    return previousImportBackup(file);
  };

  document.addEventListener('submit',async event=>{
    if(event.target.id!=='dynamic-parameter-form')return;
    event.preventDefault();event.stopImmediatePropagation();
    const data=new FormData(event.target),id=safe(data.get('id')),existing=parameters.find(item=>item.id===id);
    const type=safe(data.get('type')||data.get('lockedType'));
    const name=safe(data.get('name')),section=safe(data.get('section'));
    if(!name||!section)return showToast('Completa el nombre y la sección.');
    if(parameters.some(item=>item.id!==id&&item.name.toLowerCase()===name.toLowerCase()&&item.section.toLowerCase()===section.toLowerCase()))return showToast('Ya existe un parámetro con ese nombre en la sección.');
    const minimum=valueBlank(data.get('minimum'))?null:Number(data.get('minimum')),maximum=valueBlank(data.get('maximum'))?null:Number(data.get('maximum'));
    if(minimum!==null&&maximum!==null&&minimum>maximum)return showToast('El valor mínimo no puede superar al máximo.');
    const options=unique(safe(data.get('options')).split(/\r?\n/));
    if(type==='list'&&!options.length)return showToast('Agrega al menos una opción para la lista.');
    const parameter=normalizeParameter({
      ...(existing||{}),id:existing?.id||`PAR-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`,
      name,section,type,unit:safe(data.get('unit')),minimum,maximum,options,
      required:data.get('required')==='on',chartable:data.get('chartable')==='on',active:data.get('active')==='on',
      aggregation:safe(data.get('aggregation'))||defaultAggregation(type),revision:(existing?.revision||0)+1,
      createdAt:existing?.createdAt||now(),updatedAt:now()
    });
    if(existing)parameters[parameters.findIndex(item=>item.id===existing.id)]=parameter;else parameters.push(parameter);
    await persist(existing?'Parámetro actualizado':'Parámetro creado',{parametro:parameter.name,seccion:parameter.section,tipo:TYPES[parameter.type]});
    document.querySelector('#dynamic-parameter-modal')?.remove();parametersView();showToast(existing?'Parámetro actualizado.':'Parámetro creado.');
  },true);

  document.addEventListener('click',async event=>{
    if(event.target.closest('#new-dynamic-parameter')){document.querySelector('#dynamic-parameter-modal-host').innerHTML=parameterModal();updateModalTypeUI();return;}
    const edit=event.target.closest('[data-edit-dynamic-parameter]');if(edit){const parameter=parameters.find(item=>item.id===edit.dataset.editDynamicParameter);document.querySelector('#dynamic-parameter-modal-host').innerHTML=parameterModal(parameter);updateModalTypeUI();return;}
    const toggle=event.target.closest('[data-toggle-dynamic-parameter]');if(toggle){const parameter=parameters.find(item=>item.id===toggle.dataset.toggleDynamicParameter);if(!parameter)return;parameter.active=!parameter.active;parameter.updatedAt=now();parameter.revision++;await persist(parameter.active?'Parámetro activado':'Parámetro desactivado',{parametro:parameter.name});parametersView();return;}
    if(event.target.closest('[data-close-dynamic-modal]')){document.querySelector('#dynamic-parameter-modal')?.remove();return;}
    if(event.target.closest('#export-dynamic-parameters')){exportDynamicCsv();return;}
  });
  document.addEventListener('change',event=>{
    if(event.target.matches('#dynamic-parameter-form [name="type"]')){updateModalTypeUI();return;}
    if(event.target.id==='dynamic-chart-parameter'){ui.chartParameter=event.target.value;renderDynamicChartPanel();return;}
    if(event.target.id==='dynamic-chart-group'){ui.chartGroup=event.target.value;renderDynamicChartPanel();return;}
    if(['config-package-file','login-config-file'].includes(event.target.id)&&event.target.files?.[0]){
      (async()=>{
        try{
          const payload=JSON.parse(await event.target.files[0].text());
          if(!Array.isArray(payload.dynamicParameters))return;
          const {checksum:signature,...core}=payload;
          if(signature&&await checksum(core)!==signature)return;
          await replaceCatalog(payload.dynamicParameters,'Parámetros aplicados desde paquete de configuración');
        }catch(error){console.warn('No se pudieron importar los parámetros configurables:',error);}
      })();
    }
  },true);

  window.FenologiaDynamicParameters={
    ready:()=>initialize(),parameters:()=>clone(parameters),history:()=>clone(parameterHistory),replace:replaceCatalog,version:VERSION
  };
  initialize().then(()=>{if(state.catalog&&state.session)render();});
})();
