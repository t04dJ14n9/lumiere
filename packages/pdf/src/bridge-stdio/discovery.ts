/**
 * Which running bridge the stdio shim may talk to. Each VS Code / Cursor
 * window with the bridge on writes a discovery file; the shim reads them
 * all and picks one.
 *
 * Invariant: the shim connects only to a bridge it can attribute to the
 * agent without guessing. That is the window whose workspace contains the
 * agent's folder (the most specific one when workspaces nest), or the window
 * named by AGENT_PDF_BRIDGE_PID. No match, or two windows matching equally,
 * is an error, never "the newest window": another window's selection
 * belongs to another project. Records that are malformed, stale (their
 * process is gone) or point anywhere but a loopback /mcp endpoint are ignored.
 */
import * as path from "node:path";

export interface BridgeRecord {
  url: string;
  token: string;
  pid: number;
  workspaceFolders: string[];
  startedAt: string;
}

export type BridgeChoice = { bridge: BridgeRecord } | { error: string };

export interface ChoiceOptions {
  /** The agent's working directory. */
  cwd: string;
  alive(pid: number): boolean;
  /** AGENT_PDF_BRIDGE_PID: pick this window's bridge explicitly. */
  pid?: string | undefined;
}

const TOKEN = /^[0-9a-f]{48}$/u;

/** A discovery file's content, if it is a well-formed record of a loopback bridge. */
export function parseBridgeRecord(value: unknown): BridgeRecord | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const { url, token, pid, workspaceFolders, startedAt } = record;
  if (
    typeof url !== "string" ||
    typeof token !== "string" ||
    !TOKEN.test(token)
  ) {
    return undefined;
  }
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    return undefined;
  }
  if (typeof startedAt !== "string") {
    return undefined;
  }
  if (
    !Array.isArray(workspaceFolders) ||
    !workspaceFolders.every(
      (folder) => typeof folder === "string" && path.isAbsolute(folder),
    )
  ) {
    return undefined;
  }
  if (!isLoopbackEndpoint(url)) {
    return undefined;
  }
  return {
    url,
    token,
    pid,
    workspaceFolders: workspaceFolders as string[],
    startedAt,
  };
}

/** Only http://127.0.0.1:<port>/mcp, as the bridge writes it. */
function isLoopbackEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    url.port !== "" &&
    url.pathname === "/mcp" &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  );
}

function contains(folder: string, file: string): boolean {
  const relative = path.relative(path.resolve(folder), path.resolve(file));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function chooseBridge(
  records: readonly BridgeRecord[],
  options: ChoiceOptions,
): BridgeChoice {
  const live = records.filter((record) => options.alive(record.pid));
  if (options.pid !== undefined && options.pid !== "") {
    const named = live.filter((record) => String(record.pid) === options.pid);
    if (named.length === 1) {
      return { bridge: named[0]! };
    }
    return {
      error: `No running Lumière PDF bridge has AGENT_PDF_BRIDGE_PID ${options.pid}.`,
    };
  }
  // How specific a match is: the length of the deepest workspace folder containing cwd.
  const scored = live
    .map((record) => ({
      record,
      score: Math.max(
        0,
        ...record.workspaceFolders
          .filter((folder) => contains(folder, options.cwd))
          .map((folder) => path.resolve(folder).length),
      ),
    }))
    .filter(({ score }) => score > 0);
  if (scored.length === 0) {
    return {
      error: `No VS Code or Cursor window with Lumière PDF has a workspace containing ${options.cwd}. Open that folder in a window with the agent bridge on, or set AGENT_PDF_BRIDGE_PID.`,
    };
  }
  const best = Math.max(...scored.map(({ score }) => score));
  const top = scored.filter(({ score }) => score === best);
  if (top.length > 1) {
    return {
      error: `${top.length} windows have a workspace containing ${options.cwd} (bridge pids ${top.map(({ record }) => record.pid).join(", ")}). Close one, or set AGENT_PDF_BRIDGE_PID to choose.`,
    };
  }
  return { bridge: top[0]!.record };
}
