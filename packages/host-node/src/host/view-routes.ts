/**
 * The plugins' tree views over HTTP, for an embedder's page (routes.ts mounts
 * these under `/lumiere/views`):
 *   GET  /views                  the registered view ids
 *   GET  /views/events           server-sent TreeEvents (trees.ts)
 *   GET  /views/<id>             the tree's TreeSnapshot
 *   POST /views/<id>/run         {"id": "<node id>"}: the reader clicked a node
 *   POST /views/<id>/visible     {"visible": true|false}: the tree is on screen or not
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TreeHub } from "./trees";

/** Request bodies here are tiny. */
const MAX_BODY = 4 * 1024;

export interface ViewRoutes {
  /** `rest` is the path below `/views`; false when it is not one of these routes. */
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    rest: string,
  ): Promise<boolean>;
  /** End every event stream. */
  close(): void;
}

export function createViewRoutes(trees: TreeHub): ViewRoutes {
  const streams = new Set<ServerResponse>();
  const stopListening = trees.onEvent((event) => {
    for (const stream of streams) {
      stream.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  });
  return {
    async handle(req, res, rest) {
      const method = req.method ?? "GET";
      if (rest === "" && method === "GET") {
        return json(res, 200, { views: trees.ids() });
      }
      if (rest === "/events" && method === "GET") {
        openStream(res, streams);
        return true;
      }
      const match = /^\/([^/]+)(\/run|\/visible)?$/.exec(rest);
      return match?.[1]
        ? handleTree({
            req,
            res,
            trees,
            viewId: decodeURIComponent(match[1]),
            action: match[2],
          })
        : false;
    },
    close() {
      stopListening();
      for (const stream of streams) {
        stream.end();
      }
      streams.clear();
    },
  };
}

interface TreeRequest {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly trees: TreeHub;
  readonly viewId: string;
  /** `/run`, `/visible`, or undefined for the snapshot. */
  readonly action: string | undefined;
}

async function handleTree({
  req,
  res,
  trees,
  viewId,
  action,
}: TreeRequest): Promise<boolean> {
  const method = req.method ?? "GET";
  if (!action && method === "GET") {
    const snapshot = await trees.snapshot(viewId);
    return snapshot
      ? json(res, 200, snapshot)
      : json(res, 404, { error: "No such view" });
  }
  if (action === "/run" && method === "POST") {
    const { id } = await readJson(req);
    const ran = typeof id === "string" && (await trees.run(viewId, id));
    return json(res, ran ? 200 : 404, { ok: ran });
  }
  if (action === "/visible" && method === "POST") {
    const { visible } = await readJson(req);
    if (typeof visible !== "boolean") {
      return json(res, 400, { error: 'Expected {"visible": true|false}' });
    }
    trees.setVisible(viewId, visible);
    return json(res, 200, { ok: true });
  }
  return false;
}

/** Server-sent events: one `data:` line of JSON per TreeEvent. */
function openStream(res: ServerResponse, streams: Set<ServerResponse>): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  res.write(": lumiere views\n\n");
  streams.add(res);
  res.on("close", () => streams.delete(res));
}

function json(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
  return true;
}

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) {
      throw new Error("Request body too large");
    }
    chunks.push(chunk as Buffer);
  }
  const body: unknown = JSON.parse(
    Buffer.concat(chunks).toString("utf8") || "{}",
  );
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : {};
}
