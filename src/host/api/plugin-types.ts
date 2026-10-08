import type { Disposable, CancellationToken, Uri } from "vscode";
import type {
  MarkdownWorkbenchApi,
  EditorSnapshot,
  SelectionSnapshot,
  PluginState,
} from "./types";
export interface SourceMarker {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly documentVersion: number;
  readonly label: string;
  readonly tooltip?: string;
  readonly actionId?: string;
}
export interface Markers {
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
export type ProcessorResult =
  | { readonly markdown: string; readonly html?: never }
  | { readonly html: string; readonly markdown?: never };
export interface CodeProcessor {
  readonly language: string;
  render(
    source: string,
    context: { readonly uri: Uri; readonly sourceLine: number },
    token: CancellationToken,
  ): ProcessorResult | Promise<ProcessorResult>;
}
export interface PublicServices {
  readonly editors: Pick<
    MarkdownWorkbenchApi,
    "getEditors" | "getActiveEditor" | "open" | "reveal" | "getSelection"
  > & {
    registerSelectionAction(action: EditorAction): Disposable;
    registerTitleAction(action: EditorAction): Disposable;
  };
  readonly vault: Pick<
    MarkdownWorkbenchApi,
    "resolveLink" | "getMetadata" | "getBacklinks" | "onDidResolveLinks"
  >;
  readonly markers: Markers;
  readonly agent: Pick<
    MarkdownWorkbenchApi,
    "createAgentReference" | "copyForAgent"
  >;
  readonly commands: { register(id: string, run: () => unknown): Disposable };
  readonly codeBlocks: { register(processor: CodeProcessor): Disposable };
  readonly logger: {
    debug(message: string, detail?: unknown): void;
    warn(message: string, detail?: unknown): void;
    error(message: string, detail?: unknown): void;
  };
}
export interface LinkRequest {
  readonly editorId: string;
  readonly href: string;
  readonly source: Uri;
  readonly side: boolean;
}
export interface ExternalEvents {
  "editor/opened": (editor: EditorSnapshot) => void;
  "editor/closed": (event: { readonly editorId: string }) => void;
  "editor/activeChanged": (editor: EditorSnapshot | undefined) => void;
  "editor/selectionChanged": (event: {
    readonly editorId: string;
    readonly hasSelection: boolean;
  }) => void;
  "links/open": (request: LinkRequest) => true | Promise<true> | undefined;
}
export interface ExternalContext extends PublicServices {
  on<K extends keyof ExternalEvents>(
    name: K,
    listener: ExternalEvents[K],
  ): Disposable;
  effect(create: () => Disposable | (() => void | Promise<void>)): Disposable;
}
export interface ExternalPlugin {
  readonly id: string;
  readonly ownerExtensionId: string;
  readonly title: string;
  readonly description: string;
  readonly defaultEnabled: boolean;
  readonly inject?: {
    readonly required?: readonly (keyof PublicServices)[];
    readonly optional?: readonly (keyof PublicServices)[];
  };
  apply(context: ExternalContext): void | Promise<void>;
}
export interface PluginHandle extends Disposable {
  readonly id: string;
  readonly state: PluginState;
  setMarkers(editorId: string, markers: readonly SourceMarker[]): void;
  /** Wait for the current enablement transition and async apply/cleanup. */
  settled(): Promise<void>;
}
