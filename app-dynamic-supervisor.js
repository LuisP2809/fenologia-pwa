(() => {
  const HEADERS=['ID DATA','FECHA','SEMANA','MES','AÑO','CAMPO','FUNDO','MODULO','TURNO-LOTE','CUADRANTE','VARIEDAD','EVALUADOR','PARAMETRO ID','PARAMETRO','SECCION','TIPO','VALOR','UNIDAD'];
  const TYPE_LABELS={integer:'Número entero',decimal:'Número decimal',percentage:'Porcentaje',yesno:'Sí / No',list:'Lista de opciones',text:'Texto corto',date:'Fecha'};
  const NUMERIC=new Set(['integer','decimal','percentage']);
  const pending=new Map();
  const safe=value=>String(value??'').trim();
  const blank=value=>value===''||value===null||value===undefined;
  const normalized=value=>safe(value).replace(/^\uFEFF/,'').replace(/\s+/g,' ').toUpperCase();

  function parseDelimited(text){
    const first=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).find(line=>line.trim())||'';
    const delimiter=[';',',','\t'].map(value=>({value,count:first.split(value).length})).sort((a,b)=>b.count-a.count)[0].value;
    const rows=[];let row=[],cell='',quoted=false;const input=String(text).replace(/^\uFEFF/,'');
    for(let index=0;index<input.length;index++){
      const character=input[index];
      if(quoted){
        if(character==='"'&&input[index+1]==='"'){cell+='"';index++;}
        else if(character==='"')quoted=false;
        else cell+=character;
      }else if(character==='"')quoted=true;
      else if(character===delimiter){row.push(cell);cell='';}
      else if(character==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}
      else cell+=character;
    }
    if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
    return rows.filter(values=>values.some(value=>safe(value)!==''));
  }
  function recognized(rows){
    const headers=(rows[0]||[]).map(normalized);
    return headers.length===HEADERS.length&&headers.every((header,index)=>header===normalized(HEADERS[index]));
  }
  function typeKey(label){return Object.entries(TYPE_LABELS).find(([,text])=>normalized(text)===normalized(label))?.[0]||'text';}
  function aggregation(type){return NUMERIC.has(type)?'average':type==='yesno'?'percent_yes':'count';}
  function normalizeValue(raw,type){
    if(blank(raw))return null;
    if(type==='integer'){const number=Number(raw);return Number.isFinite(number)?Math.trunc(number):null;}
    if(NUMERIC.has(type)){const number=Number(String(raw).replace(',','.'));return Number.isFinite(number)?number:null;}
    return safe(raw);
  }
  function snapshot(parameter,value){return {value,name:parameter.name,section:parameter.section,type:parameter.type,unit:parameter.unit||'',definitionRevision:parameter.revision||1,recordedAt:new Date().toISOString()};}
  function storedValue(record,id){const entry=record?.parametrosAdicionales?.[id];return entry&&typeof entry==='object'&&Object.prototype.hasOwnProperty.call(entry,'value')?entry.value:entry;}

  async function importDynamicText(text,fileName){
    const rows=parseDelimited(text);if(!recognized(rows))return {recognized:false,applied:0,pending:0};
    const definitions=window.FenologiaDynamicParameters.parameters();let changed=false;
    rows.slice(1).forEach(row=>{
      if(row.length!==HEADERS.length)return;
      const recordId=safe(row[0]),parameterId=safe(row[12]);if(!recordId||!parameterId)return;
      let parameter=definitions.find(item=>item.id===parameterId);
      if(!parameter){
        const type=typeKey(row[15]);
        parameter={id:parameterId,name:safe(row[13])||parameterId,section:safe(row[14])||'Importados',type,unit:safe(row[17]),minimum:type==='percentage'?0:null,maximum:type==='percentage'?100:null,options:[],required:false,active:true,chartable:NUMERIC.has(type)||type==='yesno',aggregation:aggregation(type),revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        definitions.push(parameter);changed=true;
      }
      const value=normalizeValue(row[16],parameter.type);if(value===null||value==='')return;
      if(!pending.has(recordId))pending.set(recordId,{});
      pending.get(recordId)[parameterId]=snapshot(parameter,value);
    });
    if(changed)await window.FenologiaDynamicParameters.replace(definitions,'Parámetros detectados en importación');
    return {recognized:true,...applyPending()};
  }
  function applyPending(){
    let applied=0;
    for(const [recordId,values] of [...pending.entries()]){
      const record=state.records.find(item=>item.id===recordId);if(!record)continue;
      record.parametrosAdicionales={...(record.parametrosAdicionales||{}),...values};
      record.parametrosAdicionalesActualizados=new Date().toISOString();
      pending.delete(recordId);applied+=Object.keys(values).length;
    }
    if(applied)save();
    const waiting=[...pending.values()].reduce((total,item)=>total+Object.keys(item).length,0);
    return {applied,pending:waiting};
  }
  async function interceptFiles(input){
    const files=[...(input.files||[])];if(!files.length)return;
    const regular=[];let dynamicFiles=0,applied=0,waiting=0;
    for(const file of files){
      try{
        const text=await file.text(),rows=parseDelimited(text);
        if(recognized(rows)){const result=await importDynamicText(text,file.name);dynamicFiles++;applied+=result.applied;waiting=result.pending;}
        else regular.push(file);
      }catch{regular.push(file);}
    }
    if(dynamicFiles)showToast(`${dynamicFiles} archivo(s) de parámetros: ${applied} valor(es) aplicados${waiting?` y ${waiting} pendientes`:''}.`);
    if(regular.length){
      input.dataset.dynamicReplay='1';
      if(regular.length!==files.length&&typeof DataTransfer!=='undefined'){
        const transfer=new DataTransfer();regular.forEach(file=>transfer.items.add(file));input.files=transfer.files;
      }else if(regular.length!==files.length&&typeof DataTransfer==='undefined'){
        delete input.dataset.dynamicReplay;input.value='';showToast('Selecciona nuevamente los archivos oficiales.');return;
      }
      input.dispatchEvent(new Event('change',{bubbles:true}));delete input.dataset.dynamicReplay;
    }else input.value='';
  }

  function csvCell(value){const text=String(value??'');return /[;"\n\r]/.test(text)?`"${text.replaceAll('"','""')}"`:text;}
  function isoWeek(dateText){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateText||''))return '';
    const date=new Date(`${dateText}T12:00:00Z`),day=date.getUTCDay()||7,thursday=new Date(date);thursday.setUTCDate(date.getUTCDate()+4-day);
    const start=new Date(Date.UTC(thursday.getUTCFullYear(),0,1));return Math.ceil((((thursday-start)/86400000)+1)/7);
  }
  function rowsFor(records){
    const definitions=window.FenologiaDynamicParameters.parameters();const rows=[];
    records.forEach(record=>Object.entries(record.parametrosAdicionales||{}).forEach(([id,entry])=>{
      const parameter=definitions.find(item=>item.id===id)||{id,name:entry?.name||id,section:entry?.section||'Histórico',type:entry?.type||'text',unit:entry?.unit||''};
      const value=storedValue(record,id);if(blank(value))return;
      const date=record.date||'',parsed=date?new Date(`${date}T12:00:00`):null;
      rows.push([record.id,date,isoWeek(date),parsed?parsed.getMonth()+1:'',parsed?parsed.getFullYear():'',record.field,record.farm,record.module,record.lot,record.quadrant,record.variety,record.evaluator||record.evaluatorId,id,parameter.name,parameter.section,TYPE_LABELS[parameter.type]||parameter.type,value,parameter.unit||'']);
    }));
    return rows;
  }
  function rangeRecords(){
    const from=document.querySelector('#supervisor-export-from')?.value||'',to=document.querySelector('#supervisor-export-to')?.value||'';
    return state.records.filter(record=>(!from||record.date>=from)&&(!to||record.date<=to));
  }
  function exportConsolidatedDynamic(){
    const records=rangeRecords(),rows=rowsFor(records);if(!rows.length)return showToast('No hay parámetros adicionales en el rango seleccionado.');
    const from=document.querySelector('#supervisor-export-from')?.value||'sin_fecha',to=document.querySelector('#supervisor-export-to')?.value||from;
    const range=from===to?from.replaceAll('-','_'):`${from.replaceAll('-','_')}_al_${to.replaceAll('-','_')}`;
    const csv='\uFEFF'+[HEADERS,...rows].map(row=>row.map(csvCell).join(';')).join('\r\n');
    downloadFile(`Consolidado-Parametros-Adicionales-${range}.csv`,csv,'text/csv;charset=utf-8');showToast(`${rows.length} valor(es) adicionales exportados.`);
  }
  function appendTools(){
    if(state.view!=='consolidate')return;
    const controls=document.querySelector('.supervisor-export-controls');
    if(controls&&!controls.querySelector('#export-consolidated-dynamic')){
      const count=rowsFor(rangeRecords()).length;
      controls.insertAdjacentHTML('beforeend',`<button type="button" class="secondary" id="export-consolidated-dynamic" ${count?'':'disabled'}>Exportar parámetros</button>`);
    }
    const description=document.querySelector('.supervisor-upload div:nth-child(2) p');
    if(description&&!description.dataset.dynamicNote){description.dataset.dynamicNote='1';description.textContent='Admite Fenología, Biometría, Parámetros adicionales y respaldos JSON. Puedes escoger varios archivos a la vez.';}
  }

  document.addEventListener('change',event=>{
    if(event.target.id==='supervisor-files'&&!event.target.dataset.dynamicReplay){event.preventDefault();event.stopImmediatePropagation();interceptFiles(event.target);}
  },true);
  document.addEventListener('click',event=>{
    if(event.target.closest('#export-consolidated-dynamic')){exportConsolidatedDynamic();return;}
    if(event.target.closest('#commit-supervisor-import'))setTimeout(()=>{const result=applyPending();if(result.applied)showToast(`${result.applied} valor(es) adicionales vinculados.`);appendTools();},150);
  });
  new MutationObserver(()=>appendTools()).observe(app,{childList:true,subtree:true});
  appendTools();
})();