(() => {
  const MAP_SUFFIX = '/data/lotes-mapa.geojson';
  const EXPECTED_LENGTH = 19920;
  const EXPECTED_B64_SHA256 = '7b55dbb163b3fbcdccc8f2f3ef88297da3bdecaacf5d2b2ef6e97a807bf606e7';
  const encoded = String(window.__FENOLOGIA_MAP_B64 || '');

  window.__FENOLOGIA_MAP_INFO = {
    source: 'completo(1).geojson + FENOLOGIA(2).xlsx',
    originalPolygons: 296,
    normalizedFeatures: 254,
    activeLots: 254,
    referenceZones: 0,
    omittedWithoutCode: 0,
    encodedSha256: '',
    ready: false
  };

  const toHex = buffer => [...new Uint8Array(buffer)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');

  async function waitForCatalog(){
    for(let attempt = 0; attempt < 100; attempt += 1){
      if(window.state?.catalog?.lotesAgrupados) return window.state.catalog;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('No se pudo cargar el catálogo actualizado de lotes.');
  }

  function catalogIndex(catalog){
    const index = new Map();
    const grouped = catalog?.lotesAgrupados || {};

    Object.entries(grouped).forEach(([field, farms]) => {
      Object.entries(farms || {}).forEach(([farm, modules]) => {
        Object.entries(modules || {}).forEach(([module, lots]) => {
          (lots || []).forEach(lot => {
            index.set(String(lot).trim(), {
              CAMPO: field,
              FUNDO: farm,
              MODULO: module
            });
          });
        });
      });
    });

    return index;
  }

  async function decodeMap(){
    if(typeof DecompressionStream !== 'function'){
      throw new Error('El navegador necesita una versión reciente de Chrome para abrir el mapa.');
    }

    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for(let index = 0; index < binary.length; index += 1){
      bytes[index] = binary.charCodeAt(index);
    }

    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  function enrichMap(geojson, catalog){
    if(geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)){
      throw new Error('El mapa integrado no contiene una colección GeoJSON válida.');
    }

    const index = catalogIndex(catalog);
    geojson.features.forEach(feature => {
      const lot = String(feature?.properties?.LOTE || '').trim();
      const metadata = index.get(lot);
      feature.properties = feature.properties || {};

      if(metadata){
        Object.assign(feature.properties, metadata, {
          LOTE: lot,
          ACTIVO: true,
          TIPO: 'LOTE'
        });
      }else{
        feature.properties.ACTIVO = false;
        feature.properties.TIPO = 'REFERENCIA';
      }
    });

    const active = geojson.features.filter(feature => feature.properties?.ACTIVO).length;
    const references = geojson.features.length - active;

    if(geojson.features.length !== 254 || active !== 254){
      throw new Error(
        `La relación del mapa no coincide: ${geojson.features.length} geometrías y ${active} lotes activos.`
      );
    }

    geojson.stats = {
      ...(geojson.stats || {}),
      lotesActivos: active,
      zonasReferencia: references,
      poligonosSinCodigoOmitidos: 0,
      featuresOriginales: 296,
      featuresNormalizadas: 254
    };

    return geojson;
  }

  function installMapSource(geojson){
    const nativeFetch = window.fetch.bind(window);
    const payload = JSON.stringify(geojson);

    window.fetch = function fenologiaMapFetch(input, init){
      try{
        const rawUrl = input instanceof Request ? input.url : String(input);
        const url = new URL(rawUrl, window.location.href);

        if(url.pathname.endsWith(MAP_SUFFIX)){
          return Promise.resolve(new Response(payload, {
            status: 200,
            headers: {
              'Content-Type': 'application/geo+json; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Fenologia-Map-Source': 'inline-catalog-validated'
            }
          }));
        }
      }catch(error){
        console.warn('No se pudo interpretar la solicitud del mapa:', error);
      }

      return nativeFetch(input, init);
    };
  }

  window.__FENOLOGIA_MAP_VALIDATION = (async () => {
    if(encoded.length !== EXPECTED_LENGTH || encoded.length % 4 !== 0){
      throw new Error(
        `El mapa integrado está incompleto: ${encoded.length} de ${EXPECTED_LENGTH} caracteres.`
      );
    }

    if(!window.crypto?.subtle){
      throw new Error('El navegador no permite comprobar la integridad del mapa.');
    }

    const digest = await window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(encoded)
    );
    const hash = toHex(digest);
    window.__FENOLOGIA_MAP_INFO.encodedSha256 = hash;

    if(hash !== EXPECTED_B64_SHA256){
      throw new Error('La verificación del mapa no coincide con el archivo validado.');
    }

    const catalog = await waitForCatalog();
    const geojson = enrichMap(await decodeMap(), catalog);
    installMapSource(geojson);

    window.__FENOLOGIA_MAP_INFO.ready = true;
    return window.__FENOLOGIA_MAP_INFO;
  })();
})();
