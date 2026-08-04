const CACHE='fenologia-v0.2-visual';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./data/catalogos.json','./payload/js0.txt','./payload/js1.txt','./payload/js2.txt','./payload/js3.txt','./payload/js4.txt','./payload/js5.txt','./payload/css0.txt','./payload/css1.txt'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match('./index.html'))))});
