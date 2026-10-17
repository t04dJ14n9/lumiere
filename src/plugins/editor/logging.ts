import type { BaseContext, Infer, Logger } from "@workshop/core";
import type { Endpoint } from "../../shared/rpc/endpoint";
import { logText } from "../../shared/logging";
import type { logRecord } from "./protocol";
import { protocol } from "./protocol";

export function webviewLogging(
  send: (record: Infer<typeof logRecord>) => void,
) {
  let debug = false;
  const write = (
    level: "debug" | "warn" | "error",
    message: string,
    details?: unknown,
  ) => {
    if (level === "debug" && !debug) {
      return;
    }
    try {
      send({ level, message: logText(message), details: logText(details) });
    } catch {
      // A disposed transport cannot report its own logging failure.
    }
  };
  const logger: Logger = {
    debug: (message, details) => write("debug", message, details),
    warn: (message, details) => write("warn", message, details),
    error: (message, details) => write("error", message, details),
  };
  return {
    logger,
    configure: (enabled: boolean) => {
      debug = enabled;
    },
  };
}

export function registerPanelLogging(
  context: BaseContext,
  rpc: Endpoint,
  debugEnabled: () => boolean,
): void {
  context.effect(() =>
    rpc.on(protocol, "log", (record) => {
      // Re-check on the host; the webview is not authority for debug policy.
      if (record.level !== "debug" || debugEnabled()) {
        context.logger[record.level](
          `[webview] ${record.message}`,
          record.details,
        );
      }
    }),
  );
}
