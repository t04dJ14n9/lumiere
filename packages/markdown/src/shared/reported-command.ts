import type { Disposer } from "@workshop/core";
import type { HostCommands } from "./host";

export interface ReportedCommand {
  readonly id: string;
  run(...args: unknown[]): Promise<void> | void;
}

/**
 * Palette commands whose failures are shown to the user. Each registration
 * is undone with the plugin.
 */
export function registerReportedCommands(
  effect: (setup: () => Disposer) => void,
  host: Pick<HostCommands, "register">,
  report: (message: string) => void,
  commands: readonly ReportedCommand[],
): void {
  for (const command of commands) {
    registerOne(effect, host, report, command);
  }
}

function registerOne(
  effect: (setup: () => Disposer) => void,
  host: Pick<HostCommands, "register">,
  report: (message: string) => void,
  command: ReportedCommand,
): void {
  effect(() =>
    host.register(command.id, (...args) => {
      void Promise.resolve(command.run(...args)).catch((error: unknown) => {
        report(error instanceof Error ? error.message : "Command failed.");
      });
    }),
  );
}
