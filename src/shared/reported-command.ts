import type { Disposer } from "../kernel";

export interface CommandViews {
  command(id: string, run: (...args: unknown[]) => unknown): Disposer;
}

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
  views: CommandViews,
  report: (message: string) => void,
  commands: readonly ReportedCommand[],
): void {
  for (const command of commands) {
    registerOne(effect, views, report, command);
  }
}

function registerOne(
  effect: (setup: () => Disposer) => void,
  views: CommandViews,
  report: (message: string) => void,
  command: ReportedCommand,
): void {
  effect(() =>
    views.command(command.id, (...args) => {
      void Promise.resolve(command.run(...args)).catch((error: unknown) => {
        report(error instanceof Error ? error.message : "Command failed.");
      });
    }),
  );
}
