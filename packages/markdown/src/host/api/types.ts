/**
 * Lumière API v1, returned by the extension's `activate`:
 *
 * ```ts
 * const api = await vscode.extensions
 *   .getExtension<MarkdownWorkshopApi>("t04dj14n9.vscode-markdown-workshop")
 *   ?.activate();
 * ```
 *
 * Every object the API returns is frozen. Errors are `Error`s with a `code`:
 * `EditorNotFound`, `InvalidArgument`, `PluginDisabled`, `StaleSelection`,
 * `DocumentDirty`, `SourceChanged`, `Cancelled`, `DuplicateContribution`,
 * `UndeclaredService`. See API.md for the full contract.
 */
import type { Uri, Event, ViewColumn, CancellationToken } from "vscode";
import type { NoteMetadata } from "./metadata-types";
import type { ExternalPlugin, PluginHandle } from "./plugin-types";
export * from "./metadata-types";
export * from "./plugin-types";

/** Identifies one editor panel. Two panels of one note have different IDs. */
export type EditorId = string;

/** A note's text document as VS Code holds it. */
export interface DocumentState {
  readonly documentId: string;
  readonly uri: Uri;
  /** VS Code's document version; markers and selections refer to it. */
  readonly version: number;
  readonly isDirty: boolean;
  readonly isUntitled: boolean;
}
/** One Lumière editor panel and the note it shows. */
export interface EditorSnapshot extends DocumentState {
  readonly editorId: EditorId;
  readonly viewColumn?: ViewColumn;
  readonly isActive: boolean;
}
/**
 * A place in a note: source offsets (UTF-16, counting CR characters, in the
 * current document version), a 1-based line or inclusive line range, or a heading or block fragment
 * such as `Heading` or `^block-id`.
 */
export type SourceTarget =
  | { readonly from: number; readonly to: number }
  | { readonly line: number }
  | { readonly startLine: number; readonly endLine: number }
  | { readonly fragment: string };
export interface OperationOptions {
  readonly token?: CancellationToken;
}
/**
 * The selection of one editor at one document version. Only the object
 * `getSelection` returned is accepted later: a copy is rejected with
 * `InvalidArgument`, and the original with `StaleSelection` once the
 * document has changed.
 */
export interface SelectionSnapshot {
  readonly id: string;
  readonly editorId: EditorId;
  readonly documentId: string;
  readonly version: number;
  readonly isDirty: boolean;
  readonly sourceSha256?: string;
  /** Source offsets in `version`, as in `SourceTarget`. */
  readonly from: number;
  readonly to: number;
  /** 1-based lines; a selection ending at column 0 excludes that line. */
  readonly startLine: number;
  readonly endLine: number;
  readonly text: string;
}
export interface Backlink {
  /** The linking note's path inside its vault. */
  readonly path: string;
  readonly count: number;
}
export interface PluginDescriptor {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Core plugins cannot be turned off; external ones come from other extensions. */
  readonly kind: "core" | "feature" | "external";
  readonly defaultEnabled: boolean;
  readonly surfaces: readonly ("host" | "webview")[];
  readonly ownerExtensionId?: string;
}
/** A plugin's state in one editor, as Show Plugin Status lists it. */
export interface PluginState {
  readonly id: string;
  readonly enabled: boolean;
  readonly state: "disabled" | "pending" | "loading" | "active" | "failed";
  /** Services a pending plugin waits for. */
  readonly waitingFor: readonly string[];
  readonly error?: string;
}
/** Where a plugin setting is written; folders need a resource inside them. */
export type ConfigurationScope =
  | { readonly target: "global" | "workspace"; readonly resource?: Uri }
  | { readonly target: "workspaceFolder"; readonly resource: Uri };
/** Each open editor's plugin states once a setting change has applied. */
export interface PluginChangeResult {
  readonly id: string;
  readonly editors: readonly {
    readonly editorId: EditorId;
    readonly states: readonly PluginState[];
  }[];
}
export interface OpenOptions {
  readonly viewColumn?: ViewColumn;
  readonly preserveFocus?: boolean;
  /** Reveal this place once the editor is ready. */
  readonly reveal?: SourceTarget;
}
export interface MarkdownWorkshopApi {
  readonly apiVersion: 1;

  // Editors and documents
  getEditors(): readonly EditorSnapshot[];
  getActiveEditor(): EditorSnapshot | undefined;
  /** Open a note in Lumière and resolve when its editor is ready. */
  open(uri: Uri, options?: OpenOptions): Promise<EditorSnapshot>;
  reveal(
    editorId: EditorId,
    target: SourceTarget,
    options?: { readonly focus?: boolean },
  ): Promise<void>;

  // Selections
  /** The editor's selection after its pending edits reach the document. */
  getSelection(
    editorId: EditorId,
    options?: OperationOptions,
  ): Promise<SelectionSnapshot | undefined>;

  // Vault (read-only)
  /** Resolve a link as Obsidian does, from the note at `source`. */
  resolveLink(linktext: string, source: Uri): Uri | undefined;
  getMetadata(uri: Uri): NoteMetadata | undefined;
  getBacklinks(uri: Uri): readonly Backlink[];
  /** After a vault's links settle (Obsidian's `resolved`). */
  readonly onDidResolveLinks: Event<{ readonly vault: Uri }>;

  // Plugins
  getPluginCatalog(): readonly PluginDescriptor[];
  getPlugins(editorId: EditorId): readonly PluginState[];
  setPluginEnabled(
    id: string,
    enabled: boolean,
    scope: ConfigurationScope,
  ): Promise<PluginChangeResult>;
  /** Remove this scope's setting, so the plugin follows the next scope or its default. */
  resetPluginOverride(
    id: string,
    scope: ConfigurationScope,
  ): Promise<PluginChangeResult>;
  /** Open Settings at Lumière's plugin switches. */
  openPluginSettings(resource?: Uri): Promise<void>;
  /** Run an external host plugin (API.md, "External plugins"). */
  plugin(definition: ExternalPlugin): PluginHandle;

  // Events
  readonly onDidOpenEditor: Event<EditorSnapshot>;
  readonly onDidCloseEditor: Event<{ readonly editorId: EditorId }>;
  readonly onDidChangeActiveEditor: Event<EditorSnapshot | undefined>;
  /** A note open in a Lumière editor changed or was saved. */
  readonly onDidChangeDocument: Event<DocumentState>;
  readonly onDidChangeSelection: Event<{
    readonly editorId: EditorId;
    readonly hasSelection: boolean;
  }>;
  readonly onDidChangePlugins: Event<{
    readonly editorId: EditorId;
    readonly states: readonly PluginState[];
  }>;
}
