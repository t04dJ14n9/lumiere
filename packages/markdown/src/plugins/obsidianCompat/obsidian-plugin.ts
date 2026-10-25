import type { Extension } from "@codemirror/state";
import type { ObsidianPluginManifest } from "./api";
import { createChildEl, getDomDocument } from "./dom-helpers";
import { Component, type MarkdownRenderChild } from "./obsidian-core";
import type { EditorSuggest } from "./obsidian-modals";
import { setIcon, type PluginSettingTab } from "./obsidian-ui";
import {
  MarkdownPreviewRenderer,
  type App,
  type ObsidianCommand,
  type View,
  type WorkspaceLeaf,
} from "./obsidian-workspace";

export interface MarkdownSectionInformation {
  text: string;
  lineStart: number;
  lineEnd: number;
}

export interface MarkdownPostProcessorContext {
  docId: string;
  sourcePath: string;
  frontmatter: Record<string, unknown> | null | undefined;
  addChild(child: MarkdownRenderChild): void;
  getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null;
}

export type MarkdownPostProcessor = (
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) => Promise<unknown> | void;

export type MarkdownCodeBlockProcessor = (
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) => Promise<unknown> | void;

export interface PluginRuntimeBridge {
  registerCommand?(pluginId: string, command: ObsidianCommand): () => void;
  registerCodeBlockProcessor?(
    pluginId: string,
    language: string,
    handler: MarkdownCodeBlockProcessor,
    sortOrder?: number,
  ): () => void;
  registerPostProcessor?(
    pluginId: string,
    processor: MarkdownPostProcessor,
    sortOrder?: number,
  ): () => void;
  registerEditorExtension?(pluginId: string, extension: Extension): () => void;
  loadPluginData?(pluginId: string): Promise<unknown>;
  savePluginData?(pluginId: string, data: unknown): Promise<void>;
}

const runtimeBridges = new WeakMap<App, PluginRuntimeBridge>();

export function setPluginRuntimeBridge(
  app: App,
  bridge: PluginRuntimeBridge,
): void {
  runtimeBridges.set(app, bridge);
}

export function getPluginRuntimeBridge(
  app: App,
): PluginRuntimeBridge | undefined {
  return runtimeBridges.get(app);
}

export class Plugin extends Component {
  app: App;
  manifest: ObsidianPluginManifest;
  private readonly commandDisposers = new Map<string, () => void>();
  private localData: unknown = null;

  constructor(app: App, manifest: ObsidianPluginManifest) {
    super();
    this.app = app;
    this.manifest = manifest;
  }

  addCommand(command: ObsidianCommand): ObsidianCommand {
    const prefix = `${this.manifest.id}:`;
    const fullId = command.id.startsWith(prefix)
      ? command.id
      : `${prefix}${command.id}`;
    const namePrefix = `${this.manifest.name}: `;
    const fullName = command.name.startsWith(namePrefix)
      ? command.name
      : `${namePrefix}${command.name}`;
    const normalized: ObsidianCommand = {
      ...command,
      id: fullId,
      name: fullName,
    };
    this.app.commands.addCommand(normalized);
    const bridge = getPluginRuntimeBridge(this.app);
    const bridgeDispose = bridge?.registerCommand?.(
      this.manifest.id,
      normalized,
    );
    const cleanup = () => {
      bridgeDispose?.();
      this.app.commands.removeCommand(fullId);
      this.commandDisposers.delete(fullId);
    };
    this.commandDisposers.set(fullId, cleanup);
    this.register(cleanup);
    return normalized;
  }

  removeCommand(id: string): void {
    const prefix = `${this.manifest.id}:`;
    const fullId = id.startsWith(prefix) ? id : `${prefix}${id}`;
    const dispose =
      this.commandDisposers.get(fullId) ?? this.commandDisposers.get(id);
    if (dispose) {
      dispose();
    } else {
      this.app.commands.removeCommand(fullId);
      this.app.commands.removeCommand(id);
    }
  }

