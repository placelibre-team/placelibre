/* PlaceLibre · service worker : ouverture rapide et hors-ligne partiel.
   Fichiers du site : réseau d'abord (toujours à jour), cache en secours.
   Bibliothèque de carte et polices : cache d'abord. Le reste (temps réel, tuiles) n'est pas touché. */
const V = 'pl-v4-confirmation';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/places.js', 'js/state.js', 'js/geometry.js', 'js/model.js', 'js/journal.js',
  'js/predict.js', 'js/sync.js', 'js/events.js', 'js/map.js', 'js/ui.js', 'js/main.js', 'manifest.webmanifest', 'icons/icon-192.png'];
const STATIC_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if(r.method !== 'GET') return;
  const u = new URL(r.url);
  if(u.origin === location.origin){
    e.respondWith(fetch(r).then(res => { if(res.ok){ const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })
      .catch(() => caches.match(r, {ignoreSearch:true})));
  }else if(STATIC_HOSTS.includes(u.hostname)){
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if(res.ok){ const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })));
  }
});
