/**
 * The web app's service worker. It keeps Lumière working offline: the files
 * of this build are cached when it installs and served from the cache first.
 * Notes are not here; they live in the browser's storage or the reader's
 * folders, which only the window reads. So the worker asks the window for
 * what only it has: a note's page (shared/routes.ts, src/answers.ts).
 * scripts/build.mjs builds it into sw.js.
 */
import { isAppWindow, routeOf, type Route } from "../shared/routes";
import { notFound, pageResponse } from "./responses";
import { askWindows } from "./windows";

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
  const route = routeOf(request.url, self.registration.scope);
  if (route) {
    event.respondWith(answer(route));
    return;
  }
  event.respondWith(
    caches
      .match(request, { ignoreSearch: true })
      .then((cached) => cached ?? fetch(request)),
  );
});

/** Ask the app's windows for what `route` names. */
async function answer(route: Route): Promise<Response> {
  const reply = await askWindows(await appWindows(), {
    lumiere: "page",
    id: route.id,
  });
  return reply?.kind === "page" ? pageResponse(reply.html) : notFound();
}

/** The app's windows, also one the worker does not control yet. */
async function appWindows(): Promise<readonly Client[]> {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  return windows.filter((window) =>
    isAppWindow(window.url, self.registration.scope),
  );
}
