/**
 * The URLs the service worker answers by asking the window (src/answers.ts),
 * under the app's address (`base`, the worker's scope):
 *
 * - `lumiere/page/<id>`: a note's page (src/note-pages.ts);
 * - `lumiere/file?panel=<id>&uri=<file URI>`: a file a note's page shows
 *   (an image, a video, an embedded PDF), as host-node's routes name it.
 *
 * The window makes them and the worker reads them, both from here.
 */
const PAGE = "lumiere/page/";
const FILE = "lumiere/file";

export type Route =
  | { readonly kind: "page"; readonly id: string }
  | { readonly kind: "file"; readonly panel: string; readonly uri: string };

/** Where a note's page `id` is served. */
export function pageUrl(base: string, id: string): string {
  return new URL(`${PAGE}${encodeURIComponent(id)}`, base).href;
}

/** Where the page of panel `panel` reads `uri`, a file its note shows. */
export function fileUrl(base: string, panel: string, uri: string): string {
  return `${new URL(FILE, base).href}?panel=${encodeURIComponent(panel)}&uri=${encodeURIComponent(uri)}`;
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
  if (rest.startsWith(`${FILE}?`)) {
    return fileRoute(new URL(url).searchParams);
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

function fileRoute(query: URLSearchParams): Route | undefined {
  const panel = query.get("panel");
  const uri = fileUriIn(query.get("uri"));
  return panel && uri ? { kind: "file", panel, uri } : undefined;
}

/**
 * The `file:` URI in `text`, without a query. The editor adds `?v=<mtime>`
 * to the URL it is given, to reload a changed file, and here that lands in
 * the URI; a `?` in a file's name is encoded, so it is never a query.
 */
function fileUriIn(text: string | null): string | undefined {
  try {
    const url = new URL(text ?? "");
    if (url.protocol !== "file:") {
      return undefined;
    }
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function decoded(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
}
