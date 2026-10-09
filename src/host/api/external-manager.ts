import type { Context, Fiber } from "../../kernel";
import type { ApiPlatform } from "./platform";
import type {
  MarkdownWorkbenchApi,
  PluginDescriptor,
  PluginState,
} from "./types";
import type {
  ExternalPlugin,
  PluginHandle,
  PublicServices,
} from "./plugin-types";
import {
  validateExternal,
  externalInjection,
  applyExternal,
} from "./external-context";
import { RpcError } from "../../shared/rpc/lifecycle";
import { builtinCatalog } from "./catalog";
interface Entry {
  definition: ExternalPlugin;
  fiber?: Fiber<void>;
  services?: Partial<PublicServices>;
  live: boolean;
}
export class ExternalPlugins {
  private readonly entries = new Map<string, Entry>();
  private queue = Promise.resolve();
  private live = true;
  constructor(
    private readonly options: {
      root: Context;
      platform: ApiPlatform;
      api(): MarkdownWorkbenchApi;
      changed(): void;
    },
  ) {
    const { root } = options;
    root.effect(() => () => this.dispose());
    if (root.workbench.onConfiguration) {
      root.effect(() =>
        root.workbench.onConfiguration!(() => {
          void this.refresh();
        }),
      );
    }
    root.on("editor/opened", () => {
      void this.refresh();
    });
    root.on("editor/closed", () => {
      void this.refresh();
    });
  }
  register(definition: ExternalPlugin): PluginHandle {
    if (!this.live) {
      throw new RpcError("PluginDisabled", "Extension API stopped");
    }
    validateExternal(definition, this.options.platform.installed);
    if (
      this.entries.has(definition.id) ||
      builtinCatalog.some((item) => item.id === definition.id)
    ) {
      throw new RpcError(
        "DuplicateContribution",
        "Plugin ID already registered",
      );
    }
    const entry: Entry = {
      definition: Object.freeze({
        ...definition,
        inject: {
          required: [...(definition.inject?.required ?? [])],
          optional: [...(definition.inject?.optional ?? [])],
        },
      }),
      live: true,
    };
    this.entries.set(definition.id, entry);
    void this.refresh();
    return this.handle(entry);
  }
  private handle(entry: Entry): PluginHandle {
    const state = () => this.state(entry);
    return Object.freeze({
      id: entry.definition.id,
      get state() {
        return state();
      },
      setMarkers(editorId, markers) {
        if (!entry.live || !entry.services?.markers) {
          throw new RpcError(
            "PluginDisabled",
            "Markers provider is not active",
          );
        }
        const inject = entry.definition.inject;
        if (
          ![...(inject?.required ?? []), ...(inject?.optional ?? [])].includes(
            "markers",
          )
        ) {
          throw new RpcError(
            "UndeclaredService",
            "Declare markers before setting them",
          );
        }
        entry.services.markers.set(editorId, markers);
      },
      settled: () => this.settled(),
      dispose: () => this.remove(entry),
    } satisfies PluginHandle);
  }
  private remove(entry: Entry): void {
    if (!entry.live) {
      return;
    }
    entry.live = false;
    this.queue = this.queue.then(async () => {
      await entry.fiber?.dispose();
      this.entries.delete(entry.definition.id);
      this.options.changed();
    });
  }

  catalog(): readonly PluginDescriptor[] {
    return [...this.entries.values()].map(({ definition }) =>
      Object.freeze({
        id: definition.id,
        ownerExtensionId: definition.ownerExtensionId,
        title: definition.title,
        description: definition.description,
        kind: "external" as const,
        defaultEnabled: definition.defaultEnabled,
        surfaces: Object.freeze(["host"] as const),
      }),
    );
  }
  states(editorId: string): PluginState[] {
    return [...this.entries.values()].map((entry) =>
      this.state(entry, editorId),
    );
  }
  refresh(): Promise<void> {
    this.queue = this.queue
      .catch((error) =>
        this.options.root.logger.error("External cleanup failed", error),
      )
      .then(async () => {
        if (!this.live) {
          return;
        }
        for (const entry of this.entries.values()) {
          const enabled =
            entry.live &&
            (this.enabled(entry) ||
              this.options.root.editors
                .all()
                .some((panel) => this.enabled(entry, panel.id)));
          if (!enabled && entry.fiber) {
            await entry.fiber.dispose();
            entry.fiber = undefined;
            entry.services = undefined;
          }
          if (enabled && !entry.fiber) {
            this.start(entry);
          }
        }
      });
    // Waiting for the kernel to settle stays outside the queue: dispose()
    // (an effect, run while the kernel stops plugins) waits for the queue,
    // and the kernel cannot settle until that effect is done.
    return this.queue.then(async () => {
      await this.options.root.settled();
      if (this.live) {
        this.options.changed();
      }
    });
  }
  async settled(): Promise<void> {
    await this.queue;
    await this.options.root.settled();
  }
  private start(entry: Entry): void {
    const { root, platform, api } = this.options;
    entry.fiber = root.plugin({
      name: entry.definition.id,
      inject: externalInjection(entry.definition),
      apply: (host) =>
        applyExternal(
          entry.definition,
          {
            host,
            platform,
            api: api(),
            owner: entry.definition.ownerExtensionId,
            available: (id) =>
              entry.live &&
              (id ? this.enabled(entry, id) : this.anyEnabled(entry)),
          },
          (services) => {
            entry.services = services;
          },
        ),
    });
  }
  private anyEnabled(entry: Entry): boolean {
    return (
      this.enabled(entry) ||
      this.options.root.editors
        .all()
        .some((panel) => this.enabled(entry, panel.id))
    );
  }
  private enabled(entry: Entry, editorId?: string): boolean {
    const { root, platform } = this.options;
    const panel = editorId
      ? root.editors.all().find((panel) => panel.id === editorId)
      : undefined;
    if (editorId && !panel) {
      return false;
    }
    return (
      platform.external(panel && platform.uri(panel.document.uri))[
        entry.definition.id
      ] ?? entry.definition.defaultEnabled
    );
  }
  private state(entry: Entry, editorId?: string): PluginState {
    const enabled = this.live && entry.live && this.enabled(entry, editorId);
    const fiber = entry.fiber;
    let state: PluginState["state"] = "disabled";
    if (enabled) {
      state = !fiber || fiber.state === "disposed" ? "pending" : fiber.state;
    }
    return Object.freeze({
      id: entry.definition.id,
      enabled,
      state,
      waitingFor: Object.freeze([...(fiber?.waitingFor ?? [])]),
      ...(fiber?.error ? { error: String(fiber.error) } : {}),
    });
  }
  private async dispose(): Promise<void> {
    this.live = false;
    await this.queue;
    for (const entry of this.entries.values()) {
      entry.live = false;
      await entry.fiber?.dispose();
    }
    this.entries.clear();
  }
}
