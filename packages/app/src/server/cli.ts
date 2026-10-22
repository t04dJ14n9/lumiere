/**
 * `lumiere-server`: the process the desktop app starts (contract.ts). Also
 * `node dist/app/server.js --vault ~/notes` for the app in a browser.
 */
import { homedir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "@workshop/core";
import { newToken } from "./auth";
import {
  EXIT_FAILURE,
  EXIT_OK,
  EXIT_USAGE,
  logLine,
  parseServerArgs,
  readyLine,
  type ServerOptions,
} from "./contract";
import { startServer, type RunningServer } from "./server";

/** How long stopping may take (contract.ts); then the process exits regardless. */
const STOP_DEADLINE_MS = 5000;

/** Set by the build (scripts/build.mjs) from package.json. */
declare const LUMIERE_VERSION: string;

void main(process.argv.slice(2));

async function main(argv: readonly string[]): Promise<void> {
  let options: ServerOptions;
  try {
    options = parseServerArgs(argv);
  } catch (error) {
    process.stderr.write(logLine("error", String(error)) + "\n");
    process.exit(EXIT_USAGE);
  }
  if (options.version) {
    process.stdout.write(LUMIERE_VERSION + "\n");
    process.exit(EXIT_OK);
  }
  const logger = stderrLogger();
  let server: RunningServer;
  try {
    server = await startServer({
      host: options.host,
      port: options.port,
      token: options.token ?? newToken(),
      data: options.data ?? defaultDataFolder(),
      assets: options.assets ?? path.dirname(fileURLToPath(import.meta.url)),
      vaults: options.vaults,
      version: LUMIERE_VERSION,
      logger,
    });
  } catch (error) {
    process.stderr.write(logLine("error", "Could not start", error) + "\n");
    process.exit(EXIT_FAILURE);
  }
  process.stdout.write(
    readyLine({
      url: server.url,
      port: server.port,
      pid: process.pid,
      version: LUMIERE_VERSION,
    }) + "\n",
  );
  stopOnRequest(server, logger);
}

/**
 * SIGTERM, SIGINT, or stdin closing (the app that started the server quit or
 * crashed) write unsaved notes, then exit.
 */
function stopOnRequest(server: RunningServer, logger: Logger): void {
  let stopping = false;
  const stop = () => {
    if (stopping) {
      return;
    }
    stopping = true;
    // Whatever hangs, the process ends: the desktop app waits for it.
    setTimeout(() => {
      logger.error("Did not stop in time; exiting");
      process.exit(EXIT_FAILURE);
    }, STOP_DEADLINE_MS).unref();
    server.close().then(
      () => process.exit(EXIT_OK),
      (error: unknown) => {
        logger.error("Could not stop cleanly", error);
        process.exit(EXIT_FAILURE);
      },
    );
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  if (!process.stdin.isTTY) {
    process.stdin.on("end", stop);
    process.stdin.on("close", stop);
    process.stdin.resume();
  }
}

function stderrLogger(): Logger {
  const write =
    (level: "debug" | "warn" | "error") =>
    (message: string, details?: unknown) => {
      process.stderr.write(logLine(level, message, details) + "\n");
    };
  return { debug: () => {}, warn: write("warn"), error: write("error") };
}

/** Where a standalone server keeps its state; the desktop app passes its own. */
function defaultDataFolder(): string {
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", "Lumiere");
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"),
      "Lumiere",
    );
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share"),
    "lumiere",
  );
}
