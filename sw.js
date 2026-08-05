const CACHE='fenologia-v0.7.1-supervisor-role';
const ASSETS=[
  './',
  './index.html',
  './manifest.webmanifest?v=0.7.1',
  './data/catalogos.json',
  './app-db.js?v=0.7.1',
  './app-bootstrap.js?v=0.7.1',
  './app-core.js?v=0.7.1',
  './app-eval.js?v=0.7.1',
  './app-admin.js?v=0.7.1',
  './app-security.js?v=0.7.1',
  './app-workflow-patches.js?v=0.7.1',
  './app-export-filters.js?v=0.7.1',
  './app-db-ui.js?v=0.7.1',
  './app-supervisor.js?v=0.7.1',
  './app-supervisor-role.js?v=0.7.1',
  './css-core.css?v=0.7.1',
  './css-ui.css?v=0.7.1',
  './css-extra.css?v=0.7.1',
  './css-workflow-patches.css?v=0.7.1',
  './css-security.css?v=0.7.1',
  './css-export-filters.css?v=0.7.1',
  './css-db.css?v=0.7.1',
  './css-supervisor.css?v=0.7.1',
  './css-supervisor-role.css?v=0.7.1'
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