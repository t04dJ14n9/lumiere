// Keeps Lumière working offline: the files of this build are cached when it
// installs and served from the cache first. Notes are not here; they live in
// the browser's storage or the reader's folders.
/* global self, caches, fetch, URL */
const BUILD = "__BUILD__";
// Filled in by scripts/build.mjs.
const FILES = [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(BUILD)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== BUILD).map((key) => caches.delete(key)),
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
