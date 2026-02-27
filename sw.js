/* ============================================
   SafePDF — Service Worker
   Cache-first strategy for full offline use
   ============================================ */

const CACHE_NAME = 'safepdf-v4';

const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './sanitize.worker.js',
    './pdf.min.mjs',
    './pdf.worker.min.mjs',
    './jspdf.umd.min.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// Install — cache all assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

// Fetch — cache first, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request);
        })
    );
});
