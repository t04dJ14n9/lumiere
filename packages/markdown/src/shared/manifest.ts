import type { Schema } from "@workshop/core";

/**
 * What a plugin does, in terms an editor host can reason about without
 * reading its code: which extension points it uses and which side effects
 * it may have. Lumière PDF's manifests use the same idea (and the same
 * names where they overlap: `commands`, `statusBar`, `agentHandoff`).
 * Invariants checked by test/unit/plugins/capabilities.test.ts: a plugin
 * declares `commands`, `keybindings` or `views` exactly when it contributes
 * them; only opt-in plugins may declare `network`.
 */
export type Capability =
  /** Registers the custom editor for Markdown files. */
  | "editorProvider"
  /** Owns a document's text, versions and saves. */
  | "documentModel"
  /** Extends the Markdown parser with syntax. */
  | "syntax"
  /** Draws widgets or decorations over the source in Live Preview. */
  | "rendering"
  /** Changes how typing, pasting or completion edit the text. */
  | "editing"
  /** Gutter, guides and other editor chrome. */
  | "editorChrome"
  /** Contributes commands. */
  | "commands"
  /** Contributes keybindings. */
  | "keybindings"
  /** Contributes native views. */
  | "views"
  /** Shows status bar entries. */
  | "statusBar"
  /** Reads the vault index of notes, links and tags. */
  | "vaultIndex"
  /** Opens notes or moves the caret to a location. */
  | "navigation"
  /** Loads workspace files (images, media, embedded notes) for display. */
  | "resourceLoading"
  /** Writes files other than the note being edited. */
  | "fileWrites"
  /** Reads or writes the clipboard. */
  | "clipboard"
  /** Loads remote content. */
  | "network"
  /** Hands selections to agents. */
  | "agentHandoff"
  /** Serves the public extension API. */
  | "publicApi";

/**
 * What a plugin needs from its host beyond the host services every host
 * provides. Outside a host that offers it, the plugin's settings are not
 * shown, since they could do nothing there (shared/host-needs.ts).
 * - `workbench`: VS Code's or Cursor's own window: text editors, Source
 *   Control, and other extensions such as agent chats and Marp.
 * - `git`: a Git repository, through the `git` host service.
 * - `panels`: panels of their own (`views.panel`), such as the graph's.
 */
export type HostNeed = "workbench" | "git" | "panels";

export interface Manifest {
  readonly config?: Schema<unknown>;
  /** Public setting paths for fields shared with the files namespace. */
  readonly configKeys?: Readonly<Record<string, string>>;
  /**
   * Fields read from a native VS Code setting (for Markdown files) instead of
   * a contributed lumiere.markdown setting, e.g. `editor.lineNumbers`.
   */
  readonly nativeConfigKeys?: Readonly<Record<string, string>>;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: "core" | "feature";
  readonly defaultEnabled: boolean;
  /** Which halves the plugin runs in; the public API reports these. */
  readonly surfaces: readonly ("host" | "webview")[];
  readonly capabilities: readonly Capability[];
  /** What it needs from its host, if anything beyond the host services. */
  readonly needs?: readonly HostNeed[];
  /**
   * Needs of single settings, by config field, for a plugin that runs
   * everywhere but has a setting that applies only in some hosts.
   */
  readonly settingNeeds?: Readonly<Record<string, readonly HostNeed[]>>;
  readonly contributes?: {
    menus?: readonly {
      command: string;
      location: "editor/title" | "webview/context" | "view/title";
      when?: string;
      group?: string;
    }[];
    keybindings?: readonly {
      id: string;
      key: string;
      mac?: string;
      scope?: "editor" | "workbench";
      /** Extra when-clause fragment, merged with plugin enablement. */
      when?: string;
    }[];
    commands?: readonly {
      id: string;
      title: string;
      /** A codicon such as `$(go-to-file)`; title-bar buttons show it instead of the title. */
      icon?: string;
      editorCommand?: string;
      palette?: boolean;
      key?: string;
      mac?: string;
      /**
       * Where the command applies. `editor` (the default) is the Markdown
       * Workshop editor; `workbench` is anywhere, for commands such as the
       * quick switcher.
       */
      scope?: "editor" | "workbench";
      /** Extra when-clause fragment, merged with plugin enablement. */
      when?: string;
    }[];
    /** Native views in the Explorer; `editor` views show only beside this editor. */
    views?: readonly {
      id: string;
      name: string;
      scope?: "editor" | "workbench";
      /** A further when-clause, for example to show only beside this editor. */
      when?: string;
      /**
       * Initial Explorer section state (`visible` | `collapsed` | `hidden`).
       * Only Markdown Outline starts expanded; other Lumière subpanels collapse.
       */
      visibility?: "visible" | "collapsed" | "hidden";
    }[];
  };
}
export function defineManifest<T extends Manifest>(manifest: T): T {
  return Object.freeze(manifest);
}
