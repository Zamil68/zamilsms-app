self.addEventListener('install', function(e) { self.skipWaiting(); });
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(ks) { return Promise.all(ks.map(function(k) { return caches.delete(k); })); })
      .then(function() { return self.registration.unregister(); })
      .then(function() { return self.clients.matchAll({ type: 'window' }); })
      .then(function(cls) { cls.forEach(function(c) { try { c.navigate(c.url); } catch(e){} }); })
  );
});
self.addEventListener('fetch', function(e) { e.respondWith(fetch(e.request).catch(function() { return new Response('Offline'); })); });
