/**
 * Lumière's host half in DeepSeek Harness. DSH loads this module as a plugin
 * (bundle/cordis.patch.yml); it starts the Markdown plugins and serves their
 * pages from DSH's web server. The browser half is client.js.
 */
import { homedir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "@workshop/core";
import type { DshContext, DshLogger } from "./dsh";
import { registerRoutes } from "./routes";
import { startLumiere } from "./start";

export const name = "lumiere";
export const inject = ["webServer", "connection"];

export async function apply(ctx: DshContext): Promise<void> {
  // The bundle's index.js sits beside markdown/ and dsh/.
  const bundle = path.dirname(fileURLToPath(import.meta.url));
  const host = await startLumiere({
    bundle,
    data: dataFolder(),
    logger: toLogger(ctx.logger?.("lumiere") ?? console),
  });
  ctx.effect(() => () => host.stop(), "lumiere: plugins and open notes");
  registerRoutes(ctx, { host, bundle });
}

/** Beside DSH's own data, where DSH keeps it. */
function dataFolder(): string {
  const home = process.env.DSH_HOME ?? path.join(homedir(), ".dsh");
  return path.join(home, "lumiere");
}

function toLogger(logger: DshLogger): Logger {
  return {
    debug: (message, details) => logger.debug?.(message, details),
    warn: (message, details) => logger.warn(message, details),
    error: (message, details) => logger.error(message, details),
  };
}
