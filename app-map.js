(() => {
  const VERSION='0.15.0', MAP_PATH='data/lotes-mapa.geojson', W=1200, H=760, PAD=32;
  const iso=(d=new Date())=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const m={data:null,loading:null,error:'',from:iso(),to:iso(),field:'',farm:'',module:'',variety:'',evaluator:'',lot:'',zoom:1,x:0,y:0,drag:null};
  const roles=()=>['Evaluador','Supervisor','Administrador'].includes(state.session?.role);
  const evaluatorRole=()=>state.session?.role==='Evaluador';
  const uniq=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),'es'));
  const active=()=>m.data?.features?.filter(f=>f.properties?.ACTIVO)||[];
  const refs=()=>m.data?.features?.filter(f=>!f.properties?.ACTIVO)||[];
  const allLots=()=>new Set(active().map(f=>f.properties.LOTE));
  const opt=(values,current,all='Todos')=>`<option value="">${all}</option>${values.map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('')}`;

  function catalogMetadata(){
    const lots=new Map();
    Object.entries(state.catalog?.lotesAgrupados||{}).forEach(([field,farms])=>{
      Object.entries(farms||{}).forEach(([farm,modules])=>{
        Object.entries(modules||{}).forEach(([module,items])=>(items||[]).forEach(lot=>lots.set(String(lot).trim(),{CAMPO:field,FUNDO:farm,MODULO:module})));
      });
    });
    return lots;
  }

  function validateGeoJSON(data){
    if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('El archivo cargado no contiene una colección GeoJSON válida.');
    const expected=catalogMetadata(),seen=new Set(),invalid=[];
    const polygons=geometry=>geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:null;
    data.features.forEach((feature,index)=>{
      const lot=String(feature?.properties?.LOTE||'').trim(),parts=polygons(feature?.geometry);
      if(!lot||seen.has(lot)||!parts){invalid.push(lot||`geometría ${index+1}`);return;}
      seen.add(lot);
      const metadata=expected.get(lot);
      if(!metadata||['CAMPO','FUNDO','MODULO'].some(property=>String(feature.properties?.[property]||'').trim()!==String(metadata[property]||'').trim()))invalid.push(lot);
      for(const polygon of parts){
        for(const ring of polygon||[]){
          const first=ring?.[0],last=ring?.[ring.length-1];
          const badPoint=ring?.some(point=>!Array.isArray(point)||point.length<2||!Number.isFinite(point[0])||!Number.isFinite(point[1])||point[0]<-180||point[0]>180||point[1]<-90||point[1]>90);
          const area=Array.isArray(ring)&&!badPoint?Math.abs(ring.reduce((sum,[x1,y1],position)=>{const [x2,y2]=ring[(position+1)%ring.length];return sum+(x1*y2-x2*y1);},0)/2):0;
          if(!Array.isArray(ring)||ring.length<4||!first||!last||first[0]!==last[0]||first[1]!==last[1]||badPoint||area===0)invalid.push(lot);
        }
      }
    });
    const missing=[...expected.keys()].filter(lot=>!seen.has(lot)),unknown=[...seen].filter(lot=>!expected.has(lot));
    if(invalid.length||missing.length||unknown.length){
      const detail=[invalid.length&&`geometrías inválidas: ${uniq(invalid).slice(0,8).join(', ')}`,missing.length&&`sin polígono: ${missing.slice(0,8).join(', ')}`,unknown.length&&`fuera del catálogo: ${unknown.slice(0,8).join(', ')}`].filter(Boolean).join('; ');
      throw Error(`El GeoJSON no coincide con el catálogo (${detail}).`);
    }
    data.stats={...(data.stats||{}),lotesActivos:seen.size,zonasReferencia:0,featuresNormalizadas:data.features.length};
    return data;
  }

  async function parseMapResponse(response,source){
    if(!response) throw Error(`No hubo respuesta desde ${source}.`);
    if(!response.ok) throw Error(`El archivo del mapa respondió ${response.status} desde ${source}.`);
    const text=await response.text();
    if(!text.trim()) throw Error(`El archivo del mapa está vacío en ${source}.`);
    if(/^\s*</.test(text)) throw Error(`El servidor devolvió una página HTML en lugar del GeoJSON desde ${source}.`);
    try{return JSON.parse(text);}catch{throw Error(`El contenido recibido desde ${source} no es JSON válido.`);}
  }

  async function fetchWithTimeout(url,timeout=12000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(url,{cache:'reload',credentials:'same-origin',signal:controller.signal});
      return await parseMapResponse(response,url);
    }finally{clearTimeout(timer);}
  }

  async function loadFromNetwork(){
    const urls=[new URL(`${MAP_PATH}?v=${VERSION}`,location.href).href];
    let lastError=null;
    for(const url of [...new Set(urls)]){
      try{return await fetchWithTimeout(url);}catch(error){lastError=error;}
    }
    throw lastError||Error('No se pudo solicitar el archivo del mapa.');
  }

  async function loadFromCache(){
    if(!('caches' in window)) return null;
    try{
      const direct=await caches.match(MAP_PATH,{ignoreSearch:true});
      if(direct) return await parseMapResponse(direct,'la copia offline');
      const names=await caches.keys();
      for(const name of names){
        const cache=await caches.open(name);
        const requests=await cache.keys();
        const request=requests.find(item=>{
          try{return new URL(item.url).pathname.endsWith(`/${MAP_PATH}`);}catch{return false;}
        });
        if(request){
          const response=await cache.match(request);
          if(response) return await parseMapResponse(response,`el caché ${name}`);
        }
      }
    }catch(error){console.warn('No se pudo leer la copia offline del mapa:',error);}
    return null;
  }

  function load(){
    if(m.data) return Promise.resolve(m.data);
    if(m.loading) return m.loading;
    m.loading=(async()=>{
      let payload=null;
      let networkError=null;
      try{payload=await loadFromNetwork();}
      catch(error){networkError=error;payload=await loadFromCache();}
      if(!payload){
        const reason=networkError?.name==='AbortError'
          ? 'La descarga del mapa agotó el tiempo de espera.'
          : networkError?.message||'No se pudo contactar al servidor.';
        throw Error(`${reason} Verifica que la terminal continúe ejecutando el servidor y vuelve a abrir el puerto.`);
      }
      if(!state.catalog?.lotesAgrupados&&window.__FENOLOGIA_CATALOG_READY__)await window.__FENOLOGIA_CATALOG_READY__;
      const data=validateGeoJSON(payload);
      m.data=data;m.error='';return data;
    })().catch(error=>{m.error=error.message||'No se pudo cargar el mapa.';throw error;}).finally(()=>m.loading=null);
    return m.loading;
  }

  function featureOk(f){
    const p=f.properties||{};
    if(m.field&&p.CAMPO!==m.field)return false;
    if(m.farm&&p.FUNDO!==m.farm)return false;
    if(m.module&&p.MODULO!==m.module)return false;
    if(m.variety){
      const assigned=state.assignments?.[p.LOTE];
      const allowed=Array.isArray(assigned)&&assigned.length?assigned:(state.catalog?.variedadesPorCampo?.[p.CAMPO]||[]);
      if(!allowed.includes(m.variety))return false;
    }
    return true;
  }
  function recordOk(r){
    if(evaluatorRole()&&r.evaluatorId!==state.session.id)return false;
    if(m.from&&(!r.date||r.date<m.from))return false;
    if(m.to&&(!r.date||r.date>m.to))return false;
    if(m.field&&r.field!==m.field)return false;
    if(m.farm&&r.farm!==m.farm)return false;
    if(m.module&&r.module!==m.module)return false;
    if(m.variety&&r.variety!==m.variety)return false;
    if(!evaluatorRole()&&m.evaluator&&(r.evaluatorId||r.evaluator||'')!==m.evaluator)return false;
    return true;
  }
  function model(){
    const visible=active().filter(featureOk), records=state.records.filter(recordOk), byLot=new Map(), visibleSet=new Set(visible.map(f=>f.properties.LOTE));
    records.forEach(r=>{const lot=String(r.lot||'').trim();if(!lot)return;if(!byLot.has(lot))byLot.set(lot,[]);byLot.get(lot).push(r);});
    const evaluated=[...byLot.keys()].filter(l=>visibleSet.has(l));
    return {visible,references:m.field?[]:refs(),records,byLot,evaluated,pending:Math.max(0,visible.length-evaluated.length),unmatched:records.filter(r=>r.lot&&!allLots().has(r.lot))};
  }
  function evaluators(){
    const base=users.filter(u=>u.role==='Evaluador').map(u=>({v:u.id,l:u.name}));
    state.records.forEach(r=>{const v=r.evaluatorId||r.evaluator,l=r.evaluator||r.evaluatorId;if(v&&!base.some(x=>x.v===v))base.push({v,l});});
    return base.sort((a,b)=>a.l.localeCompare(b.l,'es'));
  }
  function filters(){
    const af=active(), fields=uniq(af.map(f=>f.properties.CAMPO));
    const farms=uniq(af.filter(f=>!m.field||f.properties.CAMPO===m.field).map(f=>f.properties.FUNDO));
    const modules=uniq(af.filter(f=>(!m.field||f.properties.CAMPO===m.field)&&(!m.farm||f.properties.FUNDO===m.farm)).map(f=>f.properties.MODULO));
    const vars=m.field?uniq(state.catalog?.variedadesPorCampo?.[m.field]||[]):uniq(Object.values(state.catalog?.variedadesPorCampo||{}).flat());
    const evaluatorFilter=evaluatorRole()?'':`<label>Evaluador<select id="map-evaluator"><option value="">Todos</option>${evaluators().map(x=>`<option value="${esc(x.v)}" ${m.evaluator===x.v?'selected':''}>${esc(x.l)}</option>`).join('')}</select></label>`;
    return `<section class="panel map-filters"><div class="panel-head"><div><span>FILTROS DEL MAPA</span><h2>Periodo y alcance</h2><p>Un lote se pinta de verde cuando tiene al menos una evaluación que cumple los filtros.</p></div><div><button class="secondary" id="map-today">Hoy</button><button class="link" id="map-clear">Limpiar</button></div></div>
      <div class="map-filter-grid">
        <label>Desde<span class="map-date"><input id="map-from" type="date" value="${esc(m.from)}"></span></label>
        <label>Hasta<span class="map-date"><input id="map-to" type="date" value="${esc(m.to)}"></span></label>
        <label>Campo<select id="map-field">${opt(fields,m.field)}</select></label>
        <label>Fundo<select id="map-farm" ${m.field?'':'disabled'}>${opt(farms,m.farm)}</select></label>
        <label>Módulo<select id="map-module" ${m.farm?'':'disabled'}>${opt(modules,m.module)}</select></label>
        <label>Variedad<select id="map-variety">${opt(vars,m.variety)}</select></label>
        ${evaluatorFilter}
      </div>${m.from&&m.to&&m.from>m.to?'<p class="map-warning">La fecha Desde no puede ser posterior a Hasta.</p>':''}</section>`;
  }
  function metrics(v){return `<section class="metrics-grid"><article class="metric"><div class="metric-icon">🗺️</div><div><strong>${v.visible.length}</strong><span>Lotes visibles</span><small>Según jerarquía</small></div></article><article class="metric"><div class="metric-icon">✓</div><div><strong>${v.evaluated.length}</strong><span>Lotes evaluados</span><small>En el periodo</small></div></article><article class="metric"><div class="metric-icon">○</div><div><strong>${v.pending}</strong><span>Lotes pendientes</span><small>Sin registros filtrados</small></div></article><article class="metric"><div class="metric-icon">📋</div><div><strong>${v.records.length}</strong><span>Evaluaciones</span><small>Registros encontrados</small></div></article></section>`;}
  function detail(v){
    const f=[...v.visible,...v.references].find(x=>x.properties?.LOTE===m.lot);
    if(!f)return '<div class="map-detail-empty"><span>🗺️</span><b>Selecciona un lote</b><p>Toca un polígono para ver sus datos.</p></div>';
    const p=f.properties||{};
    if(!p.ACTIVO)return `<div class="map-detail"><em class="reference">Referencia</em><h2>${esc(p.LOTE)}</h2><p>No pertenece al catálogo activo.</p></div>`;
    const rows=(v.byLot.get(p.LOTE)||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))), last=rows[0];
    const varieties=uniq(rows.map(r=>r.variety)), evals=uniq(rows.map(r=>r.evaluator||r.evaluatorId)), quadrants=uniq(rows.map(r=>r.quadrant));
    return `<div class="map-detail"><em class="${rows.length?'done':'pending'}">${rows.length?'Evaluado':'Sin evaluación'}</em><h2>${esc(p.LOTE)}</h2>
      <dl><div><dt>Campo</dt><dd>${esc(p.CAMPO)}</dd></div><div><dt>Fundo</dt><dd>${esc(p.FUNDO)}</dd></div><div><dt>Módulo</dt><dd>${esc(p.MODULO)}</dd></div><div><dt>Registros</dt><dd>${rows.length}</dd></div><div><dt>Última fecha</dt><dd>${last?.date||'—'}</dd></div><div><dt>Cuadrantes</dt><dd>${esc(quadrants.join(', ')||'—')}</dd></div></dl>
      <p><b>Variedades:</b> ${esc(varieties.join(', ')||'—')}</p><p><b>Evaluadores:</b> ${esc(evals.join(', ')||'—')}</p>
      ${last?`<button class="secondary" data-map-record="${esc(last.id)}">Abrir último registro</button>`:''}</div>`;
  }
  function mapPanel(v){return `<section class="map-layout"><article class="panel map-card"><div class="map-toolbar"><div class="map-legend"><span><i class="gray"></i>Pendiente</span><span><i class="green"></i>Evaluado</span><span><i class="beige"></i>Referencia</span></div><div class="map-zoom"><button id="map-out" aria-label="Alejar">−</button><button id="map-fit">Ajustar</button><button id="map-in" aria-label="Acercar">+</button></div></div><div class="map-canvas"><svg id="map-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de lotes de Olmos y Motupe"><g id="map-world"></g></svg></div><small>Arrastra para mover y usa los controles para acercar.</small></article><aside class="panel map-detail-panel" id="map-detail-panel">${detail(v)}</aside></section>`;}
  function quality(v){
    const names=uniq(v.unmatched.map(r=>r.lot));
    return `<section class="panel map-quality"><div><span>CONTROL DEL GEOJSON</span><h2>Coincidencia con el catálogo</h2><p>${m.data.stats?.lotesActivos||active().length} lotes activos vinculados; ${m.data.stats?.poligonosSinCodigoOmitidos||0} polígonos sin código fueron omitidos.</p></div><div class="${names.length?'bad':'ok'}"><b>${names.length}</b><span>lotes de registros sin polígono</span>${names.length?`<small>${esc(names.slice(0,12).join(', '))}${names.length>12?'…':''}</small>`:'<small>Todos los registros filtrados coinciden.</small>'}</div></section>`;
  }
  function renderPage(){
    if(!roles()){state.view='home';return render();}
    const kicker=state.session.role==='Administrador'?'ADMINISTRADOR':state.session.role==='Supervisor'?'SUPERVISOR':'EVALUADOR';
    const description=evaluatorRole()?'Visualiza en el mapa únicamente el avance de tus propias evaluaciones.':'Visualiza los polígonos del GeoJSON y el avance de la base consolidada.';
    if(!m.data){app.innerHTML=shell(`${titleBlock(kicker,'Mapa de avance','Preparando polígonos…')}<section class="panel map-loading"><span>🗺️</span><h2>Cargando GeoJSON</h2></section>`);load().then(renderPage).catch(()=>app.innerHTML=shell(`${titleBlock(kicker,'Mapa de avance','No se pudo cargar el mapa.')}<section class="panel map-loading"><span>⚠️</span><h2>${esc(m.error)}</h2><button class="primary" id="map-retry">Reintentar</button></section>`));return;}
    const v=m.from&&m.to&&m.from>m.to?{...model(),records:[],byLot:new Map(),evaluated:[],pending:active().filter(featureOk).length,unmatched:[]}:model();
    app.innerHTML=shell(`${titleBlock(kicker,'Mapa de avance',description)}${filters()}${metrics(v)}${mapPanel(v)}${quality(v)}`);
    draw(v);
  }
  function polygons(g){return !g?[]:g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];}
  function points(features){const a=[];features.forEach(f=>polygons(f.geometry).forEach(p=>p.forEach(r=>r.forEach(q=>a.push(q)))));return a;}
  function projection(features){
    const p=points(features);if(!p.length)return q=>q;
    const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),dx=Math.max(maxX-minX,1e-9),dy=Math.max(maxY-minY,1e-9),s=Math.min((W-PAD*2)/dx,(H-PAD*2)/dy),ox=(W-dx*s)/2,oy=(H-dy*s)/2;
    return ([x,y])=>[ox+(x-minX)*s,H-(oy+(y-minY)*s)];
  }
  function path(f,pr){return polygons(f.geometry).map(p=>p.map(r=>r.map((q,i)=>{const [x,y]=pr(q);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join(' ')+' Z').join(' ')).join(' ');}
  function center(f,pr){const p=points([f]).map(pr);return [p.reduce((s,q)=>s+q[0],0)/p.length,p.reduce((s,q)=>s+q[1],0)/p.length];}
  function draw(v){
    const svg=document.querySelector('#map-svg'),world=document.querySelector('#map-world'),features=[...v.visible,...v.references];if(!svg||!world)return;
    if(!features.length){world.innerHTML='<text x="600" y="380" text-anchor="middle">No hay lotes para estos filtros</text>';return;}
    const pr=projection(features);
    world.innerHTML=features.map(f=>{const p=f.properties||{},done=(v.byLot.get(p.LOTE)||[]).length,status=!p.ACTIVO?'reference':done?'done':'pending',[cx,cy]=center(f,pr);return `<g class="map-lot ${status} ${m.lot===p.LOTE?'selected':''}" data-map-lot="${esc(p.LOTE)}"><path d="${path(f,pr)}" fill-rule="evenodd" vector-effect="non-scaling-stroke"></path><text x="${cx}" y="${cy}" text-anchor="middle">${esc(p.LOTE)}</text></g>`;}).join('');
    transform();gestures(svg);
  }
  function transform(){const w=document.querySelector('#map-world'),svg=document.querySelector('#map-svg');if(w)w.setAttribute('transform',`translate(${m.x} ${m.y}) scale(${m.zoom})`);if(svg)svg.dataset.labels=m.zoom>=1.7?'show':'hide';}
  function zoom(z,cx=W/2,cy=H/2){const old=m.zoom,n=Math.min(12,Math.max(.75,z)),f=n/old;m.x=cx-(cx-m.x)*f;m.y=cy-(cy-m.y)*f;m.zoom=n;transform();}
  function fit(){Object.assign(m,{zoom:1,x:0,y:0});transform();}
  function gestures(svg){
    if(svg.dataset.bound)return;svg.dataset.bound='1';
    svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H;zoom(m.zoom*(e.deltaY<0?1.2:.84),x,y);},{passive:false});
    svg.addEventListener('pointerdown',e=>{svg.setPointerCapture(e.pointerId);m.drag={id:e.pointerId,sx:e.clientX,sy:e.clientY,x:m.x,y:m.y,moved:false};});
    svg.addEventListener('pointermove',e=>{if(!m.drag||m.drag.id!==e.pointerId)return;const r=svg.getBoundingClientRect(),dx=(e.clientX-m.drag.sx)/r.width*W,dy=(e.clientY-m.drag.sy)/r.height*H;m.drag.moved=Math.abs(dx)+Math.abs(dy)>3;m.x=m.drag.x+dx;m.y=m.drag.y+dy;transform();});
    const end=e=>{if(m.drag?.id===e.pointerId)setTimeout(()=>m.drag=null,0);};svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
  }
  function readFilters(){['from','to','field','farm','module','variety','evaluator'].forEach(k=>m[k]=document.querySelector(`#map-${k}`)?.value||'');}
  const oldMap=mapView;mapView=function(){return roles()?renderPage():oldMap();};
  const oldSide=sidebar;sidebar=function(){return oldSide().replace(/Versión\s+[0-9.]+/,`Versión ${VERSION}`);};
  document.addEventListener('change',e=>{if(state.view!=='map'||!roles()||!['map-from','map-to','map-field','map-farm','map-module','map-variety','map-evaluator'].includes(e.target.id))return;readFilters();if(e.target.id==='map-field'){m.farm='';m.module='';m.variety='';}if(e.target.id==='map-farm')m.module='';m.lot='';fit();renderPage();});
  document.addEventListener('click',e=>{
    if(state.view!=='map'||!roles())return;
    if(e.target.closest('#map-retry')){m.data=null;m.error='';renderPage();return;}
    if(e.target.closest('#map-today')){m.from=m.to=iso();m.lot='';fit();renderPage();return;}
    if(e.target.closest('#map-clear')){Object.assign(m,{from:'',to:'',field:'',farm:'',module:'',variety:'',evaluator:'',lot:'',zoom:1,x:0,y:0});renderPage();return;}
    if(e.target.closest('#map-in')){zoom(m.zoom*1.35);return;}if(e.target.closest('#map-out')){zoom(m.zoom/1.35);return;}if(e.target.closest('#map-fit')){fit();return;}
    const record=e.target.closest('[data-map-record]');if(record){state.selectedRecordId=record.dataset.mapRecord;state.view='record-detail';render();return;}
    const lot=e.target.closest('[data-map-lot]');if(lot&&!m.drag?.moved){m.lot=lot.dataset.mapLot;document.querySelector('#map-detail-panel').innerHTML=detail(model());document.querySelectorAll('.map-lot.selected').forEach(x=>x.classList.remove('selected'));lot.classList.add('selected');}
  });
  if(typeof state!=='undefined'&&state.catalog&&state.view==='map')renderPage();
})();
