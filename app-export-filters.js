(() => {
  const FILTER_KEY = 'fenologia-export-period-v1';

  function localIsoDate(date = new Date()){
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0,10);
  }

  function readFilter(){
    const current = localIsoDate();
    try{
      const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
      return {
        from: saved?.from || current,
        to: saved?.to || current
      };
    }catch{
      return {from:current,to:current};
    }
  }

  const exportFilter = readFilter();

  function saveFilter(){
    localStorage.setItem(FILTER_KEY, JSON.stringify({from:exportFilter.from,to:exportFilter.to}));
  }

  function periodValidation(){
    const bounds = {from:exportFilter.from || '',to:exportFilter.to || ''};
    if(!bounds.from || !bounds.to){
      return {ok:false,message:'Selecciona la fecha inicial y final.',bounds};
    }
    if(bounds.from > bounds.to){
      return {ok:false,message:'La fecha inicial no puede ser posterior a la fecha final.',bounds};
    }
    return {ok:true,bounds};
  }

  function filteredRecords(){
    const validation = periodValidation();
    if(!validation.ok) return [];
    const {from,to} = validation.bounds;
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

  function exportFileName(type, bounds){
    const prefix = type === 'fenologia' ? 'Fenologia' : 'Biometria';
    if(bounds.from === bounds.to) return `${prefix}-${formatFileDate(bounds.from)}.csv`;
    return `${prefix}-${formatFileDate(bounds.from)} al ${formatFileDate(bounds.to)}.csv`;
  }

  function selectedPeriodText(){
    const validation = periodValidation();
    if(!validation.ok) return validation.message;
    const {from,to} = validation.bounds;
    if(from === to) return formatDisplayDate(from);
    return `${formatDisplayDate(from)} al ${formatDisplayDate(to)}`;
  }

  function updateExportPeriodSummary(){
    const panel = document.querySelector('.export-period-panel');
    if(!panel) return;

    const validation = periodValidation();
    const records = validation.ok ? filteredRecords() : [];
    const lots = new Set(records.map(record => record.lot).filter(Boolean)).size;
    const fields = new Set(records.map(record => record.field).filter(Boolean)).size;

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
        ? (records.length ? 'La exportación incluirá únicamente estos registros.' : 'No hay evaluaciones en el rango seleccionado.')
        : validation.message;
      warning.classList.toggle('error', !validation.ok || records.length === 0);
    }

    ['#export-csv','#export-bio'].forEach(selector => {
      const button = document.querySelector(selector);
      if(button) button.disabled = !validation.ok || records.length === 0;
    });
  }

  function periodPanelHtml(){
    return `<section class="panel export-period-panel">
      <div class="export-period-heading">
        <div class="export-period-icon">📅</div>
        <div><span>PERIODO A EXPORTAR</span><h2>Selecciona el rango de fechas</h2><p>Para exportar un solo día, coloca la misma fecha en “Desde” y “Hasta”.</p></div>
      </div>
      <div class="export-period-controls">
        <div class="export-custom-range">
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
    return previousSidebar().replace(/Versión\s+[0-9.]+/,'Versión 0.5.3');
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
    if(!records.length) return showToast('No hay evaluaciones para exportar en el rango seleccionado.');

    const headers = type === 'fenologia' ? FENO_HEADERS : BIO_HEADERS;
    const rowBuilder = type === 'fenologia' ? fenologyRow : biometryRow;
    const rows = records.map(rowBuilder);
    if(rows.some(row => row.length !== headers.length)) return showToast('No se pudo validar la estructura de exportación.');

    const csv = '\ufeff' + [headers,...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
    downloadFile(exportFileName(type,validation.bounds),csv,'text/csv;charset=utf-8');
    showToast(`${records.length} evaluación(es) exportadas en ${headers.length} columnas.`);
  };

  document.addEventListener('change', event => {
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