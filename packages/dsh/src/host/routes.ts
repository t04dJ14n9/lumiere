/**
 * Lumière's pages and files, served by DSH's own web server behind its
 * browser authentication: a note's editor page, the built editor, the shim
 * that connects a page to its panel, a note's images, and the page's socket.
 */
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { WebSocketServer } from "ws";
import type { DshContext } from "./dsh";
import type { PanelUrls } from "./panel";
import type { LumiereHost } from "./start";
import { assertContained, fileUriToPath, resolveContainedNote } from "./paths";
import { injectShim, pageQuery, socketSource } from "./page";

export const BASE = "/lumiere";

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
};

export interface RouteOptions {
  readonly host: LumiereHost;
  /** The installed bundle: `markdown/` and `dsh/`. */
  readonly bundle: string;
}

export function registerRoutes(ctx: DshContext, options: RouteOptions): void {
  const roots = new Map<string, string>();
  const reject = (req: IncomingMessage) => ctx.connection.requestRejection(req);
  ctx.effect(() =>
    ctx.webServer.register({
      kind: "prefix",
      path: BASE,
      handler: async (req, res) => {
        const status = reject(req);
        if (status) {
          res.writeHead(status).end();
          return;
        }
        await route(req, res, { ...options, roots }).catch((error: unknown) => {
          ctx.logger?.("lumiere").error("Lumière route failed", error);
          if (!res.headersSent) {
            res.writeHead(500, { "content-type": "text/plain" });
          }
          // The message can name a filesystem path. The log has it; the browser does not.
          res.end("Internal error");
        });
      },
    }),
  );
  registerSocket(ctx, options, reject);
}

interface Routing extends RouteOptions {
  /** Each panel's DSH workspace root: what its page may read files from. */
  readonly roots: Map<string, string>;
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  routing: Routing,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://host");
  const rest = url.pathname.slice(BASE.length);
  if (rest === "/editor") {
    await servePage(req, res, url, routing);
  } else if (rest.startsWith("/m/")) {
    await serveStatic(
      res,
      path.join(routing.bundle, "markdown"),
      rest.slice(3),
    );
  } else if (rest.startsWith("/d/")) {
    await serveStatic(res, path.join(routing.bundle, "dsh"), rest.slice(3));
  } else if (rest === "/file") {
    await serveResource(res, url, routing.roots);
  } else {
    res.writeHead(404).end();
  }
}

async function servePage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  routing: Routing,
): Promise<void> {
  const query = pageQuery(url);
  if (!query) {
    res.writeHead(400, { "content-type": "text/plain" }).end("Not a note");
    return;
  }
  const resolved = await resolveContainedNote(query.note, query.root);
  if (!resolved) {
    res.writeHead(403).end();
    return;
  }
  const rootUri = pathToFileURL(resolved.root).toString();
  const { id, html } = await routing.host.panels.open({
    uri: pathToFileURL(resolved.note).toString(),
    urls: (panelId) => panelUrls(panelId, req.headers.host ?? ""),
  });
  // Only a note that actually opened widens what the vault may list.
  routing.host.addRoot(rootUri);
  routing.roots.set(id, rootUri);
  routing.host.panels.get(id)?.shell.onDispose(() => routing.roots.delete(id));
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(injectShim(html, id, `${BASE}/d/shim.js`));
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

async function serveStatic(
  res: ServerResponse,
  base: string,
  relative: string,
): Promise<void> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const root = path.resolve(base);
  const file = path.resolve(root, decoded);
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  await serveFile(res, file);
}

/** A file a note shows (an image, a video), from inside its workspace only. */
async function serveResource(
  res: ServerResponse,
  url: URL,
  roots: Map<string, string>,
): Promise<void> {
  const root = roots.get(url.searchParams.get("panel") ?? "");
  const uri = url.searchParams.get("uri") ?? "";
  const file = await containedResource(root, uri);
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
    await assertContained(root, uri);
  } catch {
    return undefined;
  }
  const target = fileUriToPath(uri);
  if (!target) {
    return undefined;
  }
  return realpath(target).catch(() => undefined);
}

async function serveFile(
  res: ServerResponse,
  file: string | URL,
): Promise<void> {
  const info = await stat(file).catch(() => undefined);
  if (!info?.isFile()) {
    res.writeHead(404).end();
    return;
  }
  const name = typeof file === "string" ? file : file.pathname;
  res.writeHead(200, {
    "content-type":
      CONTENT_TYPES[path.extname(name).toLowerCase()] ??
      "application/octet-stream",
    "content-length": info.size,
    "cache-control": "no-cache",
  });
  createReadStream(file).pipe(res);
}

function registerSocket(
  ctx: DshContext,
  options: RouteOptions,
  reject: (req: IncomingMessage) => number | undefined,
): void {
  const sockets = new WebSocketServer({ noServer: true });
  ctx.effect(() => {
    const stop = ctx.webServer.registerUpgrade({
      path: `${BASE}/socket`,
      handler: (req, socket, head) => {
        const url = new URL(req.url ?? "/", "http://host");
        const panel = options.host.panels.get(
          url.searchParams.get("panel") ?? "",
        );
        if (reject(req) || !panel) {
          socket.destroy();
          return;
        }
        sockets.handleUpgrade(req, socket, head, (ws) => {
          options.host.panels.attach(panel.id, {
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
      },
    });
    return () => {
      stop();
      sockets.close();
    };
  });
}
