const CACHE_NAME = "swisscompanion-v8";

// Usamos "./" en lugar de "/" para que sea compatible con GitHub Pages
const urlsToCache = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.json"
];

// Instalar y forzar que tome el control inmediatamente
self.addEventListener("install", (e) => {
    self.skipWaiting(); 
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(urlsToCache);
        })
    );
});

// Limpiar cachés viejos al activarse
self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName); // Elimina el v1, v2 y v3
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Interceptar peticiones (Modo: Red primero, Caché como Plan B)
self.addEventListener("fetch", (e) => {
    // Solo interceptamos peticiones GET (ignoramos las de subir datos a Firebase)
    if (e.request.method !== 'GET') return;

    e.respondWith(
        fetch(e.request)
            .then((response) => {
                // Si hay internet, hacemos una copia de los recursos (incluyendo Firebase y QR) y la guardamos
                const resClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, resClone);
                });
                return response;
            })
            .catch(() => {
                // Si el dinosaurio intenta aparecer (no hay internet), sacamos la copia guardada
                return caches.match(e.request);
            })
    );
});
