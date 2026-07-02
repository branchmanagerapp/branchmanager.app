const C='gc-v1';
const ASSETS=['gc-app.html','gc-manifest.json','gc-icons/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
    const cp=resp.clone();caches.open(C).then(c=>c.put(e.request,cp));return resp;
  }).catch(()=>caches.match('gc-app.html'))));
});
