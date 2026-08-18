(() => {
  const VERSION = '0.13.0';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const REQUIRED_BASE = ['ID DATA','FECHA','CAMPO','FUNDO','MODULO','TURNO-LOTE','VARIEDAD','# PLANTA'];
  const MAX_XLSX_BYTES = 25*1024*1024;
  const MAX_ZIP_ENTRIES = 200;
  const MAX_UNCOMPRESSED_BYTES = 80*1024*1024;
  const MAX_ENTRY_BYTES = 20*1024*1024;
  const META_HEADERS = ['ID DATA','CAMPAÑA','EVALUADOR ID','EVALUADOR'];
  const PARAM_HEADERS = ['ID DATA','FECHA','SEMANA','MES','AÑO','CAMPO','FUNDO','MODULO','TURNO-LOTE','CUADRANTE','VARIEDAD','EVALUADOR','PARAMETRO ID','PARAMETRO','SECCION','TIPO','VALOR','UNIDAD'];
  const xlsxUi = {files:[],preview:null,busy:false};

  const blank = value => value === '' || value === null || value === undefined;
  const clean = value => String(value ?? '').trim();
  const normalizeHeader = value => clean(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const xmlEscape = value => String(value ?? '').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'
  })[char]);
  const utf8 = value => new TextEncoder().encode(String(value));
  const decodeUtf8 = bytes => new TextDecoder('utf-8').decode(bytes);
  const localIsoDate = (date=new Date()) => {
    const shifted=new Date(date.getTime()-date.getTimezoneOffset()*60000);
    return shifted.toISOString().slice(0,10);
  };
  const dateStamp = value => {
    const source=value||localIsoDate();
    const [year,month,day]=source.split('-');
    return `${day}_${month}_${String(year).slice(-2)}`;
  };
  const safeNumber = value => {
    if(blank(value)) return '';
    if(typeof value==='number') return Number.isFinite(value)?Math.max(0,Math.trunc(value)):'';
    const number=Number(String(value).trim().replace(',','.'));
    return Number.isFinite(number)?Math.max(0,Math.trunc(number)):value;
  };

  function concatBytes(parts){
    const total=parts.reduce((sum,part)=>sum+part.length,0);
    const output=new Uint8Array(total);
    let offset=0;
    parts.forEach(part=>{output.set(part,offset);offset+=part.length;});
    return output;
  }
  function little16(value){const out=new Uint8Array(2);new DataView(out.buffer).setUint16(0,value,true);return out;}
  function little32(value){const out=new Uint8Array(4);new DataView(out.buffer).setUint32(0,value>>>0,true);return out;}

  const CRC_TABLE=(()=>{
    const table=new Uint32Array(256);
    for(let n=0;n<256;n++){
      let c=n;
      for(let k=0;k<8;k++) c=(c&1)?0xEDB88320^(c>>>1):c>>>1;
      table[n]=c>>>0;
    }
    return table;
  })();
  function crc32(bytes){
    let crc=0xFFFFFFFF;
    for(let i=0;i<bytes.length;i++) crc=CRC_TABLE[(crc^bytes[i])&0xFF]^(crc>>>8);
    return (crc^0xFFFFFFFF)>>>0;
  }

  function zipStored(entries){
    const locals=[];
    const centrals=[];
    let offset=0;
    entries.forEach(entry=>{
      const name=utf8(entry.name);
      const data=entry.data instanceof Uint8Array?entry.data:utf8(entry.data);
      const crc=crc32(data);
      const local=concatBytes([
        little32(0x04034b50),little16(20),little16(0),little16(0),little16(0),little16(0),
        little32(crc),little32(data.length),little32(data.length),little16(name.length),little16(0),name,data
      ]);
      locals.push(local);
      const central=concatBytes([
        little32(0x02014b50),little16(20),little16(20),little16(0),little16(0),little16(0),little16(0),
        little32(crc),little32(data.length),little32(data.length),little16(name.length),little16(0),little16(0),
        little16(0),little16(0),little32(0),little32(offset),name
      ]);
      centrals.push(central);
      offset+=local.length;
    });
    const centralData=concatBytes(centrals);
    const body=concatBytes(locals);
    const end=concatBytes([
      little32(0x06054b50),little16(0),little16(0),little16(entries.length),little16(entries.length),
      little32(centralData.length),little32(body.length),little16(0)
    ]);
    return concatBytes([body,centralData,end]);
  }

  async function inflateRaw(bytes){
    if(typeof DecompressionStream==='undefined') throw new Error('Este dispositivo no admite la descompresión necesaria para leer Excel.');
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buffer){
    const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
    if(bytes.length>MAX_XLSX_BYTES) throw new Error('El Excel supera el límite de 25 MB.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let eocd=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
      if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
    }
    if(eocd<0) throw new Error('El archivo no parece ser un Excel XLSX válido.');
    const count=view.getUint16(eocd+10,true);
    if(count>MAX_ZIP_ENTRIES) throw new Error(`El Excel contiene demasiadas entradas ZIP (${count}).`);
    let cursor=view.getUint32(eocd+16,true);
    const files=new Map();
    let expandedTotal=0;
    for(let n=0;n<count;n++){
      if(cursor<0||cursor+46>bytes.length) throw new Error('El Excel contiene una tabla ZIP fuera de límites.');
      if(view.getUint32(cursor,true)!==0x02014b50) throw new Error('El archivo XLSX tiene una estructura ZIP no reconocida.');
      const method=view.getUint16(cursor+10,true);
      const expectedCrc=view.getUint32(cursor+16,true);
      const compressed=view.getUint32(cursor+20,true);
      const uncompressed=view.getUint32(cursor+24,true);
      const nameLength=view.getUint16(cursor+28,true);
      const extraLength=view.getUint16(cursor+30,true);
      const commentLength=view.getUint16(cursor+32,true);
      const localOffset=view.getUint32(cursor+42,true);
      if(cursor+46+nameLength+extraLength+commentLength>bytes.length) throw new Error('El Excel contiene una entrada central truncada.');
      if(uncompressed>MAX_ENTRY_BYTES) throw new Error(`Una entrada del Excel supera ${MAX_ENTRY_BYTES/1024/1024} MB.`);
      if(compressed&&uncompressed/compressed>200) throw new Error('El Excel tiene una relación de compresión insegura.');
      expandedTotal+=uncompressed;
      if(expandedTotal>MAX_UNCOMPRESSED_BYTES) throw new Error('El contenido expandido del Excel supera 80 MB.');
      const name=decodeUtf8(bytes.slice(cursor+46,cursor+46+nameLength));
      if(localOffset<0||localOffset+30>bytes.length) throw new Error('Entrada XLSX fuera de límites.');
      if(view.getUint32(localOffset,true)!==0x04034b50) throw new Error('Entrada XLSX dañada.');
      const localNameLength=view.getUint16(localOffset+26,true);
      const localExtraLength=view.getUint16(localOffset+28,true);
      const start=localOffset+30+localNameLength+localExtraLength;
      if(start<0||start+compressed>bytes.length) throw new Error('Entrada XLSX truncada.');
      const raw=bytes.slice(start,start+compressed);
      let data;
      if(method===0) data=raw;
      else if(method===8) data=await inflateRaw(raw);
      else throw new Error(`Método de compresión XLSX no compatible (${method}).`);
      if(data.length!==uncompressed||crc32(data)!==expectedCrc) throw new Error(`La entrada ${name} no supera la validación de integridad.`);
      files.set(name.replace(/^\//,''),data);
      cursor+=46+nameLength+extraLength+commentLength;
    }
    return files;
  }

  function columnName(index){
    let value=index+1,name='';
    while(value){value--;name=String.fromCharCode(65+(value%26))+name;value=Math.floor(value/26);}
    return name;
  }
  function cellXml(value,rowIndex,colIndex){
    if(blank(value)) return '';
    const ref=`${columnName(colIndex)}${rowIndex+1}`;
    if(typeof value==='number'&&Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
    if(typeof value==='boolean') return `<c r="${ref}" t="b"><v>${value?1:0}</v></c>`;
    const text=String(value);
    const preserve=/^\s|\s$/.test(text)?' xml:space="preserve"':'';
    return `<c r="${ref}" t="inlineStr"><is><t${preserve}>${xmlEscape(text)}</t></is></c>`;
  }
  function sheetXml(rows){
    const safeRows=Array.isArray(rows)?rows:[];
    const maxCols=Math.max(1,...safeRows.map(row=>Array.isArray(row)?row.length:0));
    const last=`${columnName(maxCols-1)}${Math.max(1,safeRows.length)}`;
    const widths=Array.from({length:maxCols},(_,index)=>{
      let max=10;
      safeRows.slice(0,250).forEach(row=>{max=Math.max(max,String(row?.[index]??'').length+2);});
      return Math.min(42,max);
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((width,index)=>`<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${safeRows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${(row||[]).map((value,colIndex)=>cellXml(value,rowIndex,colIndex)).join('')}</row>`).join('')}</sheetData>${safeRows.length&&maxCols?`<autoFilter ref="A1:${columnName(maxCols-1)}${Math.max(1,safeRows.length)}"/>`:''}</worksheet>`;
  }
  function workbookBytes(sheets){
    const cleanSheets=sheets.filter(sheet=>sheet&&sheet.name&&Array.isArray(sheet.rows));
    const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${cleanSheets.map((_,index)=>`<Override PartName="/xl/worksheets/sheet${index+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
    const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const workbook=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${cleanSheets.map((sheet,index)=>`<sheet name="${xmlEscape(sheet.name.slice(0,31))}" sheetId="${index+1}" r:id="rId${index+1}"/>`).join('')}</sheets></workbook>`;
    const workbookRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${cleanSheets.map((_,index)=>`<Relationship Id="rId${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index+1}.xml"/>`).join('')}</Relationships>`;
    const entries=[
      {name:'[Content_Types].xml',data:contentTypes},
      {name:'_rels/.rels',data:rootRels},
      {name:'xl/workbook.xml',data:workbook},
      {name:'xl/_rels/workbook.xml.rels',data:workbookRels},
      ...cleanSheets.map((sheet,index)=>({name:`xl/worksheets/sheet${index+1}.xml`,data:sheetXml(sheet.rows)}))
    ];
    return zipStored(entries);
  }

  function parseXml(bytes,name){
    if(!bytes) throw new Error(`Falta ${name} dentro del archivo XLSX.`);
    const documentXml=new DOMParser().parseFromString(decodeUtf8(bytes),'application/xml');
    if(documentXml.querySelector('parsererror')) throw new Error(`No se pudo leer ${name}.`);
    return documentXml;
  }
  function pathFromWorkbookTarget(target){
    const cleanTarget=String(target||'').replace(/^\//,'');
    if(cleanTarget.startsWith('xl/')) return cleanTarget;
    return `xl/${cleanTarget.replace(/^\.\//,'')}`;
  }
  function columnIndex(ref){
    const letters=(String(ref).match(/^[A-Z]+/i)||['A'])[0].toUpperCase();
    let result=0;
    for(const char of letters) result=result*26+(char.charCodeAt(0)-64);
    return result-1;
  }
  function sharedStrings(files){
    const bytes=files.get('xl/sharedStrings.xml');
    if(!bytes) return [];
    const xml=parseXml(bytes,'sharedStrings.xml');
    return [...xml.getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(node=>node.textContent||'').join(''));
  }
  function parseSheet(bytes,shared){
    const xml=parseXml(bytes,'hoja de cálculo');
    const rows=[];
    [...xml.getElementsByTagName('row')].forEach(rowNode=>{
      const row=[];
      [...rowNode.getElementsByTagName('c')].forEach(cell=>{
        const index=columnIndex(cell.getAttribute('r')||'A1');
        const type=cell.getAttribute('t')||'';
        let value='';
        if(type==='inlineStr') value=[...cell.getElementsByTagName('t')].map(node=>node.textContent||'').join('');
        else{
          const raw=cell.getElementsByTagName('v')[0]?.textContent ?? '';
          if(type==='s') value=shared[Number(raw)] ?? '';
          else if(type==='b') value=raw==='1';
          else if(type==='str') value=raw;
          else if(raw!==''&&!Number.isNaN(Number(raw))) value=Number(raw);
          else value=raw;
        }
        row[index]=value;
      });
      rows.push(row);
    });
    return rows;
  }
  async function readWorkbook(file){
    if(file?.size>MAX_XLSX_BYTES) throw new Error('El Excel supera el límite de 25 MB.');
    const files=await unzip(await file.arrayBuffer());
    const workbook=parseXml(files.get('xl/workbook.xml'),'workbook.xml');
    const rels=parseXml(files.get('xl/_rels/workbook.xml.rels'),'workbook.xml.rels');
    const relMap=new Map([...rels.getElementsByTagName('Relationship')].map(rel=>[rel.getAttribute('Id'),rel.getAttribute('Target')]));
    const shared=sharedStrings(files);
    const sheets=[];
    for(const sheet of [...workbook.getElementsByTagName('sheet')]){
      const name=sheet.getAttribute('name')||'Hoja';
      const relId=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
      const target=relMap.get(relId);
      if(!target) continue;
      const path=pathFromWorkbookTarget(target);
      const bytes=files.get(path);
      if(!bytes) continue;
      sheets.push({name,rows:parseSheet(bytes,shared)});
    }
    if(!sheets.length) throw new Error('El Excel no contiene hojas legibles.');
    return sheets;
  }

  function normalizeDate(value){
    if(blank(value)) return '';
    if(typeof value==='number'&&Number.isFinite(value)){
      const epoch=Date.UTC(1899,11,30);
      return new Date(epoch+Math.round(value)*86400000).toISOString().slice(0,10);
    }
    const text=clean(value);
    if(/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const dmy=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
    if(dmy){const year=dmy[3].length===2?`20${dmy[3]}`:dmy[3];return `${year}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;}
    const parsed=new Date(text);
    return Number.isNaN(parsed.getTime())?'':parsed.toISOString().slice(0,10);
  }
  function headerIndexMap(headers){
    const map=new Map();
    (headers||[]).forEach((header,index)=>{const key=normalizeHeader(header);if(key&&!map.has(key))map.set(key,index);});
    return map;
  }
  function projectRow(row,sourceHeaders,targetHeaders){
    const map=headerIndexMap(sourceHeaders);
    return targetHeaders.map(header=>{
      const index=map.get(normalizeHeader(header));
      return index===undefined?'':(row?.[index]??'');
    });
  }
  function sheetKind(sheet){
    const name=normalizeHeader(sheet.name);
    if(name.includes('PARAMETRO')) return 'parameters';
    if(name.includes('META')) return 'metadata';
    if(name.includes('RESUMEN')) return 'summary';
    if(name.includes('BIOMET')) return 'biometry';
    if(name.includes('FENO')) return 'fenology';
    const headers=sheet.rows?.[0]||[];
    const keys=new Set(headers.map(normalizeHeader));
    const fenoSignals=['YEMASE01','YEMASE02','PANICULACERRADAE10','PANICULAABIERTAE11'];
    const bioSignals=['BF01DL','BF01DEA','CAIDADEFRUTAF1'];
    if(bioSignals.some(key=>keys.has(key))) return 'biometry';
    if(fenoSignals.some(key=>keys.has(key))) return 'fenology';
    return 'unknown';
  }
  function baseRecord(row){
    return {
      id:clean(row[0]),date:normalizeDate(row[1]),field:clean(row[5]),farm:clean(row[6]),module:clean(row[7]),
      lot:clean(row[8]),quadrant:clean(row[9]),variety:clean(row[10]),plant:safeNumber(row[11]),campaign:'',importedFromXlsx:true
    };
  }
  function fenoRecord(row){
    const record=baseRecord(row);let cursor=12;
    stages.forEach(stage=>{record[stage]=safeNumber(row[cursor++]);});
    ['yemasVegetativas','yemasFlorales','yemasDudosas','senescencia','broteRojo','brotePalido','broteOscuro','paniculaIndeterminada','paniculaDeterminada','conteoPaniculas','conteoCuajas','paniculasSinCuajar','paniculaBuena','paniculaMedia','paniculaMala'].forEach(key=>{record[key]=safeNumber(row[cursor++]);});
    return record;
  }
  function bioRecord(row){
    const record=baseRecord(row);let cursor=12;
    for(let fruit=1;fruit<=35;fruit++){
      record[`f${fruit}_dl`]=safeNumber(row[cursor++]);record[`f${fruit}_dea`]=safeNumber(row[cursor++]);record[`f${fruit}_deb`]=safeNumber(row[cursor++]);
    }
    ['caidaF1','caidaF2','caidaF3','caidaF4','frutaAnillada','frutaDeshidratada','frutosPintones'].forEach(key=>{record[key]=safeNumber(row[cursor++]);});
    return record;
  }
  function validateBase(record){
    const missing=[];
    if(!record.id) missing.push('ID DATA');if(!record.date)missing.push('FECHA');if(!record.field)missing.push('CAMPO');if(!record.farm)missing.push('FUNDO');
    if(!record.module)missing.push('MODULO');if(!record.lot)missing.push('TURNO-LOTE');if(!record.variety)missing.push('VARIEDAD');
    if(blank(record.plant)||Number(record.plant)<1)missing.push('# PLANTA');
    return missing;
  }
  function mergeParts(current,incoming){
    if(!current) return {...incoming};
    const merged={...current};
    Object.entries(incoming).forEach(([key,value])=>{if(!blank(value)&&blank(merged[key]))merged[key]=value;});
    return merged;
  }
  function inferredCampaign(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')) return '';
    const [year,month]=date.split('-').map(Number);
    return month>=10?`${year}-${year+1}`:`${year-1}-${year}`;
  }

  async function parseWorkbookRecords(file){
    const sheets=await readWorkbook(file);
    const records=new Map();
    const issues=[];
    const metadata=new Map();
    const parameterRows=[];
    let recognized=0;

    for(const sheet of sheets){
      const kind=sheetKind(sheet);
      if(kind==='summary'||kind==='unknown') continue;
      if(!sheet.rows.length) continue;
      recognized++;
      const sourceHeaders=sheet.rows[0];
      if(kind==='metadata'){
        sheet.rows.slice(1).forEach(row=>{
          const projected=projectRow(row,sourceHeaders,META_HEADERS);
          const id=clean(projected[0]);if(id)metadata.set(id,{campaign:clean(projected[1]),evaluatorId:clean(projected[2]),evaluator:clean(projected[3])});
        });
        continue;
      }
      if(kind==='parameters'){
        sheet.rows.slice(1).forEach(row=>parameterRows.push(projectRow(row,sourceHeaders,PARAM_HEADERS)));
        continue;
      }
      const expected=kind==='fenology'?FENO_HEADERS:BIO_HEADERS;
      const headerKeys=new Set(sourceHeaders.map(normalizeHeader));
      const missingRequired=REQUIRED_BASE.filter(header=>!headerKeys.has(normalizeHeader(header)));
      if(missingRequired.length){
        issues.push({sheet:sheet.name,message:`Faltan columnas obligatorias: ${missingRequired.join(', ')}.`});
        continue;
      }
      sheet.rows.slice(1).forEach((sourceRow,index)=>{
        if(!(sourceRow||[]).some(value=>!blank(value))) return;
        const row=projectRow(sourceRow,sourceHeaders,expected);
        const record=kind==='fenology'?fenoRecord(row):bioRecord(row);
        const missing=validateBase(record);
        if(missing.length){issues.push({sheet:sheet.name,row:index+2,id:record.id,message:`Faltan: ${missing.join(', ')}.`});return;}
        records.set(record.id,mergeParts(records.get(record.id),record));
      });
    }
    if(!recognized) throw new Error('No se reconocieron hojas de Fenología, Biometría, Parámetros o Metadatos.');

    records.forEach(record=>{
      const meta=metadata.get(record.id);
      record.campaign=meta?.campaign||record.campaign||inferredCampaign(record.date);
      if(meta?.evaluatorId)record.evaluatorId=meta.evaluatorId;
      if(meta?.evaluator)record.evaluator=meta.evaluator;
    });
    parameterRows.forEach(row=>{
      const id=clean(row[0]),parameterId=clean(row[12]);
      const record=records.get(id);if(!record||!parameterId||blank(row[16]))return;
      if(!record.parametrosAdicionales)record.parametrosAdicionales={};
      let value=row[16];
      const type=clean(row[15])||'text';
      if(['integer','decimal','percentage'].includes(type)&&!blank(value)&&Number.isFinite(Number(String(value).replace(',','.')))) value=Number(String(value).replace(',','.'));
      record.parametrosAdicionales[parameterId]={value,name:clean(row[13])||parameterId,section:clean(row[14])||'Otros',type,unit:clean(row[17]),definitionRevision:1,recordedAt:new Date().toISOString()};
    });
    return {records:[...records.values()],issues,sheets:sheets.map(sheet=>sheet.name)};
  }

  function dynamicRows(records){
    const rows=[];
    records.forEach(record=>Object.entries(record.parametrosAdicionales||{}).forEach(([id,entry])=>{
      const value=entry&&typeof entry==='object'&&Object.prototype.hasOwnProperty.call(entry,'value')?entry.value:entry;
      if(blank(value))return;
      const date=record.date||'';
      const parsed=/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(`${date}T12:00:00`):null;
      rows.push([
        record.id,date,date?isoWeek(date):'',parsed?parsed.getMonth()+1:'',parsed?parsed.getFullYear():'',record.field||'',record.farm||'',record.module||'',record.lot||'',record.quadrant||'',record.variety||'',record.evaluator||'',
        id,entry?.name||id,entry?.section||'Otros',entry?.type||'text',value,entry?.unit||''
      ]);
    }));
    return rows;
  }
  function metadataRows(records){return records.map(record=>[record.id,record.campaign||inferredCampaign(record.date),record.evaluatorId||'',record.evaluator||'']);}
  function summaryRows(records,title='Archivo de Fenología'){
    const dates=records.map(record=>record.date).filter(Boolean).sort();
    const fields=[...new Set(records.map(record=>record.field).filter(Boolean))];
    const farms=[...new Set(records.map(record=>record.farm).filter(Boolean))];
    const evaluators=[...new Set(records.map(record=>record.evaluator).filter(Boolean))];
    return [
      [title],['Generado',new Date().toLocaleString('es-PE')],['Evaluaciones',records.length],['Desde',dates[0]||''],['Hasta',dates.at(-1)||''],
      ['Campos',fields.join(', ')],['Fundos',farms.join(', ')],['Evaluadores',evaluators.join(', ')],[],
      ['HOJAS DEL LIBRO'],['FENOLOGIA','44 columnas oficiales'],['BIOMETRIA','124 columnas oficiales'],['PARAMETROS_ADICIONALES','Formato largo'],['METADATOS','Campaña y evaluador por ID DATA']
    ];
  }
  function buildDataWorkbook(records,title){
    return workbookBytes([
      {name:'FENOLOGIA',rows:[FENO_HEADERS,...records.map(fenologyRow)]},
      {name:'BIOMETRIA',rows:[BIO_HEADERS,...records.map(biometryRow)]},
      {name:'PARAMETROS_ADICIONALES',rows:[PARAM_HEADERS,...dynamicRows(records)]},
      {name:'RESUMEN',rows:summaryRows(records,title)},
      {name:'METADATOS',rows:[META_HEADERS,...metadataRows(records)]}
    ]);
  }

  function bytesToBase64(bytes){
    let binary='';
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
    return btoa(binary);
  }
  async function saveWorkbook(name,bytes){
    const native=window.FenologiaPlatform?.isNative?.();
    if(!native){downloadFile(name,bytes,XLSX_MIME);return;}
    const Filesystem=window.Capacitor?.Plugins?.Filesystem;
    const Share=window.Capacitor?.Plugins?.Share;
    if(!Filesystem) throw new Error('No está disponible el almacenamiento de Android.');
    const safeName=String(name).replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_');
    const data=bytesToBase64(bytes);
    let persistent=null;
    try{persistent=await Filesystem.writeFile({path:`Fenologia/${safeName}`,data,directory:'DOCUMENTS',recursive:true});}catch(error){console.warn('No se pudo guardar en Documentos:',error);}
    const temporary=await Filesystem.writeFile({path:`FenologiaCompartir/${safeName}`,data,directory:'CACHE',recursive:true});
    if(Share){
      try{await Share.share({title:safeName,text:'Archivo Excel exportado desde Fenología.',files:[temporary.uri],dialogTitle:'Compartir Excel de Fenología'});}catch(error){console.warn('No se abrió el panel de compartir:',error);}
    }
    showToast(persistent?`Excel guardado en Documentos/Fenología: ${safeName}`:'Excel listo para compartir.');
  }

  function exportBounds(){
    const from=document.querySelector('#export-date-from')?.value||localIsoDate();
    const to=document.querySelector('#export-date-to')?.value||from;
    return {from,to};
  }
  function recordsForBounds(bounds){return state.records.filter(record=>record.date&&record.date>=bounds.from&&record.date<=bounds.to);}
  function workbookFileName(prefix,bounds){return bounds.from===bounds.to?`${prefix}-${dateStamp(bounds.from)}.xlsx`:`${prefix}-${dateStamp(bounds.from)}_al_${dateStamp(bounds.to)}.xlsx`;}
  async function exportEvaluatorWorkbook(){
    const bounds=exportBounds();
    if(!bounds.from||!bounds.to||bounds.from>bounds.to)return showToast('Revisa el rango de fechas.');
    const records=recordsForBounds(bounds);
    if(!records.length)return showToast('No hay evaluaciones en el rango seleccionado.');
    const bytes=buildDataWorkbook(records,'Evaluaciones de Fenología');
    await saveWorkbook(workbookFileName('Fenologia',bounds),bytes);
  }

  function mergeAnalysis(incoming){
    const map=new Map(state.records.map(record=>[record.id,{...record}]));
    const results={new:0,updated:0,duplicate:0,observed:0,records:map,conflicts:[]};
    const ignored=new Set(['createdAt','updatedAt','importedAt','importedBy','sourceFiles','importBatchIds','importSource','importedFromCsv','importedFromXlsx']);
    incoming.forEach(record=>{
      const current=map.get(record.id);
      if(!current){map.set(record.id,{...record});results.new++;return;}
      const merged={...current};let changed=false;const conflicts=[];
      Object.entries(record).forEach(([key,value])=>{
        if(key==='id'||ignored.has(key)||blank(value))return;
        if(blank(merged[key])){merged[key]=value;changed=true;return;}
        if(key==='parametrosAdicionales'){
          const next={...(merged.parametrosAdicionales||{})};
          Object.entries(value||{}).forEach(([paramId,paramValue])=>{if(next[paramId]===undefined){next[paramId]=paramValue;changed=true;}});
          merged.parametrosAdicionales=next;return;
        }
        if(String(merged[key])!==String(value)&&!['evaluator','evaluatorId','campaign'].includes(key))conflicts.push(key);
      });
      if(conflicts.length){results.observed++;results.conflicts.push({id:record.id,fields:conflicts});return;}
      if(changed){merged.updatedAt=new Date().toISOString();map.set(record.id,merged);results.updated++;}else results.duplicate++;
    });
    return results;
  }
  async function commitWorkbookImport(parsed,fileName){
    const analysis=mergeAnalysis(parsed.records);
    const message=`${fileName}\n\nNuevos: ${analysis.new}\nCompletados: ${analysis.updated}\nRepetidos: ${analysis.duplicate}\nObservados: ${analysis.observed}\n\n¿Importar los registros válidos?`;
    if(!confirm(message))return;
    const previousRecords=state.records;
    state.records=[...analysis.records.values()];
    try{await save();}catch(error){state.records=previousRecords;throw error;}
    showToast(`Excel importado: ${analysis.new} nuevos y ${analysis.updated} completados.`);
    render();
  }
  async function importWorkbookFile(file){
    if(!file)return;
    if(!/\.xlsx$/i.test(file.name))return showToast('Selecciona un archivo Excel .xlsx.');
    try{
      showToast('Leyendo archivo Excel…');
      const parsed=await parseWorkbookRecords(file);
      if(!parsed.records.length)throw new Error('No se encontraron evaluaciones válidas dentro del Excel.');
      if(parsed.issues.length){
        const sample=parsed.issues.slice(0,3).map(issue=>`${issue.sheet}${issue.row?` fila ${issue.row}`:''}: ${issue.message}`).join('\n');
        console.warn('Observaciones XLSX:',parsed.issues);
        if(!confirm(`Se encontraron ${parsed.issues.length} observación(es):\n\n${sample}${parsed.issues.length>3?'\n…':''}\n\nPuedes continuar con los registros válidos. ¿Continuar?`))return;
      }
      await commitWorkbookImport(parsed,file.name);
    }catch(error){console.error(error);showToast(error.message||'No se pudo leer el Excel.');}
  }

  function decorateExport(){
    if(state.view!=='export')return;
    const grid=document.querySelector('.export-grid');
    if(!grid||grid.querySelector('#export-xlsx'))return;
    document.querySelector('#export-csv')?.remove();
    document.querySelector('#export-bio')?.remove();
    grid.insertAdjacentHTML('afterbegin',`
      <button class="export-card green" id="export-xlsx"><span>📊</span><div><b>Exportar Excel completo</b><p>Un solo archivo con Fenología, Biometría, parámetros, resumen y metadatos.</p><em>Excel .xlsx</em></div><i>→</i></button>
      <button class="export-card blue" id="import-xlsx"><span>📥</span><div><b>Importar Excel</b><p>Abre un archivo generado en el celular o preparado en la PC.</p><em>Excel .xlsx</em></div><i>→</i></button>
      <input id="xlsx-import-file" type="file" accept=".xlsx,${XLSX_MIME}" hidden>`);
    document.querySelector('.dynamic-export-panel')?.remove();
    const warning=document.querySelector('#export-period-warning');
    if(warning)warning.textContent='La exportación generará un único libro Excel con todas las hojas del periodo.';
  }

  function consolidatedBounds(){
    const from=document.querySelector('#supervisor-export-from')?.value||'';
    const to=document.querySelector('#supervisor-export-to')?.value||'';
    return {from,to};
  }
  function consolidatedRecords(){
    const {from,to}=consolidatedBounds();
    return state.records.filter(record=>(!from||record.date>=from)&&(!to||record.date<=to));
  }
  async function exportConsolidatedWorkbook(){
    const records=consolidatedRecords();
    if(!records.length)return showToast('No hay registros consolidados en el rango seleccionado.');
    const bounds=consolidatedBounds();
    const effective={from:bounds.from||records.map(r=>r.date).filter(Boolean).sort()[0]||localIsoDate(),to:bounds.to||records.map(r=>r.date).filter(Boolean).sort().at(-1)||localIsoDate()};
    await saveWorkbook(workbookFileName('Consolidado-Fenologia',effective),buildDataWorkbook(records,'Base consolidada de Fenología'));
  }

  function decorateConsolidate(){
    if(state.view!=='consolidate'||!isSupervisor())return;
    const upload=document.querySelector('.supervisor-upload');
    if(upload&&!upload.dataset.xlsxReady){
      upload.dataset.xlsxReady='1';
      const label=upload.querySelector('span');const title=upload.querySelector('h2');const paragraph=upload.querySelector('p');const button=upload.querySelector('#select-supervisor-files');const input=upload.querySelector('#supervisor-files');
      if(label)label.textContent='IMPORTAR EXCEL';
      if(title)title.textContent='Selecciona el Excel de evaluaciones';
      if(paragraph)paragraph.textContent='Admite libros .xlsx generados por Fenología o preparados en una PC. Reconoce las columnas por nombre.';
      if(button){button.id='select-supervisor-xlsx';button.textContent='Seleccionar Excel';}
      if(input){input.id='supervisor-xlsx-file';input.accept=`.xlsx,${XLSX_MIME}`;input.multiple=false;}
    }
    const oldList=document.querySelector('.supervisor-file-list')?.closest('.panel');if(oldList)oldList.style.display='none';
    const oldReview=document.querySelector('.supervisor-review-grid');if(oldReview)oldReview.style.display='none';
    const metrics=document.querySelector('.supervisor-metrics');if(metrics)metrics.style.display='none';
    const exportPanel=document.querySelector('.supervisor-export-panel');
    if(exportPanel&&!exportPanel.querySelector('#export-consolidated-xlsx')){
      document.querySelector('#export-consolidated-feno')?.remove();document.querySelector('#export-consolidated-bio')?.remove();
      exportPanel.querySelector('.supervisor-export-controls')?.insertAdjacentHTML('beforeend','<button type="button" class="primary" id="export-consolidated-xlsx">Exportar Excel consolidado</button>');
      const title=exportPanel.querySelector('h2');const paragraph=exportPanel.querySelector('.panel-head p');
      if(title)title.textContent='Exportar Excel por rango de fechas';
      if(paragraph)paragraph.textContent='Genera un solo .xlsx para abrirlo tanto en la PC como en el celular.';
    }
    if(upload&&!document.querySelector('.xlsx-info-panel')){
      upload.insertAdjacentHTML('afterend','<section class="panel xlsx-info-panel"><div><span>COMPATIBILIDAD PC ↔ CELULAR</span><h2>Un mismo Excel para ambos equipos</h2><p>El libro puede viajar por WhatsApp, Drive, correo o USB. Al importarlo se conservan los ID DATA y se controlan duplicados.</p></div><div class="xlsx-sheet-tags"><span>FENOLOGIA</span><span>BIOMETRIA</span><span>PARAMETROS</span><span>RESUMEN</span><span>METADATOS</span></div></section>');
    }
  }

  const previousExportView=exportView;
  exportView=function xlsxExportView(){const result=previousExportView();decorateExport();return result;};
  const previousConsolidateView=typeof consolidateView==='function'?consolidateView:null;
  if(previousConsolidateView){
    consolidateView=function xlsxConsolidateView(){const result=previousConsolidateView();decorateConsolidate();return result;};
  }
  const previousRender=render;
  render=function xlsxRender(){const result=previousRender();decorateExport();decorateConsolidate();return result;};

  document.addEventListener('click',event=>{
    if(event.target.closest('#export-xlsx')){exportEvaluatorWorkbook().catch(error=>{console.error(error);showToast(error.message||'No se pudo generar el Excel.');});return;}
    if(event.target.closest('#import-xlsx')){document.querySelector('#xlsx-import-file')?.click();return;}
    if(event.target.closest('#select-supervisor-xlsx')){document.querySelector('#supervisor-xlsx-file')?.click();return;}
    if(event.target.closest('#export-consolidated-xlsx')){exportConsolidatedWorkbook().catch(error=>{console.error(error);showToast(error.message||'No se pudo generar el Excel consolidado.');});}
  },true);
  document.addEventListener('change',event=>{
    if(event.target.id==='xlsx-import-file'||event.target.id==='supervisor-xlsx-file'){
      event.stopImmediatePropagation();
      const file=event.target.files?.[0];event.target.value='';
      importWorkbookFile(file);
    }
  },true);

  window.FenologiaXLSX={version:VERSION,readWorkbook,parseWorkbookRecords,buildDataWorkbook,exportWorkbook:saveWorkbook};
})();
