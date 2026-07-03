const CACHE_VERSION = "novax-pwa-v36";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=36",
  "/app.js?v=36",
  "/manifest.webmanifest",
  "/assets/novax-icon-192.png",
  "/assets/novax-icon-512.png",
  "/assets/novax-maskable-512.png",
  "/assets/novax-logo.svg",
  "/src/api.js",
  "/src/alerts.js",
  "/src/binance-feed.js",
  "/src/chart.js",
  "/src/config.js",
  "/src/dom.js",
  "/src/formatters.js",
  "/src/learning.js",
  "/src/main.js",
  "/src/market-data.js",
  "/src/market-sim.js",
  "/src/orders.js",
  "/src/portfolio.js",
  "/src/pwa.js",
  "/src/render.js",
  "/src/storage.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match(fallbackUrl);
  }
}
