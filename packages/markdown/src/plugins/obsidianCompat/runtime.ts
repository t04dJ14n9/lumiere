import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type {
  CommunityPluginBundle,
  ObsidianBootstrapSnapshot,
  ObsidianPluginManifest,
  SerializedVaultFile,
} from "./api";
import { installDomHelpers } from "./dom-helpers";
import type { MarkdownRenderChild } from "./obsidian-core";
import { Component, normalizePath } from "./obsidian-core";
import type { VaultBackend } from "./obsidian-files";
import { installObsidianGlobalModule } from "./obsidian-module";
import type { Plugin } from "./obsidian-plugin";
import {
  setPluginRuntimeBridge,
  type MarkdownCodeBlockProcessor,
  type MarkdownPostProcessor,
} from "./obsidian-plugin";
import {
  App,
  MarkdownPreviewRenderer,
  MarkdownRenderer,
  type MarkdownPostProcessorContext,
  type ObsidianCommand,
  type WorkspaceBackend,
} from "./obsidian-workspace";
import {
  createPluginStyleEl,
  evaluatePluginModule,
  renderFallbackMarkdown,
} from "./runtime-helpers";

export { evaluatePluginModule, renderFallbackMarkdown };

export interface LoadedCommunityPlugin {
  id: string;
  manifest: ObsidianPluginManifest;
  instance: Plugin;
  styleEl: HTMLStyleElement | null;
  disposers: Array<() => void>;
}

export interface ObsidianRuntimeHostBridge {
  vault?: VaultBackend;
  workspace?: WorkspaceBackend;
  getEditorView?: () => EditorView | null;
  registerEditorExtension?: (ext: Extension) => () => void;
  registerCommand?: (cmd: ObsidianCommand) => () => void;
  registerCodeBlockProcessor?: (
    language: string,
    handler: MarkdownCodeBlockProcessor,
  ) => () => void;
  renderMarkdown?: (
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    component: Component,
  ) => Promise<void>;
  loadPluginData?: (pluginId: string) => Promise<unknown>;
  savePluginData?: (pluginId: string, data: unknown) => Promise<void>;
  extraModules?: Readonly<Record<string, unknown>>;
}

export class ObsidianRuntime {
  readonly app: App;
  private trusted = false;
  private readonly loadedPlugins = new Map<string, LoadedCommunityPlugin>();
  private readonly pluginDataCache = new Map<string, unknown>();
  private readonly postProcessors = new Set<MarkdownPostProcessor>();
  private readonly codeBlockHandlers = new Map<
    string,
    MarkdownCodeBlockProcessor[]
  >();
  private readonly activeDisposers = new Map<string, Array<() => void>>();
  private readonly bridge: ObsidianRuntimeHostBridge;
  private activeDocumentPath = "Untitled.md";

  constructor(bridge: ObsidianRuntimeHostBridge = {}) {
    this.bridge = bridge;
    installDomHelpers();
    installObsidianGlobalModule();

    this.app = new App(bridge.vault ?? {}, {
      getEditorView: () =>
        this.bridge.getEditorView?.() ??
        this.bridge.workspace?.getEditorView?.() ??
        null,
      ...(this.bridge.workspace?.openLinkText
        ? { openLinkText: this.bridge.workspace.openLinkText }
        : {}),
    });

    this.installRuntimeBridge();

    MarkdownRenderer.setBackend(async (markdown, el, sourcePath, component) => {
      if (this.bridge.renderMarkdown) {
        await this.bridge.renderMarkdown(markdown, el, sourcePath, component);
      } else {
        renderFallbackMarkdown(markdown, el);
      }
      await this.runPostProcessors(el, sourcePath, component);
    });
  }

  isTrusted(): boolean {
    return this.trusted;
  }

  setTrusted(trusted: boolean): void {
    this.trusted = trusted;
    if (!trusted) {
      this.unloadAllPlugins();
    }
  }

  getLoadedPlugin(id: string): Plugin | null {
    return this.loadedPlugins.get(id)?.instance ?? null;
  }

  getLoadedPluginIds(): string[] {
    return [...this.loadedPlugins.keys()];
  }

  getCodeBlockLanguages(): string[] {
    return [...this.codeBlockHandlers.keys()];
  }

  syncDocument(path: string, content: string): void {
    const clean = normalizePath(path || "Untitled.md");
    this.activeDocumentPath = clean;
    const file = this.app.vault.setCachedContent(clean, content);
    this.app.workspace.setActiveFile(file);
    this.app.workspace.notifyEditorChange();
  }

