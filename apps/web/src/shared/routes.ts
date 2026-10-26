/**
 * The URLs the service worker answers by asking the window (src/answers.ts),
 * under the app's address (`base`, the worker's scope):
 *
 * - `lumiere/page/<id>`: a note's page (src/note-pages.ts);
 *
 * The window makes them and the worker reads them, both from here.
 */
const PAGE = "lumiere/page/";

export type Route = { readonly kind: "page"; readonly id: string };

/** Where a note's page `id` is served. */
export function pageUrl(base: string, id: string): string {
  return new URL(`${PAGE}${encodeURIComponent(id)}`, base).href;
}

/** What `url` asks the worker for, if it is one of these routes. */
export function routeOf(url: string, base: string): Route | undefined {
  if (!url.startsWith(base)) {
    return undefined;
  }
  const rest = url.slice(base.length);
  if (rest.startsWith(PAGE)) {
    const id = decoded(rest.slice(PAGE.length).split(/[?#]/)[0]!);
    return id ? { kind: "page", id } : undefined;
  }
  return undefined;
}

/**
 * Whether a window at `url` is the app itself, which the worker may ask:
 * not a note's page (under `lumiere/`), nor a page outside the app.
 */
export function isAppWindow(url: string, base: string): boolean {
  return url.startsWith(base) && !url.slice(base.length).startsWith("lumiere/");
}

function decoded(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
}
