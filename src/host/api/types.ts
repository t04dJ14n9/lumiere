import type { Uri, Event, ViewColumn, CancellationToken } from "vscode";
import type { NoteMetadata } from "./metadata-types";
import type { ExternalPlugin, PluginHandle } from "./plugin-types";
export * from "./metadata-types";
export * from "./plugin-types";
export type EditorId = string;
export interface DocumentState {
  readonly documentId: string;
  readonly uri: Uri;
  readonly version: number;
  readonly isDirty: boolean;
  readonly isUntitled: boolean;
}
export interface EditorSnapshot extends DocumentState {
  readonly editorId: EditorId;
  readonly viewColumn?: ViewColumn;
  readonly isActive: boolean;
}
export type SourceTarget =
  | { readonly from: number; readonly to: number }
  | { readonly line: number }
  | { readonly fragment: string };
export interface OperationOptions {
  readonly token?: CancellationToken;
}
/** Original-source UTF-16 offsets and native document version; opaque host-held identity. */
export interface SelectionSnapshot {
  readonly id: string;
  readonly editorId: EditorId;
  readonly documentId: string;
  readonly version: number;
  readonly isDirty: boolean;
  readonly sourceSha256?: string;
  readonly from: number;
  readonly to: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly text: string;
}
export interface AgentReference {
  readonly text: string;
  readonly uri: Uri;
  readonly startLine: number;
  readonly endLine: number;
}
export interface Backlink {
  readonly path: string;
  readonly count: number;
}
export interface PluginDescriptor {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: "core" | "feature" | "external";
  readonly defaultEnabled: boolean;
  readonly surfaces: readonly ("host" | "webview")[];
  readonly ownerExtensionId?: string;
}
export interface PluginState {
  readonly id: string;
  readonly enabled: boolean;
  readonly state: "disabled" | "pending" | "loading" | "active" | "failed";
  readonly waitingFor: readonly string[];
  readonly error?: string;
}
export type ConfigurationScope =
  | { readonly target: "global" | "workspace"; readonly resource?: Uri }
  | { readonly target: "workspaceFolder"; readonly resource: Uri };
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
  readonly reveal?: SourceTarget;
}
export interface MarkdownWorkbenchApi {
  readonly apiVersion: 1;
  getEditors(): readonly EditorSnapshot[];
  getActiveEditor(): EditorSnapshot | undefined;
  open(uri: Uri, options?: OpenOptions): Promise<EditorSnapshot>;
  reveal(
    editorId: EditorId,
    target: SourceTarget,
    options?: { readonly focus?: boolean },
  ): Promise<void>;
  getSelection(
    editorId: EditorId,
    options?: OperationOptions,
  ): Promise<SelectionSnapshot | undefined>;
  createAgentReference(selection: SelectionSnapshot): Promise<AgentReference>;
  copyForAgent(editorId: EditorId): Promise<void>;
  resolveLink(linktext: string, source: Uri): Uri | undefined;
  getMetadata(uri: Uri): NoteMetadata | undefined;
  getBacklinks(uri: Uri): readonly Backlink[];
  readonly onDidResolveLinks: Event<{ readonly vault: Uri }>;
  getPluginCatalog(): readonly PluginDescriptor[];
  getPlugins(editorId: EditorId): readonly PluginState[];
  setPluginEnabled(
    id: string,
    enabled: boolean,
    scope: ConfigurationScope,
  ): Promise<PluginChangeResult>;
  resetPluginOverride(
    id: string,
    scope: ConfigurationScope,
  ): Promise<PluginChangeResult>;
  openPluginSettings(resource?: Uri): Promise<void>;
  plugin(definition: ExternalPlugin): PluginHandle;
  readonly onDidOpenEditor: Event<EditorSnapshot>;
  readonly onDidCloseEditor: Event<{ readonly editorId: EditorId }>;
  readonly onDidChangeActiveEditor: Event<EditorSnapshot | undefined>;
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
