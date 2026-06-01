const APP_CACHE_VERSION = "novax-pwa-v33";

if ("caches" in globalThis) {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter((name) => name.startsWith("novax-pwa-") && name !== APP_CACHE_VERSION)
      .map((name) => caches.delete(name)),
  );
}

await import("./src/main.js?v=33");
