const CACHE='fenologia-v0.7.4-mobile-header';
const ASSETS=[
  './',
  './index.html',
  './manifest.webmanifest?v=0.7.4',
  './data/catalogos.json',
  './app-db.js?v=0.7.4',
  './app-bootstrap.js?v=0.7.4',
  './app-core.js?v=0.7.4',
  './app-eval.js?v=0.7.4',
  './app-admin.js?v=0.7.4',
  './app-security.js?v=0.7.4',
  './app-workflow-patches.js?v=0.7.4',
  './app-export-filters.js?v=0.7.4',
  './app-db-ui.js?v=0.7.4',
  './app-supervisor.js?v=0.7.4',
  './app-supervisor-role.js?v=0.7.4',
  './app-supervisor-unified.js?v=0.7.4',
  './css-core.css?v=0.7.4',
  './css-ui.css?v=0.7.4',
  './css-extra.css?v=0.7.4',
  './css-workflow-patches.css?v=0.7.4',
  './css-security.css?v=0.7.4',
  './css-export-filters.css?v=0.7.4',
  './css-db.css?v=0.7.4',
  './css-supervisor.css?v=0.7.4',
  './css-supervisor-role.css?v=0.7.4',
  './css-supervisor-unified.css?v=0.7.4',
  './css-mobile-header.css?v=0.7.4'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html')))
  );
});