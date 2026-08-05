(() => {
  const MAP_SUFFIX = '/data/lotes-mapa.geojson';
  const EXPECTED_LENGTH = 19920;
  const encoded = String(window.__FENOLOGIA_MAP_B64 || '');

  window.__FENOLOGIA_MAP_INFO = {
    source: 'completo(1).geojson',
    originalPolygons: 296,
    normalizedFeatures: 254,
    activeLots: 253,
    referenceZones: 1,
    omittedWithoutCode: 0,
    sha256: '45360766511bd55075df63ef254f8a66ad60fea3004ac5b9029996a58240b02c',
    ready: encoded.length === EXPECTED_LENGTH && encoded.length % 4 === 0
  };

  if (!window.__FENOLOGIA_MAP_INFO.ready) {
    console.error(
      `El mapa integrado está incompleto: ${encoded.length} de ${EXPECTED_LENGTH} caracteres.`
    );
    return;
  }

  const nativeFetch = window.fetch.bind(window);
  const payload = JSON.stringify({
    encoding: 'gzip-base64',
    contentType: 'application/geo+json',
    sha256: window.__FENOLOGIA_MAP_INFO.sha256,
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
})();
