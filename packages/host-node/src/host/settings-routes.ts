/**
 * Lumière's settings over HTTP, for an embedder's settings page (routes.ts
 * mounts these at `/lumiere/settings`):
 *   GET  /settings   every contributed setting with its value (SettingsSnapshot)
 *   POST /settings   a SettingChange; the changed SettingItem, or 400 and why
 * The settings service (settings-service.ts) checks and makes each change.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { HostSettings } from "@workshop/markdown/portable";
import { createSettingsService } from "./settings-service";

export { describeKey, settingItem } from "./settings-service";

const MAX_BODY = 64 * 1024;

export interface SettingsRoutes {
  /** `rest` is the path below `/settings`; false when it is not one of these routes. */
  handle(
    req: IncomingMessage,
    res: ServerResponse,
    rest: string,
  ): Promise<boolean>;
}

export function createSettingsRoutes(
  settings: HostSettings,
  titles: ReadonlyMap<string, string>,
  /** Settings that mean nothing in this host (`settingsUnavailableIn`): not listed, not written. */
  unavailable: ReadonlySet<string> = new Set(),
): SettingsRoutes {
  const service = createSettingsService(settings, titles, unavailable);
  return {
    async handle(req, res, rest) {
      if (rest !== "") {
        return false;
      }
      if (req.method === "GET") {
        return json(res, 200, { items: service.list() });
      }
      if (req.method !== "POST") {
        return false;
      }
      const result = await service.change(await readJson(req));
      return "problem" in result
        ? json(res, 400, { error: result.problem })
        : json(res, 200, result.item);
    },
  };
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
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}