  addRibbonIcon(
    icon: string,
    title: string,
    callback: (evt: MouseEvent) => unknown,
  ): HTMLElement {
    const doc = getDomDocument();
    if (!doc) {
      return {} as HTMLElement;
    }
    const el = createChildEl(doc.body, "div", {
      cls: "side-dock-ribbon-action clickable-icon",
      title,
      attr: { "aria-label": title, "data-plugin-id": this.manifest.id },
    });
    setIcon(el, icon);
    this.registerDomEvent(el, "click", callback as (ev: never) => unknown);
    this.register(() => {
      el.parentNode?.removeChild(el);
    });
    return el;
  }

  addStatusBarItem(): HTMLElement {
    const doc = getDomDocument();
    if (!doc) {
      return {} as HTMLElement;
    }
    let bar = doc.querySelector<HTMLElement>(".status-bar");
    if (!bar && doc.body) {
      bar = createChildEl(doc.body, "div", { cls: "status-bar" });
    }
    const item = createChildEl(bar ?? doc.body, "div", {
      cls: `status-bar-item plugin-${this.manifest.id}`,
    });
    this.register(() => {
      item.parentNode?.removeChild(item);
    });
    return item;
  }

  addSettingTab(settingTab: PluginSettingTab): void {
    this.app.setting.pluginTabs.push(settingTab);
    this.register(() => {
      const idx = this.app.setting.pluginTabs.indexOf(settingTab);
      if (idx >= 0) {
        this.app.setting.pluginTabs.splice(idx, 1);
      }
    });
  }

  registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => View): void {
    const dispose = this.app.workspace.registerViewFactory(type, viewCreator);
    this.register(dispose);
  }

  registerExtensions(_extensions: string[], _viewType: string): void {}

  registerMarkdownPostProcessor(
    postProcessor: MarkdownPostProcessor,
    sortOrder?: number,
  ): MarkdownPostProcessor {
    MarkdownPreviewRenderer.registerPostProcessor(
      postProcessor as (
        el: HTMLElement,
        ctx: unknown,
      ) => Promise<unknown> | void,
      sortOrder,
    );
    const bridge = getPluginRuntimeBridge(this.app);
    const bridgeDispose = bridge?.registerPostProcessor?.(
      this.manifest.id,
      postProcessor,
      sortOrder,
    );
    this.register(() => {
      bridgeDispose?.();
      MarkdownPreviewRenderer.unregisterPostProcessor(
        postProcessor as (
          el: HTMLElement,
          ctx: unknown,
        ) => Promise<unknown> | void,
      );
    });
    return postProcessor;
  }

  registerMarkdownCodeBlockProcessor(
    language: string,
    handler: MarkdownCodeBlockProcessor,
    sortOrder?: number,
  ): MarkdownPostProcessor {
    const bridge = getPluginRuntimeBridge(this.app);
    const bridgeDispose = bridge?.registerCodeBlockProcessor?.(
      this.manifest.id,
      language,
      handler,
      sortOrder,
    );
    const fallback = MarkdownPreviewRenderer.createCodeBlockPostProcessor(
      language,
      handler as (
        source: string,
        el: HTMLElement,
        ctx: unknown,
      ) => Promise<unknown> | void,
    ) as MarkdownPostProcessor;
    this.register(() => {
      bridgeDispose?.();
    });
    return fallback;
  }

  registerEditorExtension(extension: Extension): void {
    const bridge = getPluginRuntimeBridge(this.app);
    const dispose = bridge?.registerEditorExtension?.(
      this.manifest.id,
      extension,
    );
    if (dispose) {
      this.register(dispose);
    }
  }

  registerObsidianProtocolHandler(
    _action: string,
    _handler: (params: Record<string, string>) => unknown,
  ): void {}

  registerEditorSuggest(_editorSuggest: EditorSuggest<unknown>): void {}

  async loadData(): Promise<unknown> {
    const bridge = getPluginRuntimeBridge(this.app);
    if (bridge?.loadPluginData) {
      return bridge.loadPluginData(this.manifest.id);
    }
    return this.localData;
  }

  async saveData(data: unknown): Promise<void> {
    this.localData = data;
    const bridge = getPluginRuntimeBridge(this.app);
    if (bridge?.savePluginData) {
      await bridge.savePluginData(this.manifest.id, data);
    }
  }

  onExternalSettingsChange?(): unknown;
}