  syncVaultFiles(files: readonly SerializedVaultFile[]): void {
    this.app.vault.syncFiles(files);
    const active = this.app.vault.getFileByPath(this.activeDocumentPath);
    if (active) {
      this.app.workspace.setActiveFile(active);
    }
  }

  async applyBootstrap(snapshot: ObsidianBootstrapSnapshot): Promise<void> {
    this.app.vault.configDir = snapshot.configDir || ".obsidian";
    this.app.vault.setName(snapshot.vaultName || "vault");
    if (snapshot.activePath) {
      this.activeDocumentPath = normalizePath(snapshot.activePath);
    }
    this.syncVaultFiles(snapshot.files);
    this.setTrusted(snapshot.trusted);
    if (snapshot.trusted) {
      await this.syncCommunityPlugins(snapshot.plugins);
    }
  }

  async syncCommunityPlugins(
    bundles: readonly CommunityPluginBundle[],
  ): Promise<void> {
    if (!this.trusted) {
      this.unloadAllPlugins();
      return;
    }
    const incomingIds = new Set(bundles.map((b) => b.id));
    for (const existingId of [...this.loadedPlugins.keys()]) {
      if (!incomingIds.has(existingId)) {
        this.unloadPlugin(existingId);
      }
    }
    for (const bundle of bundles) {
      await this.loadPluginBundle(bundle);
    }
  }

  async loadPluginBundle(
    bundle: CommunityPluginBundle,
  ): Promise<Plugin | null> {
    if (!this.trusted) {
      throw new Error(
        `Cannot execute community plugin "${bundle.id}" in an untrusted workspace.`,
      );
    }
    if (this.loadedPlugins.has(bundle.id)) {
      this.unloadPlugin(bundle.id);
    }
    if (bundle.data !== undefined) {
      this.pluginDataCache.set(bundle.id, bundle.data);
    }
    const disposers: Array<() => void> = [];
    this.activeDisposers.set(bundle.id, disposers);
    const styleEl = createPluginStyleEl(bundle.id, bundle.stylesCss);
    try {
      const PluginClass = evaluatePluginModule(
        bundle.mainJs,
        this.app,
        bundle.manifest,
        this.bridge.extraModules,
      );
      const instance = new PluginClass(this.app, bundle.manifest);
      if (!(instance instanceof Component)) {
        throw new Error(
          `Plugin "${bundle.id}" does not extend Obsidian Plugin.`,
        );
      }
      this.mountPluginInstance(bundle, instance, styleEl, disposers);
      await instance.onload();
      return instance;
    } catch (err) {
      this.cleanupPluginResources(bundle.id, styleEl, disposers);
      throw err;
    }
  }

  private mountPluginInstance(
    bundle: CommunityPluginBundle,
    instance: Plugin,
    styleEl: HTMLStyleElement | null,
    disposers: Array<() => void>,
  ): void {
    instance.register(() => {
      this.cleanupPluginResources(bundle.id, styleEl, disposers);
    });
    this.app.plugins.plugins[bundle.id] = instance;
    this.app.plugins.enabledPlugins.add(bundle.id);
    this.loadedPlugins.set(bundle.id, {
      id: bundle.id,
      manifest: bundle.manifest,
      instance,
      styleEl,
      disposers,
    });
    instance._loaded = true;
  }

  private cleanupPluginResources(
    id: string,
    styleEl: HTMLStyleElement | null,
    disposers: Array<() => void>,
  ): void {
    for (const dispose of disposers.splice(0)) {
      dispose();
    }
    this.activeDisposers.delete(id);
    styleEl?.remove();
    delete this.app.plugins.plugins[id];
    this.app.plugins.enabledPlugins.delete(id);
    this.loadedPlugins.delete(id);
  }

  unloadPlugin(id: string): void {
    const entry = this.loadedPlugins.get(id);
    if (!entry) {
      return;
    }
    this.loadedPlugins.delete(id);
    try {
      entry.instance.unload();
    } finally {
      this.cleanupPluginResources(id, entry.styleEl, entry.disposers);
    }
  }

  unloadAllPlugins(): void {
    for (const id of [...this.loadedPlugins.keys()]) {
      this.unloadPlugin(id);
    }
  }

