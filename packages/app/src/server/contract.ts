/**
 * The contract between Lumière's server and whatever starts it: the desktop
 * app (apps/desktop), a terminal, the home-server demo. docs/HOSTS_PLAN.md
 * section 5 describes it for people; this module is its single source in
 * code. Changing it is a change to apps/desktop too: review both sides.
 *
 *   lumiere-server [--vault <dir>]... [--port <n>|0] [--host 127.0.0.1]
 *                  [--token <t>] [--data <dir>] [--assets <dir>] [--version]
 *
 * When ready the server prints one ready line (JSON) on stdout and nothing
 * else ever goes there; logs go to stderr, one JSON object per line.
 * SIGTERM, SIGINT or stdin closing make it write unsaved notes and exit 0,
 * within 5 seconds (exit 1 if stopping hangs); after that, kill it.
 */
import { parseArgs } from "node:util";

export interface ServerOptions {
  /** Vault folders to open at start. */
  readonly vaults: readonly string[];
  /** 0 lets the system choose. */
  readonly port: number;
  /** A loopback address; the server never listens beyond this machine. */
  readonly host: string;
  /** The launch token; made up when not given. */
  readonly token: string | undefined;
  /** Settings, state and vault snapshots; the platform's app data folder when not given. */
  readonly data: string | undefined;
  /**
   * The built app: `markdown/`, `page/`, `shell/` and `contributed.json`.
   * Beside the server's own script when not given; the desktop app passes
   * its resource folder, since a single-file sidecar cannot carry them.
   */
  readonly assets: string | undefined;
  readonly version: boolean;
}

/** The one line the server prints on stdout, once it accepts requests. */
export interface ReadyLine {
  readonly lumiere: "ready";
  /** Open this in the window: it carries the token once. */
  readonly url: string;
  readonly port: number;
  readonly pid: number;
  readonly version: string;
}

export const EXIT_OK = 0;
/** Bad arguments; nothing was started. */
export const EXIT_USAGE = 2;
/** The server could not start or stopped on an error. */
export const EXIT_FAILURE = 1;

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

export function parseServerArgs(argv: readonly string[]): ServerOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      vault: { type: "string", multiple: true },
      port: { type: "string" },
      host: { type: "string" },
      token: { type: "string" },
      data: { type: "string" },
      assets: { type: "string" },
      version: { type: "boolean" },
    },
    strict: true,
  });
  const port = Number(values.port ?? "0");
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`--port must be 0 to 65535, not ${values.port}`);
  }
  const host = values.host ?? "127.0.0.1";
  if (!LOOPBACK.has(host)) {
    throw new Error(`--host must be a loopback address, not ${host}`);
  }
  return {
    vaults: values.vault ?? [],
    port,
    host,
    token: values.token,
    data: values.data,
    assets: values.assets,
    version: values.version ?? false,
  };
}

export function readyLine(line: Omit<ReadyLine, "lumiere">): string {
  return JSON.stringify({ lumiere: "ready", ...line } satisfies ReadyLine);
}

/** A log line for stderr. */
export function logLine(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  details?: unknown,
): string {
  return JSON.stringify({
    level,
    message,
    ...(details === undefined ? {} : { details: describe(details) }),
  });
}

function describe(details: unknown): unknown {
  return details instanceof Error
    ? { name: details.name, message: details.message, stack: details.stack }
    : details;
}
