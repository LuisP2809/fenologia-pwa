const CACHE='fenologia-v0.10.2-admin-menu';
const ASSETS=[
  './',
  './index.html',
  './manifest.webmanifest?v=0.10.2',
  './data/catalogos.json',
  './data/map-inline-1.js?v=0.10.2',
  './data/map-inline-2.js?v=0.10.2',
  './data/map-inline-3.js?v=0.10.2',
  './data/map-inline-4.js?v=0.10.2',
  './data/map-inline-5.js?v=0.10.2',
  './app-map-inline-source.js?v=0.10.2',
  './app-db.js?v=0.10.2',
  './app-bootstrap.js?v=0.10.2',
  './app-core.js?v=0.10.2',
  './app-eval.js?v=0.10.2',
  './app-admin.js?v=0.10.2',
  './app-security.js?v=0.10.2',
  './app-workflow-patches.js?v=0.10.2',
  './app-export-filters.js?v=0.10.2',
  './app-db-ui.js?v=0.10.2',
  './app-supervisor.js?v=0.10.2',
  './app-supervisor-role.js?v=0.10.2',
  './app-supervisor-unified.js?v=0.10.2',
  './app-map.js?v=0.10.2',
  './app-charts.js?v=0.10.2',
  './app-admin-complete.js?v=0.10.2',
  './app-admin-role-cleanup.js?v=0.10.2',
  './app-release.js?v=0.10.2',
  './css-core.css?v=0.10.2',
  './css-ui.css?v=0.10.2',
  './css-extra.css?v=0.10.2',
  './css-workflow-patches.css?v=0.10.2',
  './css-security.css?v=0.10.2',
  './css-export-filters.css?v=0.10.2',
  './css-db.css?v=0.10.2',
  './css-supervisor.css?v=0.10.2',
  './css-supervisor-role.css?v=0.10.2',
  './css-supervisor-unified.css?v=0.10.2',
  './css-mobile-header.css?v=0.10.2',
  './css-map.css?v=0.10.2',
  './css-charts.css?v=0.10.2',
  './css-admin-complete.css?v=0.10.2'
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