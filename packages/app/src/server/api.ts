/**
 * The server's own API (contract.ts, docs/HOSTS_PLAN.md section 5): health,
 * vaults, files, opening a note or folder, the owner's answers about running
 * a vault's plugins, and an event stream the shell listens to, so an "open"
 * from the desktop app (a deep link, a file opened from Finder) and a vault
 * asking to run its plugins reach the window.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { UiStore } from "./ui-state";
import type { VaultTrust } from "./vault-trust";
import type { VaultEvent, Vaults } from "./vaults";

/** Request bodies are small JSON objects. */
const MAX_BODY = 64 * 1024;
/** Opens kept for a window that has not connected yet; the newest win. */
const MAX_WAITING = 16;

export interface Api {
  /** Answer a request under `/api/`; false when its path is not one of these. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** End every event stream (the server is stopping). */
  close(): void;
}

/** A vault event, or a vault waiting to be asked about its plugins (GET /api/trust). */
export type ServerEvent = VaultEvent | { readonly type: "trust" };

export interface ApiState {
  readonly vaults: Vaults;
  readonly ui: UiStore;
  readonly trust: VaultTrust;
  readonly version: string;
}

export function createApi({ vaults, ui, trust, version }: ApiState): Api {
  const streams = new Set<ServerResponse>();
  const waiting = relayEvents(vaults, trust, streams);
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
        case "POST /api/open":
          await vaults.show(await pathBody(req));
          return json(res, 200, { ok: true });
        case "GET /api/files":
          return json(res, 200, {
            files: await vaults.files(url.searchParams.get("vault") ?? ""),
          });
        case "GET /api/trust":
          return json(res, 200, trust.questions());
        case "POST /api/trust": {
          const { vault, allowed } = trustBody(await jsonBody(req));
          await trust.decide(vault, allowed);
          return json(res, 200, { ok: true });
        }
        case "GET /api/events":
          openStream(res, streams);
          for (const event of waiting.splice(0)) {
            sendEvent(res, event);
          }
          return true;
        default:
          return false;
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
 * Send vault events and trust questions to every open event stream. Notes
 * to open that come before any window listens wait in the returned list
 * (the desktop app passes a note from Finder while its window is still
 * loading); a window that connects later reads questions with GET /api/trust.
 */
function relayEvents(
  vaults: Vaults,
  trust: VaultTrust,
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
  trust.onQuestionsChange(() => {
    for (const stream of streams) {
      sendEvent(stream, { type: "trust" });
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

/** A small JSON request body. */
async function jsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

/** `{"path": "/absolute/path"}` from the request body. */
async function pathBody(req: IncomingMessage): Promise<string> {
  const body = await jsonBody(req);
  const value = (body as { path?: unknown } | null)?.path;
  if (typeof value !== "string" || value === "") {
    throw new Error('Expected {"path": "<absolute path>"}');
  }
  return value;
}

/** `{"vault": "/absolute/path", "allowed": true}`: the owner's answer. */
function trustBody(body: unknown): { vault: string; allowed: boolean } {
  const { vault, allowed } = (body ?? {}) as {
    vault?: unknown;
    allowed?: unknown;
  };
  if (typeof vault !== "string" || typeof allowed !== "boolean") {
    throw new Error('Expected {"vault": "<path>", "allowed": true|false}');
  }
  return { vault, allowed };
}

/** Server-sent events: one `data:` line of JSON per event. */
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
