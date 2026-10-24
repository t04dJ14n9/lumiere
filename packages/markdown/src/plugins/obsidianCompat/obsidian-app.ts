import type { Editor } from "./editor-bridge";
import { getDomDocument } from "./dom-helpers";
import { Component, Keymap, Scope, normalizePath } from "./obsidian-core";
import { Vault, type VaultBackend } from "./obsidian-files";
import { FileManager, MetadataCache } from "./obsidian-metadata";
import type { PluginSettingTab } from "./obsidian-setting";
import {
  MarkdownView,
  Workspace,
  type MarkdownPostProcessor,
  type MarkdownPostProcessorContext,
  type WorkspaceBackend,
} from "./obsidian-workspace";

export class MarkdownPreviewRenderer {
  private static postProcessors = new Set<MarkdownPostProcessor>();

  static registerPostProcessor(
    postProcessor: MarkdownPostProcessor,
    _sortOrder?: number,
  ): void {
    this.postProcessors.add(postProcessor);
  }

  static unregisterPostProcessor(postProcessor: MarkdownPostProcessor): void {
    this.postProcessors.delete(postProcessor);
  }

  static getPostProcessors(): readonly MarkdownPostProcessor[] {
    return [...this.postProcessors];
  }

  static createCodeBlockPostProcessor(
    language: string,
    handler: (
      source: string,
      el: HTMLElement,
      ctx: MarkdownPostProcessorContext,
    ) => Promise<unknown> | void,
  ): MarkdownPostProcessor {
    const langLower = language.trim().toLowerCase();
    return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      const codeEls = el.querySelectorAll<HTMLElement>(
        `pre > code.language-${langLower}`,
      );
      for (const codeEl of Array.from(codeEls)) {
        const preEl = codeEl.parentElement;
        if (!preEl || !preEl.parentElement) {
          continue;
        }
        const replacement = getDomDocument().createElement("div");
        replacement.className = `block-language-${langLower}`;
        preEl.replaceWith(replacement);
        await handler(codeEl.textContent ?? "", replacement, ctx);
      }
    };
  }
}

export type MarkdownRendererBackend = (
  markdown: string,
  el: HTMLElement,
  sourcePath: string,
  component: Component,
) => Promise<void>;

export class MarkdownRenderer extends Component {
  private static backend?: MarkdownRendererBackend | undefined;

  static setBackend(backend: MarkdownRendererBackend | undefined): void {
    this.backend = backend;
  }

  static async render(
    ...args: [
      app: App,
      markdown: string,
      el: HTMLElement,
      sourcePath: string,
      component: Component,
    ]
  ): Promise<void> {
    const [, markdown, el, sourcePath, component] = args;
    if (this.backend) {
      await this.backend(markdown, el, normalizePath(sourcePath), component);
      return;
    }
    const p = getDomDocument().createElement("div");
    p.className = "markdown-rendered";
    p.textContent = markdown;
    el.appendChild(p);
  }

  static async renderMarkdown(
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    component: Component,
  ): Promise<void> {
    await this.render(
      null as unknown as App,
      markdown,
      el,
      sourcePath,
      component,
    );
  }
}

export interface ObsidianCommand {
  id: string;
  name: string;
  icon?: string | undefined;
  callback?: (() => unknown) | undefined;
  checkCallback?: ((checking: boolean) => boolean | void) | undefined;
  editorCallback?: ((editor: Editor, ctx: MarkdownView) => unknown) | undefined;
  editorCheckCallback?:
    | ((checking: boolean, editor: Editor, ctx: MarkdownView) => boolean | void)
    | undefined;
}

export class AppCommands {
  commands: Record<string, ObsidianCommand> = {};
  editorCommands: Record<string, ObsidianCommand> = {};

  constructor(private readonly app: App) {}

  addCommand(command: ObsidianCommand): ObsidianCommand {
    this.commands[command.id] = command;
    if (command.editorCallback || command.editorCheckCallback) {
      this.editorCommands[command.id] = command;
    }
    return command;
  }

  removeCommand(id: string): void {
    delete this.commands[id];
    delete this.editorCommands[id];
  }

  listCommands(): ObsidianCommand[] {
    return Object.values(this.commands);
  }

  findCommand(id: string): ObsidianCommand | undefined {
    return this.commands[id];
  }

  executeCommandById(id: string): boolean {
    const cmd = this.commands[id];
    if (!cmd) {
      return false;
    }
    return this.executeCommand(cmd);
  }

  executeCommand(cmd: ObsidianCommand): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.editor ?? this.app.workspace.activeEditor?.editor;
    if (cmd.editorCheckCallback && editor && view) {
      const canRun = cmd.editorCheckCallback(true, editor, view);
      if (canRun === false) {
        return false;
      }
      cmd.editorCheckCallback(false, editor, view);
      return true;
    }
    if (cmd.editorCallback && editor && view) {
      void cmd.editorCallback(editor, view);
      return true;
    }
    if (cmd.checkCallback) {
      const canRun = cmd.checkCallback(true);
      if (canRun === false) {
        return false;
      }
      cmd.checkCallback(false);
      return true;
    }
    if (cmd.callback) {
      void cmd.callback();
      return true;
    }
    return false;
  }
}

export class App {
  keymap: Keymap;
  scope: Scope;
  workspace: Workspace;
  vault: Vault;
  metadataCache: MetadataCache;
  fileManager: FileManager;
  commands: AppCommands;
  setting: {
    pluginTabs: PluginSettingTab[];
  };
  plugins: {
    plugins: Record<string, unknown>;
    enabledPlugins: Set<string>;
    getPlugin: (id: string) => unknown;
  };
  lastEvent: UserEvent | null = null;

  constructor(
    vaultBackend: VaultBackend = {},
    workspaceBackend: WorkspaceBackend = {},
  ) {
    this.keymap = new Keymap();
    this.scope = new Scope();
    this.vault = new Vault(vaultBackend, (file, content) => {
      this.metadataCache.setFileContent(file, content);
    });
    this.metadataCache = new MetadataCache(this.vault);
    this.fileManager = new FileManager(this.vault, this.metadataCache);
    this.workspace = new Workspace(this, workspaceBackend);
    this.commands = new AppCommands(this);
    this.setting = { pluginTabs: [] };
    const pluginsMap: Record<string, unknown> = {};
    const enabledSet = new Set<string>();
    this.plugins = {
      plugins: pluginsMap,
      enabledPlugins: enabledSet,
      getPlugin: (id: string) => pluginsMap[id] ?? null,
    };
  }

  loadLocalStorage(key: string): unknown {
    try {
      const raw = globalThis.localStorage?.getItem(`obsidian-local:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  saveLocalStorage(key: string, data: unknown | null): void {
    try {
      if (data === null || data === undefined) {
        globalThis.localStorage?.removeItem(`obsidian-local:${key}`);
      } else {
        globalThis.localStorage?.setItem(
          `obsidian-local:${key}`,
          JSON.stringify(data),
        );
      }
    } catch {
      // Ignore storage errors in sandboxed webviews
    }
  }
}

export type UserEvent = MouseEvent | KeyboardEvent | TouchEvent | PointerEvent;