  async runCodeBlockProcessors(
    ...args: [
      language: string,
      source: string,
      el: HTMLElement,
      sourcePath?: string,
      component?: Component,
    ]
  ): Promise<boolean> {
    const [
      language,
      source,
      el,
      sourcePath = this.activeDocumentPath,
      component,
    ] = args;
    const langLower = language.trim().toLowerCase();
    const handlers = this.codeBlockHandlers.get(langLower);
    if (!handlers || handlers.length === 0) {
      return false;
    }
    const ctx = this.createPostProcessorContext(sourcePath, component);
    for (const handler of [...handlers]) {
      await handler(source, el, ctx);
    }
    return true;
  }

  async runPostProcessors(
    el: HTMLElement,
    sourcePath = this.activeDocumentPath,
    component?: Component,
  ): Promise<void> {
    const allProcessors = [
      ...this.postProcessors,
      ...MarkdownPreviewRenderer.getPostProcessors(),
    ];
    if (allProcessors.length === 0) {
      return;
    }
    const ctx = this.createPostProcessorContext(sourcePath, component);
    for (const processor of allProcessors) {
      await processor(el, ctx);
    }
  }

  dispose(): void {
    this.unloadAllPlugins();
    MarkdownRenderer.setBackend(undefined);
  }

  private createPostProcessorContext(
    sourcePath: string,
    ownerComponent?: Component,
  ): MarkdownPostProcessorContext {
    const clean = normalizePath(sourcePath || this.activeDocumentPath);
    const cache = this.app.metadataCache.getCache(clean);
    return {
      docId: clean,
      sourcePath: clean,
      frontmatter: cache?.frontmatter ?? null,
      addChild: (child: Component | MarkdownRenderChild) => {
        if (ownerComponent) {
          ownerComponent.addChild(child);
        } else {
          void child.load();
        }
      },
      getSectionInfo: (_targetEl: HTMLElement) => {
        const text = this.app.vault.getCachedContent(clean) ?? "";
        const lines = text.split(/\r?\n/);
        return {
          text,
          lineStart: 0,
          lineEnd: Math.max(0, lines.length - 1),
        };
      },
    };
  }

  private installRuntimeBridge(): void {
    setPluginRuntimeBridge(this.app, {
      registerCommand: (pluginId, cmd) => {
        if (!this.bridge.registerCommand) {
          return () => {};
        }
        const dispose = this.bridge.registerCommand(cmd);
        this.activeDisposers.get(pluginId)?.push(dispose);
        return dispose;
      },
      registerPostProcessor: (pluginId, processor) => {
        this.postProcessors.add(processor);
        const dispose = () => {
          this.postProcessors.delete(processor);
        };
        this.activeDisposers.get(pluginId)?.push(dispose);
        return dispose;
      },
      registerCodeBlockProcessor: (pluginId, language, handler) =>
        this.registerCodeBlockHook(pluginId, language, handler),
      registerEditorExtension: (pluginId, extension) => {
        if (!this.bridge.registerEditorExtension) {
          return () => {};
        }
        const dispose = this.bridge.registerEditorExtension(extension);
        this.activeDisposers.get(pluginId)?.push(dispose);
        return dispose;
      },
      loadPluginData: async (pluginId: string) => {
        if (this.bridge.loadPluginData) {
          const loaded = await this.bridge.loadPluginData(pluginId);
          this.pluginDataCache.set(pluginId, loaded);
          return loaded;
        }
        return this.pluginDataCache.get(pluginId) ?? null;
      },
      savePluginData: async (pluginId: string, data: unknown) => {
        this.pluginDataCache.set(pluginId, data);
        if (this.bridge.savePluginData) {
          await this.bridge.savePluginData(pluginId, data);
        }
      },
    });
  }

  private registerCodeBlockHook(
    pluginId: string,
    language: string,
    handler: MarkdownCodeBlockProcessor,
  ): () => void {
    const lang = language.trim().toLowerCase();
    const list = this.codeBlockHandlers.get(lang) ?? [];
    list.push(handler);
    this.codeBlockHandlers.set(lang, list);
    const postProc = MarkdownPreviewRenderer.createCodeBlockPostProcessor(
      lang,
      handler,
    );
    this.postProcessors.add(postProc);
    const extDispose = this.bridge.registerCodeBlockProcessor?.(lang, handler);
    const dispose = () => {
      this.postProcessors.delete(postProc);
      const arr = this.codeBlockHandlers.get(lang);
      if (arr) {
        const idx = arr.indexOf(handler);
        if (idx >= 0) {
          arr.splice(idx, 1);
        }
        if (arr.length === 0) {
          this.codeBlockHandlers.delete(lang);
        }
      }
      extDispose?.();
    };
    this.activeDisposers.get(pluginId)?.push(dispose);
    return dispose;
  }
}
