/**
 * The server's own API (contract.ts, docs/HOSTS_PLAN.md section 5): health,
 * vaults, files, opening a note or folder, drawings for the window's canvas
 * (ink.ts), and an event stream the shell listens to, so an "open" from the
 * desktop app (a deep link, a file opened from Finder) and a drawing to make
 * reach the window.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WindowInk } from "./ink";
import type { UiStore } from "./ui-state";
import type { VaultEvent, Vaults } from "./vaults";

/** Request bodies are small JSON objects. */
const MAX_BODY = 64 * 1024;
/** But for a drawing: every point of a page of handwriting, kept raw. */
const MAX_DRAWING_BODY = 64 * 1024 * 1024;
/** Opens kept for a window that has not connected yet; the newest win. */
const MAX_WAITING = 16;

export interface Api {
  /** Answer a request under `/api/`; false when its path is not one of these. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** End every event stream (the server is stopping). */
  close(): void;
}

/** A vault event, or a drawing started or ended waiting (GET /api/ink). */
export type ServerEvent = VaultEvent | { readonly type: "ink" };

export interface ApiState {
  readonly vaults: Vaults;
  readonly ui: UiStore;
  readonly ink: WindowInk;
  /** Start Insert Sketch in the note last focused (the window's pencil). */
  readonly insertSketch: () => void;
  readonly version: string;
}

export function createApi(state: ApiState): Api {
  const { vaults, ui, version } = state;
  const streams = new Set<ServerResponse>();
  const waiting = relayEvents(state, streams);
  return {
    async handle(req, res) {
      const url = new URL(req.url ?? "/", "http://host");
      const route = `${req.method ?? "GET"} ${url.pathname}`;
      switch (route) {
        case "GET /api/health":
          return json(res, 200, { ok: true, version });
        case "GET /api/ui":
          return json(res, 200, ui.get());
        case "POST /api/ui":
          return json(res, 200, await ui.update(await jsonBody(req)));
        case "GET /api/vaults":
          return json(res, 200, vaults.list());
        case "POST /api/vaults":
          return json(res, 200, {
            vault: await vaults.add(await pathBody(req)),
          });
        case "DELETE /api/vaults":
          await vaults.close(await pathBody(req, url));
          return json(res, 200, vaults.list());
        case "POST /api/open":
          await vaults.show(await pathBody(req));
          return json(res, 200, { ok: true });
        case "GET /api/files":
          return json(res, 200, {
            files: await vaults.files(url.searchParams.get("vault") ?? ""),
          });
        case "GET /api/events":
          openStream(res, streams);
          for (const event of waiting.splice(0)) {
            sendEvent(res, event);
          }
          return true;
        default:
          return drawingRoute(route, { req, res }, state);
      }
    },
    close() {
      for (const stream of streams) {
        stream.end();
      }
      streams.clear();
    },
  };
}

/**
 * Drawings for the window's canvas (ink.ts), and the window's pencil
 * starting one; false for any other route.
 */
async function drawingRoute(
  route: string,
  { req, res }: { req: IncomingMessage; res: ServerResponse },
  { ink, insertSketch }: Pick<ApiState, "ink" | "insertSketch">,
): Promise<boolean> {
  switch (route) {
    case "GET /api/ink":
      return json(res, 200, ink.request() ?? {});
    case "POST /api/ink": {
      const { id, sketch } = inkBody(await jsonBody(req, MAX_DRAWING_BODY));
      ink.answer(id, sketch);
      return json(res, 200, { ok: true });
    }
    case "POST /api/sketch":
      insertSketch();
      return json(res, 200, { ok: true });
    default:
      return false;
  }
}

/**
 * Send vault events and drawings to every open event stream. Notes to open
 * that come before any window listens wait in the returned list (the desktop
 * app passes a note from Finder while its window is still loading); a window
 * that connects later reads a drawing with GET /api/ink.
 */
function relayEvents(
  { vaults, ink }: Pick<ApiState, "vaults" | "ink">,
  streams: ReadonlySet<ServerResponse>,
): VaultEvent[] {
  const waiting: VaultEvent[] = [];
  vaults.onEvent((event) => {
    if (streams.size === 0 && event.type === "open") {
      waiting.push(event);
      if (waiting.length > MAX_WAITING) {
        waiting.shift();
      }
      return;
    }
    for (const stream of streams) {
      sendEvent(stream, event);
    }
  });
  ink.onChange(() => {
    for (const stream of streams) {
      sendEvent(stream, { type: "ink" });
    }
  });
  return waiting;
}

function json(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
  return true;
}

/** A JSON request body, optionally larger than the usual API limit. */
async function jsonBody(
  req: IncomingMessage,
  limit = MAX_BODY,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

/** `{"path": "/absolute/path"}` from the query string or request body. */
async function pathBody(req: IncomingMessage, url?: URL): Promise<string> {
  const query = url?.searchParams.get("path");
  if (query) {
    return query;
  }
  const body = await jsonBody(req);
  const value = (body as { path?: unknown } | null)?.path;
  if (typeof value !== "string" || value === "") {
    throw new Error('Expected {"path": "<absolute path>"}');
  }
  return value;
}

/** `{"id":"..."}` with optional `sketch` (undefined means cancelled). */
function inkBody(body: unknown): { id: string; sketch: string | undefined } {
  const value = body as { id?: unknown; sketch?: unknown } | null;
  if (typeof value?.id !== "string" || value.id === "") {
    throw new Error('Expected {"id": "<drawing id>"}');
  }
  if (value.sketch === undefined) {
    return { id: value.id, sketch: undefined };
  }
  if (typeof value.sketch !== "string") {
    throw new Error("Expected sketch to be a string");
  }
  return { id: value.id, sketch: value.sketch };
}

/** Server-sent events: one `data:` line of JSON per vault event. */
function openStream(res: ServerResponse, streams: Set<ServerResponse>): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  res.write(": lumiere\n\n");
  streams.add(res);
  res.on("close", () => streams.delete(res));
}

function sendEvent(stream: ServerResponse, event: ServerEvent): void {
  stream.write(`data: ${JSON.stringify(event)}\n\n`);
}
