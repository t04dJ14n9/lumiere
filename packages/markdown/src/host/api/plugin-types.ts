import type { Disposable, CancellationToken, Uri } from "vscode";
import type {
  MarkdownWorkshopApi,
  EditorSnapshot,
  SelectionSnapshot,
  PluginState,
} from "./types";
/** A badge on a range of a note, set by an external plugin (DESIGN §18.3). */
export interface SourceMarker {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  /**
   * The document version `from` and `to` refer to. The editor maps the range
   * through later edits and drops it if the text it covered is deleted.
   */
  readonly documentVersion: number;
  /** At most 120 characters. */
  readonly label: string;
  /** Plain text, at most 1,000 characters. */
  readonly tooltip?: string;
  /** Runs the action registered under this ID when the badge is clicked. */
  readonly actionId?: string;
}
export interface Markers {
  /** Replace this plugin's markers in one editor; at most 1,000. */
  set(editorId: string, markers: readonly SourceMarker[]): void;
  clear(editorId: string): void;
  registerAction(
    id: string,
    run: (context: {
      readonly editorId: string;
      readonly marker: Readonly<SourceMarker>;
    }) => void | Promise<void>,
  ): Disposable;
}
/** A host-side action offered for a note or its selection; it runs in the extension host. */
export interface EditorAction {
  readonly id: string;
  readonly label: string;
  run(
    context: {
      readonly editorId: string;
      readonly selection?: SelectionSnapshot;
    },
    token: CancellationToken,
  ): void | Promise<void>;
}
/** A code block's replacement; it is sanitized and rendered read-only. */
export type ProcessorResult =
  | { readonly markdown: string; readonly html?: never }
  | { readonly html: string; readonly markdown?: never };
/**
 * Renders fenced code blocks of one language, like Obsidian's
 * `registerMarkdownCodeBlockProcessor`. Runs only in trusted workspaces.
 */
export interface CodeProcessor {
  readonly language: string;
  render(
    source: string,
    context: { readonly uri: Uri; readonly sourceLine: number },
    token: CancellationToken,
  ): ProcessorResult | Promise<ProcessorResult>;
}
/**
 * What an external plugin can reach. A plugin lists the services it uses in
 * `inject`; reading any other property of its context throws
 * `UndeclaredService`. Internal services are never reachable.
 */
export interface PublicServices {
  readonly editors: Pick<
    MarkdownWorkshopApi,
    "getEditors" | "getActiveEditor" | "open" | "reveal" | "getSelection"
  > & {
    registerSelectionAction(action: EditorAction): Disposable;
    registerTitleAction(action: EditorAction): Disposable;
  };
  readonly vault: Pick<
    MarkdownWorkshopApi,
    "resolveLink" | "getMetadata" | "getBacklinks" | "onDidResolveLinks"
  >;
  readonly markers: Markers;
  /** VS Code commands; IDs must start with the owner extension's ID. */
  readonly commands: { register(id: string, run: () => unknown): Disposable };
  readonly codeBlocks: { register(processor: CodeProcessor): Disposable };
  readonly logger: {
    debug(message: string, detail?: unknown): void;
    warn(message: string, detail?: unknown): void;
    error(message: string, detail?: unknown): void;
  };
}
/** A link click in an editor, before Markdown Workshop opens it (DESIGN §16). */
export interface LinkRequest {
  readonly editorId: string;
  readonly href: string;
  readonly source: Uri;
  readonly side: boolean;
  /** Opened in a tab of its own (Cmd-click), rather than the current one. */
  readonly tab: boolean;
}
export interface ExternalEvents {
  "editor/opened": (editor: EditorSnapshot) => void;
  "editor/closed": (event: { readonly editorId: string }) => void;
  "editor/activeChanged": (editor: EditorSnapshot | undefined) => void;
  "editor/selectionChanged": (event: {
    readonly editorId: string;
    readonly hasSelection: boolean;
  }) => void;
  /** Return `true` (or a promise of it) to claim the link; the first claim wins. */
  "links/open": (request: LinkRequest) => true | Promise<true> | undefined;
}
/** An external plugin's context; registrations end when the plugin stops. */
export interface ExternalContext extends PublicServices {
  on<K extends keyof ExternalEvents>(
    name: K,
    listener: ExternalEvents[K],
  ): Disposable;
  effect(create: () => Disposable | (() => void | Promise<void>)): Disposable;
}
/** A host plugin from another extension (DESIGN §18.2). */
export interface ExternalPlugin {
  /** Namespaced under the owner's publisher: `publisher.name`. */
  readonly id: string;
  /** An installed extension, `publisher.name`. */
  readonly ownerExtensionId: string;
  readonly title: string;
  readonly description: string;
  /** Overridden by `markdownWorkshop.plugins.external`. */
  readonly defaultEnabled: boolean;
  readonly inject?: {
    readonly required?: readonly (keyof PublicServices)[];
    readonly optional?: readonly (keyof PublicServices)[];
  };
  apply(context: ExternalContext): void | Promise<void>;
}
/** Returned by `plugin()`; dispose it to unregister the plugin. */
export interface PluginHandle extends Disposable {
  readonly id: string;
  readonly state: PluginState;
  setMarkers(editorId: string, markers: readonly SourceMarker[]): void;
  /** Wait for the current enablement transition and async apply/cleanup. */
  settled(): Promise<void>;
}
