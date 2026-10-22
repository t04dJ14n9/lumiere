/**
 * The editor's pages and files, for any web server: a note's editor page,
 * the built editor, the page shim, a note's images and the page's socket.
 * Authentication is the caller's: DSH checks its own, the app its token.
 */
import { realpath } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import { injectShim, pageQuery, socketSource } from "./page";
import type { PanelUrls } from "./panel";
import { assertContained, fileUriToPath, resolveContainedNote } from "./paths";
import type { LumiereHost } from "./start";
import { serveFile, serveStatic } from "./static";

/** Every route below lives under this path. */
export const BASE = "/lumiere";
export const SOCKET_PATH = `${BASE}/socket`;

/** Where the routes find what they serve. */
export interface EditorAssets {
  /** The built editor (`packages/markdown/dist`). */
  readonly markdown: string;
  /** The built page shim (`page/shim.js`). */
  readonly shim: string;
}

export interface EditorRoutes {
  /** Answer a request under `BASE`; false when its path is not one of these routes. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** Take a page's socket upgrade; false when the request is not one. */
  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  close(): void;
}

export function createEditorRoutes(
  host: LumiereHost,
  assets: EditorAssets,
): EditorRoutes {
  // Each panel's workspace root: what its page may read files from.
  const roots = new Map<string, string>();
  const sockets = new WebSocketServer({ noServer: true });
  return {
    async handle(req, res) {
      const url = new URL(req.url ?? "/", "http://host");
      const rest = url.pathname.startsWith(BASE + "/")
        ? url.pathname.slice(BASE.length)
        : undefined;
      if (rest === "/editor") {
        await servePage({ req, res, url, host, roots });
      } else if (rest?.startsWith("/m/")) {
        await serveStatic(res, assets.markdown, rest.slice(3));
      } else if (rest === "/page/shim.js") {
        await serveFile(res, assets.shim);
      } else if (rest === "/file") {
        await serveResource(res, url, roots);
      } else {
        return false;
      }
      return true;
    },
    upgrade(req, socket, head) {
      const url = new URL(req.url ?? "/", "http://host");
      const panel = host.panels.get(url.searchParams.get("panel") ?? "");
      if (url.pathname !== SOCKET_PATH || !panel) {
        return false;
      }
      sockets.handleUpgrade(req, socket, head, (ws) => {
        host.panels.attach(panel.id, {
          send: (text) => ws.send(text),
          onMessage: (listener) => {
            const receive = (data: unknown) => listener(String(data));
            ws.on("message", receive);
            return () => {
              ws.off("message", receive);
            };
          },
          onClose: (listener) => {
            ws.on("close", listener);
            return () => {
              ws.off("close", listener);
            };
          },
          close: () => ws.close(),
        });
      });
      return true;
    },
    close: () => sockets.close(),
  };
}

interface PageRequest {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly url: URL;
  readonly host: LumiereHost;
  readonly roots: Map<string, string>;
}

async function servePage({
  req,
  res,
  url,
  host,
  roots,
}: PageRequest): Promise<void> {
  const query = pageQuery(url);
  if (!query) {
    res.writeHead(400, { "content-type": "text/plain" }).end("Not a note");
    return;
  }
  // Both canonical, and the note inside the workspace even through symlinks.
  const resolved = await resolveContainedNote(query.note, query.root);
  if (!resolved) {
    res.writeHead(403).end();
    return;
  }
  const rootUri = pathToFileURL(resolved.root).toString();
  const { id, html } = await host.panels.open({
    uri: pathToFileURL(resolved.note).toString(),
    urls: (panelId) => panelUrls(panelId, req.headers.host ?? ""),
  });
  // Only a note that actually opened widens what the vault may list.
  host.addRoot(rootUri);
  roots.set(id, rootUri);
  host.panels.get(id)?.shell.onDispose(() => roots.delete(id));
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(injectShim(html, id, `${BASE}/page/shim.js`));
}

function panelUrls(panelId: string, host: string): PanelUrls {
  return {
    // The page's socket is same-origin, but CSP 'self' does not cover ws: everywhere.
    cspSource: socketSource(host),
    asset: (relative) => `${BASE}/m/${relative}`,
    resource: (uri) =>
      `${BASE}/file?panel=${encodeURIComponent(panelId)}&uri=${encodeURIComponent(uri)}`,
  };
}

/** A file a note shows (an image, a video), from inside its workspace only. */
async function serveResource(
  res: ServerResponse,
  url: URL,
  roots: Map<string, string>,
): Promise<void> {
  const root = roots.get(url.searchParams.get("panel") ?? "");
  const file = await containedResource(root, url.searchParams.get("uri") ?? "");
  if (!file) {
    res.writeHead(403).end();
    return;
  }
  await serveFile(res, file);
}

/** The file a note may show, or undefined when the URI leaves its workspace. */
async function containedResource(
  root: string | undefined,
  uri: string,
): Promise<string | undefined> {
  if (!root) {
    return undefined;
  }
  try {
    // After URL parsing (which resolves `..`, also as `%2e%2e`) and through symlinks.
    await assertContained(root, uri);
  } catch {
    return undefined;
  }
  const target = fileUriToPath(uri);
  return target ? realpath(target).catch(() => undefined) : undefined;
}
