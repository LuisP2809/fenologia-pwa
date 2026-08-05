const CACHE='fenologia-v0.8.3-codespaces-reset';
const ASSETS=[
  './',
  './index.html',
  './manifest.webmanifest?v=0.8.3',
  './data/catalogos.json',
  './data/lotes-mapa.geojson',
  './app-db.js?v=0.8.3',
  './app-bootstrap.js?v=0.8.3',
  './app-core.js?v=0.8.3',
  './app-eval.js?v=0.8.3',
  './app-admin.js?v=0.8.3',
  './app-security.js?v=0.8.3',
  './app-workflow-patches.js?v=0.8.3',
  './app-export-filters.js?v=0.8.3',
  './app-db-ui.js?v=0.8.3',
  './app-supervisor.js?v=0.8.3',
  './app-supervisor-role.js?v=0.8.3',
  './app-supervisor-unified.js?v=0.8.3',
  './app-map-decoder-fix.js?v=0.8.3',
  './app-map.js?v=0.8.3',
  './app-release.js?v=0.8.3',
  './css-core.css?v=0.8.3',
  './css-ui.css?v=0.8.3',
  './css-extra.css?v=0.8.3',
  './css-workflow-patches.css?v=0.8.3',
  './css-security.css?v=0.8.3',
  './css-export-filters.css?v=0.8.3',
  './css-db.css?v=0.8.3',
  './css-supervisor.css?v=0.8.3',
  './css-supervisor-role.css?v=0.8.3',
  './css-supervisor-unified.css?v=0.8.3',
  './css-mobile-header.css?v=0.8.3',
  './css-map.css?v=0.8.3'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(async cache=>{
        const results=await Promise.allSettled(ASSETS.map(asset=>cache.add(asset)));
        results.forEach((result,index)=>{
          if(result.status==='rejected') console.warn('No se pudo guardar offline:',ASSETS[index],result.reason);
        });
      })
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  const networkRequest=fetch(event.request).then(response=>{
    if(response&&response.ok){
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
    }
    return response;
  });

  event.respondWith(
    networkRequest.catch(async()=>{
      const cached=await caches.match(event.request,{ignoreSearch:true});
      if(cached) return cached;
      if(event.request.mode==='navigate'){
        const page=await caches.match('./index.html');
        if(page) return page;
      }
      return new Response('Recurso no disponible sin conexión.',{
        status:503,
        headers:{'Content-Type':'text/plain; charset=utf-8'}
      });
    })
  );
});