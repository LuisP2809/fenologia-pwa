(() => {
  const FILTER_KEY = 'fenologia-export-period-v1';

  function localIsoDate(date = new Date()){
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0,10);
  }

  function readFilter(){
    const fallback = {mode:'today',from:localIsoDate(),to:localIsoDate()};
    try{
      const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
      return {...fallback,...(saved || {})};
    }catch{
      return fallback;
    }
  }

  const exportFilter = readFilter();

  function saveFilter(){
    localStorage.setItem(FILTER_KEY, JSON.stringify(exportFilter));
  }

  function dateAtNoon(value){
    return new Date(`${value}T12:00:00`);
  }

  function addDays(date, days){
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function periodBounds(){
    const todayValue = localIsoDate();
    const todayDate = dateAtNoon(todayValue);

    if(exportFilter.mode === 'today') return {from:todayValue,to:todayValue,label:'Hoy'};
    if(exportFilter.mode === 'yesterday'){
      const yesterday = localIsoDate(addDays(todayDate,-1));
      return {from:yesterday,to:yesterday,label:'Ayer'};
    }
    if(exportFilter.mode === 'week'){
      const weekday = todayDate.getDay() || 7;
      const monday = addDays(todayDate,1-weekday);
      return {from:localIsoDate(monday),to:todayValue,label:'Semana actual'};
    }
    if(exportFilter.mode === 'range'){
      return {from:exportFilter.from || '',to:exportFilter.to || '',label:'Rango personalizado'};
    }
    return {from:null,to:null,label:'Todos los registros'};
  }

  function periodValidation(){
    const bounds = periodBounds();
    if(exportFilter.mode === 'range' && (!bounds.from || !bounds.to)){
      return {ok:false,message:'Selecciona la fecha inicial y final.',bounds};
    }
    if(bounds.from && bounds.to && bounds.from > bounds.to){
      return {ok:false,message:'La fecha inicial no puede ser posterior a la fecha final.',bounds};
    }
    return {ok:true,bounds};
  }

  function filteredRecords(){
    const validation = periodValidation();
    if(!validation.ok) return [];
    const {from,to} = validation.bounds;
    if(!from && !to) return state.records.slice();
    return state.records.filter(record => record.date && record.date >= from && record.date <= to);
  }

  function formatDisplayDate(value){
    if(!value) return '—';
    const [year,month,day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  function formatFileDate(value){
    const [year,month,day] = value.split('-');
    return `${day}_${month}_${year.slice(-2)}`;
  }

  function actualDateRange(records){
    const dates = records.map(record => record.date).filter(Boolean).sort();
    if(!dates.length) return null;
    return {from:dates[0],to:dates[dates.length-1]};
  }

  function exportFileName(type, records){
    const actual = actualDateRange(records);
    const prefix = type === 'fenologia' ? 'Fenologia' : 'Biometria';
    if(!actual) return `${prefix}.csv`;
    if(actual.from === actual.to) return `${prefix}-${formatFileDate(actual.from)}.csv`;
    return `${prefix}-${formatFileDate(actual.from)} al ${formatFileDate(actual.to)}.csv`;
  }

  function selectedPeriodText(){
    const validation = periodValidation();
    if(!validation.ok) return validation.message;
    const {bounds} = validation;
    if(!bounds.from && !bounds.to) return 'Todos los registros disponibles';
    if(bounds.from === bounds.to) return formatDisplayDate(bounds.from);
    return `${formatDisplayDate(bounds.from)} al ${formatDisplayDate(bounds.to)}`;
  }

  function updateExportPeriodSummary(){
    const panel = document.querySelector('.export-period-panel');
    if(!panel) return;

    const validation = periodValidation();
    const records = validation.ok ? filteredRecords() : [];
    const lots = new Set(records.map(record => record.lot).filter(Boolean)).size;
    const fields = new Set(records.map(record => record.field).filter(Boolean)).size;

    const custom = panel.querySelector('.export-custom-range');
    if(custom) custom.hidden = exportFilter.mode !== 'range';

    const period = panel.querySelector('#export-period-text');
    const count = panel.querySelector('#export-record-count');
    const lotCount = panel.querySelector('#export-lot-count');
    const fieldCount = panel.querySelector('#export-field-count');
    const warning = panel.querySelector('#export-period-warning');

    if(period) period.textContent = selectedPeriodText();
    if(count) count.textContent = String(records.length);
    if(lotCount) lotCount.textContent = String(lots);
    if(fieldCount) fieldCount.textContent = String(fields);
    if(warning){
      warning.textContent = validation.ok
        ? (records.length ? 'La exportación incluirá únicamente estos registros.' : 'No hay evaluaciones en el periodo seleccionado.')
        : validation.message;
      warning.classList.toggle('error', !validation.ok || records.length === 0);
    }

    ['#export-csv','#export-bio'].forEach(selector => {
      const button = document.querySelector(selector);
      if(button) button.disabled = !validation.ok || records.length === 0;
    });
  }

  function periodPanelHtml(){
    const mode = exportFilter.mode;
    return `<section class="panel export-period-panel">
      <div class="export-period-heading">
        <div class="export-period-icon">📅</div>
        <div><span>PERIODO A EXPORTAR</span><h2>Selecciona uno o varios días</h2><p>“Hoy” está seleccionado por defecto para evitar mezclar fechas accidentalmente.</p></div>
      </div>
      <div class="export-period-controls">
        <label>Periodo
          <select id="export-period-mode">
            <option value="today" ${mode==='today'?'selected':''}>Hoy</option>
            <option value="yesterday" ${mode==='yesterday'?'selected':''}>Ayer</option>
            <option value="week" ${mode==='week'?'selected':''}>Semana actual</option>
            <option value="range" ${mode==='range'?'selected':''}>Rango personalizado</option>
            <option value="all" ${mode==='all'?'selected':''}>Todos los registros</option>
          </select>
        </label>
        <div class="export-custom-range" ${mode==='range'?'':'hidden'}>
          <label>Desde<input id="export-date-from" type="date" value="${esc(exportFilter.from)}"></label>
          <label>Hasta<input id="export-date-to" type="date" value="${esc(exportFilter.to)}"></label>
        </div>
      </div>
      <div class="export-period-summary">
        <div class="export-period-description"><span>Periodo seleccionado</span><b id="export-period-text"></b><small id="export-period-warning"></small></div>
        <div><strong id="export-record-count">0</strong><span>Evaluaciones</span></div>
        <div><strong id="export-lot-count">0</strong><span>Lotes</span></div>
        <div><strong id="export-field-count">0</strong><span>Campos</span></div>
      </div>
    </section>`;
  }

  const previousSidebar = sidebar;
  sidebar = function exportFilterSidebar(){
    return previousSidebar().replace('Versión 0.5','Versión 0.5.1');
  };

  const previousExportView = exportView;
  exportView = function filteredExportView(){
    previousExportView();
    const grid = document.querySelector('.export-grid');
    if(!grid || document.querySelector('.export-period-panel')) return;
    grid.insertAdjacentHTML('beforebegin', periodPanelHtml());

    const backupButton = document.querySelector('#backup');
    if(backupButton){
      const title = backupButton.querySelector('b');
      const description = backupButton.querySelector('p');
      const tag = backupButton.querySelector('em');
      if(title) title.textContent = 'Crear respaldo completo';
      if(description) description.textContent = 'Incluye todos los registros y habilita la limpieza protegida.';
      if(tag) tag.textContent = 'Todos los datos';
    }

    updateExportPeriodSummary();
  };

  exportExact = function exportExactByPeriod(type){
    const validation = periodValidation();
    if(!validation.ok) return showToast(validation.message);

    const records = filteredRecords();
    if(!records.length) return showToast('No hay evaluaciones para exportar en el periodo seleccionado.');

    const headers = type === 'fenologia' ? FENO_HEADERS : BIO_HEADERS;
    const rowBuilder = type === 'fenologia' ? fenologyRow : biometryRow;
    const rows = records.map(rowBuilder);
    if(rows.some(row => row.length !== headers.length)) return showToast('No se pudo validar la estructura de exportación.');

    const csv = '\ufeff' + [headers,...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
    downloadFile(exportFileName(type,records),csv,'text/csv;charset=utf-8');
    showToast(`${records.length} evaluación(es) exportadas en ${headers.length} columnas.`);
  };

  document.addEventListener('change', event => {
    if(event.target.id === 'export-period-mode'){
      exportFilter.mode = event.target.value;
      saveFilter();
      updateExportPeriodSummary();
      return;
    }
    if(event.target.id === 'export-date-from'){
      exportFilter.from = event.target.value;
      saveFilter();
      updateExportPeriodSummary();
      return;
    }
    if(event.target.id === 'export-date-to'){
      exportFilter.to = event.target.value;
      saveFilter();
      updateExportPeriodSummary();
    }
  });
})();