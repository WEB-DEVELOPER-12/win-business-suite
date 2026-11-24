
"use strict";

const CACHE_NAME = "win-static-v1";

const STATIC_FILES = [
    "/css/style.css",
    "/images/icons/icon-192.png",
    "/images/icons/icon-512.png"
];

// Install and cache only approved public static files.
self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(STATIC_FILES);
            await self.skipWaiting();
        })()
    );
});

// Activate the new worker and remove only older WIN static caches.
self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();

            await Promise.all(
                cacheNames
                    .filter(
                        (name) =>
                            name.startsWith("win-static-") &&
                            name !== CACHE_NAME
                    )
                    .map((name) => caches.delete(name))
            );

            await self.clients.claim();
        })()
    );
});

// Cache-first for the explicitly approved public static files only.
self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    if (url.origin !== self.location.origin || url.search) {
        return;
    }

    if (!STATIC_FILES.includes(url.pathname)) {
        return;
    }

    event.respondWith(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const cachedResponse = await cache.match(request);

            if (cachedResponse) {
                return cachedResponse;
            }

            const networkResponse = await fetch(request);

            if (networkResponse.ok) {
                await cache.put(request, networkResponse.clone());
            }

            return networkResponse;
        })()
    );
});
