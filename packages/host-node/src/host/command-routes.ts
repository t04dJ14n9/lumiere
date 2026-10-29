import type { IncomingMessage, ServerResponse } from "node:http";
import type { CommandPalette } from "./command-palette";

const MAX_BODY = 16 * 1024;

/** HTTP routes under `/lumiere/commands`: `GET` lists available commands, `POST` runs one. */
export function createCommandRoutes(palette: CommandPalette): {
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    subpath: string,
  ): Promise<boolean>;
} {
  return {
    async handle(req, res, subpath) {
      if (subpath !== "") {
        return false;
      }
      if (req.method === "GET") {
        return sendJson(res, 200, { commands: palette.list() });
      }
      if (req.method === "POST") {
        const command = await readCommandBody(req);
        if (!command) {
          return sendJson(res, 400, { error: 'Expected {"command": "<id>"}' });
        }
        const ok = await palette.run(command);
        return ok
          ? sendJson(res, 200, { ok: true })
          : sendJson(res, 400, { error: `Unavailable command: ${command}` });
      }
      return false;
    },
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
  return true;
}

async function readCommandBody(
  req: IncomingMessage,
): Promise<string | undefined> {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY) {
        return undefined;
      }
      chunks.push(chunk as Buffer);
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      command?: unknown;
    } | null;
    return typeof parsed?.command === "string" && parsed.command.length > 0
      ? parsed.command
      : undefined;
  } catch {
    return undefined;
  }
}
