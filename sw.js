const CACHE='fenologia-v0.6.0-indexeddb';
const ASSETS=[
  './',
  './index.html',
  './manifest.webmanifest?v=0.6.0',
  './data/catalogos.json',
  './app-db.js?v=0.6.0',
  './app-bootstrap.js?v=0.6.0',
  './app-core.js?v=0.6.0',
  './app-eval.js?v=0.6.0',
  './app-admin.js?v=0.6.0',
  './app-security.js?v=0.6.0',
  './app-workflow-patches.js?v=0.6.0',
  './app-export-filters.js?v=0.6.0',
  './app-db-ui.js?v=0.6.0',
  './css-core.css?v=0.6.0',
  './css-ui.css?v=0.6.0',
  './css-extra.css?v=0.6.0',
  './css-workflow-patches.css?v=0.6.0',
  './css-security.css?v=0.6.0',
  './css-export-filters.css?v=0.6.0',
  './css-db.css?v=0.6.0'
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