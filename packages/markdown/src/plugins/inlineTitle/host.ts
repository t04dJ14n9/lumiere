import type { Disposer, Plugin } from "@workshop/core";
import type { HostServices } from "../../shared/host";
import type { EditorPanel, Editors } from "../editor/api";
import type {} from "../editor/api";
import { protocol } from "./protocol";
import { TitleRenames } from "./rename";
import { titleFromSource } from "./title";

/** Root host half owns independent panel transfers across native recreation. */
export const inlineTitleHost: Plugin = {
  name: "inlineTitle",
  inject: {
    required: [
      "editors",
      "hostDocuments",
      "hostCommands",
      "dialogs",
      "settings",
    ],
  },
  apply(ctx) {
    const titles = new InlineTitles({
      editors: ctx.editors,
      host: ctx,
      warn: (error) => ctx.logger.warn("Title view transfer failed", error),
    });
    ctx.effect(() => () => titles.dispose());
    ctx.on("editor/opened", () => titles.reconcile());
    ctx.on("editor/closed", (panel) => titles.closed(panel.id));
    ctx.on("editor/ready", (panel) => titles.ready(panel.id));
    ctx.effect(() => ctx.settings.onChange(() => titles.reconcile()));
    titles.reconcile();
  },
};

class InlineTitles {
  private readonly handlers = new Map<string, Disposer>();
  private readonly initialized = new Set<string>();
  private readonly renames: TitleRenames;
  constructor(
    private readonly options: {
      editors: Editors;
      host: HostServices;
      warn(error: unknown): void;
    },
  ) {
    this.renames = new TitleRenames(options.editors, options.host, () =>
      this.restoreReady(),
    );
  }

  reconcile(): void {
    for (const panel of this.options.editors.all()) {
      const config = this.options.host.settings.forNote(panel.document);
      const enabled =
        config.preset === "obsidian" &&
        (config.features?.inlineTitle?.enabled ?? true);
      if (!enabled) {
        void this.handlers.get(panel.id)?.();
        this.handlers.delete(panel.id);
      } else if (!this.handlers.has(panel.id)) {
        this.register(panel);
      }
    }
  }

  private register(panel: EditorPanel): void {
    const stop = panel.rpc.handle(
      protocol,
      "rename",
      async (request, token) => {
        try {
          const target = await this.renames.rename({
            panel,
            ...request,
            token,
          });
          return { title: titleFromSource(target) };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "The note could not be renamed.";
          this.options.host.dialogs.error(message);
          return {
            title: titleFromSource(panel.document.uri),
            error: message.slice(0, 4096),
          };
        }
      },
    );
    this.handlers.set(panel.id, stop);
  }

  ready(id: string): void {
    this.initialized.add(id);
    void this.restoreReady().catch((error) => this.options.warn(error));
  }
  closed(id: string): void {
    void this.handlers.get(id)?.();
    this.handlers.delete(id);
    this.initialized.delete(id);
  }

  private async restoreReady(): Promise<void> {
    for (const panel of this.options.editors.all()) {
      if (!this.initialized.has(panel.id)) {
        continue;
      }
      const saved = this.renames.transfers.take(panel);
      if (!saved) {
        continue;
      }
      await this.options.editors.restore(panel.id, saved.snapshot);
      if (saved.focus && this.handlers.has(panel.id)) {
        await panel.rpc.call(protocol, "focus", { target: saved.focus });
      }
    }
  }

  dispose(): void {
    for (const stop of this.handlers.values()) {
      void stop();
    }
    this.handlers.clear();
    this.initialized.clear();
    this.renames.transfers.clear();
  }
}
