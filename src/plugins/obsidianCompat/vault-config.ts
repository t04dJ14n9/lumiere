import type { Disposer } from "@workshop/core";
import type { ConfigFiles } from "./config-files";
import type { ObsidianOverrides } from "./api";
import { mapAppSettings } from "./app-settings";
import { TypesRegistry } from "./types-registry";

export interface VaultConfigOptions {
  files: ConfigFiles;
  changed(): void;
  warn(message: string, error: unknown): void;
}

/** A vault's watchers and last-good snapshots; no dependency on editor focus. */
export class VaultConfig {
  readonly types: TypesRegistry;
  overrides: ObsidianOverrides = Object.freeze({});
  private appSource: string | undefined;
  private appQueue = Promise.resolve();
  private readonly stops: Disposer[] = [];
  private isStopped = false;
  private hasWarned = false;

  constructor(private readonly options: VaultConfigOptions) {
    this.types = new TypesRegistry({
      read: () => options.files.read("types.json"),
      write: (text, expected) => options.files.writeTypes(text, expected),
      changed: options.changed,
      warn: options.warn,
    });
  }

  async start(): Promise<void> {
    // Subscribe before reading so an edit during startup schedules a reload.
    this.stops.push(
      this.options.files.watch("types.json", () => {
        void this.types
          .refresh()
          .catch((error) =>
            this.options.warn(
              "Could not refresh Obsidian property types.",
              error,
            ),
          );
      }),
      this.options.files.watch("app.json", () => {
        void this.refreshApp();
      }),
    );
    await this.types.refresh();
    await this.refreshApp();
  }

  async dispose(): Promise<void> {
    this.isStopped = true;
    for (const stop of this.stops.splice(0)) {
      await stop();
    }
    await this.types.dispose();
    await this.appQueue;
  }

  /** Never rejects: a watcher failure keeps the previous snapshot and logs once. */
  private refreshApp(): Promise<void> {
    this.appQueue = this.appQueue.then(async () => {
      if (this.isStopped) {
        return;
      }
      try {
        const source = await this.options.files.read("app.json");
        const overrides = mapAppSettings(
          source === undefined ? {} : JSON.parse(source),
        );
        if (!this.isStopped && source !== this.appSource) {
          this.appSource = source;
          this.overrides = overrides;
          this.options.changed();
        }
      } catch (error) {
        if (!this.hasWarned) {
          this.hasWarned = true;
          this.options.warn(
            "Could not read Obsidian app.json; keeping the last good settings.",
            error,
          );
        }
      }
    });
    return this.appQueue;
  }
}
