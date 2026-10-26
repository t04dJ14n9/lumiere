/**
 * The web app's service worker. It keeps Lumière working offline: the files
 * of this build are cached when it installs and served from the cache first.
 * Notes are not here; they live in the browser's storage or the reader's
 * folders. scripts/build.mjs builds it into sw.js.
 */
// A module, so that `self` below can be the service worker's own scope.
export {};

declare const self: ServiceWorkerGlobalScope;
/** This build's name, for its cache (scripts/build.mjs). */
declare const LUMIERE_BUILD: string;
/** This build's files, relative to the worker (scripts/build.mjs). */
declare const LUMIERE_FILES: readonly string[];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(LUMIERE_BUILD)
      .then((cache) => cache.addAll([...LUMIERE_FILES]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== LUMIERE_BUILD)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }
  event.respondWith(
    caches
      .match(request, { ignoreSearch: true })
      .then((cached) => cached ?? fetch(request)),
  );
});
