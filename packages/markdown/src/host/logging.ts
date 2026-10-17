import type { LogOutputChannel } from "vscode";
import type { Logger } from "@workshop/core";
import { logText } from "../shared/logging";

export function outputLogger(
  channel: Pick<LogOutputChannel, "info" | "warn" | "error">,
  debugEnabled: () => boolean,
): Logger {
  const write = (
    level: "info" | "warn" | "error",
    message: string,
    details?: unknown,
  ) => {
    const detail = details === undefined ? "" : ` ${logText(details)}`;
    channel[level](`${logText(message)}${detail}`);
  };
  return {
    debug(message, details) {
      if (debugEnabled()) {
        // LogOutputChannel has no setLogLevel. Honor our setting even when
        // VS Code's output threshold is Info, retaining the diagnostic label.
        write("info", `[debug] ${message}`, details);
      }
    },
    warn: (message, details) => write("warn", message, details),
    error: (message, details) => write("error", message, details),
  };
}
