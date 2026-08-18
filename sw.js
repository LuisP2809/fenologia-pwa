const CACHE='fenologia-v0.14.0-map-stable';
const VERSION='0.14.0';
const versioned=path=>`${path}?v=${VERSION}`;
const ASSETS=[
  './','./index.html',versioned('./manifest.webmanifest'),
  versioned('./icons/icon-192.png'),versioned('./icons/icon-512.png'),versioned('./icons/icon-maskable.png'),
  versioned('./icons/icon-192.svg'),versioned('./icons/icon-512.svg'),versioned('./icons/icon-maskable.svg'),
  './data/catalogos.json',versioned('./data/lotes-mapa.geojson'),
  versioned('./app-db.js'),versioned('./app-bootstrap.js'),versioned('./app-core.js'),versioned('./app-eval.js'),
  versioned('./app-admin.js'),versioned('./app-credentials.js'),versioned('./app-package-security.js'),versioned('./app-security.js'),versioned('./app-workflow-patches.js'),versioned('./app-export-filters.js'),
  versioned('./app-db-ui.js'),versioned('./app-supervisor.js'),versioned('./app-supervisor-role.js'),versioned('./app-supervisor-unified.js'),
  versioned('./app-map.js'),versioned('./app-charts.js'),versioned('./app-admin-complete.js'),versioned('./app-admin-dni-fix.js'),
  versioned('./app-user-access-package.js'),versioned('./app-admin-role-cleanup.js'),versioned('./app-dynamic-parameters.js'),versioned('./app-dynamic-supervisor.js'),
  versioned('./app-stage-analytics.js'),versioned('./app-stage-analytics-ui.js'),versioned('./app-charts-refinement.js'),versioned('./app-platform.js'),
  versioned('./app-xlsx-workflow.js'),versioned('./app-xlsx-compat.js'),versioned('./app-supervisor-file-analysis.js'),versioned('./app-analysis-source-guard.js'),
  versioned('./app-evaluator-navigation.js'),versioned('./app-evaluation-flow.js'),versioned('./app-session-security.js'),versioned('./app-release.js'),
  versioned('./css-core.css'),versioned('./css-ui.css'),versioned('./css-extra.css'),versioned('./css-workflow-patches.css'),
  versioned('./css-security.css'),versioned('./css-export-filters.css'),versioned('./css-db.css'),versioned('./css-supervisor.css'),
  versioned('./css-supervisor-role.css'),versioned('./css-supervisor-unified.css'),versioned('./css-mobile-header.css'),versioned('./css-map.css'),
  versioned('./css-charts.css'),versioned('./css-stage-analytics.css'),versioned('./css-admin-complete.css'),versioned('./css-dynamic-parameters.css'),
  versioned('./css-platform.css'),versioned('./css-xlsx-workflow.css')
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('fenologia-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
function fetchWithTimeout(request,timeout=4000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  return fetch(request,{signal:controller.signal}).finally(()=>clearTimeout(timer));
}
async function cacheFirst(request){
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request,{ignoreSearch:true});
  const refresh=fetchWithTimeout(request).then(response=>{if(response.ok)cache.put(request,response.clone());return response;}).catch(()=>null);
  if(cached){refresh.catch(()=>{});return cached;}
  return await refresh;
}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const requestUrl=new URL(event.request.url);
  if(requestUrl.origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const staticAsset=/\.(?:js|css|svg|png|webmanifest|geojson|json)$/i.test(requestUrl.pathname);
    if(staticAsset){
      const response=await cacheFirst(event.request);
      if(response)return response;
    }
    try{
      const response=await fetchWithTimeout(event.request);
      if(response?.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});}
      return response;
    }catch{
      const cached=await caches.match(event.request,{ignoreSearch:true});
      if(cached)return cached;
      if(event.request.mode==='navigate'){
        const page=await caches.match('./index.html',{ignoreSearch:true});
        if(page)return page;
      }
      return new Response('Recurso no disponible sin conexión.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
