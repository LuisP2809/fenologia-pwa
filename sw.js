const CACHE='fenologia-v0.13.3-evaluator-navigation-fix';
const ASSETS=[
  './',
  './index.html',
  './manifest.webmanifest?v=0.13.3',
  './icons/icon-192.svg?v=0.13.3',
  './icons/icon-512.svg?v=0.13.3',
  './icons/icon-maskable.svg?v=0.13.3',
  './data/catalogos.json',
  './data/map-inline-1.js?v=0.13.3',
  './data/map-inline-2.js?v=0.13.3',
  './data/map-inline-3.js?v=0.13.3',
  './data/map-inline-4.js?v=0.13.3',
  './data/map-inline-5.js?v=0.13.3',
  './app-map-inline-source.js?v=0.13.3',
  './app-db.js?v=0.13.3',
  './app-bootstrap.js?v=0.13.3',
  './app-core.js?v=0.13.3',
  './app-eval.js?v=0.13.3',
  './app-admin.js?v=0.13.3',
  './app-security.js?v=0.13.3',
  './app-workflow-patches.js?v=0.13.3',
  './app-export-filters.js?v=0.13.3',
  './app-db-ui.js?v=0.13.3',
  './app-supervisor.js?v=0.13.3',
  './app-supervisor-role.js?v=0.13.3',
  './app-supervisor-unified.js?v=0.13.3',
  './app-map.js?v=0.13.3',
  './app-charts.js?v=0.13.3',
  './app-admin-complete.js?v=0.13.3',
  './app-admin-role-cleanup.js?v=0.13.3',
  './app-dynamic-parameters.js?v=0.13.3',
  './app-dynamic-supervisor.js?v=0.13.3',
  './app-stage-analytics.js?v=0.13.3',
  './app-stage-analytics-ui.js?v=0.13.3',
  './app-charts-refinement.js?v=0.13.3',
  './app-platform.js?v=0.13.3',
  './app-xlsx-workflow.js?v=0.13.3',
  './app-xlsx-compat.js?v=0.13.3',
  './app-supervisor-file-analysis.js?v=0.13.3',
  './app-analysis-source-guard.js?v=0.13.3',
  './app-evaluator-navigation.js?v=0.13.3',
  './app-release.js?v=0.13.3',
  './css-core.css?v=0.13.3',
  './css-ui.css?v=0.13.3',
  './css-extra.css?v=0.13.3',
  './css-workflow-patches.css?v=0.13.3',
  './css-security.css?v=0.13.3',
  './css-export-filters.css?v=0.13.3',
  './css-db.css?v=0.13.3',
  './css-supervisor.css?v=0.13.3',
  './css-supervisor-role.css?v=0.13.3',
  './css-supervisor-unified.css?v=0.13.3',
  './css-mobile-header.css?v=0.13.3',
  './css-map.css?v=0.13.3',
  './css-charts.css?v=0.13.3',
  './css-stage-analytics.css?v=0.13.3',
  './css-admin-complete.css?v=0.13.3',
  './css-dynamic-parameters.css?v=0.13.3',
  './css-platform.css?v=0.13.3',
  './css-xlsx-workflow.css?v=0.13.3'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE).then(async cache=>{
      const results=await Promise.allSettled(ASSETS.map(asset=>cache.add(asset)));
      results.forEach((result,index)=>{
        if(result.status==='rejected') console.warn('No se pudo guardar offline:',ASSETS[index],result.reason);
      });
    })
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type === 'SKIP_WAITING') self.skipWaiting();
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
  const requestUrl=new URL(event.request.url);
  if(requestUrl.origin!==self.location.origin) return;

  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request);
      if(response?.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
      }
      return response;
    }catch{
      const cached=await caches.match(event.request,{ignoreSearch:true});
      if(cached) return cached;
      if(event.request.mode==='navigate'){
        const page=await caches.match('./index.html',{ignoreSearch:true});
        if(page) return page;
      }
      return new Response('Recurso no disponible sin conexión.',{
        status:503,
        headers:{'Content-Type':'text/plain; charset=utf-8'}
      });
    }
  })());
});