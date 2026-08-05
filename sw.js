// sw.js — Service Worker : met le jeu en cache pour un fonctionnement hors-ligne (PWA).

const CACHE = 'ariadne-maze-v1';

// Ressources à précacher lors de l'installation.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './assets/icon.svg',
  './js/main.js',
  './js/game.js',
  './js/maze.js',
  './js/events.js',
  './js/player.js',
  './js/minotaur.js',
  './js/render.js',
  './js/rng.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Stratégie "cache d'abord, réseau ensuite" (le jeu est statique).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
    })
  );
});
