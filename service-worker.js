const CACHE='camping-map-v1';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./data/sites.json','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{if(e.request.method==='GET'&&r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone))}return r}).catch(()=>cached)))});
