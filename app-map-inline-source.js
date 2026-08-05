(() => {
  const MAP_SUFFIX = '/data/lotes-mapa.geojson';
  const EXPECTED_LENGTH = 19920;
  const EXPECTED_B64_SHA256 = '7b55dbb163b3fbcdccc8f2f3ef88297da3bdecaacf5d2b2ef6e97a807bf606e7';
  const encoded = String(window.__FENOLOGIA_MAP_B64 || '');

  window.__FENOLOGIA_MAP_INFO = {
    source: 'completo(1).geojson',
    originalPolygons: 296,
    normalizedFeatures: 254,
    activeLots: 253,
    referenceZones: 1,
    omittedWithoutCode: 0,
    rawGeojsonSha256: '45360766511bd55075df63ef254f8a66ad60fea3004ac5b9029996a58240b02c',
    encodedSha256: '',
    ready: false
  };

  const toHex = buffer => [...new Uint8Array(buffer)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');

  function installMapSource(){
    const nativeFetch = window.fetch.bind(window);
    const payload = JSON.stringify({
      encoding: 'gzip-base64',
      contentType: 'application/geo+json',
      sha256: window.__FENOLOGIA_MAP_INFO.rawGeojsonSha256,
      data: encoded
    });

    window.fetch = function fenologiaMapFetch(input, init) {
      try {
        const rawUrl = input instanceof Request ? input.url : String(input);
        const url = new URL(rawUrl, window.location.href);

        if (url.pathname.endsWith(MAP_SUFFIX)) {
          return Promise.resolve(new Response(payload, {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Fenologia-Map-Source': 'inline-validated'
            }
          }));
        }
      } catch (error) {
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

    installMapSource();
    window.__FENOLOGIA_MAP_INFO.ready = true;
    return window.__FENOLOGIA_MAP_INFO;
  })();
})();
