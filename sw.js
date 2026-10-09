// Generated at build time by vite.config.ts.
const CACHE = "boxmaker-8667c36f7de4";
const PRECACHE = ["./","./dist/","./dist/assets/app-B7uKfbyM.js","./dist/assets/app-DOlPyI7k.css","./dist/favicon.svg","./dist/index.html","./dist/manifest.webmanifest","./index.html","./public/favicon.svg"];
const APP_PAGE = "./dist/index.html";

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  if (request.mode === 'navigate') {
    // Network first for the page, so a new build shows up as soon as it's online.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request, { ignoreSearch: true }).then((cached) => cached || caches.match(APP_PAGE)),
        ),
    );
    return;
  }
  // Hashed assets never change: cache first, keeping anything fetched later too.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
